import { useGame } from '../context/GameContext';

export function ResultsScreen() {
  const { gameState, playerId, myCharacter, playAgain } = useGame();

  if (!gameState) return null;

  const me = gameState.players.find(p => p.id === playerId);
  const isHost = me?.isHost ?? false;
  const survivors = gameState.players.filter(p => p.alive);
  const eliminated = gameState.players.filter(p => !p.alive);
  const iSurvived = me?.alive ?? false;

  return (
    <div className="screen results-screen">
      <div className="results-container">
        <h2>{iSurvived ? 'Вы попали в бункер!' : 'Вы были изгнаны...'}</h2>

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
                  {card.image ? (
                    <img src={card.image} alt={card.title} className="card-image bunker-card-image" />
                  ) : (
                    <>
                      <span className="bunker-card-title">{card.title}</span>
                      <span className="bunker-card-desc">{card.description}</span>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="results-groups">
          <div className="results-group survivors">
            <h3>В бункере ({survivors.length})</h3>
            {survivors.map(player => (
              <div key={player.id} className={`result-player ${player.id === playerId ? 'is-me' : ''}`}>
                <div className="result-player-name">{player.name} {player.id === playerId && '(вы)'}</div>
                <div className="result-attrs">
                  {player.revealedAttributes.map((attr, i) => (
                    <div key={i} className="result-attr">
                      <span className="result-attr-label">{attr.label}:</span>
                      <span className="result-attr-value">{attr.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="results-group eliminated-group">
            <h3>Изгнанные ({eliminated.length})</h3>
            {eliminated.map(player => (
              <div key={player.id} className={`result-player ${player.id === playerId ? 'is-me' : ''}`}>
                <div className="result-player-name">{player.name} {player.id === playerId && '(вы)'}</div>
                <div className="result-attrs">
                  {player.revealedAttributes.map((attr, i) => (
                    <div key={i} className="result-attr">
                      <span className="result-attr-label">{attr.label}:</span>
                      <span className="result-attr-value">{attr.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* My full character (including hidden card) */}
        {myCharacter && (
          <div className="results-my-full">
            <h3>Ваш полный персонаж</h3>
            <div className="result-attrs">
              {myCharacter.attributes.map((attr, i) => (
                <div key={i} className="result-attr">
                  <span className="result-attr-label">{attr.label}:</span>
                  <span className="result-attr-value">{attr.value}</span>
                  {attr.detail && <span className="result-attr-detail">{attr.detail}</span>}
                </div>
              ))}
              <div className="result-attr">
                <span className="result-attr-label">Особое условие:</span>
                <span className="result-attr-value">{myCharacter.actionCard.title}</span>
                <span className="result-attr-detail">{myCharacter.actionCard.description}</span>
              </div>
            </div>
          </div>
        )}

        {/* Vote Results */}
        {gameState.voteResults && Object.keys(gameState.voteResults).length > 0 && (
          <div className="last-vote-results">
            <h3>Последнее голосование</h3>
            <div className="vote-bars">
              {Object.entries(gameState.voteResults)
                .sort(([, a], [, b]) => b - a)
                .map(([pid, count]) => {
                  const player = gameState.players.find(p => p.id === pid);
                  return (
                    <div key={pid} className="vote-bar-row">
                      <span className="vote-bar-name">{player?.name || '???'}</span>
                      <div className="vote-bar">
                        <div className="vote-bar-fill" style={{ width: `${(count / gameState.totalVotesExpected) * 100}%` }} />
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
