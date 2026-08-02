import { useEffect, useRef, useState } from "react";
import { DURAK_ROUND_TRANSITION_DELAY_MS } from "../../../../shared/games/durak/types";
import type { RoomLifecycle, RoomSnapshot } from "../../../../shared/platform/room";
import { usePlatform } from "../../platform/context/PlatformContext";
import { LobbyScreen } from "../../platform/screens/LobbyScreen";
import "../../styles/game-screen.css";
import { DurakGameScreen } from "./DurakGameScreen";
import { DurakLobbySettings, getTurnTimeoutLabel } from "./DurakLobbySettings";
import { DurakResultsScreen } from "./DurakResultsScreen";
import "./durak.css";
import "../shared/card-game-arena.css";

export default function DurakModule() {
  const { snapshot } = usePlatform();
  const previousLifecycleRef = useRef<RoomLifecycle | null>(null);
  const [resultTransitionActive, setResultTransitionActive] = useState(false);
  const currentLifecycle = snapshot?.gameId === "durak" ? snapshot.lifecycle : null;
  const animateInitialDeal =
    previousLifecycleRef.current === "lobby" && currentLifecycle === "playing";
  const justEnteredResults =
    previousLifecycleRef.current === "playing" && currentLifecycle === "results";

  useEffect(() => {
    const previousLifecycle = previousLifecycleRef.current;
    previousLifecycleRef.current = currentLifecycle;
    if (previousLifecycle === "playing" && currentLifecycle === "results") {
      setResultTransitionActive(true);
      const timer = window.setTimeout(
        () => setResultTransitionActive(false),
        DURAK_ROUND_TRANSITION_DELAY_MS,
      );
      return () => window.clearTimeout(timer);
    }
    if (currentLifecycle !== "results") setResultTransitionActive(false);
  }, [currentLifecycle]);

  if (!snapshot || snapshot.gameId !== "durak") {
    return (
      <div className="screen platform-room-loading" role="status">
        Загружаем карточный стол…
      </div>
    );
  }

  const durakSnapshot: RoomSnapshot<"durak"> = snapshot;

  if (durakSnapshot.lifecycle === "lobby") {
    return (
      <LobbyScreen
        extraInfo={
          <span>Таймер: {getTurnTimeoutLabel(durakSnapshot.settings.turnTimeoutSeconds)}</span>
        }
        settingsPanel={<DurakLobbySettings />}
      />
    );
  }

  if (durakSnapshot.lifecycle === "results" || durakSnapshot.game?.phase === "GAME_OVER") {
    if (justEnteredResults || resultTransitionActive) {
      return <DurakGameScreen snapshot={durakSnapshot} />;
    }
    return <DurakResultsScreen snapshot={durakSnapshot} />;
  }

  return <DurakGameScreen snapshot={durakSnapshot} animateInitialDeal={animateInitialDeal} />;
}
