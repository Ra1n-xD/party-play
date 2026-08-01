import { useState } from "react";
import { createPortal } from "react-dom";
import { FiBookOpen } from "react-icons/fi";
import { GameRulesModal } from "../../platform/components/GameRulesModal";
import { RoomReactions } from "../../platform/components/RoomReactions";
import { clientGameRegistry, type RegisteredClientGameId } from "../../platform/gameRegistry";

interface GameDockToolsProps {
  gameId: RegisteredClientGameId;
  gameTitle?: string;
}

export function GameDockTools({ gameId, gameTitle = "Бункер" }: GameDockToolsProps) {
  const [rulesOpen, setRulesOpen] = useState(false);
  const gameModule = clientGameRegistry[gameId];

  return (
    <>
      <div className="game-dock-tools" aria-label="Правила и эмоции">
        <button
          type="button"
          className="gs-room-tool game-dock-tool"
          onClick={() => setRulesOpen(true)}
          aria-haspopup="dialog"
          aria-label={`Правила игры ${gameTitle}`}
        >
          <FiBookOpen aria-hidden="true" />
          <span>Правила</span>
        </button>
        <RoomReactions />
      </div>

      {rulesOpen &&
        createPortal(
          <GameRulesModal
            gameId={gameId}
            gameTitle={gameTitle}
            rules={gameModule.rules}
            onClose={() => setRulesOpen(false)}
          />,
          document.body,
        )}
    </>
  );
}
