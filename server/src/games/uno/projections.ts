import type {
  SeatId,
  UnoCard,
  UnoLegalActions,
  UnoPrivateState,
  UnoPublicState,
  UnoSeatStatus,
} from "../../../../shared/types.js";
import { canPlayUnoCard } from "./cards.js";
import type { UnoGameState, UnoRoom } from "./runtime.js";

function isPaused(room: UnoRoom): boolean {
  return room.pauseReasons.admin || room.pauseReasons.disconnectedSeatIds.size > 0;
}

function remainingTurnMs(state: UnoGameState, nowMs: number): number | null {
  const clock = state.turn?.clock;
  if (!clock || clock.kind === "unlimited") return null;
  return clock.kind === "frozen" ? clock.remainingMs : Math.max(0, clock.deadlineAt - nowMs);
}

function lobbyPublicState(room: UnoRoom): UnoPublicState {
  return {
    gameId: "uno",
    revision: room.revision,
    phase: "LOBBY",
    dealerSeatId: null,
    currentActorSeatId: null,
    turnKind: null,
    activeOrder: [],
    direction: "clockwise",
    topDiscard: null,
    lastPlayedBySeatId: null,
    activeColor: null,
    drawPileCount: 0,
    discardPileCount: 0,
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
        isCurrentActor: false,
      })),
    pendingWildDrawFour: null,
    unoWindow: null,
    lastChallengeResolution: null,
    turnRemainingMs: null,
    paused: false,
    spectatorCount: room.spectators.size,
    result: null,
  };
}

export function buildUnoPublicState(room: UnoRoom, nowMs = Date.now()): UnoPublicState {
  const state = room.gameState;
  if (!state) return lobbyPublicState(room);
  return {
    gameId: "uno",
    revision: room.revision,
    phase: state.phase,
    dealerSeatId: state.dealerSeatId,
    currentActorSeatId: state.turn?.actorSeatId ?? null,
    turnKind: state.turn?.kind ?? null,
    activeOrder: [...state.activeSeatIds],
    direction: state.direction === 1 ? "clockwise" : "counterclockwise",
    topDiscard: state.discardPile[state.discardPile.length - 1] ?? null,
    lastPlayedBySeatId: state.lastPlayedBySeatId,
    activeColor: state.activeColor,
    drawPileCount: state.drawPile.length,
    discardPileCount: state.discardPile.length,
    visualEvents: state.visualEvents.map((event) =>
      event.type === "transfer"
        ? { ...event, source: { ...event.source }, target: { ...event.target } }
        : { ...event },
    ),
    players: state.seatOrder.map((seatId) => {
      const player = room.players.get(seatId);
      const status: UnoSeatStatus = state.statusBySeatId[seatId] ?? "excluded";
      return {
        seatId,
        name: player?.owner.name ?? player?.name ?? "Игрок",
        cardCount: state.hands[seatId]?.length ?? 0,
        status,
        connected: player ? player.controller.kind !== "none" : false,
        controllerKind: player?.controller.kind ?? "none",
        temporaryBot: player?.temporaryBot ?? false,
        isDealer: seatId === state.dealerSeatId,
        isCurrentActor: seatId === state.turn?.actorSeatId,
      };
    }),
    pendingWildDrawFour: state.pendingWildDrawFour
      ? {
          id: state.pendingWildDrawFour.id,
          sourceSeatId: state.pendingWildDrawFour.sourceSeatId,
          targetSeatId: state.pendingWildDrawFour.targetSeatId,
          declaredColor: state.pendingWildDrawFour.declaredColor,
          previousActiveColor: state.pendingWildDrawFour.previousActiveColor,
        }
      : null,
    unoWindow: state.unoWindow
      ? { id: state.unoWindow.id, subjectSeatId: state.unoWindow.subjectSeatId }
      : null,
    lastChallengeResolution: state.lastChallengeResolution
      ? { ...state.lastChallengeResolution }
      : null,
    turnRemainingMs: remainingTurnMs(state, nowMs),
    paused: isPaused(room),
    spectatorCount: room.spectators.size,
    result: state.result ? { ...state.result } : null,
  };
}

function emptyLegalActions(): UnoLegalActions {
  return {
    playableCardIds: [],
    bluffableWildDrawFourCardIds: [],
    canDraw: false,
    drawnCardId: null,
    canEndTurn: false,
    canChooseInitialColor: false,
    wildDrawFourResponseId: null,
    canAcceptWildDrawFour: false,
    canChallengeWildDrawFour: false,
    canDeclareUno: false,
    declareUnoWindowId: null,
    catchUno: null,
  };
}

export function getUnoLegalActions(room: UnoRoom, seatId: SeatId): UnoLegalActions {
  const state = room.gameState;
  const player = room.players.get(seatId);
  const legal = emptyLegalActions();
  if (
    !state ||
    state.phase !== "PLAYING" ||
    !state.turn ||
    !player ||
    player.kicked ||
    state.statusBySeatId[seatId] !== "active" ||
    isPaused(room)
  ) {
    return legal;
  }

  const window = state.unoWindow;
  if (window?.subjectSeatId === seatId) {
    legal.canDeclareUno = true;
    legal.declareUnoWindowId = window.id;
  } else if (window && window.subjectSeatId !== seatId) {
    legal.catchUno = { windowId: window.id, targetSeatId: window.subjectSeatId };
  }

  if (state.turn.actorSeatId !== seatId) return legal;
  const hand = state.hands[seatId];
  if (state.turn.kind === "normal") {
    const top = state.discardPile[state.discardPile.length - 1];
    if (top && state.activeColor) {
      legal.playableCardIds = hand
        .filter((card) => canPlayUnoCard(card, top, state.activeColor!))
        .map((card) => card.id);
      const hasMatchingColor = hand.some((card) => card.color === state.activeColor);
      legal.bluffableWildDrawFourCardIds = hasMatchingColor
        ? hand.filter((card) => card.kind === "wild-draw-four").map((card) => card.id)
        : [];
    }
    legal.canDraw = legal.playableCardIds.length === 0;
    if (
      hand.length === 2 &&
      !(state.preDeclaredUno?.seatId === seatId && state.preDeclaredUno.turnId === state.turn.id)
    ) {
      legal.canDeclareUno = true;
    }
    return legal;
  }
  if (state.turn.kind === "after-draw") {
    const drawn = hand.find((card) => card.id === state.turn!.drawnCardId);
    const top = state.discardPile[state.discardPile.length - 1];
    if (drawn && top && state.activeColor && canPlayUnoCard(drawn, top, state.activeColor)) {
      legal.playableCardIds = [drawn.id];
    }
    legal.drawnCardId = state.turn.drawnCardId;
    legal.canEndTurn = true;
    return legal;
  }
  if (state.turn.kind === "initial-color") {
    legal.canChooseInitialColor = true;
    return legal;
  }
  if (state.turn.kind === "wild-draw-four-response" && state.pendingWildDrawFour) {
    legal.wildDrawFourResponseId = state.pendingWildDrawFour.id;
    legal.canAcceptWildDrawFour = true;
    legal.canChallengeWildDrawFour = true;
  }
  return legal;
}

export function buildUnoPrivateState(room: UnoRoom, seatId: SeatId): UnoPrivateState | null {
  const player = room.players.get(seatId);
  if (!player || player.kicked) return null;
  const state = room.gameState;
  const hand: UnoCard[] = state ? [...(state.hands[seatId] ?? [])] : [];
  return { seatId, hand, legalActions: getUnoLegalActions(room, seatId) };
}
