import type { SeatId } from "./room.js";

export type CardVisualAnchor =
  | { kind: "deck" | "table" | "discard" }
  | { kind: "player"; seatId: SeatId };

export interface CardTransferVisualEvent {
  id: number;
  type: "transfer";
  source: CardVisualAnchor;
  target: CardVisualAnchor;
  cardCount: number;
}

export interface PlayerActionVisualEvent<Action extends string = string> {
  id: number;
  type: "action";
  seatId: SeatId;
  action: Action;
}
