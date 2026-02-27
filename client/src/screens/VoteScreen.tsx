import { useState, useEffect } from 'react';
import { useGame } from '../context/GameContext';
import { Timer } from '../components/Timer';

export function VoteScreen() {
  const { gameState, playerId, castVote, error } = useGame();
  const [voted, setVoted] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<string | null>(null);

  // Reset voted state when phase changes (e.g. tiebreak)
  useEffect(() => {
    setVoted(false);
    setConfirmTarget(null);
  }, [gameState?.phase]);

  if (!gameState) return null;

  const me = gameState.players.find(p => p.id === playerId);
  const isTiebreak = gameState.phase === 'ROUND_VOTE_TIEBREAK';

  // Determine voteable candidates
  let candidates = gameState.players.filter(p => p.alive && p.id !== playerId);
  if (isTiebreak && gameState.tiebreakCandidateIds) {
    candidates = gameState.players.filter(p =>
      gameState.tiebreakCandidateIds!.includes(p.id) && p.id !== playerId
    );
  }

  // Can vote: alive OR last eliminated
  const isLastEliminated = playerId === gameState.lastEliminatedPlayerId;
  const canVote = me?.alive || isLastEliminated;

  const handleVote = (targetId: string) => {
    setConfirmTarget(targetId);
  };

  const confirmVote = () => {
    if (confirmTarget) {
      castVote(confirmTarget);
      setVoted(true);
      setConfirmTarget(null);
    }
  };

  if (!canVote) {
    return (
      <div className="screen vote-screen">
        <div className="vote-container">
          <h2>{isTiebreak ? 'Перевоевание' : 'Голосование'}</h2>
          <p className="vote-status">Вы были изгнаны и не можете голосовать</p>
          <div className="vote-progress">
            Проголосовало: {gameState.votesCount} / {gameState.totalVotesExpected}
          </div>
          <Timer endTime={gameState.phaseEndTime} />
        </div>
      </div>
    );
  }

  if (voted) {
    return (
      <div className="screen vote-screen">
        <div className="vote-container">
          <h2>{isTiebreak ? 'Перевоевание' : 'Голосование'}</h2>
          <p className="vote-status">
            Ваш голос принят! Ожидаем остальных...
            {isLastEliminated && !me?.alive && (
              <span className="last-elim-note"> (вы голосуете как последний изгнанный)</span>
            )}
          </p>
          <div className="vote-progress">
            Проголосовало: {gameState.votesCount} / {gameState.totalVotesExpected}
          </div>
          <Timer endTime={gameState.phaseEndTime} />
        </div>
      </div>
    );
  }

  return (
    <div className="screen vote-screen">
      <div className="vote-container">
        <h2>{isTiebreak ? 'Перевоевание — ничья!' : 'Голосование'}</h2>
        {isTiebreak ? (
          <p>Кандидаты получили равное число голосов. Выберите одного из них:</p>
        ) : (
          <p>Кого изгнать из бункера?</p>
        )}
        {isLastEliminated && !me?.alive && (
          <p className="last-elim-note">Вы голосуете как последний изгнанный — от лица всех изгнанных</p>
        )}
        <Timer endTime={gameState.phaseEndTime} />

        {gameState.votingsInCurrentRound > 1 && (
          <div className="voting-counter">
            Голосование {gameState.currentVotingInRound + 1} из {gameState.votingsInCurrentRound}
          </div>
        )}

        <div className="vote-candidates">
          {candidates.map(player => {
            const playerNumber = gameState.players.findIndex(p => p.id === player.id) + 1;
            return (
            <div key={player.id} className="vote-candidate">
              <div className="candidate-info">
                <span className="candidate-name">
                  <span className="player-number">{playerNumber}</span>
                  {player.isBot && <span className="bot-badge">BOT</span>}
                  {player.name}
                </span>
                <div className="candidate-attrs">
                  {player.revealedAttributes.map((attr, i) => (
                    <span key={i} className="mini-tag">{attr.label}: {attr.value}</span>
                  ))}
                </div>
              </div>
              <button className="btn btn-vote" onClick={() => handleVote(player.id)}>
                Изгнать
              </button>
            </div>
            );
          })}
        </div>

        {/* Confirm Modal */}
        {confirmTarget && (
          <div className="modal-overlay" onClick={() => setConfirmTarget(null)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <h3>Подтвердите голос</h3>
              <p>Вы уверены, что хотите изгнать <strong>{gameState.players.find(p => p.id === confirmTarget)?.name}</strong>?</p>
              <div className="modal-actions">
                <button className="btn btn-danger" onClick={confirmVote}>Изгнать</button>
                <button className="btn btn-secondary" onClick={() => setConfirmTarget(null)}>Отмена</button>
              </div>
            </div>
          </div>
        )}

        <div className="vote-progress">
          Проголосовало: {gameState.votesCount} / {gameState.totalVotesExpected}
        </div>

        {error && <div className="error-toast">{error}</div>}
      </div>
    </div>
  );
}
