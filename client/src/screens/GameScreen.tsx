import { useState } from 'react';
import { useGame } from '../context/GameContext';
import { Timer } from '../components/Timer';

export function GameScreen() {
  const { gameState, playerId, myCharacter, revealAttribute, useAction, actionResult, error } = useGame();
  const [showActionModal, setShowActionModal] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [showAttrPicker, setShowAttrPicker] = useState(false);

  if (!gameState || !myCharacter) return null;

  const me = gameState.players.find(p => p.id === playerId);
  const isMyTurn = gameState.currentTurnPlayerId === playerId;
  const otherPlayers = gameState.players.filter(p => p.id !== playerId);
  const myRevealedCount = me?.revealedAttributes.length ?? 0;

  // Determine which attributes are unrevealed
  const unrevealedAttrs = myCharacter.attributes
    .map((attr, i) => ({ attr, index: i }))
    .filter(({ index }) => !me?.revealedAttributes.some(
      (ra, ri) => ri < myRevealedCount && myCharacter.attributes.indexOf(
        myCharacter.attributes.find(a => a.type === ra.type && a.value === ra.value) || myCharacter.attributes[0]
      ) === index
    ));

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
              <h3>Бункер ({gameState.revealedBunkerCards.length}/5 карт)</h3>
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
        </div>
      )}

      {/* My Character */}
      <div className="my-character">
        <h3>Ваш персонаж {!me?.alive && <span className="eliminated-badge">ИЗГНАН</span>}</h3>
        <div className="attributes-grid">
          {myCharacter.attributes.map((attr, i) => {
            const isRevealed = revealedIndices.has(i);
            return (
              <div key={i} className={`attribute-card ${isRevealed ? 'revealed' : 'hidden'}`}>
                <span className="attr-label">{attr.label}</span>
                <span className="attr-value">{attr.value}</span>
                {attr.detail && <span className="attr-detail">{attr.detail}</span>}
                {!isRevealed && <span className="attr-status">Скрыто</span>}
              </div>
            );
          })}
          {/* Special Condition card (separate from attributes) */}
          <div className={`attribute-card action-card ${myCharacter.actionUsed ? 'used' : ''}`}>
            <span className="attr-label">Особое условие</span>
            <span className="attr-value">{myCharacter.actionCard.title}</span>
            <span className="attr-detail">{myCharacter.actionCard.description}</span>
            {myCharacter.actionUsed && <span className="attr-status">Использовано</span>}
          </div>
        </div>

        <div className="character-actions">
          {canReveal && (
            <button className="btn btn-primary btn-reveal" onClick={() => {
              if (gameState.roundNumber === 1) {
                // Round 1: always reveal profession (index 0), no picker needed
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
      </div>

      {/* Other Players */}
      <div className="players-grid">
        <h3>Игроки ({gameState.players.filter(p => p.alive).length} в игре)</h3>
        <div className="players-list">
          {otherPlayers.map(player => (
            <div key={player.id} className={`player-card ${!player.alive ? 'eliminated' : ''} ${!player.connected ? 'disconnected' : ''}`}>
              <div className="player-header">
                <span className="player-name">
                  {player.isBot && <span className="bot-badge">BOT</span>}
                  {player.name}
                </span>
                {!player.alive && <span className="eliminated-badge">ИЗГНАН</span>}
                {!player.connected && !player.isBot && <span className="dc-badge">Отключён</span>}
                {player.id === gameState.lastEliminatedPlayerId && (
                  <span className="last-elim-badge">Голосует</span>
                )}
              </div>
              <div className="player-attributes">
                {player.revealedAttributes.length === 0 ? (
                  <span className="no-attrs">Пока ничего не раскрыто</span>
                ) : (
                  player.revealedAttributes.map((attr, i) => (
                    <div key={i} className="mini-attr">
                      <span className="mini-label">{attr.label}:</span>
                      <span className="mini-value">{attr.value}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
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
    </div>
  );
}
