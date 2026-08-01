import type { GameId } from "./gameContract.js";
import type { RoomLifecycle } from "./room.js";

export const PUBLIC_ROOM_SPECTATOR_LIMIT = 20;

export type RoomVisibility = "private" | "public";

export interface PublicRoomListingSettingsById {
  bunker: null;
  durak: {
    turnTimeoutSeconds: null | 30 | 60 | 90;
  };
  uno: {
    turnTimeoutSeconds: null | 30 | 60 | 90;
  };
}

export type PublicRoomListingSettings<G extends GameId> = PublicRoomListingSettingsById[G];

export interface PublicRoomGameCounts {
  activeRooms: number;
  publicRooms: number;
}

export type PublicRoomCountsByGame = {
  [G in GameId]: PublicRoomGameCounts;
};

export interface PublicRoomCountsSnapshot {
  generatedAt: number;
  counts: PublicRoomCountsByGame;
}

export interface PublicRoomSummary<G extends GameId> {
  publicRoomId: string;
  gameId: G;
  lifecycle: RoomLifecycle;
  paused: boolean;
  createdAt: number;
  updatedAt: number;
  playerCount: number;
  seatLimit: number;
  spectatorCount: number;
  settings: PublicRoomListingSettings<G>;
}

export interface PublicRoomDirectorySnapshot<G extends GameId> {
  gameId: G;
  generatedAt: number;
  rooms: PublicRoomSummary<G>[];
}

export type AnyPublicRoomDirectorySnapshot = {
  [G in GameId]: PublicRoomDirectorySnapshot<G>;
}[GameId];

export type PublicRoomErrorCode =
  | "INVALID_REQUEST"
  | "RATE_LIMITED"
  | "ALREADY_IN_ROOM"
  | "ROOM_NOT_FOUND"
  | "ROOM_CLOSED"
  | "GAME_STARTED"
  | "ROOM_FULL"
  | "SPECTATOR_LIMIT"
  | "GAME_UNAVAILABLE";

export interface PublicRoomErrorPayload {
  code: PublicRoomErrorCode;
  message: string;
  gameId?: GameId;
}
