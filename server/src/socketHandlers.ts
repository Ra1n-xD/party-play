import { Server, Socket } from "socket.io";
import { ClientEvents, ServerEvents } from "../../shared/types.js";
import {
  createRoom,
  joinRoom,
  getRoom,
  removePlayer,
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

// Map socketId -> { roomCode, playerId }
const socketRoomMap = new Map<string, { roomCode: string; playerId: string }>();

// --- Rate limiting ---
const RATE_LIMIT_WINDOW = 10_000; // 10 seconds
const RATE_LIMIT_MAX = 50; // max events per window
const socketEventCounts = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(socketId: string): boolean {
  const now = Date.now();
  let entry = socketEventCounts.get(socketId);

  if (!entry || now >= entry.resetAt) {
    entry = { count: 1, resetAt: now + RATE_LIMIT_WINDOW };
    socketEventCounts.set(socketId, entry);
    return false;
  }

  entry.count++;
  return entry.count > RATE_LIMIT_MAX;
}

function cleanupRateLimitEntry(socketId: string): void {
  socketEventCounts.delete(socketId);
}

// --- Input validation helpers ---
const VALID_ATTRIBUTE_TYPES = [
  "profession",
  "bio",
  "health",
  "hobby",
  "baggage",
  "fact",
  "action",
];

function isValidAttributeType(type: unknown): type is string {
  return typeof type === "string" && VALID_ATTRIBUTE_TYPES.includes(type);
}

function isValidCardIndex(index: unknown): index is number {
  return typeof index === "number" && Number.isInteger(index) && index >= 0;
}

function isValidPlayerName(name: unknown): name is string {
  return (
    typeof name === "string" &&
    name.trim().length > 0 &&
    name.trim().length <= CONFIG.MAX_PLAYER_NAME_LENGTH
  );
}

// --- Helper: get room info with rate limit check ---
function getSocketInfo(
  socket: IOSocket,
): { roomCode: string; playerId: string } | null {
  if (isRateLimited(socket.id)) {
    socket.emit("room:error", { message: "Слишком много запросов, подождите" });
    return null;
  }
  return socketRoomMap.get(socket.id) || null;
}

function getSocketRoom(
  socket: IOSocket,
): { room: Room; info: { roomCode: string; playerId: string } } | null {
  const info = getSocketInfo(socket);
  if (!info) return null;
  const room = getRoom(info.roomCode);
  if (!room) return null;
  return { room, info };
}

function requireHost(
  socket: IOSocket,
  room: Room,
  playerId: string,
): boolean {
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
      if (isRateLimited(socket.id)) {
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

      const { room, player } = createRoom(socket.id, playerName.trim());
      socket.join(room.code);
      socketRoomMap.set(socket.id, {
        roomCode: room.code,
        playerId: player.id,
      });

      socket.emit("room:created", { roomCode: room.code, playerId: player.id });
      broadcastState(room, io);
    });

    socket.on("room:join", ({ roomCode, playerName }) => {
      if (isRateLimited(socket.id)) {
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
      if (!roomCode?.trim()) {
        socket.emit("room:error", { message: "Введите код комнаты" });
        return;
      }

      const result = joinRoom(
        roomCode.trim().toUpperCase(),
        socket.id,
        playerName.trim(),
      );
      if ("error" in result) {
        socket.emit("room:error", { message: result.error });
        return;
      }

      const { room, player } = result;
      socket.join(room.code);
      socketRoomMap.set(socket.id, {
        roomCode: room.code,
        playerId: player.id,
      });

      socket.emit("room:joined", { roomCode: room.code, playerId: player.id });
      broadcastState(room, io);
    });

    socket.on("room:rejoin", ({ roomCode, playerId }) => {
      if (isRateLimited(socket.id)) return;

      const room = getRoom(roomCode);
      if (!room) {
        socket.emit("room:error", { message: "Комната не найдена" });
        return;
      }

      const player = room.players.get(playerId);
      if (!player) {
        socket.emit("room:error", { message: "Игрок не найден в комнате" });
        return;
      }

      // Reconnect
      player.socketId = socket.id;
      player.connected = true;
      socket.join(room.code);
      socketRoomMap.set(socket.id, {
        roomCode: room.code,
        playerId: player.id,
      });

      socket.emit("room:joined", { roomCode: room.code, playerId: player.id });

      // Re-send character if game is in progress
      if (player.character) {
        socket.emit("game:character", player.character);
      }

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
      const ctx = getSocketRoom(socket);
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

      const success = revealAttribute(
        ctx.room,
        ctx.info.playerId,
        attributeIndex,
        io,
      );
      if (!success) {
        socket.emit("room:error", { message: "Сейчас не ваш ход" });
      }
    });

    socket.on("game:revealActionCard", () => {
      const ctx = getSocketRoom(socket);
      if (!ctx) return;

      const success = revealActionCard(ctx.room, ctx.info.playerId, io);
      if (!success) {
        socket.emit("room:error", {
          message: "Невозможно раскрыть особое условие сейчас",
        });
      }
    });

    socket.on("vote:cast", ({ targetPlayerId }) => {
      const ctx = getSocketRoom(socket);
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

      const success = castVote(
        ctx.room,
        ctx.info.playerId,
        targetPlayerId,
        io,
      );
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
      const result = adminSwapAttribute(
        ctx.room,
        player1Id,
        player2Id,
        attributeType,
        io,
      );
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
      if (
        typeof targetPlayerId !== "string" ||
        !ctx.room.players.has(targetPlayerId)
      ) {
        socket.emit("room:error", { message: "Игрок не найден" });
        return;
      }
      const result = adminReplaceAttribute(
        ctx.room,
        targetPlayerId,
        attributeType,
        io,
      );
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
      if (
        typeof targetPlayerId !== "string" ||
        !ctx.room.players.has(targetPlayerId)
      ) {
        socket.emit("room:error", { message: "Игрок не найден" });
        return;
      }
      const result = adminDeleteAttribute(
        ctx.room,
        targetPlayerId,
        attributeType,
        io,
      );
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
      const currentTurnPlayerId =
        room.gameState.turnOrder[room.gameState.currentTurnIndex];
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
