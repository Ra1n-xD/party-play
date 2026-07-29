import { timingSafeEqual } from "crypto";
import { Server, Socket } from "socket.io";
import { normalizeRoomCode } from "../../../shared/roomCode.js";
import {
  ClientEvents,
  ReconnectErrorCode,
  ServerEvents,
  type AttributeType,
} from "../../../shared/types.js";
import {
  createRoom,
  joinRoom,
  joinRoomAsSpectator,
  getRoom,
  removeSpectator,
  addBotToRoom,
  removeBotFromRoom,
  getAllRooms,
  resetRoomManagerStateForTests,
  setRoomDisposalHandler,
  touchRoom,
  Room,
  Spectator,
} from "./roomManager.js";
import { bunkerModule, executeBunkerCommand } from "../games/bunker/module.js";
import { asBunkerRoom } from "../games/bunker/runtime.js";
import { CONFIG } from "../config.js";
import { generatePlayerId, generateSessionToken } from "../utils.js";
import { resetBotManagerStateForTests } from "../games/bunker/botManager.js";
import { resetGameLifecycleHooksForTests, setBeforeGameOverHook } from "../gameLifecycle.js";
import {
  bindPlayerSocket,
  bindSpectatorSocket,
  cancelAllSeatClaims,
  cancelSeatClaim,
  cancelClaimsForPlayer,
  createSeatClaim,
  ensureConnectedHost,
  expireSeatClaims,
  finalizeApprovedSeatClaim,
  isCurrentSocketOwner,
  kickPlayerPermanently,
  listReconnectableSeats,
  markPlayerDisconnected,
  removePlayerWithHostFailover,
  removeClaimsForSocket,
  resetSeatClaimStateForTests,
  resolveSeatClaim,
  transferHost,
  assignTemporaryBot,
} from "./reconnectManager.js";
import { getSocketClientIdentity } from "../clientIdentity.js";
import { RejoinThrottle } from "../rejoinThrottle.js";
import { getServerGameModule, isRegisteredGameId } from "./gameRegistry.js";
import { executeInRoom, disposeRoomExecutor } from "./roomExecutor.js";
import { dispatchRoomCommand } from "./roomCommandDispatcher.js";
import type { GameCommandExecution } from "./gameModule.js";

type IOServer = Server<ClientEvents, ServerEvents>;
type IOSocket = Socket<ClientEvents, ServerEvents>;

type SocketMembership = {
  roomCode: string;
  playerId: string;
  role: "player" | "spectator";
};

// Map socketId -> { roomCode, playerId, role }
const socketRoomMap = new Map<string, SocketMembership>();
const spectatorGraceTimers = new Map<string, ReturnType<typeof setTimeout>>();

// --- Per-action rate limiting ---
const ACTION_LIMITS: Record<string, { max: number; windowMs: number }> = {
  "room:create": { max: 1, windowMs: 10000 },
  "room:join": { max: 3, windowMs: 10000 },
  "room:joinSpectator": { max: 3, windowMs: 10000 },
  "room:rejoin": { max: 3, windowMs: 10000 },
  "room:rejoinSpectator": { max: 3, windowMs: 10000 },
  "room:listReconnectableSeats": { max: 5, windowMs: 10000 },
  "room:requestSeatClaim": { max: 3, windowMs: 10000 },
  "room:cancelSeatClaim": { max: 5, windowMs: 10000 },
  "admin:resolveSeatClaim": { max: 5, windowMs: 10000 },
  "admin:kickPlayer": { max: 5, windowMs: 10000 },
  "vote:cast": { max: 2, windowMs: 5000 },
  "game:revealAttribute": { max: 2, windowMs: 2000 },
  "game:revealActionCard": { max: 2, windowMs: 2000 },
  default: { max: 20, windowMs: 10000 },
};

const CLAIM_IP_ACTION_LIMITS: Record<string, { max: number; windowMs: number }> = {
  "room:listReconnectableSeats": { max: 12, windowMs: 10000 },
  "room:requestSeatClaim": { max: 12, windowMs: 10000 },
  "admin:resolveSeatClaim": { max: 12, windowMs: 10000 },
};

// socketId -> (action -> { count, resetAt })
const socketActionCounts = new Map<string, Map<string, { count: number; resetAt: number }>>();
const ipActionCounts = new Map<string, Map<string, { count: number; resetAt: number }>>();
let nextIpActionPruneAt = 0;

function isRateLimited(socketId: string, action: string = "default"): boolean {
  const now = Date.now();
  const limit = ACTION_LIMITS[action] || ACTION_LIMITS.default;

  let actions = socketActionCounts.get(socketId);
  if (!actions) {
    actions = new Map();
    socketActionCounts.set(socketId, actions);
  }

  let entry = actions.get(action);
  if (!entry || now >= entry.resetAt) {
    entry = { count: 1, resetAt: now + limit.windowMs };
    actions.set(action, entry);
    return false;
  }

  entry.count++;
  return entry.count > limit.max;
}

function isIpRateLimited(socket: IOSocket, action: string): boolean {
  const limit = CLAIM_IP_ACTION_LIMITS[action];
  if (!limit) return false;

  const now = Date.now();
  if (now >= nextIpActionPruneAt) {
    nextIpActionPruneAt = now + limit.windowMs;
    for (const [storedIp, storedActions] of ipActionCounts) {
      for (const [storedAction, entry] of storedActions) {
        if (now >= entry.resetAt) storedActions.delete(storedAction);
      }
      if (storedActions.size === 0) ipActionCounts.delete(storedIp);
    }
  }

  const ip = getSocketClientIdentity(socket);
  let actions = ipActionCounts.get(ip);
  if (!actions) {
    actions = new Map();
    ipActionCounts.set(ip, actions);
  }

  let entry = actions.get(action);
  if (!entry || now >= entry.resetAt) {
    entry = { count: 1, resetAt: now + limit.windowMs };
    actions.set(action, entry);
    return false;
  }

  entry.count++;
  return entry.count > limit.max;
}

function rejectRateLimitedClaimAction(socket: IOSocket, action: string): boolean {
  const socketLimited = isRateLimited(socket.id, action);
  const ipLimited = isIpRateLimited(socket, action);
  if (!socketLimited && !ipLimited) return false;
  socket.emit("room:error", { message: "Слишком много запросов, подождите" });
  return true;
}

function cleanupRateLimitEntry(socketId: string): void {
  socketActionCounts.delete(socketId);
}

// --- Progressive backoff for failed rejoin attempts (per client network identity) ---
const rejoinThrottle = new RejoinThrottle();

function isRejoinBlocked(socket: IOSocket): boolean {
  return rejoinThrottle.isBlocked(getSocketClientIdentity(socket));
}

function recordRejoinFailure(socket: IOSocket): void {
  rejoinThrottle.recordFailure(getSocketClientIdentity(socket));
}

function clearRejoinFailures(socket: IOSocket): void {
  rejoinThrottle.clear(getSocketClientIdentity(socket));
}

function installGameLifecycleHooks(): void {
  setBeforeGameOverHook((room, io) => {
    cancelAllSeatClaims(room, io, "Игра завершена");
  });
}

function attachRoomDisposalHandler(room: Room, io: IOServer): void {
  setRoomDisposalHandler(room, (disposedRoom, reason) => {
    getServerGameModule(disposedRoom.gameId)?.dispose(disposedRoom);
    disposeRoomExecutor(disposedRoom.code);
    cancelAllSeatClaims(
      disposedRoom,
      io,
      reason === "inactive" ? "Комната закрыта из-за неактивности" : "Комната закрыта",
    );
    for (const spectator of disposedRoom.spectators.values()) {
      clearSpectatorGraceTimer(spectator.id);
    }
    for (const [socketId, membership] of Array.from(socketRoomMap.entries())) {
      if (membership.roomCode !== disposedRoom.code) continue;
      socketRoomMap.delete(socketId);
      cleanupRateLimitEntry(socketId);
      io.sockets.sockets.get(socketId)?.leave(disposedRoom.code);
    }
  });
}

export function resetSocketHandlerStateForTests(): void {
  for (const timer of spectatorGraceTimers.values()) clearTimeout(timer);
  spectatorGraceTimers.clear();
  socketRoomMap.clear();
  socketActionCounts.clear();
  ipActionCounts.clear();
  nextIpActionPruneAt = 0;
  rejoinThrottle.reset();
  resetGameLifecycleHooksForTests();
  installGameLifecycleHooks();
  resetBotManagerStateForTests();
  resetSeatClaimStateForTests();
  resetRoomManagerStateForTests();
}

// --- Input validation helpers ---
const VALID_ATTRIBUTE_TYPES = ["profession", "bio", "health", "hobby", "baggage", "fact", "action"];

function isValidAttributeType(type: unknown): type is AttributeType | "action" {
  return typeof type === "string" && VALID_ATTRIBUTE_TYPES.includes(type);
}

function isValidCardIndex(index: unknown): index is number {
  return typeof index === "number" && Number.isInteger(index) && index >= 0;
}

function sanitizePlayerName(name: string): string {
  return name
    .replace(/[<>&"'`/\\]/g, "") // Strip HTML/script-dangerous characters
    .replace(/[\x00-\x1F\x7F]/g, "") // Strip control characters
    .trim();
}

function isValidPlayerName(name: unknown): name is string {
  if (typeof name !== "string") return false;
  const sanitized = sanitizePlayerName(name);
  return sanitized.length > 0 && sanitized.length <= CONFIG.MAX_PLAYER_NAME_LENGTH;
}

function isValidId(id: unknown): id is string {
  return typeof id === "string" && /^p_[a-f0-9]{24}$/.test(id);
}

function isValidSessionToken(token: unknown): token is string {
  return typeof token === "string" && /^[a-f0-9]{64}$/.test(token);
}

function isValidSeatClaimId(id: unknown): id is string {
  return typeof id === "string" && /^[a-f0-9]{32}$/.test(id);
}

function tokensEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function emitReconnectError(
  socket: IOSocket,
  code: ReconnectErrorCode,
  message: string,
  terminal: boolean,
): void {
  socket.emit("room:reconnectError", { code, message, terminal });
}

function emitPrivateVoterStatus(socket: IOSocket, room: Room, hasVoted: boolean): void {
  const bunkerRoom = asBunkerRoom(room);
  if (!bunkerRoom) return;
  socket.emit("game:voterStatus", {
    phase: bunkerRoom.gameState?.phase ?? "LOBBY",
    roundNumber: bunkerRoom.gameState?.roundNumber ?? 0,
    currentVotingInRound: bunkerRoom.gameState?.currentVotingInRound ?? 0,
    hasVoted,
  });
}

function publishRoom(room: Room, io: IOServer): void {
  getServerGameModule(room.gameId)?.publish(room, io);
}

function clearSpectatorGraceTimer(spectatorId: string): void {
  const timer = spectatorGraceTimers.get(spectatorId);
  if (timer) clearTimeout(timer);
  spectatorGraceTimers.delete(spectatorId);
}

function getCurrentSocketMembership(socket: IOSocket): SocketMembership | null {
  const membership = socketRoomMap.get(socket.id);
  if (!membership) return null;

  const room = getRoom(membership.roomCode);
  let ownsMembership = false;
  if (membership.role === "player") {
    const player = room?.players.get(membership.playerId);
    ownsMembership =
      !!player && player.connected && !player.kicked && isCurrentSocketOwner(player, socket.id);
  } else {
    const spectator = room?.spectators.get(membership.playerId);
    ownsMembership = !!spectator && spectator.connected && spectator.socketId === socket.id;
  }

  if (ownsMembership) return membership;
  socketRoomMap.delete(socket.id);
  socket.leave(membership.roomCode);
  return null;
}

function rejectExistingSocketMembership(
  socket: IOSocket,
  allowedMembership?: SocketMembership,
): boolean {
  const existingMembership = getCurrentSocketMembership(socket);
  if (!existingMembership) return false;
  if (
    allowedMembership &&
    existingMembership.roomCode === allowedMembership.roomCode &&
    existingMembership.playerId === allowedMembership.playerId &&
    existingMembership.role === allowedMembership.role
  ) {
    return false;
  }
  socket.emit("room:error", { message: "Сокет уже привязан к комнате" });
  return true;
}

// --- Helper: get room info with rate limit check ---
function getSocketInfo(socket: IOSocket, action: string = "default"): SocketMembership | null {
  if (isRateLimited(socket.id, action)) {
    socket.emit("room:error", { message: "Слишком много запросов, подождите" });
    return null;
  }
  return getCurrentSocketMembership(socket);
}

function getSocketRoom(
  socket: IOSocket,
  action: string = "default",
): {
  room: Room;
  info: { roomCode: string; playerId: string; role: "player" | "spectator" };
} | null {
  const info = getSocketInfo(socket, action);
  if (!info) return null;
  // Spectators should not use player-action handlers
  if (info.role === "spectator") return null;
  const room = getRoom(info.roomCode);
  if (!room) return null;
  touchRoom(room.code);
  return { room, info };
}

function scheduleSpectatorGraceRemoval(
  room: Room,
  spectator: Spectator,
  disconnectedSocketId: string,
  io: IOServer,
): void {
  clearSpectatorGraceTimer(spectator.id);
  const timer = setTimeout(() => {
    if (spectatorGraceTimers.get(spectator.id) !== timer) return;
    spectatorGraceTimers.delete(spectator.id);

    const staleMembership = socketRoomMap.get(disconnectedSocketId);
    if (
      staleMembership?.roomCode === room.code &&
      staleMembership.playerId === spectator.id &&
      staleMembership.role === "spectator"
    ) {
      socketRoomMap.delete(disconnectedSocketId);
    }

    if (getRoom(room.code) !== room) return;
    if (room.spectators.get(spectator.id) !== spectator) return;
    if (spectator.connected || spectator.socketId !== disconnectedSocketId) return;

    removeSpectator(room, spectator.id);
    if (room.players.size > 0) publishRoom(room, io);
  }, CONFIG.RECONNECT_GRACE_PERIOD);
  spectatorGraceTimers.set(spectator.id, timer);
}

function requireHost(socket: IOSocket, room: Room, playerId: string): boolean {
  if (playerId !== room.hostId) {
    socket.emit("room:error", {
      message: "Только хост может выполнить это действие",
    });
    return false;
  }
  return true;
}

function resolveSeatClaimCommand(
  socket: IOSocket,
  room: Room,
  actorId: string,
  requestId: string,
  approved: boolean,
  io: IOServer,
): GameCommandExecution {
  if (!isValidSeatClaimId(requestId) || typeof approved !== "boolean") {
    return { success: false, code: "INVALID_COMMAND", error: "Некорректная заявка" };
  }
  if (rejectRateLimitedClaimAction(socket, "admin:resolveSeatClaim")) {
    return { success: false, code: "CONFLICT", error: "Слишком много запросов, подождите" };
  }

  const resolutionNow = Date.now();
  const resolution = resolveSeatClaim(room, actorId, requestId, approved, io, resolutionNow);
  if (!resolution.success) {
    return { success: false, code: "CONFLICT", error: resolution.error };
  }
  if (!resolution.approved) {
    return { success: true };
  }

  const { claim, player } = resolution;
  const claimantSocket = io.sockets.sockets.get(claim.socketId);
  const claimantMembership = claimantSocket ? getCurrentSocketMembership(claimantSocket) : null;
  if (!claimantSocket?.connected || claimantMembership !== null || claimantSocket.rooms.size > 1) {
    removeClaimsForSocket(claim.socketId, io, "Заявитель больше недоступен", true);
    return { success: false, code: "CONFLICT", error: "Заявитель больше недоступен" };
  }

  const bindResult = bindPlayerSocket(player, claimantSocket.id, (previousSocketId) => {
    const previousInfo = socketRoomMap.get(previousSocketId);
    if (
      previousInfo?.roomCode === room.code &&
      previousInfo.playerId === player.id &&
      previousInfo.role === "player"
    ) {
      socketRoomMap.delete(previousSocketId);
    }
    io.sockets.sockets.get(previousSocketId)?.leave(room.code);
  });
  if (!bindResult.ok) {
    removeClaimsForSocket(claim.socketId, io, bindResult.error, true);
    return { success: false, code: "CONFLICT", error: bindResult.error };
  }

  player.name = sanitizePlayerName(claim.claimantName);
  player.sessionToken = generateSessionToken();
  const participantId = generatePlayerId();
  player.owner = {
    kind: "human",
    participantId,
    name: player.name,
    sessionToken: player.sessionToken,
  };
  player.controller = {
    kind: "human",
    participantId,
    socketId: claimantSocket.id,
    epoch: player.controller.epoch + 1,
  };
  player.isBot = false;
  player.temporaryBot = false;
  claimantSocket.join(room.code);
  socketRoomMap.set(claimantSocket.id, {
    roomCode: room.code,
    playerId: player.id,
    role: "player",
  });

  finalizeApprovedSeatClaim(room, requestId, io, resolutionNow);
  removeClaimsForSocket(claimantSocket.id, io, "Вы уже восстановили другое место", true);
  claimantSocket.emit("room:joined", {
    roomCode: room.code,
    gameId: room.gameId,
    playerId: player.id,
    sessionToken: player.sessionToken,
  });
  if (player.character) claimantSocket.emit("game:character", player.character);

  getServerGameModule(room.gameId)?.onControllerChanged(room, player.id, "reconnect", io);
  if (!ensureConnectedHost(room, io)) publishRoom(room, io);
  emitPrivateVoterStatus(claimantSocket, room, player.hasVoted);
  return { success: true };
}

export function registerHandlers(io: IOServer): void {
  installGameLifecycleHooks();
  io.on("connection", (socket: IOSocket) => {
    if (process.env.NODE_ENV !== "production") {
      console.log(`Connected: ${socket.id}`);
    }

    socket.on("room:create", (data) => {
      const playerName = data?.playerName;
      const gameId = data?.gameId ?? "bunker";
      if (rejectExistingSocketMembership(socket)) return;
      if (isRateLimited(socket.id, "room:create")) {
        socket.emit("room:error", {
          message: "Слишком много запросов, подождите",
        });
        return;
      }

      if (!isValidPlayerName(playerName)) {
        socket.emit("room:error", {
          message: `Имя должно быть от 1 до ${CONFIG.MAX_PLAYER_NAME_LENGTH} символов`,
        });
        return;
      }
      if (!isRegisteredGameId(gameId)) {
        socket.emit("room:error", { message: "Игра недоступна" });
        return;
      }
      const module = getServerGameModule(gameId);
      if (!module) {
        socket.emit("room:error", { message: "Игра недоступна" });
        return;
      }

      // Check room limit
      if (getAllRooms().size >= CONFIG.MAX_ROOMS) {
        socket.emit("room:error", {
          message: "Сервер перегружен, попробуйте позже",
        });
        return;
      }

      removeClaimsForSocket(socket.id, io, "Заявитель присоединился к другой комнате", true);
      const { room, player } = createRoom(
        socket.id,
        sanitizePlayerName(playerName),
        gameId,
        module.initialSettings(),
        module.maxSeats,
      );
      attachRoomDisposalHandler(room, io);
      socket.join(room.code);
      socketRoomMap.set(socket.id, {
        roomCode: room.code,
        playerId: player.id,
        role: "player",
      });

      socket.emit("room:created", {
        roomCode: room.code,
        gameId: room.gameId,
        playerId: player.id,
        sessionToken: player.sessionToken,
      });
      module.publish(room, io);
    });

    socket.on("room:join", (data) => {
      const roomCode = data?.roomCode;
      const playerName = data?.playerName;
      if (rejectExistingSocketMembership(socket)) return;
      if (isRateLimited(socket.id, "room:join")) {
        socket.emit("room:error", {
          message: "Слишком много запросов, подождите",
        });
        return;
      }

      if (!isValidPlayerName(playerName)) {
        socket.emit("room:error", {
          message: `Имя должно быть от 1 до ${CONFIG.MAX_PLAYER_NAME_LENGTH} символов`,
        });
        return;
      }
      const normalizedRoomCode = normalizeRoomCode(roomCode);
      if (!normalizedRoomCode) {
        socket.emit("room:error", { message: "Код комнаты должен состоять из 4 букв" });
        return;
      }

      const existingRoom = getRoom(normalizedRoomCode);
      const module = existingRoom ? getServerGameModule(existingRoom.gameId) : null;
      if (existingRoom && !module) {
        socket.emit("room:error", { message: "Игра недоступна" });
        return;
      }
      const result = joinRoom(
        normalizedRoomCode,
        socket.id,
        sanitizePlayerName(playerName),
        module?.maxSeats,
      );
      if ("error" in result) {
        socket.emit("room:error", { message: result.error });
        return;
      }

      const { room, player } = result;
      attachRoomDisposalHandler(room, io);
      removeClaimsForSocket(socket.id, io, "Заявитель присоединился к другой комнате", true);
      socket.join(room.code);
      socketRoomMap.set(socket.id, {
        roomCode: room.code,
        playerId: player.id,
        role: "player",
      });

      socket.emit("room:joined", {
        roomCode: room.code,
        gameId: room.gameId,
        playerId: player.id,
        sessionToken: player.sessionToken,
      });
      if (!ensureConnectedHost(room, io)) publishRoom(room, io);
    });

    socket.on("room:rejoin", (data) => {
      const roomCode = data?.roomCode;
      const playerId = data?.playerId;
      const sessionToken = data?.sessionToken;
      if (isRateLimited(socket.id, "room:rejoin")) return;
      if (isRejoinBlocked(socket)) {
        socket.emit("room:error", { message: "Слишком много неудачных попыток, подождите" });
        return;
      }

      const normalizedRoomCode = normalizeRoomCode(roomCode);
      if (!normalizedRoomCode || !isValidId(playerId) || !isValidSessionToken(sessionToken)) {
        recordRejoinFailure(socket);
        emitReconnectError(socket, "INVALID_SESSION", "Не удалось переподключиться", true);
        return;
      }

      const room = getRoom(normalizedRoomCode);
      if (!room) {
        getCurrentSocketMembership(socket);
        recordRejoinFailure(socket);
        emitReconnectError(socket, "ROOM_NOT_FOUND", "Комната не найдена", true);
        return;
      }

      const player = room.players.get(playerId);
      if (!player) {
        recordRejoinFailure(socket);
        emitReconnectError(socket, "INVALID_SESSION", "Не удалось переподключиться", true);
        return;
      }

      if (player.kicked) {
        emitReconnectError(socket, "SEAT_CLOSED", "Место закрыто", true);
        return;
      }

      if (!sessionToken || !tokensEqual(player.sessionToken, sessionToken)) {
        recordRejoinFailure(socket);
        emitReconnectError(socket, "INVALID_SESSION", "Не удалось переподключиться", true);
        return;
      }

      const existingSocketInfo = getCurrentSocketMembership(socket);
      if (
        existingSocketInfo &&
        (existingSocketInfo.roomCode !== room.code ||
          existingSocketInfo.playerId !== player.id ||
          existingSocketInfo.role !== "player")
      ) {
        emitReconnectError(
          socket,
          "SEAT_ALREADY_CONNECTED",
          "Сокет уже привязан к другому месту",
          false,
        );
        return;
      }

      const bindResult = bindPlayerSocket(player, socket.id, (previousSocketId) => {
        const previousInfo = socketRoomMap.get(previousSocketId);
        if (
          previousInfo?.roomCode === room.code &&
          previousInfo.playerId === player.id &&
          previousInfo.role === "player"
        ) {
          socketRoomMap.delete(previousSocketId);
        }
        io.sockets.sockets.get(previousSocketId)?.leave(room.code);
      });
      if (!bindResult.ok) {
        emitReconnectError(
          socket,
          bindResult.code,
          bindResult.error,
          bindResult.code !== "SEAT_ALREADY_CONNECTED",
        );
        return;
      }

      clearRejoinFailures(socket);
      touchRoom(room.code);
      removeClaimsForSocket(socket.id, io, "Владелец места вернулся", true);
      socket.join(room.code);
      socketRoomMap.set(socket.id, {
        roomCode: room.code,
        playerId: player.id,
        role: "player",
      });
      cancelClaimsForPlayer(room, player.id, io);

      socket.emit("room:joined", {
        roomCode: room.code,
        gameId: room.gameId,
        playerId: player.id,
        sessionToken: player.sessionToken,
      });

      if (player.character) {
        socket.emit("game:character", player.character);
      }

      getServerGameModule(room.gameId)?.onControllerChanged(room, player.id, "reconnect", io);
      if (!ensureConnectedHost(room, io)) publishRoom(room, io);
      emitPrivateVoterStatus(socket, room, player.hasVoted);
    });

    socket.on("room:listReconnectableSeats", (data) => {
      if (rejectExistingSocketMembership(socket)) return;
      if (rejectRateLimitedClaimAction(socket, "room:listReconnectableSeats")) return;

      const recoveryRoomCode = normalizeRoomCode(data?.roomCode);
      if (!recoveryRoomCode) {
        socket.emit("room:error", { message: "Код комнаты должен состоять из 4 букв" });
        return;
      }
      const room = getRoom(recoveryRoomCode);
      if (!room) {
        socket.emit("room:error", { message: "Комната не найдена" });
        return;
      }
      if (getServerGameModule(room.gameId)?.lifecycle(room) === "results") {
        socket.emit("room:error", { message: "Игра завершена" });
        return;
      }

      touchRoom(room.code);
      expireSeatClaims(room, io);
      socket.leave(room.code);
      socket.emit("room:reconnectableSeats", {
        roomCode: room.code,
        seats: listReconnectableSeats(room),
      });
    });

    socket.on("room:requestSeatClaim", (data) => {
      if (rejectExistingSocketMembership(socket)) return;
      if (rejectRateLimitedClaimAction(socket, "room:requestSeatClaim")) return;

      const playerId = data?.playerId;
      const claimantName = data?.claimantName;
      const recoveryRoomCode = normalizeRoomCode(data?.roomCode);
      if (!recoveryRoomCode) {
        socket.emit("room:error", { message: "Код комнаты должен состоять из 4 букв" });
        return;
      }
      const room = getRoom(recoveryRoomCode);
      if (!room) {
        socket.emit("room:error", { message: "Комната не найдена" });
        return;
      }
      if (!isValidId(playerId)) {
        socket.emit("room:error", { message: "Место недоступно для восстановления" });
        return;
      }
      if (!isValidPlayerName(claimantName)) {
        socket.emit("room:error", {
          message: `Имя должно быть от 1 до ${CONFIG.MAX_PLAYER_NAME_LENGTH} символов`,
        });
        return;
      }

      touchRoom(room.code);
      expireSeatClaims(room, io);
      socket.leave(room.code);
      const result = createSeatClaim(
        room,
        socket.id,
        playerId,
        sanitizePlayerName(claimantName),
        io,
      );
      if (!result.success) {
        socket.emit("room:error", { message: result.error });
        return;
      }
      socket.emit("room:seatClaimSubmitted", { requestId: result.claim.id });
    });

    socket.on("room:cancelSeatClaim", (data) => {
      if (isRateLimited(socket.id, "room:cancelSeatClaim")) {
        socket.emit("room:error", { message: "Слишком много запросов, подождите" });
        return;
      }
      const requestId = data?.requestId;
      if (!isValidSeatClaimId(requestId)) {
        socket.emit("room:error", { message: "Заявка не найдена" });
        return;
      }
      const result = cancelSeatClaim(socket.id, requestId, io);
      if (!result.success) socket.emit("room:error", { message: result.error });
    });

    socket.on("room:joinSpectator", (data) => {
      const roomCode = data?.roomCode;
      const spectatorName = data?.spectatorName;
      if (rejectExistingSocketMembership(socket)) return;
      if (isRateLimited(socket.id, "room:joinSpectator")) {
        socket.emit("room:error", {
          message: "Слишком много запросов, подождите",
        });
        return;
      }

      if (!isValidPlayerName(spectatorName)) {
        socket.emit("room:error", {
          message: `Имя должно быть от 1 до ${CONFIG.MAX_PLAYER_NAME_LENGTH} символов`,
        });
        return;
      }
      const normalizedRoomCode = normalizeRoomCode(roomCode);
      if (!normalizedRoomCode) {
        socket.emit("room:error", { message: "Код комнаты должен состоять из 4 букв" });
        return;
      }

      const result = joinRoomAsSpectator(
        normalizedRoomCode,
        socket.id,
        sanitizePlayerName(spectatorName),
      );
      if ("error" in result) {
        socket.emit("room:error", { message: result.error });
        return;
      }

      const { room, spectator } = result;
      removeClaimsForSocket(socket.id, io, "Заявитель присоединился к другой комнате", true);
      socket.join(room.code);
      socketRoomMap.set(socket.id, {
        roomCode: room.code,
        playerId: spectator.id,
        role: "spectator",
      });

      socket.emit("room:spectatorJoined", {
        roomCode: room.code,
        gameId: room.gameId,
        spectatorId: spectator.id,
        sessionToken: spectator.sessionToken,
      });
      publishRoom(room, io);
    });

    socket.on("room:rejoinSpectator", (data) => {
      const roomCode = data?.roomCode;
      const spectatorId = data?.spectatorId;
      const sessionToken = data?.sessionToken;
      if (isRateLimited(socket.id, "room:rejoinSpectator")) return;
      if (isRejoinBlocked(socket)) {
        socket.emit("room:error", { message: "Слишком много неудачных попыток, подождите" });
        return;
      }

      const normalizedRoomCode = normalizeRoomCode(roomCode);
      if (!normalizedRoomCode || !isValidId(spectatorId) || !isValidSessionToken(sessionToken)) {
        recordRejoinFailure(socket);
        emitReconnectError(socket, "INVALID_SESSION", "Не удалось переподключиться", true);
        return;
      }

      const room = getRoom(normalizedRoomCode);
      if (!room) {
        getCurrentSocketMembership(socket);
        recordRejoinFailure(socket);
        emitReconnectError(socket, "ROOM_NOT_FOUND", "Комната не найдена", true);
        return;
      }

      const spectator = room.spectators.get(spectatorId);
      if (!spectator) {
        recordRejoinFailure(socket);
        emitReconnectError(socket, "INVALID_SESSION", "Не удалось переподключиться", true);
        return;
      }

      // Validate session token
      if (!sessionToken || !tokensEqual(spectator.sessionToken, sessionToken)) {
        recordRejoinFailure(socket);
        emitReconnectError(socket, "INVALID_SESSION", "Не удалось переподключиться", true);
        return;
      }

      if (
        rejectExistingSocketMembership(socket, {
          roomCode: room.code,
          playerId: spectator.id,
          role: "spectator",
        })
      ) {
        return;
      }

      const bindResult = bindSpectatorSocket(spectator, socket.id, (previousSocketId) => {
        const previousInfo = socketRoomMap.get(previousSocketId);
        if (
          previousInfo?.roomCode === room.code &&
          previousInfo.playerId === spectator.id &&
          previousInfo.role === "spectator"
        ) {
          socketRoomMap.delete(previousSocketId);
        }
        io.sockets.sockets.get(previousSocketId)?.leave(room.code);
      });
      if (!bindResult.ok) {
        emitReconnectError(socket, "SEAT_ALREADY_CONNECTED", bindResult.error, false);
        return;
      }

      clearRejoinFailures(socket);
      clearSpectatorGraceTimer(spectator.id);
      touchRoom(room.code);
      removeClaimsForSocket(socket.id, io, "Заявитель присоединился к другой комнате", true);
      const newToken = generateSessionToken();
      spectator.sessionToken = newToken;

      socket.join(room.code);
      socketRoomMap.set(socket.id, {
        roomCode: room.code,
        playerId: spectator.id,
        role: "spectator",
      });

      socket.emit("room:spectatorJoined", {
        roomCode: room.code,
        gameId: room.gameId,
        spectatorId: spectator.id,
        sessionToken: newToken,
      });
      publishRoom(room, io);
    });

    socket.on("player:ready", (data) => {
      const ready = data?.ready;
      const ctx = getSocketRoom(socket);
      if (!ctx) return;
      const player = ctx.room.players.get(ctx.info.playerId);
      if (!player) return;

      if (typeof ready !== "boolean") {
        socket.emit("room:error", { message: "Некорректный статус готовности" });
        return;
      }

      player.ready = ready;
      publishRoom(ctx.room, io);
    });

    socket.on("room:command", (data) => {
      const info = getSocketInfo(socket);
      if (!info || info.role !== "player") {
        socket.emit("room:error", { message: "Команда доступна только игроку" });
        return;
      }
      const roomCode = info.roomCode;
      void executeInRoom(roomCode, () => {
        const current = getCurrentSocketMembership(socket);
        const room = getRoom(roomCode);
        if (
          !current ||
          current.role !== "player" ||
          current.roomCode !== roomCode ||
          current.playerId !== info.playerId ||
          !room
        ) {
          return;
        }
        const result = dispatchRoomCommand(room, current.playerId, data, io, {
          resolveSeatClaim: (requestId, approved) =>
            resolveSeatClaimCommand(socket, room, current.playerId, requestId, approved, io),
        });
        socket.emit("room:commandResult", result);
      }).catch(() => {
        socket.emit("room:error", { message: "Не удалось обработать команду" });
      });
    });

    socket.on("game:start", () => {
      const ctx = getSocketRoom(socket);
      if (!ctx) return;
      if (!requireHost(socket, ctx.room, ctx.info.playerId)) return;
      const bunkerRoom = asBunkerRoom(ctx.room);
      if (!bunkerRoom) {
        socket.emit("room:error", { message: "Команда Бункера недоступна в этой комнате" });
        return;
      }
      if (bunkerModule.lifecycle(bunkerRoom) !== "lobby") {
        socket.emit("room:error", { message: "Игра уже началась" });
        return;
      }

      if (bunkerRoom.players.size < bunkerModule.minSeats) {
        socket.emit("room:error", {
          message: `Нужно минимум ${bunkerModule.minSeats} игрока`,
        });
        return;
      }

      const allConnected = Array.from(bunkerRoom.players.values()).every(
        (player) => player.isBot || player.connected,
      );
      if (!allConnected) {
        socket.emit("room:error", { message: "Не все игроки подключены" });
        return;
      }

      const allReady = Array.from(bunkerRoom.players.values()).every(
        (p) => p.ready || p.id === bunkerRoom.hostId,
      );
      if (!allReady) {
        socket.emit("room:error", { message: "Не все игроки готовы" });
        return;
      }

      const result = bunkerModule.start(bunkerRoom, io);
      if (!result.success) {
        socket.emit("room:error", { message: result.error ?? "Невозможно начать игру" });
      }
    });

    socket.on("game:revealAttribute", (data) => {
      const attributeIndex = data?.attributeIndex;
      const ctx = getSocketRoom(socket, "game:revealAttribute");
      if (!ctx) return;

      // Validate attributeIndex if provided
      if (
        attributeIndex !== undefined &&
        (typeof attributeIndex !== "number" ||
          !Number.isInteger(attributeIndex) ||
          attributeIndex < 0 ||
          attributeIndex >= CONFIG.ATTRIBUTE_COUNT)
      ) {
        socket.emit("room:error", { message: "Некорректный индекс атрибута" });
        return;
      }

      const result = executeBunkerCommand(
        ctx.room,
        ctx.info.playerId,
        { type: "reveal-attribute", attributeIndex },
        io,
      );
      if (!result.success) {
        socket.emit("room:error", { message: result.error ?? "Сейчас не ваш ход" });
      }
    });

    socket.on("game:revealActionCard", () => {
      const ctx = getSocketRoom(socket, "game:revealActionCard");
      if (!ctx) return;

      const result = executeBunkerCommand(
        ctx.room,
        ctx.info.playerId,
        { type: "reveal-action-card" },
        io,
      );
      if (!result.success) {
        socket.emit("room:error", {
          message: result.error ?? "Невозможно раскрыть особое условие сейчас",
        });
      }
    });

    socket.on("vote:cast", (data) => {
      const targetPlayerId = data?.targetPlayerId;
      const ctx = getSocketRoom(socket, "vote:cast");
      if (!ctx) return;

      // Validate target exists in room and is alive
      if (typeof targetPlayerId !== "string") {
        socket.emit("room:error", { message: "Некорректный ID игрока" });
        return;
      }
      const target = ctx.room.players.get(targetPlayerId);
      if (!target) {
        socket.emit("room:error", { message: "Игрок не найден" });
        return;
      }

      const result = executeBunkerCommand(
        ctx.room,
        ctx.info.playerId,
        { type: "cast-vote", targetSeatId: targetPlayerId },
        io,
      );
      if (!result.success) {
        socket.emit("room:error", { message: result.error ?? "Невозможно проголосовать" });
        return;
      }
      const voter = ctx.room.players.get(ctx.info.playerId);
      if (voter) emitPrivateVoterStatus(socket, ctx.room, voter.hasVoted);
    });

    socket.on("game:endGame", () => {
      const ctx = getSocketRoom(socket);
      if (!ctx) return;
      if (!requireHost(socket, ctx.room, ctx.info.playerId)) return;

      const result = executeBunkerCommand(ctx.room, ctx.info.playerId, { type: "force-end" }, io);
      if (!result.success) {
        socket.emit("room:error", { message: result.error ?? "Невозможно завершить игру" });
      }
    });

    socket.on("game:playAgain", () => {
      const ctx = getSocketRoom(socket);
      if (!ctx) return;
      if (!requireHost(socket, ctx.room, ctx.info.playerId)) return;
      const bunkerRoom = asBunkerRoom(ctx.room);
      if (!bunkerRoom) {
        socket.emit("room:error", { message: "Команда Бункера недоступна в этой комнате" });
        return;
      }

      cancelAllSeatClaims(bunkerRoom, io, "Игра сброшена");
      const result = bunkerModule.resetForReplay(bunkerRoom, io);
      if (!result.success) {
        socket.emit("room:error", { message: result.error ?? "Невозможно начать новую игру" });
      }
    });

    socket.on("room:addBot", () => {
      const ctx = getSocketRoom(socket);
      if (!ctx) return;
      if (!requireHost(socket, ctx.room, ctx.info.playerId)) return;
      const module = getServerGameModule(ctx.room.gameId);
      if (!module) {
        socket.emit("room:error", { message: "Игра недоступна" });
        return;
      }

      const bot = addBotToRoom(ctx.room, module.maxSeats);
      if (!bot) {
        socket.emit("room:error", { message: "Невозможно добавить бота" });
        return;
      }

      module.publish(ctx.room, io);
    });

    socket.on("room:removeBot", (data) => {
      const botId = data?.playerId;
      const ctx = getSocketRoom(socket);
      if (!ctx) return;
      if (!requireHost(socket, ctx.room, ctx.info.playerId)) return;

      const removed = removeBotFromRoom(ctx.room, botId);
      if (!removed) {
        socket.emit("room:error", {
          message: "Невозможно удалить этого игрока",
        });
        return;
      }

      publishRoom(ctx.room, io);
    });

    // --- Admin panel events ---

    socket.on("admin:resolveSeatClaim", (data) => {
      const ctx = getSocketRoom(socket);
      if (!ctx) return;
      if (!requireHost(socket, ctx.room, ctx.info.playerId)) return;

      const requestId = data?.requestId;
      const approved = data?.approved;
      if (!isValidSeatClaimId(requestId)) {
        socket.emit("room:error", { message: "Некорректный ID заявки" });
        return;
      }
      if (typeof approved !== "boolean") {
        socket.emit("room:error", { message: "Некорректное решение по заявке" });
        return;
      }

      const result = resolveSeatClaimCommand(
        socket,
        ctx.room,
        ctx.info.playerId,
        requestId,
        approved,
        io,
      );
      if (!result.success) {
        socket.emit("room:error", { message: result.error ?? "Не удалось обработать заявку" });
      }
    });

    socket.on("admin:transferHost", (data) => {
      const ctx = getSocketRoom(socket);
      if (!ctx) return;
      const targetPlayerId = data?.targetPlayerId;
      if (!isValidId(targetPlayerId)) {
        socket.emit("room:error", { message: "Игрок не найден" });
        return;
      }

      const result = transferHost(ctx.room, ctx.info.playerId, targetPlayerId, io);
      if (!result.success) socket.emit("room:error", { message: result.error });
    });

    socket.on("admin:assignTemporaryBot", (data) => {
      const ctx = getSocketRoom(socket);
      if (!ctx) return;
      const targetPlayerId = data?.targetPlayerId;
      if (!isValidId(targetPlayerId)) {
        socket.emit("room:error", { message: "Игрок не найден" });
        return;
      }
      const result = assignTemporaryBot(ctx.room, ctx.info.playerId, targetPlayerId, io);
      if (!result.success) socket.emit("room:error", { message: result.error });
    });

    socket.on("admin:kickPlayer", (data) => {
      const ctx = getSocketRoom(socket, "admin:kickPlayer");
      if (!ctx) return;
      const targetPlayerId = data?.targetPlayerId;
      if (!isValidId(targetPlayerId)) {
        socket.emit("room:error", { message: "Игрок не найден" });
        return;
      }

      const result = kickPlayerPermanently(ctx.room, ctx.info.playerId, targetPlayerId, io);
      if (!result.success) {
        socket.emit("room:error", { message: result.error });
        return;
      }

      const releasedSocketId = result.releasedSocketId;
      if (!releasedSocketId) return;
      const releasedMembership = socketRoomMap.get(releasedSocketId);
      if (
        !releasedMembership ||
        releasedMembership.roomCode !== ctx.room.code ||
        releasedMembership.playerId !== targetPlayerId ||
        releasedMembership.role !== "player"
      ) {
        return;
      }
      socketRoomMap.delete(releasedSocketId);

      const releasedSocket = io.sockets.sockets.get(releasedSocketId);
      if (!releasedSocket) return;
      releasedSocket.emit("room:kicked", { message: "Вы удалены из комнаты хостом" });
      releasedSocket.leave(ctx.room.code);
      releasedSocket.disconnect(true);
    });

    socket.on("admin:shuffleAll", (data) => {
      const attributeType = data?.attributeType;
      const ctx = getSocketRoom(socket);
      if (!ctx) return;
      if (!requireHost(socket, ctx.room, ctx.info.playerId)) return;
      if (!isValidAttributeType(attributeType)) {
        socket.emit("room:error", { message: "Некорректный тип атрибута" });
        return;
      }
      const result = executeBunkerCommand(
        ctx.room,
        ctx.info.playerId,
        { type: "shuffle-all", attributeType },
        io,
      );
      if (!result.success) {
        socket.emit("room:error", { message: result.error ?? "Невозможно перемешать карты" });
      }
    });

    socket.on("admin:swapAttribute", (data) => {
      const player1Id = data?.player1Id;
      const player2Id = data?.player2Id;
      const attributeType = data?.attributeType;
      const ctx = getSocketRoom(socket);
      if (!ctx) return;
      if (!requireHost(socket, ctx.room, ctx.info.playerId)) return;
      if (!isValidAttributeType(attributeType)) {
        socket.emit("room:error", { message: "Некорректный тип атрибута" });
        return;
      }
      if (
        typeof player1Id !== "string" ||
        typeof player2Id !== "string" ||
        !ctx.room.players.has(player1Id) ||
        !ctx.room.players.has(player2Id)
      ) {
        socket.emit("room:error", { message: "Игрок не найден" });
        return;
      }
      const result = executeBunkerCommand(
        ctx.room,
        ctx.info.playerId,
        {
          type: "swap-attribute",
          firstSeatId: player1Id,
          secondSeatId: player2Id,
          attributeType,
        },
        io,
      );
      if (!result.success) {
        socket.emit("room:error", { message: result.error ?? "Невозможно обменять карты" });
      }
    });

    socket.on("admin:replaceAttribute", (data) => {
      const targetPlayerId = data?.targetPlayerId;
      const attributeType = data?.attributeType;
      const ctx = getSocketRoom(socket);
      if (!ctx) return;
      if (!requireHost(socket, ctx.room, ctx.info.playerId)) return;
      if (!isValidAttributeType(attributeType)) {
        socket.emit("room:error", { message: "Некорректный тип атрибута" });
        return;
      }
      if (typeof targetPlayerId !== "string" || !ctx.room.players.has(targetPlayerId)) {
        socket.emit("room:error", { message: "Игрок не найден" });
        return;
      }
      const result = executeBunkerCommand(
        ctx.room,
        ctx.info.playerId,
        { type: "replace-attribute", seatId: targetPlayerId, attributeType },
        io,
      );
      if (!result.success) {
        socket.emit("room:error", { message: result.error ?? "Невозможно заменить карту" });
      }
    });

    socket.on("admin:removeBunkerCard", (data) => {
      const cardIndex = data?.cardIndex;
      const ctx = getSocketRoom(socket);
      if (!ctx) return;
      if (!requireHost(socket, ctx.room, ctx.info.playerId)) return;
      if (!isValidCardIndex(cardIndex)) {
        socket.emit("room:error", { message: "Некорректный индекс карты" });
        return;
      }
      const result = executeBunkerCommand(
        ctx.room,
        ctx.info.playerId,
        { type: "remove-bunker-card", cardIndex },
        io,
      );
      if (!result.success) {
        socket.emit("room:error", { message: result.error ?? "Невозможно удалить карту" });
      }
    });

    socket.on("admin:replaceBunkerCard", (data) => {
      const cardIndex = data?.cardIndex;
      const ctx = getSocketRoom(socket);
      if (!ctx) return;
      if (!requireHost(socket, ctx.room, ctx.info.playerId)) return;
      if (!isValidCardIndex(cardIndex)) {
        socket.emit("room:error", { message: "Некорректный индекс карты" });
        return;
      }
      const result = executeBunkerCommand(
        ctx.room,
        ctx.info.playerId,
        { type: "replace-bunker-card", cardIndex },
        io,
      );
      if (!result.success) {
        socket.emit("room:error", { message: result.error ?? "Невозможно заменить карту" });
      }
    });

    socket.on("admin:deleteAttribute", (data) => {
      const targetPlayerId = data?.targetPlayerId;
      const attributeType = data?.attributeType;
      const ctx = getSocketRoom(socket);
      if (!ctx) return;
      if (!requireHost(socket, ctx.room, ctx.info.playerId)) return;
      if (!isValidAttributeType(attributeType)) {
        socket.emit("room:error", { message: "Некорректный тип атрибута" });
        return;
      }
      if (typeof targetPlayerId !== "string" || !ctx.room.players.has(targetPlayerId)) {
        socket.emit("room:error", { message: "Игрок не найден" });
        return;
      }
      const result = executeBunkerCommand(
        ctx.room,
        ctx.info.playerId,
        { type: "delete-attribute", seatId: targetPlayerId, attributeType },
        io,
      );
      if (!result.success) {
        socket.emit("room:error", { message: result.error ?? "Невозможно удалить атрибут" });
      }
    });

    socket.on("admin:forceRevealType", (data) => {
      const attributeType = data?.attributeType;
      const ctx = getSocketRoom(socket);
      if (!ctx) return;
      if (!requireHost(socket, ctx.room, ctx.info.playerId)) return;
      if (!isValidAttributeType(attributeType)) {
        socket.emit("room:error", { message: "Некорректный тип атрибута" });
        return;
      }
      const result = executeBunkerCommand(
        ctx.room,
        ctx.info.playerId,
        { type: "force-reveal-type", attributeType },
        io,
      );
      if (!result.success) {
        socket.emit("room:error", { message: result.error ?? "Невозможно раскрыть атрибут" });
      }
    });

    socket.on("admin:pause", () => {
      const ctx = getSocketRoom(socket);
      if (!ctx) return;
      if (!requireHost(socket, ctx.room, ctx.info.playerId)) return;
      const module = getServerGameModule(ctx.room.gameId);
      const result = module?.setAdminPause(ctx.room, true, io) ?? {
        success: false,
        error: "Игра недоступна",
      };
      if (!result.success) {
        socket.emit("room:error", {
          message: result.error ?? "Невозможно поставить игру на паузу",
        });
      }
    });

    socket.on("admin:unpause", () => {
      const ctx = getSocketRoom(socket);
      if (!ctx) return;
      if (!requireHost(socket, ctx.room, ctx.info.playerId)) return;
      const module = getServerGameModule(ctx.room.gameId);
      const result = module?.setAdminPause(ctx.room, false, io) ?? {
        success: false,
        error: "Игра недоступна",
      };
      if (!result.success) {
        socket.emit("room:error", { message: result.error ?? "Невозможно продолжить игру" });
      }
    });

    socket.on("admin:skipDiscussion", () => {
      const ctx = getSocketRoom(socket);
      if (!ctx) return;
      if (!requireHost(socket, ctx.room, ctx.info.playerId)) return;
      const result = executeBunkerCommand(
        ctx.room,
        ctx.info.playerId,
        { type: "skip-discussion" },
        io,
      );
      if (!result.success) {
        socket.emit("room:error", { message: result.error ?? "Невозможно пропустить обсуждение" });
      }
    });

    socket.on("admin:revivePlayer", (data) => {
      const targetPlayerId = data?.targetPlayerId;
      const ctx = getSocketRoom(socket);
      if (!ctx) return;
      if (!requireHost(socket, ctx.room, ctx.info.playerId)) return;
      if (typeof targetPlayerId !== "string" || !ctx.room.players.has(targetPlayerId)) {
        socket.emit("room:error", { message: "Игрок не найден" });
        return;
      }
      const result = executeBunkerCommand(
        ctx.room,
        ctx.info.playerId,
        { type: "revive-seat", seatId: targetPlayerId },
        io,
      );
      if (!result.success) {
        socket.emit("room:error", { message: result.error ?? "Невозможно вернуть игрока" });
      }
    });

    socket.on("admin:eliminatePlayer", (data) => {
      const targetPlayerId = data?.targetPlayerId;
      const ctx = getSocketRoom(socket);
      if (!ctx) return;
      if (!requireHost(socket, ctx.room, ctx.info.playerId)) return;
      if (typeof targetPlayerId !== "string" || !ctx.room.players.has(targetPlayerId)) {
        socket.emit("room:error", { message: "Игрок не найден" });
        return;
      }
      const result = executeBunkerCommand(
        ctx.room,
        ctx.info.playerId,
        { type: "eliminate-seat", seatId: targetPlayerId },
        io,
      );
      if (!result.success) {
        socket.emit("room:error", { message: result.error ?? "Невозможно исключить игрока" });
      }
    });

    socket.on("room:leave", () => {
      removeClaimsForSocket(socket.id, io, "Заявка отменена", true);
      const info = socketRoomMap.get(socket.id);
      if (info?.role === "spectator") {
        const room = getRoom(info.roomCode);
        const spectator = room?.spectators.get(info.playerId);
        const ownsSpectator = spectator?.socketId === socket.id;
        if (room && spectator && ownsSpectator) {
          clearSpectatorGraceTimer(spectator.id);
          removeSpectator(room, spectator.id);
        }
        socketRoomMap.delete(socket.id);
        cleanupRateLimitEntry(socket.id);
        socket.leave(info.roomCode);
        if (room && ownsSpectator && room.players.size > 0) {
          publishRoom(room, io);
        }
        return;
      }

      if (!info) return;
      const room = getRoom(info.roomCode);
      const player = room?.players.get(info.playerId);
      if (!room || !player || !isCurrentSocketOwner(player, socket.id)) {
        socketRoomMap.delete(socket.id);
        cleanupRateLimitEntry(socket.id);
        socket.leave(info.roomCode);
        return;
      }

      const lifecycle = getServerGameModule(room.gameId)?.lifecycle(room);
      if (lifecycle === "lobby" || lifecycle === "results") {
        removePlayerWithHostFailover(room, player.id, io);
        socketRoomMap.delete(socket.id);
        cleanupRateLimitEntry(socket.id);
        socket.leave(info.roomCode);
        return;
      }

      markPlayerDisconnected(room, player.id, socket.id, io);
      socketRoomMap.delete(socket.id);
      cleanupRateLimitEntry(socket.id);
      socket.leave(info.roomCode);
    });

    socket.on("disconnect", () => {
      if (process.env.NODE_ENV !== "production") {
        console.log(`Disconnected: ${socket.id}`);
      }
      removeClaimsForSocket(socket.id, io);
      const info = socketRoomMap.get(socket.id);
      cleanupRateLimitEntry(socket.id);
      if (!info) return;
      const room = getRoom(info.roomCode);
      if (!room) {
        socketRoomMap.delete(socket.id);
        return;
      }

      if (info.role === "spectator") {
        const spectator = room.spectators.get(info.playerId);
        if (spectator && spectator.socketId === socket.id) {
          spectator.connected = false;
          scheduleSpectatorGraceRemoval(room, spectator, socket.id, io);
        }
        return;
      }

      markPlayerDisconnected(room, info.playerId, socket.id, io);
      socketRoomMap.delete(socket.id);
    });
  });
}
