import { randomInt } from "crypto";
import type { UnoCard, UnoColor, UnoNumber } from "../../../../shared/types.js";

export const UNO_COLORS: readonly UnoColor[] = ["red", "yellow", "green", "blue"];
const UNO_NUMBERS: readonly UnoNumber[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const UNO_COLOR_VALUE: Readonly<Record<UnoColor, number>> = Object.fromEntries(
  UNO_COLORS.map((color, index) => [color, index]),
) as Record<UnoColor, number>;
const UNO_KIND_VALUE: Readonly<Record<UnoCard["kind"], number>> = {
  number: 0,
  skip: 10,
  reverse: 11,
  "draw-two": 12,
  wild: 13,
  "wild-draw-four": 14,
};

function coloredNumber(color: UnoColor, number: UnoNumber, copy: number): UnoCard {
  return { id: `${color}-number-${number}-${copy}`, color, kind: "number", number };
}

function coloredAction(
  color: UnoColor,
  kind: "skip" | "reverse" | "draw-two",
  copy: number,
): UnoCard {
  return { id: `${color}-${kind}-${copy}`, color, kind, number: null };
}

/** Creates the classic 108-card UNO deck with stable, unique card identities. */
export function createUnoDeck(): UnoCard[] {
  const deck: UnoCard[] = [];
  for (const color of UNO_COLORS) {
    deck.push(coloredNumber(color, 0, 1));
    for (const number of UNO_NUMBERS.slice(1)) {
      deck.push(coloredNumber(color, number, 1), coloredNumber(color, number, 2));
    }
    for (const kind of ["skip", "reverse", "draw-two"] as const) {
      deck.push(coloredAction(color, kind, 1), coloredAction(color, kind, 2));
    }
  }
  for (let copy = 1; copy <= 4; copy++) {
    deck.push({ id: `wild-${copy}`, color: null, kind: "wild", number: null });
    deck.push({ id: `wild-draw-four-${copy}`, color: null, kind: "wild-draw-four", number: null });
  }
  return deck;
}

/** Fisher-Yates using Node's cryptographically secure randomInt. */
export function shuffleUnoDeck<T>(cards: readonly T[]): T[] {
  const shuffled = [...cards];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const replacement = randomInt(index + 1);
    [shuffled[index], shuffled[replacement]] = [shuffled[replacement], shuffled[index]];
  }
  return shuffled;
}

export function randomUnoColor(): UnoColor {
  return UNO_COLORS[randomInt(UNO_COLORS.length)];
}

export function isWild(card: UnoCard): boolean {
  return card.kind === "wild" || card.kind === "wild-draw-four";
}

export function compareUnoCards(first: UnoCard, second: UnoCard): number {
  const firstColor = first.color === null ? UNO_COLORS.length : UNO_COLOR_VALUE[first.color];
  const secondColor = second.color === null ? UNO_COLORS.length : UNO_COLOR_VALUE[second.color];
  const colorDifference = firstColor - secondColor;
  if (colorDifference !== 0) return colorDifference;

  const firstValue = first.kind === "number" ? (first.number ?? 0) : UNO_KIND_VALUE[first.kind];
  const secondValue = second.kind === "number" ? (second.number ?? 0) : UNO_KIND_VALUE[second.kind];
  return firstValue - secondValue || first.id.localeCompare(second.id);
}

export function sortUnoHand(cards: readonly UnoCard[]): UnoCard[] {
  return [...cards].sort(compareUnoCards);
}

export function canPlayUnoCard(card: UnoCard, topDiscard: UnoCard, activeColor: UnoColor): boolean {
  if (isWild(card)) return true;
  if (card.color === activeColor) return true;
  if (card.kind !== topDiscard.kind) return false;
  return card.kind !== "number" || card.number === topDiscard.number;
}
