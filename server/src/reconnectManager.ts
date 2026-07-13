import { randomBytes } from "crypto";
import type { Server } from "socket.io";
import type {
  ClientEvents,
  HostChangeReason,
  ReconnectableSeat,
  ReconnectErrorCode,
  SeatClaimInfo,
  ServerEvents,
} from "../../shared/types.js";
import {
  addDisconnectPause,
  broadcastState,
  normalizeGameAfterPermanentKick,
  setAdminPause,
} from "./gameEngine.js";
import {
  getAllRooms,
  getRoom,
  removePlayer,
  touchRoom,
  type PendingSeatClaim,
  type Player,
  type Room,
  type Spectator,
} from "./roomManager.js";
import { generateSessionToken } from "./utils.js";

type IOServer = Server<ClientEvents, ServerEvents>;

export const SEAT_CLAIM_TTL_MS = 120_000;
export const MAX_PENDING_SEAT_CLAIMS_PER_ROOM = 32;

const seatClaimExpiryTimers = new Map<string, ReturnType<typeof setTimeout>>();

export type BindPlayerSocketResult =
  | { ok: true; previousSocketId: string }
  | {
      ok: false;
      error: string;
      code: Extract<ReconnectErrorCode, "SEAT_CLOSED" | "SEAT_ALREADY_CONNECTED">;
    };

export function isCurrentSocketOwner(player: Player, socketId: string): boolean {
  return player.socketId === socketId;
}

export function bindPlayerSocket(
  player: Player,
  socketId: string,
  releasePreviousOwner: (previousSocketId: string) => void = () => {},
): BindPlayerSocketResult {
  if (player.kicked) {
    return { ok: false, error: "Место закрыто", code: "SEAT_CLOSED" };
  }
  if (player.connected && player.socketId !== socketId) {
    return {
      ok: false,
      error: "Место уже подключено",
      code: "SEAT_ALREADY_CONNECTED",
    };
  }

  const previousSocketId = player.socketId;
  if (previousSocketId && previousSocketId !== socketId) {
    releasePreviousOwner(previousSocketId);
  }
  player.socketId = socketId;
  player.connected = true;
  return { ok: true, previousSocketId };
}

export type BindSpectatorSocketResult =
  | { ok: true; previousSocketId: string }
  | { ok: false; error: string };

export function bindSpectatorSocket(
  spectator: Spectator,
  socketId: string,
  releasePreviousOwner: (previousSocketId: string) => void = () => {},
): BindSpectatorSocketResult {
  if (spectator.connected && spectator.socketId !== socketId) {
    return { ok: false, error: "Место уже подключено" };
  }

  const previousSocketId = spectator.socketId;
  if (previousSocketId && previousSocketId !== socketId) {
    releasePreviousOwner(previousSocketId);
  }
  spectator.socketId = socketId;
  spectator.connected = true;
  return { ok: true, previousSocketId };
}

function isReconnectablePlayer(player: Player | undefined): player is Player {
  return !!player && !player.connected && !player.isBot && !player.kicked;
}

function generateSeatClaimId(): string {
  let id: string;
  do {
    id = randomBytes(16).toString("hex");
  } while (
    seatClaimExpiryTimers.has(id) ||
    Array.from(getAllRooms().values()).some((room) => room.pendingSeatClaims.has(id))
  );
  return id;
}

function clearSeatClaimExpiryTimer(requestId: string): void {
  const timer = seatClaimExpiryTimers.get(requestId);
  if (timer) clearTimeout(timer);
  seatClaimExpiryTimers.delete(requestId);
}

function deleteSeatClaim(room: Room, requestId: string): PendingSeatClaim | null {
  const claim = room.pendingSeatClaims.get(requestId);
  if (!claim) return null;
  room.pendingSeatClaims.delete(requestId);
  clearSeatClaimExpiryTimer(requestId);
  return claim;
}

function emitSeatClaimResolution(
  claim: PendingSeatClaim,
  approved: boolean,
  message: string,
  io: IOServer,
): void {
  io.to(claim.socketId).emit("room:seatClaimResolved", {
    requestId: claim.id,
    approved,
    message,
  });
}

function buildPendingClaimList(room: Room): SeatClaimInfo[] {
  const claims: SeatClaimInfo[] = [];
  for (const claim of room.pendingSeatClaims.values()) {
    const player = room.players.get(claim.playerId);
    if (!player) continue;
    claims.push({
      requestId: claim.id,
      playerId: player.id,
      playerName: player.name,
      claimantName: claim.claimantName,
    });
  }
  return claims;
}

export function emitClaimsToHost(room: Room, io: IOServer): void {
  const host = room.players.get(room.hostId);
  if (!host || !host.connected || host.isBot || host.kicked || !host.socketId) return;
  io.to(host.socketId).emit("admin:seatClaimsUpdated", {
    claims: buildPendingClaimList(room),
  });
}

export function listReconnectableSeats(room: Room): ReconnectableSeat[] {
  const seats: ReconnectableSeat[] = [];
  for (const playerId of room.allPlayerIds) {
    const player = room.players.get(playerId);
    if (!isReconnectablePlayer(player)) continue;
    seats.push({ playerId: player.id, playerName: player.name });
  }
  return seats;
}

export type CreateSeatClaimResult =
  | { success: true; claim: PendingSeatClaim }
  | { success: false; error: string };

export interface CreateSeatClaimOptions {
  now?: number;
  ttlMs?: number;
}

export function createSeatClaim(
  room: Room,
  socketId: string,
  playerId: string,
  claimantName: string,
  io: IOServer,
  options: CreateSeatClaimOptions = {},
): CreateSeatClaimResult {
  if (room.gameState?.phase === "GAME_OVER") {
    return { success: false, error: "Игра завершена" };
  }
  const player = room.players.get(playerId);
  if (!isReconnectablePlayer(player)) {
    return { success: false, error: "Место недоступно для восстановления" };
  }
  if (room.pendingSeatClaims.size >= MAX_PENDING_SEAT_CLAIMS_PER_ROOM) {
    return {
      success: false,
      error: "Слишком много заявок на восстановление, попробуйте позже",
    };
  }

  const now = options.now ?? Date.now();
  const ttlMs = options.ttlMs ?? SEAT_CLAIM_TTL_MS;
  const requestId = generateSeatClaimId();
  const claim: PendingSeatClaim = {
    id: requestId,
    socketId,
    playerId,
    claimantName,
    createdAt: now,
    expiresAt: now + ttlMs,
  };
  room.pendingSeatClaims.set(requestId, claim);
  touchRoom(room.code);

  const timer = setTimeout(() => {
    if (seatClaimExpiryTimers.get(requestId) !== timer) return;
    if (getRoom(room.code) !== room || room.pendingSeatClaims.get(requestId) !== claim) {
      seatClaimExpiryTimers.delete(requestId);
      return;
    }
    expireSeatClaims(room, io, claim.expiresAt);
  }, ttlMs);
  timer.unref();
  seatClaimExpiryTimers.set(requestId, timer);
  emitClaimsToHost(room, io);
  return { success: true, claim };
}

export type ResolveSeatClaimResult =
  | { success: true; approved: false }
  | { success: true; approved: true; claim: PendingSeatClaim; player: Player }
  | { success: false; error: string };

export function resolveSeatClaim(
  room: Room,
  actorId: string,
  requestId: string,
  approved: boolean,
  io: IOServer,
  now = Date.now(),
): ResolveSeatClaimResult {
  const actor = room.players.get(actorId);
  if (room.hostId !== actorId || !isEligibleHost(actor)) {
    return { success: false, error: "Только хост может выполнить это действие" };
  }
  touchRoom(room.code);

  if (room.gameState?.phase === "GAME_OVER") {
    cancelAllSeatClaims(room, io, "Игра завершена", now);
    return { success: false, error: "Игра завершена" };
  }

  expireSeatClaims(room, io, now);
  const claim = room.pendingSeatClaims.get(requestId);
  if (!claim) {
    return { success: false, error: "Заявка уже обработана или не найдена" };
  }

  if (!approved) {
    deleteSeatClaim(room, requestId);
    emitSeatClaimResolution(claim, false, "Хост отклонил заявку", io);
    emitClaimsToHost(room, io);
    return { success: true, approved: false };
  }

  const player = room.players.get(claim.playerId);
  if (!isReconnectablePlayer(player)) {
    deleteSeatClaim(room, requestId);
    emitSeatClaimResolution(claim, false, "Место больше недоступно", io);
    emitClaimsToHost(room, io);
    return { success: false, error: "Место недоступно для восстановления" };
  }

  return { success: true, approved: true, claim, player };
}

export function finalizeApprovedSeatClaim(
  room: Room,
  requestId: string,
  io: IOServer,
  now = Date.now(),
): boolean {
  expireSeatClaims(room, io, now);
  const winningClaim = deleteSeatClaim(room, requestId);
  if (!winningClaim) return false;
  touchRoom(room.code);

  emitSeatClaimResolution(winningClaim, true, "Заявка одобрена", io);
  for (const [claimId, claim] of Array.from(room.pendingSeatClaims.entries())) {
    let message: string | null = null;
    if (claim.socketId === winningClaim.socketId) {
      message = "Вы уже восстановили другое место";
    } else if (claim.playerId === winningClaim.playerId) {
      message = "Место уже занято другим игроком";
    }
    if (!message) continue;
    deleteSeatClaim(room, claimId);
    emitSeatClaimResolution(claim, false, message, io);
  }
  emitClaimsToHost(room, io);
  return true;
}

export type CancelSeatClaimResult = { success: true } | { success: false; error: string };

export function cancelSeatClaim(
  socketId: string,
  requestId: string,
  io: IOServer,
  now = Date.now(),
): CancelSeatClaimResult {
  for (const room of getAllRooms().values()) {
    const claim = room.pendingSeatClaims.get(requestId);
    const ownedExpiredClaim = !!claim && claim.socketId === socketId && claim.expiresAt <= now;
    expireSeatClaims(room, io, now);
    if (ownedExpiredClaim) {
      touchRoom(room.code);
      return { success: true };
    }
    if (!claim) continue;
    if (!room.pendingSeatClaims.has(requestId)) {
      return { success: false, error: "Заявка не найдена" };
    }
    if (claim.socketId !== socketId) {
      return { success: false, error: "Заявка не найдена" };
    }
    touchRoom(room.code);
    deleteSeatClaim(room, requestId);
    emitSeatClaimResolution(claim, false, "Заявка отменена", io);
    emitClaimsToHost(room, io);
    return { success: true };
  }
  return { success: false, error: "Заявка не найдена" };
}

export function expireSeatClaims(room: Room, io: IOServer, now = Date.now()): number {
  let removed = 0;
  for (const [claimId, claim] of Array.from(room.pendingSeatClaims.entries())) {
    if (claim.expiresAt > now) continue;
    deleteSeatClaim(room, claimId);
    emitSeatClaimResolution(claim, false, "Время ожидания истекло", io);
    removed++;
  }
  if (removed > 0) emitClaimsToHost(room, io);
  return removed;
}

export function cancelAllSeatClaims(
  room: Room,
  io?: IOServer,
  message = "Заявка отменена",
  now = Date.now(),
): number {
  let removed = io ? expireSeatClaims(room, io, now) : 0;
  for (const [claimId, claim] of Array.from(room.pendingSeatClaims.entries())) {
    deleteSeatClaim(room, claimId);
    if (io) emitSeatClaimResolution(claim, false, message, io);
    removed++;
  }
  if (io && removed > 0) emitClaimsToHost(room, io);
  return removed;
}

export function resetSeatClaimStateForTests(): void {
  for (const timer of seatClaimExpiryTimers.values()) clearTimeout(timer);
  seatClaimExpiryTimers.clear();
  for (const room of getAllRooms().values()) room.pendingSeatClaims.clear();
}

function isEligibleHost(player: Player | undefined): player is Player {
  return !!player && player.connected && !player.isBot && !player.kicked;
}

function findNextEligibleHost(room: Room, formerHostId: string): Player | null {
  const playerIds = room.allPlayerIds;
  if (playerIds.length === 0) return null;

  const formerIndex = playerIds.indexOf(formerHostId);
  const firstIndex = formerIndex >= 0 ? (formerIndex + 1) % playerIds.length : 0;
  for (let offset = 0; offset < playerIds.length; offset++) {
    const candidateId = playerIds[(firstIndex + offset) % playerIds.length];
    if (candidateId === formerHostId) continue;
    const candidate = room.players.get(candidateId);
    if (isEligibleHost(candidate)) return candidate;
  }
  return null;
}

function commitHostTransfer(
  room: Room,
  successor: Player,
  io: IOServer,
  reason: HostChangeReason,
): void {
  room.hostId = successor.id;
  touchRoom(room.code);
  setAdminPause(room, false, io, false);
  broadcastState(room, io);
  io.to(room.code).emit("room:hostChanged", {
    hostId: successor.id,
    hostName: successor.name,
    reason,
  });
  emitClaimsToHost(room, io);
}

export function ensureConnectedHost(room: Room, io: IOServer, formerHostId?: string): boolean {
  if (isEligibleHost(room.players.get(room.hostId))) return false;

  const anchorId = formerHostId ?? room.hostId;
  const successor = findNextEligibleHost(room, anchorId);
  if (!successor) return false;

  commitHostTransfer(room, successor, io, formerHostId ? "disconnect" : "recovery");
  return true;
}

export type TransferHostResult = { success: true } | { success: false; error: string };

export function transferHost(
  room: Room,
  actorId: string,
  targetId: string,
  io: IOServer,
): TransferHostResult {
  const actor = room.players.get(actorId);
  if (room.hostId !== actorId || !isEligibleHost(actor)) {
    return { success: false, error: "Только текущий хост может передать права" };
  }
  if (targetId === actorId) {
    return { success: false, error: "Нельзя передать права самому себе" };
  }

  const target = room.players.get(targetId);
  if (!target) return { success: false, error: "Игрок не найден" };
  if (!isEligibleHost(target)) {
    return {
      success: false,
      error: "Права можно передать только подключённому игроку",
    };
  }

  commitHostTransfer(room, target, io, "manual");
  return { success: true };
}

export type PermanentKickResult =
  | { success: true; releasedSocketId: string | null }
  | { success: false; error: string };

export function kickPlayerPermanently(
  room: Room,
  actorId: string,
  playerId: string,
  io: IOServer,
): PermanentKickResult {
  const actor = room.players.get(actorId);
  if (room.hostId !== actorId || !isEligibleHost(actor)) {
    return { success: false, error: "Только хост может удалить игрока" };
  }
  if (room.gameState?.phase === "GAME_OVER") {
    return { success: false, error: "Игра завершена" };
  }
  if (playerId === actorId) {
    return { success: false, error: "Хост не может удалить самого себя" };
  }

  const player = room.players.get(playerId);
  if (!player) return { success: false, error: "Игрок не найден" };
  if (player.isBot) return { success: false, error: "Бота нельзя удалить этой командой" };
  if (player.kicked) return { success: false, error: "Место уже закрыто" };
  touchRoom(room.code);

  const releasedSocketId = player.connected && player.socketId ? player.socketId : null;
  player.sessionToken = generateSessionToken();
  cancelClaimsForPlayer(room, player.id, io, "Место закрыто администратором");

  if (!room.gameState) {
    player.connected = false;
    player.socketId = "";
    removePlayer(room, player.id);
    if (room.players.size > 0) broadcastState(room, io);
    return { success: true, releasedSocketId };
  }

  normalizeGameAfterPermanentKick(room, player.id, io);
  return { success: true, releasedSocketId };
}

export function removePlayerWithHostFailover(room: Room, playerId: string, io: IOServer): void {
  const player = room.players.get(playerId);
  if (!player) return;
  const wasHost = room.hostId === playerId;
  const successor = wasHost ? findNextEligibleHost(room, playerId) : null;

  removePlayer(room, playerId);
  if (room.players.size === 0) return;

  if (wasHost) {
    // removePlayer has a legacy fallback that may select a bot or disconnected seat.
    // Keep the former seat as the anchor until a real human successor exists.
    room.hostId = playerId;
    if (successor && room.players.has(successor.id)) {
      commitHostTransfer(room, successor, io, "disconnect");
      return;
    }
  }

  broadcastState(room, io);
}

export function markPlayerDisconnected(
  room: Room,
  playerId: string,
  socketId: string,
  io: IOServer,
): boolean {
  const player = room.players.get(playerId);
  if (
    !player ||
    player.isBot ||
    player.kicked ||
    !player.connected ||
    !isCurrentSocketOwner(player, socketId)
  ) {
    return false;
  }

  const wasHost = room.hostId === playerId;
  player.connected = false;
  touchRoom(room.code);
  const activePhase =
    room.gameState && room.gameState.phase !== "LOBBY" && room.gameState.phase !== "GAME_OVER";
  if (activePhase) {
    addDisconnectPause(room, player.id, io, false);
  }
  if (wasHost) {
    setAdminPause(room, false, io, false);
  }
  if (wasHost && ensureConnectedHost(room, io, player.id)) {
    return true;
  }
  broadcastState(room, io);
  return true;
}

export function cancelClaimsForPlayer(
  room: Room,
  playerId: string,
  io?: IOServer,
  message = "Владелец места вернулся",
  now = Date.now(),
): number {
  let removed = io ? expireSeatClaims(room, io, now) : 0;
  for (const [claimId, claim] of Array.from(room.pendingSeatClaims.entries())) {
    if (claim.playerId !== playerId) continue;
    deleteSeatClaim(room, claimId);
    removed++;
    if (io) emitSeatClaimResolution(claim, false, message, io);
  }
  if (io && removed > 0) emitClaimsToHost(room, io);
  return removed;
}

export function removeClaimsForSocket(
  socketId: string,
  io?: IOServer,
  message = "Заявка отменена",
  notifyRequester = false,
  now = Date.now(),
): number {
  let removed = 0;
  for (const room of getAllRooms().values()) {
    if (io) removed += expireSeatClaims(room, io, now);
    let removedFromRoom = 0;
    for (const [claimId, claim] of Array.from(room.pendingSeatClaims.entries())) {
      if (claim.socketId !== socketId) continue;
      deleteSeatClaim(room, claimId);
      if (io && notifyRequester) emitSeatClaimResolution(claim, false, message, io);
      removed++;
      removedFromRoom++;
    }
    if (io && removedFromRoom > 0) emitClaimsToHost(room, io);
  }
  return removed;
}
