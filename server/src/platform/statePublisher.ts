import type { AnyRoomSnapshot, GameId, PublicSeat, RoomSnapshot } from "../../../shared/types.js";
import type { IOServer, ServerGameModule } from "./gameModule.js";
import { getRoom, type Room } from "./roomManager.js";
import { profileStore } from "./profileStorage.js";
import { petStatus } from "../../../shared/platform/pet.js";

type SnapshotProjector<G extends GameId> = Pick<
  ServerGameModule<G>,
  "lifecycle" | "publicProjection" | "privateProjection"
>;

type RoomPublishedHook = (room: Room, io: IOServer) => void;
let roomPublishedHook: RoomPublishedHook = () => {};
let roomPreparingHook: (room: Room) => void = () => {};
const petDeadlines = new WeakMap<Room, { at: number; timer: NodeJS.Timeout }>();

export function clearRoomPetExpiry(room: Room): void {
  const deadline = petDeadlines.get(room);
  if (deadline) clearTimeout(deadline.timer);
  petDeadlines.delete(room);
}

function seatPet(room: Room, seatId: string, now: number) {
  const player = room.players.get(seatId);
  if (!player || player.owner.kind !== "human" || player.kicked || player.voluntarilyLeft)
    return null;
  const pet = player.profileKey ? profileStore.profiles.get(player.profileKey)?.pet : null;
  return pet && petStatus(pet, now).alive ? pet : null;
}

/** Remove expired companions even when an idle room has no game commands. */
function schedulePetExpiry<G extends GameId>(
  room: Room<G>,
  io: IOServer,
  module: SnapshotProjector<G>,
  now: number,
) {
  const expiry = room.allPlayerIds.reduce((earliest, id) => {
    const pet = seatPet(room, id, now);
    return pet ? Math.min(earliest, petStatus(pet, now).expiresAt) : earliest;
  }, Infinity);
  const previous = petDeadlines.get(room);
  if (previous?.at === expiry) return;
  clearRoomPetExpiry(room);
  if (!Number.isFinite(expiry)) return;
  const roomCode = room.code;
  const timer = setTimeout(
    () => {
      const current = getRoom(roomCode);
      if (!current || petDeadlines.get(current)?.timer !== timer) return;
      petDeadlines.delete(current);
      publishRoomSnapshots(current as Room<G>, io, module);
    },
    Math.max(1, expiry - now),
  );
  timer.unref();
  petDeadlines.set(room, { at: expiry, timer });
}

export function setRoomPreparingHook(hook: (room: Room) => void): void {
  roomPreparingHook = hook;
}

export function setRoomPublishedHook(hook: RoomPublishedHook): void {
  roomPublishedHook = hook;
}

function buildPublicSeat(room: Room, seatId: string, now: number): PublicSeat | null {
  const player = room.players.get(seatId);
  if (!player) return null;
  const pet = seatPet(room, seatId, now);
  return {
    seatId: player.id,
    name: player.owner.name,
    avatarId: player.avatarId,
    cardSkins: player.cardSkins,
    pet: pet ? { species: pet.species, stage: petStatus(pet, now).stage } : null,
    occupantKind: player.owner.kind,
    controllerKind: player.controller.kind,
    temporaryBot: player.temporaryBot,
    connected: player.controller.kind !== "none",
    ready: player.ready,
    closed: player.kicked,
    isHost: player.id === room.hostId,
  };
}

function snapshotBase<G extends GameId>(room: Room<G>, module: SnapshotProjector<G>, now: number) {
  const disconnectedSeatIds = Array.from(room.pauseReasons.disconnectedSeatIds);
  return {
    roomCode: room.code,
    gameId: room.gameId,
    revision: room.revision,
    lifecycle: module.lifecycle(room),
    hostSeatId: room.hostId,
    seats: room.allPlayerIds
      .map((seatId) => buildPublicSeat(room, seatId, now))
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
  roomPreparingHook(room);
  const now = Date.now();
  const base = snapshotBase(room, module, now);
  schedulePetExpiry(room, io, module, now);

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
