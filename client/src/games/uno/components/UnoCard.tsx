import { useCardSkin } from "../../../platform/useCardSkin";
import { CardFaceArtwork } from "../../../platform/components/CardFaceArtwork";
import { CardBackArtwork } from "../../../platform/components/CardBackArtwork";
import type { CardSkinId } from "../../../../../shared/platform/cosmetics";
import type { UnoCard as UnoCardData, UnoColor } from "../../../../../shared/games/uno/types";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

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

export function getUnoCardMark(card: UnoCardData): string {
  if (card.kind === "number") return String(card.number);
  if (card.kind === "skip") return "⊘";
  if (card.kind === "reverse") return "↺";
  if (card.kind === "draw-two") return "+2";
  if (card.kind === "wild") return "✦";
  return "+4";
}

export function getUnoCardName(card: UnoCardData): string {
  const mark = card.kind === "number" ? `карта ${card.number}` : ACTION_NAMES[card.kind];
  return card.color ? `${mark}, ${COLOR_NAMES[card.color]}` : mark;
}

interface UnoCardProps {
  card: UnoCardData;
  skinId?: CardSkinId;
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
  skinId,
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
  const { skin, props: skinProps } = useCardSkin("uno", skinId);
  const className = [
    "uno-card has-shared-artwork",
    `is-${size}`,
    card.color ? `is-${card.color}` : "is-wild",
    selected ? "is-selected" : "",
    playable ? "is-playable" : "",
    bluffable ? "is-bluffable" : "",
    disabled ? "is-disabled" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const content = (
    <CardFaceArtwork
      face={{ game: "uno", rank: getUnoCardMark(card), color: card.color ?? "wild" }}
      skinId={skin.id}
    />
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
        {...skinProps}
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
        onContextMenu={(event) => event.preventDefault()}
        aria-pressed={selected || undefined}
        aria-label={ariaLabel ?? getUnoCardName(card)}
        aria-describedby={ariaDescribedBy}
      >
        {content}
      </button>
    );
  }

  return (
    <div
      className={className}
      {...skinProps}
      role="img"
      aria-label={ariaLabel ?? getUnoCardName(card)}
      onContextMenu={(event) => event.preventDefault()}
    >
      {content}
    </div>
  );
}

export function UnoCardBack({
  label = "Карта рубашкой вверх",
  skinId,
}: {
  label?: string;
  skinId?: CardSkinId;
}) {
  const { skin, props: skinProps } = useCardSkin("uno", skinId);
  return (
    <div
      {...skinProps}
      className="uno-card uno-card-back has-shared-artwork is-table"
      role="img"
      aria-label={label}
    >
      <CardBackArtwork game="uno" skinId={skin.id} />
    </div>
  );
}
