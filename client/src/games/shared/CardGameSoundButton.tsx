import { FiVolume2, FiVolumeX } from "react-icons/fi";

export function CardGameSoundButton({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className="btn btn-secondary card-game-sound"
      onClick={onToggle}
      aria-pressed={enabled}
      aria-label={enabled ? "Выключить звуки игры" : "Включить звуки игры"}
      title={enabled ? "Звуки игры включены" : "Звуки игры выключены"}
    >
      {enabled ? <FiVolume2 aria-hidden="true" /> : <FiVolumeX aria-hidden="true" />}
      <span>Звук</span>
    </button>
  );
}
