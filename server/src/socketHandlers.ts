import { Server, Socket } from 'socket.io';
import { ClientEvents, ServerEvents } from '../../shared/types.js';
import { createRoom, joinRoom, getRoom, removePlayer, addBotToRoom, removeBotFromRoom, Room, Player } from './roomManager.js';
import { startGame, revealAttribute, revealActionCard, castVote, forceEndGame, resetGame, broadcastState, adminShuffleAll, adminSwapAttribute, adminReplaceAttribute, pauseGame, unpauseGame } from './gameEngine.js';
import { CONFIG } from './config.js';

type IOServer = Server<ClientEvents, ServerEvents>;
type IOSocket = Socket<ClientEvents, ServerEvents>;

// Map socketId -> { roomCode, playerId }
const socketRoomMap = new Map<string, { roomCode: string; playerId: string }>();

export function registerHandlers(io: IOServer): void {
  io.on('connection', (socket: IOSocket) => {
    console.log(`Connected: ${socket.id}`);

    socket.on('room:create', ({ playerName }) => {
      if (!playerName?.trim()) {
        socket.emit('room:error', { message: 'Введите имя' });
        return;
      }

      const { room, player } = createRoom(socket.id, playerName.trim());
      socket.join(room.code);
      socketRoomMap.set(socket.id, { roomCode: room.code, playerId: player.id });

      socket.emit('room:created', { roomCode: room.code, playerId: player.id });
      broadcastState(room, io);
    });

    socket.on('room:join', ({ roomCode, playerName }) => {
      if (!playerName?.trim()) {
        socket.emit('room:error', { message: 'Введите имя' });
        return;
      }
      if (!roomCode?.trim()) {
        socket.emit('room:error', { message: 'Введите код комнаты' });
        return;
      }

      const result = joinRoom(roomCode.trim().toUpperCase(), socket.id, playerName.trim());
      if ('error' in result) {
        socket.emit('room:error', { message: result.error });
        return;
      }

      const { room, player } = result;
      socket.join(room.code);
      socketRoomMap.set(socket.id, { roomCode: room.code, playerId: player.id });

      socket.emit('room:joined', { roomCode: room.code, playerId: player.id });
      broadcastState(room, io);
    });

    socket.on('room:rejoin', ({ roomCode, playerId }) => {
      const room = getRoom(roomCode);
      if (!room) {
        socket.emit('room:error', { message: 'Комната не найдена' });
        return;
      }

      const player = room.players.get(playerId);
      if (!player) {
        socket.emit('room:error', { message: 'Игрок не найден в комнате' });
        return;
      }

      // Reconnect
      player.socketId = socket.id;
      player.connected = true;
      socket.join(room.code);
      socketRoomMap.set(socket.id, { roomCode: room.code, playerId: player.id });

      socket.emit('room:joined', { roomCode: room.code, playerId: player.id });

      // Re-send character if game is in progress
      if (player.character) {
        socket.emit('game:character', player.character);
      }

      broadcastState(room, io);
    });

    socket.on('player:ready', ({ ready }) => {
      const info = socketRoomMap.get(socket.id);
      if (!info) return;
      const room = getRoom(info.roomCode);
      if (!room) return;
      const player = room.players.get(info.playerId);
      if (!player) return;

      player.ready = ready;
      broadcastState(room, io);
    });

    socket.on('game:start', () => {
      const info = socketRoomMap.get(socket.id);
      if (!info) return;
      const room = getRoom(info.roomCode);
      if (!room) return;

      if (info.playerId !== room.hostId) {
        socket.emit('room:error', { message: 'Только хост может начать игру' });
        return;
      }

      if (room.players.size < CONFIG.MIN_PLAYERS) {
        socket.emit('room:error', { message: `Нужно минимум ${CONFIG.MIN_PLAYERS} игрока` });
        return;
      }

      const allReady = Array.from(room.players.values()).every(p => p.ready || p.id === room.hostId);
      if (!allReady) {
        socket.emit('room:error', { message: 'Не все игроки готовы' });
        return;
      }

      startGame(room, io);
    });

    socket.on('game:revealAttribute', ({ attributeIndex }) => {
      const info = socketRoomMap.get(socket.id);
      if (!info) return;
      const room = getRoom(info.roomCode);
      if (!room) return;

      const success = revealAttribute(room, info.playerId, attributeIndex, io);
      if (!success) {
        socket.emit('room:error', { message: 'Сейчас не ваш ход' });
      }
    });

    socket.on('game:revealActionCard', () => {
      const info = socketRoomMap.get(socket.id);
      if (!info) return;
      const room = getRoom(info.roomCode);
      if (!room) return;

      const success = revealActionCard(room, info.playerId, io);
      if (!success) {
        socket.emit('room:error', { message: 'Невозможно раскрыть особое условие сейчас' });
      }
    });

    socket.on('vote:cast', ({ targetPlayerId }) => {
      const info = socketRoomMap.get(socket.id);
      if (!info) return;
      const room = getRoom(info.roomCode);
      if (!room) return;

      const success = castVote(room, info.playerId, targetPlayerId, io);
      if (!success) {
        socket.emit('room:error', { message: 'Невозможно проголосовать' });
      }
    });

    socket.on('game:endGame', () => {
      const info = socketRoomMap.get(socket.id);
      if (!info) return;
      const room = getRoom(info.roomCode);
      if (!room) return;

      if (info.playerId !== room.hostId) {
        socket.emit('room:error', { message: 'Только хост может завершить игру' });
        return;
      }

      forceEndGame(room, io);
    });

    socket.on('game:playAgain', () => {
      const info = socketRoomMap.get(socket.id);
      if (!info) return;
      const room = getRoom(info.roomCode);
      if (!room) return;

      if (info.playerId !== room.hostId) {
        socket.emit('room:error', { message: 'Только хост может начать новую игру' });
        return;
      }

      resetGame(room, io);
    });

    socket.on('room:addBot', () => {
      const info = socketRoomMap.get(socket.id);
      if (!info) return;
      const room = getRoom(info.roomCode);
      if (!room) return;

      if (info.playerId !== room.hostId) {
        socket.emit('room:error', { message: 'Только хост может добавлять ботов' });
        return;
      }

      const bot = addBotToRoom(room);
      if (!bot) {
        socket.emit('room:error', { message: 'Невозможно добавить бота' });
        return;
      }

      broadcastState(room, io);
    });

    socket.on('room:removeBot', ({ playerId: botId }) => {
      const info = socketRoomMap.get(socket.id);
      if (!info) return;
      const room = getRoom(info.roomCode);
      if (!room) return;

      if (info.playerId !== room.hostId) {
        socket.emit('room:error', { message: 'Только хост может удалять ботов' });
        return;
      }

      const removed = removeBotFromRoom(room, botId);
      if (!removed) {
        socket.emit('room:error', { message: 'Невозможно удалить этого игрока' });
        return;
      }

      broadcastState(room, io);
    });

    socket.on('admin:shuffleAll', ({ attributeType }) => {
      const info = socketRoomMap.get(socket.id);
      if (!info) return;
      const room = getRoom(info.roomCode);
      if (!room) return;
      if (info.playerId !== room.hostId) {
        socket.emit('room:error', { message: 'Только хост может использовать админ-панель' });
        return;
      }
      const result = adminShuffleAll(room, attributeType, io);
      if (!result.success) {
        socket.emit('room:error', { message: result.error });
      }
    });

    socket.on('admin:swapAttribute', ({ player1Id, player2Id, attributeType }) => {
      const info = socketRoomMap.get(socket.id);
      if (!info) return;
      const room = getRoom(info.roomCode);
      if (!room) return;
      if (info.playerId !== room.hostId) {
        socket.emit('room:error', { message: 'Только хост может использовать админ-панель' });
        return;
      }
      const result = adminSwapAttribute(room, player1Id, player2Id, attributeType, io);
      if (!result.success) {
        socket.emit('room:error', { message: result.error });
      }
    });

    socket.on('admin:replaceAttribute', ({ targetPlayerId, attributeType }) => {
      const info = socketRoomMap.get(socket.id);
      if (!info) return;
      const room = getRoom(info.roomCode);
      if (!room) return;
      if (info.playerId !== room.hostId) {
        socket.emit('room:error', { message: 'Только хост может использовать админ-панель' });
        return;
      }
      const result = adminReplaceAttribute(room, targetPlayerId, attributeType, io);
      if (!result.success) {
        socket.emit('room:error', { message: result.error });
      }
    });

    socket.on('admin:pause', () => {
      const info = socketRoomMap.get(socket.id);
      if (!info) return;
      const room = getRoom(info.roomCode);
      if (!room) return;
      if (info.playerId !== room.hostId) {
        socket.emit('room:error', { message: 'Только хост может ставить игру на паузу' });
        return;
      }
      const result = pauseGame(room, io);
      if (!result.success) {
        socket.emit('room:error', { message: result.error });
      }
    });

    socket.on('admin:unpause', () => {
      const info = socketRoomMap.get(socket.id);
      if (!info) return;
      const room = getRoom(info.roomCode);
      if (!room) return;
      if (info.playerId !== room.hostId) {
        socket.emit('room:error', { message: 'Только хост может снимать паузу' });
        return;
      }
      const result = unpauseGame(room, io);
      if (!result.success) {
        socket.emit('room:error', { message: result.error });
      }
    });

    socket.on('room:leave', () => {
      handleDisconnect(socket, io);
    });

    socket.on('disconnect', () => {
      console.log(`Disconnected: ${socket.id}`);
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
    if (room.gameState?.phase === 'ROUND_REVEAL' && player) {
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
  socket.leave(info.roomCode);
}
