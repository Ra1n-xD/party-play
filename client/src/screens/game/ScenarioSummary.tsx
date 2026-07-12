import React, { type ReactNode } from "react";
import { FiAlertTriangle, FiHome } from "react-icons/fi";
import type { ClientGameState } from "../../context/GameContext";

interface ScenarioSummaryProps {
  idPrefix: string;
  gameState: ClientGameState;
  expanded: boolean;
  onToggle: () => void;
  alwaysExpanded?: boolean;
}

interface ScenarioDetailsProps {
  idPrefix: string;
  gameState: ClientGameState;
}

export function ScenarioDetails({ idPrefix, gameState }: ScenarioDetailsProps) {
  const revealedCount = gameState.revealedBunkerCards.length;

  return (
    <div id={`${idPrefix}-details`} className="gs-scenario-details">
      <div className="gs-bunker-details">
        <h3 className="gs-bunker-heading">
          <FiHome className="gs-bunker-heading-icon" aria-hidden="true" />
          Бункер
        </h3>
        <div className="gs-bunker-cards">
          {gameState.revealedBunkerCards.map((card, index) => {
            const isNew = gameState.phase === "BUNKER_EXPLORE" && index === revealedCount - 1;

            return (
              <div
                key={`${card.title}-${index}`}
                className={`gs-bunker-card${isNew ? " is-new" : ""}`}
              >
                <span className="gs-bunker-card-title">{card.title}</span>
                <span className="gs-bunker-card-description">{card.description}</span>
              </div>
            );
          })}
          {gameState.threatCard && (
            <div className="gs-bunker-card gs-bunker-threat-card">
              <span className="gs-bunker-card-title">Угроза · {gameState.threatCard.title}</span>
              <span className="gs-bunker-card-description">{gameState.threatCard.description}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ScenarioSummary({
  idPrefix,
  gameState,
  expanded,
  onToggle,
  alwaysExpanded = false,
}: ScenarioSummaryProps) {
  const isOpen = alwaysExpanded || expanded;
  const revealedCount = gameState.revealedBunkerCards.length;
  const summaryContent: ReactNode = (
    <>
      <span className="gs-scenario-alert-icon" aria-hidden="true">
        <FiAlertTriangle />
      </span>
      <span className="gs-scenario-copy">
        <span id={`${idPrefix}-title`} className="gs-scenario-title">
          {gameState.catastrophe?.title ?? "Катастрофа не раскрыта"}
        </span>
        <span className="gs-scenario-description">
          {gameState.catastrophe?.description ?? "Описание сценария пока недоступно"}
        </span>
      </span>
      <span className="gs-scenario-meta">
        Бункер: {revealedCount} из {gameState.totalBunkerCards}
      </span>
      <span className="gs-scenario-meta">Мест: {gameState.bunkerCapacity}</span>
      <span className="gs-scenario-meta">
        {gameState.threatCard ? `Угроза: ${gameState.threatCard.title}` : "Угроза не раскрыта"}
      </span>
    </>
  );

  return (
    <section className="gs-scenario" aria-labelledby={`${idPrefix}-title`}>
      {alwaysExpanded ? (
        <div className="gs-scenario-summary">{summaryContent}</div>
      ) : (
        <button
          className="gs-scenario-summary"
          type="button"
          aria-expanded={isOpen}
          aria-controls={`${idPrefix}-details`}
          onClick={onToggle}
        >
          {summaryContent}
        </button>
      )}

      {isOpen && <ScenarioDetails idPrefix={idPrefix} gameState={gameState} />}
    </section>
  );
}
