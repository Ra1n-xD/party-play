import { useState, useEffect } from "react";
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

export function VoteScreen() {
  const {
    gameState,
    playerId,
    myCharacter,
    castVote,
    revealActionCard,
    error,
    adminShuffleAll,
    adminSwapAttribute,
    adminReplaceAttribute,
    adminPause,
    adminUnpause,
  } = useGame();
  const [voted, setVoted] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<string | null>(null);

  // Admin panel state
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminAction, setAdminAction] = useState<"shuffle" | "swap" | "replace" | null>(null);
  const [adminAttrType, setAdminAttrType] = useState<AttributeType>("profession");
  const [adminAttrTypes, setAdminAttrTypes] = useState<Set<AttributeType>>(new Set());
  const [adminPlayer1, setAdminPlayer1] = useState<string>("");
  const [adminPlayer2, setAdminPlayer2] = useState<string>("");
  const [adminPlayers, setAdminPlayers] = useState<Set<string>>(new Set());

  // Reset voted state when phase changes (e.g. tiebreak)
  useEffect(() => {
    setVoted(false);
    setConfirmTarget(null);
  }, [gameState?.phase]);

  if (!gameState) return null;

  const me = gameState.players.find((p) => p.id === playerId);
  const isTiebreak = gameState.phase === "ROUND_VOTE_TIEBREAK";

  // Determine voteable candidates
  let candidates = gameState.players.filter((p) => p.alive && p.id !== playerId);
  if (isTiebreak && gameState.tiebreakCandidateIds) {
    candidates = gameState.players.filter(
      (p) => gameState.tiebreakCandidateIds!.includes(p.id) && p.id !== playerId,
    );
  }

  // Can vote: alive OR last eliminated
  const isLastEliminated = playerId === gameState.lastEliminatedPlayerId;
  const canVote = me?.alive || isLastEliminated;

  // Action card reveal
  const canRevealAction =
    myCharacter?.actionCard && !me?.actionCardRevealed;

  // Admin helpers
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
          <h2>{isTiebreak ? "Перевоевание" : "Голосование"}</h2>
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
          <h2>{isTiebreak ? "Перевоевание" : "Голосование"}</h2>
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
        <h2>{isTiebreak ? "Перевоевание — ничья!" : "Голосование"}</h2>
        {isTiebreak ? (
          <p>Кандидаты получили равное число голосов. Выберите одного из них:</p>
        ) : (
          <p>Кого изгнать из бункера?</p>
        )}
        {isLastEliminated && !me?.alive && (
          <p className="last-elim-note">
            Вы голосуете как последний изгнанный — от лица всех изгнанных
          </p>
        )}
        <Timer endTime={gameState.phaseEndTime} />

        {gameState.votingsInCurrentRound > 1 && (
          <div className="voting-counter">
            Голосование {gameState.currentVotingInRound + 1} из {gameState.votingsInCurrentRound}
          </div>
        )}

        <div className="vote-candidates">
          {candidates.map((player) => {
            const playerNumber = gameState.players.findIndex((p) => p.id === player.id) + 1;
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
                      <span key={i} className="mini-tag">
                        {attr.label}: {attr.value}
                      </span>
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
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h3>Подтвердите голос</h3>
              <p>
                Вы уверены, что хотите изгнать{" "}
                <strong>{gameState.players.find((p) => p.id === confirmTarget)?.name}</strong>?
              </p>
              <div className="modal-actions">
                <button className="btn btn-danger" onClick={confirmVote}>
                  Изгнать
                </button>
                <button className="btn btn-secondary" onClick={() => setConfirmTarget(null)}>
                  Отмена
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="vote-progress">
          Проголосовало: {gameState.votesCount} / {gameState.totalVotesExpected}
        </div>

        {canRevealAction && (
          <button className="btn btn-reveal-action" onClick={revealActionCard}>
            Раскрыть особое условие
          </button>
        )}

        {error && <div className="error-toast">{error}</div>}
      </div>

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
    </div>
  );
}
