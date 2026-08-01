import { useEffect, useLayoutEffect, useRef } from "react";

export interface TableCardFlight {
  key: string;
  sourceSeatId: string;
  targetId: string;
}

interface UseTableCardFlightOptions {
  revision: string | number;
  flights: readonly TableCardFlight[];
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

export function useTableCardFlight({ revision, flights }: UseTableCardFlightOptions): void {
  const previousKeysRef = useRef<Set<string> | null>(null);
  const cleanupTimersRef = useRef<number[]>([]);

  useLayoutEffect(() => {
    const currentKeys = new Set(flights.map((flight) => flight.key));
    const previousKeys = previousKeysRef.current;
    previousKeysRef.current = currentKeys;
    if (!previousKeys) return;

    flights
      .filter((flight) => !previousKeys.has(flight.key))
      .forEach((flight, index) => {
        const source = findByDataAttribute("data-card-player-seat", flight.sourceSeatId);
        const target = findByDataAttribute("data-table-card-flight", flight.targetId);
        if (!source || !target) return;

        const sourceRect = source.getBoundingClientRect();
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

  useEffect(
    () => () => {
      cleanupTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      cleanupTimersRef.current = [];
    },
    [],
  );
}
