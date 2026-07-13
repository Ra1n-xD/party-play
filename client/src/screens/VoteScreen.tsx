import { useCallback, useEffect, useRef, useState } from "react";
import { useGame } from "../context/GameContext";
import { Timer } from "../components/Timer";
import { VoteProgressBar } from "../components/VoteProgressBar";
import { AttributeType } from "../../../shared/types";
import { ATTR_TYPES } from "../utils/constants";
import { toggleInSet } from "../utils/setUtils";
import { ReconnectHostBanner, ReconnectHostControls } from "./game/ReconnectHostControls";

export function VoteScreen() {
  const {
    gameState,
    playerId,
    isSpectator,
    myCharacter,
    castVote,
    revealActionCard,
    error,
    adminShuffleAll,
    adminSwapAttribute,
    adminReplaceAttribute,
    adminRemoveBunkerCard,
    adminReplaceBunkerCard,
    adminDeleteAttribute,
    adminForceRevealType,
    adminPause,
    adminUnpause,
    pendingAdminOpen,
    consumePendingAdminOpen,
    hostSeatClaims,
    resolveSeatClaim,
    kickPlayer,
    transferHost,
  } = useGame();
  const [voted, setVoted] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<string | null>(null);
  const [confirmRevealAction, setConfirmRevealAction] = useState(false);

  // Admin panel state
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminAction, setAdminAction] = useState<
    | "shuffle"
    | "swap"
    | "replace"
    | "deleteAttr"
    | "forceReveal"
    | "removeBunker"
    | "replaceBunker"
    | null
  >(null);
  const [adminAttrType, setAdminAttrType] = useState<AttributeType | "action">("profession");
  const [adminAttrTypes, setAdminAttrTypes] = useState<Set<AttributeType | "action">>(new Set());
  const [adminPlayer1, setAdminPlayer1] = useState<string>("");
  const [adminPlayer2, setAdminPlayer2] = useState<string>("");
  const [adminPlayers, setAdminPlayers] = useState<Set<string>>(new Set());
  const [adminBunkerCardIndex, setAdminBunkerCardIndex] = useState<number | null>(null);
  const adminPauseActiveRef = useRef(false);
  const isCurrentHost =
    !isSpectator && Boolean(gameState?.players.find((player) => player.id === playerId)?.isHost);

  const openAdminPanel = useCallback(() => {
    if (adminOpen || adminPauseActiveRef.current) return;

    setConfirmTarget(null);
    setConfirmRevealAction(false);
    adminPauseActiveRef.current = true;
    setAdminOpen(true);
    adminPause();
  }, [adminOpen, adminPause]);

  const closeAdminPanel = useCallback(() => {
    setAdminOpen(false);
    if (!adminPauseActiveRef.current) return;

    adminPauseActiveRef.current = false;
    adminUnpause();
  }, [adminUnpause]);

  // Reset voted state when phase changes (e.g. tiebreak)
  useEffect(() => {
    setVoted(false);
    setConfirmTarget(null);
    setAdminOpen(false);
  }, [gameState?.phase]);

  useEffect(() => {
    return () => {
      if (!adminPauseActiveRef.current) return;

      adminPauseActiveRef.current = false;
      adminUnpause();
    };
  }, [adminUnpause, gameState?.phase]);

  useEffect(() => {
    if (!isCurrentHost) {
      setAdminOpen(false);
      setAdminAction(null);
      setAdminAttrType("profession");
      setAdminAttrTypes(new Set());
      setAdminPlayer1("");
      setAdminPlayer2("");
      setAdminPlayers(new Set());
      setAdminBunkerCardIndex(null);
      adminPauseActiveRef.current = false;
    }
  }, [isCurrentHost]);

  // Auto-open admin panel after action card reveal overlay
  useEffect(() => {
    if (!pendingAdminOpen) return;

    consumePendingAdminOpen();
    const me = gameState?.players.find((p) => p.id === playerId);
    if (me?.isHost) openAdminPanel();
  }, [consumePendingAdminOpen, gameState, openAdminPanel, pendingAdminOpen, playerId]);

  if (!gameState) return null;

  const me = isSpectator ? undefined : gameState.players.find((p) => p.id === playerId);
  const isTiebreak = gameState.phase === "ROUND_VOTE_TIEBREAK";

  // Spectator view
  if (isSpectator) {
    return (
      <div className="screen vote-screen">
        <div className="sticky-top-bar">
          <div className="top-bar-content">
            <div className="top-bar-left">
              <span className="top-bar-phase">
                {isTiebreak ? "Переголосование" : "Голосование"}
              </span>
              <span className="top-bar-desc">Вы наблюдаете</span>
            </div>
            <div className="top-bar-right">
              <Timer endTime={gameState.phaseEndTime} size="large" />
            </div>
          </div>
        </div>
        <div className="vote-container">
          <VoteProgressBar
            votesCount={gameState.votesCount}
            totalVotesExpected={gameState.totalVotesExpected}
          />
        </div>
      </div>
    );
  }

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
  const canRevealAction = myCharacter?.actionCard && !me?.actionCardRevealed;

  // Admin helpers
  const alivePlayers = gameState.players.filter((p) => p.alive);

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
    } else if (adminAction === "deleteAttr") {
      const players = Array.from(adminPlayers);
      const types = Array.from(adminAttrTypes);
      if (players.length > 0 && types.length > 0) {
        for (const pid of players) {
          for (const t of types) {
            if (t !== "action") adminDeleteAttribute(pid, t);
          }
        }
      }
    } else if (adminAction === "forceReveal") {
      if (adminAttrType !== "action") {
        adminForceRevealType(adminAttrType as AttributeType);
      }
    } else if (adminAction === "removeBunker") {
      if (adminBunkerCardIndex !== null) {
        adminRemoveBunkerCard(adminBunkerCardIndex);
      }
    } else if (adminAction === "replaceBunker") {
      if (adminBunkerCardIndex !== null) {
        adminReplaceBunkerCard(adminBunkerCardIndex);
      }
    }
    setAdminAction(null);
    setAdminPlayer1("");
    setAdminPlayer2("");
    setAdminPlayers(new Set());
    setAdminAttrTypes(new Set());
    setAdminBunkerCardIndex(null);
  };

  const handleVote = (targetId: string) => {
    if (adminPauseActiveRef.current) return;
    setConfirmTarget(targetId);
  };

  const confirmVote = () => {
    if (!confirmTarget || adminPauseActiveRef.current) return;

    castVote(confirmTarget);
    setVoted(true);
    setConfirmTarget(null);
  };

  return (
    <div className="screen vote-screen">
      {/* Sticky top bar */}
      <div className="sticky-top-bar vote-top-bar">
        <div className="top-bar-content">
          <div className="top-bar-left">
            <span className="top-bar-phase">
              {!canVote || voted
                ? isTiebreak
                  ? "Переголосование"
                  : "Голосование"
                : isTiebreak
                  ? "Переголосование"
                  : "Кого изгнать?"}
            </span>
            <span className="top-bar-desc">
              {!canVote
                ? "Вы изгнаны"
                : voted
                  ? "Голос принят"
                  : isTiebreak
                    ? "Ничья! Выберите одного из кандидатов"
                    : "Выберите игрока для изгнания"}
            </span>
          </div>
          <div className="top-bar-right">
            <Timer endTime={gameState.phaseEndTime} size="large" />
          </div>
        </div>
      </div>

      {isCurrentHost && (
        <ReconnectHostBanner
          players={gameState.players}
          claimsCount={hostSeatClaims.length}
          onOpen={openAdminPanel}
        />
      )}

      <div className="vote-container">
        {!canVote ? (
          <>
            <div className="vote-waiting-card">
              <p>Вы были изгнаны и не можете голосовать</p>
            </div>
            <VoteProgressBar
              votesCount={gameState.votesCount}
              totalVotesExpected={gameState.totalVotesExpected}
            />
          </>
        ) : voted ? (
          <>
            <div className="vote-waiting-card vote-accepted">
              <p>Ваш голос принят! Ожидаем остальных...</p>
              {isLastEliminated && !me?.alive && (
                <p className="last-elim-note">Вы голосуете как последний изгнанный</p>
              )}
            </div>
            <VoteProgressBar
              votesCount={gameState.votesCount}
              totalVotesExpected={gameState.totalVotesExpected}
            />
          </>
        ) : (
          <>
            {isLastEliminated && !me?.alive && (
              <div className="last-elim-banner">
                Вы голосуете как последний изгнанный — от лица всех изгнанных
              </div>
            )}

            <div className="vote-candidates">
              {candidates.map((player) => {
                const playerNumber = gameState.players.findIndex((p) => p.id === player.id) + 1;
                return (
                  <div
                    key={player.id}
                    className="vote-candidate"
                    onClick={() => handleVote(player.id)}
                  >
                    <div className="candidate-info">
                      <span className="candidate-name">
                        <span className="player-number">{playerNumber}</span>
                        {player.isBot && <span className="bot-badge">BOT</span>}
                        {player.name}
                      </span>
                      <div className="candidate-attrs">
                        {player.revealedAttributes.map((attr, i) => (
                          <span key={i} className="mini-tag" data-attr-type={attr.type}>
                            <span className="mini-tag-label">{attr.label}:</span> {attr.value}
                          </span>
                        ))}
                        {player.actionCard && (
                          <span className="mini-tag" data-attr-type="action">
                            <span className="mini-tag-label">Особое условие:</span>{" "}
                            {player.actionCard.title}
                          </span>
                        )}
                      </div>
                    </div>
                    <button className="btn btn-vote">Изгнать</button>
                  </div>
                );
              })}
            </div>

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

            <div className="vote-progress-bar">
              <div className="vote-progress-label">
                Проголосовало: {gameState.votesCount} / {gameState.totalVotesExpected}
              </div>
              <div className="vote-progress-track">
                <div
                  className="vote-progress-fill"
                  style={{
                    width: `${(gameState.votesCount / gameState.totalVotesExpected) * 100}%`,
                  }}
                />
              </div>
            </div>

            {canRevealAction && (
              <button
                className="btn btn-reveal-action"
                onClick={() => setConfirmRevealAction(true)}
              >
                Раскрыть особое условие
              </button>
            )}
          </>
        )}
      </div>

      {error && <div className="error-toast">{error}</div>}

      {/* Host Admin Panel */}
      {isCurrentHost && (
        <div className={`admin-panel vote-admin-panel${adminOpen ? " is-open" : ""}`}>
          <button
            className="btn btn-admin-toggle"
            onClick={adminOpen ? closeAdminPanel : openAdminPanel}
          >
            {adminOpen ? "Скрыть админ-панель" : "Админ-панель"}
          </button>

          {adminOpen && (
            <div className="admin-panel-body">
              <ReconnectHostControls
                players={gameState.players}
                claims={hostSeatClaims}
                onResolveClaim={resolveSeatClaim}
                onKickPlayer={kickPlayer}
                onTransferHost={transferHost}
              />
              {!adminAction && (
                <div className="admin-actions-list">
                  <label className="admin-group-label">Карты игроков</label>
                  <button className="btn btn-admin" onClick={() => setAdminAction("shuffle")}>
                    Перемешать
                  </button>
                  <button className="btn btn-admin" onClick={() => setAdminAction("swap")}>
                    Поменять местами
                  </button>
                  <button className="btn btn-admin" onClick={() => setAdminAction("replace")}>
                    Заменить
                  </button>
                  <button className="btn btn-admin" onClick={() => setAdminAction("deleteAttr")}>
                    Удалить
                  </button>
                  <button className="btn btn-admin" onClick={() => setAdminAction("forceReveal")}>
                    Раскрыть у всех
                  </button>
                  <label className="admin-group-label">Карты бункера</label>
                  <button className="btn btn-admin" onClick={() => setAdminAction("removeBunker")}>
                    Убрать карту
                  </button>
                  <button className="btn btn-admin" onClick={() => setAdminAction("replaceBunker")}>
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
                    {adminAction === "deleteAttr" && "Удалить карту"}
                    {adminAction === "forceReveal" && "Раскрыть у всех"}
                    {adminAction === "removeBunker" && "Убрать карту бункера"}
                    {adminAction === "replaceBunker" && "Заменить карту бункера"}
                  </h4>

                  {adminAction === "removeBunker" || adminAction === "replaceBunker" ? (
                    <>
                      <label>Карта бункера:</label>
                      <div className="admin-chips">
                        {gameState.revealedBunkerCards.map((card, i) => (
                          <button
                            key={i}
                            className={`admin-chip ${adminBunkerCardIndex === i ? "active" : ""}`}
                            onClick={() => setAdminBunkerCardIndex(i)}
                          >
                            {card.title}
                          </button>
                        ))}
                      </div>
                    </>
                  ) : adminAction === "forceReveal" ? (
                    <>
                      <label>Тип карты:</label>
                      <div className="admin-chips">
                        {ATTR_TYPES.filter((t) => t.type !== "action").map((t) => (
                          <button
                            key={t.type}
                            className={`admin-chip ${adminAttrType === t.type ? "active" : ""}`}
                            onClick={() => setAdminAttrType(t.type)}
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>
                    </>
                  ) : adminAction === "deleteAttr" ? (
                    <>
                      <label>Тип карты (можно несколько):</label>
                      <div className="admin-chips">
                        {ATTR_TYPES.filter((t) => t.type !== "action").map((t) => (
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
                  ) : adminAction === "replace" ? (
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
                          (adminPlayers.size === 0 || adminAttrTypes.size === 0)) ||
                        (adminAction === "deleteAttr" &&
                          (adminPlayers.size === 0 || adminAttrTypes.size === 0)) ||
                        ((adminAction === "removeBunker" || adminAction === "replaceBunker") &&
                          adminBunkerCardIndex === null)
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
                        setAdminBunkerCardIndex(null);
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

      {confirmRevealAction && (
        <div className="modal-overlay" onClick={() => setConfirmRevealAction(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Раскрыть особое условие?</h3>
            <p>Это действие нельзя отменить. Все игроки увидят вашу карту.</p>
            <div className="modal-actions">
              <button
                className="btn btn-primary"
                onClick={() => {
                  revealActionCard();
                  setConfirmRevealAction(false);
                }}
              >
                Раскрыть
              </button>
              <button className="btn btn-secondary" onClick={() => setConfirmRevealAction(false)}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
