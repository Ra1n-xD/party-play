import { useEffect, useRef, useState } from "react";
import type { PlayerActionVisualEvent } from "../../../../shared/types";

export interface PlayerActionIndicator {
  eventId: number;
  label: string;
}

export function usePlayerActionIndicators<Action extends string>(
  events: readonly PlayerActionVisualEvent<Action>[],
  labels: Readonly<Record<Action, string>>,
): Readonly<Record<string, PlayerActionIndicator>> {
  const previousIdsRef = useRef<Set<number> | null>(null);
  const timersRef = useRef<number[]>([]);
  const [indicators, setIndicators] = useState<Record<string, PlayerActionIndicator>>({});

  useEffect(() => {
    const currentIds = new Set(events.map((event) => event.id));
    const previousIds = previousIdsRef.current;
    previousIdsRef.current = currentIds;
    if (!previousIds) return;

    const freshEvents = events.filter((event) => !previousIds.has(event.id));
    if (freshEvents.length === 0) return;

    setIndicators((current) => {
      const next = { ...current };
      for (const event of freshEvents) {
        next[event.seatId] = { eventId: event.id, label: labels[event.action] };
      }
      return next;
    });

    for (const event of freshEvents) {
      const timer = window.setTimeout(() => {
        setIndicators((current) => {
          if (current[event.seatId]?.eventId !== event.id) return current;
          const next = { ...current };
          delete next[event.seatId];
          return next;
        });
        timersRef.current = timersRef.current.filter((candidate) => candidate !== timer);
      }, 2_200);
      timersRef.current.push(timer);
    }
  }, [events, labels]);

  useEffect(
    () => () => {
      timersRef.current.forEach((timer) => window.clearTimeout(timer));
      timersRef.current = [];
    },
    [],
  );

  return indicators;
}
