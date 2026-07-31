import type {
  UnoChallengeResolution,
  UnoColor,
  UnoPendingWildDrawFour,
  UnoResult,
  UnoSettings,
  UnoTurnKind,
  UnoCard,
  SeatId,
} from "../../../../shared/types.js";
import type { Room } from "../../platform/roomManager.js";

export type UnoTurnClock =
  | { kind: "unlimited" }
  | { kind: "running"; deadlineAt: number }
  | { kind: "frozen"; remainingMs: number };

export interface UnoTurn {
  id: number;
  actorSeatId: SeatId;
  kind: UnoTurnKind;
  clock: UnoTurnClock;
  drawnCardId: string | null;
}

export interface UnoPendingWildDrawFourInternal extends UnoPendingWildDrawFour {
  wasLegalAtPlay: boolean;
}

export interface UnoUnoWindowInternal {
  id: number;
  subjectSeatId: SeatId;
  openedByTurnId: number;
}

export interface UnoGameState {
  gameInstanceId: string;
  phase: "PLAYING" | "GAME_OVER";
  settings: UnoSettings;
  seatOrder: SeatId[];
  activeSeatIds: SeatId[];
  statusBySeatId: Record<SeatId, "active" | "excluded">;
  dealerSeatId: SeatId;
  direction: 1 | -1;
  hands: Record<SeatId, UnoCard[]>;
  drawPile: UnoCard[];
  discardPile: UnoCard[];
  lastPlayedBySeatId: SeatId | null;
  removedFaceDown: UnoCard[];
  activeColor: UnoColor | null;
  turn: UnoTurn | null;
  nextTurnId: number;
  pendingWildDrawFour: UnoPendingWildDrawFourInternal | null;
  nextWildDrawFourId: number;
  unoWindow: UnoUnoWindowInternal | null;
  nextUnoWindowId: number;
  preDeclaredUno: { seatId: SeatId; turnId: number } | null;
  lastChallengeResolution: UnoChallengeResolution | null;
  result: UnoResult | null;
}

declare module "../../platform/roomManager.js" {
  interface ServerGameRuntimeById {
    uno: UnoGameState;
  }
}

export type UnoRoom = Room<"uno">;

export function asUnoRoom(room: Room): UnoRoom | null {
  return room.gameId === "uno" ? (room as UnoRoom) : null;
}
