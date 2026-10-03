import { useState, type ReactNode } from "react";
import { FiLogOut, FiWifi, FiWifiOff } from "react-icons/fi";
import { GiFalloutShelter } from "react-icons/gi";
import { AccessibleModal } from "./AccessibleModal";
import { BrandDice } from "../../platform/components/BrandDice";
import "../../games/shared/game-2d.css";

interface GameRoomHeaderProps {
  roomCode: string | null;
  connected: boolean;
  onLeaveRoom: () => void;
  confirmActiveLeave?: boolean;
  gameTitle?: string;
  brandIcon?: ReactNode;
  children?: ReactNode;
  playerCount?: number;
  tools?: ReactNode;
}

export function GameRoomHeader({
  roomCode,
  connected,
  onLeaveRoom,
  confirmActiveLeave = false,
  gameTitle = "Бункер",
  brandIcon,
  children,
  playerCount,
  tools,
}: GameRoomHeaderProps) {
  const [leaveConfirmationOpen, setLeaveConfirmationOpen] = useState(false);
  const playerCountLabel =
    playerCount == null
      ? null
      : `${playerCount} ${
          playerCount % 100 >= 11 && playerCount % 100 <= 14
            ? "игроков"
            : playerCount % 10 === 1
              ? "игрок"
              : playerCount % 10 >= 2 && playerCount % 10 <= 4
                ? "игрока"
                : "игроков"
        }`;

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
        {children && (
          <span className="game-2d-wordmark">
            <BrandDice />
            partyplay
          </span>
        )}
        <div className="gs-room-brand">
          <span className="gs-room-brand-icon" aria-hidden="true">
            {brandIcon ?? <GiFalloutShelter />}
          </span>
          <span className="gs-room-brand-copy">
            <strong>{gameTitle}</strong>
          </span>
        </div>

        {tools && <div className="b2-header-actions">{tools}</div>}
        <div className="gs-room-controls">
          {playerCountLabel && <span className="game-2d-player-count">{playerCountLabel}</span>}
          {children}
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
          panelClassName="active-leave-panel party-dialog"
        >
          <h2 id="active-leave-title">Покинуть активную игру?</h2>
          <p>
            Если в комнате останутся другие люди, место можно будет вернуть через переподключение.
            После выхода последнего человека комната закроется.
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
