import type { DuelSnapshot } from "../../../../shared/platform/duels";

export const memorySymbols = [
  "🍒",
  "🍋",
  "🍇",
  "🍀",
  "🌙",
  "⭐",
  "🔥",
  "💎",
  "🎲",
  "🎵",
  "🌸",
  "🦋",
];

/** The server's reveal deadline applies to both renderers, including delayed snapshots. */
export function visibleMemoryCards(memory: NonNullable<DuelSnapshot["memory"]>, now: number) {
  return memory.cards.map((value, i) =>
    memory.matched[i] || memory.open.length < 2 || now < memory.revealUntil ? value : null,
  );
}
