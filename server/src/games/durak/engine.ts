import {
  DURAK_INITIAL_DEAL_READY_DELAY_MS,
  DURAK_ROUND_TRANSITION_DELAY_MS,
  type DurakCard,
  type DurakCommand,
  type DurakResult,
  type DurakSettings,
  type DurakTablePair,
  type DurakVisualAction,
  type SeatId,
  type CardVisualAnchor,
} from "../../../../shared/types.js";
import { canBeatDurakCard, createDurakDeck, durakRankValue, sortDurakHand } from "./cards.js";
import type { DurakFight, DurakGameState, DurakTurn, DurakTurnKind } from "./runtime.js";

export type DurakEngineResult =
  | { success: true; state: DurakGameState }
  | { success: false; error: string };

export interface CreateDurakGameInput {
  seatOrder: readonly SeatId[];
  dealerSeatId: SeatId;
  shuffledDeck: readonly DurakCard[];
  settings: DurakSettings;
  nowMs: number;
  gameInstanceId: string;
}

const MAX_VISUAL_EVENTS = 18;

function appendAction(state: DurakGameState, seatId: SeatId, action: DurakVisualAction): void {
  state.visualEvents = [
    ...state.visualEvents.slice(-(MAX_VISUAL_EVENTS - 1)),
    { id: state.nextVisualEventId++, type: "action", seatId, action },
  ];
}

function appendTransfer(
  state: DurakGameState,
  source: CardVisualAnchor,
  target: CardVisualAnchor,
  cardCount: number,
): void {
  if (cardCount <= 0) return;
  state.visualEvents = [
    ...state.visualEvents.slice(-(MAX_VISUAL_EVENTS - 1)),
    { id: state.nextVisualEventId++, type: "transfer", source, target, cardCount },
  ];
}

function cloneFight(fight: DurakFight | null): DurakFight | null {
  if (!fight) return null;
  return {
    ...fight,
    table: fight.table.map((pair) => ({ ...pair })),
    throwInOrder: [...fight.throwInOrder],
    passedSeatIds: [...fight.passedSeatIds],
  };
}

function cloneTurn(turn: DurakTurn | null): DurakTurn | null {
  return turn ? { ...turn, clock: { ...turn.clock } } : null;
}

function cloneState(state: DurakGameState): DurakGameState {
  const hands: Record<SeatId, DurakCard[]> = {};
  for (const seatId of state.seatOrder) {
    hands[seatId] = [...(state.hands[seatId] ?? [])];
  }
  return {
    ...state,
    settings: { ...state.settings },
    seatOrder: [...state.seatOrder],
    activeOrder: [...state.activeOrder],
    statusBySeatId: { ...state.statusBySeatId },
    hands,
    drawPile: [...state.drawPile],
    discard: [...state.discard],
    removedFaceDown: [...state.removedFaceDown],
    fight: cloneFight(state.fight),
    turn: cloneTurn(state.turn),
    visualEvents: state.visualEvents.map((event) =>
      event.type === "transfer"
        ? { ...event, source: { ...event.source }, target: { ...event.target } }
        : { ...event },
    ),
    result: state.result ? { ...state.result } : null,
  };
}

function clockwiseAfter(order: readonly SeatId[], anchorSeatId: SeatId): SeatId[] {
  const anchorIndex = order.indexOf(anchorSeatId);
  if (anchorIndex < 0) return [...order];
  return [...order.slice(anchorIndex + 1), ...order.slice(0, anchorIndex + 1)];
}

function clockwiseFrom(order: readonly SeatId[], anchorSeatId: SeatId): SeatId[] {
  const anchorIndex = order.indexOf(anchorSeatId);
  if (anchorIndex < 0) return [...order];
  return [...order.slice(anchorIndex), ...order.slice(0, anchorIndex)];
}

function nextActiveAfter(state: DurakGameState, anchorSeatId: SeatId): SeatId | null {
  return (
    clockwiseAfter(state.seatOrder, anchorSeatId).find(
      (seatId) => state.statusBySeatId[seatId] === "active",
    ) ?? null
  );
}

function makeClock(
  settings: DurakSettings,
  nowMs: number,
  paused: boolean,
  readyDelayMs: number,
): DurakTurn["clock"] {
  const timeoutSeconds = settings.turnTimeoutSeconds;
  if (timeoutSeconds === null) return { kind: "unlimited" };
  const durationMs = timeoutSeconds * 1000;
  return paused
    ? { kind: "frozen", remainingMs: readyDelayMs + durationMs }
    : { kind: "running", deadlineAt: nowMs + readyDelayMs + durationMs };
}

function setTurn(
  state: DurakGameState,
  actorSeatId: SeatId,
  kind: DurakTurnKind,
  nowMs: number,
  paused: boolean,
  readyDelayMs = 0,
): void {
  state.turn = {
    id: state.nextTurnId++,
    actorSeatId,
    kind,
    readyAt: nowMs + (paused ? 0 : readyDelayMs),
    readyRemainingMs: paused && readyDelayMs > 0 ? readyDelayMs : null,
    clock: makeClock(state.settings, nowMs, paused, readyDelayMs),
  };
}

export function isDurakTurnReady(turn: DurakTurn, nowMs: number): boolean {
  return turn.readyRemainingMs === null && nowMs >= turn.readyAt;
}

function beginFight(
  state: DurakGameState,
  attackerSeatId: SeatId,
  nowMs: number,
  paused: boolean,
  readyDelayMs = 0,
): void {
  const defenderSeatId = nextActiveAfter(state, attackerSeatId);
  if (!defenderSeatId || defenderSeatId === attackerSeatId) {
    finishGame(state, { type: "aborted", reason: "not-enough-players" });
    return;
  }
  const defenderHandSizeAtStart = state.hands[defenderSeatId].length;
  const throwInOrder = clockwiseFrom(state.seatOrder, attackerSeatId).filter(
    (seatId) => state.statusBySeatId[seatId] === "active" && seatId !== defenderSeatId,
  );
  state.fight = {
    id: state.nextFightId++,
    primaryAttackerSeatId: attackerSeatId,
    defenderSeatId,
    defenderHandSizeAtStart,
    maxAttackCards: Math.min(6, defenderHandSizeAtStart),
    table: [],
    stage: "opening",
    takeDeclared: false,
    throwInOrder,
    passedSeatIds: [],
  };
  setTurn(state, attackerSeatId, "opening", nowMs, paused, readyDelayMs);
}

function setDefenseTurn(state: DurakGameState, nowMs: number, paused: boolean): void {
  const fight = state.fight;
  if (!fight) return;
  fight.stage = "defense";
  fight.takeDeclared = false;
  setTurn(state, fight.defenderSeatId, "defense", nowMs, paused);
}

function setThrowInTurn(state: DurakGameState, nowMs: number, paused: boolean): void {
  const fight = state.fight;
  if (!fight) return;
  fight.stage = "throw-in";
  fight.takeDeclared = false;
  const timerOwnerSeatId = unpassedThrowers(fight)[0] ?? fight.primaryAttackerSeatId;
  setTurn(state, timerOwnerSeatId, "throw-in", nowMs, paused);
}

function unpassedThrowers(fight: DurakFight): SeatId[] {
  const passedSeatIds = new Set(fight.passedSeatIds);
  return fight.throwInOrder.filter((seatId) => !passedSeatIds.has(seatId));
}

function allThrowersPassed(fight: DurakFight): boolean {
  return unpassedThrowers(fight).length === 0;
}

function attackLimitReached(fight: DurakFight): boolean {
  return fight.table.length >= fight.maxAttackCards;
}

function setTakeThrowInTurn(state: DurakGameState, nowMs: number, paused: boolean): void {
  const fight = state.fight;
  if (!fight) return;
  fight.stage = "take-throw-in";
  fight.takeDeclared = true;
  const timerOwnerSeatId = unpassedThrowers(fight)[0] ?? fight.primaryAttackerSeatId;
  setTurn(state, timerOwnerSeatId, "take-throw-in", nowMs, paused);
}

function updateThrowInTimerOwner(state: DurakGameState, nowMs: number, paused: boolean): void {
  const fight = state.fight;
  if (!fight) return;
  const timerOwnerSeatId = unpassedThrowers(fight)[0] ?? fight.primaryAttackerSeatId;
  setTurn(state, timerOwnerSeatId, fight.stage, nowMs, paused);
}

function allAttacksCovered(fight: DurakFight): boolean {
  return fight.table.every((pair) => pair.defense !== null);
}

function primaryAttackerFinished(fight: DurakFight): boolean {
  return fight.passedSeatIds.includes(fight.primaryAttackerSeatId);
}

function defendedFightCanResolve(fight: DurakFight): boolean {
  return (
    allAttacksCovered(fight) &&
    primaryAttackerFinished(fight) &&
    (attackLimitReached(fight) || allThrowersPassed(fight))
  );
}

function resolveFightIfReady(state: DurakGameState, nowMs: number, paused: boolean): boolean {
  const fight = state.fight;
  if (!fight?.takeDeclared || (!attackLimitReached(fight) && !allThrowersPassed(fight))) {
    return false;
  }
  resolveTakenFight(state, nowMs, paused);
  return true;
}

function finishGame(state: DurakGameState, result: DurakResult): void {
  state.phase = "GAME_OVER";
  state.result = result;
  state.fight = null;
  state.turn = null;
}

function replenishHands(state: DurakGameState, fight: DurakFight): void {
  const refillOrder = clockwiseFrom(state.seatOrder, fight.primaryAttackerSeatId).filter(
    (seatId) => state.statusBySeatId[seatId] === "active" && seatId !== fight.defenderSeatId,
  );
  if (state.statusBySeatId[fight.defenderSeatId] === "active") {
    refillOrder.push(fight.defenderSeatId);
  }

  for (const seatId of refillOrder) {
    const hand = state.hands[seatId];
    const handSizeBefore = hand.length;
    while (hand.length < 6 && state.drawPile.length > 0) {
      const card = state.drawPile.shift();
      if (card) hand.push(card);
    }
    state.hands[seatId] = sortDurakHand(hand, state.trumpSuit);
    appendTransfer(
      state,
      { kind: "deck" },
      { kind: "player", seatId },
      hand.length - handSizeBefore,
    );
  }
}

function settleEmptyHandsAndResult(state: DurakGameState): boolean {
  if (state.drawPile.length > 0) return false;

  for (const seatId of state.activeOrder) {
    if (state.hands[seatId].length === 0) {
      state.statusBySeatId[seatId] = "out";
    }
  }
  state.activeOrder = state.seatOrder.filter((seatId) => state.statusBySeatId[seatId] === "active");

  const holders = state.activeOrder.filter((seatId) => state.hands[seatId].length > 0);
  if (holders.length === 0) {
    finishGame(state, { type: "draw" });
    return true;
  }
  if (holders.length === 1) {
    finishGame(state, { type: "fool", foolSeatId: holders[0] });
    return true;
  }
  return false;
}

function resolveDefendedFight(state: DurakGameState, nowMs: number, paused: boolean): void {
  const fight = state.fight;
  if (!fight) return;
  const tableCardCount = fight.table.reduce((count, pair) => count + (pair.defense ? 2 : 1), 0);
  appendTransfer(state, { kind: "table" }, { kind: "discard" }, tableCardCount);
  for (const pair of fight.table) {
    state.discard.push(pair.attack);
    if (pair.defense) state.discard.push(pair.defense);
  }
  state.fight = null;
  state.turn = null;
  replenishHands(state, fight);
  if (settleEmptyHandsAndResult(state)) return;

  const attackerSeatId =
    state.statusBySeatId[fight.defenderSeatId] === "active"
      ? fight.defenderSeatId
      : nextActiveAfter(state, fight.defenderSeatId);
  if (!attackerSeatId) {
    finishGame(state, { type: "draw" });
    return;
  }
  beginFight(state, attackerSeatId, nowMs, paused, DURAK_ROUND_TRANSITION_DELAY_MS);
}

function resolveTakenFight(state: DurakGameState, nowMs: number, paused: boolean): void {
  const fight = state.fight;
  if (!fight) return;
  const tableCardCount = fight.table.reduce((count, pair) => count + (pair.defense ? 2 : 1), 0);
  appendTransfer(
    state,
    { kind: "table" },
    { kind: "player", seatId: fight.defenderSeatId },
    tableCardCount,
  );
  const defenderHand = state.hands[fight.defenderSeatId];
  for (const pair of fight.table) {
    defenderHand.push(pair.attack);
    if (pair.defense) defenderHand.push(pair.defense);
  }
  state.hands[fight.defenderSeatId] = sortDurakHand(defenderHand, state.trumpSuit);
  state.fight = null;
  state.turn = null;
  replenishHands(state, fight);
  if (settleEmptyHandsAndResult(state)) return;

  const attackerSeatId = nextActiveAfter(state, fight.defenderSeatId);
  if (!attackerSeatId) {
    finishGame(state, { type: "draw" });
    return;
  }
  beginFight(state, attackerSeatId, nowMs, paused, DURAK_ROUND_TRANSITION_DELAY_MS);
}

function cardsFromHand(
  state: DurakGameState,
  seatId: SeatId,
  cardIds: readonly string[],
): DurakCard[] | null {
  if (new Set(cardIds).size !== cardIds.length) return null;
  const handById = new Map(state.hands[seatId].map((card) => [card.id, card]));
  const cards = cardIds.map((cardId) => handById.get(cardId));
  return cards.every((card): card is DurakCard => card !== undefined) ? cards : null;
}

function removeCardsFromHand(
  state: DurakGameState,
  seatId: SeatId,
  cards: readonly DurakCard[],
): void {
  const removedIds = new Set(cards.map((card) => card.id));
  state.hands[seatId] = state.hands[seatId].filter((card) => !removedIds.has(card.id));
}

function success(state: DurakGameState): DurakEngineResult {
  assertDurakState(state);
  return { success: true, state };
}

function failure(error: string): DurakEngineResult {
  return { success: false, error };
}

export function createDurakGameState(input: CreateDurakGameInput): DurakGameState {
  const seatOrder = [...input.seatOrder];
  if (seatOrder.length < 2 || seatOrder.length > 6) {
    throw new Error("Durak requires from two to six seats");
  }
  if (new Set(seatOrder).size !== seatOrder.length) {
    throw new Error("Durak seat order contains duplicates");
  }
  if (!seatOrder.includes(input.dealerSeatId)) {
    throw new Error("Durak dealer is not seated");
  }
  if (
    input.shuffledDeck.length !== 36 ||
    new Set(input.shuffledDeck.map((card) => card.id)).size !== 36
  ) {
    throw new Error("Durak deck must contain 36 unique cards");
  }

  const hands: Record<SeatId, DurakCard[]> = Object.fromEntries(
    seatOrder.map((seatId) => [seatId, []]),
  );
  const dealOrder = clockwiseAfter(seatOrder, input.dealerSeatId);
  let cursor = 0;
  for (let round = 0; round < 6; round++) {
    for (const seatId of dealOrder) {
      const card = input.shuffledDeck[cursor++];
      if (!card) throw new Error("Durak deck ended during deal");
      hands[seatId].push(card);
    }
  }

  let trumpCard: DurakCard;
  let drawPile: DurakCard[];
  if (seatOrder.length === 6) {
    const dealerHand = hands[input.dealerSeatId];
    trumpCard = dealerHand[dealerHand.length - 1];
    drawPile = [];
  } else {
    const exposedTrump = input.shuffledDeck[cursor++];
    if (!exposedTrump) throw new Error("Durak trump card is missing");
    trumpCard = exposedTrump;
    drawPile = [...input.shuffledDeck.slice(cursor), exposedTrump];
  }

  for (const seatId of seatOrder) {
    hands[seatId] = sortDurakHand(hands[seatId], trumpCard.suit);
  }

  let firstAttackerSeatId: SeatId | null = null;
  let lowestTrumpValue = Number.POSITIVE_INFINITY;
  for (const seatId of seatOrder) {
    for (const card of hands[seatId]) {
      if (card.suit !== trumpCard.suit) continue;
      const value = durakRankValue(card.rank);
      if (value < lowestTrumpValue) {
        lowestTrumpValue = value;
        firstAttackerSeatId = seatId;
      }
    }
  }
  if (!firstAttackerSeatId) {
    firstAttackerSeatId = clockwiseAfter(seatOrder, input.dealerSeatId)[0] ?? null;
  }
  if (!firstAttackerSeatId) throw new Error("Durak first attacker is missing");

  const state: DurakGameState = {
    gameInstanceId: input.gameInstanceId,
    phase: "PLAYING",
    settings: { ...input.settings },
    seatOrder,
    activeOrder: [...seatOrder],
    statusBySeatId: Object.fromEntries(seatOrder.map((seatId) => [seatId, "active"])),
    dealerSeatId: input.dealerSeatId,
    hands,
    drawPile,
    discard: [],
    removedFaceDown: [],
    trumpCard,
    trumpSuit: trumpCard.suit,
    fight: null,
    turn: null,
    nextTurnId: 1,
    nextFightId: 1,
    nextVisualEventId: 1,
    visualEvents: [],
    result: null,
  };
  beginFight(state, firstAttackerSeatId, input.nowMs, false, DURAK_INITIAL_DEAL_READY_DELAY_MS);
  assertDurakState(state);
  return state;
}

export function applyDurakCommand(
  state: Readonly<DurakGameState>,
  actorSeatId: SeatId,
  command: DurakCommand,
  nowMs: number,
  paused: boolean,
): DurakEngineResult {
  if (paused) return failure("Игра на паузе");
  if (state.phase !== "PLAYING" || !state.fight || !state.turn) {
    return failure("Партия не активна");
  }
  if (state.statusBySeatId[actorSeatId] !== "active") {
    return failure("Место больше не участвует в партии");
  }
  if (!isDurakTurnReady(state.turn, nowMs)) {
    return failure("Ход ещё не начался");
  }

  const fight = state.fight;
  switch (command.type) {
    case "attack": {
      if (
        fight.stage !== "opening" ||
        state.turn.kind !== "opening" ||
        state.turn.actorSeatId !== actorSeatId
      ) {
        return failure("Сейчас нельзя начинать атаку");
      }
      if (command.cardIds.length === 0) {
        return failure("Нужно выбрать хотя бы одну карту");
      }
      if (command.cardIds.length > fight.maxAttackCards) {
        return failure("Превышен лимит атакующих карт");
      }
      const cards = cardsFromHand(state as DurakGameState, actorSeatId, command.cardIds);
      if (!cards) return failure("Карта не найдена в руке");
      if (new Set(cards.map((card) => card.rank)).size !== 1) {
        return failure("Начальная атака должна состоять из карт одного достоинства");
      }

      const next = cloneState(state as DurakGameState);
      removeCardsFromHand(next, actorSeatId, cards);
      next.fight!.table = cards.map((card) => ({
        attack: card,
        attackPlayedBySeatId: actorSeatId,
        defense: null,
        defensePlayedBySeatId: null,
      }));
      appendAction(next, actorSeatId, "attack");
      appendTransfer(
        next,
        { kind: "player", seatId: actorSeatId },
        { kind: "table" },
        cards.length,
      );
      setDefenseTurn(next, nowMs, false);
      return success(next);
    }

    case "defend": {
      if (fight.stage !== "defense") {
        return failure("Сейчас нельзя защищаться");
      }
      if (actorSeatId !== fight.defenderSeatId) {
        return failure("Защищаться может только защищающийся");
      }
      const defenseCard = state.hands[actorSeatId].find((card) => card.id === command.cardId);
      if (!defenseCard) return failure("Карта не найдена в руке");
      const targetIndex = fight.table.findIndex(
        (pair) => pair.attack.id === command.attackCardId && pair.defense === null,
      );
      if (targetIndex < 0) return failure("Атакующая карта уже покрыта или не найдена");
      if (!canBeatDurakCard(defenseCard, fight.table[targetIndex].attack, state.trumpSuit)) {
        return failure("Эта карта не бьёт выбранную атаку");
      }

      const next = cloneState(state as DurakGameState);
      removeCardsFromHand(next, actorSeatId, [defenseCard]);
      next.fight!.table[targetIndex] = {
        ...next.fight!.table[targetIndex],
        defense: defenseCard,
        defensePlayedBySeatId: actorSeatId,
      };
      appendAction(next, actorSeatId, "defend");
      appendTransfer(next, { kind: "player", seatId: actorSeatId }, { kind: "table" }, 1);
      if (allAttacksCovered(next.fight!)) {
        if (defendedFightCanResolve(next.fight!)) {
          resolveDefendedFight(next, nowMs, false);
        } else {
          setThrowInTurn(next, nowMs, false);
        }
      } else {
        setDefenseTurn(next, nowMs, false);
      }
      return success(next);
    }

    case "throw-in": {
      if (
        fight.stage !== "defense" &&
        fight.stage !== "throw-in" &&
        fight.stage !== "take-throw-in"
      ) {
        return failure("Сейчас нельзя подкидывать");
      }
      if (!fight.throwInOrder.includes(actorSeatId) || fight.passedSeatIds.includes(actorSeatId)) {
        return failure("Вы уже закончили подкидывать");
      }
      if (command.cardIds.length === 0) {
        return failure("Нужно выбрать хотя бы одну карту");
      }
      const remainingCapacity = fight.maxAttackCards - fight.table.length;
      if (remainingCapacity <= 0) {
        return failure("Стол уже заполнен");
      }
      if (command.cardIds.length > remainingCapacity) {
        return failure("Стол уже заполнен");
      }
      const cards = cardsFromHand(state as DurakGameState, actorSeatId, command.cardIds);
      if (!cards) return failure("Карта не найдена в руке");
      const tableRanks = new Set(
        fight.table.flatMap((pair) =>
          pair.defense ? [pair.attack.rank, pair.defense.rank] : [pair.attack.rank],
        ),
      );
      if (cards.some((card) => !tableRanks.has(card.rank))) {
        return failure("Можно подкидывать только достоинства со стола");
      }

      const next = cloneState(state as DurakGameState);
      removeCardsFromHand(next, actorSeatId, cards);
      next.fight!.table.push(
        ...cards.map(
          (card): DurakTablePair => ({
            attack: card,
            attackPlayedBySeatId: actorSeatId,
            defense: null,
            defensePlayedBySeatId: null,
          }),
        ),
      );
      appendAction(next, actorSeatId, "throw-in");
      appendTransfer(
        next,
        { kind: "player", seatId: actorSeatId },
        { kind: "table" },
        cards.length,
      );
      if (!resolveFightIfReady(next, nowMs, false)) {
        if (!next.fight!.takeDeclared) {
          setDefenseTurn(next, nowMs, false);
        }
      }
      return success(next);
    }

    case "take": {
      if (
        fight.stage !== "defense" ||
        actorSeatId !== fight.defenderSeatId ||
        allAttacksCovered(fight)
      ) {
        return failure("Сейчас нельзя взять карты");
      }
      const next = cloneState(state as DurakGameState);
      appendAction(next, actorSeatId, "take");
      setTakeThrowInTurn(next, nowMs, false);
      resolveFightIfReady(next, nowMs, false);
      return success(next);
    }

    case "pass": {
      if (
        fight.stage !== "defense" &&
        fight.stage !== "throw-in" &&
        fight.stage !== "take-throw-in"
      ) {
        return failure("Сейчас нельзя пасовать");
      }
      if (!fight.throwInOrder.includes(actorSeatId) || fight.passedSeatIds.includes(actorSeatId)) {
        return failure("Вы уже закончили подкидывать");
      }
      if (!fight.takeDeclared && actorSeatId === fight.primaryAttackerSeatId) {
        return failure("Основной атакующий завершает бой кнопкой «Бито»");
      }

      const next = cloneState(state as DurakGameState);
      const nextFight = next.fight!;
      nextFight.passedSeatIds.push(actorSeatId);
      appendAction(next, actorSeatId, "pass");
      if (nextFight.takeDeclared) {
        if (!resolveFightIfReady(next, nowMs, false) && state.turn.actorSeatId === actorSeatId) {
          updateThrowInTimerOwner(next, nowMs, false);
        }
      } else if (defendedFightCanResolve(nextFight)) {
        resolveDefendedFight(next, nowMs, false);
      } else if (state.turn.actorSeatId === actorSeatId) {
        updateThrowInTimerOwner(next, nowMs, false);
      }
      return success(next);
    }

    case "beat": {
      if (
        fight.stage !== "throw-in" ||
        fight.takeDeclared ||
        actorSeatId !== fight.primaryAttackerSeatId ||
        fight.passedSeatIds.includes(actorSeatId) ||
        !allAttacksCovered(fight)
      ) {
        return failure("Сейчас нельзя завершить бой");
      }

      const next = cloneState(state as DurakGameState);
      next.fight!.passedSeatIds.push(actorSeatId);
      appendAction(next, actorSeatId, "beat");
      if (defendedFightCanResolve(next.fight!)) {
        resolveDefendedFight(next, nowMs, false);
      } else {
        updateThrowInTimerOwner(next, nowMs, false);
      }
      return success(next);
    }
  }
}

export function applyDurakTurnTimeout(
  state: Readonly<DurakGameState>,
  turnId: number,
  nowMs: number,
): DurakEngineResult {
  if (state.phase !== "PLAYING" || !state.turn || !state.fight) {
    return failure("Партия не активна");
  }
  if (state.turn.id !== turnId) return failure("Ход уже изменился");
  if (state.turn.clock.kind !== "running" || nowMs < state.turn.clock.deadlineAt) {
    return failure("Таймер ещё не истёк");
  }

  if (state.turn.kind === "opening") {
    const next = cloneState(state as DurakGameState);
    const previousAttacker = next.fight!.primaryAttackerSeatId;
    const attackerSeatId = nextActiveAfter(next, previousAttacker);
    next.fight = null;
    next.turn = null;
    if (!attackerSeatId) {
      finishGame(next, { type: "aborted", reason: "not-enough-players" });
    } else {
      beginFight(next, attackerSeatId, nowMs, false);
    }
    return success(next);
  }

  if (state.turn.kind === "defense") {
    if (!allAttacksCovered(state.fight)) {
      return applyDurakCommand(state, state.fight.defenderSeatId, { type: "take" }, nowMs, false);
    }
    const next = cloneState(state as DurakGameState);
    setThrowInTurn(next, nowMs, false);
    return success(next);
  }

  if (state.turn.kind === "throw-in") {
    return applyDurakCommand(
      state,
      state.turn.actorSeatId,
      state.turn.actorSeatId === state.fight.primaryAttackerSeatId
        ? { type: "beat" }
        : { type: "pass" },
      nowMs,
      false,
    );
  }

  if (state.turn.kind === "take-throw-in") {
    return applyDurakCommand(state, state.turn.actorSeatId, { type: "pass" }, nowMs, false);
  }

  return failure("Некорректный этап таймера");
}

export function freezeDurakTurn(state: Readonly<DurakGameState>, nowMs: number): DurakGameState {
  const next = cloneState(state as DurakGameState);
  if (next.turn && next.turn.readyRemainingMs === null && next.turn.readyAt > nowMs) {
    next.turn.readyRemainingMs = next.turn.readyAt - nowMs;
    next.turn.readyAt = nowMs;
  }
  if (next.turn?.clock.kind === "running") {
    next.turn.clock = {
      kind: "frozen",
      remainingMs: Math.max(0, next.turn.clock.deadlineAt - nowMs),
    };
  }
  assertDurakState(next);
  return next;
}

export function resumeDurakTurn(state: Readonly<DurakGameState>, nowMs: number): DurakGameState {
  const next = cloneState(state as DurakGameState);
  if (next.turn?.readyRemainingMs !== null && next.turn?.readyRemainingMs !== undefined) {
    next.turn.readyAt = nowMs + next.turn.readyRemainingMs;
    next.turn.readyRemainingMs = null;
  }
  if (next.turn?.clock.kind === "frozen") {
    next.turn.clock = {
      kind: "running",
      deadlineAt: nowMs + next.turn.clock.remainingMs,
    };
  }
  assertDurakState(next);
  return next;
}

export function excludeDurakSeat(
  state: Readonly<DurakGameState>,
  seatId: SeatId,
  nowMs: number,
  remainsPaused: boolean,
): DurakEngineResult {
  if (state.phase !== "PLAYING" || !state.fight || state.statusBySeatId[seatId] !== "active") {
    return failure("Место нельзя исключить из текущей партии");
  }

  const next = cloneState(state as DurakGameState);
  const fight = next.fight!;
  for (const pair of fight.table) {
    next.hands[pair.attackPlayedBySeatId].push(pair.attack);
    if (pair.defense && pair.defensePlayedBySeatId) {
      next.hands[pair.defensePlayedBySeatId].push(pair.defense);
    }
  }
  for (const ownerSeatId of next.seatOrder) {
    next.hands[ownerSeatId] = sortDurakHand(next.hands[ownerSeatId], next.trumpSuit);
  }

  next.removedFaceDown.push(...next.hands[seatId]);
  next.hands[seatId] = [];
  next.statusBySeatId[seatId] = "excluded";
  next.activeOrder = next.activeOrder.filter((activeSeatId) => activeSeatId !== seatId);
  next.fight = null;
  next.turn = null;

  const remainingParticipantCount = next.seatOrder.filter(
    (participantSeatId) => next.statusBySeatId[participantSeatId] !== "excluded",
  ).length;
  if (remainingParticipantCount < 2) {
    finishGame(next, { type: "aborted", reason: "not-enough-players" });
    return success(next);
  }
  if (settleEmptyHandsAndResult(next)) return success(next);

  const attackerSeatId = nextActiveAfter(next, seatId);
  if (!attackerSeatId) {
    finishGame(next, { type: "aborted", reason: "not-enough-players" });
  } else {
    beginFight(next, attackerSeatId, nowMs, remainsPaused);
  }
  return success(next);
}

export function assertDurakState(state: DurakGameState): void {
  if (state.seatOrder.length < 2 || state.seatOrder.length > 6) {
    throw new Error("Invalid Durak seat count");
  }
  if (new Set(state.seatOrder).size !== state.seatOrder.length) {
    throw new Error("Duplicate Durak seats");
  }

  const expectedActiveOrder = state.seatOrder.filter(
    (seatId) => state.statusBySeatId[seatId] === "active",
  );
  if (
    expectedActiveOrder.length !== state.activeOrder.length ||
    expectedActiveOrder.some((seatId, index) => state.activeOrder[index] !== seatId)
  ) {
    throw new Error("Durak active order is inconsistent");
  }

  const cards: DurakCard[] = [...state.drawPile, ...state.discard, ...state.removedFaceDown];
  for (const seatId of state.seatOrder) {
    const status = state.statusBySeatId[seatId];
    if (!status) throw new Error("Durak seat status is missing");
    const hand = state.hands[seatId];
    if (!hand) throw new Error("Durak hand is missing");
    if (status !== "active" && hand.length > 0) {
      throw new Error("Inactive Durak seat still has cards");
    }
    cards.push(...hand);
  }
  if (state.fight) {
    for (const pair of state.fight.table) {
      cards.push(pair.attack);
      if (pair.defense) {
        if (!canBeatDurakCard(pair.defense, pair.attack, state.trumpSuit)) {
          throw new Error("Invalid Durak defense on table");
        }
        if (pair.defensePlayedBySeatId !== state.fight.defenderSeatId) {
          throw new Error("Durak defense was played by another seat");
        }
        cards.push(pair.defense);
      } else if (pair.defensePlayedBySeatId !== null) {
        throw new Error("Durak table has a defense owner without a card");
      }
    }
  }
  if (cards.length !== createDurakDeck().length) {
    throw new Error("Durak card conservation failed");
  }
  if (new Set(cards.map((card) => card.id)).size !== cards.length) {
    throw new Error("Duplicate Durak card location");
  }
  if (!cards.some((card) => card.id === state.trumpCard.id)) {
    throw new Error("Durak trump card is missing");
  }

  if (state.phase === "GAME_OVER") {
    if (!state.result || state.fight || state.turn) {
      throw new Error("Invalid Durak game-over state");
    }
    if (state.result.type === "fool") {
      const holders = state.seatOrder.filter(
        (seatId) => state.statusBySeatId[seatId] !== "excluded" && state.hands[seatId].length > 0,
      );
      if (holders.length !== 1 || holders[0] !== state.result.foolSeatId) {
        throw new Error("Invalid Durak fool result");
      }
    }
    if (
      state.result.type === "draw" &&
      state.seatOrder.some(
        (seatId) => state.statusBySeatId[seatId] !== "excluded" && state.hands[seatId].length > 0,
      )
    ) {
      throw new Error("Invalid Durak draw result");
    }
    return;
  }

  const fight = state.fight;
  const turn = state.turn;
  if (!fight || !turn || state.result) {
    throw new Error("Active Durak game has no fight or turn");
  }
  if (
    state.statusBySeatId[fight.primaryAttackerSeatId] !== "active" ||
    state.statusBySeatId[fight.defenderSeatId] !== "active" ||
    fight.primaryAttackerSeatId === fight.defenderSeatId
  ) {
    throw new Error("Invalid Durak fight roles");
  }
  if (
    fight.maxAttackCards !== Math.min(6, fight.defenderHandSizeAtStart) ||
    fight.table.length > fight.maxAttackCards
  ) {
    throw new Error("Invalid Durak attack limit");
  }
  if (fight.stage === "opening" && fight.table.length !== 0) {
    throw new Error("Durak opening already has table cards");
  }
  if (fight.stage !== "opening" && fight.table.length === 0) {
    throw new Error("Durak active fight has an empty table");
  }
  if (fight.takeDeclared !== (fight.stage === "take-throw-in")) {
    throw new Error("Durak take stage is inconsistent");
  }
  if (new Set(fight.passedSeatIds).size !== fight.passedSeatIds.length) {
    throw new Error("Duplicate Durak passes");
  }
  if (fight.passedSeatIds.some((seatId) => !fight.throwInOrder.includes(seatId))) {
    throw new Error("Invalid Durak passing seat");
  }
  if (fight.takeDeclared && (attackLimitReached(fight) || allThrowersPassed(fight))) {
    throw new Error("Durak completed fight was not resolved");
  }
  if (!fight.takeDeclared && defendedFightCanResolve(fight)) {
    throw new Error("Durak defended fight was not resolved");
  }
  if (fight.stage === "throw-in" && !allAttacksCovered(fight)) {
    throw new Error("Durak throw-in stage has uncovered attacks");
  }

  const expectedTurnKind: DurakTurnKind =
    fight.stage === "opening" ? "opening" : fight.stage === "defense" ? "defense" : fight.stage;
  if (turn.kind !== expectedTurnKind) {
    throw new Error("Durak turn kind does not match fight stage");
  }
  const expectedActor =
    fight.stage === "opening"
      ? fight.primaryAttackerSeatId
      : fight.stage === "defense"
        ? fight.defenderSeatId
        : (unpassedThrowers(fight)[0] ?? fight.primaryAttackerSeatId);
  if (!expectedActor || turn.actorSeatId !== expectedActor) {
    throw new Error("Durak current actor is inconsistent");
  }
}
