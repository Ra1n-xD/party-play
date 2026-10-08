import { randomInt } from "node:crypto";
import { randomFleet } from "../../../../shared/games/battleship/rules.js";
export interface BattleshipState {
  kind: "battleship";
  ships: number[][][];
  shots: number[][];
  ready: boolean[];
  turn: number;
}
export function createBattleship(): BattleshipState {
  return {
    kind: "battleship",
    ships: [randomFleet(randomInt), randomFleet(randomInt)],
    shots: [[], []],
    ready: [false, false],
    turn: randomInt(2),
  };
}
export function fireBattleship(state: BattleshipState, actor: number, cell: number): boolean {
  if (state.turn !== actor) throw new Error("Дождитесь своего хода");
  if (!Number.isInteger(cell) || cell < 0 || cell >= 100 || state.shots[actor].includes(cell))
    throw new Error("Выберите клетку, по которой ещё не стреляли");
  state.shots[actor].push(cell);
  const enemy = state.ships[1 - actor].flat();
  if (!enemy.includes(cell)) state.turn = 1 - actor;
  return enemy.every((c) => state.shots[actor].includes(c));
}
export function seaBoard(
  state: BattleshipState,
  defender: number,
): ("unknown" | "miss" | "hit" | "sunk")[] {
  const shots = state.shots[1 - defender];
  return Array.from({ length: 100 }, (_, cell) => {
    if (!shots.includes(cell)) return "unknown";
    const ship = state.ships[defender].find((s) => s.includes(cell));
    return !ship ? "miss" : ship.every((c) => shots.includes(c)) ? "sunk" : "hit";
  });
}
