import type { UnoCard as UnoCardData, UnoColor } from "../../../../../shared/games/uno/types";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import cardBack from "../assets/card-back.svg";
import drawTwoIcon from "../assets/draw-two.svg";
import reverseIcon from "../assets/reverse.svg";
import skipIcon from "../assets/skip.svg";
import wildDrawFourIcon from "../assets/wild-draw-four.svg";
import wildIcon from "../assets/wild.svg";

const COLOR_NAMES: Record<UnoColor, string> = {
  red: "красный",
  yellow: "жёлтый",
  green: "зелёный",
  blue: "синий",
};

const ACTION_NAMES = {
  skip: "Пропуск",
  reverse: "Смена направления",
  "draw-two": "Возьми две",
  wild: "Смена цвета",
  "wild-draw-four": "Смена цвета и четыре",
} as const;

function cardMark(card: UnoCardData): string {
  if (card.kind === "number") return String(card.number);
  if (card.kind === "skip") return "⊘";
  if (card.kind === "reverse") return "↺";
  if (card.kind === "draw-two") return "+2";
  if (card.kind === "wild") return "✦";
  return "+4";
}

function actionIcon(card: UnoCardData): string | null {
  if (card.kind === "skip") return skipIcon;
  if (card.kind === "reverse") return reverseIcon;
  if (card.kind === "draw-two") return drawTwoIcon;
  if (card.kind === "wild") return wildIcon;
  if (card.kind === "wild-draw-four") return wildDrawFourIcon;
  return null;
}

export function getUnoCardName(card: UnoCardData): string {
  const mark = card.kind === "number" ? `карта ${card.number}` : ACTION_NAMES[card.kind];
  return card.color ? `${mark}, ${COLOR_NAMES[card.color]}` : mark;
}

interface UnoCardProps {
  card: UnoCardData;
  size?: "hand" | "table" | "mini";
  selected?: boolean;
  playable?: boolean;
  bluffable?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
  onKeyboardActivate?: () => void;
  ariaLabel?: string;
  ariaDescribedBy?: string;
}

export function UnoCard({
  card,
  size = "table",
  selected = false,
  playable = false,
  bluffable = false,
  disabled = false,
  onClick,
  onDoubleClick,
  onKeyboardActivate,
  ariaLabel,
  ariaDescribedBy,
}: UnoCardProps) {
  const className = [
    "uno-card",
    `is-${size}`,
    card.color ? `is-${card.color}` : "is-wild",
    selected ? "is-selected" : "",
    playable ? "is-playable" : "",
    bluffable ? "is-bluffable" : "",
    disabled ? "is-disabled" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const mark = cardMark(card);
  const icon = actionIcon(card);
  const content = (
    <>
      <span className="uno-card-corner" aria-hidden="true">
        {mark}
      </span>
      <span className="uno-card-core" aria-hidden="true">
        {icon ? <img src={icon} alt="" /> : mark}
      </span>
      <span className="uno-card-corner is-bottom" aria-hidden="true">
        {mark}
      </span>
    </>
  );

  if (onClick || onDoubleClick || onKeyboardActivate) {
    const handleKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
      if (!onKeyboardActivate || (event.key !== "Enter" && event.key !== " ")) return;
      event.preventDefault();
      onKeyboardActivate();
    };
    return (
      <button
        type="button"
        className={className}
        disabled={disabled}
        onClick={
          onClick
            ? (event) => {
                if (event.detail <= 1) onClick();
              }
            : undefined
        }
        onDoubleClick={onDoubleClick}
        onKeyDown={handleKeyDown}
        aria-pressed={selected || undefined}
        aria-label={ariaLabel ?? getUnoCardName(card)}
        aria-describedby={ariaDescribedBy}
      >
        {content}
      </button>
    );
  }

  return (
    <div className={className} role="img" aria-label={ariaLabel ?? getUnoCardName(card)}>
      {content}
    </div>
  );
}

export function UnoCardBack({ label = "Карта рубашкой вверх" }: { label?: string }) {
  return (
    <div className="uno-card uno-card-back is-table" role="img" aria-label={label}>
      <img src={cardBack} alt="" aria-hidden="true" />
    </div>
  );
}
