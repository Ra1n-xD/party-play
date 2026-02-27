import { useState } from "react";
import { useGame } from "../context/GameContext";
import { Timer } from "../components/Timer";
import { AttributeType } from "../../../shared/types";

const ATTR_TYPES: { type: AttributeType; label: string }[] = [
  { type: "profession", label: "Профессия" },
  { type: "bio", label: "Биология" },
  { type: "health", label: "Здоровье" },
  { type: "hobby", label: "Хобби" },
  { type: "baggage", label: "Багаж" },
  { type: "fact", label: "Доп. факт" },
];

export function GameScreen() {
  const {
    gameState,
    playerId,
    myCharacter,
    revealAttribute,
    revealActionCard,
    endGame,
    error,
    adminShuffleAll,
    adminSwapAttribute,
    adminReplaceAttribute,
    adminPause,
    adminUnpause,
  } = useGame();
  const [showAttrPicker, setShowAttrPicker] = useState(false);
  const [expandedPlayerId, setExpandedPlayerId] = useState<string | null>(null);

  // Admin panel state
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminAction, setAdminAction] = useState<"shuffle" | "swap" | "replace" | null>(null);
  const [adminAttrType, setAdminAttrType] = useState<AttributeType>("profession");
  const [adminAttrTypes, setAdminAttrTypes] = useState<Set<AttributeType>>(new Set());
  const [adminPlayer1, setAdminPlayer1] = useState<string>("");
  const [adminPlayer2, setAdminPlayer2] = useState<string>("");
  const [adminPlayers, setAdminPlayers] = useState<Set<string>>(new Set());

  if (!gameState || !myCharacter) return null;

  const me = gameState.players.find((p) => p.id === playerId);
  const isMyTurn = gameState.currentTurnPlayerId === playerId;
  const allPlayers = gameState.players;

  // Find which indices are revealed by matching
  const revealedIndices = new Set<number>();
  if (me) {
    for (const ra of me.revealedAttributes) {
      const idx = myCharacter.attributes.findIndex(
        (a, i) => !revealedIndices.has(i) && a.type === ra.type && a.value === ra.value,
      );
      if (idx !== -1) revealedIndices.add(idx);
    }
  }

  const unrevealedIndices = myCharacter.attributes
    .map((_, i) => i)
    .filter((i) => !revealedIndices.has(i));

  const canReveal = gameState.phase === "ROUND_REVEAL" && isMyTurn && unrevealedIndices.length > 1;
  const canRevealAction =
    myCharacter.actionCard &&
    !me?.actionCardRevealed &&
    gameState.phase !== "ROUND_VOTE" &&
    gameState.phase !== "ROUND_VOTE_TIEBREAK";

  const phaseLabels: Record<string, string> = {
    CATASTROPHE_REVEAL: "Катастрофа!",
    BUNKER_EXPLORE: `Раунд ${gameState.roundNumber} — Исследование бункера`,
    ROUND_REVEAL: `Раунд ${gameState.roundNumber} — Раскрытие карт`,
    ROUND_DISCUSSION: `Раунд ${gameState.roundNumber} — Обсуждение`,
    ROUND_VOTE: `Раунд ${gameState.roundNumber} — Голосование`,
    ROUND_RESULT: `Раунд ${gameState.roundNumber} — Результат`,
  };

  const handleReveal = (attrIndex: number) => {
    revealAttribute(attrIndex);
    setShowAttrPicker(false);
  };

  const votingInfo =
    gameState.votingsInCurrentRound > 0
      ? `Голосование: ${gameState.currentVotingInRound + 1}/${gameState.votingsInCurrentRound}`
      : "Без голосования";

  const alivePlayers = gameState.players.filter((p) => p.alive);

  const toggleInSet = <T,>(set: Set<T>, item: T): Set<T> => {
    const next = new Set(set);
    if (next.has(item)) next.delete(item);
    else next.add(item);
    return next;
  };

  const handleAdminExecute = () => {
    if (!adminAction) return;
    if (adminAction === "shuffle") {
      adminShuffleAll(adminAttrType);
    } else if (adminAction === "swap") {
      if (adminPlayer1 && adminPlayer2 && adminPlayer1 !== adminPlayer2) {
        adminSwapAttribute(adminPlayer1, adminPlayer2, adminAttrType);
      }
    } else if (adminAction === "replace") {
      const players = Array.from(adminPlayers);
      const types = Array.from(adminAttrTypes);
      if (players.length > 0 && types.length > 0) {
        for (const pid of players) {
          for (const t of types) {
            adminReplaceAttribute(pid, t);
          }
        }
      }
    }
    setAdminAction(null);
    setAdminPlayer1("");
    setAdminPlayer2("");
    setAdminPlayers(new Set());
    setAdminAttrTypes(new Set());
  };

  return (
    <div className="screen game-screen">
      {/* Phase Header */}
      <div className="phase-header">
        <div className="phase-info">
          <span className="phase-label">{phaseLabels[gameState.phase] || gameState.phase}</span>
          <span className="round-counter">
            Раунд {gameState.roundNumber}/{gameState.totalRounds}
          </span>
          <Timer endTime={gameState.phaseEndTime} />
        </div>
        {gameState.phase === "BUNKER_EXPLORE" && (
          <div className="turn-info">Открыта новая карта бункера!</div>
        )}
        {gameState.phase === "ROUND_REVEAL" && (
          <div className="turn-info">
            {isMyTurn
              ? gameState.roundNumber === 1
                ? "Ваш ход! Раскройте профессию"
                : "Ваш ход! Выберите характеристику для раскрытия"
              : `Ход: ${gameState.players.find((p) => p.id === gameState.currentTurnPlayerId)?.name || "..."}`}
          </div>
        )}
        {gameState.phase === "ROUND_DISCUSSION" && <div className="turn-info">{votingInfo}</div>}
      </div>

      {/* Catastrophe Info */}
      {gameState.catastrophe && (
        <div className="scenario-panel">
          <div className="catastrophe-card">
            <h3>{gameState.catastrophe.title}</h3>
            <p>{gameState.catastrophe.description}</p>
          </div>

          {gameState.revealedBunkerCards.length > 0 && (
            <div className="bunker-cards-panel">
              <h3>
                Бункер ({gameState.revealedBunkerCards.length}/{gameState.totalBunkerCards} карт)
              </h3>
              <div className="bunker-cards-list">
                {gameState.revealedBunkerCards.map((card, i) => (
                  <div
                    key={i}
                    className={`bunker-card-item ${i === gameState.revealedBunkerCards.length - 1 && gameState.phase === "BUNKER_EXPLORE" ? "newly-revealed" : ""}`}
                  >
                    <span className="bunker-card-title">{card.title}</span>
                    <span className="bunker-card-desc">{card.description}</span>
                  </div>
                ))}
              </div>
              <p className="bunker-capacity">Мест в бункере: {gameState.bunkerCapacity}</p>
            </div>
          )}

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

      {/* Desktop: My Character (separate card grid) */}
      <div className="my-character desktop-only">
        <h3>Ваш персонаж {!me?.alive && <span className="eliminated-badge">ИЗГНАН</span>}</h3>
        <div className="attributes-grid">
          {myCharacter.attributes.map((attr, i) => {
            const isRevealed = revealedIndices.has(i);
            return (
              <div
                key={i}
                className={`attribute-card ${isRevealed ? "revealed" : "hidden"}`}
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
                {!isRevealed && <span className="attr-status">Скрыто</span>}
              </div>
            );
          })}
        </div>

        {myCharacter.actionCard && (
          <div className="action-card-display">
            <div className="attribute-card revealed" data-attr-type="action">
              <div className="attr-content">
                {myCharacter.actionCard.image && (
                  <img
                    src={myCharacter.actionCard.image}
                    alt={myCharacter.actionCard.title}
                    className="attr-card-image"
                  />
                )}
                <div className="attr-text">
                  <span className="attr-label">Особое условие</span>
                  <span className="attr-value">{myCharacter.actionCard.title}</span>
                  <span className="attr-detail">{myCharacter.actionCard.description}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="character-actions">
          {canReveal && (
            <button
              className="btn btn-primary btn-reveal"
              onClick={() => {
                if (gameState.roundNumber === 1) {
                  revealAttribute(0);
                } else {
                  setShowAttrPicker(true);
                }
              }}
            >
              Раскрыть характеристику
            </button>
          )}
          {canRevealAction && (
            <button className="btn btn-secondary btn-reveal-action" onClick={revealActionCard}>
              Раскрыть особое условие
            </button>
          )}
        </div>
      </div>

      {/* Desktop: Other Players */}
      <div className="players-grid desktop-only">
        <h3>Игроки ({gameState.players.filter((p) => p.alive).length} в игре)</h3>
        <div className="players-list">
          {allPlayers.map((player, idx) => {
            const isMe = player.id === playerId;
            return (
              <div
                key={player.id}
                className={`player-card ${isMe ? "is-me" : ""} ${!player.alive ? "eliminated" : ""} ${!player.connected ? "disconnected" : ""} ${gameState.currentTurnPlayerId === player.id ? "is-current-turn" : ""}`}
                onClick={() => setExpandedPlayerId(player.id)}
              >
                <div className="player-header">
                  <span className="player-name">
                    <span className="player-number">{idx + 1}</span>
                    {player.isBot && <span className="bot-badge">BOT</span>}
                    {player.name}
                    {isMe && <span className="me-badge">ВЫ</span>}
                    {gameState.currentTurnPlayerId === player.id && (
                      <span className="turn-badge">ХОД ИГРОКА</span>
                    )}
                  </span>
                  {!player.alive && <span className="eliminated-badge">ИЗГНАН</span>}
                  {!player.connected && !player.isBot && <span className="dc-badge">Отключён</span>}
                  {player.id === gameState.lastEliminatedPlayerId && (
                    <span className="last-elim-badge">Голосует</span>
                  )}
                </div>
                <div className="player-attributes">
                  {player.revealedAttributes.length === 0 && !player.actionCard ? (
                    <span className="no-attrs">Пока ничего не раскрыто</span>
                  ) : (
                    <>
                      {player.revealedAttributes.map((attr, i) => (
                        <div key={i} className="mini-attr" data-attr-type={attr.type}>
                          {attr.image && (
                            <img src={attr.image} alt={attr.value} className="mini-card-image" />
                          )}
                          <span className="mini-label">{attr.label}:</span>
                          <span className="mini-value">{attr.value}</span>
                        </div>
                      ))}
                      {player.actionCard && (
                        <div className="mini-attr" data-attr-type="action">
                          <span className="mini-label">Особое условие:</span>
                          <span className="mini-value">{player.actionCard.title}</span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Mobile: All Players in one grid */}
      <div className="players-grid mobile-only">
        <h3>Игроки ({gameState.players.filter((p) => p.alive).length} в игре)</h3>
        <div className="players-list">
          {allPlayers.map((player, idx) => {
            const isMe = player.id === playerId;
            return (
              <div
                key={player.id}
                className={`player-card ${isMe ? "is-me" : ""} ${!player.alive ? "eliminated" : ""} ${!player.connected ? "disconnected" : ""} ${gameState.currentTurnPlayerId === player.id ? "is-current-turn" : ""}`}
                onClick={() => setExpandedPlayerId(player.id)}
              >
                <div className="player-header">
                  <span className="player-name">
                    <span className="player-number">{idx + 1}</span>
                    {player.isBot && <span className="bot-badge">BOT</span>}
                    {player.name}
                    {isMe && <span className="me-badge">ВЫ</span>}
                    {gameState.currentTurnPlayerId === player.id && (
                      <span className="turn-badge">ХОД</span>
                    )}
                  </span>
                  {!player.alive && <span className="eliminated-badge">ИЗГНАН</span>}
                  {!player.connected && !player.isBot && <span className="dc-badge">Отключён</span>}
                </div>
                <div className="player-attributes">
                  {isMe ? (
                    <>
                      {myCharacter.attributes.map((attr, i) => {
                        const isRevealed = revealedIndices.has(i);
                        return (
                          <div
                            key={i}
                            className={`mini-attr ${isRevealed ? "" : "attr-hidden"}`}
                            data-attr-type={attr.type}
                          >
                            <span className="mini-label">{attr.label}:</span>
                            <span className="mini-value">{attr.value}</span>
                            {!isRevealed && <span className="mini-hidden-tag">скрыто</span>}
                          </div>
                        );
                      })}
                      {myCharacter.actionCard && (
                        <div className="mini-attr" data-attr-type="action">
                          <span className="mini-label">Особое условие:</span>
                          <span className="mini-value">{myCharacter.actionCard.title}</span>
                        </div>
                      )}
                    </>
                  ) : player.revealedAttributes.length === 0 && !player.actionCard ? (
                    <span className="no-attrs">Пока ничего не раскрыто</span>
                  ) : (
                    <>
                      {player.revealedAttributes.map((attr, i) => (
                        <div key={i} className="mini-attr" data-attr-type={attr.type}>
                          <span className="mini-label">{attr.label}:</span>
                          <span className="mini-value">{attr.value}</span>
                        </div>
                      ))}
                      {player.actionCard && (
                        <div className="mini-attr" data-attr-type="action">
                          <span className="mini-label">Особое условие:</span>
                          <span className="mini-value">{player.actionCard.title}</span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Mobile action buttons */}
        <div className="character-actions">
          {canReveal && (
            <button
              className="btn btn-primary btn-reveal"
              onClick={() => {
                if (gameState.roundNumber === 1) {
                  revealAttribute(0);
                } else {
                  setShowAttrPicker(true);
                }
              }}
            >
              Раскрыть характеристику
            </button>
          )}
          {canRevealAction && (
            <button className="btn btn-secondary btn-reveal-action" onClick={revealActionCard}>
              Раскрыть особое условие
            </button>
          )}
        </div>
      </div>

      {/* Attribute Picker Modal */}
      {showAttrPicker && (
        <div className="modal-overlay" onClick={() => setShowAttrPicker(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Выберите характеристику для раскрытия</h3>
            <p>Одна карта должна остаться закрытой до финала</p>
            <div className="target-list">
              {unrevealedIndices
                .filter(() => unrevealedIndices.length > 1)
                .map((idx) => (
                  <button key={idx} className="btn btn-target" onClick={() => handleReveal(idx)}>
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

      {/* Expanded Player Modal */}
      {expandedPlayerId &&
        (() => {
          const player = gameState.players.find((p) => p.id === expandedPlayerId);
          if (!player) return null;
          const isMe = player.id === playerId;
          const attrs = isMe ? myCharacter.attributes : [];
          const revealedAttrs = player.revealedAttributes;
          const playerNumber = gameState.players.findIndex((p) => p.id === player.id) + 1;

          return (
            <div className="modal-overlay" onClick={() => setExpandedPlayerId(null)}>
              <div className="modal expanded-player-modal" onClick={(e) => e.stopPropagation()}>
                <div className="expanded-player-header">
                  <h3>
                    <span className="player-number">{playerNumber}</span>
                    {player.isBot && <span className="bot-badge">BOT</span>}
                    {player.name}
                    {isMe && <span className="me-badge">ВЫ</span>}
                  </h3>
                  {!player.alive && <span className="eliminated-badge">ИЗГНАН</span>}
                </div>
                <div className="attributes-grid">
                  {isMe ? (
                    attrs.map((attr, i) => {
                      const isRevealed = revealedIndices.has(i);
                      return (
                        <div
                          key={i}
                          className={`attribute-card ${isRevealed ? "revealed" : "hidden"}`}
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
                          {!isRevealed && <span className="attr-status">Скрыто</span>}
                        </div>
                      );
                    })
                  ) : revealedAttrs.length === 0 ? (
                    <p className="no-attrs">Пока ничего не раскрыто</p>
                  ) : (
                    revealedAttrs.map((attr, i) => (
                      <div key={i} className="attribute-card revealed" data-attr-type={attr.type}>
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
                      </div>
                    ))
                  )}
                </div>
                {((isMe && myCharacter.actionCard) || (!isMe && player.actionCard)) &&
                  (() => {
                    const ac = isMe ? myCharacter.actionCard! : player.actionCard!;
                    return (
                      <div className="action-card-display">
                        <div className="attribute-card revealed" data-attr-type="action">
                          <div className="attr-content">
                            {ac.image && (
                              <img src={ac.image} alt={ac.title} className="attr-card-image" />
                            )}
                            <div className="attr-text">
                              <span className="attr-label">Особое условие</span>
                              <span className="attr-value">{ac.title}</span>
                              <span className="attr-detail">{ac.description}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                <div className="modal-actions">
                  <button className="btn btn-secondary" onClick={() => setExpandedPlayerId(null)}>
                    Закрыть
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

      {/* Host Admin Panel */}
      {me?.isHost && (
        <div className="admin-panel">
          <button
            className="btn btn-admin-toggle"
            onClick={() => {
              const next = !adminOpen;
              setAdminOpen(next);
              if (next) {
                adminPause();
              } else {
                adminUnpause();
              }
            }}
          >
            {adminOpen ? "Скрыть админ-панель ▲" : "Админ-панель ▼"}
          </button>

          {adminOpen && (
            <div className="admin-panel-body">
              {!adminAction && (
                <div className="admin-actions-list">
                  <button className="btn btn-admin" onClick={() => setAdminAction("shuffle")}>
                    Перемешать карты
                  </button>
                  <button className="btn btn-admin" onClick={() => setAdminAction("swap")}>
                    Поменять местами
                  </button>
                  <button className="btn btn-admin" onClick={() => setAdminAction("replace")}>
                    Заменить карту
                  </button>
                </div>
              )}

              {adminAction && (
                <div className="admin-form">
                  <h4>
                    {adminAction === "shuffle" && "Перемешать карты"}
                    {adminAction === "swap" && "Поменять местами"}
                    {adminAction === "replace" && "Заменить карту"}
                  </h4>

                  {adminAction === "replace" ? (
                    <>
                      <label>Тип карты (можно несколько):</label>
                      <div className="admin-chips">
                        {ATTR_TYPES.map((t) => (
                          <button
                            key={t.type}
                            className={`admin-chip ${adminAttrTypes.has(t.type) ? "active" : ""}`}
                            onClick={() => setAdminAttrTypes(toggleInSet(adminAttrTypes, t.type))}
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>

                      <label>Игроки (можно несколько):</label>
                      <div className="admin-chips">
                        {alivePlayers.map((p) => (
                          <button
                            key={p.id}
                            className={`admin-chip ${adminPlayers.has(p.id) ? "active" : ""}`}
                            onClick={() => setAdminPlayers(toggleInSet(adminPlayers, p.id))}
                          >
                            {p.name}
                          </button>
                        ))}
                      </div>
                    </>
                  ) : (
                    <>
                      <label>Тип карты:</label>
                      <div className="admin-chips">
                        {ATTR_TYPES.map((t) => (
                          <button
                            key={t.type}
                            className={`admin-chip ${adminAttrType === t.type ? "active" : ""}`}
                            onClick={() => setAdminAttrType(t.type)}
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>

                      {adminAction === "swap" && (
                        <>
                          <label>Игрок 1:</label>
                          <div className="admin-chips">
                            {alivePlayers.map((p) => (
                              <button
                                key={p.id}
                                className={`admin-chip ${adminPlayer1 === p.id ? "active" : ""}`}
                                onClick={() => setAdminPlayer1(p.id)}
                              >
                                {p.name}
                              </button>
                            ))}
                          </div>

                          <label>Игрок 2:</label>
                          <div className="admin-chips">
                            {alivePlayers
                              .filter((p) => p.id !== adminPlayer1)
                              .map((p) => (
                                <button
                                  key={p.id}
                                  className={`admin-chip ${adminPlayer2 === p.id ? "active" : ""}`}
                                  onClick={() => setAdminPlayer2(p.id)}
                                >
                                  {p.name}
                                </button>
                              ))}
                          </div>
                        </>
                      )}
                    </>
                  )}

                  <div className="admin-form-actions">
                    <button
                      className="btn btn-primary"
                      onClick={handleAdminExecute}
                      disabled={
                        (adminAction === "swap" && (!adminPlayer1 || !adminPlayer2)) ||
                        (adminAction === "replace" &&
                          (adminPlayers.size === 0 || adminAttrTypes.size === 0))
                      }
                    >
                      Применить
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={() => {
                        setAdminAction(null);
                        setAdminPlayer1("");
                        setAdminPlayer2("");
                      }}
                    >
                      Отмена
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

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
