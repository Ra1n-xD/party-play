import { useEffect, useState } from "react";
import { usePlatform } from "../context/PlatformContext";
import { ReconnectPauseOverlay } from "./ReconnectPauseOverlay";
import { AccessibleModal } from "./AccessibleModal";

function DeploymentNotice() {
  const { deploymentNotice, dismissDeploymentNotice } = usePlatform();
  if (!deploymentNotice) return null;

  return (
    <AccessibleModal
      labelledBy="deployment-notice-title"
      onClose={dismissDeploymentNotice}
      panelClassName="deployment-notice"
    >
      <span className="deployment-notice-mark" aria-hidden="true">
        ↻
      </span>
      <h2 id="deployment-notice-title">Обновляем игру</h2>
      <p>{deploymentNotice}</p>
      <button type="button" className="btn btn-primary" onClick={dismissDeploymentNotice}>
        Понятно
      </button>
    </AccessibleModal>
  );
}

function AdminPauseOverlay() {
  const { snapshot } = usePlatform();
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => setDismissed(false), [snapshot?.pause.admin]);
  if (
    dismissed ||
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
    <AccessibleModal
      labelledBy="admin-pause-title"
      onClose={() => setDismissed(true)}
      overlayClassName="pause-overlay reconnect-pause-overlay"
      panelClassName="pause-content reconnect-pause-content"
    >
      <span className="pause-icon" aria-hidden="true">
        ⏸
      </span>
      <h2 id="admin-pause-title">Пауза</h2>
      <p>Хост приостановил игру</p>
      <button type="button" className="btn btn-secondary" onClick={() => setDismissed(true)}>
        Закрыть уведомление · Esc
      </button>
    </AccessibleModal>
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
      <DeploymentNotice />
    </>
  );
}
