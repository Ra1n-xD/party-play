import { FiSliders } from "react-icons/fi";

export type HandSortMode = "suit" | "rank";

interface HandSortButtonProps {
  mode: HandSortMode;
  onToggle: () => void;
}

export function HandSortButton({ mode, onToggle }: HandSortButtonProps) {
  const currentLabel = mode === "suit" ? "по масти" : "по номиналу";
  const nextLabel = mode === "suit" ? "по номиналу" : "по масти";

  return (
    <button
      type="button"
      className="gs-room-tool game-dock-tool hand-sort-button"
      onClick={onToggle}
      aria-label={`Сортировка карт ${currentLabel}. Переключить на сортировку ${nextLabel}`}
      title={`Сортировка карт ${currentLabel}`}
    >
      <FiSliders aria-hidden="true" />
      <span>{mode === "suit" ? "По масти" : "По номиналу"}</span>
    </button>
  );
}
