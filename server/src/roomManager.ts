import { GamePhase, Catastrophe, Character, BunkerCard, ThreatCard } from "../../shared/types.js";
import { generateRoomCode, generatePlayerId } from "./utils.js";
import { CONFIG } from "./config.js";

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
  immuneThisRound: boolean;
  actionCardRevealed: boolean;
}

export interface GameState {
  phase: GamePhase;
  roundNumber: number;
  catastrophe: Catastrophe;
  bunkerCards: BunkerCard[]; // All 5 bunker cards for this game
  revealedBunkerCount: number; // How many bunker cards have been revealed
  threatCard: ThreatCard | null; // Threat card revealed with the last bunker card
  bunkerCapacity: number;
  turnOrder: string[];
  currentTurnIndex: number;
  votes: Map<string, string>;
  eliminationOrder: string[];
  votingSchedule: number[]; // Number of votings per round [r1, r2, r3, r4, r5]
  currentVotingInRound: number; // Which voting we're on in the current round (0-based)
  roundStarterIndex: number; // Index in allPlayerIds of who starts each round
  lastEliminatedId: string | null; // Last eliminated player (can vote)
  tiebreakCandidateIds: string[]; // Players tied in voting (for tiebreak)
  phaseTimer: ReturnType<typeof setTimeout> | null;
  phaseEndTime: number | null;
  paused: boolean;
  pausedTimeRemaining: number | null;
  pausedCallback: (() => void) | null;
}

export interface Spectator {
  id: string;
  socketId: string;
  name: string;
  connected: boolean;
}

export interface Room {
  code: string;
  hostId: string;
  players: Map<string, Player>;
  spectators: Map<string, Spectator>;
  gameState: GameState | null;
  allPlayerIds: string[]; // Original player order (for round rotation)
}

const rooms = new Map<string, Room>();
const roomLastActivity = new Map<string, number>();

// Auto-cleanup inactive rooms every 5 minutes
setInterval(
  () => {
    const now = Date.now();
    for (const [code, lastActivity] of roomLastActivity.entries()) {
      if (now - lastActivity > CONFIG.ROOM_INACTIVE_TTL) {
        const room = rooms.get(code);
        if (room?.gameState?.phaseTimer) clearTimeout(room.gameState.phaseTimer);
        rooms.delete(code);
        roomLastActivity.delete(code);
      }
    }
  },
  5 * 60 * 1000,
);

export function touchRoom(code: string): void {
  roomLastActivity.set(code, Date.now());
}

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
    immuneThisRound: false,
    actionCardRevealed: false,
  };

  const room: Room = {
    code,
    hostId: playerId,
    players: new Map([[playerId, player]]),
    spectators: new Map(),
    gameState: null,
    allPlayerIds: [playerId],
  };

  rooms.set(code, room);
  touchRoom(code);
  return { room, player };
}

export function joinRoom(
  roomCode: string,
  socketId: string,
  playerName: string,
): { room: Room; player: Player } | { error: string } {
  const room = rooms.get(roomCode);
  if (!room) return { error: "Комната не найдена" };
  if (room.gameState && room.gameState.phase !== "LOBBY") return { error: "Игра уже началась" };
  if (room.players.size >= CONFIG.MAX_PLAYERS) return { error: "Комната заполнена" };

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
    immuneThisRound: false,
    actionCardRevealed: false,
  };

  room.players.set(playerId, player);
  room.allPlayerIds.push(playerId);
  touchRoom(roomCode);
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
  room.allPlayerIds = room.allPlayerIds.filter((id) => id !== playerId);
  if (room.players.size === 0) {
    if (room.gameState?.phaseTimer) clearTimeout(room.gameState.phaseTimer);
    rooms.delete(room.code);
    roomLastActivity.delete(room.code);
  } else if (room.hostId === playerId) {
    const firstPlayer = room.players.values().next().value;
    if (firstPlayer) room.hostId = firstPlayer.id;
  }
}

export function getAlivePlayers(room: Room): Player[] {
  return Array.from(room.players.values()).filter((p) => p.alive);
}

export function getAllRooms(): Map<string, Room> {
  return rooms;
}

const BOT_NAMES = [
  "Алексей",
  "Мария",
  "Дмитрий",
  "Елена",
  "Сергей",
  "Анна",
  "Иван",
  "Ольга",
  "Андрей",
  "Наталья",
  "Михаил",
  "Екатерина",
  "Павел",
  "Татьяна",
  "Николай",
  "Светлана",
  "Владимир",
  "Ирина",
  "Артём",
  "Юлия",
  "Роман",
  "Виктория",
  "Максим",
  "Ксения",
  "Денис",
  "Марина",
  "Кирилл",
  "Дарья",
];

export function addBotToRoom(room: Room): Player | null {
  if (room.gameState && room.gameState.phase !== "LOBBY") return null;
  if (room.players.size >= CONFIG.MAX_PLAYERS) return null;

  // Pick unused bot name
  const usedNames = new Set(Array.from(room.players.values()).map((p) => p.name));
  const available = BOT_NAMES.filter((n) => !usedNames.has(n));
  const name =
    available.length > 0
      ? available[Math.floor(Math.random() * available.length)]
      : `Бот ${room.players.size + 1}`;

  const playerId = generatePlayerId();
  const player: Player = {
    id: playerId,
    socketId: "",
    name,
    ready: true,
    connected: true,
    alive: true,
    isBot: true,
    character: null,
    revealedIndices: [],
    hasVoted: false,
    votedFor: null,
    immuneThisRound: false,
    actionCardRevealed: false,
  };

  room.players.set(playerId, player);
  room.allPlayerIds.push(playerId);
  return player;
}

export function removeBotFromRoom(room: Room, playerId: string): boolean {
  const player = room.players.get(playerId);
  if (!player || !player.isBot) return false;
  if (room.gameState && room.gameState.phase !== "LOBBY") return false;

  room.players.delete(playerId);
  room.allPlayerIds = room.allPlayerIds.filter((id) => id !== playerId);
  return true;
}

export function joinRoomAsSpectator(
  roomCode: string,
  socketId: string,
  spectatorName: string,
): { room: Room; spectator: Spectator } | { error: string } {
  const room = rooms.get(roomCode);
  if (!room) return { error: "Комната не найдена" };

  const spectatorId = generatePlayerId();
  const spectator: Spectator = {
    id: spectatorId,
    socketId,
    name: spectatorName,
    connected: true,
  };

  room.spectators.set(spectatorId, spectator);
  touchRoom(roomCode);
  return { room, spectator };
}

export function removeSpectator(room: Room, spectatorId: string): void {
  room.spectators.delete(spectatorId);
}

export function getRoomBySpectatorId(spectatorId: string): Room | undefined {
  for (const room of rooms.values()) {
    if (room.spectators.has(spectatorId)) return room;
  }
  return undefined;
}
