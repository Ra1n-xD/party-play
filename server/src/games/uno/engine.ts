import type {
  SeatId,
  UnoCard,
  UnoChallengeResolution,
  UnoColor,
  UnoCommand,
  UnoResult,
  UnoSettings,
} from "../../../../shared/types.js";
import {
  UNO_COLORS,
  canPlayUnoCard,
  createUnoDeck,
  randomUnoColor,
  shuffleUnoDeck,
} from "./cards.js";
import type {
  UnoGameState,
  UnoPendingWildDrawFourInternal,
  UnoTurn,
  UnoTurnClock,
} from "./runtime.js";

export type UnoEngineResult =
  | { success: true; state: UnoGameState }
  | { success: false; error: string };

export interface CreateUnoGameInput {
  seatOrder: readonly SeatId[];
  dealerSeatId: SeatId;
  shuffledDeck: readonly UnoCard[];
  settings: UnoSettings;
  nowMs: number;
  gameInstanceId: string;
}

function failure(error: string): UnoEngineResult {
  return { success: false, error };
}

function cloneState(state: UnoGameState): UnoGameState {
  const hands: Record<SeatId, UnoCard[]> = {};
  for (const seatId of state.seatOrder) hands[seatId] = [...(state.hands[seatId] ?? [])];
  return {
    ...state,
    settings: { ...state.settings },
    seatOrder: [...state.seatOrder],
    activeSeatIds: [...state.activeSeatIds],
    statusBySeatId: { ...state.statusBySeatId },
    hands,
    drawPile: [...state.drawPile],
    discardPile: [...state.discardPile],
    removedFaceDown: [...state.removedFaceDown],
    turn: state.turn ? { ...state.turn, clock: { ...state.turn.clock } } : null,
    pendingWildDrawFour: state.pendingWildDrawFour ? { ...state.pendingWildDrawFour } : null,
    unoWindow: state.unoWindow ? { ...state.unoWindow } : null,
    preDeclaredUno: state.preDeclaredUno ? { ...state.preDeclaredUno } : null,
    lastChallengeResolution: state.lastChallengeResolution
      ? { ...state.lastChallengeResolution }
      : null,
    result: state.result ? { ...state.result } : null,
  };
}

function success(state: UnoGameState): UnoEngineResult {
  assertUnoState(state);
  return { success: true, state };
}

function nextSeat(
  state: UnoGameState,
  anchorSeatId: SeatId,
  direction = state.direction,
): SeatId | null {
  const order = state.seatOrder;
  const index = order.indexOf(anchorSeatId);
  if (index < 0 || state.activeSeatIds.length === 0) return null;
  for (let offset = 1; offset <= order.length; offset++) {
    const candidate = order[(index + direction * offset + order.length * 2) % order.length];
    if (state.statusBySeatId[candidate] === "active") return candidate;
  }
  return null;
}

function isPausedClock(settings: UnoSettings, nowMs: number, paused: boolean): UnoTurnClock {
  if (settings.turnTimeoutSeconds === null) return { kind: "unlimited" };
  const duration = settings.turnTimeoutSeconds * 1000;
  return paused
    ? { kind: "frozen", remainingMs: duration }
    : { kind: "running", deadlineAt: nowMs + duration };
}

function setTurn(
  state: UnoGameState,
  actorSeatId: SeatId,
  kind: UnoTurn["kind"],
  nowMs: number,
  paused: boolean,
  drawnCardId: string | null = null,
): void {
  state.turn = {
    id: state.nextTurnId++,
    actorSeatId,
    kind,
    clock: isPausedClock(state.settings, nowMs, paused),
    drawnCardId,
  };
}

function finishGame(state: UnoGameState, result: UnoResult): void {
  state.phase = "GAME_OVER";
  state.result = result;
  state.turn = null;
  state.pendingWildDrawFour = null;
  state.unoWindow = null;
  state.preDeclaredUno = null;
}

function closeUnoWindow(state: UnoGameState): void {
  state.unoWindow = null;
}

function closeUnoForGameplayAction(state: UnoGameState): void {
  closeUnoWindow(state);
  state.preDeclaredUno = null;
}

function startNormalTurn(
  state: UnoGameState,
  actorSeatId: SeatId,
  nowMs: number,
  paused: boolean,
): void {
  setTurn(state, actorSeatId, "normal", nowMs, paused);
}

function recycleDiscardIntoDrawPile(state: UnoGameState): void {
  if (state.drawPile.length > 0 || state.discardPile.length <= 1) return;
  const top = state.discardPile[state.discardPile.length - 1];
  const recycled = state.discardPile.slice(0, -1);
  state.drawPile = shuffleUnoDeck(recycled);
  state.discardPile = [top];
}

function drawCards(state: UnoGameState, seatId: SeatId, count: number): UnoCard[] {
  const drawn: UnoCard[] = [];
  for (let index = 0; index < count; index++) {
    recycleDiscardIntoDrawPile(state);
    const card = state.drawPile.shift();
    if (!card) break;
    state.hands[seatId].push(card);
    drawn.push(card);
  }
  return drawn;
}

function removeFromHand(state: UnoGameState, seatId: SeatId, cardId: string): UnoCard | null {
  const hand = state.hands[seatId];
  const index = hand.findIndex((card) => card.id === cardId);
  if (index < 0) return null;
  return hand.splice(index, 1)[0] ?? null;
}

function openUnoWindowIfNeeded(
  state: UnoGameState,
  seatId: SeatId,
  turnId: number,
  declaredAtomically: boolean,
): void {
  const preDeclared = state.preDeclaredUno;
  state.preDeclaredUno = null;
  if (
    state.hands[seatId].length !== 1 ||
    declaredAtomically ||
    (preDeclared?.seatId === seatId && preDeclared.turnId === turnId)
  ) {
    return;
  }
  state.unoWindow = {
    id: state.nextUnoWindowId++,
    subjectSeatId: seatId,
    openedByTurnId: turnId,
  };
}

function advanceAfterRegularPlay(
  state: UnoGameState,
  actorSeatId: SeatId,
  card: UnoCard,
  nowMs: number,
  paused: boolean,
): void {
  const target = nextSeat(state, actorSeatId);
  if (!target) return finishGame(state, { type: "aborted", reason: "not-enough-players" });

  switch (card.kind) {
    case "skip": {
      const following = nextSeat(state, target);
      if (!following) return finishGame(state, { type: "aborted", reason: "not-enough-players" });
      startNormalTurn(state, following, nowMs, paused);
      return;
    }
    case "reverse": {
      state.direction = state.direction === 1 ? -1 : 1;
      const following =
        state.activeSeatIds.length === 2 ? actorSeatId : nextSeat(state, actorSeatId);
      if (!following) return finishGame(state, { type: "aborted", reason: "not-enough-players" });
      startNormalTurn(state, following, nowMs, paused);
      return;
    }
    case "draw-two": {
      drawCards(state, target, 2);
      const following = nextSeat(state, target);
      if (!following) return finishGame(state, { type: "aborted", reason: "not-enough-players" });
      startNormalTurn(state, following, nowMs, paused);
      return;
    }
    default:
      startNormalTurn(state, target, nowMs, paused);
  }
}

function applyPlayedCard(
  state: UnoGameState,
  actorSeatId: SeatId,
  cardId: string,
  chosenColor: UnoColor | undefined,
  declareUno: boolean,
  nowMs: number,
  paused: boolean,
): UnoEngineResult {
  const turn = state.turn;
  const top = state.discardPile[state.discardPile.length - 1];
  if (!turn || !top || state.activeColor === null) return failure("Партия не активна");
  if (turn.actorSeatId !== actorSeatId || (turn.kind !== "normal" && turn.kind !== "after-draw")) {
    return failure("Сейчас нельзя сыграть карту");
  }
  if (turn.kind === "after-draw" && turn.drawnCardId !== cardId) {
    return failure("После добора можно сыграть только взятую карту");
  }
  const card = state.hands[actorSeatId].find((candidate) => candidate.id === cardId);
  if (!card) return failure("Карты нет в руке");
  if (!canPlayUnoCard(card, top, state.activeColor)) return failure("Карта не подходит");
  if (declareUno && state.hands[actorSeatId].length !== 2) {
    return failure("UNO можно объявить с переходом от двух карт к одной");
  }
  if ((card.color === null) !== (chosenColor !== undefined)) {
    return failure(
      card.color === null
        ? "Для джокера нужно выбрать цвет"
        : "Цвет можно выбрать только для джокера",
    );
  }

  const next = cloneState(state);
  // A card play is the next accepted gameplay action, so an older catch window
  // cannot survive it. Keep a same-turn pre-declaration for the atomic play.
  next.unoWindow = null;
  const played = removeFromHand(next, actorSeatId, cardId);
  if (!played) return failure("Карты нет в руке");
  next.discardPile.push(played);
  if (played.color) next.activeColor = played.color;
  else next.activeColor = chosenColor!;

  if (played.kind === "wild-draw-four") {
    const wasLegalAtPlay = !next.hands[actorSeatId].some(
      (handCard) => handCard.color === state.activeColor,
    );
    const targetSeatId = nextSeat(next, actorSeatId);
    if (!targetSeatId) return failure("Недостаточно игроков");
    const pending: UnoPendingWildDrawFourInternal = {
      id: next.nextWildDrawFourId++,
      sourceSeatId: actorSeatId,
      targetSeatId,
      declaredColor: chosenColor!,
      previousActiveColor: state.activeColor,
      wasLegalAtPlay,
    };
    next.pendingWildDrawFour = pending;
    openUnoWindowIfNeeded(next, actorSeatId, turn.id, declareUno);
    setTurn(next, targetSeatId, "wild-draw-four-response", nowMs, paused);
    return success(next);
  }

  openUnoWindowIfNeeded(next, actorSeatId, turn.id, declareUno);
  advanceAfterRegularPlay(next, actorSeatId, played, nowMs, paused);
  if (next.hands[actorSeatId].length === 0) {
    finishGame(next, { type: "winner", winnerSeatId: actorSeatId });
  }
  return success(next);
}

function resolveWildDrawFour(
  state: UnoGameState,
  actorSeatId: SeatId,
  pendingId: number,
  decision: "accept" | "challenge",
  nowMs: number,
  paused: boolean,
): UnoEngineResult {
  const pending = state.pendingWildDrawFour;
  const turn = state.turn;
  if (!pending || !turn || turn.kind !== "wild-draw-four-response")
    return failure("Нет ожидающего решения");
  if (
    turn.actorSeatId !== actorSeatId ||
    pending.targetSeatId !== actorSeatId ||
    pending.id !== pendingId
  ) {
    return failure("Это решение доступно другому игроку");
  }
  const next = cloneState(state);
  const current = next.pendingWildDrawFour!;
  closeUnoForGameplayAction(next);
  let resolution: UnoChallengeResolution;

  if (decision === "challenge" && !current.wasLegalAtPlay) {
    drawCards(next, current.sourceSeatId, 4);
    resolution = {
      id: current.id,
      sourceSeatId: current.sourceSeatId,
      targetSeatId: current.targetSeatId,
      outcome: "challenge-succeeded",
      drawCount: 4,
    };
    next.pendingWildDrawFour = null;
    next.lastChallengeResolution = resolution;
    startNormalTurn(next, current.targetSeatId, nowMs, paused);
    return success(next);
  }

  const drawCount = decision === "accept" ? 4 : 6;
  drawCards(next, current.targetSeatId, drawCount);
  resolution = {
    id: current.id,
    sourceSeatId: current.sourceSeatId,
    targetSeatId: current.targetSeatId,
    outcome: decision === "accept" ? "accepted" : "challenge-failed",
    drawCount,
  };
  next.pendingWildDrawFour = null;
  next.lastChallengeResolution = resolution;
  if (next.hands[current.sourceSeatId].length === 0) {
    finishGame(next, { type: "winner", winnerSeatId: current.sourceSeatId });
    return success(next);
  }
  const following = nextSeat(next, current.targetSeatId);
  if (!following) return failure("Недостаточно игроков");
  startNormalTurn(next, following, nowMs, paused);
  return success(next);
}

export function createUnoGameState(input: CreateUnoGameInput): UnoGameState {
  const seatOrder = [...input.seatOrder];
  if (
    seatOrder.length < 2 ||
    seatOrder.length > 10 ||
    new Set(seatOrder).size !== seatOrder.length
  ) {
    throw new Error("UNO requires from two to ten unique seats");
  }
  if (!seatOrder.includes(input.dealerSeatId)) throw new Error("UNO dealer is not seated");
  const canonicalDeck = createUnoDeck();
  const canonicalById = new Map(canonicalDeck.map((card) => [card.id, card]));
  if (
    input.shuffledDeck.length !== 108 ||
    new Set(input.shuffledDeck.map((card) => card.id)).size !== 108 ||
    input.shuffledDeck.some((card) => {
      const canonical = canonicalById.get(card.id);
      return (
        !canonical ||
        canonical.kind !== card.kind ||
        canonical.color !== card.color ||
        canonical.number !== card.number
      );
    })
  ) {
    throw new Error("UNO deck must contain 108 canonical unique cards");
  }

  const hands: Record<SeatId, UnoCard[]> = Object.fromEntries(
    seatOrder.map((seatId) => [seatId, []]),
  );
  const state: UnoGameState = {
    gameInstanceId: input.gameInstanceId,
    phase: "PLAYING",
    settings: { ...input.settings },
    seatOrder,
    activeSeatIds: [...seatOrder],
    statusBySeatId: Object.fromEntries(seatOrder.map((seatId) => [seatId, "active"])),
    dealerSeatId: input.dealerSeatId,
    direction: 1,
    hands,
    drawPile: [...input.shuffledDeck],
    discardPile: [],
    removedFaceDown: [],
    activeColor: null,
    turn: null,
    nextTurnId: 1,
    pendingWildDrawFour: null,
    nextWildDrawFourId: 1,
    unoWindow: null,
    nextUnoWindowId: 1,
    preDeclaredUno: null,
    lastChallengeResolution: null,
    result: null,
  };

  for (let round = 0; round < 7; round++) {
    for (let offset = 1; offset <= seatOrder.length; offset++) {
      const seatId = seatOrder[(seatOrder.indexOf(input.dealerSeatId) + offset) % seatOrder.length];
      const card = state.drawPile.shift();
      if (!card) throw new Error("UNO deck ended during deal");
      state.hands[seatId].push(card);
    }
  }

  let upCard: UnoCard | undefined;
  do {
    upCard = state.drawPile.shift();
    if (!upCard) throw new Error("UNO initial discard is missing");
    if (upCard.kind === "wild-draw-four") {
      state.drawPile.push(upCard);
      state.drawPile = shuffleUnoDeck(state.drawPile);
      upCard = undefined;
    }
  } while (!upCard);
  state.discardPile.push(upCard);

  const firstSeat = nextSeat(state, input.dealerSeatId, 1);
  if (!firstSeat) throw new Error("UNO first player is missing");
  switch (upCard.kind) {
    case "wild":
      setTurn(state, firstSeat, "initial-color", input.nowMs, false);
      break;
    case "skip": {
      state.activeColor = upCard.color;
      const following = nextSeat(state, firstSeat, 1);
      if (!following) throw new Error("UNO opening player is missing");
      startNormalTurn(state, following, input.nowMs, false);
      break;
    }
    case "reverse":
      state.activeColor = upCard.color;
      state.direction = -1;
      startNormalTurn(state, input.dealerSeatId, input.nowMs, false);
      break;
    case "draw-two": {
      state.activeColor = upCard.color;
      drawCards(state, firstSeat, 2);
      const following = nextSeat(state, firstSeat, 1);
      if (!following) throw new Error("UNO opening player is missing");
      startNormalTurn(state, following, input.nowMs, false);
      break;
    }
    default:
      state.activeColor = upCard.color;
      startNormalTurn(state, firstSeat, input.nowMs, false);
  }
  assertUnoState(state);
  return state;
}

export function applyUnoCommand(
  state: Readonly<UnoGameState>,
  actorSeatId: SeatId,
  command: UnoCommand,
  nowMs: number,
  paused: boolean,
): UnoEngineResult {
  if (paused) return failure("Игра на паузе");
  if (state.phase !== "PLAYING" || !state.turn) return failure("Партия не активна");
  if (state.statusBySeatId[actorSeatId] !== "active")
    return failure("Место больше не участвует в партии");

  if (command.type === "declare-uno") {
    const next = cloneState(state as UnoGameState);
    if (next.unoWindow?.subjectSeatId === actorSeatId) {
      if (command.windowId !== undefined && command.windowId !== next.unoWindow.id)
        return failure("Окно UNO устарело");
      closeUnoWindow(next);
      return success(next);
    }
    if (
      next.turn?.actorSeatId !== actorSeatId ||
      next.turn.kind !== "normal" ||
      next.hands[actorSeatId].length !== 2
    ) {
      return failure("Сейчас нельзя объявить UNO");
    }
    next.preDeclaredUno = { seatId: actorSeatId, turnId: next.turn.id };
    return success(next);
  }

  if (command.type === "catch-uno") {
    const next = cloneState(state as UnoGameState);
    const window = next.unoWindow;
    if (!window || window.id !== command.windowId || window.subjectSeatId === actorSeatId) {
      return failure("Нельзя поймать UNO");
    }
    if (next.statusBySeatId[window.subjectSeatId] !== "active")
      return failure("Игрок больше не участвует");
    if (next.hands[window.subjectSeatId].length !== 1)
      return failure("Игрок уже не обязан объявлять UNO");
    drawCards(next, window.subjectSeatId, 2);
    closeUnoWindow(next);
    return success(next);
  }

  if (command.type === "play-card") {
    return applyPlayedCard(
      state as UnoGameState,
      actorSeatId,
      command.cardId,
      command.chosenColor,
      command.declareUno === true,
      nowMs,
      false,
    );
  }

  if (state.turn.actorSeatId !== actorSeatId) return failure("Сейчас ход другого игрока");
  switch (command.type) {
    case "draw-card": {
      if (state.turn.kind !== "normal") return failure("Сейчас нельзя брать карту");
      const top = state.discardPile[state.discardPile.length - 1];
      if (
        top &&
        state.activeColor &&
        state.hands[actorSeatId].some((card) => canPlayUnoCard(card, top, state.activeColor!))
      ) {
        return failure("Нужно сыграть подходящую карту");
      }
      const next = cloneState(state as UnoGameState);
      closeUnoForGameplayAction(next);
      const [drawn] = drawCards(next, actorSeatId, 1);
      if (!drawn) {
        const following = nextSeat(next, actorSeatId);
        if (!following) return failure("Недостаточно игроков");
        startNormalTurn(next, following, nowMs, false);
      } else {
        setTurn(next, actorSeatId, "after-draw", nowMs, false, drawn.id);
      }
      return success(next);
    }
    case "end-turn": {
      if (state.turn.kind !== "after-draw")
        return failure("Завершить ход можно только после добора");
      const next = cloneState(state as UnoGameState);
      closeUnoForGameplayAction(next);
      const following = nextSeat(next, actorSeatId);
      if (!following) return failure("Недостаточно игроков");
      startNormalTurn(next, following, nowMs, false);
      return success(next);
    }
    case "choose-initial-color": {
      if (state.turn.kind !== "initial-color") return failure("Сейчас нельзя выбирать цвет");
      const next = cloneState(state as UnoGameState);
      next.activeColor = command.color;
      setTurn(next, actorSeatId, "normal", nowMs, false);
      return success(next);
    }
    case "respond-wild-draw-four":
      return resolveWildDrawFour(
        state as UnoGameState,
        actorSeatId,
        command.pendingId,
        command.decision,
        nowMs,
        false,
      );
    default:
      return failure("Некорректная команда");
  }
}

export function applyUnoTurnTimeout(
  state: Readonly<UnoGameState>,
  turnId: number,
  nowMs: number,
): UnoEngineResult {
  if (state.phase !== "PLAYING" || !state.turn || state.turn.id !== turnId) {
    return failure("Ход уже изменился");
  }
  if (state.turn.clock.kind !== "running" || nowMs < state.turn.clock.deadlineAt) {
    return failure("Таймер ещё не истёк");
  }
  const actor = state.turn.actorSeatId;
  if (state.turn.kind === "wild-draw-four-response") {
    const pending = state.pendingWildDrawFour;
    return pending
      ? resolveWildDrawFour(state as UnoGameState, actor, pending.id, "accept", nowMs, false)
      : failure("Нет ожидающего решения");
  }
  if (state.turn.kind === "initial-color") {
    return applyUnoCommand(
      state,
      actor,
      { type: "choose-initial-color", color: randomUnoColor() },
      nowMs,
      false,
    );
  }
  if (state.turn.kind === "after-draw") {
    return applyUnoCommand(state, actor, { type: "end-turn" }, nowMs, false);
  }
  const next = cloneState(state as UnoGameState);
  closeUnoForGameplayAction(next);
  drawCards(next, actor, 1);
  const following = nextSeat(next, actor);
  if (!following) return failure("Недостаточно игроков");
  startNormalTurn(next, following, nowMs, false);
  return success(next);
}

export function freezeUnoTurn(state: Readonly<UnoGameState>, nowMs: number): UnoGameState {
  const next = cloneState(state as UnoGameState);
  if (next.turn?.clock.kind === "running") {
    next.turn.clock = {
      kind: "frozen",
      remainingMs: Math.max(0, next.turn.clock.deadlineAt - nowMs),
    };
  }
  assertUnoState(next);
  return next;
}

export function resumeUnoTurn(state: Readonly<UnoGameState>, nowMs: number): UnoGameState {
  const next = cloneState(state as UnoGameState);
  if (next.turn?.clock.kind === "frozen") {
    next.turn.clock = { kind: "running", deadlineAt: nowMs + next.turn.clock.remainingMs };
  }
  assertUnoState(next);
  return next;
}

export function excludeUnoSeat(
  state: Readonly<UnoGameState>,
  seatId: SeatId,
  nowMs: number,
  paused: boolean,
): UnoEngineResult {
  if (state.phase !== "PLAYING" || state.statusBySeatId[seatId] !== "active") {
    return failure("Место нельзя исключить");
  }
  const next = cloneState(state as UnoGameState);
  const pendingBeforeExclusion = next.pendingWildDrawFour;
  next.removedFaceDown.push(...next.hands[seatId]);
  next.hands[seatId] = [];
  next.statusBySeatId[seatId] = "excluded";
  next.activeSeatIds = next.activeSeatIds.filter((activeSeatId) => activeSeatId !== seatId);
  if (next.unoWindow?.subjectSeatId === seatId) next.unoWindow = null;
  if (next.preDeclaredUno?.seatId === seatId) next.preDeclaredUno = null;
  const wasPendingParticipant =
    pendingBeforeExclusion?.sourceSeatId === seatId ||
    pendingBeforeExclusion?.targetSeatId === seatId;
  if (wasPendingParticipant) next.pendingWildDrawFour = null;
  if (next.activeSeatIds.length < 2) {
    finishGame(next, { type: "aborted", reason: "not-enough-players" });
    return success(next);
  }
  if (
    pendingBeforeExclusion?.targetSeatId === seatId &&
    next.statusBySeatId[pendingBeforeExclusion.sourceSeatId] === "active" &&
    next.hands[pendingBeforeExclusion.sourceSeatId].length === 0
  ) {
    finishGame(next, { type: "winner", winnerSeatId: pendingBeforeExclusion.sourceSeatId });
    return success(next);
  }

  const currentActor = next.turn?.actorSeatId;
  if (currentActor === seatId || wasPendingParticipant) {
    const following = nextSeat(next, seatId);
    if (!following) return failure("Недостаточно игроков");
    if (next.turn?.kind === "initial-color" && next.activeColor === null) {
      next.activeColor = UNO_COLORS[0];
    }
    startNormalTurn(next, following, nowMs, paused);
  }
  return success(next);
}

export function assertUnoState(state: UnoGameState): void {
  if (state.seatOrder.length < 2 || state.seatOrder.length > 10)
    throw new Error("Invalid UNO seat count");
  if (new Set(state.seatOrder).size !== state.seatOrder.length)
    throw new Error("Duplicate UNO seats");
  const expectedActive = state.seatOrder.filter(
    (seatId) => state.statusBySeatId[seatId] === "active",
  );
  if (
    expectedActive.length !== state.activeSeatIds.length ||
    expectedActive.some((id, index) => id !== state.activeSeatIds[index])
  ) {
    throw new Error("UNO active seat order is inconsistent");
  }
  const cards = [...state.drawPile, ...state.discardPile, ...state.removedFaceDown];
  for (const seatId of state.seatOrder) cards.push(...(state.hands[seatId] ?? []));
  const canonical = new Set(createUnoDeck().map((card) => card.id));
  if (
    cards.length !== 108 ||
    new Set(cards.map((card) => card.id)).size !== 108 ||
    cards.some((card) => !canonical.has(card.id))
  ) {
    throw new Error("UNO card conservation failed");
  }
  if (state.phase === "PLAYING") {
    if (state.discardPile.length === 0 || !state.turn)
      throw new Error("UNO playing state is incomplete");
    if (state.turn.kind !== "initial-color" && state.activeColor === null)
      throw new Error("UNO active color is missing");
    if (state.turn && state.statusBySeatId[state.turn.actorSeatId] !== "active")
      throw new Error("UNO actor is inactive");
    const hasWildDrawFourResponseTurn = state.turn.kind === "wild-draw-four-response";
    if (Boolean(state.pendingWildDrawFour) !== hasWildDrawFourResponseTurn) {
      throw new Error("UNO WDF response inverse is inconsistent");
    }
    if (state.pendingWildDrawFour) {
      const topDiscard = state.discardPile[state.discardPile.length - 1];
      if (
        state.turn.kind !== "wild-draw-four-response" ||
        state.turn.actorSeatId !== state.pendingWildDrawFour.targetSeatId
      ) {
        throw new Error("UNO WDF response is inconsistent");
      }
      if (
        state.pendingWildDrawFour.sourceSeatId === state.pendingWildDrawFour.targetSeatId ||
        state.statusBySeatId[state.pendingWildDrawFour.sourceSeatId] !== "active" ||
        state.statusBySeatId[state.pendingWildDrawFour.targetSeatId] !== "active" ||
        topDiscard?.kind !== "wild-draw-four" ||
        state.activeColor !== state.pendingWildDrawFour.declaredColor
      ) {
        throw new Error("UNO pending WDF is inconsistent");
      }
    }
  }
}
