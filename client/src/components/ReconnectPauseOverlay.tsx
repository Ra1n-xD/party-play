import type { PublicGameState } from "../../../shared/types";
import { AccessibleModal } from "../screens/game/AccessibleModal";

interface ReconnectPauseOverlayProps {
  gameState: PublicGameState;
  playerId: string | null;
  isSpectator: boolean;
}

function playerWord(count: number): string {
  if (count % 10 === 1 && count % 100 !== 11) return "игрок";
  if ([2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100)) return "игрока";
  return "игроков";
}

export function ReconnectPauseOverlay({
  gameState,
  playerId,
  isSpectator,
}: ReconnectPauseOverlayProps) {
  if (!gameState.paused || !["reconnect", "mixed"].includes(gameState.pauseKind)) return null;

  const me = isSpectator ? undefined : gameState.players.find((player) => player.id === playerId);
  if (me?.isHost) return null;

  const disconnectedIds = new Set(gameState.disconnectedPlayerIds);
  const missingPlayers = gameState.players.filter(
    (player) => !player.isBot && !player.kicked && disconnectedIds.has(player.id),
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
          {missingPlayers.map((player) => (
            <li key={player.id}>{player.name}</li>
          ))}
        </ul>
      )}
      <span className="reconnect-pause-hint">
        Хост может восстановить место или удалить игрока.
      </span>
    </AccessibleModal>
  );
}
