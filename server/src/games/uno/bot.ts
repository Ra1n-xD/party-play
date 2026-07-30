import type {
  UnoCard,
  UnoColor,
  UnoCommand,
  UnoPrivateState,
  UnoPublicState,
} from "../../../../shared/types.js";
import { UNO_COLORS } from "./cards.js";

function chooseColor(hand: readonly UnoCard[]): UnoColor {
  const counts = new Map<UnoColor, number>(UNO_COLORS.map((color) => [color, 0]));
  for (const card of hand) {
    if (card.color) counts.set(card.color, (counts.get(card.color) ?? 0) + 1);
  }
  return [...UNO_COLORS].sort(
    (first, second) => (counts.get(second) ?? 0) - (counts.get(first) ?? 0),
  )[0];
}

function playCommand(card: UnoCard, hand: readonly UnoCard[]): UnoCommand {
  const leavesOne = hand.length === 2;
  return card.color === null
    ? {
        type: "play-card",
        cardId: card.id,
        chosenColor: chooseColor(hand.filter((item) => item.id !== card.id)),
        declareUno: leavesOne,
      }
    : { type: "play-card", cardId: card.id, declareUno: leavesOne };
}

export function chooseUnoBotCommand(
  _publicState: Readonly<UnoPublicState>,
  privateState: Readonly<UnoPrivateState>,
  random: () => number = Math.random,
): UnoCommand | null {
  const legal = privateState.legalActions;
  if (legal.catchUno) return { type: "catch-uno", windowId: legal.catchUno.windowId };
  if (legal.canDeclareUno && legal.declareUnoWindowId !== null) {
    return { type: "declare-uno", windowId: legal.declareUnoWindowId };
  }
  if (legal.canChooseInitialColor)
    return { type: "choose-initial-color", color: chooseColor(privateState.hand) };
  if (legal.wildDrawFourResponseId !== null) {
    return {
      type: "respond-wild-draw-four",
      pendingId: legal.wildDrawFourResponseId,
      decision: random() < 0.35 ? "challenge" : "accept",
    };
  }
  const playable = privateState.hand.filter((card) => legal.playableCardIds.includes(card.id));
  if (playable.length > 0) {
    const nonBluff = playable.filter(
      (card) => !legal.bluffableWildDrawFourCardIds.includes(card.id),
    );
    return playCommand(nonBluff[0] ?? playable[0], privateState.hand);
  }
  if (legal.canDraw) return { type: "draw-card" };
  if (legal.canEndTurn) return { type: "end-turn" };
  if (legal.canDeclareUno) return { type: "declare-uno" };
  return null;
}
