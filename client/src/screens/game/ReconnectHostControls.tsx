import { useEffect, useState } from "react";
import type { PlayerInfo, SeatClaimInfo } from "../../../../shared/types";

interface ReconnectHostControlsProps {
  players: PlayerInfo[];
  claims: SeatClaimInfo[];
  onResolveClaim: (requestId: string, approved: boolean) => void;
  onKickPlayer: (playerId: string) => void;
  onTransferHost: (playerId: string) => void;
  compact?: boolean;
}

interface ReconnectHostBannerProps {
  players: PlayerInfo[];
  claimsCount: number;
  onOpen: () => void;
}

export function ReconnectHostBanner({ players, claimsCount, onOpen }: ReconnectHostBannerProps) {
  const missingPlayers = players.filter(
    (player) => !player.isBot && !player.kicked && !player.connected,
  );
  if (missingPlayers.length === 0 && claimsCount === 0) return null;

  return (
    <button type="button" className="reconnect-host-banner" onClick={onOpen}>
      <span>
        <strong>Комната ждёт восстановления</strong>
        {missingPlayers.length > 0 && (
          <span>Нет связи: {missingPlayers.map((player) => player.name).join(", ")}</span>
        )}
        {claimsCount > 0 && <span>Заявок на место: {claimsCount}</span>}
      </span>
      <span className="reconnect-host-banner-action">Открыть управление</span>
    </button>
  );
}

export function ReconnectHostControls({
  players,
  claims,
  onResolveClaim,
  onKickPlayer,
  onTransferHost,
  compact = false,
}: ReconnectHostControlsProps) {
  const [kickConfirmationId, setKickConfirmationId] = useState<string | null>(null);
  const removablePlayers = players.filter(
    (player) => !player.isBot && !player.isHost && !player.kicked,
  );
  const hostCandidates = removablePlayers.filter((player) => player.connected);

  useEffect(() => {
    if (
      kickConfirmationId &&
      !removablePlayers.some((player) => player.id === kickConfirmationId)
    ) {
      setKickConfirmationId(null);
    }
  }, [kickConfirmationId, removablePlayers]);

  return (
    <section
      className={`reconnect-host-controls ${compact ? "is-compact" : ""}`}
      aria-labelledby="reconnect-host-title"
    >
      <div className="reconnect-host-heading">
        <div>
          <span className="reconnect-eyebrow">Восстановление комнаты</span>
          <h3 id="reconnect-host-title">Игроки и доступ</h3>
        </div>
        {claims.length > 0 && <span className="reconnect-claim-count">{claims.length}</span>}
      </div>

      <div className="reconnect-host-section">
        <h4>Заявки на место</h4>
        {claims.length === 0 ? (
          <p className="reconnect-empty">Новых заявок нет</p>
        ) : (
          <div className="reconnect-host-list">
            {claims.map((claim) => (
              <article className="reconnect-host-row" key={claim.requestId}>
                <div>
                  <strong>{claim.claimantName}</strong>
                  <span>Претендует на место «{claim.playerName}»</span>
                </div>
                <div className="reconnect-host-actions">
                  <button
                    type="button"
                    className="reconnect-host-action is-approve"
                    aria-label={`Одобрить заявку ${claim.claimantName}`}
                    onClick={() => onResolveClaim(claim.requestId, true)}
                  >
                    Одобрить
                  </button>
                  <button
                    type="button"
                    className="reconnect-host-action is-reject"
                    aria-label={`Отклонить заявку ${claim.claimantName}`}
                    onClick={() => onResolveClaim(claim.requestId, false)}
                  >
                    Отклонить
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <div className="reconnect-host-section">
        <h4>Участники</h4>
        <div className="reconnect-host-list">
          {removablePlayers.map((player) => (
            <article className="reconnect-host-row" key={player.id}>
              <div>
                <strong>{player.name}</strong>
                <span>{player.connected ? "В комнате" : "Отключён — место зарезервировано"}</span>
              </div>
              <div className="reconnect-host-actions">
                <button
                  type="button"
                  className="reconnect-host-action is-kick"
                  aria-label={
                    kickConfirmationId === player.id
                      ? `Подтвердить удаление ${player.name}`
                      : `Удалить игрока ${player.name}`
                  }
                  onClick={() => {
                    if (kickConfirmationId !== player.id) {
                      setKickConfirmationId(player.id);
                      return;
                    }
                    onKickPlayer(player.id);
                    setKickConfirmationId(null);
                  }}
                >
                  {kickConfirmationId === player.id ? "Подтвердить удаление" : "Удалить навсегда"}
                </button>
                {kickConfirmationId === player.id && (
                  <button
                    type="button"
                    className="reconnect-host-action is-reject"
                    aria-label={`Отменить удаление ${player.name}`}
                    onClick={() => setKickConfirmationId(null)}
                  >
                    Отмена
                  </button>
                )}
                {hostCandidates.some((candidate) => candidate.id === player.id) && (
                  <button
                    type="button"
                    className="reconnect-host-action is-transfer"
                    aria-label={`Передать права игроку ${player.name}`}
                    onClick={() => onTransferHost(player.id)}
                  >
                    Передать права хоста
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
