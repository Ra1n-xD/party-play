import type { RoomRevision, SeatId } from "../../platform/room.js";

// ============ Character System ============

export interface Attribute {
  type: AttributeType;
  label: string;
  value: string;
  detail?: string;
}

export type AttributeType = "profession" | "bio" | "health" | "hobby" | "baggage" | "fact";

export interface ActionCard {
  id: string;
  title: string;
  description: string;
  targetRequired: boolean;
}

export interface Character {
  attributes: Attribute[];
  actionCard: ActionCard;
}

// ============ Bunker Cards ============

export interface BunkerCard {
  title: string;
  description: string;
  image?: string;
}

export interface ThreatCard {
  title: string;
  description: string;
  image?: string;
}

export interface Catastrophe {
  title: string;
  description: string;
  image?: string;
}

// ============ Bunker State ============

export type BunkerGamePhase =
  | "LOBBY"
  | "CATASTROPHE_REVEAL"
  | "BUNKER_EXPLORE"
  | "ROUND_REVEAL"
  | "ROUND_DISCUSSION"
  | "ROUND_VOTE"
  | "ROUND_VOTE_TIEBREAK"
  | "ROUND_RESULT"
  | "GAME_OVER";

export type PauseKind = "none" | "admin" | "reconnect" | "mixed";

export interface FullAttribute extends Attribute {
  wasRevealed: boolean;
}

export interface BunkerPlayerInfo {
  id: SeatId;
  name: string;
  ready: boolean;
  connected: boolean;
  alive: boolean;
  revealedAttributes: Attribute[];
  allAttributes?: FullAttribute[];
  actionCard?: ActionCard;
  actionCardRevealed: boolean;
  isHost: boolean;
  isBot: boolean;
  temporaryBot?: boolean;
  kicked: boolean;
}

/**
 * Public projection produced by the Bunker module.
 *
 * Platform fields are intentionally duplicated during the legacy UI migration.
 * New platform code reads the canonical room data from RoomSnapshot.
 */
export interface BunkerPublicState {
  gameId: "bunker";
  revision: RoomRevision;
  phase: BunkerGamePhase;
  roundNumber: number;
  totalRounds: number;
  catastrophe: Catastrophe | null;
  revealedBunkerCards: BunkerCard[];
  totalBunkerCards: number;
  threatCard: ThreatCard | null;
  bunkerCapacity: number;
  startedPlayerCount: number;
  players: BunkerPlayerInfo[];
  currentTurnPlayerId: SeatId | null;
  votesCount: number;
  totalVotesExpected: number;
  voteResults: Record<SeatId, number> | null;
  eliminatedPlayerId: SeatId | null;
  votingSchedule: number[];
  currentVotingInRound: number;
  votingsInCurrentRound: number;
  lastEliminatedPlayerId: SeatId | null;
  tiebreakCandidateIds: SeatId[] | null;
  phaseRemainingMs: number | null;
  paused: boolean;
  pauseKind: PauseKind;
  disconnectedPlayerIds: SeatId[];
  spectatorCount: number;
}

export interface BunkerVoterStatus {
  phase: BunkerGamePhase;
  roundNumber: number;
  currentVotingInRound: number;
  hasVoted: boolean;
}

export interface BunkerPrivateState {
  seatId: SeatId;
  character: Character | null;
  voterStatus: BunkerVoterStatus | null;
}

export type BunkerCommand =
  | { type: "reveal-attribute"; attributeIndex?: number }
  | { type: "reveal-action-card" }
  | { type: "cast-vote"; targetSeatId: SeatId }
  | { type: "force-end" }
  | { type: "shuffle-all"; attributeType: AttributeType | "action" }
  | {
      type: "swap-attribute";
      firstSeatId: SeatId;
      secondSeatId: SeatId;
      attributeType: AttributeType | "action";
    }
  | {
      type: "replace-attribute";
      seatId: SeatId;
      attributeType: AttributeType | "action";
    }
  | { type: "remove-bunker-card"; cardIndex: number }
  | { type: "replace-bunker-card"; cardIndex: number }
  | { type: "delete-attribute"; seatId: SeatId; attributeType: AttributeType }
  | { type: "force-reveal-type"; attributeType: AttributeType }
  | { type: "skip-discussion" }
  | { type: "revive-seat"; seatId: SeatId }
  | { type: "eliminate-seat"; seatId: SeatId };

export type BunkerEvent =
  | { type: "attribute-revealed"; playerName: string; attribute: Attribute }
  | { type: "action-card-revealed"; playerName: string; actionCard: ActionCard }
  | { type: "player-eliminated"; seatId: SeatId; playerName: string };
