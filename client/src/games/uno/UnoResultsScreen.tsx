import type { RoomSnapshot } from "../../../../shared/platform/room";
import { usePlatform } from "../../platform/context/PlatformContext";
import { GameRoomHeader } from "../../screens/game/GameRoomHeader";
import { GameDockTools } from "../../screens/game/GameDockTools";

interface UnoResultsScreenProps {
  snapshot: RoomSnapshot<"uno">;
}

export function UnoResultsScreen({ snapshot }: UnoResultsScreenProps) {
  const { connected, commandPending, error, leaveRoom, playAgain } = usePlatform();
  const game = snapshot.game;
  if (!game) {
    return (
      <div className="screen platform-room-loading" role="status">
        Подводим итог…
      </div>
    );
  }

  const viewerSeatId = snapshot.viewer.role === "player" ? snapshot.viewer.seatId : null;
  const viewerSeat = viewerSeatId
    ? snapshot.seats.find((seat) => seat.seatId === viewerSeatId)
    : null;
  const winnerSeatId = game.result?.type === "winner" ? game.result.winnerSeatId : null;
  const winner = winnerSeatId
    ? game.players.find((player) => player.seatId === winnerSeatId)
    : null;
  const title = winner ? `Побеждает ${winner.name}` : "Партия завершена";
  const description =
    game.result?.type === "aborted"
      ? "В комнате осталось меньше двух активных участников."
      : winnerSeatId === viewerSeatId
        ? "Вы первым избавились от всех карт."
        : "Победитель первым избавился от всех карт.";

  return (
    <main className="screen command-game-screen uno-screen uno-results-screen">
      <GameRoomHeader
        roomCode={snapshot.roomCode}
        connected={connected}
        onLeaveRoom={leaveRoom}
        gameTitle="UNO"
        brandIcon="◆"
      />
      <section className="uno-results-hero">
        <span className="uno-eyebrow">Результат партии</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </section>
      <section className="uno-results-list" aria-labelledby="uno-results-players-title">
        <h2 id="uno-results-players-title">Участники</h2>
        <div>
          {game.players.map((player, index) => (
            <article
              className={`uno-result-player ${player.seatId === viewerSeatId ? "is-me" : ""} ${player.seatId === winnerSeatId ? "is-winner" : ""}`}
              key={player.seatId}
            >
              <span>{index + 1}</span>
              <strong>
                {player.name}
                {player.seatId === viewerSeatId ? " · вы" : ""}
              </strong>
              <small>
                {player.status === "excluded" ? "Исключён" : `${player.cardCount} карт`}
              </small>
            </article>
          ))}
        </div>
      </section>
      <section className="uno-results-actions">
        <GameDockTools gameId="uno" gameTitle="UNO" />
        {viewerSeat?.isHost ? (
          <button
            type="button"
            className="btn btn-primary"
            disabled={!connected || commandPending}
            onClick={playAgain}
          >
            {commandPending ? "Возвращаем в лобби…" : "Сыграть ещё"}
          </button>
        ) : (
          <p>
            {snapshot.viewer.role === "spectator"
              ? "Вы наблюдали за партией."
              : "Ждём решения хоста."}
          </p>
        )}
      </section>
      {error && (
        <div className="error-toast" role="alert">
          {error}
        </div>
      )}
    </main>
  );
}
