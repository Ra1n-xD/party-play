import { useState, useEffect } from 'react';

interface TimerProps {
  endTime: number | null;
}

export function Timer({ endTime }: TimerProps) {
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (!endTime) {
      setSecondsLeft(0);
      return;
    }

    const update = () => {
      const remaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
      setSecondsLeft(remaining);
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [endTime]);

  if (!endTime || secondsLeft <= 0) return null;

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;

  return (
    <div className="timer">
      <span className="timer-icon">⏱</span>
      <span className="timer-value">
        {minutes > 0 ? `${minutes}:${seconds.toString().padStart(2, '0')}` : `${seconds}с`}
      </span>
    </div>
  );
}
