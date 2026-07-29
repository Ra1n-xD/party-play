import type { UnoColor } from "../../../../../shared/games/uno/types";
import { AccessibleModal } from "../../../platform/components/AccessibleModal";

const COLORS: readonly { value: UnoColor; label: string }[] = [
  { value: "red", label: "Красный" },
  { value: "yellow", label: "Жёлтый" },
  { value: "green", label: "Зелёный" },
  { value: "blue", label: "Синий" },
];

interface UnoColorDialogProps {
  mode: "initial" | "wild";
  onChoose: (color: UnoColor) => void;
  onClose: () => void;
}

export function UnoColorDialog({ mode, onChoose, onClose }: UnoColorDialogProps) {
  const title = mode === "initial" ? "Выберите первый цвет" : "Выберите следующий цвет";

  return (
    <AccessibleModal
      labelledBy="uno-color-dialog-title"
      onClose={onClose}
      overlayClassName="uno-color-modal"
      panelClassName="uno-color-panel"
    >
      <div className="uno-color-dialog-heading">
        <div>
          <span className="uno-eyebrow">UNO</span>
          <h2 id="uno-color-dialog-title">{title}</h2>
        </div>
        <button type="button" className="uno-modal-close" onClick={onClose} aria-label="Закрыть">
          ×
        </button>
      </div>
      <p>
        {mode === "initial"
          ? "Первый цвет определит доступные карты для стартового хода."
          : "Цвет уйдёт на сервер вместе с выбранной картой одним действием."}
      </p>
      <div className="uno-color-choices" role="group" aria-label="Выбор цвета">
        {COLORS.map((color) => (
          <button
            type="button"
            key={color.value}
            className={`uno-color-choice is-${color.value}`}
            onClick={() => onChoose(color.value)}
          >
            <span aria-hidden="true" />
            {color.label}
          </button>
        ))}
      </div>
    </AccessibleModal>
  );
}
