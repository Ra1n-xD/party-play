import type { Server } from "socket.io";
import type {
  ClientEvents,
  HostChangeReason,
  ReconnectErrorCode,
  SeatClaimInfo,
  ServerEvents,
} from "../../shared/types.js";
import { addDisconnectPause, broadcastState, setAdminPause } from "./gameEngine.js";
import {
  getAllRooms,
  removePlayer,
  type Player,
  type Room,
  type Spectator,
} from "./roomManager.js";

type IOServer = Server<ClientEvents, ServerEvents>;

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

function commitHostTransfer(
  room: Room,
  successor: Player,
  io: IOServer,
  reason: HostChangeReason,
): void {
  room.hostId = successor.id;
  setAdminPause(room, false, io, false);
  broadcastState(room, io);
  io.to(room.code).emit("room:hostChanged", {
    hostId: successor.id,
    hostName: successor.name,
    reason,
  });
  io.to(successor.socketId).emit("admin:seatClaimsUpdated", {
    claims: buildPendingClaimList(room),
  });
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

export function removeLobbyPlayerWithHostFailover(
  room: Room,
  playerId: string,
  io: IOServer,
): void {
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
  const activePhase =
    room.gameState && room.gameState.phase !== "LOBBY" && room.gameState.phase !== "GAME_OVER";
  if (activePhase) {
    addDisconnectPause(room, player.id, io, false);
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
): number {
  let removed = 0;
  for (const [claimId, claim] of room.pendingSeatClaims) {
    if (claim.playerId !== playerId) continue;
    room.pendingSeatClaims.delete(claimId);
    removed++;
    io?.to(claim.socketId).emit("room:seatClaimResolved", {
      requestId: claim.id,
      approved: false,
      message,
    });
  }
  return removed;
}

export function removeClaimsForSocket(socketId: string): number {
  let removed = 0;
  for (const room of getAllRooms().values()) {
    for (const [claimId, claim] of room.pendingSeatClaims) {
      if (claim.socketId !== socketId) continue;
      room.pendingSeatClaims.delete(claimId);
      removed++;
    }
  }
  return removed;
}
