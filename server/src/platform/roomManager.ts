import {
  Character,
  type GameId,
  type GameSettings,
  type RoomVisibility,
  type RoomCommandResult,
  type RoomLifecycle,
} from "../../../shared/types.js";
import {
  generatePlayerId,
  generatePublicRoomId,
  generateRoomCode,
  generateSessionToken,
  randomPick,
} from "../utils.js";
import { CONFIG } from "../config.js";
import { AVATARS, DEFAULT_AVATAR_ID, type AvatarId } from "../../../shared/platform/avatars.js";
import type { CardSkinId } from "../../../shared/platform/cosmetics.js";
import { isDeploymentDraining } from "./deploymentState.js";

export interface Player {
  id: string;
  socketId: string;
  sessionToken: string;
  name: string;
  avatarId: AvatarId;
  profileKey: string | null;
  cardSkins: { durak: CardSkinId; uno: CardSkinId };
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
  kicked: boolean;
  voluntarilyLeft: boolean;
  owner:
    | {
        kind: "human";
        participantId: string;
        name: string;
        sessionToken: string;
      }
    | {
        kind: "bot";
        botId: string;
        name: string;
      };
  controller:
    | {
        kind: "human";
        participantId: string;
        socketId: string;
        epoch: number;
      }
    | {
        kind: "bot";
        temporary: boolean;
        epoch: number;
      }
    | {
        kind: "none";
        epoch: number;
      };
  temporaryBot: boolean;
}

export interface PendingSeatClaim {
  id: string;
  socketId: string;
  playerId: string;
  claimantName: string;
  createdAt: number;
  expiresAt: number;
}

export interface PlatformPauseReasons {
  admin: boolean;
  disconnectedSeatIds: Set<string>;
}

export interface ServerGameRuntimeById {}

export type ServerGameRuntime<G extends GameId> = G extends keyof ServerGameRuntimeById
  ? ServerGameRuntimeById[G]
  : unknown;

export interface Spectator {
  id: string;
  socketId: string;
  sessionToken: string;
  name: string;
  connected: boolean;
  profileKey: string | null;
}

export interface Room<G extends GameId = GameId> {
  code: string;
  readonly visibility: RoomVisibility;
  readonly publicRoomId: string | null;
  readonly createdAt: number;
  directoryUpdatedAt: number;
  readonly gameId: G;
  readonly seatLimit: number;
  settings: GameSettings<G>;
  lifecycle: RoomLifecycle;
  hostId: string;
  players: Map<string, Player>;
  spectators: Map<string, Spectator>;
  gameState: ServerGameRuntime<G> | null;
  pauseReasons: PlatformPauseReasons;
  allPlayerIds: string[]; // Original player order (for round rotation)
  startedPlayerCount: number | null;
  pendingSeatClaims: Map<string, PendingSeatClaim>;
  revision: number;
  processedCommands: Map<string, RoomCommandResult>;
  completedNaturally?: boolean;
}

const rooms = new Map<string, Room>();
const roomLastActivity = new Map<string, number>();
export type RoomDisposalReason = "empty" | "inactive" | "reset" | "deployment";
type RoomDisposalHandler = (room: Room, reason: RoomDisposalReason) => void;
const roomDisposalHandlers = new WeakMap<Room, RoomDisposalHandler>();

export function setRoomDisposalHandler(room: Room, handler: RoomDisposalHandler): void {
  roomDisposalHandlers.set(room, handler);
}

function disposeRoom(room: Room, reason: RoomDisposalReason): boolean {
  if (rooms.get(room.code) !== room) return false;
  roomDisposalHandlers.get(room)?.(room, reason);
  roomDisposalHandlers.delete(room);
  rooms.delete(room.code);
  roomLastActivity.delete(room.code);
  return true;
}

export function disposeRoomIfVacant(room: Room): boolean {
  const hasRetainedHumanSeat = Array.from(room.players.values()).some(
    (player) => player.owner.kind === "human" && !player.kicked && !player.voluntarilyLeft,
  );
  if (hasRetainedHumanSeat || room.spectators.size > 0) return false;
  return disposeRoom(room, "empty");
}

export function disposeRoomForDeployment(room: Room): boolean {
  return room.lifecycle !== "playing" && disposeRoom(room, "deployment");
}

export function disposeRoomsForDeployment(): number {
  let disposed = 0;
  for (const room of Array.from(rooms.values())) {
    if (disposeRoomForDeployment(room)) disposed++;
  }
  return disposed;
}

export function disposeInactiveRooms(now = Date.now()): number {
  let disposed = 0;
  for (const [code, lastActivity] of roomLastActivity.entries()) {
    if (now - lastActivity <= CONFIG.ROOM_INACTIVE_TTL) continue;
    const room = rooms.get(code);
    if (!room) {
      roomLastActivity.delete(code);
      continue;
    }
    if (isDeploymentDraining() && room.lifecycle === "playing") continue;
    const hasConnectedParticipant =
      Array.from(room.players.values()).some(
        (player) =>
          player.owner.kind === "human" && player.connected && player.controller.kind === "human",
      ) || Array.from(room.spectators.values()).some((spectator) => spectator.connected);
    if (hasConnectedParticipant) {
      roomLastActivity.set(code, now);
      continue;
    }
    if (disposeRoom(room, "inactive")) disposed++;
  }
  return disposed;
}

// Auto-cleanup inactive rooms every 5 minutes
const roomCleanupTimer = setInterval(
  () => {
    disposeInactiveRooms();
  },
  5 * 60 * 1000,
);
roomCleanupTimer.unref();

export function touchRoom(code: string): void {
  roomLastActivity.set(code, Date.now());
}

export function getRoomLastActivityForTests(code: string): number | undefined {
  return roomLastActivity.get(code);
}

export function createRoom(
  socketId: string,
  playerName: string,
): { room: Room<"bunker">; player: Player };
export function createRoom<G extends GameId>(
  socketId: string,
  playerName: string,
  gameId: G,
  settings: GameSettings<G>,
  seatLimit: number,
  visibility?: RoomVisibility,
): { room: Room<G>; player: Player };
export function createRoom<G extends GameId = "bunker">(
  socketId: string,
  playerName: string,
  gameId: G = "bunker" as G,
  settings: GameSettings<G> = null as GameSettings<G>,
  seatLimit = CONFIG.MAX_PLAYERS,
  visibility: RoomVisibility = "private",
): { room: Room<G>; player: Player } {
  let code: string;
  do {
    code = generateRoomCode();
  } while (rooms.has(code));

  const playerId = generatePlayerId();
  const sessionToken = generateSessionToken();
  const createdAt = Date.now();
  let publicRoomId: string | null = null;
  if (visibility === "public") {
    do {
      publicRoomId = generatePublicRoomId();
    } while (getRoomByPublicId(publicRoomId));
  }
  const player: Player = {
    id: playerId,
    socketId,
    sessionToken,
    name: playerName,
    avatarId: DEFAULT_AVATAR_ID,
    profileKey: null,
    cardSkins: { durak: "classic", uno: "classic" },
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
    kicked: false,
    voluntarilyLeft: false,
    owner: {
      kind: "human",
      participantId: playerId,
      name: playerName,
      sessionToken,
    },
    controller: {
      kind: "human",
      participantId: playerId,
      socketId,
      epoch: 0,
    },
    temporaryBot: false,
  };

  const room: Room<G> = {
    code,
    visibility,
    publicRoomId,
    createdAt,
    directoryUpdatedAt: createdAt,
    gameId,
    seatLimit,
    settings,
    lifecycle: "lobby",
    hostId: playerId,
    players: new Map([[playerId, player]]),
    spectators: new Map(),
    gameState: null,
    pauseReasons: {
      admin: false,
      disconnectedSeatIds: new Set(),
    },
    allPlayerIds: [playerId],
    startedPlayerCount: null,
    pendingSeatClaims: new Map(),
    revision: 0,
    processedCommands: new Map(),
  };

  rooms.set(code, room);
  touchRoom(code);
  return { room, player };
}

export const ACCOUNT_ALREADY_IN_ROOM =
  "Этот аккаунт уже находится в комнате. Вернитесь к открытой вкладке или переподключитесь к своему месту";

export function hasAccountInRoom(
  room: Room,
  profileKey: string | null,
  exceptId?: string,
): boolean {
  if (!profileKey) return false;
  return (
    [...room.players.values()].some(
      (player) =>
        player.id !== exceptId &&
        player.profileKey === profileKey &&
        !player.kicked &&
        !player.voluntarilyLeft,
    ) ||
    [...room.spectators.values()].some(
      (spectator) => spectator.id !== exceptId && spectator.profileKey === profileKey,
    )
  );
}

export function joinRoom(
  roomCode: string,
  socketId: string,
  playerName: string,
  maxSeats?: number,
  profileKey: string | null = null,
): { room: Room; player: Player } | { error: string } {
  const room = rooms.get(roomCode);
  if (!room) return { error: "Комната не найдена" };
  if (hasAccountInRoom(room, profileKey)) return { error: ACCOUNT_ALREADY_IN_ROOM };
  if (room.lifecycle !== "lobby") return { error: "Игра уже началась" };
  if (room.players.size >= (maxSeats ?? room.seatLimit)) return { error: "Комната заполнена" };

  const playerId = generatePlayerId();
  const sessionToken = generateSessionToken();
  const player: Player = {
    id: playerId,
    socketId,
    sessionToken,
    name: playerName,
    avatarId: DEFAULT_AVATAR_ID,
    profileKey,
    cardSkins: { durak: "classic", uno: "classic" },
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
    kicked: false,
    voluntarilyLeft: false,
    owner: {
      kind: "human",
      participantId: playerId,
      name: playerName,
      sessionToken,
    },
    controller: {
      kind: "human",
      participantId: playerId,
      socketId,
      epoch: 0,
    },
    temporaryBot: false,
  };

  room.players.set(playerId, player);
  room.allPlayerIds.push(playerId);
  touchRoom(roomCode);
  return { room, player };
}

export function getRoom(code: string): Room | undefined {
  return rooms.get(code);
}

export function getRoomByPublicId(publicRoomId: string): Room | undefined {
  for (const room of rooms.values()) {
    if (room.publicRoomId === publicRoomId) return room;
  }
  return undefined;
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
  if (disposeRoomIfVacant(room)) return;
  if (room.hostId === playerId) {
    const firstPlayer = room.players.values().next().value;
    if (firstPlayer) room.hostId = firstPlayer.id;
  }
  touchRoom(room.code);
}

export function getAlivePlayers(room: Room): Player[] {
  return Array.from(room.players.values()).filter((p) => p.alive);
}

export function getAllRooms(): Map<string, Room> {
  return rooms;
}

export function resetRoomManagerStateForTests(): void {
  for (const room of Array.from(rooms.values())) disposeRoom(room, "reset");
  roomLastActivity.clear();
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

export function addBotToRoom(room: Room, maxSeats = room.seatLimit): Player | null {
  if (room.lifecycle !== "lobby") return null;
  if (room.players.size >= maxSeats) return null;

  // Pick unused bot name
  const usedNames = new Set(Array.from(room.players.values()).map((p) => p.name));
  const available = BOT_NAMES.filter((n) => !usedNames.has(n));
  const name = available.length > 0 ? randomPick(available) : `Бот ${room.players.size + 1}`;

  const playerId = generatePlayerId();
  const player: Player = {
    id: playerId,
    socketId: "",
    sessionToken: "",
    name,
    avatarId: AVATARS[room.players.size % AVATARS.length].id,
    profileKey: null,
    cardSkins: { durak: "classic", uno: "classic" },
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
    kicked: false,
    voluntarilyLeft: false,
    owner: {
      kind: "bot",
      botId: playerId,
      name,
    },
    controller: {
      kind: "bot",
      temporary: false,
      epoch: 0,
    },
    temporaryBot: false,
  };

  room.players.set(playerId, player);
  room.allPlayerIds.push(playerId);
  touchRoom(room.code);
  return player;
}

export function removeBotFromRoom(room: Room, playerId: string): boolean {
  const player = room.players.get(playerId);
  if (!player || !player.isBot) return false;
  if (room.lifecycle !== "lobby") return false;

  room.players.delete(playerId);
  room.allPlayerIds = room.allPlayerIds.filter((id) => id !== playerId);
  touchRoom(room.code);
  return true;
}

export function joinRoomAsSpectator(
  roomCode: string,
  socketId: string,
  spectatorName: string,
  profileKey: string | null = null,
): { room: Room; spectator: Spectator } | { error: string } {
  const room = rooms.get(roomCode);
  if (!room) return { error: "Комната не найдена" };
  if (hasAccountInRoom(room, profileKey)) return { error: ACCOUNT_ALREADY_IN_ROOM };
  if (room.spectators.size >= CONFIG.MAX_SPECTATORS_PER_ROOM)
    return { error: "Слишком много зрителей" };

  const spectatorId = generatePlayerId();
  const spectator: Spectator = {
    id: spectatorId,
    socketId,
    sessionToken: generateSessionToken(),
    name: spectatorName,
    connected: true,
    profileKey,
  };

  room.spectators.set(spectatorId, spectator);
  touchRoom(roomCode);
  return { room, spectator };
}

export function removeSpectator(room: Room, spectatorId: string): void {
  if (!room.spectators.delete(spectatorId)) return;
  if (!disposeRoomIfVacant(room)) touchRoom(room.code);
}

export function getRoomBySpectatorId(spectatorId: string): Room | undefined {
  for (const room of rooms.values()) {
    if (room.spectators.has(spectatorId)) return room;
  }
  return undefined;
}
