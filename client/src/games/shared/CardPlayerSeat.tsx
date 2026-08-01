import { useEffect, useState, type CSSProperties } from "react";

interface CardPlayerAction {
  eventId: string | number;
  label: string;
}

interface CardPlayerSeatProps {
  seatId: string;
  name: string;
  cardCount: number;
  connected: boolean;
  controllerKind: "human" | "bot" | "none";
  temporaryBot: boolean;
  isHost: boolean;
  isDealer: boolean;
  isMe: boolean;
  isCurrent: boolean;
  status: "active" | "out" | "excluded";
  paused: boolean;
  turnRemainingMs: number | null;
  turnTimeoutMs: number | null;
  turnAnimationKey: string;
  action?: CardPlayerAction;
}

function formatCardCount(count: number): string {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return `${count} карт`;
  if (mod10 === 1) return `${count} карта`;
  if (mod10 >= 2 && mod10 <= 4) return `${count} карты`;
  return `${count} карт`;
}

function formatSeconds(count: number): string {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return `${count} секунд`;
  if (mod10 === 1) return `${count} секунда`;
  if (mod10 >= 2 && mod10 <= 4) return `${count} секунды`;
  return `${count} секунд`;
}

export function CardPlayerSeat({
  seatId,
  name,
  cardCount,
  connected,
  controllerKind,
  temporaryBot,
  isHost,
  isDealer,
  isMe,
  isCurrent,
  status,
  paused,
  turnRemainingMs,
  turnTimeoutMs,
  turnAnimationKey,
  action,
}: CardPlayerSeatProps) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const cardCountLabel = formatCardCount(cardCount);
  const statusLabel = status === "out" ? "Вышел" : status === "excluded" ? "Исключён" : null;
  const isInactive = status !== "active";
  const remainingRatio =
    turnRemainingMs != null && turnTimeoutMs != null && turnTimeoutMs > 0
      ? Math.max(0, Math.min(1, turnRemainingMs / turnTimeoutMs))
      : 1;
  const turnBorderStyle = {
    "--card-turn-duration": `${Math.max(turnRemainingMs ?? 0, 1)}ms`,
    "--card-turn-elapsed": 100 - remainingRatio * 100,
  } as CSSProperties;

  useEffect(() => {
    if (!isCurrent || paused || turnRemainingMs == null || turnTimeoutMs == null) {
      setSecondsLeft(null);
      return;
    }

    const endTime = Date.now() + turnRemainingMs;
    const update = () => setSecondsLeft(Math.max(0, Math.ceil((endTime - Date.now()) / 1000)));
    update();
    const interval = window.setInterval(update, 1_000);
    return () => window.clearInterval(interval);
  }, [isCurrent, paused, turnAnimationKey, turnRemainingMs, turnTimeoutMs]);

  const turnStatusLabel = !isCurrent
    ? null
    : paused
      ? "таймер хода приостановлен"
      : turnRemainingMs != null && turnTimeoutMs != null
        ? secondsLeft == null
          ? "идёт отсчёт времени хода"
          : secondsLeft > 0
            ? `на ход осталось ${formatSeconds(secondsLeft)}`
            : "время хода истекло"
        : "ход без ограничения времени";
  const statusParts = [
    isMe ? "это вы" : null,
    isHost ? "хост" : null,
    isDealer ? "сдающий" : null,
    temporaryBot ? "временно играет бот" : controllerKind === "bot" ? "бот" : null,
    !connected ? "нет связи" : null,
    statusLabel?.toLocaleLowerCase("ru-RU") ?? null,
    isCurrent ? (paused ? "ход приостановлен" : "сейчас ходит") : null,
    turnStatusLabel,
    cardCountLabel,
  ].filter(Boolean);

  return (
    <article
      data-card-player-seat={seatId}
      className={[
        "card-player-seat",
        isMe ? "is-me" : "",
        isCurrent ? "is-current" : "",
        isInactive ? "is-inactive" : "",
        paused && isCurrent ? "is-paused" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={`${name}: ${statusParts.join(", ")}`}
      title={name}
    >
      {isCurrent && (
        <>
          <svg
            key={turnAnimationKey}
            className={`card-player-turn-border ${
              turnRemainingMs == null || turnTimeoutMs == null ? "is-unlimited" : ""
            } ${paused ? "is-paused" : ""}`}
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
            style={turnBorderStyle}
          >
            <rect x="2" y="2" width="96" height="96" rx="15" pathLength="100" />
          </svg>
          <span className="card-player-turn-status">{turnStatusLabel}</span>
        </>
      )}

      <span className="card-player-seat-initial" aria-hidden="true">
        {name.trim().charAt(0).toLocaleUpperCase("ru-RU") || "?"}
      </span>

      <span className="card-player-seat-count" aria-label={cardCountLabel}>
        {cardCount}
      </span>

      <strong className="card-player-seat-name">{name}</strong>

      {action && (
        <span className="card-player-action" key={action.eventId}>
          {action.label}
        </span>
      )}
    </article>
  );
}
