export const DUEL_GAMES = ["memory", "battleship"] as const;
export type DuelGameId = (typeof DUEL_GAMES)[number];
export const DUEL_TURN_MS = 90_000;
export const DUEL_SETUP_MS = 180_000;
export const DUEL_WAIT_MS = 600_000;
export const DUEL_MAX_STAKE = 100_000;
export const DUEL_NAMES: Record<DuelGameId, string> = {
  memory: "Найди пару",
  battleship: "Морской бой",
};
export type DuelAction =
  | { type: "flip"; cell: number }
  | { type: "fleet"; ships: number[][] }
  | { type: "ready" }
  | { type: "fire"; cell: number };
export type DuelRequest =
  | { type: "create"; requestId: string; gameId: DuelGameId; stake: number; isPrivate?: boolean }
  | { type: "join"; id: string; revision: number; stake: number; code?: string }
  | { type: "play"; id: string; revision: number; action: DuelAction }
  | { type: "leave"; id: string; revision: number };
export interface DuelSummary {
  id: string;
  code: string;
  isPrivate: boolean;
  gameId: DuelGameId;
  stake: number;
  players: { id: string; name: string }[];
  phase: "waiting" | "setup" | "playing" | "finished";
  revision: number;
  deadline: number;
  winnerId: string | null;
  reason: string | null;
}
export interface DuelSnapshot extends DuelSummary {
  turnId: string | null;
  memory: {
    open: number[];
    cards: (number | null)[];
    matched: boolean[];
    scores: number[];
    revealUntil: number;
  } | null;
  battleship: {
    boards: ("unknown" | "miss" | "hit" | "sunk")[][];
    ownShips: number[][] | null;
    ready: boolean[];
  } | null;
}
export interface DuelDirectory {
  rooms: DuelSummary[];
  mine: DuelSummary[];
  selected: DuelSnapshot | null;
  serverNow: number;
}
