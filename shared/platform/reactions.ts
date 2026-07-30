import type { SeatId } from "./room.js";

export const ROOM_REACTION_IDS = ["good-move", "bravo", "wow", "nice", "lucky", "fire"] as const;

export type RoomReactionId = (typeof ROOM_REACTION_IDS)[number];

export interface RoomReactionEvent {
  eventId: string;
  roomCode: string;
  reactionId: RoomReactionId;
  senderSeatId: SeatId;
  senderName: string;
  sentAt: number;
}

const ROOM_REACTION_ID_SET: ReadonlySet<string> = new Set(ROOM_REACTION_IDS);

export function isRoomReactionId(value: unknown): value is RoomReactionId {
  return typeof value === "string" && ROOM_REACTION_ID_SET.has(value);
}
