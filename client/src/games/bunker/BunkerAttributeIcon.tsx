import type { AttributeType } from "../../../../shared/games/bunker/types";

type BunkerCardType = AttributeType | "action";

// Compact silhouettes of the existing card symbols, readable beside a category label.
export const BUNKER_ATTRIBUTE_ICONS: Record<BunkerCardType, string> = {
  profession: "M8 6V4h8v2 M4 6h16v14H4Z M4 11c4 3 12 3 16 0 M10 12v3h4v-3",
  bio: "M15 11a5 5 0 1 1-10 0 5 5 0 0 1 10 0 M10 16v6 M7 19h6 M14 7l6-6 M16 1h4v4",
  health:
    "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z M3 11h4l2-4 3 8 2-4h7",
  hobby:
    "M7 7h10c2 0 3 2 3.5 4l1 6c.5 3-2.5 4-4 2l-2-3h-7l-2 3c-1.5 2-4.5 1-4-2l1-6C4 9 5 7 7 7Z M7 10v4 M5 12h4 M16 11h.01 M18 13h.01",
  baggage:
    "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2 M7 6h10a3 3 0 0 1 3 3v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a3 3 0 0 1 3-3Z M8 13h8v5H8Z M8 9h8",
  fact: "M12 3 2 21h20L12 3Z M12 9v5 M12 17h.01",
  action: "M13 2 3 14h8l-1 8L21 10h-8l1-8Z",
};

export function BunkerAttributeIcon({ type }: { type: BunkerCardType }) {
  return (
    <svg
      className="bunker-attribute-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={BUNKER_ATTRIBUTE_ICONS[type]} />
    </svg>
  );
}
