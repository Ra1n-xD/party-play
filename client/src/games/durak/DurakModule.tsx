import { useEffect, useRef, useState } from "react";
import {
  DURAK_REFILL_EVENT_STAGGER_MS,
  DURAK_REFILL_PHASE_PAUSE_MS,
  DURAK_TRANSFER_CARD_STAGGER_MS,
  DURAK_TRANSFER_DURATION_MS,
  type DurakVisualEvent,
} from "../../../../shared/games/durak/types";
import type { CardTransferVisualEvent } from "../../../../shared/platform/cardVisualEvents";
import type { RoomLifecycle, RoomSnapshot } from "../../../../shared/platform/room";
import { usePlatform } from "../../platform/context/PlatformContext";
import { LobbyScreen } from "../../platform/screens/LobbyScreen";
import "../../styles/game-screen.css";
import { DurakGameScreen } from "./DurakGameScreen";
import { DurakLobbySettings, getTurnTimeoutLabel } from "./DurakLobbySettings";
import { DurakResultsScreen } from "./DurakResultsScreen";
import "./durak.css";
import "../shared/card-game-arena.css";

function isTableResolutionTransfer(event: DurakVisualEvent): event is CardTransferVisualEvent {
  return (
    event.type === "transfer" &&
    event.source.kind === "table" &&
    (event.target.kind === "player" || event.target.kind === "discard")
  );
}

function getTransferDurationMs(event: CardTransferVisualEvent): number {
  const visibleCardCount = Math.max(1, Math.min(event.cardCount, 3));
  return DURAK_TRANSFER_DURATION_MS + (visibleCardCount - 1) * DURAK_TRANSFER_CARD_STAGGER_MS;
}

function getFreshResultTransitionDurationMs(
  events: readonly DurakVisualEvent[],
  previousEventIds: ReadonlySet<number>,
): number {
  const freshTransfers = events.filter(
    (event): event is CardTransferVisualEvent =>
      event.type === "transfer" && !previousEventIds.has(event.id),
  );
  let tableResolutionIndex = -1;
  freshTransfers.forEach((event, index) => {
    if (isTableResolutionTransfer(event)) tableResolutionIndex = index;
  });
  if (tableResolutionIndex < 0) return 0;

  const tableDurationMs = getTransferDurationMs(freshTransfers[tableResolutionIndex]);
  const refillPhaseStartMs = tableDurationMs + DURAK_REFILL_PHASE_PAUSE_MS;
  let latestFinishMs = tableDurationMs;
  let refillIndex = 0;

  freshTransfers.slice(tableResolutionIndex + 1).forEach((event) => {
    if (event.source.kind !== "deck" || event.target.kind !== "player") return;
    latestFinishMs = Math.max(
      latestFinishMs,
      refillPhaseStartMs +
        refillIndex * DURAK_REFILL_EVENT_STAGGER_MS +
        getTransferDurationMs(event),
    );
    refillIndex++;
  });

  return latestFinishMs;
}

function getPrefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(getPrefersReducedMotion);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setPrefersReducedMotion(mediaQuery.matches);
    updatePreference();
    mediaQuery.addEventListener("change", updatePreference);
    return () => mediaQuery.removeEventListener("change", updatePreference);
  }, []);

  return prefersReducedMotion;
}

export default function DurakModule() {
  const { snapshot } = usePlatform();
  const previousLifecycleRef = useRef<RoomLifecycle | null>(null);
  const previousVisualEventIdsRef = useRef<Set<number>>(new Set());
  const resultTransitionTimerRef = useRef<number | null>(null);
  const [resultTransitionActive, setResultTransitionActive] = useState(false);
  const prefersReducedMotion = usePrefersReducedMotion();
  const durakSnapshot = snapshot?.gameId === "durak" ? (snapshot as RoomSnapshot<"durak">) : null;
  const currentLifecycle = durakSnapshot?.lifecycle ?? null;
  const visualEvents = durakSnapshot?.game?.visualEvents ?? [];
  const animateInitialDeal =
    previousLifecycleRef.current === "lobby" && currentLifecycle === "playing";
  const justEnteredResults =
    previousLifecycleRef.current === "playing" && currentLifecycle === "results";
  const immediateResultTransitionDurationMs =
    justEnteredResults && !prefersReducedMotion
      ? getFreshResultTransitionDurationMs(visualEvents, previousVisualEventIdsRef.current)
      : 0;

  useEffect(() => {
    const previousLifecycle = previousLifecycleRef.current;
    previousLifecycleRef.current = currentLifecycle;
    previousVisualEventIdsRef.current = new Set(visualEvents.map((event) => event.id));

    if (prefersReducedMotion) {
      if (resultTransitionTimerRef.current !== null) {
        window.clearTimeout(resultTransitionTimerRef.current);
        resultTransitionTimerRef.current = null;
      }
      setResultTransitionActive(false);
      return;
    }

    if (
      previousLifecycle === "playing" &&
      currentLifecycle === "results" &&
      immediateResultTransitionDurationMs > 0
    ) {
      setResultTransitionActive(true);
      resultTransitionTimerRef.current = window.setTimeout(() => {
        resultTransitionTimerRef.current = null;
        setResultTransitionActive(false);
      }, immediateResultTransitionDurationMs);
      return;
    }

    if (currentLifecycle !== "results") {
      if (resultTransitionTimerRef.current !== null) {
        window.clearTimeout(resultTransitionTimerRef.current);
        resultTransitionTimerRef.current = null;
      }
      setResultTransitionActive(false);
    }
  }, [
    currentLifecycle,
    durakSnapshot?.revision,
    immediateResultTransitionDurationMs,
    prefersReducedMotion,
    visualEvents,
  ]);

  useEffect(
    () => () => {
      if (resultTransitionTimerRef.current !== null) {
        window.clearTimeout(resultTransitionTimerRef.current);
      }
    },
    [],
  );

  if (!snapshot || snapshot.gameId !== "durak") {
    return (
      <div className="screen platform-room-loading" role="status">
        Загружаем карточный стол…
      </div>
    );
  }

  const currentDurakSnapshot: RoomSnapshot<"durak"> = snapshot;

  if (currentDurakSnapshot.lifecycle === "lobby") {
    return (
      <LobbyScreen
        extraInfo={
          <span>
            Таймер: {getTurnTimeoutLabel(currentDurakSnapshot.settings.turnTimeoutSeconds)}
          </span>
        }
        settingsPanel={<DurakLobbySettings />}
      />
    );
  }

  if (
    currentDurakSnapshot.lifecycle === "results" ||
    currentDurakSnapshot.game?.phase === "GAME_OVER"
  ) {
    if (
      !prefersReducedMotion &&
      (immediateResultTransitionDurationMs > 0 || resultTransitionActive)
    ) {
      return <DurakGameScreen snapshot={currentDurakSnapshot} />;
    }
    return <DurakResultsScreen snapshot={currentDurakSnapshot} />;
  }

  return (
    <DurakGameScreen snapshot={currentDurakSnapshot} animateInitialDeal={animateInitialDeal} />
  );
}
