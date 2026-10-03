import type { SeatId } from "./room.js";

export const ROOM_REACTIONS = [
  { id: "good-move", label: "Хороший ход", rarity: "basic", durationMs: 3000 },
  { id: "bravo", label: "Браво", rarity: "common", durationMs: 3000 },
  { id: "wow", label: "Вот это да", rarity: "rare", durationMs: 3000 },
  { id: "nice", label: "Красиво", rarity: "common", durationMs: 3000 },
  { id: "lucky", label: "Повезло", rarity: "rare", durationMs: 3000 },
  { id: "fire", label: "Огонь", rarity: "epic", durationMs: 3000 },
  { id: "laugh", label: "АХАХАХАХХА", rarity: "legendary", durationMs: 5400 },
] as const;
export type RoomReactionId = (typeof ROOM_REACTIONS)[number]["id"];
export const ROOM_REACTION_IDS = ROOM_REACTIONS.map((reaction) => reaction.id);
export const DEFAULT_ROOM_REACTION: RoomReactionId = "good-move";
export const LAUGH_BEATS_SECONDS = [1.15, 1.42, 1.68, 1.97, 2.33, 2.62, 2.92, 3.27, 3.63] as const;

export function ownsRoomReaction(
  id: RoomReactionId,
  inventory?: Readonly<Record<string, number>> | null,
): boolean {
  return id === DEFAULT_ROOM_REACTION || (inventory?.[`reaction:${id}`] ?? 0) > 0;
}

export function getRoomReactionDuration(id: RoomReactionId): number {
  return ROOM_REACTIONS.find((reaction) => reaction.id === id)?.durationMs ?? 3000;
}

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
