import React, { type ReactNode } from "react";
import type { ClientGameState } from "../../context/GameContext";

interface ScenarioSummaryProps {
  idPrefix: string;
  gameState: ClientGameState;
  expanded: boolean;
  onToggle: () => void;
  alwaysExpanded?: boolean;
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
      <span id={`${idPrefix}-title`} className="gs-scenario-title">
        {gameState.catastrophe?.title ?? "Катастрофа не раскрыта"}
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

      {isOpen && (
        <div id={`${idPrefix}-details`} className="gs-scenario-details">
          {gameState.catastrophe && (
            <div className="gs-catastrophe-details">
              <p>{gameState.catastrophe.description}</p>
            </div>
          )}

          <div className="gs-bunker-details">
            <h3>Бункер</h3>
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
            </div>
            <p className="gs-bunker-capacity">Мест в бункере: {gameState.bunkerCapacity}</p>
          </div>

          {gameState.threatCard && (
            <div className="gs-threat-details">
              <h3>Угроза</h3>
              <span className="gs-threat-title">{gameState.threatCard.title}</span>
              <span className="gs-threat-description">{gameState.threatCard.description}</span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
