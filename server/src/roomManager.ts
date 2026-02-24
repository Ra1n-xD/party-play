import { GamePhase, Catastrophe, Character, BunkerCard } from '../../shared/types.js';
import { generateRoomCode, generatePlayerId } from './utils.js';
import { CONFIG } from './config.js';

export interface Player {
  id: string;
  socketId: string;
  name: string;
  ready: boolean;
  connected: boolean;
  alive: boolean;
  isBot: boolean;
  character: Character | null;
  revealedIndices: number[];
  hasVoted: boolean;
  votedFor: string | null;
  actionUsed: boolean;
  immuneThisRound: boolean;
  doubleVoteThisRound: boolean;
}

export interface GameState {
  phase: GamePhase;
  roundNumber: number;
  catastrophe: Catastrophe;
  bunkerCards: BunkerCard[];         // All 5 bunker cards for this game
  revealedBunkerCount: number;       // How many bunker cards have been revealed
  bunkerCapacity: number;
  turnOrder: string[];
  currentTurnIndex: number;
  votes: Map<string, string>;
  eliminationOrder: string[];
  votingSchedule: number[];          // Number of votings per round [r1, r2, r3, r4, r5]
  currentVotingInRound: number;      // Which voting we're on in the current round (0-based)
  roundStarterIndex: number;         // Index in allPlayerIds of who starts each round
  lastEliminatedId: string | null;   // Last eliminated player (can vote)
  tiebreakCandidateIds: string[];    // Players tied in voting (for tiebreak)
  phaseTimer: ReturnType<typeof setTimeout> | null;
  phaseEndTime: number | null;
}

export interface Room {
  code: string;
  hostId: string;
  players: Map<string, Player>;
  gameState: GameState | null;
  allPlayerIds: string[];            // Original player order (for round rotation)
}

const rooms = new Map<string, Room>();

export function createRoom(socketId: string, playerName: string): { room: Room; player: Player } {
  let code: string;
  do {
    code = generateRoomCode();
  } while (rooms.has(code));

  const playerId = generatePlayerId();
  const player: Player = {
    id: playerId,
    socketId,
    name: playerName,
    ready: false,
    connected: true,
    alive: true,
    isBot: false,
    character: null,
    revealedIndices: [],
    hasVoted: false,
    votedFor: null,
    actionUsed: false,
    immuneThisRound: false,
    doubleVoteThisRound: false,
  };

  const room: Room = {
    code,
    hostId: playerId,
    players: new Map([[playerId, player]]),
    gameState: null,
    allPlayerIds: [playerId],
  };

  rooms.set(code, room);
  return { room, player };
}

export function joinRoom(roomCode: string, socketId: string, playerName: string): { room: Room; player: Player } | { error: string } {
  const room = rooms.get(roomCode);
  if (!room) return { error: 'Комната не найдена' };
  if (room.gameState && room.gameState.phase !== 'LOBBY') return { error: 'Игра уже началась' };
  if (room.players.size >= CONFIG.MAX_PLAYERS) return { error: 'Комната заполнена' };

  const playerId = generatePlayerId();
  const player: Player = {
    id: playerId,
    socketId,
    name: playerName,
    ready: false,
    connected: true,
    alive: true,
    isBot: false,
    character: null,
    revealedIndices: [],
    hasVoted: false,
    votedFor: null,
    actionUsed: false,
    immuneThisRound: false,
    doubleVoteThisRound: false,
  };

  room.players.set(playerId, player);
  room.allPlayerIds.push(playerId);
  return { room, player };
}

export function getRoom(code: string): Room | undefined {
  return rooms.get(code);
}

export function getRoomByPlayerId(playerId: string): Room | undefined {
  for (const room of rooms.values()) {
    if (room.players.has(playerId)) return room;
  }
  return undefined;
}

export function removePlayer(room: Room, playerId: string): void {
  room.players.delete(playerId);
  room.allPlayerIds = room.allPlayerIds.filter(id => id !== playerId);
  if (room.players.size === 0) {
    if (room.gameState?.phaseTimer) clearTimeout(room.gameState.phaseTimer);
    rooms.delete(room.code);
  } else if (room.hostId === playerId) {
    const firstPlayer = room.players.values().next().value;
    if (firstPlayer) room.hostId = firstPlayer.id;
  }
}

export function getAlivePlayers(room: Room): Player[] {
  return Array.from(room.players.values()).filter(p => p.alive);
}

export function getAllRooms(): Map<string, Room> {
  return rooms;
}

const BOT_NAMES = [
  'Алексей', 'Мария', 'Дмитрий', 'Елена', 'Сергей', 'Анна', 'Иван', 'Ольга',
  'Андрей', 'Наталья', 'Михаил', 'Екатерина', 'Павел', 'Татьяна', 'Николай',
  'Светлана', 'Владимир', 'Ирина', 'Артём', 'Юлия', 'Роман', 'Виктория',
  'Максим', 'Ксения', 'Денис', 'Марина', 'Кирилл', 'Дарья',
];

export function addBotToRoom(room: Room): Player | null {
  if (room.gameState && room.gameState.phase !== 'LOBBY') return null;
  if (room.players.size >= CONFIG.MAX_PLAYERS) return null;

  // Pick unused bot name
  const usedNames = new Set(Array.from(room.players.values()).map(p => p.name));
  const available = BOT_NAMES.filter(n => !usedNames.has(n));
  const name = available.length > 0
    ? available[Math.floor(Math.random() * available.length)]
    : `Бот ${room.players.size + 1}`;

  const playerId = generatePlayerId();
  const player: Player = {
    id: playerId,
    socketId: '',
    name,
    ready: true,
    connected: true,
    alive: true,
    isBot: true,
    character: null,
    revealedIndices: [],
    hasVoted: false,
    votedFor: null,
    actionUsed: false,
    immuneThisRound: false,
    doubleVoteThisRound: false,
  };

  room.players.set(playerId, player);
  room.allPlayerIds.push(playerId);
  return player;
}

export function removeBotFromRoom(room: Room, playerId: string): boolean {
  const player = room.players.get(playerId);
  if (!player || !player.isBot) return false;
  if (room.gameState && room.gameState.phase !== 'LOBBY') return false;

  room.players.delete(playerId);
  room.allPlayerIds = room.allPlayerIds.filter(id => id !== playerId);
  return true;
}
