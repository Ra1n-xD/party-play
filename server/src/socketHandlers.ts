import { timingSafeEqual } from "crypto";
import { Server, Socket } from "socket.io";
import { ClientEvents, ReconnectErrorCode, ServerEvents } from "../../shared/types.js";
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
import {
  startGame,
  revealAttribute,
  revealActionCard,
  castVote,
  forceEndGame,
  resetGame,
  broadcastState,
  adminShuffleAll,
  adminSwapAttribute,
  adminReplaceAttribute,
  adminRemoveBunkerCard,
  adminReplaceBunkerCard,
  adminDeleteAttribute,
  adminForceRevealType,
  pauseGame,
  removeDisconnectPause,
  unpauseGame,
  skipDiscussion,
  adminRevivePlayer,
  adminEliminatePlayer,
} from "./gameEngine.js";
import { CONFIG } from "./config.js";
import { generateSessionToken } from "./utils.js";
import { clearBotActions, resetBotManagerStateForTests } from "./botManager.js";
import { resetGameLifecycleHooksForTests, setBeforeGameOverHook } from "./gameLifecycle.js";
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
} from "./reconnectManager.js";
import { getSocketClientIdentity } from "./clientIdentity.js";
import { RejoinThrottle } from "./rejoinThrottle.js";

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
    clearBotActions(disposedRoom.code);
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

function isValidAttributeType(type: unknown): type is string {
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

function isValidRoomCode(code: unknown): code is string {
  return typeof code === "string" && /^[A-Z0-9]{4,16}$/.test(code.trim().toUpperCase());
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
    if (room.players.size > 0) broadcastState(room, io);
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

export function registerHandlers(io: IOServer): void {
  installGameLifecycleHooks();
  io.on("connection", (socket: IOSocket) => {
    if (process.env.NODE_ENV !== "production") {
      console.log(`Connected: ${socket.id}`);
    }

    socket.on("room:create", ({ playerName }) => {
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

      // Check room limit
      if (getAllRooms().size >= CONFIG.MAX_ROOMS) {
        socket.emit("room:error", {
          message: "Сервер перегружен, попробуйте позже",
        });
        return;
      }

      removeClaimsForSocket(socket.id, io, "Заявитель присоединился к другой комнате", true);
      const { room, player } = createRoom(socket.id, sanitizePlayerName(playerName));
      attachRoomDisposalHandler(room, io);
      socket.join(room.code);
      socketRoomMap.set(socket.id, {
        roomCode: room.code,
        playerId: player.id,
        role: "player",
      });

      socket.emit("room:created", {
        roomCode: room.code,
        playerId: player.id,
        sessionToken: player.sessionToken,
      });
      broadcastState(room, io);
    });

    socket.on("room:join", ({ roomCode, playerName }) => {
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
      if (!isValidRoomCode(roomCode)) {
        socket.emit("room:error", { message: "Введите код комнаты" });
        return;
      }

      const result = joinRoom(
        roomCode.trim().toUpperCase(),
        socket.id,
        sanitizePlayerName(playerName),
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
        playerId: player.id,
        sessionToken: player.sessionToken,
      });
      if (!ensureConnectedHost(room, io)) broadcastState(room, io);
    });

    socket.on("room:rejoin", ({ roomCode, playerId, sessionToken }) => {
      if (isRateLimited(socket.id, "room:rejoin")) return;
      if (isRejoinBlocked(socket)) {
        socket.emit("room:error", { message: "Слишком много неудачных попыток, подождите" });
        return;
      }

      if (
        !isValidRoomCode(roomCode) ||
        !isValidId(playerId) ||
        !isValidSessionToken(sessionToken)
      ) {
        recordRejoinFailure(socket);
        emitReconnectError(socket, "INVALID_SESSION", "Не удалось переподключиться", true);
        return;
      }

      const normalizedRoomCode = roomCode.trim().toUpperCase();
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
        playerId: player.id,
        sessionToken: player.sessionToken,
      });

      if (player.character) {
        socket.emit("game:character", player.character);
      }

      removeDisconnectPause(room, player.id, io, false);
      if (!ensureConnectedHost(room, io)) broadcastState(room, io);
    });

    socket.on("room:listReconnectableSeats", (data) => {
      if (rejectExistingSocketMembership(socket)) return;
      if (rejectRateLimitedClaimAction(socket, "room:listReconnectableSeats")) return;

      const roomCode = data?.roomCode;
      if (!isValidRoomCode(roomCode)) {
        socket.emit("room:error", { message: "Введите код комнаты" });
        return;
      }
      const normalizedRoomCode = roomCode.trim().toUpperCase();
      const room = getRoom(normalizedRoomCode);
      if (!room) {
        socket.emit("room:error", { message: "Комната не найдена" });
        return;
      }
      if (room.gameState?.phase === "GAME_OVER") {
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

      const roomCode = data?.roomCode;
      const playerId = data?.playerId;
      const claimantName = data?.claimantName;
      if (!isValidRoomCode(roomCode)) {
        socket.emit("room:error", { message: "Введите код комнаты" });
        return;
      }
      const normalizedRoomCode = roomCode.trim().toUpperCase();
      const room = getRoom(normalizedRoomCode);
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

    socket.on("room:joinSpectator", ({ roomCode, spectatorName }) => {
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
      if (!isValidRoomCode(roomCode)) {
        socket.emit("room:error", { message: "Введите код комнаты" });
        return;
      }

      const result = joinRoomAsSpectator(
        roomCode.trim().toUpperCase(),
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
        spectatorId: spectator.id,
        sessionToken: spectator.sessionToken,
      });
      broadcastState(room, io);
    });

    socket.on("room:rejoinSpectator", ({ roomCode, spectatorId, sessionToken }) => {
      if (isRateLimited(socket.id, "room:rejoinSpectator")) return;
      if (isRejoinBlocked(socket)) {
        socket.emit("room:error", { message: "Слишком много неудачных попыток, подождите" });
        return;
      }

      if (
        !isValidRoomCode(roomCode) ||
        !isValidId(spectatorId) ||
        !isValidSessionToken(sessionToken)
      ) {
        recordRejoinFailure(socket);
        emitReconnectError(socket, "INVALID_SESSION", "Не удалось переподключиться", true);
        return;
      }

      const normalizedRoomCode = roomCode.trim().toUpperCase();
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
        spectatorId: spectator.id,
        sessionToken: newToken,
      });
      broadcastState(room, io);
    });

    socket.on("player:ready", ({ ready }) => {
      const ctx = getSocketRoom(socket);
      if (!ctx) return;
      const player = ctx.room.players.get(ctx.info.playerId);
      if (!player) return;

      player.ready = ready;
      broadcastState(ctx.room, io);
    });

    socket.on("game:start", () => {
      const ctx = getSocketRoom(socket);
      if (!ctx) return;
      if (!requireHost(socket, ctx.room, ctx.info.playerId)) return;
      if (ctx.room.gameState) {
        socket.emit("room:error", { message: "Игра уже началась" });
        return;
      }

      if (ctx.room.players.size < CONFIG.MIN_PLAYERS) {
        socket.emit("room:error", {
          message: `Нужно минимум ${CONFIG.MIN_PLAYERS} игрока`,
        });
        return;
      }

      const allConnected = Array.from(ctx.room.players.values()).every(
        (player) => player.isBot || player.connected,
      );
      if (!allConnected) {
        socket.emit("room:error", { message: "Не все игроки подключены" });
        return;
      }

      const allReady = Array.from(ctx.room.players.values()).every(
        (p) => p.ready || p.id === ctx.room.hostId,
      );
      if (!allReady) {
        socket.emit("room:error", { message: "Не все игроки готовы" });
        return;
      }

      startGame(ctx.room, io);
    });

    socket.on("game:revealAttribute", ({ attributeIndex }) => {
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

      const success = revealAttribute(ctx.room, ctx.info.playerId, attributeIndex, io);
      if (!success) {
        socket.emit("room:error", { message: "Сейчас не ваш ход" });
      }
    });

    socket.on("game:revealActionCard", () => {
      const ctx = getSocketRoom(socket, "game:revealActionCard");
      if (!ctx) return;

      const success = revealActionCard(ctx.room, ctx.info.playerId, io);
      if (!success) {
        socket.emit("room:error", {
          message: "Невозможно раскрыть особое условие сейчас",
        });
      }
    });

    socket.on("vote:cast", ({ targetPlayerId }) => {
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

      const success = castVote(ctx.room, ctx.info.playerId, targetPlayerId, io);
      if (!success) {
        socket.emit("room:error", { message: "Невозможно проголосовать" });
      }
    });

    socket.on("game:endGame", () => {
      const ctx = getSocketRoom(socket);
      if (!ctx) return;
      if (!requireHost(socket, ctx.room, ctx.info.playerId)) return;

      forceEndGame(ctx.room, io);
    });

    socket.on("game:playAgain", () => {
      const ctx = getSocketRoom(socket);
      if (!ctx) return;
      if (!requireHost(socket, ctx.room, ctx.info.playerId)) return;

      cancelAllSeatClaims(ctx.room, io, "Игра сброшена");
      resetGame(ctx.room, io);
    });

    socket.on("room:addBot", () => {
      const ctx = getSocketRoom(socket);
      if (!ctx) return;
      if (!requireHost(socket, ctx.room, ctx.info.playerId)) return;

      const bot = addBotToRoom(ctx.room);
      if (!bot) {
        socket.emit("room:error", { message: "Невозможно добавить бота" });
        return;
      }

      broadcastState(ctx.room, io);
    });

    socket.on("room:removeBot", ({ playerId: botId }) => {
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

      broadcastState(ctx.room, io);
    });

    // --- Admin panel events ---

    socket.on("admin:resolveSeatClaim", (data) => {
      const ctx = getSocketRoom(socket);
      if (!ctx) return;
      if (!requireHost(socket, ctx.room, ctx.info.playerId)) return;
      if (rejectRateLimitedClaimAction(socket, "admin:resolveSeatClaim")) return;

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

      const resolutionNow = Date.now();
      const resolution = resolveSeatClaim(
        ctx.room,
        ctx.info.playerId,
        requestId,
        approved,
        io,
        resolutionNow,
      );
      if (!resolution.success) {
        socket.emit("room:error", { message: resolution.error });
        return;
      }
      if (!resolution.approved) return;

      const { claim, player } = resolution;
      const claimantSocket = io.sockets.sockets.get(claim.socketId);
      const claimantMembership = claimantSocket ? getCurrentSocketMembership(claimantSocket) : null;
      if (
        !claimantSocket?.connected ||
        claimantMembership !== null ||
        claimantSocket.rooms.size > 1
      ) {
        removeClaimsForSocket(claim.socketId, io, "Заявитель больше недоступен", true);
        socket.emit("room:error", { message: "Заявитель больше недоступен" });
        return;
      }

      const bindResult = bindPlayerSocket(player, claimantSocket.id, (previousSocketId) => {
        const previousInfo = socketRoomMap.get(previousSocketId);
        if (
          previousInfo?.roomCode === ctx.room.code &&
          previousInfo.playerId === player.id &&
          previousInfo.role === "player"
        ) {
          socketRoomMap.delete(previousSocketId);
        }
        io.sockets.sockets.get(previousSocketId)?.leave(ctx.room.code);
      });
      if (!bindResult.ok) {
        removeClaimsForSocket(claim.socketId, io, bindResult.error, true);
        socket.emit("room:error", { message: bindResult.error });
        return;
      }

      player.name = sanitizePlayerName(claim.claimantName);
      player.sessionToken = generateSessionToken();
      claimantSocket.join(ctx.room.code);
      socketRoomMap.set(claimantSocket.id, {
        roomCode: ctx.room.code,
        playerId: player.id,
        role: "player",
      });

      finalizeApprovedSeatClaim(ctx.room, requestId, io, resolutionNow);
      removeClaimsForSocket(claimantSocket.id, io, "Вы уже восстановили другое место", true);
      claimantSocket.emit("room:joined", {
        roomCode: ctx.room.code,
        playerId: player.id,
        sessionToken: player.sessionToken,
      });
      if (player.character) claimantSocket.emit("game:character", player.character);

      removeDisconnectPause(ctx.room, player.id, io, false);
      if (!ensureConnectedHost(ctx.room, io)) broadcastState(ctx.room, io);
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

    socket.on("admin:shuffleAll", ({ attributeType }) => {
      const ctx = getSocketRoom(socket);
      if (!ctx) return;
      if (!requireHost(socket, ctx.room, ctx.info.playerId)) return;
      if (!isValidAttributeType(attributeType)) {
        socket.emit("room:error", { message: "Некорректный тип атрибута" });
        return;
      }
      const result = adminShuffleAll(ctx.room, attributeType, io);
      if (!result.success) {
        socket.emit("room:error", { message: result.error });
      }
    });

    socket.on("admin:swapAttribute", ({ player1Id, player2Id, attributeType }) => {
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
      const result = adminSwapAttribute(ctx.room, player1Id, player2Id, attributeType, io);
      if (!result.success) {
        socket.emit("room:error", { message: result.error });
      }
    });

    socket.on("admin:replaceAttribute", ({ targetPlayerId, attributeType }) => {
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
      const result = adminReplaceAttribute(ctx.room, targetPlayerId, attributeType, io);
      if (!result.success) {
        socket.emit("room:error", { message: result.error });
      }
    });

    socket.on("admin:removeBunkerCard", ({ cardIndex }) => {
      const ctx = getSocketRoom(socket);
      if (!ctx) return;
      if (!requireHost(socket, ctx.room, ctx.info.playerId)) return;
      if (!isValidCardIndex(cardIndex)) {
        socket.emit("room:error", { message: "Некорректный индекс карты" });
        return;
      }
      const result = adminRemoveBunkerCard(ctx.room, cardIndex, io);
      if (!result.success) {
        socket.emit("room:error", { message: result.error });
      }
    });

    socket.on("admin:replaceBunkerCard", ({ cardIndex }) => {
      const ctx = getSocketRoom(socket);
      if (!ctx) return;
      if (!requireHost(socket, ctx.room, ctx.info.playerId)) return;
      if (!isValidCardIndex(cardIndex)) {
        socket.emit("room:error", { message: "Некорректный индекс карты" });
        return;
      }
      const result = adminReplaceBunkerCard(ctx.room, cardIndex, io);
      if (!result.success) {
        socket.emit("room:error", { message: result.error });
      }
    });

    socket.on("admin:deleteAttribute", ({ targetPlayerId, attributeType }) => {
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
      const result = adminDeleteAttribute(ctx.room, targetPlayerId, attributeType, io);
      if (!result.success) {
        socket.emit("room:error", { message: result.error });
      }
    });

    socket.on("admin:forceRevealType", ({ attributeType }) => {
      const ctx = getSocketRoom(socket);
      if (!ctx) return;
      if (!requireHost(socket, ctx.room, ctx.info.playerId)) return;
      if (!isValidAttributeType(attributeType)) {
        socket.emit("room:error", { message: "Некорректный тип атрибута" });
        return;
      }
      const result = adminForceRevealType(ctx.room, attributeType, io);
      if (!result.success) {
        socket.emit("room:error", { message: result.error });
      }
    });

    socket.on("admin:pause", () => {
      const ctx = getSocketRoom(socket);
      if (!ctx) return;
      if (!requireHost(socket, ctx.room, ctx.info.playerId)) return;
      const result = pauseGame(ctx.room, io);
      if (!result.success) {
        socket.emit("room:error", { message: result.error });
      }
    });

    socket.on("admin:unpause", () => {
      const ctx = getSocketRoom(socket);
      if (!ctx) return;
      if (!requireHost(socket, ctx.room, ctx.info.playerId)) return;
      const result = unpauseGame(ctx.room, io);
      if (!result.success) {
        socket.emit("room:error", { message: result.error });
      }
    });

    socket.on("admin:skipDiscussion", () => {
      const ctx = getSocketRoom(socket);
      if (!ctx) return;
      if (!requireHost(socket, ctx.room, ctx.info.playerId)) return;
      const result = skipDiscussion(ctx.room, io);
      if (!result.success) {
        socket.emit("room:error", { message: result.error });
      }
    });

    socket.on("admin:revivePlayer", ({ targetPlayerId }) => {
      const ctx = getSocketRoom(socket);
      if (!ctx) return;
      if (!requireHost(socket, ctx.room, ctx.info.playerId)) return;
      if (typeof targetPlayerId !== "string" || !ctx.room.players.has(targetPlayerId)) {
        socket.emit("room:error", { message: "Игрок не найден" });
        return;
      }
      const result = adminRevivePlayer(ctx.room, targetPlayerId, io);
      if (!result.success) {
        socket.emit("room:error", { message: result.error });
      }
    });

    socket.on("admin:eliminatePlayer", ({ targetPlayerId }) => {
      const ctx = getSocketRoom(socket);
      if (!ctx) return;
      if (!requireHost(socket, ctx.room, ctx.info.playerId)) return;
      if (typeof targetPlayerId !== "string" || !ctx.room.players.has(targetPlayerId)) {
        socket.emit("room:error", { message: "Игрок не найден" });
        return;
      }
      const result = adminEliminatePlayer(ctx.room, targetPlayerId, io);
      if (!result.success) {
        socket.emit("room:error", { message: result.error });
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
          broadcastState(room, io);
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

      if (!room.gameState || room.gameState.phase === "GAME_OVER") {
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
