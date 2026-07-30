import type { RoomSnapshot } from "../../../../shared/platform/room";
import { usePlatform } from "../../platform/context/PlatformContext";
import { LobbyScreen } from "../../platform/screens/LobbyScreen";
import "../../styles/game-screen.css";
import { UnoGameScreen } from "./UnoGameScreen";
import { UnoLobbySettings, getUnoTurnTimeoutLabel } from "./UnoLobbySettings";
import { UnoResultsScreen } from "./UnoResultsScreen";
import "./uno.css";

export default function UnoModule() {
  const { snapshot } = usePlatform();

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

  if (unoSnapshot.lifecycle === "results" || unoSnapshot.game?.phase === "GAME_OVER") {
    return <UnoResultsScreen snapshot={unoSnapshot} />;
  }

  return <UnoGameScreen snapshot={unoSnapshot} />;
}
