import { useEffect, useState } from "react";
import { useGame } from "../context/GameContext";
import { AccessibleModal } from "./game/AccessibleModal";
import { ReconnectHostControls } from "./game/ReconnectHostControls";

export function LobbyScreen() {
  const {
    roomCode,
    playerId,
    isSpectator,
    gameState,
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
  } = useGame();
  const [copied, setCopied] = useState(false);
  const [managementOpen, setManagementOpen] = useState(false);

  const me = isSpectator ? undefined : gameState?.players.find((p) => p.id === playerId);
  const isHost = me?.isHost ?? false;

  useEffect(() => {
    if (!isHost) setManagementOpen(false);
  }, [isHost]);

  if (!gameState || !roomCode) return null;

  const activePlayers = gameState.players.filter((player) => !player.kicked);
  const allReady = activePlayers.every((p) => p.connected && (p.ready || p.isHost));
  const enoughPlayers = activePlayers.length >= 4;
  const bunkerCapacity = Math.floor(activePlayers.length / 2);
  const botCount = gameState.players.filter((p) => p.isBot).length;
  const canAddBot = gameState.players.length < 16;

  const copyCode = () => {
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="screen lobby-screen">
      <div className="lobby-container">
        <div className="lobby-header">
          <h2>Комната ожидания</h2>
          <div className="room-code-display" onClick={copyCode}>
            <span className="room-code-label">Код:</span>
            <span className="room-code-value">{roomCode}</span>
            <span className="copy-hint">
              {copied ? "Скопировано!" : "Нажмите чтобы скопировать"}
            </span>
          </div>
        </div>

        <div className="lobby-info">
          <span>Игроков: {activePlayers.length}/16</span>
          <span>В бункер попадут: {bunkerCapacity}</span>
          {botCount > 0 && <span>Ботов: {botCount}</span>}
          {gameState.spectatorCount > 0 && <span>Зрителей: {gameState.spectatorCount}</span>}
        </div>

        {isSpectator && <div className="spectator-badge">Вы наблюдаете</div>}

        <div className="player-list">
          {gameState.players.map((player, idx) => (
            <div
              key={player.id}
              className={`player-item ${player.id === playerId ? "is-me" : ""} ${player.isBot ? "is-bot" : ""} ${!player.connected ? "is-disconnected" : ""} ${player.kicked ? "is-kicked" : ""}`}
            >
              <span className="player-name">
                <span className="player-number">{idx + 1}</span>
                {player.isHost && <span className="host-badge">H</span>}
                {player.isBot && <span className="bot-badge">BOT</span>}
                {player.name}
                {player.id === playerId && <span className="me-badge">(вы)</span>}
                {player.kicked && <span className="player-presence-badge is-kicked">Удалён</span>}
                {!player.kicked && !player.connected && !player.isBot && (
                  <span className="player-presence-badge">Отключён</span>
                )}
              </span>
              <span className="player-item-right">
                <span className={`ready-status ${player.ready || player.isHost ? "ready" : ""}`}>
                  {player.ready || player.isHost ? "Готов" : "Не готов"}
                </span>
                {isHost && player.isBot && (
                  <button className="btn-remove-bot" onClick={() => removeBot(player.id)}>
                    x
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>

        <div className="lobby-actions">
          {!isSpectator && isHost && canAddBot && (
            <button className="btn btn-bot" onClick={addBot}>
              + Добавить бота
            </button>
          )}
          {!isSpectator && isHost && (
            <button className="btn btn-secondary" onClick={() => setManagementOpen(true)}>
              Управление комнатой
              {hostSeatClaims.length > 0 && ` · ${hostSeatClaims.length}`}
            </button>
          )}
          {!isSpectator && !isHost && (
            <button
              className={`btn ${me?.ready ? "btn-secondary" : "btn-primary"}`}
              onClick={() => setReady(!me?.ready)}
            >
              {me?.ready ? "Не готов" : "Готов!"}
            </button>
          )}
          {!isSpectator && isHost && (
            <button
              className="btn btn-primary"
              onClick={startGame}
              disabled={!enoughPlayers || !allReady}
            >
              {!enoughPlayers
                ? `Нужно минимум 4 игрока`
                : !allReady
                  ? "Ждём готовности всех"
                  : "Начать игру!"}
            </button>
          )}
          <button className="btn btn-text" onClick={leaveRoom}>
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
          <ReconnectHostControls
            compact
            players={gameState.players}
            claims={hostSeatClaims}
            onResolveClaim={resolveSeatClaim}
            onKickPlayer={kickPlayer}
            onTransferHost={transferHost}
          />
        </AccessibleModal>
      )}
    </div>
  );
}
