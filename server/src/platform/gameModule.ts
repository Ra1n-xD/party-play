import type { Server } from "socket.io";
import type {
  ClientEvents,
  GameCommand,
  GameId,
  GamePrivateProjection,
  GamePublicProjection,
  GameSettings,
  PublicRoomListingSettings,
  RoomLifecycle,
  ServerEvents,
} from "../../../shared/types.js";
import type { Room } from "./roomManager.js";

export type IOServer = Server<ClientEvents, ServerEvents>;

export interface GameCommandExecution {
  success: boolean;
  error?: string;
  code?: "FORBIDDEN" | "INVALID_COMMAND" | "PAUSED" | "CONFLICT";
}

export type ControllerChangeKind = "disconnect" | "reconnect" | "temporary-bot" | "human-return";

export interface ServerGameModule<G extends GameId> {
  readonly id: G;
  readonly minSeats: number;
  readonly maxSeats: number;
  initialSettings(): GameSettings<G>;
  publicRoomListingSettings(room: Room<G>): PublicRoomListingSettings<G>;
  validateSettings(value: unknown): value is GameSettings<G>;
  updateSettings(room: Room<G>, settings: GameSettings<G>, io: IOServer): GameCommandExecution;
  lifecycle(room: Room<G>): RoomLifecycle;
  parseCommand(value: unknown): GameCommand<G> | null;
  start(room: Room<G>, io: IOServer): GameCommandExecution;
  resetForReplay(room: Room<G>, io: IOServer): GameCommandExecution;
  executeCommand(
    room: Room<G>,
    actorSeatId: string,
    command: GameCommand<G>,
    io: IOServer,
  ): GameCommandExecution;
  publicProjection(room: Room<G>): GamePublicProjection<G>;
  privateProjection(room: Room<G>, seatId: string): GamePrivateProjection<G> | null;
  publish(room: Room<G>, io: IOServer): void;
  setAdminPause(
    room: Room<G>,
    paused: boolean,
    io: IOServer,
    shouldPublish?: boolean,
  ): GameCommandExecution;
  onControllerChanged(
    room: Room<G>,
    seatId: string,
    change: ControllerChangeKind,
    io: IOServer,
  ): void;
  excludeSeat(room: Room<G>, seatId: string, io: IOServer): GameCommandExecution;
  dispose(room: Room<G>): void;
}
