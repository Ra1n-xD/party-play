/** Reconstruct public sunk hulls only. Unknown enemy cells never describe a ship. */
export function sunkShips(board: readonly string[]): number[][] {
  const remaining = new Set(board.flatMap((value, i) => (value === "sunk" ? [i] : [])));
  const ships: number[][] = [];
  for (const cell of remaining) {
    const ship = [cell];
    remaining.delete(cell);
    for (const current of ship) {
      for (const next of [
        current - 10,
        current + 10,
        current % 10 > 0 ? current - 1 : -1,
        current % 10 < 9 ? current + 1 : -1,
      ]) {
        if (remaining.delete(next)) ship.push(next);
      }
    }
    ships.push(ship.sort((a, b) => a - b));
  }
  return ships;
}
