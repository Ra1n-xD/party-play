import type { DuelGameId, DuelSummary } from "../../../shared/platform/duels.js";
import type { MemoryState } from "../games/memory/engine.js";
import type { BattleshipState } from "../games/battleship/engine.js";
import { validFleet } from "../../../shared/games/battleship/rules.js";
export interface DuelRecord {
  id: string;
  gameId: DuelGameId;
  stake: number;
  players: string[];
  phase: DuelSummary["phase"];
  revision: number;
  deadline: number;
  createdAt: number;
  winnerId: string | null;
  reason: string | null;
  game: MemoryState | BattleshipState | null;
}
export function validDuel(d: DuelRecord): boolean {
  if (
    !d ||
    typeof d.id !== "string" ||
    !["memory", "battleship"].includes(d.gameId) ||
    !Number.isSafeInteger(d.stake) ||
    d.stake < 0 ||
    d.stake > 100000 ||
    !Array.isArray(d.players) ||
    d.players.length < 1 ||
    d.players.length > 2 ||
    new Set(d.players).size !== d.players.length ||
    !["waiting", "setup", "playing", "finished"].includes(d.phase) ||
    !Number.isSafeInteger(d.revision) ||
    d.revision < 0 ||
    !Number.isSafeInteger(d.deadline) ||
    !Number.isSafeInteger(d.createdAt) ||
    (d.winnerId !== null && !d.players.includes(d.winnerId))
  )
    return false;
  if (d.phase === "waiting") return d.players.length === 1 && d.game === null;
  if (!d.game) return d.phase === "finished";
  if (d.players.length !== 2 || d.game.kind !== d.gameId || ![0, 1].includes(d.game.turn))
    return false;
  if (d.game.kind === "memory") {
    const g = d.game;
    return (
      g.cards.length === 24 &&
      Array.from({ length: 12 }, (_, i) => g.cards.filter((v) => v === i).length).every(
        (v) => v === 2,
      ) &&
      g.matched.length === 24 &&
      g.matched.every((v) => typeof v === "boolean") &&
      g.scores.length === 2 &&
      g.scores.every((n) => Number.isInteger(n) && n >= 0 && n <= 12) &&
      g.open.length <= 2 &&
      g.open.every((n) => Number.isInteger(n) && n >= 0 && n < 24) &&
      Number.isSafeInteger(g.revealUntil)
    );
  }
  return (
    d.game.ships.length === 2 &&
    d.game.ships.every(validFleet) &&
    d.game.shots.length === 2 &&
    d.game.shots.every(
      (s) =>
        Array.isArray(s) &&
        new Set(s).size === s.length &&
        s.every((n) => Number.isInteger(n) && n >= 0 && n < 100),
    ) &&
    d.game.ready.length === 2 &&
    d.game.ready.every((v) => typeof v === "boolean")
  );
}
