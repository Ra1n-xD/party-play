import type { Socket } from "socket.io";
import type {
  ClientEvents,
  AnyPublicRoomDirectorySnapshot,
  GameId,
  PublicRoomCountsByGame,
  PublicRoomCountsSnapshot,
  PublicRoomDirectorySnapshot,
  PublicRoomSummary,
  ServerEvents,
} from "../../../shared/types.js";
import { serverGameRegistry, getServerGameModule } from "./gameRegistry.js";
import type { IOServer } from "./gameModule.js";
import { getAllRooms, type Room } from "./roomManager.js";

type IOSocket = Socket<ClientEvents, ServerEvents>;

const DIRECTORY_SOCKET_ROOM_PREFIX = "__partyplay_public_directory__:";
const roomDirectorySignatures = new WeakMap<Room, string>();
const broadcastStates = new WeakMap<IOServer, { scheduled: boolean; gameIds: Set<GameId> }>();

function directorySocketRoom(gameId: GameId): string {
  return `${DIRECTORY_SOCKET_ROOM_PREFIX}${gameId}`;
}

function occupiedSeatCount(room: Room): number {
  return Array.from(room.players.values()).filter((player) => !player.kicked).length;
}

function isPaused(room: Room): boolean {
  return room.pauseReasons.admin || room.pauseReasons.disconnectedSeatIds.size > 0;
}

function listingSortGroup(room: PublicRoomSummary<GameId>): number {
  if (room.lifecycle === "lobby" && room.playerCount < room.seatLimit) return 0;
  if (room.lifecycle === "lobby") return 1;
  if (room.lifecycle === "playing") return 2;
  return 3;
}

export function buildPublicRoomCountsSnapshot(now = Date.now()): PublicRoomCountsSnapshot {
  const counts = Object.fromEntries(
    Object.keys(serverGameRegistry).map((gameId) => [gameId, { activeRooms: 0, publicRooms: 0 }]),
  ) as PublicRoomCountsByGame;

  for (const room of getAllRooms().values()) {
    counts[room.gameId].activeRooms += 1;
    if (room.visibility === "public") counts[room.gameId].publicRooms += 1;
  }

  return { generatedAt: now, counts };
}

export function buildPublicRoomDirectory<G extends GameId>(
  gameId: G,
  now = Date.now(),
): PublicRoomDirectorySnapshot<G> {
  const module = getServerGameModule(gameId);
  const rooms: PublicRoomSummary<G>[] = [];

  if (module) {
    for (const candidate of getAllRooms().values()) {
      if (
        candidate.gameId !== gameId ||
        candidate.visibility !== "public" ||
        !candidate.publicRoomId
      ) {
        continue;
      }
      const publicRoomId = candidate.publicRoomId;
      const room = candidate as Room<G>;
      rooms.push({
        publicRoomId,
        gameId,
        lifecycle: room.lifecycle,
        paused: isPaused(room),
        createdAt: room.createdAt,
        updatedAt: room.directoryUpdatedAt,
        playerCount: occupiedSeatCount(room),
        seatLimit: room.seatLimit,
        spectatorCount: room.spectators.size,
        settings: module.publicRoomListingSettings(room),
      });
    }
  }

  rooms.sort((left, right) => {
    const groupDifference = listingSortGroup(left) - listingSortGroup(right);
    if (groupDifference !== 0) return groupDifference;
    if (listingSortGroup(left) === 0) return left.createdAt - right.createdAt;
    return right.updatedAt - left.updatedAt || left.createdAt - right.createdAt;
  });

  return { gameId, generatedAt: now, rooms };
}

function buildAnyPublicRoomDirectory(gameId: GameId): AnyPublicRoomDirectorySnapshot {
  switch (gameId) {
    case "bunker":
      return buildPublicRoomDirectory("bunker");
    case "durak":
      return buildPublicRoomDirectory("durak");
    case "uno":
      return buildPublicRoomDirectory("uno");
  }
}

export function getPublicRoomDirectorySignature(room: Room): string {
  if (room.visibility !== "public" || !room.publicRoomId) {
    return `private:${room.gameId}`;
  }
  const module = getServerGameModule(room.gameId);
  return JSON.stringify({
    publicRoomId: room.publicRoomId,
    lifecycle: room.lifecycle,
    paused: isPaused(room),
    playerCount: occupiedSeatCount(room),
    seatLimit: room.seatLimit,
    spectatorCount: room.spectators.size,
    settings: module?.publicRoomListingSettings(room) ?? null,
  });
}

export function schedulePublicRoomDirectoryBroadcast(io: IOServer, gameId: GameId): void {
  let state = broadcastStates.get(io);
  if (!state) {
    state = { scheduled: false, gameIds: new Set() };
    broadcastStates.set(io, state);
  }
  state.gameIds.add(gameId);
  if (state.scheduled) return;

  state.scheduled = true;
  queueMicrotask(() => {
    state!.scheduled = false;
    const gameIds = Array.from(state!.gameIds);
    state!.gameIds.clear();
    io.emit("publicRooms:counts", buildPublicRoomCountsSnapshot());
    for (const pendingGameId of gameIds) {
      io.to(directorySocketRoom(pendingGameId)).emit(
        "publicRooms:directory",
        buildAnyPublicRoomDirectory(pendingGameId),
      );
    }
  });
}

export function syncPublishedRoomWithPublicDirectory(room: Room, io: IOServer): void {
  const nextSignature = getPublicRoomDirectorySignature(room);
  if (roomDirectorySignatures.get(room) === nextSignature) return;
  roomDirectorySignatures.set(room, nextSignature);
  room.directoryUpdatedAt = Date.now();
  schedulePublicRoomDirectoryBroadcast(io, room.gameId);
}

export function forgetDisposedRoomFromPublicDirectory(room: Room, io: IOServer): void {
  roomDirectorySignatures.delete(room);
  schedulePublicRoomDirectoryBroadcast(io, room.gameId);
}

export function emitPublicRoomCounts(socket: IOSocket): void {
  socket.emit("publicRooms:counts", buildPublicRoomCountsSnapshot());
}

export function subscribeToPublicRoomDirectory(socket: IOSocket, gameId: GameId): void {
  for (const roomName of socket.rooms) {
    if (roomName.startsWith(DIRECTORY_SOCKET_ROOM_PREFIX)) socket.leave(roomName);
  }
  socket.join(directorySocketRoom(gameId));
  socket.emit("publicRooms:directory", buildAnyPublicRoomDirectory(gameId));
}

export function unsubscribeFromPublicRoomDirectory(socket: IOSocket, gameId?: GameId): void {
  const targetRoom = gameId ? directorySocketRoom(gameId) : null;
  for (const roomName of socket.rooms) {
    if (
      roomName.startsWith(DIRECTORY_SOCKET_ROOM_PREFIX) &&
      (!targetRoom || roomName === targetRoom)
    ) {
      socket.leave(roomName);
    }
  }
}

export function isValidPublicRoomId(value: unknown): value is string {
  return typeof value === "string" && /^r_[a-f0-9]{32}$/.test(value);
}
