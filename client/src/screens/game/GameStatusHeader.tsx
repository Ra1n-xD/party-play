import React from "react";
import { FiAlertTriangle, FiClock, FiRadio, FiShield } from "react-icons/fi";
import { Timer } from "../../components/Timer";
import type { ClientGameState } from "../../context/GameContext";
import { ScenarioDetails } from "./ScenarioSummary";

interface GameStatusHeaderProps {
  gameState: ClientGameState;
  phaseLabel: string;
  phaseDescription: string;
  isMyTurn: boolean;
}

export function GameStatusHeader({
  gameState,
  phaseLabel,
  phaseDescription,
  isMyTurn,
}: GameStatusHeaderProps) {
  const alivePlayers = gameState.players.filter((player) => player.alive);
  const timerLabel = gameState.phase === "ROUND_DISCUSSION" ? "До голосования" : "До конца этапа";

  return (
    <header
      className={`gs-info-strip gs-status-header${isMyTurn ? " is-my-turn" : ""}`}
      aria-label="Состояние игры"
    >
      <section className="gs-info-scenario">
        <span className="gs-codex-scenario-icon" aria-hidden="true">
          <FiAlertTriangle />
        </span>
        <span className="gs-codex-scenario-copy">
          <small>Сценарий катастрофы · раунд {gameState.roundNumber}</small>
          <strong>{gameState.catastrophe?.title ?? "Сценарий загружается"}</strong>
          <span>{gameState.catastrophe?.description ?? phaseDescription}</span>
        </span>
      </section>

      <div className="gs-info-metrics">
        <section className="gs-info-metric gs-info-timer">
          <span className="gs-info-label">
            <FiClock aria-hidden="true" /> {timerLabel}
          </span>
          {gameState.phaseEndTime ? (
            <Timer endTime={gameState.phaseEndTime} size="large" />
          ) : (
            <strong className="gs-info-timer-empty">—</strong>
          )}
          <small>{phaseDescription}</small>
        </section>

        <section className="gs-info-metric gs-info-capacity">
          <span className="gs-info-label">
            <FiShield aria-hidden="true" /> Мест
          </span>
          <strong className="gs-info-capacity-value">
            {gameState.bunkerCapacity}
            <span>/{alivePlayers.length}</span>
          </strong>
          <small>осталось в бункере</small>
        </section>

        <section className="gs-info-metric gs-info-round">
          <span className="gs-info-label">
            <FiRadio aria-hidden="true" /> Раунд
          </span>
          <strong>
            {gameState.roundNumber}
            <span>/{gameState.totalRounds}</span>
          </strong>
          <small>{phaseLabel}</small>
        </section>

        <section className="gs-info-progress">
          <span className="gs-info-progress-heading">
            <strong>Раскрытие характеристик</strong>
            <b>
              {String(gameState.roundNumber).padStart(2, "0")} /{" "}
              {String(gameState.totalRounds).padStart(2, "0")}
            </b>
          </span>
          <span
            className="gs-info-round-track"
            aria-label={`Раунд ${gameState.roundNumber} из ${gameState.totalRounds}`}
          >
            {Array.from({ length: gameState.totalRounds }, (_, index) => (
              <i
                key={index}
                className={`gs-info-round-segment${index < gameState.roundNumber ? " is-filled" : ""}`}
              />
            ))}
          </span>
        </section>
      </div>

      <section className="gs-desktop-situation-details" aria-label="Подробности ситуации">
        <ScenarioDetails idPrefix="gs-scenario-desktop" gameState={gameState} />
      </section>
    </header>
  );
}
