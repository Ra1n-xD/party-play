import React from "react";
import { Timer } from "../../components/Timer";
import type { ClientGameState } from "../../context/GameContext";

interface GameStatusHeaderProps {
  gameState: ClientGameState;
  phaseLabel: string;
  phaseDescription: string;
  votingInfo: string;
  isMyTurn: boolean;
  connected: boolean;
  canSkipDiscussion: boolean;
  canManageGame: boolean;
  onSkipDiscussion: () => void;
  onOpenHostControls: () => void;
}

export function GameStatusHeader({
  gameState,
  phaseLabel,
  phaseDescription,
  votingInfo,
  isMyTurn,
  connected,
  canSkipDiscussion,
  canManageGame,
  onSkipDiscussion,
  onOpenHostControls,
}: GameStatusHeaderProps) {
  return (
    <header
      className={`gs-status-header${isMyTurn ? " is-my-turn" : ""}`}
      aria-label="Состояние игры"
    >
      <div className="gs-status-copy">
        <span className="gs-eyebrow">
          Раунд {gameState.roundNumber} из {gameState.totalRounds}
        </span>
        <h1>{phaseLabel}</h1>
        <p>{phaseDescription}</p>
      </div>
      <div
        className="gs-round-progress"
        aria-label={`Раунд ${gameState.roundNumber} из ${gameState.totalRounds}`}
      >
        {Array.from({ length: gameState.totalRounds }, (_, index) => (
          <span
            key={index}
            className={`gs-round-step ${index + 1 < gameState.roundNumber ? "is-complete" : ""} ${index + 1 === gameState.roundNumber ? "is-current" : ""}`}
            aria-hidden="true"
          >
            {index + 1}
          </span>
        ))}
      </div>
      <div className="gs-status-actions">
        {!connected && <span className="gs-connection-status">Нет соединения</span>}
        {votingInfo && <span className="gs-voting-status">{votingInfo}</span>}
        <Timer endTime={gameState.phaseEndTime} size="large" />
        {canSkipDiscussion && (
          <button className="btn btn-secondary" onClick={onSkipDiscussion}>
            Пропустить обсуждение
          </button>
        )}
        {canManageGame && (
          <button className="btn btn-secondary" onClick={onOpenHostControls}>
            Управление
          </button>
        )}
      </div>
    </header>
  );
}
