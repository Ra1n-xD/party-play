import type { DurakSettings } from "../../../../shared/games/durak/types";
import { usePlatform } from "../../platform/context/PlatformContext";

const TIMER_OPTIONS: readonly {
  value: DurakSettings["turnTimeoutSeconds"];
  label: string;
}[] = [
  { value: null, label: "Без лимита" },
  { value: 30, label: "30 секунд" },
  { value: 60, label: "60 секунд" },
  { value: 90, label: "90 секунд" },
];

export function getTurnTimeoutLabel(value: DurakSettings["turnTimeoutSeconds"]): string {
  return TIMER_OPTIONS.find((option) => option.value === value)?.label ?? "Без лимита";
}

export function DurakLobbySettings() {
  const { snapshot, connected, reconnectState, commandPending, updateSettings } = usePlatform();
  if (!snapshot || snapshot.gameId !== "durak") return null;

  const viewerSeatId = snapshot.viewer.role === "player" ? snapshot.viewer.seatId : null;
  const viewerSeat = viewerSeatId
    ? snapshot.seats.find((seat) => seat.seatId === viewerSeatId)
    : null;
  const isHost = viewerSeat?.isHost ?? false;
  const canChange = isHost && connected && reconnectState === "connected" && !commandPending;
  const currentValue = snapshot.settings.turnTimeoutSeconds;

  return (
    <section className="durak-lobby-settings" aria-labelledby="durak-timer-settings-title">
      <div>
        <span className="durak-section-eyebrow">Настройки партии</span>
        <h3 id="durak-timer-settings-title">Таймер хода</h3>
        <p>
          {isHost
            ? "Выберите время на решение. Без лимита автоматических действий не будет."
            : `Выбрано хостом: ${getTurnTimeoutLabel(currentValue)}.`}
        </p>
      </div>
      <div className="durak-timer-options" role="group" aria-label="Таймер хода">
        {TIMER_OPTIONS.map((option) => (
          <button
            type="button"
            key={option.label}
            className={currentValue === option.value ? "is-active" : ""}
            aria-pressed={currentValue === option.value}
            disabled={!canChange || currentValue === option.value}
            onClick={() =>
              updateSettings("durak", {
                turnTimeoutSeconds: option.value,
              })
            }
          >
            {option.label}
          </button>
        ))}
      </div>
    </section>
  );
}
