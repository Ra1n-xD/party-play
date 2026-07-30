import { useState, type ReactNode } from "react";
import { FiBookOpen, FiLogOut, FiWifi, FiWifiOff } from "react-icons/fi";
import { GiFalloutShelter } from "react-icons/gi";
import { GameRulesModal } from "../../platform/components/GameRulesModal";
import { RoomReactions } from "../../platform/components/RoomReactions";
import { clientGameRegistry, type RegisteredClientGameId } from "../../platform/gameRegistry";
import { AccessibleModal } from "./AccessibleModal";

interface GameRoomHeaderProps {
  gameId: RegisteredClientGameId;
  roomCode: string | null;
  connected: boolean;
  onLeaveRoom: () => void;
  confirmActiveLeave?: boolean;
  gameTitle?: string;
  brandIcon?: ReactNode;
}

export function GameRoomHeader({
  gameId,
  roomCode,
  connected,
  onLeaveRoom,
  confirmActiveLeave = false,
  gameTitle = "Бункер",
  brandIcon,
}: GameRoomHeaderProps) {
  const [leaveConfirmationOpen, setLeaveConfirmationOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const gameModule = clientGameRegistry[gameId];

  const requestLeave = () => {
    if (confirmActiveLeave) {
      setLeaveConfirmationOpen(true);
      return;
    }
    onLeaveRoom();
  };

  return (
    <>
      <header className="gs-room-header" aria-label="Комната игры">
        <div className="gs-room-brand">
          <span className="gs-room-brand-icon" aria-hidden="true">
            {brandIcon ?? <GiFalloutShelter />}
          </span>
          <span className="gs-room-brand-copy">
            <strong>{gameTitle}</strong>
          </span>
        </div>

        <div className="gs-room-controls">
          <button
            type="button"
            className="gs-room-tool"
            onClick={() => setRulesOpen(true)}
            aria-haspopup="dialog"
            aria-label={`Правила игры ${gameTitle}`}
          >
            <FiBookOpen aria-hidden="true" />
            <span>Правила</span>
          </button>
          <RoomReactions />
          <div className="gs-room-code" aria-label={`Код комнаты ${roomCode || "неизвестен"}`}>
            <span>Комната</span>
            <strong>{roomCode || "—"}</strong>
          </div>
          <div
            className={`gs-room-connection ${connected ? "is-connected" : "is-disconnected"}`}
            role="status"
          >
            {connected ? <FiWifi aria-hidden="true" /> : <FiWifiOff aria-hidden="true" />}
            <span>{connected ? "Связь установлена" : "Нет соединения"}</span>
          </div>
          <button
            type="button"
            className="gs-room-action"
            onClick={requestLeave}
            aria-label="Выйти из комнаты"
          >
            <FiLogOut aria-hidden="true" />
          </button>
        </div>
      </header>

      {rulesOpen && (
        <GameRulesModal
          gameId={gameId}
          gameTitle={gameTitle}
          rules={gameModule.rules}
          onClose={() => setRulesOpen(false)}
        />
      )}

      {leaveConfirmationOpen && (
        <AccessibleModal
          labelledBy="active-leave-title"
          onClose={() => setLeaveConfirmationOpen(false)}
          overlayClassName="active-leave-modal"
          panelClassName="active-leave-panel"
        >
          <h2 id="active-leave-title">Покинуть активную игру?</h2>
          <p>
            Ваше место останется за вами. Игра будет ждать переподключения, пока хост не удалит
            место навсегда.
          </p>
          <div className="modal-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setLeaveConfirmationOpen(false)}
            >
              Остаться
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => {
                setLeaveConfirmationOpen(false);
                onLeaveRoom();
              }}
            >
              Покинуть игру
            </button>
          </div>
        </AccessibleModal>
      )}
    </>
  );
}
