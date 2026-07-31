import type {
  DurakCard as DurakCardData,
  DurakRank,
  DurakSuit,
} from "../../../../../shared/games/durak/types";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

const SUIT_SYMBOLS: Record<DurakSuit, string> = {
  clubs: "♣",
  diamonds: "♦",
  hearts: "♥",
  spades: "♠",
};

const SUIT_LABELS: Record<DurakSuit, string> = {
  clubs: "треф",
  diamonds: "бубен",
  hearts: "червей",
  spades: "пик",
};

const RANK_LABELS: Record<DurakRank, string> = {
  "6": "6",
  "7": "7",
  "8": "8",
  "9": "9",
  "10": "10",
  jack: "В",
  queen: "Д",
  king: "К",
  ace: "Т",
};

const RANK_NAMES: Record<DurakRank, string> = {
  "6": "шестёрка",
  "7": "семёрка",
  "8": "восьмёрка",
  "9": "девятка",
  "10": "десятка",
  jack: "валет",
  queen: "дама",
  king: "король",
  ace: "туз",
};

export function getSuitSymbol(suit: DurakSuit): string {
  return SUIT_SYMBOLS[suit];
}

export function getCardName(card: DurakCardData): string {
  return `${RANK_NAMES[card.rank]} ${SUIT_LABELS[card.suit]}`;
}

interface DurakCardProps {
  card: DurakCardData;
  size?: "hand" | "table" | "mini";
  selected?: boolean;
  playable?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
  onKeyboardActivate?: () => void;
  ariaLabel?: string;
  ariaDescribedBy?: string;
}

export function DurakCard({
  card,
  size = "table",
  selected,
  playable = false,
  disabled = false,
  onClick,
  onDoubleClick,
  onKeyboardActivate,
  ariaLabel,
  ariaDescribedBy,
}: DurakCardProps) {
  const accessibleName = ariaLabel ?? getCardName(card);
  const className = [
    "durak-card",
    `is-${size}`,
    card.suit === "diamonds" || card.suit === "hearts" ? "is-red" : "is-black",
    selected ? "is-selected" : "",
    playable ? "is-playable" : "",
    disabled ? "is-disabled" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const content = (
    <>
      <span className="durak-card-corner">
        <strong>{RANK_LABELS[card.rank]}</strong>
        <span>{SUIT_SYMBOLS[card.suit]}</span>
      </span>
      <span className="durak-card-suit" aria-hidden="true">
        {SUIT_SYMBOLS[card.suit]}
      </span>
      <span className="durak-card-corner is-bottom" aria-hidden="true">
        <strong>{RANK_LABELS[card.rank]}</strong>
        <span>{SUIT_SYMBOLS[card.suit]}</span>
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
        onClick={
          onClick
            ? (event) => {
                if (event.detail <= 1) onClick();
              }
            : undefined
        }
        onDoubleClick={onDoubleClick}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        aria-pressed={selected}
        aria-label={accessibleName}
        aria-describedby={ariaDescribedBy}
        title={accessibleName}
      >
        {content}
      </button>
    );
  }

  return (
    <div className={className} aria-label={accessibleName} role="img" title={accessibleName}>
      {content}
    </div>
  );
}

export function DurakCardBack({ label = "Карта рубашкой вверх" }: { label?: string }) {
  return (
    <div className="durak-card durak-card-back is-table" role="img" aria-label={label}>
      <span aria-hidden="true">◆</span>
    </div>
  );
}
