export const FLEET = [4, 3, 3, 2, 2, 2, 1, 1, 1, 1];
export const SEA_SIZE = 10;
export function validFleet(ships: unknown): ships is number[][] {
  if (!Array.isArray(ships) || ships.length !== FLEET.length) return false;
  if (ships.some((ship) => !Array.isArray(ship))) return false;
  if (
    ships
      .map((ship) => ship.length)
      .sort((a, b) => b - a)
      .join() !== FLEET.join()
  )
    return false;
  const occupied = new Map<number, number>();
  for (const [i, ship] of ships.entries()) {
    const sorted = [...ship].sort((a, b) => a - b);
    if (
      sorted.some(
        (cell) => !Number.isInteger(cell) || cell < 0 || cell >= 100 || occupied.has(cell),
      )
    )
      return false;
    const step = sorted[1] - sorted[0];
    if (
      sorted.length > 1 &&
      ((step !== 1 && step !== 10) ||
        sorted.some((cell, j) => cell !== sorted[0] + step * j) ||
        (step === 1 && Math.floor(sorted[0] / 10) !== Math.floor(sorted.at(-1)! / 10)))
    )
      return false;
    for (const cell of sorted) {
      if (occupied.has(cell)) return false;
      occupied.set(cell, i);
    }
  }
  for (const [cell, ship] of occupied) {
    for (let y = -1; y <= 1; y++)
      for (let x = -1; x <= 1; x++) {
        const row = Math.floor(cell / 10) + y,
          col = (cell % 10) + x;
        if (row < 0 || row >= 10 || col < 0 || col >= 10) continue;
        const neighbour = occupied.get(row * 10 + col);
        if (neighbour !== undefined && neighbour !== ship) return false;
      }
  }
  return true;
}
export function randomFleet(random: (max: number) => number): number[][] {
  for (;;) {
    const ships: number[][] = [];
    const forbidden = new Set<number>();
    for (const length of FLEET) {
      const candidates: number[][] = [];
      for (let cell = 0; cell < 100; cell++)
        for (const step of [1, 10]) {
          const ship = Array.from({ length }, (_, j) => cell + step * j);
          if (
            ship.at(-1)! >= 100 ||
            (step === 1 && Math.floor(cell / 10) !== Math.floor(ship.at(-1)! / 10)) ||
            ship.some((c) => forbidden.has(c))
          )
            continue;
          candidates.push(ship);
        }
      if (!candidates.length) break;
      const ship = candidates[random(candidates.length)];
      ships.push(ship);
      for (const cell of ship)
        for (let y = -1; y <= 1; y++)
          for (let x = -1; x <= 1; x++) {
            const row = Math.floor(cell / 10) + y,
              col = (cell % 10) + x;
            if (row >= 0 && row < 10 && col >= 0 && col < 10) forbidden.add(row * 10 + col);
          }
    }
    if (ships.length === FLEET.length) return ships;
  }
}
