import { Server, Socket } from "socket.io";
import { ClientEvents, ServerEvents } from "../../shared/types.js";
import {
  createRoom,
  joinRoom,
  joinRoomAsSpectator,
  getRoom,
  removePlayer,
  removeSpectator,
  addBotToRoom,
  removeBotFromRoom,
  getAllRooms,
  Room,
  Player,
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
  unpauseGame,
  skipDiscussion,
  adminRevivePlayer,
  adminEliminatePlayer,
} from "./gameEngine.js";
import { CONFIG } from "./config.js";

type IOServer = Server<ClientEvents, ServerEvents>;
type IOSocket = Socket<ClientEvents, ServerEvents>;

// Map socketId -> { roomCode, playerId, role }
const socketRoomMap = new Map<
  string,
  { roomCode: string; playerId: string; role: "player" | "spectator" }
>();

// --- Per-action rate limiting ---
const ACTION_LIMITS: Record<string, { max: number; windowMs: number }> = {
  "room:create": { max: 1, windowMs: 10000 },
  "room:join": { max: 3, windowMs: 10000 },
  "room:joinSpectator": { max: 3, windowMs: 10000 },
  "room:rejoin": { max: 3, windowMs: 10000 },
  "room:rejoinSpectator": { max: 3, windowMs: 10000 },
  "vote:cast": { max: 2, windowMs: 5000 },
  "game:revealAttribute": { max: 2, windowMs: 2000 },
  "game:revealActionCard": { max: 2, windowMs: 2000 },
  default: { max: 20, windowMs: 10000 },
};

// socketId -> (action -> { count, resetAt })
const socketActionCounts = new Map<string, Map<string, { count: number; resetAt: number }>>();

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

function cleanupRateLimitEntry(socketId: string): void {
  socketActionCounts.delete(socketId);
}

// --- Progressive backoff for failed rejoin attempts (per IP) ---
const rejoinFailures = new Map<string, { count: number; blockedUntil: number }>();

function getSocketIp(socket: IOSocket): string {
  const forwarded = socket.handshake.headers["x-forwarded-for"];
  return (typeof forwarded === "string" ? forwarded.split(",")[0].trim() : null)
    || socket.handshake.address;
}

function isRejoinBlocked(socket: IOSocket): boolean {
  const ip = getSocketIp(socket);
  const entry = rejoinFailures.get(ip);
  if (!entry) return false;
  if (Date.now() < entry.blockedUntil) return true;
  // Block expired — reset
  rejoinFailures.delete(ip);
  return false;
}

function recordRejoinFailure(socket: IOSocket): void {
  const ip = getSocketIp(socket);
  const entry = rejoinFailures.get(ip) || { count: 0, blockedUntil: 0 };
  entry.count++;
  // Exponential backoff: 2s, 4s, 8s, 16s, max 60s
  const delaySec = Math.min(60, 2 ** entry.count);
  entry.blockedUntil = Date.now() + delaySec * 1000;
  rejoinFailures.set(ip, entry);
}

function clearRejoinFailures(socket: IOSocket): void {
  const ip = getSocketIp(socket);
  rejoinFailures.delete(ip);
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

// --- Helper: get room info with rate limit check ---
function getSocketInfo(
  socket: IOSocket,
  action: string = "default",
): { roomCode: string; playerId: string; role: "player" | "spectator" } | null {
  if (isRateLimited(socket.id, action)) {
    socket.emit("room:error", { message: "Слишком много запросов, подождите" });
    return null;
  }
  return socketRoomMap.get(socket.id) || null;
}

function getSocketRoom(socket: IOSocket, action: string = "default"): {
  room: Room;
  info: { roomCode: string; playerId: string; role: "player" | "spectator" };
} | null {
  const info = getSocketInfo(socket, action);
  if (!info) return null;
  // Spectators should not use player-action handlers
  if (info.role === "spectator") return null;
  const room = getRoom(info.roomCode);
  if (!room) return null;
  return { room, info };
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
  io.on("connection", (socket: IOSocket) => {
    if (process.env.NODE_ENV !== "production") {
      console.log(`Connected: ${socket.id}`);
    }

    socket.on("room:create", ({ playerName }) => {
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

      const { room, player } = createRoom(socket.id, sanitizePlayerName(playerName));
      socket.join(room.code);
      socketRoomMap.set(socket.id, {
        roomCode: room.code,
        playerId: player.id,
        role: "player",
      });

      socket.emit("room:created", { roomCode: room.code, playerId: player.id, sessionToken: player.sessionToken });
      broadcastState(room, io);
    });

    socket.on("room:join", ({ roomCode, playerName }) => {
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

      const result = joinRoom(roomCode.trim().toUpperCase(), socket.id, sanitizePlayerName(playerName));
      if ("error" in result) {
        socket.emit("room:error", { message: result.error });
        return;
      }

      const { room, player } = result;
      socket.join(room.code);
      socketRoomMap.set(socket.id, {
        roomCode: room.code,
        playerId: player.id,
        role: "player",
      });

      socket.emit("room:joined", { roomCode: room.code, playerId: player.id, sessionToken: player.sessionToken });
      broadcastState(room, io);
    });

    socket.on("room:rejoin", ({ roomCode, playerId, sessionToken }) => {
      if (isRateLimited(socket.id, "room:rejoin")) return;
      if (isRejoinBlocked(socket)) {
        socket.emit("room:error", { message: "Слишком много неудачных попыток, подождите" });
        return;
      }

      if (!isValidRoomCode(roomCode) || !isValidId(playerId) || !isValidSessionToken(sessionToken)) {
        recordRejoinFailure(socket);
        socket.emit("room:error", { message: "Не удалось переподключиться" });
        return;
      }

      const room = getRoom(roomCode);
      if (!room) {
        recordRejoinFailure(socket);
        socket.emit("room:error", { message: "Не удалось переподключиться" });
        return;
      }

      const player = room.players.get(playerId);
      if (!player) {
        recordRejoinFailure(socket);
        socket.emit("room:error", { message: "Не удалось переподключиться" });
        return;
      }

      // Validate session token
      if (!sessionToken || player.sessionToken !== sessionToken) {
        recordRejoinFailure(socket);
        socket.emit("room:error", { message: "Не удалось переподключиться" });
        return;
      }

      // Success — clear failure counter
      clearRejoinFailures(socket);

      // Reconnect
      player.socketId = socket.id;
      player.connected = true;
      socket.join(room.code);
      socketRoomMap.set(socket.id, {
        roomCode: room.code,
        playerId: player.id,
        role: "player",
      });

      socket.emit("room:joined", { roomCode: room.code, playerId: player.id, sessionToken: player.sessionToken });

      // Re-send character if game is in progress
      if (player.character) {
        socket.emit("game:character", player.character);
      }

      broadcastState(room, io);
    });

    socket.on("room:joinSpectator", ({ roomCode, spectatorName }) => {
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

      if (!isValidRoomCode(roomCode) || !isValidId(spectatorId) || !isValidSessionToken(sessionToken)) {
        recordRejoinFailure(socket);
        socket.emit("room:error", { message: "Не удалось переподключиться" });
        return;
      }

      const room = getRoom(roomCode);
      if (!room) {
        recordRejoinFailure(socket);
        socket.emit("room:error", { message: "Не удалось переподключиться" });
        return;
      }

      const spectator = room.spectators.get(spectatorId);
      if (!spectator) {
        recordRejoinFailure(socket);
        socket.emit("room:error", { message: "Не удалось переподключиться" });
        return;
      }

      // Validate session token
      if (!sessionToken || spectator.sessionToken !== sessionToken) {
        recordRejoinFailure(socket);
        socket.emit("room:error", { message: "Не удалось переподключиться" });
        return;
      }

      // Success — clear failure counter
      clearRejoinFailures(socket);

      spectator.socketId = socket.id;
      spectator.connected = true;
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

      if (ctx.room.players.size < CONFIG.MIN_PLAYERS) {
        socket.emit("room:error", {
          message: `Нужно минимум ${CONFIG.MIN_PLAYERS} игрока`,
        });
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
      const info = socketRoomMap.get(socket.id);
      if (info?.role === "spectator") {
        const room = getRoom(info.roomCode);
        if (room) {
          removeSpectator(room, info.playerId);
          if (room.players.size > 0) {
            broadcastState(room, io);
          }
        }
        socketRoomMap.delete(socket.id);
        cleanupRateLimitEntry(socket.id);
        socket.leave(info.roomCode);
        return;
      }
      handleDisconnect(socket, io);
    });

    socket.on("disconnect", () => {
      if (process.env.NODE_ENV !== "production") {
        console.log(`Disconnected: ${socket.id}`);
      }
      const info = socketRoomMap.get(socket.id);
      if (!info) return;
      const room = getRoom(info.roomCode);
      if (!room) return;

      if (info.role === "spectator") {
        const spectator = room.spectators.get(info.playerId);
        if (spectator) {
          spectator.connected = false;
          setTimeout(() => {
            if (!spectator.connected) {
              removeSpectator(room, info.playerId);
              socketRoomMap.delete(socket.id);
              socket.leave(info.roomCode);
              if (room.players.size > 0) {
                broadcastState(room, io);
              }
            }
          }, CONFIG.RECONNECT_GRACE_PERIOD);
        }
        cleanupRateLimitEntry(socket.id);
        return;
      }

      const player = room.players.get(info.playerId);
      if (!player) return;

      // Mark as disconnected, give grace period
      player.connected = false;
      broadcastState(room, io);

      setTimeout(() => {
        if (!player.connected) {
          handleDisconnect(socket, io);
        }
      }, CONFIG.RECONNECT_GRACE_PERIOD);

      // Cleanup rate limit entry
      cleanupRateLimitEntry(socket.id);
    });
  });
}

function handleDisconnect(socket: IOSocket, io: IOServer): void {
  const info = socketRoomMap.get(socket.id);
  if (!info) return;

  const room = getRoom(info.roomCode);
  if (room) {
    const player = room.players.get(info.playerId);

    // If game is in progress and it's this player's turn, skip them
    if (room.gameState?.phase === "ROUND_REVEAL" && player) {
      const currentTurnPlayerId = room.gameState.turnOrder[room.gameState.currentTurnIndex];
      if (currentTurnPlayerId === info.playerId) {
        // Auto-reveal for disconnected player
        revealAttribute(room, info.playerId, undefined, io);
      }
    }

    removePlayer(room, info.playerId);
    if (room.players.size > 0) {
      broadcastState(room, io);
    }
  }

  socketRoomMap.delete(socket.id);
  cleanupRateLimitEntry(socket.id);
  socket.leave(info.roomCode);
}
