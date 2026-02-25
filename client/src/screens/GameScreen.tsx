import { useState } from 'react';
import { useGame } from '../context/GameContext';
import { Timer } from '../components/Timer';

export function GameScreen() {
  const { gameState, playerId, myCharacter, revealAttribute, useAction, endGame, actionResult, error } = useGame();
  const [showActionModal, setShowActionModal] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [showAttrPicker, setShowAttrPicker] = useState(false);

  if (!gameState || !myCharacter) return null;

  const me = gameState.players.find(p => p.id === playerId);
  const isMyTurn = gameState.currentTurnPlayerId === playerId;
  const allPlayers = gameState.players;
  const otherPlayers = gameState.players.filter(p => p.id !== playerId);

  // Find which indices are revealed by matching
  const revealedIndices = new Set<number>();
  if (me) {
    for (const ra of me.revealedAttributes) {
      const idx = myCharacter.attributes.findIndex(
        (a, i) => !revealedIndices.has(i) && a.type === ra.type && a.value === ra.value
      );
      if (idx !== -1) revealedIndices.add(idx);
    }
  }

  const unrevealedIndices = myCharacter.attributes
    .map((_, i) => i)
    .filter(i => !revealedIndices.has(i));

  // Can reveal: must be their turn, in ROUND_REVEAL, and have more than 1 unrevealed (1 stays hidden)
  const canReveal = gameState.phase === 'ROUND_REVEAL' && isMyTurn && unrevealedIndices.length > 1;

  const phaseLabels: Record<string, string> = {
    'CATASTROPHE_REVEAL': 'Катастрофа!',
    'BUNKER_EXPLORE': `Раунд ${gameState.roundNumber} — Исследование бункера`,
    'ROUND_REVEAL': `Раунд ${gameState.roundNumber} — Раскрытие карт`,
    'ROUND_DISCUSSION': `Раунд ${gameState.roundNumber} — Обсуждение`,
    'ROUND_VOTE': `Раунд ${gameState.roundNumber} — Голосование`,
    'ROUND_RESULT': `Раунд ${gameState.roundNumber} — Результат`,
  };

  const canUseAction = !myCharacter.actionUsed &&
    (gameState.phase === 'ROUND_REVEAL' || gameState.phase === 'ROUND_DISCUSSION') &&
    me?.alive;

  const handleUseAction = () => {
    if (myCharacter.actionCard.targetRequired) {
      setShowActionModal(true);
    } else {
      useAction();
    }
  };

  const confirmAction = () => {
    useAction(selectedTarget || undefined);
    setShowActionModal(false);
    setSelectedTarget(null);
  };

  const handleReveal = (attrIndex: number) => {
    revealAttribute(attrIndex);
    setShowAttrPicker(false);
  };

  // Voting info
  const votingInfo = gameState.votingsInCurrentRound > 0
    ? `Голосование: ${gameState.currentVotingInRound + 1}/${gameState.votingsInCurrentRound}`
    : 'Без голосования';

  return (
    <div className="screen game-screen">
      {/* Phase Header */}
      <div className="phase-header">
        <div className="phase-info">
          <span className="phase-label">{phaseLabels[gameState.phase] || gameState.phase}</span>
          <span className="round-counter">Раунд {gameState.roundNumber}/{gameState.totalRounds}</span>
          <Timer endTime={gameState.phaseEndTime} />
        </div>
        {gameState.phase === 'BUNKER_EXPLORE' && (
          <div className="turn-info">
            Открыта новая карта бункера!
          </div>
        )}
        {gameState.phase === 'ROUND_REVEAL' && (
          <div className="turn-info">
            {isMyTurn
              ? (gameState.roundNumber === 1 ? 'Ваш ход! Раскройте профессию' : 'Ваш ход! Выберите характеристику для раскрытия')
              : `Ход: ${gameState.players.find(p => p.id === gameState.currentTurnPlayerId)?.name || '...'}`}
          </div>
        )}
        {gameState.phase === 'ROUND_DISCUSSION' && (
          <div className="turn-info">{votingInfo}</div>
        )}
      </div>

      {/* Catastrophe Info */}
      {gameState.catastrophe && (
        <div className="scenario-panel">
          <div className="catastrophe-card">
            <h3>{gameState.catastrophe.title}</h3>
            <p>{gameState.catastrophe.description}</p>
          </div>

          {/* Bunker Cards - revealed gradually */}
          {gameState.revealedBunkerCards.length > 0 && (
            <div className="bunker-cards-panel">
              <h3>Бункер ({gameState.revealedBunkerCards.length}/{gameState.totalBunkerCards} карт)</h3>
              <div className="bunker-cards-list">
                {gameState.revealedBunkerCards.map((card, i) => (
                  <div key={i} className={`bunker-card-item ${i === gameState.revealedBunkerCards.length - 1 && gameState.phase === 'BUNKER_EXPLORE' ? 'newly-revealed' : ''}`}>
                    <span className="bunker-card-title">{card.title}</span>
                    <span className="bunker-card-desc">{card.description}</span>
                  </div>
                ))}
              </div>
              <p className="bunker-capacity">Мест в бункере: {gameState.bunkerCapacity}</p>
            </div>
          )}

          {/* Threat Card - revealed with last bunker card */}
          {gameState.threatCard && (
            <div className="threat-card-panel">
              <h3>Угроза</h3>
              <div className="threat-card-item">
                <span className="threat-card-title">{gameState.threatCard.title}</span>
                <span className="threat-card-desc">{gameState.threatCard.description}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* All Players (including self) */}
      <div className="players-grid">
        <h3>Игроки ({gameState.players.filter(p => p.alive).length} в игре)</h3>
        <div className="players-list">
          {allPlayers.map(player => {
            const isMe = player.id === playerId;
            return (
              <div key={player.id} className={`player-card ${isMe ? 'is-me' : ''} ${!player.alive ? 'eliminated' : ''} ${!player.connected ? 'disconnected' : ''}`}>
                <div className="player-header">
                  <span className="player-name">
                    {player.isBot && <span className="bot-badge">BOT</span>}
                    {player.name}
                    {isMe && <span className="me-badge">ВЫ</span>}
                  </span>
                  {!player.alive && <span className="eliminated-badge">ИЗГНАН</span>}
                  {!player.connected && !player.isBot && <span className="dc-badge">Отключён</span>}
                  {player.id === gameState.lastEliminatedPlayerId && (
                    <span className="last-elim-badge">Голосует</span>
                  )}
                </div>
                <div className="player-attributes">
                  {isMe ? (
                    <>
                      {myCharacter.attributes.map((attr, i) => {
                        const isRevealed = revealedIndices.has(i);
                        return (
                          <div key={i} className={`mini-attr ${isRevealed ? '' : 'attr-hidden'}`} data-attr-type={attr.type}>
                            {attr.image && <img src={attr.image} alt={attr.value} className="mini-card-image" />}
                            <span className="mini-label">{attr.label}:</span>
                            <span className="mini-value">{attr.value}</span>
                            {!isRevealed && <span className="mini-hidden-tag">скрыто</span>}
                          </div>
                        );
                      })}
                      <div className={`mini-attr ${myCharacter.actionUsed ? 'attr-used' : ''}`} data-attr-type="action">
                        {myCharacter.actionCard.image && <img src={myCharacter.actionCard.image} alt={myCharacter.actionCard.title} className="mini-card-image" />}
                        <span className="mini-label">Особое условие:</span>
                        <span className="mini-value">{myCharacter.actionCard.title}</span>
                        {myCharacter.actionUsed && <span className="mini-hidden-tag">использовано</span>}
                      </div>
                    </>
                  ) : (
                    player.revealedAttributes.length === 0 ? (
                      <span className="no-attrs">Пока ничего не раскрыто</span>
                    ) : (
                      player.revealedAttributes.map((attr, i) => (
                        <div key={i} className="mini-attr" data-attr-type={attr.type}>
                          {attr.image && <img src={attr.image} alt={attr.value} className="mini-card-image" />}
                          <span className="mini-label">{attr.label}:</span>
                          <span className="mini-value">{attr.value}</span>
                        </div>
                      ))
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Action buttons */}
      <div className="character-actions">
        {canReveal && (
          <button className="btn btn-primary btn-reveal" onClick={() => {
            if (gameState.roundNumber === 1) {
              revealAttribute(0);
            } else {
              setShowAttrPicker(true);
            }
          }}>
            Раскрыть характеристику
          </button>
        )}
        {canUseAction && (
          <button className="btn btn-action" onClick={handleUseAction}>
            Использовать: {myCharacter.actionCard.title}
          </button>
        )}
      </div>

      {/* Attribute Picker Modal */}
      {showAttrPicker && (
        <div className="modal-overlay" onClick={() => setShowAttrPicker(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Выберите характеристику для раскрытия</h3>
            <p>Одна карта должна остаться закрытой до финала</p>
            <div className="target-list">
              {unrevealedIndices.filter(() => unrevealedIndices.length > 1).map(idx => (
                <button
                  key={idx}
                  className="btn btn-target"
                  onClick={() => handleReveal(idx)}
                >
                  {myCharacter.attributes[idx].label}: {myCharacter.attributes[idx].value}
                </button>
              ))}
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowAttrPicker(false)}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Action Modal */}
      {showActionModal && (
        <div className="modal-overlay" onClick={() => setShowActionModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>{myCharacter.actionCard.title}</h3>
            <p>{myCharacter.actionCard.description}</p>
            <p>Выберите цель:</p>
            <div className="target-list">
              {otherPlayers.filter(p => p.alive).map(player => (
                <button
                  key={player.id}
                  className={`btn btn-target ${selectedTarget === player.id ? 'selected' : ''}`}
                  onClick={() => setSelectedTarget(player.id)}
                >
                  {player.name}
                </button>
              ))}
            </div>
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={confirmAction} disabled={!selectedTarget}>
                Применить
              </button>
              <button className="btn btn-secondary" onClick={() => setShowActionModal(false)}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Action Result Toast */}
      {actionResult && <div className="action-toast">{actionResult}</div>}
      {error && <div className="error-toast">{error}</div>}

      {/* Host: End Game */}
      {me?.isHost && (
        <button className="btn btn-danger btn-end-game" onClick={endGame}>
          Закончить игру
        </button>
      )}
    </div>
  );
}
