import type { RegisteredClientGameId } from "../gameRegistry";

export function GameMenuArtwork({ gameId }: { gameId: RegisteredClientGameId }) {
  return (
    <div className={`show-art show-art-${gameId}`} aria-hidden="true">
      <span className="show-art-spark">✦</span>
      {gameId === "bunker" ? (
        <>
          <div className="show-art-vault">
            <span className="show-art-wheel" />
          </div>
          <div className="show-art-permit">
            <b>01</b>
            ПРОПУСК
          </div>
        </>
      ) : (
        <div className="show-art-fan">
          {(gameId === "durak"
            ? [
                { value: "A", symbol: "♠" },
                { value: "K", symbol: "♦" },
                { value: "Q", symbol: "♥" },
              ]
            : [
                { value: "2", symbol: "2" },
                { value: "↶", symbol: "↶" },
                { value: "+4", symbol: "+4" },
              ]
          ).map((card) => (
            <span className="show-art-card" data-value={card.value} key={card.value}>
              {card.symbol}
            </span>
          ))}
        </div>
      )}
      <span className="show-art-spark">✧</span>
    </div>
  );
}
