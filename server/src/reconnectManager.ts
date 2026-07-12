import type { Server } from "socket.io";
import type { ClientEvents, ReconnectErrorCode, ServerEvents } from "../../shared/types.js";
import { addDisconnectPause, broadcastState } from "./gameEngine.js";
import { getAllRooms, type Player, type Room, type Spectator } from "./roomManager.js";

type IOServer = Server<ClientEvents, ServerEvents>;

export type BindPlayerSocketResult =
  | { ok: true; previousSocketId: string }
  | {
      ok: false;
      error: string;
      code: Extract<ReconnectErrorCode, "SEAT_CLOSED" | "SEAT_ALREADY_CONNECTED">;
    };

export function isCurrentSocketOwner(player: Player, socketId: string): boolean {
  return player.socketId === socketId;
}

export function bindPlayerSocket(
  player: Player,
  socketId: string,
  releasePreviousOwner: (previousSocketId: string) => void = () => {},
): BindPlayerSocketResult {
  if (player.kicked) {
    return { ok: false, error: "Место закрыто", code: "SEAT_CLOSED" };
  }
  if (player.connected && player.socketId !== socketId) {
    return {
      ok: false,
      error: "Место уже подключено",
      code: "SEAT_ALREADY_CONNECTED",
    };
  }

  const previousSocketId = player.socketId;
  if (previousSocketId && previousSocketId !== socketId) {
    releasePreviousOwner(previousSocketId);
  }
  player.socketId = socketId;
  player.connected = true;
  return { ok: true, previousSocketId };
}

export type BindSpectatorSocketResult =
  | { ok: true; previousSocketId: string }
  | { ok: false; error: string };

export function bindSpectatorSocket(
  spectator: Spectator,
  socketId: string,
  releasePreviousOwner: (previousSocketId: string) => void = () => {},
): BindSpectatorSocketResult {
  if (spectator.connected && spectator.socketId !== socketId) {
    return { ok: false, error: "Место уже подключено" };
  }

  const previousSocketId = spectator.socketId;
  if (previousSocketId && previousSocketId !== socketId) {
    releasePreviousOwner(previousSocketId);
  }
  spectator.socketId = socketId;
  spectator.connected = true;
  return { ok: true, previousSocketId };
}

export function markPlayerDisconnected(
  room: Room,
  playerId: string,
  socketId: string,
  io: IOServer,
): boolean {
  const player = room.players.get(playerId);
  if (
    !player ||
    player.isBot ||
    player.kicked ||
    !player.connected ||
    !isCurrentSocketOwner(player, socketId)
  ) {
    return false;
  }

  player.connected = false;
  const activePhase =
    room.gameState && room.gameState.phase !== "LOBBY" && room.gameState.phase !== "GAME_OVER";
  if (activePhase) {
    addDisconnectPause(room, player.id, io);
  } else {
    broadcastState(room, io);
  }
  return true;
}

export function cancelClaimsForPlayer(
  room: Room,
  playerId: string,
  io?: IOServer,
  message = "Владелец места вернулся",
): number {
  let removed = 0;
  for (const [claimId, claim] of room.pendingSeatClaims) {
    if (claim.playerId !== playerId) continue;
    room.pendingSeatClaims.delete(claimId);
    removed++;
    io?.to(claim.socketId).emit("room:seatClaimResolved", {
      requestId: claim.id,
      approved: false,
      message,
    });
  }
  return removed;
}

export function removeClaimsForSocket(socketId: string): number {
  let removed = 0;
  for (const room of getAllRooms().values()) {
    for (const [claimId, claim] of room.pendingSeatClaims) {
      if (claim.socketId !== socketId) continue;
      room.pendingSeatClaims.delete(claimId);
      removed++;
    }
  }
  return removed;
}
