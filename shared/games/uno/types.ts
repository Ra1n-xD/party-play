import type { RoomRevision, SeatId } from "../../platform/room.js";

export type UnoColor = "red" | "yellow" | "green" | "blue";
export type UnoDirection = "clockwise" | "counterclockwise";
export type UnoNumber = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export type UnoCard =
  | {
      id: string;
      color: UnoColor;
      kind: "number";
      number: UnoNumber;
    }
  | {
      id: string;
      color: UnoColor;
      kind: "skip" | "reverse" | "draw-two";
      number: null;
    }
  | {
      id: string;
      color: null;
      kind: "wild" | "wild-draw-four";
      number: null;
    };

export interface UnoSettings {
  turnTimeoutSeconds: null | 30 | 60 | 90;
}

export type UnoPhase = "LOBBY" | "PLAYING" | "GAME_OVER";
export type UnoTurnKind = "normal" | "after-draw" | "initial-color" | "wild-draw-four-response";
export type UnoSeatStatus = "active" | "excluded";

export interface UnoPlayerPublicState {
  seatId: SeatId;
  name: string;
  cardCount: number;
  status: UnoSeatStatus;
  connected: boolean;
  controllerKind: "human" | "bot" | "none";
  temporaryBot: boolean;
  isDealer: boolean;
  isCurrentActor: boolean;
}

export interface UnoPendingWildDrawFour {
  id: number;
  sourceSeatId: SeatId;
  targetSeatId: SeatId;
  declaredColor: UnoColor;
  previousActiveColor: UnoColor;
}

export interface UnoWindow {
  id: number;
  subjectSeatId: SeatId;
}

export interface UnoChallengeResolution {
  id: number;
  sourceSeatId: SeatId;
  targetSeatId: SeatId;
  outcome: "accepted" | "challenge-succeeded" | "challenge-failed";
  drawCount: 4 | 6;
}

export type UnoResult =
  | { type: "winner"; winnerSeatId: SeatId }
  | { type: "aborted"; reason: "not-enough-players" };

export interface UnoPublicState {
  gameId: "uno";
  revision: RoomRevision;
  phase: UnoPhase;
  dealerSeatId: SeatId | null;
  currentActorSeatId: SeatId | null;
  turnKind: UnoTurnKind | null;
  activeOrder: SeatId[];
  direction: UnoDirection;
  topDiscard: UnoCard | null;
  activeColor: UnoColor | null;
  drawPileCount: number;
  discardPileCount: number;
  players: UnoPlayerPublicState[];
  pendingWildDrawFour: UnoPendingWildDrawFour | null;
  unoWindow: UnoWindow | null;
  lastChallengeResolution: UnoChallengeResolution | null;
  turnRemainingMs: number | null;
  paused: boolean;
  spectatorCount: number;
  result: UnoResult | null;
}

export interface UnoLegalActions {
  playableCardIds: string[];
  bluffableWildDrawFourCardIds: string[];
  canDraw: boolean;
  drawnCardId: string | null;
  canEndTurn: boolean;
  canChooseInitialColor: boolean;
  wildDrawFourResponseId: number | null;
  canAcceptWildDrawFour: boolean;
  canChallengeWildDrawFour: boolean;
  canDeclareUno: boolean;
  declareUnoWindowId: number | null;
  catchUno: {
    windowId: number;
    targetSeatId: SeatId;
  } | null;
}

export interface UnoPrivateState {
  seatId: SeatId;
  hand: UnoCard[];
  legalActions: UnoLegalActions;
}

export type UnoCommand =
  | {
      type: "play-card";
      cardId: string;
      chosenColor?: UnoColor;
      declareUno?: boolean;
    }
  | { type: "draw-card" }
  | { type: "end-turn" }
  | { type: "choose-initial-color"; color: UnoColor }
  | {
      type: "respond-wild-draw-four";
      pendingId: number;
      decision: "accept" | "challenge";
    }
  | { type: "declare-uno"; windowId?: number }
  | { type: "catch-uno"; windowId: number };

export type UnoEvent = never;
