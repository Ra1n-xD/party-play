import type { RoomSnapshot } from "../../../../shared/platform/room";
import { usePlatform } from "../../platform/context/PlatformContext";
import { GameRoomHeader } from "../../screens/game/GameRoomHeader";
import { GameDockTools } from "../../screens/game/GameDockTools";

interface UnoResultsScreenProps {
  snapshot: RoomSnapshot<"uno">;
}

function formatCardCount(count: number): string {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return `${count} карт`;
  if (mod10 === 1) return `${count} карта`;
  if (mod10 >= 2 && mod10 <= 4) return `${count} карты`;
  return `${count} карт`;
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
  const isHost = viewerSeat?.isHost ?? false;
  const waitingMessage =
    snapshot.viewer.role === "spectator"
      ? "Вы наблюдали за этой партией."
      : "Новую партию сможет запустить хост.";

  return (
    <main className="screen command-game-screen uno-screen uno-results-screen card-results-screen">
      <GameRoomHeader
        roomCode={snapshot.roomCode}
        connected={connected}
        onLeaveRoom={leaveRoom}
        gameTitle="UNO"
        brandIcon="◆"
      />
      <div className="card-results-content">
        <section className="uno-results-hero card-results-hero">
          <span className="uno-eyebrow card-results-eyebrow">Результат партии</span>
          <h1>{title}</h1>
          <p>{description}</p>
        </section>
        <section
          className="uno-results-list card-results-list"
          aria-labelledby="uno-results-players-title"
        >
          <div className="card-results-list-heading">
            <h2 id="uno-results-players-title">Участники</h2>
            <span>{game.players.length}</span>
          </div>
          <div className="card-results-players">
            {game.players.map((player) => (
              <article
                className={`uno-result-player card-result-player ${player.seatId === viewerSeatId ? "is-me" : ""} ${player.seatId === winnerSeatId ? "is-winner" : ""}`}
                key={player.seatId}
              >
                <div className="card-result-copy">
                  <strong>
                    {player.name}
                    {player.seatId === viewerSeatId && <span className="card-result-you">вы</span>}
                  </strong>
                  <span>
                    {player.seatId === winnerSeatId
                      ? "Победитель"
                      : player.status === "excluded"
                        ? "Исключён"
                        : "Участник"}
                  </span>
                </div>
                <span className="card-result-count">{formatCardCount(player.cardCount)}</span>
              </article>
            ))}
          </div>
        </section>
      </div>
      <section
        className={`uno-results-actions card-results-actions ${isHost ? "has-primary-action" : ""}`}
        aria-label="Действия после игры"
      >
        <GameDockTools gameId="uno" gameTitle="UNO" />
        <div className="card-results-action-copy">
          <strong>{isHost ? "Ещё один раунд?" : "Партия завершена"}</strong>
          <span>{isHost ? "Можно вернуться в лобби с тем же составом." : waitingMessage}</span>
        </div>
        {isHost ? (
          <button
            type="button"
            className="btn btn-primary"
            disabled={!connected || commandPending}
            onClick={playAgain}
          >
            {commandPending ? "Возвращаем в лобби…" : "Сыграть ещё"}
          </button>
        ) : null}
      </section>
      {error && (
        <div className="error-toast" role="alert">
          {error}
        </div>
      )}
    </main>
  );
}
