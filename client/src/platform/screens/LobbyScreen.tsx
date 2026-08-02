import { useEffect, useState, type ReactNode } from "react";
import { AccessibleModal } from "../components/AccessibleModal";
import { ReconnectHostControls, type RecoverySeat } from "../components/ReconnectHostControls";
import { usePlatform } from "../context/PlatformContext";
import { getClientGameModule } from "../gameRegistry";

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
    <div className="screen lobby-screen">
      <div className="lobby-container">
        <div className="lobby-header">
          <span className="platform-lobby-game-name">{gameModule.metadata.title}</span>
          <h2>Комната ожидания</h2>
          <button type="button" className="room-code-display" onClick={copyCode}>
            <span className="room-code-label">Код:</span>
            <span className="room-code-value">{snapshot.roomCode}</span>
            <span className="copy-hint">
              {copied ? "Скопировано!" : "Нажмите, чтобы скопировать"}
            </span>
          </button>
        </div>

        <div className="lobby-info">
          <span>
            Игроков: {activeSeats.length}/{gameModule.metadata.maxPlayers}
          </span>
          {extraInfo}
          {botCount > 0 && <span>Ботов: {botCount}</span>}
          {snapshot.spectatorCount > 0 && <span>Зрителей: {snapshot.spectatorCount}</span>}
        </div>

        {settingsPanel}

        {isSpectator && <div className="spectator-badge">Вы наблюдаете</div>}

        <div className="player-list">
          {activeSeats.map((seat, index) => (
            <div
              key={seat.seatId}
              className={`player-item ${seat.seatId === playerId ? "is-me" : ""} ${seat.controllerKind === "bot" ? "is-bot" : ""} ${!seat.connected && seat.controllerKind !== "bot" ? "is-disconnected" : ""}`}
            >
              <span className="player-name">
                <span className="player-number">{index + 1}</span>
                {seat.isHost && <span className="host-badge">H</span>}
                {seat.occupantKind === "bot" && <span className="bot-badge">BOT</span>}
                {seat.temporaryBot && <span className="bot-badge">ВРЕМЕННО BOT</span>}
                {seat.name}
                {seat.seatId === playerId && <span className="me-badge">(вы)</span>}
                {!seat.connected && seat.controllerKind !== "bot" && (
                  <span className="player-presence-badge">Отключён</span>
                )}
              </span>
              <span className="player-item-right">
                <span className={`ready-status ${seat.ready || seat.isHost ? "ready" : ""}`}>
                  {seat.ready || seat.isHost ? "Готов" : "Не готов"}
                </span>
                {isHost && seat.occupantKind === "bot" && !seat.temporaryBot && (
                  <button
                    type="button"
                    className="btn-remove-bot"
                    onClick={() => removeBot(seat.seatId)}
                    disabled={!canMutateRoom}
                    aria-label={`Удалить бота ${seat.name}`}
                  >
                    ×
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>

        <div className="lobby-actions">
          {!isSpectator && isHost && canAddBot && (
            <button
              type="button"
              className="btn btn-bot"
              onClick={addBot}
              disabled={!canMutateRoom}
            >
              + Добавить бота
            </button>
          )}
          {!isSpectator && isHost && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setManagementOpen(true)}
            >
              Управление комнатой
              {hostSeatClaims.length > 0 && ` · ${hostSeatClaims.length}`}
            </button>
          )}
          {!isSpectator && !isHost && (
            <button
              type="button"
              className={`btn ${me?.ready ? "btn-secondary" : "btn-primary"}`}
              onClick={() => setReady(!me?.ready)}
              disabled={!canMutateRoom}
            >
              {me?.ready ? "Не готов" : "Готов!"}
            </button>
          )}
          {!isSpectator && isHost && (
            <button
              type="button"
              className="btn btn-primary"
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
          <button type="button" className="btn btn-text" onClick={leaveRoom}>
            {isSpectator ? "Перестать наблюдать" : "Покинуть комнату"}
          </button>
        </div>

        {error && <div className="error-toast">{error}</div>}
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
