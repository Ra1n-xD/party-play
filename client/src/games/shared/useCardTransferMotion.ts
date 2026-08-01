import { useEffect, useLayoutEffect, useRef } from "react";
import type { CardTransferVisualEvent, CardVisualAnchor } from "../../../../shared/types";

interface UseCardTransferMotionOptions {
  gameId: "durak" | "uno";
  revision: string | number;
  events: readonly CardTransferVisualEvent[];
  animateInitial?: boolean;
}

const CARD_TRANSFER_DURATION_MS = 1_650;
const CARD_TRANSFER_EVENT_STAGGER_MS = 90;
const CARD_TRANSFER_CARD_STAGGER_MS = 100;
const DURAK_TAKE_PHASE_PAUSE_MS = 250;
const CARD_TRANSFER_CLEANUP_BUFFER_MS = 250;

function findByDataAttribute(attribute: string, value: string): HTMLElement | null {
  return (
    Array.from(document.querySelectorAll<HTMLElement>(`[${attribute}]`)).find(
      (element) => element.getAttribute(attribute) === value,
    ) ?? null
  );
}

function findAnchor(gameId: "durak" | "uno", anchor: CardVisualAnchor): HTMLElement | null {
  if (anchor.kind === "player") {
    return findByDataAttribute("data-card-player-seat", anchor.seatId);
  }
  return findByDataAttribute("data-card-motion-anchor", `${gameId}:${anchor.kind}`);
}

export function useCardTransferMotion({
  gameId,
  revision,
  events,
  animateInitial = false,
}: UseCardTransferMotionOptions): void {
  const previousIdsRef = useRef<Set<number> | null>(null);
  const cleanupTimersRef = useRef<number[]>([]);

  useLayoutEffect(() => {
    const currentIds = new Set(events.map((event) => event.id));
    const previousIds = previousIdsRef.current;
    previousIdsRef.current = currentIds;
    if (!previousIds && !animateInitial) return;

    const freshEvents = events
      .filter((event) => !previousIds?.has(event.id))
      .filter(
        (event) =>
          !(
            event.source.kind === "player" &&
            (event.target.kind === "table" || event.target.kind === "discard")
          ),
      );
    const durakTableTakeIndex =
      gameId === "durak"
        ? freshEvents.findIndex(
            (event) => event.source.kind === "table" && event.target.kind === "player",
          )
        : -1;
    const durakTableTakeEvent = freshEvents[durakTableTakeIndex];
    const durakRefillPhaseDelay = durakTableTakeEvent
      ? CARD_TRANSFER_DURATION_MS +
        (Math.min(durakTableTakeEvent.cardCount, 3) - 1) * CARD_TRANSFER_CARD_STAGGER_MS +
        DURAK_TAKE_PHASE_PAUSE_MS
      : 0;
    let durakRefillEventIndex = 0;

    freshEvents.forEach((event, eventIndex) => {
      const source = findAnchor(gameId, event.source);
      const target = findAnchor(gameId, event.target);
      if (!source || !target) return;

      const sourceRect = source.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const sourceCenterX = sourceRect.left + sourceRect.width / 2;
      const sourceCenterY = sourceRect.top + sourceRect.height / 2;
      const targetCenterX = targetRect.left + targetRect.width / 2;
      const targetCenterY = targetRect.top + targetRect.height / 2;
      const visibleCards = Math.min(event.cardCount, 3);
      const isDurakRefillAfterTake =
        durakTableTakeIndex >= 0 &&
        eventIndex > durakTableTakeIndex &&
        event.source.kind === "deck" &&
        event.target.kind === "player";
      const eventDelay = isDurakRefillAfterTake
        ? durakRefillPhaseDelay + durakRefillEventIndex++ * (CARD_TRANSFER_EVENT_STAGGER_MS + 40)
        : Math.min(eventIndex, 4) * CARD_TRANSFER_EVENT_STAGGER_MS;

      for (let cardIndex = 0; cardIndex < visibleCards; cardIndex++) {
        const flightDelay = eventDelay + cardIndex * CARD_TRANSFER_CARD_STAGGER_MS;
        const flight = document.createElement("div");
        flight.className = `card-transfer-flight is-${gameId}`;
        flight.setAttribute("aria-hidden", "true");
        flight.style.left = `${sourceCenterX}px`;
        flight.style.top = `${sourceCenterY}px`;
        flight.style.setProperty("--card-transfer-x", `${targetCenterX - sourceCenterX}px`);
        flight.style.setProperty("--card-transfer-y", `${targetCenterY - sourceCenterY}px`);
        flight.style.setProperty("--card-transfer-delay", `${flightDelay}ms`);
        flight.style.setProperty("--card-transfer-duration", `${CARD_TRANSFER_DURATION_MS}ms`);
        flight.style.setProperty("--card-transfer-tilt", `${(cardIndex - 1) * 4}deg`);

        if (cardIndex === visibleCards - 1 && event.cardCount > 1) {
          const count = document.createElement("span");
          count.className = "card-transfer-count";
          count.textContent = `×${event.cardCount}`;
          flight.append(count);
        }

        document.body.append(flight);
        const cleanupTimer = window.setTimeout(
          () => {
            flight.remove();
            cleanupTimersRef.current = cleanupTimersRef.current.filter(
              (timer) => timer !== cleanupTimer,
            );
          },
          flightDelay + CARD_TRANSFER_DURATION_MS + CARD_TRANSFER_CLEANUP_BUFFER_MS,
        );
        cleanupTimersRef.current.push(cleanupTimer);
      }
    });
  }, [animateInitial, events, gameId, revision]);

  useEffect(
    () => () => {
      previousIdsRef.current = null;
      cleanupTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      cleanupTimersRef.current = [];
      document
        .querySelectorAll(`.card-transfer-flight.is-${gameId}`)
        .forEach((node) => node.remove());
    },
    [gameId],
  );
}
