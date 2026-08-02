import type {
  DurakCard,
  DurakResult,
  DurakSettings,
  DurakTablePair,
  DurakVisualEvent,
  SeatId,
} from "../../../../shared/types.js";
import type { Room } from "../../platform/roomManager.js";

export type DurakInternalPhase = "PLAYING" | "RESOLVING" | "GAME_OVER";
export type DurakInternalFightStage = "opening" | "defense" | "throw-in" | "take-throw-in";
export type DurakInternalSeatStatus = "active" | "out" | "excluded";
export type DurakTurnKind = "opening" | "defense" | "throw-in" | "take-throw-in";

export type DurakTurnClock =
  | { kind: "unlimited" }
  | { kind: "running"; deadlineAt: number }
  | { kind: "frozen"; remainingMs: number };

export interface DurakTurn {
  id: number;
  actorSeatId: SeatId;
  kind: DurakTurnKind;
  readyAt: number;
  readyRemainingMs: number | null;
  clock: DurakTurnClock;
}

export interface DurakPendingResolution {
  fightId: number;
  kind: "defended" | "taken";
  readyAt: number;
  readyRemainingMs: number | null;
}

export interface DurakFight {
  id: number;
  primaryAttackerSeatId: SeatId;
  defenderSeatId: SeatId;
  defenderHandSizeAtStart: number;
  maxAttackCards: number;
  table: DurakTablePair[];
  stage: DurakInternalFightStage;
  takeDeclared: boolean;
  throwInOrder: SeatId[];
  passedSeatIds: SeatId[];
}

export interface DurakGameState {
  gameInstanceId: string;
  phase: DurakInternalPhase;
  settings: DurakSettings;
  seatOrder: SeatId[];
  activeOrder: SeatId[];
  statusBySeatId: Record<SeatId, DurakInternalSeatStatus>;
  dealerSeatId: SeatId;
  hands: Record<SeatId, DurakCard[]>;
  drawPile: DurakCard[];
  discard: DurakCard[];
  removedFaceDown: DurakCard[];
  trumpCard: DurakCard;
  trumpSuit: DurakCard["suit"];
  fight: DurakFight | null;
  turn: DurakTurn | null;
  pendingResolution: DurakPendingResolution | null;
  nextTurnId: number;
  nextFightId: number;
  nextVisualEventId: number;
  visualEvents: DurakVisualEvent[];
  result: DurakResult | null;
}

declare module "../../platform/roomManager.js" {
  interface ServerGameRuntimeById {
    durak: DurakGameState;
  }
}

export type DurakRoom = Room<"durak">;

export function asDurakRoom(room: Room): DurakRoom | null {
  return room.gameId === "durak" ? (room as DurakRoom) : null;
}
