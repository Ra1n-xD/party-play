import { useEffect, useState } from "react";
import { FiClock } from "react-icons/fi";

export function CardTurnClock({
  remainingMs,
  paused,
}: {
  remainingMs: number | null;
  paused: boolean;
}) {
  const [seconds, setSeconds] = useState<number | null>(null);
  useEffect(() => {
    if (remainingMs == null) {
      setSeconds(null);
      return;
    }
    const end = Date.now() + remainingMs;
    const update = () => setSeconds(Math.max(0, Math.ceil((end - Date.now()) / 1000)));
    update();
    if (paused) return;
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [remainingMs, paused]);
  return (
    <span className="card-2d-clock">
      <FiClock aria-hidden="true" />
      {paused
        ? "Пауза"
        : seconds == null
          ? "Без таймера"
          : String(Math.floor(seconds / 60)).padStart(2, "0") +
            ":" +
            String(seconds % 60).padStart(2, "0")}
    </span>
  );
}
