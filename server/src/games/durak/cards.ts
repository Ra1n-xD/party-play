import type { DurakCard, DurakRank, DurakSuit } from "../../../../shared/types.js";

export const DURAK_SUITS: readonly DurakSuit[] = ["clubs", "diamonds", "hearts", "spades"];

export const DURAK_RANKS: readonly DurakRank[] = [
  "6",
  "7",
  "8",
  "9",
  "10",
  "jack",
  "queen",
  "king",
  "ace",
];

const RANK_VALUE: Readonly<Record<DurakRank, number>> = Object.fromEntries(
  DURAK_RANKS.map((rank, index) => [rank, index]),
) as Record<DurakRank, number>;

const SUIT_VALUE: Readonly<Record<DurakSuit, number>> = Object.fromEntries(
  DURAK_SUITS.map((suit, index) => [suit, index]),
) as Record<DurakSuit, number>;

export function createDurakDeck(): DurakCard[] {
  return DURAK_SUITS.flatMap((suit) =>
    DURAK_RANKS.map((rank) => ({
      id: `${suit}-${rank}`,
      suit,
      rank,
    })),
  );
}

export function durakRankValue(rank: DurakRank): number {
  return RANK_VALUE[rank];
}

export function canBeatDurakCard(
  defense: DurakCard,
  attack: DurakCard,
  trumpSuit: DurakSuit,
): boolean {
  if (attack.suit === trumpSuit) {
    return defense.suit === trumpSuit && durakRankValue(defense.rank) > durakRankValue(attack.rank);
  }
  if (defense.suit === trumpSuit) return true;
  return defense.suit === attack.suit && durakRankValue(defense.rank) > durakRankValue(attack.rank);
}

export function compareDurakCards(
  first: DurakCard,
  second: DurakCard,
  trumpSuit?: DurakSuit,
): number {
  if (first.suit !== second.suit) {
    if (trumpSuit) {
      if (first.suit === trumpSuit) return 1;
      if (second.suit === trumpSuit) return -1;
    }
    return SUIT_VALUE[first.suit] - SUIT_VALUE[second.suit];
  }
  return durakRankValue(first.rank) - durakRankValue(second.rank);
}

export function sortDurakHand(cards: readonly DurakCard[], trumpSuit: DurakSuit): DurakCard[] {
  return [...cards].sort((first, second) => compareDurakCards(first, second, trumpSuit));
}

export function durakCardCost(card: DurakCard, trumpSuit: DurakSuit): number {
  return durakRankValue(card.rank) + (card.suit === trumpSuit ? 20 : 0);
}
