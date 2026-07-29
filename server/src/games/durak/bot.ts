import type {
  DurakCard,
  DurakCommand,
  DurakPrivateState,
  DurakPublicState,
} from "../../../../shared/types.js";
import { durakCardCost, durakRankValue } from "./cards.js";

function nonEmptyCardIds(cards: readonly DurakCard[]): [string, ...string[]] | null {
  if (cards.length === 0) return null;
  return [cards[0].id, ...cards.slice(1).map((card) => card.id)];
}

function chooseLowestCards(
  cards: readonly DurakCard[],
  publicState: DurakPublicState,
): DurakCard[] {
  const trumpSuit = publicState.trumpSuit;
  if (!trumpSuit) return [...cards];
  return [...cards].sort(
    (first, second) => durakCardCost(first, trumpSuit) - durakCardCost(second, trumpSuit),
  );
}

function chooseAttack(
  publicState: DurakPublicState,
  privateState: DurakPrivateState,
  random: () => number,
): DurakCommand | null {
  const legal = privateState.legalAction;
  if (legal.type !== "attack") return null;
  const allowedIds = new Set(legal.playableCardIds);
  const groups = new Map<DurakCard["rank"], DurakCard[]>();
  for (const card of privateState.hand) {
    if (!allowedIds.has(card.id)) continue;
    const group = groups.get(card.rank) ?? [];
    group.push(card);
    groups.set(card.rank, group);
  }
  const trumpSuit = publicState.trumpSuit;
  if (!trumpSuit || groups.size === 0) return null;

  const rankedGroups = Array.from(groups.values())
    .map((group) => chooseLowestCards(group, publicState))
    .sort((first, second) => {
      const firstCost =
        Math.min(...first.map((card) => durakCardCost(card, trumpSuit))) -
        Math.min(2, first.length - 1);
      const secondCost =
        Math.min(...second.map((card) => durakCardCost(card, trumpSuit))) -
        Math.min(2, second.length - 1);
      return firstCost - secondCost;
    });
  const bestCost = durakCardCost(rankedGroups[0][0], trumpSuit);
  const tiedGroups = rankedGroups.filter(
    (group) => durakCardCost(group[0], trumpSuit) === bestCost,
  );
  const chosenGroup =
    tiedGroups[Math.min(tiedGroups.length - 1, Math.floor(random() * tiedGroups.length))];
  const selected = chosenGroup.slice(0, legal.maxCards);
  const cardIds = nonEmptyCardIds(selected);
  return cardIds ? { type: "attack", cardIds } : null;
}

function chooseDefense(
  publicState: DurakPublicState,
  privateState: DurakPrivateState,
): DurakCommand {
  const legal = privateState.legalAction;
  if (legal.type !== "defend" || !publicState.trumpSuit) return { type: "take" };
  const handById = new Map(privateState.hand.map((card) => [card.id, card]));
  const attackById = new Map(
    publicState.table
      .filter((pair) => pair.defense === null)
      .map((pair) => [pair.attack.id, pair.attack]),
  );
  const candidates = legal.targets.flatMap((target) => {
    const defenseCard = handById.get(target.defenseCardId);
    if (!defenseCard) return [];
    return target.attackCardIds.flatMap((attackCardId) => {
      const attackCard = attackById.get(attackCardId);
      if (!attackCard) return [];
      return [
        {
          defenseCard,
          attackCard,
          score:
            durakCardCost(defenseCard, publicState.trumpSuit!) * 20 -
            durakRankValue(attackCard.rank),
        },
      ];
    });
  });
  candidates.sort((first, second) => first.score - second.score);
  const chosen = candidates[0];
  return chosen
    ? {
        type: "defend",
        cardId: chosen.defenseCard.id,
        attackCardId: chosen.attackCard.id,
      }
    : { type: "take" };
}

function chooseThrowIn(
  publicState: DurakPublicState,
  privateState: DurakPrivateState,
): DurakCommand {
  const legal = privateState.legalAction;
  if (legal.type === "pass") return { type: "pass" };
  if (legal.type !== "throw-in" || !publicState.trumpSuit) return { type: "pass" };

  const allowedIds = new Set(legal.playableCardIds);
  const eligibleCards = chooseLowestCards(
    privateState.hand.filter((card) => allowedIds.has(card.id)),
    publicState,
  );
  if (eligibleCards.length === 0) return { type: "pass" };

  const canEmptyHand =
    privateState.hand.length <= legal.maxCards &&
    privateState.hand.every((card) => allowedIds.has(card.id));
  const conservativeCards = eligibleCards.filter(
    (card) =>
      publicState.deckCount === 0 ||
      card.suit !== publicState.trumpSuit ||
      durakRankValue(card.rank) <= durakRankValue("9"),
  );
  const selected = (
    canEmptyHand ? eligibleCards : conservativeCards.slice(0, Math.min(2, legal.maxCards))
  ).slice(0, legal.maxCards);
  const cardIds = nonEmptyCardIds(selected);
  return cardIds ? { type: "throw-in", cardIds } : { type: "pass" };
}

export function chooseDurakBotCommand(
  publicState: Readonly<DurakPublicState>,
  privateState: Readonly<DurakPrivateState>,
  random: () => number = Math.random,
): DurakCommand | null {
  switch (privateState.legalAction.type) {
    case "wait":
      return null;
    case "attack":
      return chooseAttack(
        publicState as DurakPublicState,
        privateState as DurakPrivateState,
        random,
      );
    case "defend":
      return chooseDefense(publicState as DurakPublicState, privateState as DurakPrivateState);
    case "throw-in":
    case "pass":
      return chooseThrowIn(publicState as DurakPublicState, privateState as DurakPrivateState);
  }
}
