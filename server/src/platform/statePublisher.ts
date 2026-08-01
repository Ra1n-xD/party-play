import type { AnyRoomSnapshot, GameId, PublicSeat, RoomSnapshot } from "../../../shared/types.js";
import type { IOServer, ServerGameModule } from "./gameModule.js";
import type { Room } from "./roomManager.js";

type SnapshotProjector<G extends GameId> = Pick<
  ServerGameModule<G>,
  "lifecycle" | "publicProjection" | "privateProjection"
>;

type RoomPublishedHook = (room: Room, io: IOServer) => void;
let roomPublishedHook: RoomPublishedHook = () => {};

export function setRoomPublishedHook(hook: RoomPublishedHook): void {
  roomPublishedHook = hook;
}

function buildPublicSeat(room: Room, seatId: string): PublicSeat | null {
  const player = room.players.get(seatId);
  if (!player) return null;
  return {
    seatId: player.id,
    name: player.owner.name,
    occupantKind: player.owner.kind,
    controllerKind: player.controller.kind,
    temporaryBot: player.temporaryBot,
    connected: player.controller.kind !== "none",
    ready: player.ready,
    closed: player.kicked,
    isHost: player.id === room.hostId,
  };
}

function snapshotBase<G extends GameId>(room: Room<G>, module: SnapshotProjector<G>) {
  const disconnectedSeatIds = Array.from(room.pauseReasons.disconnectedSeatIds);
  return {
    roomCode: room.code,
    gameId: room.gameId,
    revision: room.revision,
    lifecycle: module.lifecycle(room),
    hostSeatId: room.hostId,
    seats: room.allPlayerIds
      .map((seatId) => buildPublicSeat(room, seatId))
      .filter((seat): seat is PublicSeat => seat !== null),
    spectatorCount: room.spectators.size,
    pause: {
      active: room.pauseReasons.admin || disconnectedSeatIds.length > 0,
      admin: room.pauseReasons.admin,
      disconnectedSeatIds,
    },
    settings: room.settings,
    game: module.publicProjection(room),
  };
}

export function publishRoomSnapshots<G extends GameId>(
  room: Room<G>,
  io: IOServer,
  module: SnapshotProjector<G>,
): void {
  const base = snapshotBase(room, module);

  for (const player of room.players.values()) {
    if (
      player.kicked ||
      player.owner.kind !== "human" ||
      player.controller.kind !== "human" ||
      !player.socketId
    ) {
      continue;
    }
    const snapshot: RoomSnapshot<G> = {
      ...base,
      viewer: {
        role: "player",
        participantId: player.owner.participantId,
        seatId: player.id,
        privateGame: module.privateProjection(room, player.id),
      },
    };
    io.to(player.socketId).emit("room:snapshot", snapshot as AnyRoomSnapshot);
  }

  for (const spectator of room.spectators.values()) {
    if (!spectator.connected || !spectator.socketId) continue;
    const snapshot: RoomSnapshot<G> = {
      ...base,
      viewer: {
        role: "spectator",
        spectatorId: spectator.id,
        privateGame: null,
      },
    };
    io.to(spectator.socketId).emit("room:snapshot", snapshot as AnyRoomSnapshot);
  }

  roomPublishedHook(room, io);
}
