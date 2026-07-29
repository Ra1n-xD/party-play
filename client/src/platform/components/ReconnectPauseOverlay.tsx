import type { AnyRoomSnapshot } from "../../../../shared/platform/room";
import { AccessibleModal } from "./AccessibleModal";

interface ReconnectPauseOverlayProps {
  snapshot: AnyRoomSnapshot;
}

function playerWord(count: number): string {
  if (count % 10 === 1 && count % 100 !== 11) return "игрок";
  if ([2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100)) return "игрока";
  return "игроков";
}

export function ReconnectPauseOverlay({ snapshot }: ReconnectPauseOverlayProps) {
  if (!snapshot.pause.active || snapshot.pause.disconnectedSeatIds.length === 0) return null;

  const viewerSeatId = snapshot.viewer.role === "player" ? snapshot.viewer.seatId : null;
  const viewerSeat = viewerSeatId
    ? snapshot.seats.find((seat) => seat.seatId === viewerSeatId)
    : undefined;
  if (viewerSeat?.isHost) return null;

  const disconnectedIds = new Set(snapshot.pause.disconnectedSeatIds);
  const missingPlayers = snapshot.seats.filter(
    (seat) => seat.occupantKind === "human" && !seat.closed && disconnectedIds.has(seat.seatId),
  );

  return (
    <AccessibleModal
      labelledBy="reconnect-pause-title"
      onClose={() => undefined}
      overlayClassName="pause-overlay reconnect-pause-overlay"
      panelClassName="pause-content reconnect-pause-content"
    >
      <span className="pause-icon" aria-hidden="true">
        ⏳
      </span>
      <h2 id="reconnect-pause-title">Пауза — ждём переподключение</h2>
      <p>
        Не хватает: {missingPlayers.length} {playerWord(missingPlayers.length)}
      </p>
      {missingPlayers.length > 0 && (
        <ul className="reconnect-missing-list">
          {missingPlayers.map((seat) => (
            <li key={seat.seatId}>
              {seat.name}
              {seat.temporaryBot ? " · временно играет бот" : ""}
            </li>
          ))}
        </ul>
      )}
      <span className="reconnect-pause-hint">
        Хост может временно передать место боту, восстановить или исключить игрока.
      </span>
    </AccessibleModal>
  );
}
