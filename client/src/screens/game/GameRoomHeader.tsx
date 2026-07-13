import { useState } from "react";
import { FiHome, FiLogOut, FiSettings, FiSkipForward, FiWifi, FiWifiOff } from "react-icons/fi";
import { AccessibleModal } from "./AccessibleModal";

interface GameRoomHeaderProps {
  roomCode: string | null;
  connected: boolean;
  canManageGame: boolean;
  canSkipDiscussion: boolean;
  onOpenHostControls: () => void;
  onSkipDiscussion: () => void;
  onLeaveRoom: () => void;
  confirmActiveLeave?: boolean;
}

export function GameRoomHeader({
  roomCode,
  connected,
  canManageGame,
  canSkipDiscussion,
  onOpenHostControls,
  onSkipDiscussion,
  onLeaveRoom,
  confirmActiveLeave = false,
}: GameRoomHeaderProps) {
  const [leaveConfirmationOpen, setLeaveConfirmationOpen] = useState(false);

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
            <FiHome />
          </span>
          <span className="gs-room-brand-copy">
            <strong>Бункер</strong>
          </span>
        </div>

        {canManageGame && (
          <div className="gs-room-host-actions" aria-label="Действия хоста">
            <button
              type="button"
              className="gs-room-host-action"
              onClick={onSkipDiscussion}
              disabled={!canSkipDiscussion}
              title={
                canSkipDiscussion
                  ? "Завершить обсуждение и перейти к голосованию"
                  : "Доступно во время обсуждения"
              }
            >
              <FiSkipForward aria-hidden="true" />
              <span>Пропустить обсуждение</span>
            </button>
            <button
              type="button"
              className="gs-room-host-action"
              onClick={onOpenHostControls}
              aria-label="Управление игрой"
            >
              <FiSettings aria-hidden="true" />
              <span>Админ-панель</span>
            </button>
          </div>
        )}

        <div className="gs-room-controls">
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
              Покинуть и сохранить место
            </button>
          </div>
        </AccessibleModal>
      )}
    </>
  );
}
