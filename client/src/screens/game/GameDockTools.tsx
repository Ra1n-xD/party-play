import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FiBookOpen } from "react-icons/fi";
import { GameRulesModal } from "../../platform/components/GameRulesModal";
import { RoomReactions } from "../../platform/components/RoomReactions";
import { clientGameRegistry, type RegisteredClientGameId } from "../../platform/gameRegistry";
import { useTableHotkeys } from "../../games/shared/table3d/useTableHotkeys";

interface GameDockToolsProps {
  gameId: RegisteredClientGameId;
  gameTitle?: string;
}

export function GameDockTools({ gameId, gameTitle = "Бункер" }: GameDockToolsProps) {
  const [rulesOpen, setRulesOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const gameModule = clientGameRegistry[gameId];
  useTableHotkeys(!rulesOpen, (code) => {
    if (code !== "KeyL" || !root.current?.closest(".is-3d")) return false;
    setRulesOpen(true);
    return true;
  });

  return (
    <>
      <div className="game-dock-tools" aria-label="Правила и эмоции" ref={root}>
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
