import type {
  CardTransferVisualEvent,
  PlayerActionVisualEvent,
} from "../../platform/cardVisualEvents.js";
import type { RoomRevision, SeatId } from "../../platform/room.js";

export const DURAK_INITIAL_DEAL_READY_DELAY_MS = 2_500;
export const DURAK_TABLE_ACTION_READY_DELAY_MS = 950;
export const DURAK_RESOLUTION_READY_DELAY_MS = 950;
export const DURAK_REFILL_PHASE_PAUSE_MS = 250;
export const DURAK_TRANSFER_DURATION_MS = 1_650;
export const DURAK_TRANSFER_CARD_STAGGER_MS = 100;
export const DURAK_REFILL_EVENT_STAGGER_MS = 130;

export type DurakSuit = "clubs" | "diamonds" | "hearts" | "spades";
export type DurakRank = "6" | "7" | "8" | "9" | "10" | "jack" | "queen" | "king" | "ace";

export interface DurakCard {
  id: string;
  suit: DurakSuit;
  rank: DurakRank;
}

export interface DurakSettings {
  turnTimeoutSeconds: null | 30 | 60 | 90;
}

export type DurakPhase = "LOBBY" | "PLAYING" | "GAME_OVER";
export type DurakFightStage = "attack" | "defense" | "throw-in" | "take-throw-in";

export interface DurakTablePair {
  attack: DurakCard;
  attackPlayedBySeatId: SeatId;
  defense: DurakCard | null;
  defensePlayedBySeatId: SeatId | null;
}

export type DurakSeatStatus = "active" | "out" | "excluded";
export type DurakVisualAction = "attack" | "defend" | "throw-in" | "take" | "pass" | "beat";
export type DurakVisualEvent = CardTransferVisualEvent | PlayerActionVisualEvent<DurakVisualAction>;

export interface DurakPlayerPublicState {
  seatId: SeatId;
  name: string;
  cardCount: number;
  status: DurakSeatStatus;
  connected: boolean;
  controllerKind: "human" | "bot" | "none";
  temporaryBot: boolean;
  isDealer: boolean;
  isAttacker: boolean;
  isDefender: boolean;
  isCurrentActor: boolean;
}

export type DurakResult =
  | { type: "fool"; foolSeatId: SeatId }
  | { type: "draw" }
  | { type: "aborted"; reason: "not-enough-players" };

export interface DurakPublicState {
  gameId: "durak";
  revision: RoomRevision;
  phase: DurakPhase;
  fightStage: DurakFightStage | null;
  dealerSeatId: SeatId | null;
  attackerSeatId: SeatId | null;
  defenderSeatId: SeatId | null;
  currentActorSeatId: SeatId | null;
  activeOrder: SeatId[];
  throwInOrder: SeatId[];
  passedSeatIds: SeatId[];
  table: DurakTablePair[];
  takeDeclared: boolean;
  maxAttackCards: number;
  trumpSuit: DurakSuit | null;
  trumpCard: DurakCard | null;
  trumpCardLocation: "deck" | "hand" | "table" | "discard" | "removed" | null;
  trumpCardHolderSeatId: SeatId | null;
  deckCount: number;
  discardCount: number;
  visualEvents: DurakVisualEvent[];
  players: DurakPlayerPublicState[];
  turnRemainingMs: number | null;
  paused: boolean;
  spectatorCount: number;
  result: DurakResult | null;
}

export type DurakLegalAction =
  | { type: "wait" }
  | { type: "attack"; playableCardIds: string[]; maxCards: number }
  | {
      type: "defend";
      targets: { defenseCardId: string; attackCardIds: string[] }[];
      canTake: true;
    }
  | {
      type: "throw-in";
      playableCardIds: string[];
      maxCards: number;
      canPass: boolean;
      canBeat: boolean;
    }
  | { type: "pass"; canPass: true }
  | { type: "beat"; canBeat: true };

export interface DurakPrivateState {
  seatId: SeatId;
  hand: DurakCard[];
  legalAction: DurakLegalAction;
}

export type DurakCommand =
  | { type: "attack"; cardIds: [string, ...string[]] }
  | { type: "defend"; cardId: string; attackCardId: string }
  | { type: "throw-in"; cardIds: [string, ...string[]] }
  | { type: "take" }
  | { type: "pass" }
  | { type: "beat" };

export type DurakEvent = never;
