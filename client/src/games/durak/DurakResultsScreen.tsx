import type { RoomSnapshot } from "../../../../shared/platform/room";
import { usePlatform } from "../../platform/context/PlatformContext";
import { GameRoomHeader } from "../../screens/game/GameRoomHeader";
import { GameDockTools } from "../../screens/game/GameDockTools";

interface DurakResultsScreenProps {
  snapshot: RoomSnapshot<"durak">;
}

const STATUS_LABELS = {
  active: "Остался с картами",
  out: "Вышел",
  excluded: "Исключён",
} as const;

function formatCardCount(count: number): string {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return `${count} карт`;
  if (mod10 === 1) return `${count} карта`;
  if (mod10 >= 2 && mod10 <= 4) return `${count} карты`;
  return `${count} карт`;
}

export function DurakResultsScreen({ snapshot }: DurakResultsScreenProps) {
  const { connected, commandPending, error, leaveRoom, playAgain } = usePlatform();
  const game = snapshot.game;
  if (!game) {
    return (
      <div className="screen platform-room-loading" role="status">
        Подводим итог партии…
      </div>
    );
  }

  const viewerSeatId = snapshot.viewer.role === "player" ? snapshot.viewer.seatId : null;
  const viewerSeat = viewerSeatId
    ? snapshot.seats.find((seat) => seat.seatId === viewerSeatId)
    : null;
  const isHost = viewerSeat?.isHost ?? false;
  const foolSeatId = game.result?.type === "fool" ? game.result.foolSeatId : null;
  const fool = foolSeatId ? game.players.find((player) => player.seatId === foolSeatId) : null;

  let title = "Партия завершена";
  let description = "Можно вернуться в лобби и сыграть ещё.";
  if (game.result?.type === "fool") {
    title = `Дурак — ${fool?.name ?? "игрок"}`;
    description =
      fool?.seatId === viewerSeatId
        ? "В этот раз последняя карта осталась у вас."
        : "Последний участник с картами определён.";
  } else if (game.result?.type === "draw") {
    title = "Ничья";
    description = "После последнего боя карт не осталось ни у кого.";
  } else if (game.result?.type === "aborted") {
    title = "Партия прервана";
    description = "В комнате осталось меньше двух активных участников.";
  }

  const waitingMessage =
    snapshot.viewer.role === "spectator"
      ? "Вы наблюдали за этой партией."
      : "Новую партию сможет запустить хост.";

  return (
    <main className="screen command-game-screen durak-screen durak-results-screen card-results-screen">
      <GameRoomHeader
        roomCode={snapshot.roomCode}
        connected={connected}
        onLeaveRoom={leaveRoom}
        gameTitle="Подкидной дурак"
        brandIcon="♠"
      />

      <div className="card-results-content">
        <section className="durak-results-hero card-results-hero">
          <span className="durak-section-eyebrow card-results-eyebrow">Результат партии</span>
          <h1>{title}</h1>
          <p>{description}</p>
        </section>

        <section
          className="durak-results-list card-results-list"
          aria-labelledby="durak-results-players-title"
        >
          <div className="card-results-list-heading">
            <h2 id="durak-results-players-title">Участники</h2>
            <span>{game.players.length}</span>
          </div>
          <div className="card-results-players">
            {game.players.map((player) => (
              <article
                key={player.seatId}
                className={[
                  "durak-result-player",
                  "card-result-player",
                  player.seatId === viewerSeatId ? "is-me" : "",
                  fool?.seatId === player.seatId ? "is-fool" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <div className="card-result-copy">
                  <strong>
                    {player.name}
                    {player.seatId === viewerSeatId && <span className="card-result-you">вы</span>}
                  </strong>
                  <span>
                    {fool?.seatId === player.seatId
                      ? "Остался дураком"
                      : STATUS_LABELS[player.status]}
                  </span>
                </div>
                <span className="durak-result-card-count card-result-count">
                  {formatCardCount(player.cardCount)}
                </span>
              </article>
            ))}
          </div>
        </section>
      </div>

      <section
        className={`durak-results-actions card-results-actions ${isHost ? "has-primary-action" : ""}`}
        aria-label="Действия после игры"
      >
        <GameDockTools gameId="durak" gameTitle="Подкидной дурак" />
        <div className="card-results-action-copy">
          <strong>{isHost ? "Ещё один раунд?" : "Партия завершена"}</strong>
          <span>{isHost ? "Можно вернуться в лобби с тем же составом." : waitingMessage}</span>
        </div>
        {isHost ? (
          <button
            type="button"
            className="btn btn-primary"
            disabled={commandPending || !connected}
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
