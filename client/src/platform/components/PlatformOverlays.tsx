import { usePlatform } from "../context/PlatformContext";
import { ReconnectPauseOverlay } from "./ReconnectPauseOverlay";

function AdminPauseOverlay() {
  const { snapshot } = usePlatform();
  if (
    !snapshot?.pause.active ||
    !snapshot.pause.admin ||
    snapshot.pause.disconnectedSeatIds.length > 0
  ) {
    return null;
  }

  const viewerSeatId = snapshot.viewer.role === "player" ? snapshot.viewer.seatId : null;
  const viewerSeat = viewerSeatId
    ? snapshot.seats.find((seat) => seat.seatId === viewerSeatId)
    : undefined;
  if (viewerSeat?.isHost) return null;

  return (
    <div className="pause-overlay">
      <div className="pause-content">
        <span className="pause-icon" aria-hidden="true">
          ⏸
        </span>
        <h2>Пауза</h2>
        <p>Хост приостановил игру</p>
      </div>
    </div>
  );
}

function HostChangeNotice() {
  const { hostChangeNotice, snapshot, clearHostChangeNotice } = usePlatform();
  const viewerSeatId = snapshot?.viewer.role === "player" ? snapshot.viewer.seatId : null;
  if (!hostChangeNotice || hostChangeNotice.hostId !== viewerSeatId) return null;

  return (
    <div className="host-change-notice" role="status">
      <div>
        <strong>Вам переданы права хоста</strong>
        <span>Теперь вы управляете восстановлением комнаты.</span>
      </div>
      <button type="button" onClick={clearHostChangeNotice} aria-label="Закрыть уведомление">
        ×
      </button>
    </div>
  );
}

export function PlatformOverlays() {
  const { snapshot } = usePlatform();

  return (
    <>
      {snapshot && <ReconnectPauseOverlay snapshot={snapshot} />}
      <AdminPauseOverlay />
      <HostChangeNotice />
    </>
  );
}
