import type { RoomSnapshot } from "../../../../shared/platform/room";
import { usePlatform } from "../../platform/context/PlatformContext";
import { GameRoomHeader } from "../../screens/game/GameRoomHeader";

interface DurakResultsScreenProps {
  snapshot: RoomSnapshot<"durak">;
}

const STATUS_LABELS = {
  active: "Остался с картами",
  out: "Вышел",
  excluded: "Исключён",
} as const;

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

  return (
    <main className="screen command-game-screen durak-screen durak-results-screen">
      <GameRoomHeader
        roomCode={snapshot.roomCode}
        connected={connected}
        onLeaveRoom={leaveRoom}
        gameTitle="Подкидной дурак"
        brandIcon="♠"
      />

      <section className="durak-results-hero">
        <span className="durak-section-eyebrow">Результат партии</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </section>

      <section className="durak-results-list" aria-labelledby="durak-results-players-title">
        <h2 id="durak-results-players-title">Участники</h2>
        <div>
          {game.players.map((player, index) => (
            <article
              key={player.seatId}
              className={[
                "durak-result-player",
                player.seatId === viewerSeatId ? "is-me" : "",
                fool?.seatId === player.seatId ? "is-fool" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <span className="durak-player-order">{index + 1}</span>
              <div>
                <strong>
                  {player.name}
                  {player.seatId === viewerSeatId ? " · вы" : ""}
                </strong>
                <span>{STATUS_LABELS[player.status]}</span>
              </div>
              <span className="durak-result-card-count">
                {player.cardCount} {player.cardCount === 1 ? "карта" : "карт"}
              </span>
            </article>
          ))}
        </div>
      </section>

      <section className="durak-results-actions">
        {isHost ? (
          <button
            type="button"
            className="btn btn-primary"
            disabled={commandPending || !connected}
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
