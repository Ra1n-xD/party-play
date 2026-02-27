import { useGame } from "../context/GameContext";

export function ResultsScreen() {
  const { gameState, playerId, playAgain } = useGame();

  if (!gameState) return null;

  const me = gameState.players.find((p) => p.id === playerId);
  const isHost = me?.isHost ?? false;
  const survivors = gameState.players.filter((p) => p.alive);
  const eliminated = gameState.players.filter((p) => !p.alive);
  const iSurvived = me?.alive ?? false;

  const renderPlayerCard = (player: (typeof gameState.players)[0]) => {
    const attrs =
      player.allAttributes || player.revealedAttributes.map((a) => ({ ...a, wasRevealed: true }));
    const playerNumber = gameState.players.findIndex((p) => p.id === player.id) + 1;

    return (
      <div key={player.id} className={`result-player ${player.id === playerId ? "is-me" : ""}`}>
        <div className="result-player-name">
          <span className="player-number">{playerNumber}</span>
          {player.isBot && <span className="bot-badge">BOT</span>}
          {player.name} {player.id === playerId && "(вы)"}
        </div>
        {/* Desktop: card grid */}
        <div className="result-desktop attributes-grid">
          {attrs.map((attr, i) => (
            <div
              key={i}
              className={`attribute-card ${attr.wasRevealed ? "revealed" : "hidden"}`}
              data-attr-type={attr.type}
            >
              <div className="attr-content">
                {attr.image && (
                  <img src={attr.image} alt={attr.value} className="attr-card-image" />
                )}
                <div className="attr-text">
                  <span className="attr-label">{attr.label}</span>
                  <span className="attr-value">{attr.value}</span>
                  {attr.detail && <span className="attr-detail">{attr.detail}</span>}
                </div>
              </div>
              {!attr.wasRevealed && <span className="attr-status">Скрыто</span>}
            </div>
          ))}
        </div>
        {/* Action card (desktop) */}
        {player.actionCard && (
          <div className="result-desktop action-card-display">
            <div className="attribute-card revealed" data-attr-type="action">
              <div className="attr-content">
                {player.actionCard.image && (
                  <img
                    src={player.actionCard.image}
                    alt={player.actionCard.title}
                    className="attr-card-image"
                  />
                )}
                <div className="attr-text">
                  <span className="attr-label">Особое условие</span>
                  <span className="attr-value">{player.actionCard.title}</span>
                  <span className="attr-detail">{player.actionCard.description}</span>
                </div>
              </div>
            </div>
          </div>
        )}
        {/* Mobile: compact tags */}
        <div className="result-mobile">
          {attrs.map((attr, i) => (
            <span
              key={i}
              className={`result-tag ${attr.wasRevealed ? "tag-revealed" : "tag-hidden"}`}
              data-attr-type={attr.type}
            >
              <span className="result-tag-label">{attr.label}:</span> {attr.value}
            </span>
          ))}
          {player.actionCard && (
            <span className="result-tag tag-revealed" data-attr-type="action">
              <span className="result-tag-label">Особое условие:</span> {player.actionCard.title}
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="screen results-screen">
      <div className="results-container">
        <h2>{iSurvived ? "Вы попали в бункер!" : "Вы были изгнаны..."}</h2>

        {gameState.catastrophe && (
          <div className="results-scenario">
            <span className="scenario-name">{gameState.catastrophe.title}</span>
          </div>
        )}

        {/* Bunker cards summary */}
        {gameState.revealedBunkerCards.length > 0 && (
          <div className="results-bunker">
            <h3>Карты бункера</h3>
            <div className="bunker-cards-list">
              {gameState.revealedBunkerCards.map((card, i) => (
                <div key={i} className="bunker-card-item">
                  <span className="bunker-card-title">{card.title}</span>
                  <span className="bunker-card-desc">{card.description}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Threat card */}
        {gameState.threatCard && (
          <div className="threat-card-panel">
            <h3>Угроза</h3>
            <div className="threat-card-item">
              <span className="threat-card-title">{gameState.threatCard.title}</span>
              <span className="threat-card-desc">{gameState.threatCard.description}</span>
            </div>
          </div>
        )}

        <div className="results-groups">
          <div className="results-group survivors">
            <h3>В бункере ({survivors.length})</h3>
            {survivors.map(renderPlayerCard)}
          </div>

          <div className="results-group eliminated-group">
            <h3>Изгнанные ({eliminated.length})</h3>
            {eliminated.map(renderPlayerCard)}
          </div>
        </div>

        {/* Vote Results */}
        {gameState.voteResults && Object.keys(gameState.voteResults).length > 0 && (
          <div className="last-vote-results">
            <h3>Последнее голосование</h3>
            <div className="vote-bars">
              {Object.entries(gameState.voteResults)
                .sort(([, a], [, b]) => b - a)
                .map(([pid, count]) => {
                  const player = gameState.players.find((p) => p.id === pid);
                  return (
                    <div key={pid} className="vote-bar-row">
                      <span className="vote-bar-name">{player?.name || "???"}</span>
                      <div className="vote-bar">
                        <div
                          className="vote-bar-fill"
                          style={{ width: `${(count / gameState.totalVotesExpected) * 100}%` }}
                        />
                      </div>
                      <span className="vote-bar-count">{count}</span>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {isHost && (
          <button className="btn btn-primary" onClick={playAgain}>
            Играть снова
          </button>
        )}
      </div>
    </div>
  );
}
