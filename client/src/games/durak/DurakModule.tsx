import type { RoomSnapshot } from "../../../../shared/platform/room";
import { usePlatform } from "../../platform/context/PlatformContext";
import { LobbyScreen } from "../../platform/screens/LobbyScreen";
import "../../styles/game-screen.css";
import { DurakGameScreen } from "./DurakGameScreen";
import { DurakLobbySettings, getTurnTimeoutLabel } from "./DurakLobbySettings";
import { DurakResultsScreen } from "./DurakResultsScreen";
import "./durak.css";

export default function DurakModule() {
  const { snapshot } = usePlatform();

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
    return <DurakResultsScreen snapshot={durakSnapshot} />;
  }

  return <DurakGameScreen snapshot={durakSnapshot} />;
}
