import type {
  GameId,
  GamePrivateProjection,
  GamePublicProjection,
  GameSettings,
} from "./gameContract.js";

export type SeatId = string;
export type ParticipantId = string;
export type SpectatorId = string;
export type CommandId = string;
export type RoomRevision = number;

export type RoomLifecycle = "lobby" | "playing" | "results";

export interface PublicSeat {
  seatId: SeatId;
  name: string;
  occupantKind: "human" | "bot";
  controllerKind: "human" | "bot" | "none";
  temporaryBot: boolean;
  connected: boolean;
  ready: boolean;
  closed: boolean;
  isHost: boolean;
}

export interface RoomPause {
  active: boolean;
  admin: boolean;
  disconnectedSeatIds: SeatId[];
}

interface RoomSnapshotBase<G extends GameId> {
  roomCode: string;
  gameId: G;
  revision: RoomRevision;
  lifecycle: RoomLifecycle;
  hostSeatId: SeatId;
  seats: PublicSeat[];
  spectatorCount: number;
  pause: RoomPause;
  settings: GameSettings<G>;
  game: GamePublicProjection<G> | null;
}

export type RoomSnapshot<G extends GameId> =
  | (RoomSnapshotBase<G> & {
      viewer: {
        role: "player";
        participantId: ParticipantId;
        seatId: SeatId;
        privateGame: GamePrivateProjection<G> | null;
      };
    })
  | (RoomSnapshotBase<G> & {
      viewer: {
        role: "spectator";
        spectatorId: SpectatorId;
        privateGame: null;
      };
    });

export type AnyRoomSnapshot = {
  [G in GameId]: RoomSnapshot<G>;
}[GameId];

export type PlatformCommand<G extends GameId> =
  | { type: "seat:set-ready"; ready: boolean }
  | { type: "room:start" }
  | { type: "room:play-again" }
  | { type: "room:update-settings"; settings: GameSettings<G> }
  | { type: "room:add-bot" }
  | { type: "room:remove-bot"; seatId: SeatId }
  | { type: "room:assign-temporary-bot"; seatId: SeatId }
  | { type: "room:return-human-control"; seatId: SeatId }
  | { type: "room:exclude-seat"; seatId: SeatId }
  | { type: "room:transfer-host"; seatId: SeatId }
  | { type: "room:set-admin-pause"; paused: boolean }
  | { type: "room:resolve-seat-claim"; requestId: string; approved: boolean }
  | {
      type: "game";
      command: import("./gameContract.js").GameCommand<G>;
    };

export interface RoomCommandEnvelope<G extends GameId> {
  commandId: CommandId;
  gameId: G;
  expectedRevision: RoomRevision;
  command: PlatformCommand<G>;
}

export type AnyRoomCommandEnvelope = {
  [G in GameId]: RoomCommandEnvelope<G>;
}[GameId];

export type RoomCommandRejectionCode =
  | "WRONG_GAME"
  | "STALE_REVISION"
  | "FORBIDDEN"
  | "INVALID_COMMAND"
  | "PAUSED"
  | "CONFLICT";

export type RoomCommandResult =
  | {
      commandId: CommandId;
      status: "applied";
      revision: RoomRevision;
      duplicate: boolean;
    }
  | {
      commandId: CommandId;
      status: "rejected";
      revision: RoomRevision;
      code: RoomCommandRejectionCode;
      message: string;
    };
