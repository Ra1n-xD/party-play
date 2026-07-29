import type { BunkerCard, Catastrophe, GamePhase, ThreatCard } from "../../../../shared/types.js";
import type { Room } from "../../platform/roomManager.js";

export interface BunkerGameState {
  phase: GamePhase;
  roundNumber: number;
  catastrophe: Catastrophe;
  bunkerCards: BunkerCard[];
  revealedBunkerCount: number;
  threatCard: ThreatCard | null;
  bunkerCapacity: number;
  turnOrder: string[];
  currentTurnIndex: number;
  votes: Map<string, string>;
  eliminationOrder: string[];
  votingSchedule: number[];
  currentVotingInRound: number;
  roundStarterIndex: number;
  lastEliminatedId: string | null;
  tiebreakCandidateIds: string[];
  phaseTimer: ReturnType<typeof setTimeout> | null;
  phaseEndTime: number | null;
  paused: boolean;
  pausedTimeRemaining: number | null;
  pausedCallback: (() => void) | null;
}

declare module "../../platform/roomManager.js" {
  interface ServerGameRuntimeById {
    bunker: BunkerGameState;
  }
}

export type BunkerRoom = Room<"bunker">;

export function asBunkerRoom(room: Room): BunkerRoom | null {
  return room.gameId === "bunker" ? (room as BunkerRoom) : null;
}
