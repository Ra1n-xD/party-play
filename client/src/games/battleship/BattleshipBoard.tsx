import type { ShipSkinId } from "../../../../shared/games/battleship/skins";
import { ShipArtwork } from "./ShipArtwork";

// Sunk cells are public. Reconstruct only those hulls; hidden enemy cells never reach this view.
function sunkShips(board: string[]): number[][] {
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

export function BattleshipBoard({
  board,
  ships,
  skinId,
  onCell,
  disabled,
  label,
}: {
  board: string[];
  ships?: number[][] | null;
  skinId?: ShipSkinId;
  onCell?: (cell: number) => void;
  disabled?: boolean;
  label: string;
}) {
  const visibleShips = ships ?? sunkShips(board);
  return (
    <div className="sea-chart">
      <div className="sea-columns" aria-hidden="true">
        {[..."АБВГДЕЖЗИК"].map((letter) => (
          <span key={letter}>{letter}</span>
        ))}
      </div>
      <div className="sea-chart-body">
        <div className="sea-rows" aria-hidden="true">
          {Array.from({ length: 10 }, (_, i) => (
            <span key={i}>{i + 1}</span>
          ))}
        </div>
        <div className="sea-grid" role="group" aria-label={label}>
          {board.map((value, i) => {
            const ship = ships?.some((s) => s.includes(i));
            const status =
              value === "unknown"
                ? ship
                  ? "корабль"
                  : "неизвестно"
                : value === "miss"
                  ? "мимо"
                  : value === "sunk"
                    ? "потоплен"
                    : "попадание";
            return (
              <button
                key={i}
                type="button"
                className={`sea-cell is-${value}${ship ? " has-ship" : ""}`}
                disabled={disabled || !onCell || value !== "unknown"}
                onClick={() => onCell?.(i)}
                aria-label={`${label}, ${"АБВГДЕЖЗИК"[i % 10]}${Math.floor(i / 10) + 1}: ${status}`}
              >
                {value !== "unknown" && (
                  <span className="sea-shot" aria-hidden="true">
                    {value === "miss" ? "•" : "×"}
                  </span>
                )}
              </button>
            );
          })}
          <div className="sea-fleet" aria-hidden="true">
            {visibleShips.map((ship) => {
              const start = Math.min(...ship);
              const vertical = ship.length > 1 && ship.every((cell) => cell % 10 === start % 10);
              const sunk = ship.every((cell) => board[cell] === "sunk");
              return (
                <div
                  key={start}
                  className={`sea-vessel${sunk ? " is-sunk" : ""}`}
                  style={{
                    gridColumn: `${(start % 10) + 1} / span ${vertical ? 1 : ship.length}`,
                    gridRow: `${Math.floor(start / 10) + 1} / span ${vertical ? ship.length : 1}`,
                  }}
                >
                  <ShipArtwork length={ship.length} vertical={vertical} skinId={skinId} />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
