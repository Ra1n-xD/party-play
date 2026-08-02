import { useEffect, useLayoutEffect, useRef } from "react";

export interface TableCardFlight {
  key: string;
  sourceSeatId: string;
  sourceId?: string;
  targetId: string;
  suppress?: boolean;
}

interface UseTableCardFlightOptions {
  revision: string | number;
  flights: readonly TableCardFlight[];
  sourceDataAttribute?: string;
  sourceElementSelector?: string;
}

const TABLE_CARD_FLIGHT_DURATION_MS = 680;
const TABLE_CARD_FLIGHT_STAGGER_MS = 55;
const TABLE_CARD_FLIGHT_CLEANUP_BUFFER_MS = 220;

function findByDataAttribute(attribute: string, value: string): HTMLElement | null {
  return (
    Array.from(document.querySelectorAll<HTMLElement>(`[${attribute}]`)).find(
      (element) => element.getAttribute(attribute) === value,
    ) ?? null
  );
}

export function useTableCardFlight({
  revision,
  flights,
  sourceDataAttribute,
  sourceElementSelector,
}: UseTableCardFlightOptions): void {
  const previousKeysRef = useRef<Set<string> | null>(null);
  const previousSourceRectsRef = useRef<Map<string, DOMRect>>(new Map());
  const cleanupTimersRef = useRef<number[]>([]);

  useLayoutEffect(() => {
    const currentKeys = new Set(flights.map((flight) => flight.key));
    const previousKeys = previousKeysRef.current;
    previousKeysRef.current = currentKeys;
    if (!previousKeys) return;

    flights
      .filter((flight) => !previousKeys.has(flight.key))
      .forEach((flight, index) => {
        if (flight.suppress) return;

        const cachedSourceRect = flight.sourceId
          ? previousSourceRectsRef.current.get(flight.sourceId)
          : undefined;
        const fallbackSource = cachedSourceRect
          ? null
          : findByDataAttribute("data-card-player-seat", flight.sourceSeatId);
        const target = findByDataAttribute("data-table-card-flight", flight.targetId);
        if ((!cachedSourceRect && !fallbackSource) || !target) return;

        const sourceRect = cachedSourceRect ?? fallbackSource!.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        const sourceCenterX = sourceRect.left + sourceRect.width / 2;
        const sourceCenterY = sourceRect.top + sourceRect.height / 2;
        const targetCenterX = targetRect.left + targetRect.width / 2;
        const targetCenterY = targetRect.top + targetRect.height / 2;

        target.style.setProperty("--table-card-flight-x", `${sourceCenterX - targetCenterX}px`);
        target.style.setProperty("--table-card-flight-y", `${sourceCenterY - targetCenterY}px`);
        const flightDelay = Math.min(index, 4) * TABLE_CARD_FLIGHT_STAGGER_MS;
        target.style.setProperty("--table-card-flight-delay", `${flightDelay}ms`);
        target.classList.remove("is-table-card-flying");
        void target.offsetWidth;
        target.classList.add("is-table-card-flying");

        const cleanupTimer = window.setTimeout(
          () => {
            target.classList.remove("is-table-card-flying");
            target.style.removeProperty("--table-card-flight-x");
            target.style.removeProperty("--table-card-flight-y");
            target.style.removeProperty("--table-card-flight-delay");
            cleanupTimersRef.current = cleanupTimersRef.current.filter(
              (timer) => timer !== cleanupTimer,
            );
          },
          flightDelay + TABLE_CARD_FLIGHT_DURATION_MS + TABLE_CARD_FLIGHT_CLEANUP_BUFFER_MS,
        );
        cleanupTimersRef.current.push(cleanupTimer);
      });
  }, [flights, revision]);

  useLayoutEffect(() => {
    if (!sourceDataAttribute) {
      previousSourceRectsRef.current = new Map();
      return;
    }

    const nextSourceRects = new Map<string, DOMRect>();
    document.querySelectorAll<HTMLElement>(`[${sourceDataAttribute}]`).forEach((element) => {
      const sourceId = element.getAttribute(sourceDataAttribute);
      if (!sourceId) return;
      const sourceElement = sourceElementSelector
        ? (element.querySelector<HTMLElement>(sourceElementSelector) ?? element)
        : element;
      nextSourceRects.set(sourceId, sourceElement.getBoundingClientRect());
    });
    previousSourceRectsRef.current = nextSourceRects;
  });

  useEffect(
    () => () => {
      previousSourceRectsRef.current = new Map();
      cleanupTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      cleanupTimersRef.current = [];
    },
    [],
  );
}
