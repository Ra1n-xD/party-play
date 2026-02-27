import { AttributeType } from "../../../shared/types";

type CardType = AttributeType | "action";

interface CardImageProps {
  type: CardType;
  className?: string;
}

const CARD_CONFIG: Record<
  CardType,
  { color: string; label: string; icon: JSX.Element }
> = {
  profession: {
    color: "#f59e0b",
    label: "ПРОФЕССИЯ",
    icon: (
      // Person with briefcase
      <>
        <circle cx="50" cy="30" r="10" fill="#1a1a1a" />
        <path d="M38 44c0-6.6 5.4-12 12-12s12 5.4 12 12v4H38v-4z" fill="#1a1a1a" />
        <rect x="30" y="52" width="40" height="22" rx="3" fill="#1a1a1a" />
        <path d="M42 52v-4a4 4 0 014-4h8a4 4 0 014 4v4" stroke="#daa520" strokeWidth="2.5" fill="none" />
        <line x1="50" y1="58" x2="50" y2="68" stroke="#daa520" strokeWidth="2.5" />
        <line x1="44" y1="63" x2="56" y2="63" stroke="#daa520" strokeWidth="2.5" />
      </>
    ),
  },
  bio: {
    color: "#f97316",
    label: "БИОЛОГИЯ",
    icon: (
      // Male/Female symbol combined
      <>
        {/* Circle body */}
        <circle cx="50" cy="48" r="16" stroke="#1a1a1a" strokeWidth="5" fill="none" />
        {/* Male arrow (top-right) */}
        <line x1="61" y1="37" x2="72" y2="26" stroke="#1a1a1a" strokeWidth="5" strokeLinecap="round" />
        <polyline points="64,26 72,26 72,34" stroke="#1a1a1a" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        {/* Female cross (bottom) */}
        <line x1="50" y1="64" x2="50" y2="78" stroke="#1a1a1a" strokeWidth="5" strokeLinecap="round" />
        <line x1="43" y1="72" x2="57" y2="72" stroke="#1a1a1a" strokeWidth="5" strokeLinecap="round" />
      </>
    ),
  },
  health: {
    color: "#ef4444",
    label: "ЗДОРОВЬЕ",
    icon: (
      // Heart with pulse line
      <>
        <path
          d="M50 75C30 60 18 48 18 36c0-9 7-16 16-16 5 0 10 3 13 7l3 4 3-4c3-4 8-7 13-7 9 0 16 7 16 16 0 12-12 24-32 39z"
          fill="#1a1a1a"
        />
        <polyline
          points="28,50 38,50 42,38 46,60 50,44 54,54 58,50 72,50"
          stroke="#daa520"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </>
    ),
  },
  hobby: {
    color: "#22c55e",
    label: "ХОББИ",
    icon: (
      // Gamepad controller
      <>
        {/* Controller body */}
        <path
          d="M22 42c-4 0-7 3-7 7v8c0 6 4 12 10 12 4 0 6-2 8-6l3-6h28l3 6c2 4 4 6 8 6 6 0 10-6 10-12v-8c0-4-3-7-7-7H22z"
          fill="#1a1a1a"
        />
        {/* D-pad */}
        <rect x="30" y="48" width="4" height="12" rx="1" fill="#daa520" />
        <rect x="26" y="52" width="12" height="4" rx="1" fill="#daa520" />
        {/* Buttons */}
        <circle cx="66" cy="50" r="3" fill="#daa520" />
        <circle cx="72" cy="56" r="3" fill="#daa520" />
        {/* Stars above */}
        <path d="M40 30l2 4 4.5.7-3.2 3.2.8 4.5L40 40l-4.1 2.4.8-4.5-3.2-3.2L38 34z" fill="#1a1a1a" />
        <path d="M60 26l2 4 4.5.7-3.2 3.2.8 4.5L60 36l-4.1 2.4.8-4.5-3.2-3.2L58 30z" fill="#1a1a1a" />
      </>
    ),
  },
  baggage: {
    color: "#3b82f6",
    label: "БАГАЖ",
    icon: (
      // Backpack
      <>
        <rect x="32" y="36" width="36" height="38" rx="5" fill="#1a1a1a" />
        <path d="M40 36v-6a6 6 0 016-6h8a6 6 0 016 6v6" stroke="#1a1a1a" strokeWidth="4" fill="none" />
        <rect x="38" y="50" width="24" height="14" rx="3" stroke="#daa520" strokeWidth="2.5" fill="none" />
        <line x1="50" y1="52" x2="50" y2="62" stroke="#daa520" strokeWidth="2.5" strokeLinecap="round" />
        <line x1="44" y1="57" x2="56" y2="57" stroke="#daa520" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M32 44c-4 0-6 2-6 6v14c0 2 1 4 3 4" stroke="#1a1a1a" strokeWidth="3" fill="none" />
        <path d="M68 44c4 0 6 2 6 6v14c0 2-1 4-3 4" stroke="#1a1a1a" strokeWidth="3" fill="none" />
      </>
    ),
  },
  fact: {
    color: "#06b6d4",
    label: "ФАКТ",
    icon: (
      // Warning triangle with exclamation
      <>
        <path
          d="M50 24L18 76h64L50 24z"
          fill="#1a1a1a"
          stroke="#1a1a1a"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <line x1="50" y1="42" x2="50" y2="60" stroke="#daa520" strokeWidth="5" strokeLinecap="round" />
        <circle cx="50" cy="68" r="3" fill="#daa520" />
      </>
    ),
  },
  action: {
    color: "#a855f7",
    label: "ОСОБОЕ",
    icon: (
      // Lightning bolt
      <>
        <path
          d="M54 20L30 54h18L42 84 70 48H52L54 20z"
          fill="#1a1a1a"
          stroke="#1a1a1a"
          strokeWidth="1"
          strokeLinejoin="round"
        />
        <path
          d="M52 24L32 52h14L40 78 66 50H52L52 24z"
          fill="#daa520"
        />
      </>
    ),
  },
};

export function CardImage({ type, className }: CardImageProps) {
  const config = CARD_CONFIG[type];

  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      style={{ display: "block" }}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Colored border */}
      <rect x="0" y="0" width="100" height="100" rx="8" fill={config.color} />
      {/* Black header */}
      <rect x="4" y="4" width="92" height="20" rx="5" fill="#1a1a1a" />
      {/* Yellow center area */}
      <rect x="4" y="26" width="92" height="70" rx="5" fill="#daa520" />
      {/* Category label */}
      <text
        x="50"
        y="18"
        textAnchor="middle"
        fill="#daa520"
        fontSize="11"
        fontWeight="900"
        fontFamily="Arial, sans-serif"
        letterSpacing="1"
      >
        {config.label}
      </text>
      {/* Icon area */}
      <g transform="translate(0, 8)">{config.icon}</g>
    </svg>
  );
}
