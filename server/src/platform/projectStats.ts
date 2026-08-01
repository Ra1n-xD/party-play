import { createHash } from "crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { basename, dirname, resolve } from "path";
import type { Socket } from "socket.io";
import type {
  ClientEvents,
  GameId,
  ProjectGameStats,
  ProjectStatsByGame,
  ProjectStatsLive,
  ProjectStatsSnapshot,
  ProjectStatsTotals,
  RoomLifecycle,
  ServerEvents,
} from "../../../shared/types.js";
import { serverGameRegistry } from "./gameRegistry.js";
import type { IOServer } from "./gameModule.js";
import { getAllRooms, type Room } from "./roomManager.js";

type IOSocket = Socket<ClientEvents, ServerEvents>;

interface MutableTotals {
  uniquePlayerDeviceIds: Set<string>;
  playerEntries: number;
  spectatorEntries: number;
  roomsCreated: number;
  publicRoomsCreated: number;
  gamesStarted: number;
  gamesCompleted: number;
}

interface MutableProjectStats {
  trackingStartedAt: number;
  updatedAt: number;
  totals: MutableTotals;
  byGame: Record<GameId, MutableTotals>;
}

interface StoredTotals extends Omit<MutableTotals, "uniquePlayerDeviceIds"> {
  uniquePlayerDeviceIds: string[];
}

interface StoredProjectStats {
  version: 1;
  trackingStartedAt: number;
  updatedAt: number;
  totals: StoredTotals;
  byGame: Record<GameId, StoredTotals>;
}

const STATS_SOCKET_ROOM = "__partyplay_project_stats__";
const ANALYTICS_ID_PATTERN = /^a_[a-f0-9]{32}$/;
const ANALYTICS_HASH_PATTERN = /^[a-f0-9]{64}$/;
const GAME_IDS = Object.keys(serverGameRegistry) as GameId[];
// Workspace scripts run from `server/`, while direct root launches use the repository cwd.
const defaultStatsStoragePath =
  basename(process.cwd()) === "server"
    ? resolve(process.cwd(), ".data/project-stats.json")
    : resolve(process.cwd(), "server/.data/project-stats.json");
const statsStoragePath = process.env.PARTYPLAY_STATS_FILE?.trim()
  ? resolve(process.env.PARTYPLAY_STATS_FILE.trim())
  : defaultStatsStoragePath;
const observedRoomLifecycles = new WeakMap<Room, RoomLifecycle>();
const observedRoomSignatures = new WeakMap<Room, string>();
const broadcastStates = new WeakMap<IOServer, { scheduled: boolean }>();
let persistenceWarningShown = false;

function createMutableTotals(): MutableTotals {
  return {
    uniquePlayerDeviceIds: new Set(),
    playerEntries: 0,
    spectatorEntries: 0,
    roomsCreated: 0,
    publicRoomsCreated: 0,
    gamesStarted: 0,
    gamesCompleted: 0,
  };
}

function createByGame<T>(factory: () => T): Record<GameId, T> {
  const result = {} as Record<GameId, T>;
  for (const gameId of GAME_IDS) result[gameId] = factory();
  return result;
}

function createEmptyState(now = Date.now()): MutableProjectStats {
  return {
    trackingStartedAt: now,
    updatedAt: now,
    totals: createMutableTotals(),
    byGame: createByGame(createMutableTotals),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeTimestamp(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function safeCounter(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function parseStoredTotals(value: unknown): MutableTotals {
  const record = isRecord(value) ? value : {};
  const hashes = Array.isArray(record.uniquePlayerDeviceIds)
    ? record.uniquePlayerDeviceIds.filter(
        (item): item is string => typeof item === "string" && ANALYTICS_HASH_PATTERN.test(item),
      )
    : [];
  return {
    uniquePlayerDeviceIds: new Set(hashes),
    playerEntries: safeCounter(record.playerEntries),
    spectatorEntries: safeCounter(record.spectatorEntries),
    roomsCreated: safeCounter(record.roomsCreated),
    publicRoomsCreated: safeCounter(record.publicRoomsCreated),
    gamesStarted: safeCounter(record.gamesStarted),
    gamesCompleted: safeCounter(record.gamesCompleted),
  };
}

function loadState(): MutableProjectStats {
  const fallback = createEmptyState();
  try {
    const parsed: unknown = JSON.parse(readFileSync(statsStoragePath, "utf8"));
    if (!isRecord(parsed) || parsed.version !== 1) return fallback;
    const byGameRecord = isRecord(parsed.byGame) ? parsed.byGame : {};
    const byGame = createByGame(() => createMutableTotals());
    for (const gameId of GAME_IDS) byGame[gameId] = parseStoredTotals(byGameRecord[gameId]);
    return {
      trackingStartedAt: safeTimestamp(parsed.trackingStartedAt, fallback.trackingStartedAt),
      updatedAt: safeTimestamp(parsed.updatedAt, fallback.updatedAt),
      totals: parseStoredTotals(parsed.totals),
      byGame,
    };
  } catch (error) {
    const code = isRecord(error) && typeof error.code === "string" ? error.code : null;
    if (code !== "ENOENT") {
      console.warn("Project statistics storage could not be read; using empty aggregates.");
    }
    return fallback;
  }
}

const statsState = loadState();

function serializeTotals(totals: MutableTotals): StoredTotals {
  return {
    uniquePlayerDeviceIds: Array.from(totals.uniquePlayerDeviceIds),
    playerEntries: totals.playerEntries,
    spectatorEntries: totals.spectatorEntries,
    roomsCreated: totals.roomsCreated,
    publicRoomsCreated: totals.publicRoomsCreated,
    gamesStarted: totals.gamesStarted,
    gamesCompleted: totals.gamesCompleted,
  };
}

function persistState(): void {
  const stored: StoredProjectStats = {
    version: 1,
    trackingStartedAt: statsState.trackingStartedAt,
    updatedAt: statsState.updatedAt,
    totals: serializeTotals(statsState.totals),
    byGame: createByGame(() => serializeTotals(createMutableTotals())),
  };
  for (const gameId of GAME_IDS) stored.byGame[gameId] = serializeTotals(statsState.byGame[gameId]);

  const temporaryPath = `${statsStoragePath}.${process.pid}.tmp`;
  try {
    mkdirSync(dirname(statsStoragePath), { recursive: true, mode: 0o700 });
    writeFileSync(temporaryPath, `${JSON.stringify(stored, null, 2)}\n`, { mode: 0o600 });
    renameSync(temporaryPath, statsStoragePath);
    persistenceWarningShown = false;
  } catch {
    if (!persistenceWarningShown) {
      persistenceWarningShown = true;
      console.warn("Project statistics could not be persisted; gameplay continues in memory.");
    }
  }
}

function publicTotals(totals: MutableTotals): ProjectStatsTotals {
  return {
    uniquePlayerDevices: totals.uniquePlayerDeviceIds.size,
    playerEntries: totals.playerEntries,
    spectatorEntries: totals.spectatorEntries,
    roomsCreated: totals.roomsCreated,
    publicRoomsCreated: totals.publicRoomsCreated,
    gamesStarted: totals.gamesStarted,
    gamesCompleted: totals.gamesCompleted,
  };
}

function createLiveTotals(): ProjectStatsLive {
  return {
    rooms: 0,
    publicRooms: 0,
    connectedPlayers: 0,
    connectedSpectators: 0,
  };
}

function buildLiveStats(): { totals: ProjectStatsLive; byGame: Record<GameId, ProjectStatsLive> } {
  const totals = createLiveTotals();
  const byGame = createByGame(createLiveTotals);
  for (const room of getAllRooms().values()) {
    const game = byGame[room.gameId];
    totals.rooms += 1;
    game.rooms += 1;
    if (room.visibility === "public") {
      totals.publicRooms += 1;
      game.publicRooms += 1;
    }
    for (const player of room.players.values()) {
      if (
        player.kicked ||
        player.owner.kind !== "human" ||
        !player.connected ||
        player.controller.kind !== "human"
      ) {
        continue;
      }
      totals.connectedPlayers += 1;
      game.connectedPlayers += 1;
    }
    for (const spectator of room.spectators.values()) {
      if (!spectator.connected) continue;
      totals.connectedSpectators += 1;
      game.connectedSpectators += 1;
    }
  }
  return { totals, byGame };
}

export function buildProjectStatsSnapshot(now = Date.now()): ProjectStatsSnapshot {
  const live = buildLiveStats();
  const byGame = {} as ProjectStatsByGame;
  for (const gameId of GAME_IDS) {
    const game: ProjectGameStats = {
      totals: publicTotals(statsState.byGame[gameId]),
      live: live.byGame[gameId],
    };
    byGame[gameId] = game;
  }
  return {
    trackingStartedAt: statsState.trackingStartedAt,
    generatedAt: now,
    totals: publicTotals(statsState.totals),
    live: live.totals,
    byGame,
  };
}

function scheduleStatsBroadcast(io: IOServer): void {
  let state = broadcastStates.get(io);
  if (!state) {
    state = { scheduled: false };
    broadcastStates.set(io, state);
  }
  if (state.scheduled) return;
  state.scheduled = true;
  queueMicrotask(() => {
    state!.scheduled = false;
    io.to(STATS_SOCKET_ROOM).emit("stats:snapshot", buildProjectStatsSnapshot());
  });
}

function recordMutation(io: IOServer, mutate: () => void): void {
  mutate();
  statsState.updatedAt = Date.now();
  persistState();
  scheduleStatsBroadcast(io);
}

function hashedAnalyticsId(analyticsId: string | null): string | null {
  if (!analyticsId || !ANALYTICS_ID_PATTERN.test(analyticsId)) return null;
  return createHash("sha256").update(analyticsId).digest("hex");
}

function recordPlayerDevice(gameId: GameId, analyticsId: string | null): void {
  const hash = hashedAnalyticsId(analyticsId);
  if (!hash) return;
  statsState.totals.uniquePlayerDeviceIds.add(hash);
  statsState.byGame[gameId].uniquePlayerDeviceIds.add(hash);
}

export function getSocketAnalyticsId(socket: IOSocket): string | null {
  const analyticsId = socket.handshake.auth?.analyticsId;
  return typeof analyticsId === "string" && ANALYTICS_ID_PATTERN.test(analyticsId)
    ? analyticsId
    : null;
}

export function recordRoomCreated(room: Room, analyticsId: string | null, io: IOServer): void {
  recordMutation(io, () => {
    statsState.totals.roomsCreated += 1;
    statsState.byGame[room.gameId].roomsCreated += 1;
    if (room.visibility === "public") {
      statsState.totals.publicRoomsCreated += 1;
      statsState.byGame[room.gameId].publicRoomsCreated += 1;
    }
    statsState.totals.playerEntries += 1;
    statsState.byGame[room.gameId].playerEntries += 1;
    recordPlayerDevice(room.gameId, analyticsId);
  });
}

export function recordPlayerEntry(gameId: GameId, analyticsId: string | null, io: IOServer): void {
  recordMutation(io, () => {
    statsState.totals.playerEntries += 1;
    statsState.byGame[gameId].playerEntries += 1;
    recordPlayerDevice(gameId, analyticsId);
  });
}

export function recordSpectatorEntry(gameId: GameId, io: IOServer): void {
  recordMutation(io, () => {
    statsState.totals.spectatorEntries += 1;
    statsState.byGame[gameId].spectatorEntries += 1;
  });
}

function roomLiveSignature(room: Room): string {
  const connectedPlayers = Array.from(room.players.values()).filter(
    (player) =>
      !player.kicked &&
      player.owner.kind === "human" &&
      player.connected &&
      player.controller.kind === "human",
  ).length;
  const connectedSpectators = Array.from(room.spectators.values()).filter(
    (spectator) => spectator.connected,
  ).length;
  return `${room.lifecycle}:${connectedPlayers}:${connectedSpectators}`;
}

export function syncPublishedRoomWithProjectStats(room: Room, io: IOServer): void {
  const previousLifecycle = observedRoomLifecycles.get(room);
  const nextLifecycle = room.lifecycle;
  observedRoomLifecycles.set(room, nextLifecycle);

  if (previousLifecycle && previousLifecycle !== nextLifecycle) {
    if (nextLifecycle === "playing") {
      recordMutation(io, () => {
        statsState.totals.gamesStarted += 1;
        statsState.byGame[room.gameId].gamesStarted += 1;
      });
    } else if (nextLifecycle === "results") {
      recordMutation(io, () => {
        statsState.totals.gamesCompleted += 1;
        statsState.byGame[room.gameId].gamesCompleted += 1;
      });
    }
  }

  const signature = roomLiveSignature(room);
  if (observedRoomSignatures.get(room) === signature) return;
  observedRoomSignatures.set(room, signature);
  scheduleStatsBroadcast(io);
}

export function forgetDisposedRoomFromProjectStats(room: Room, io: IOServer): void {
  observedRoomLifecycles.delete(room);
  observedRoomSignatures.delete(room);
  scheduleStatsBroadcast(io);
}

export function subscribeToProjectStats(socket: IOSocket): void {
  socket.join(STATS_SOCKET_ROOM);
  socket.emit("stats:snapshot", buildProjectStatsSnapshot());
}

export function unsubscribeFromProjectStats(socket: IOSocket): void {
  socket.leave(STATS_SOCKET_ROOM);
}
