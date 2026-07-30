import type { UnoSettings } from "../../../../shared/games/uno/types";
import { usePlatform } from "../../platform/context/PlatformContext";

const TIMER_OPTIONS: readonly { value: UnoSettings["turnTimeoutSeconds"]; label: string }[] = [
  { value: null, label: "Без лимита" },
  { value: 30, label: "30 секунд" },
  { value: 60, label: "60 секунд" },
  { value: 90, label: "90 секунд" },
];

export function getUnoTurnTimeoutLabel(value: UnoSettings["turnTimeoutSeconds"]): string {
  return TIMER_OPTIONS.find((option) => option.value === value)?.label ?? "Без лимита";
}

export function UnoLobbySettings() {
  const { snapshot, connected, reconnectState, commandPending, updateSettings } = usePlatform();
  if (!snapshot || snapshot.gameId !== "uno") return null;

  const viewerSeatId = snapshot.viewer.role === "player" ? snapshot.viewer.seatId : null;
  const viewerSeat = viewerSeatId
    ? snapshot.seats.find((seat) => seat.seatId === viewerSeatId)
    : null;
  const isHost = viewerSeat?.isHost ?? false;
  const canChange = isHost && connected && reconnectState === "connected" && !commandPending;
  const currentValue = snapshot.settings.turnTimeoutSeconds;

  return (
    <section className="uno-lobby-settings" aria-labelledby="uno-timer-settings-title">
      <div>
        <span className="uno-eyebrow">Настройки партии</span>
        <h3 id="uno-timer-settings-title">Таймер хода</h3>
        <p>
          {isHost
            ? "Выберите время на ход. Предел комнаты — от 2 до 10 игроков."
            : `Выбрано хостом: ${getUnoTurnTimeoutLabel(currentValue)}.`}
        </p>
      </div>
      <div className="uno-timer-options" role="group" aria-label="Таймер хода">
        {TIMER_OPTIONS.map((option) => (
          <button
            type="button"
            key={option.label}
            className={currentValue === option.value ? "is-active" : ""}
            aria-pressed={currentValue === option.value}
            disabled={!canChange || currentValue === option.value}
            onClick={() => updateSettings("uno", { turnTimeoutSeconds: option.value })}
          >
            {option.label}
          </button>
        ))}
      </div>
    </section>
  );
}
