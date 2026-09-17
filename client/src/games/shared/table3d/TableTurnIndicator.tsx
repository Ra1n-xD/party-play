import { useEffect, useState } from "react";

interface Props {
  label: string;
  detail: string;
  isYourTurn: boolean;
  paused: boolean;
  remainingMs?: number | null;
  deadline?: number | null;
  revision?: number;
}

/** A fixed turn cue remains visible even when the actor is outside the camera's view. */
export function TableTurnIndicator({
  label,
  detail,
  isYourTurn,
  paused,
  remainingMs = null,
  deadline = null,
  revision,
}: Props) {
  const [seconds, setSeconds] = useState<number | null>(null);
  useEffect(() => {
    const end = deadline ?? (remainingMs === null ? null : Date.now() + remainingMs);
    const update = () =>
      setSeconds(end === null ? null : Math.max(0, Math.ceil((end - Date.now()) / 1000)));
    update();
    if (paused || end === null) return;
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [remainingMs, deadline, paused, revision]);

  const yours = isYourTurn && !paused;
  const urgency =
    !paused && seconds !== null && seconds <= 10
      ? seconds <= 5
        ? " is-critical"
        : " is-urgent"
      : "";
  const time =
    seconds === null ? "—" : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  return (
    <div
      className={`table3d-turn-indicator${yours ? " is-yours" : ""}${paused ? " is-paused" : ""}${urgency}`}
    >
      <div className="table3d-turn-copy" role="status" aria-atomic="true">
        <span className="table3d-turn-eyebrow">
          <i aria-hidden="true" />
          {paused ? "ИГРА ПРИОСТАНОВЛЕНА" : "СЕЙЧАС ЗА СТОЛОМ"}
        </span>
        <strong title={paused ? "Пауза" : label}>{paused ? "Пауза" : label}</strong>
        <span className="table3d-turn-detail">
          {paused ? "Ожидаем продолжения партии" : detail}
        </span>
      </div>
      {(seconds !== null || paused) && (
        <div
          className="table3d-turn-clock"
          role="timer"
          aria-live="off"
          aria-label={paused ? "Таймер остановлен" : `Осталось ${seconds} секунд`}
        >
          <strong>{paused ? "Ⅱ" : time}</strong>
          <span>{paused ? "пауза" : "осталось"}</span>
        </div>
      )}
    </div>
  );
}
