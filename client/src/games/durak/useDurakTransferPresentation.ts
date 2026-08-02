import { useLayoutEffect, useRef, useState } from "react";
import {
  DURAK_REFILL_EVENT_STAGGER_MS,
  DURAK_REFILL_PHASE_PAUSE_MS,
  DURAK_TRANSFER_CARD_STAGGER_MS,
  DURAK_TRANSFER_DURATION_MS,
  type DurakCard,
  type DurakPlayerPublicState,
} from "../../../../shared/games/durak/types";
import type { CardTransferVisualEvent } from "../../../../shared/platform/cardVisualEvents";

export type DurakHandArrivalPhase = "hidden" | "arriving";

interface DurakTransferPresentation {
  cardCountOverrides: Readonly<Record<string, number>>;
  deckCountOverride: number | null;
  handArrivalPhases: Readonly<Record<string, DurakHandArrivalPhase>>;
}

interface UseDurakTransferPresentationOptions {
  revision: string | number;
  events: readonly CardTransferVisualEvent[];
  players: readonly DurakPlayerPublicState[];
  deckCount: number;
  hand: readonly DurakCard[];
  viewerSeatId: string | null;
  animateInitial: boolean;
}

interface ScheduledPresentationUpdate {
  delayMs: number;
  apply: (current: DurakTransferPresentation) => DurakTransferPresentation;
}

interface FreshPresentationPlan {
  initial: DurakTransferPresentation;
  updates: ScheduledPresentationUpdate[];
}

const DURAK_TRANSFER_EVENT_STAGGER_MS = 90;
const DURAK_HAND_REVEAL_DURATION_MS = 220;

const EMPTY_PRESENTATION: DurakTransferPresentation = {
  cardCountOverrides: {},
  deckCountOverride: null,
  handArrivalPhases: {},
};

function transferDurationMs(cardCount: number): number {
  return (
    DURAK_TRANSFER_DURATION_MS +
    (Math.min(Math.max(cardCount, 1), 3) - 1) * DURAK_TRANSFER_CARD_STAGGER_MS
  );
}

function isTableResolutionEvent(event: CardTransferVisualEvent): boolean {
  return (
    event.source.kind === "table" &&
    (event.target.kind === "player" || event.target.kind === "discard")
  );
}

function isGenericMotionEvent(event: CardTransferVisualEvent): boolean {
  return !(
    event.source.kind === "player" &&
    (event.target.kind === "table" || event.target.kind === "discard")
  );
}

function withoutKey<T>(record: Readonly<Record<string, T>>, key: string): Record<string, T> {
  const next = { ...record };
  delete next[key];
  return next;
}

function buildFreshPresentationPlan(
  events: readonly CardTransferVisualEvent[],
  previousEventIds: ReadonlySet<number> | null,
  showInitial: boolean,
  players: readonly DurakPlayerPublicState[],
  deckCount: number,
  newHandCardIds: readonly string[],
  viewerSeatId: string | null,
): FreshPresentationPlan | null {
  const freshEvents = events
    .filter((event) => (previousEventIds ? !previousEventIds.has(event.id) : showInitial))
    .filter(isGenericMotionEvent);
  if (freshEvents.length === 0) return null;

  let lastTableResolutionIndex = -1;
  freshEvents.forEach((event, index) => {
    if (isTableResolutionEvent(event)) lastTableResolutionIndex = index;
  });
  const motionEvents =
    lastTableResolutionIndex >= 0 ? freshEvents.slice(lastTableResolutionIndex) : freshEvents;
  const tableResolutionEvent = motionEvents.find(isTableResolutionEvent) ?? null;
  const tableResolutionDurationMs = tableResolutionEvent
    ? transferDurationMs(tableResolutionEvent.cardCount)
    : 0;
  const refillPhaseStartMs = tableResolutionEvent
    ? tableResolutionDurationMs + DURAK_REFILL_PHASE_PAUSE_MS
    : 0;
  let refillIndex = 0;

  const timedEvents = motionEvents.map((event, eventIndex) => {
    const isRefill =
      tableResolutionEvent !== null &&
      event.source.kind === "deck" &&
      event.target.kind === "player" &&
      eventIndex > 0;
    const startDelayMs = isRefill
      ? refillPhaseStartMs + refillIndex++ * DURAK_REFILL_EVENT_STAGGER_MS
      : Math.min(eventIndex, 4) * DURAK_TRANSFER_EVENT_STAGGER_MS;
    return {
      event,
      startDelayMs,
      finishDelayMs: startDelayMs + transferDurationMs(event.cardCount),
    };
  });

  const incomingCounts = new Map<string, number>();
  timedEvents.forEach(({ event }) => {
    if (event.target.kind !== "player") return;
    incomingCounts.set(
      event.target.seatId,
      (incomingCounts.get(event.target.seatId) ?? 0) + event.cardCount,
    );
  });

  const cardCountOverrides: Record<string, number> = {};
  players.forEach((player) => {
    const incomingCount = incomingCounts.get(player.seatId) ?? 0;
    if (incomingCount > 0) {
      cardCountOverrides[player.seatId] = Math.max(0, player.cardCount - incomingCount);
    }
  });

  const deckTransfers = timedEvents.filter(({ event }) => event.source.kind === "deck");
  const transferredDeckCardCount = deckTransfers.reduce(
    (count, { event }) => count + event.cardCount,
    0,
  );
  const handArrivalPhases = Object.fromEntries(
    newHandCardIds.map((cardId) => [cardId, "hidden" as const]),
  );
  const initial: DurakTransferPresentation = {
    cardCountOverrides,
    deckCountOverride: transferredDeckCardCount > 0 ? deckCount + transferredDeckCardCount : null,
    handArrivalPhases,
  };
  const updates: ScheduledPresentationUpdate[] = [];

  timedEvents.forEach(({ event, finishDelayMs }) => {
    if (event.target.kind !== "player") return;
    const seatId = event.target.seatId;
    updates.push({
      delayMs: finishDelayMs,
      apply: (current) => ({
        ...current,
        cardCountOverrides: withoutKey(current.cardCountOverrides, seatId),
      }),
    });
  });

  let displayedDeckCount = deckCount + transferredDeckCardCount;
  deckTransfers.forEach(({ event, startDelayMs }, index) => {
    displayedDeckCount -= event.cardCount;
    const nextDeckCount = displayedDeckCount;
    const isLastDeckTransfer = index === deckTransfers.length - 1;
    updates.push({
      delayMs: startDelayMs,
      apply: (current) => ({
        ...current,
        deckCountOverride: isLastDeckTransfer ? null : nextDeckCount,
      }),
    });
  });

  const viewerIncomingEvents = viewerSeatId
    ? timedEvents.filter(
        ({ event }) => event.target.kind === "player" && event.target.seatId === viewerSeatId,
      )
    : [];
  const viewerArrivalBaseMs = viewerIncomingEvents.reduce(
    (latest, { startDelayMs }) => Math.max(latest, startDelayMs + DURAK_TRANSFER_DURATION_MS),
    0,
  );
  if (viewerArrivalBaseMs > 0) {
    newHandCardIds.forEach((cardId, index) => {
      const arrivalDelayMs =
        viewerArrivalBaseMs + Math.min(index, 2) * DURAK_TRANSFER_CARD_STAGGER_MS;
      updates.push({
        delayMs: arrivalDelayMs,
        apply: (current) => ({
          ...current,
          handArrivalPhases: {
            ...current.handArrivalPhases,
            [cardId]: "arriving",
          },
        }),
      });
      updates.push({
        delayMs: arrivalDelayMs + DURAK_HAND_REVEAL_DURATION_MS,
        apply: (current) => ({
          ...current,
          handArrivalPhases: withoutKey(current.handArrivalPhases, cardId),
        }),
      });
    });
  }

  return { initial, updates };
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function useDurakTransferPresentation({
  revision,
  events,
  players,
  deckCount,
  hand,
  viewerSeatId,
  animateInitial,
}: UseDurakTransferPresentationOptions): DurakTransferPresentation {
  const previousEventIdsRef = useRef<Set<number> | null>(null);
  const previousHandIdsRef = useRef<Set<string> | null>(null);
  const timersRef = useRef<number[]>([]);
  const [presentation, setPresentation] = useState<DurakTransferPresentation>(EMPTY_PRESENTATION);
  const currentHandIds = new Set(hand.map((card) => card.id));
  const newHandCardIds = previousHandIdsRef.current
    ? hand.filter((card) => !previousHandIdsRef.current!.has(card.id)).map((card) => card.id)
    : animateInitial
      ? hand.map((card) => card.id)
      : [];
  const freshPlan = prefersReducedMotion()
    ? null
    : buildFreshPresentationPlan(
        events,
        previousEventIdsRef.current,
        animateInitial,
        players,
        deckCount,
        newHandCardIds,
        viewerSeatId,
      );

  useLayoutEffect(() => {
    previousEventIdsRef.current = new Set(events.map((event) => event.id));
    previousHandIdsRef.current = currentHandIds;
    if (!freshPlan) return;

    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
    setPresentation(freshPlan.initial);
    freshPlan.updates.forEach((update) => {
      const timer = window.setTimeout(() => {
        setPresentation(update.apply);
        timersRef.current = timersRef.current.filter((candidate) => candidate !== timer);
      }, update.delayMs);
      timersRef.current.push(timer);
    });
  }, [events, freshPlan, revision]);

  useLayoutEffect(
    () => () => {
      timersRef.current.forEach((timer) => window.clearTimeout(timer));
      timersRef.current = [];
      previousEventIdsRef.current = null;
      previousHandIdsRef.current = null;
    },
    [],
  );

  return freshPlan?.initial ?? presentation;
}
