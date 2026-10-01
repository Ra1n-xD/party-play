import { useEffect, useState, type ReactNode } from "react";
import { FiArrowLeft, FiCheck, FiCopy, FiUsers } from "react-icons/fi";
import "../../styles/show-menu.css";
import { AccessibleModal } from "../components/AccessibleModal";
import { ReconnectHostControls, type RecoverySeat } from "../components/ReconnectHostControls";
import { usePlatform } from "../context/PlatformContext";
import { getClientGameModule } from "../gameRegistry";
import { AvatarPicker } from "../components/AvatarPicker";
import { AvatarPortrait } from "../components/AvatarPortrait";
import { getAvatar } from "../../../../shared/platform/avatars";

interface LobbyScreenProps {
  extraInfo?: ReactNode;
  settingsPanel?: ReactNode;
}

export function LobbyScreen({ extraInfo, settingsPanel }: LobbyScreenProps) {
  const {
    snapshot,
    connected,
    reconnectState,
    commandPending,
    playerId,
    isSpectator,
    setReady,
    setAvatar,
    startGame,
    leaveRoom,
    addBot,
    removeBot,
    hostSeatClaims,
    resolveSeatClaim,
    kickPlayer,
    transferHost,
    error,
  } = usePlatform();
  const [copied, setCopied] = useState(false);
  const [managementOpen, setManagementOpen] = useState(false);

  const activeSeats = snapshot?.seats.filter((seat) => !seat.closed) ?? [];
  const viewerSeatId = snapshot?.viewer.role === "player" ? snapshot.viewer.seatId : null;
  const me =
    !isSpectator && viewerSeatId
      ? activeSeats.find((seat) => seat.seatId === viewerSeatId)
      : undefined;
  const isHost = me?.isHost ?? false;
  const canMutateRoom = connected && reconnectState === "connected" && !commandPending;

  useEffect(() => {
    if (!isHost) setManagementOpen(false);
  }, [isHost]);

  if (!snapshot) {
    return (
      <div className="screen lobby-screen">
        <div className="lobby-container platform-room-loading" role="status">
          Подключаемся к комнате…
        </div>
      </div>
    );
  }

  const gameModule = getClientGameModule(snapshot.gameId);
  if (!gameModule) return null;

  const allReady = activeSeats.every(
    (seat) => (seat.controllerKind === "bot" || seat.connected) && (seat.ready || seat.isHost),
  );
  const enoughPlayers = activeSeats.length >= gameModule.metadata.minPlayers;
  const botCount = activeSeats.filter((seat) => seat.occupantKind === "bot").length;
  const canAddBot = activeSeats.length < gameModule.metadata.maxPlayers;
  const recoverySeats: RecoverySeat[] = activeSeats.map((seat) => ({
    id: seat.seatId,
    name: seat.name,
    isBot: seat.occupantKind === "bot",
    isHost: seat.isHost,
    kicked: seat.closed,
    connected: seat.connected,
    controllerKind: seat.controllerKind,
    temporaryBot: seat.temporaryBot,
  }));

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(snapshot.roomCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="show-menu is-game-menu show-lobby" data-game={snapshot.gameId}>
      <div className="show-menu-shell">
        <header className="show-menu-header">
          <button type="button" className="show-quiet show-back" onClick={leaveRoom}>
            <FiArrowLeft aria-hidden="true" />
            Ко всем играм
          </button>
          <span className="show-lobby-brand">PARTYPLAY</span>
          {!connected && (
            <span className="show-server-status" role="status">
              Восстанавливаем связь
            </span>
          )}
        </header>

        <div className="show-lobby-heading">
          <p className="show-kicker">{gameModule.metadata.title} · Собираем компанию</p>
          <h1>Комната ожидания</h1>
        </div>

        <div className="show-lobby-layout">
          <section className="show-lobby-guests" aria-labelledby="lobby-guests-title">
            <div className="show-lobby-guests-heading">
              <h2 id="lobby-guests-title">Ваша компания</h2>
              <span>
                <FiUsers aria-hidden="true" /> {activeSeats.length}/{gameModule.metadata.maxPlayers}
              </span>
            </div>
            <div className="show-lobby-meta">
              {extraInfo}
              {botCount > 0 && <span>Ботов: {botCount}</span>}
              {snapshot.spectatorCount > 0 && <span>Зрителей: {snapshot.spectatorCount}</span>}
              {isSpectator && <span className="show-lobby-spectator">Вы наблюдаете</span>}
            </div>

            <ul className="show-lobby-players">
              {activeSeats.map((seat) => (
                <li
                  key={seat.seatId}
                  className={`show-lobby-player ${seat.seatId === playerId ? "is-me" : ""} ${seat.controllerKind === "bot" ? "is-bot" : ""} ${!seat.connected && seat.controllerKind !== "bot" ? "is-disconnected" : ""}`}
                >
                  <span className="show-lobby-avatar" aria-hidden="true">
                    <AvatarPortrait avatarId={getAvatar(seat.avatarId).id} />
                  </span>
                  <div className="show-lobby-player-copy">
                    <strong>{seat.name}</strong>
                    <span className="show-lobby-character">{getAvatar(seat.avatarId).name}</span>
                    <span className="show-lobby-badges">
                      {seat.isHost && <span>Хост</span>}
                      {seat.occupantKind === "bot" && <span>Бот</span>}
                      {seat.temporaryBot && <span>Временный бот</span>}
                      {seat.seatId === playerId && <span>Это вы</span>}
                      {!seat.connected && seat.controllerKind !== "bot" && <span>Нет связи</span>}
                    </span>
                    <span
                      className={`show-lobby-ready ${seat.ready || seat.isHost ? "is-ready" : ""}`}
                    >
                      {seat.ready || seat.isHost ? (
                        <>
                          <FiCheck aria-hidden="true" /> Готов
                        </>
                      ) : (
                        "Ждём готовности"
                      )}
                    </span>
                  </div>
                  {isHost && seat.occupantKind === "bot" && !seat.temporaryBot && (
                    <button
                      type="button"
                      className="show-lobby-remove"
                      onClick={() => removeBot(seat.seatId)}
                      disabled={!canMutateRoom}
                      aria-label={`Удалить бота ${seat.name}`}
                    >
                      ×
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {canAddBot && (
              <p className="show-lobby-invite-hint">
                Места ещё есть. Позовите друзей или добавьте ботов.
              </p>
            )}
            {settingsPanel && <div className="show-lobby-settings">{settingsPanel}</div>}
            {me && (
              <AvatarPicker
                avatarId={getAvatar(me.avatarId).id}
                disabled={!canMutateRoom || snapshot.lifecycle !== "lobby"}
                onSelect={setAvatar}
              />
            )}
          </section>

          <aside className="show-entry-panel show-lobby-setup" aria-label="Подготовка игры">
            <h2>Код вашей комнаты</h2>
            <button type="button" className="show-lobby-code" onClick={copyCode}>
              <strong>{snapshot.roomCode}</strong>
              <span aria-live="polite">
                <FiCopy aria-hidden="true" /> {copied ? "Скопировано!" : "Скопировать код"}
              </span>
            </button>
            <div className="show-lobby-actions">
              {!isSpectator && isHost && canAddBot && (
                <button
                  type="button"
                  className="show-lobby-secondary"
                  onClick={addBot}
                  disabled={!canMutateRoom}
                >
                  + Добавить бота
                </button>
              )}
              {!isSpectator && isHost && (
                <button
                  type="button"
                  className="show-lobby-secondary"
                  onClick={() => setManagementOpen(true)}
                >
                  Управление комнатой
                  {hostSeatClaims.length > 0 && ` · ${hostSeatClaims.length}`}
                </button>
              )}
              {!isSpectator && !isHost && (
                <button
                  type="button"
                  className={me?.ready ? "show-lobby-secondary" : "show-primary"}
                  onClick={() => setReady(!me?.ready)}
                  disabled={!canMutateRoom}
                >
                  {me?.ready ? "Не готов" : "Готов!"}
                </button>
              )}
              {!isSpectator && isHost && (
                <button
                  type="button"
                  className="show-primary"
                  onClick={startGame}
                  disabled={!canMutateRoom || !enoughPlayers || !allReady}
                >
                  {!enoughPlayers
                    ? `Нужно минимум ${gameModule.metadata.minPlayers} игрока`
                    : !allReady
                      ? "Ждём готовности всех"
                      : "Начать игру!"}
                </button>
              )}
              <button type="button" className="show-quiet" onClick={leaveRoom}>
                {isSpectator ? "Перестать наблюдать" : "Покинуть комнату"}
              </button>
            </div>
            {error && (
              <p className="show-entry-error" role="alert">
                {error}
              </p>
            )}
          </aside>
        </div>
        <footer className="show-menu-footer">
          <span>{gameModule.metadata.playerSummary}</span>
          <span>
            {enoughPlayers && allReady
              ? "Все готовы. Можно начинать!"
              : "Каждый играет со своего устройства."}
          </span>
        </footer>
      </div>

      {isHost && managementOpen && (
        <AccessibleModal
          labelledBy="lobby-management-title"
          onClose={() => setManagementOpen(false)}
          overlayClassName="lobby-management-modal"
          panelClassName="lobby-management-panel"
        >
          <div className="lobby-management-header">
            <h2 id="lobby-management-title">Управление комнатой</h2>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setManagementOpen(false)}
            >
              Закрыть
            </button>
          </div>
          {error && (
            <div className="error-toast" role="alert">
              {error}
            </div>
          )}
          <ReconnectHostControls
            compact
            players={recoverySeats}
            claims={hostSeatClaims}
            onResolveClaim={resolveSeatClaim}
            onKickPlayer={kickPlayer}
            onTransferHost={transferHost}
            disabled={!canMutateRoom}
          />
        </AccessibleModal>
      )}
    </div>
  );
}
