import { useEffect, useRef } from "react";
import type { RoomLifecycle, RoomSnapshot } from "../../../../shared/platform/room";
import { usePlatform } from "../../platform/context/PlatformContext";
import { LobbyScreen } from "../../platform/screens/LobbyScreen";
import "../../styles/game-screen.css";
import { UnoGameScreen } from "./UnoGameScreen";
import { UnoLobbySettings, getUnoTurnTimeoutLabel } from "./UnoLobbySettings";
import { UnoResultsScreen } from "./UnoResultsScreen";
import "./uno.css";
import "../shared/table3d/table3d.css";
import "./uno-3d.css";
import "../shared/card-game-arena.css";
import { useTableExitTransition } from "../shared/table3d/useTableExitTransition";

export default function UnoModule() {
  const { snapshot } = usePlatform();
  const previousLifecycleRef = useRef<RoomLifecycle | null>(null);
  const currentLifecycle = snapshot?.gameId === "uno" ? snapshot.lifecycle : null;
  const holdAvatarExit = useTableExitTransition(
    snapshot?.gameId === "uno" ? snapshot.roomCode : undefined,
    snapshot?.gameId === "uno" ? snapshot.lifecycle : undefined,
    snapshot?.gameId === "uno"
      ? (snapshot.game?.players
          .filter((player) => player.status === "excluded")
          .map((player) => player.seatId) ?? [])
      : [],
  );
  const animateInitialDeal =
    previousLifecycleRef.current === "lobby" && currentLifecycle === "playing";

  useEffect(() => {
    previousLifecycleRef.current = currentLifecycle;
  }, [currentLifecycle]);

  if (!snapshot || snapshot.gameId !== "uno") {
    return (
      <div className="screen platform-room-loading" role="status">
        Готовим цветовой стол…
      </div>
    );
  }

  const unoSnapshot: RoomSnapshot<"uno"> = snapshot;
  if (unoSnapshot.lifecycle === "lobby") {
    return (
      <LobbyScreen
        extraInfo={
          <span>Таймер: {getUnoTurnTimeoutLabel(unoSnapshot.settings.turnTimeoutSeconds)}</span>
        }
        settingsPanel={<UnoLobbySettings />}
      />
    );
  }

  if (
    !holdAvatarExit &&
    (unoSnapshot.lifecycle === "results" || unoSnapshot.game?.phase === "GAME_OVER")
  ) {
    return <UnoResultsScreen snapshot={unoSnapshot} />;
  }

  return <UnoGameScreen snapshot={unoSnapshot} animateInitialDeal={animateInitialDeal} />;
}
