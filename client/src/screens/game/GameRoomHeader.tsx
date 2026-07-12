import { FiLogOut, FiWifi, FiWifiOff } from "react-icons/fi";
import { GiFalloutShelter } from "react-icons/gi";

interface GameRoomHeaderProps {
  roomCode: string | null;
  connected: boolean;
  onLeaveRoom: () => void;
}

export function GameRoomHeader({ roomCode, connected, onLeaveRoom }: GameRoomHeaderProps) {
  return (
    <header className="gs-room-header" aria-label="Комната игры">
      <div className="gs-room-brand">
        <span className="gs-room-brand-icon" aria-hidden="true">
          <GiFalloutShelter />
        </span>
        <span className="gs-room-brand-copy">
          <strong>Бункер</strong>
        </span>
      </div>

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
          onClick={onLeaveRoom}
          aria-label="Выйти из комнаты"
        >
          <FiLogOut aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
