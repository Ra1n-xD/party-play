import type {
  DurakCard,
  DurakLegalAction,
  DurakPrivateState,
  DurakPublicState,
  DurakSeatStatus,
  SeatId,
} from "../../../../shared/types.js";
import { canBeatDurakCard, sortDurakHand } from "./cards.js";
import { isDurakTurnReady } from "./engine.js";
import type { DurakGameState, DurakRoom } from "./runtime.js";

function isPaused(room: DurakRoom): boolean {
  return room.pauseReasons.admin || room.pauseReasons.disconnectedSeatIds.size > 0;
}

function getTrumpCardLocation(state: DurakGameState): {
  location: DurakPublicState["trumpCardLocation"];
  holderSeatId: SeatId | null;
} {
  const trumpCardId = state.trumpCard.id;
  if (state.drawPile.some((card) => card.id === trumpCardId)) {
    return { location: "deck", holderSeatId: null };
  }
  for (const seatId of state.seatOrder) {
    if (state.hands[seatId].some((card) => card.id === trumpCardId)) {
      return { location: "hand", holderSeatId: seatId };
    }
  }
  if (
    state.fight?.table.some(
      (pair) => pair.attack.id === trumpCardId || pair.defense?.id === trumpCardId,
    )
  ) {
    return { location: "table", holderSeatId: null };
  }
  if (state.discard.some((card) => card.id === trumpCardId)) {
    return { location: "discard", holderSeatId: null };
  }
  if (state.removedFaceDown.some((card) => card.id === trumpCardId)) {
    return { location: "removed", holderSeatId: null };
  }
  return { location: null, holderSeatId: null };
}

function remainingTurnMs(state: DurakGameState, nowMs: number): number | null {
  const turn = state.turn;
  if (!turn || !isDurakTurnReady(turn, nowMs)) return null;
  const clock = turn.clock;
  if (!clock || clock.kind === "unlimited") return null;
  return clock.kind === "frozen" ? clock.remainingMs : Math.max(0, clock.deadlineAt - nowMs);
}

function lobbyPublicState(room: DurakRoom): DurakPublicState {
  return {
    gameId: "durak",
    revision: room.revision,
    phase: "LOBBY",
    fightStage: null,
    dealerSeatId: null,
    attackerSeatId: null,
    defenderSeatId: null,
    currentActorSeatId: null,
    activeOrder: [],
    throwInOrder: [],
    passedSeatIds: [],
    table: [],
    takeDeclared: false,
    maxAttackCards: 0,
    trumpSuit: null,
    trumpCard: null,
    trumpCardLocation: null,
    trumpCardHolderSeatId: null,
    deckCount: 0,
    discardCount: 0,
    visualEvents: [],
    players: room.allPlayerIds
      .map((seatId) => room.players.get(seatId))
      .filter((player) => player !== undefined)
      .map((player) => ({
        seatId: player.id,
        name: player.owner.name,
        cardCount: 0,
        status: player.kicked ? ("excluded" as const) : ("active" as const),
        connected: player.controller.kind !== "none",
        controllerKind: player.controller.kind,
        temporaryBot: player.temporaryBot,
        isDealer: false,
        isAttacker: false,
        isDefender: false,
        isCurrentActor: false,
      })),
    turnRemainingMs: null,
    paused: false,
    spectatorCount: room.spectators.size,
    result: null,
  };
}

export function buildDurakPublicState(room: DurakRoom, nowMs = Date.now()): DurakPublicState {
  const state = room.gameState;
  if (!state) return lobbyPublicState(room);

  const fight = state.fight;
  const currentActorSeatId =
    state.turn && isDurakTurnReady(state.turn, nowMs) ? state.turn.actorSeatId : null;
  const trumpLocation = getTrumpCardLocation(state);
  const players = state.seatOrder.map((seatId) => {
    const player = room.players.get(seatId);
    const status: DurakSeatStatus =
      state.statusBySeatId[seatId] ?? (player?.kicked ? "excluded" : "out");
    return {
      seatId,
      name: player?.owner.name ?? player?.name ?? "Игрок",
      cardCount: state.hands[seatId]?.length ?? 0,
      status,
      connected: player ? player.controller.kind !== "none" : false,
      controllerKind: player?.controller.kind ?? ("none" as const),
      temporaryBot: player?.temporaryBot ?? false,
      isDealer: seatId === state.dealerSeatId,
      isAttacker: seatId === fight?.primaryAttackerSeatId,
      isDefender: seatId === fight?.defenderSeatId,
      isCurrentActor: seatId === currentActorSeatId,
    };
  });

  return {
    gameId: "durak",
    revision: room.revision,
    phase: state.phase === "GAME_OVER" ? "GAME_OVER" : "PLAYING",
    fightStage:
      fight?.stage === "opening"
        ? "attack"
        : fight?.stage === "defense"
          ? "defense"
          : (fight?.stage ?? null),
    dealerSeatId: state.dealerSeatId,
    attackerSeatId: fight?.primaryAttackerSeatId ?? null,
    defenderSeatId: fight?.defenderSeatId ?? null,
    currentActorSeatId,
    activeOrder: [...state.activeOrder],
    throwInOrder: fight ? [...fight.throwInOrder] : [],
    passedSeatIds: fight ? [...fight.passedSeatIds] : [],
    table: fight ? fight.table.map((pair) => ({ ...pair })) : [],
    takeDeclared: fight?.takeDeclared ?? false,
    maxAttackCards: fight?.maxAttackCards ?? 0,
    trumpSuit: state.trumpSuit,
    trumpCard: state.trumpCard,
    trumpCardLocation: trumpLocation.location,
    trumpCardHolderSeatId: trumpLocation.holderSeatId,
    deckCount: state.drawPile.length,
    discardCount: state.discard.length,
    visualEvents: state.visualEvents.map((event) =>
      event.type === "transfer"
        ? { ...event, source: { ...event.source }, target: { ...event.target } }
        : { ...event },
    ),
    players,
    turnRemainingMs: remainingTurnMs(state, nowMs),
    paused: isPaused(room),
    spectatorCount: room.spectators.size,
    result: state.result ? { ...state.result } : null,
  };
}

function waitAction(): DurakLegalAction {
  return { type: "wait" };
}

export function getDurakLegalAction(
  room: DurakRoom,
  seatId: SeatId,
  nowMs = Date.now(),
): DurakLegalAction {
  const state = room.gameState;
  const fight = state?.fight;
  const turn = state?.turn;
  if (
    !state ||
    state.phase !== "PLAYING" ||
    !fight ||
    !turn ||
    !isDurakTurnReady(turn, nowMs) ||
    isPaused(room) ||
    state.statusBySeatId[seatId] !== "active"
  ) {
    return waitAction();
  }

  const hand = state.hands[seatId];
  if (turn.kind === "opening") {
    if (turn.actorSeatId !== seatId) return waitAction();
    return {
      type: "attack",
      playableCardIds: hand.map((card) => card.id),
      maxCards: fight.maxAttackCards,
    };
  }

  if (fight.stage === "defense" && fight.defenderSeatId === seatId) {
    const uncoveredAttacks = fight.table.filter((pair) => pair.defense === null);
    if (uncoveredAttacks.length === 0) return waitAction();
    const targets = hand.flatMap((defenseCard) => {
      const attackCardIds = uncoveredAttacks
        .filter((pair) => canBeatDurakCard(defenseCard, pair.attack, state.trumpSuit))
        .map((pair) => pair.attack.id);
      return attackCardIds.length > 0 ? [{ defenseCardId: defenseCard.id, attackCardIds }] : [];
    });
    return { type: "defend", targets, canTake: true };
  }

  if (
    (fight.stage !== "defense" && fight.stage !== "throw-in" && fight.stage !== "take-throw-in") ||
    fight.defenderSeatId === seatId ||
    !fight.throwInOrder.includes(seatId) ||
    fight.passedSeatIds.includes(seatId)
  ) {
    return waitAction();
  }

  const tableRanks = new Set(
    fight.table.flatMap((pair) =>
      pair.defense ? [pair.attack.rank, pair.defense.rank] : [pair.attack.rank],
    ),
  );
  const remainingCapacity = fight.maxAttackCards - fight.table.length;
  const isPrimaryAttacker = seatId === fight.primaryAttackerSeatId;
  const canPass = fight.takeDeclared || !isPrimaryAttacker;
  const canBeat =
    !fight.takeDeclared &&
    isPrimaryAttacker &&
    fight.stage === "throw-in" &&
    fight.table.every((pair) => pair.defense !== null);
  if (remainingCapacity <= 0) {
    if (canBeat) return { type: "beat", canBeat: true };
    if (canPass) return { type: "pass", canPass: true };
    return waitAction();
  }
  const playableCardIds = hand.filter((card) => tableRanks.has(card.rank)).map((card) => card.id);
  if (playableCardIds.length === 0) {
    if (canBeat) return { type: "beat", canBeat: true };
    if (canPass) return { type: "pass", canPass: true };
    return waitAction();
  }
  return {
    type: "throw-in",
    playableCardIds,
    maxCards: remainingCapacity,
    canPass,
    canBeat,
  };
}

export function buildDurakPrivateState(
  room: DurakRoom,
  seatId: SeatId,
  nowMs = Date.now(),
): DurakPrivateState | null {
  const player = room.players.get(seatId);
  if (!player || player.kicked) return null;
  const state = room.gameState;
  const hand: DurakCard[] = state ? sortDurakHand(state.hands[seatId] ?? [], state.trumpSuit) : [];
  return {
    seatId,
    hand,
    legalAction: getDurakLegalAction(room, seatId, nowMs),
  };
}
