import { useCallback, useEffect, useRef, useState } from "react";
import { Timer } from "../components/Timer";
import { VoteProgressBar } from "../components/VoteProgressBar";
import { useGame } from "../context/GameContext";
import "../styles/game-screen.css";
import { AccessibleModal } from "./game/AccessibleModal";
import { GameRoomHeader } from "./game/GameRoomHeader";
import { HostControlDialog } from "./game/HostControlDialog";
import { ReconnectHostBanner } from "./game/ReconnectHostControls";

export function VoteScreen() {
  const {
    gameState,
    playerId,
    isSpectator,
    myCharacter,
    myHasVoted,
    connected,
    roomCode,
    reconnectState,
    castVote,
    revealActionCard,
    endGame,
    leaveRoom,
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
    adminRevivePlayer,
    adminEliminatePlayer,
    pendingAdminOpen,
    consumePendingAdminOpen,
    hostSeatClaims,
    resolveSeatClaim,
    kickPlayer,
    transferHost,
  } = useGame();
  const [confirmTarget, setConfirmTarget] = useState<string | null>(null);
  const [confirmRevealAction, setConfirmRevealAction] = useState(false);
  const [voteSubmitting, setVoteSubmitting] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const adminPauseActiveRef = useRef(false);
  const isCurrentHost =
    !isSpectator && Boolean(gameState?.players.find((player) => player.id === playerId)?.isHost);

  const openAdminPanel = useCallback(() => {
    if (!isCurrentHost || adminOpen || adminPauseActiveRef.current) return;

    setConfirmTarget(null);
    setConfirmRevealAction(false);
    adminPauseActiveRef.current = true;
    setAdminOpen(true);
    adminPause();
  }, [adminOpen, adminPause, isCurrentHost]);

  const closeAdminPanel = useCallback(() => {
    setAdminOpen(false);
    if (!adminPauseActiveRef.current) return;

    adminPauseActiveRef.current = false;
    adminUnpause();
  }, [adminUnpause]);

  const endGameFromHostControls = useCallback(() => {
    setAdminOpen(false);
    if (adminPauseActiveRef.current) {
      adminPauseActiveRef.current = false;
      adminUnpause();
    }
    endGame();
  }, [adminUnpause, endGame]);

  useEffect(() => {
    setConfirmTarget(null);
    setConfirmRevealAction(false);
    setVoteSubmitting(false);
  }, [gameState?.phase]);

  useEffect(() => {
    if (myHasVoted || error || !connected || reconnectState !== "connected") {
      setVoteSubmitting(false);
    }
  }, [connected, error, myHasVoted, reconnectState]);

  useEffect(() => {
    return () => {
      if (!adminPauseActiveRef.current) return;

      adminPauseActiveRef.current = false;
      adminUnpause();
    };
  }, [adminUnpause]);

  useEffect(() => {
    if (!isCurrentHost) {
      setAdminOpen(false);
      adminPauseActiveRef.current = false;
    }
  }, [isCurrentHost]);

  useEffect(() => {
    if (!pendingAdminOpen) return;

    consumePendingAdminOpen();
    if (isCurrentHost) openAdminPanel();
  }, [consumePendingAdminOpen, isCurrentHost, openAdminPanel, pendingAdminOpen]);

  if (!gameState) return null;

  const me = isSpectator ? undefined : gameState.players.find((player) => player.id === playerId);
  const isTiebreak = gameState.phase === "ROUND_VOTE_TIEBREAK";

  if (isSpectator) {
    return (
      <main className="screen command-game-screen vote-screen">
        <GameRoomHeader
          roomCode={roomCode}
          connected={connected}
          canManageGame={false}
          canSkipDiscussion={false}
          onOpenHostControls={() => undefined}
          onSkipDiscussion={() => undefined}
          onLeaveRoom={leaveRoom}
        />
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
      </main>
    );
  }

  let candidates = gameState.players.filter((player) => player.alive && player.id !== playerId);
  if (isTiebreak && gameState.tiebreakCandidateIds) {
    candidates = gameState.players.filter(
      (player) => gameState.tiebreakCandidateIds!.includes(player.id) && player.id !== playerId,
    );
  }

  const isLastEliminated = playerId === gameState.lastEliminatedPlayerId;
  const canVote = Boolean(me?.alive || isLastEliminated);
  const voted = myHasVoted;
  const voteUnavailable =
    !connected || reconnectState !== "connected" || gameState.paused || adminPauseActiveRef.current;
  const voteLocked = voteUnavailable || voteSubmitting;
  const canRevealAction = myCharacter?.actionCard && !me?.actionCardRevealed;

  const handleVote = (targetId: string) => {
    if (!canVote || voted || voteLocked) return;
    setConfirmTarget(targetId);
  };

  const confirmVote = () => {
    if (!confirmTarget || voteLocked) return;
    if (!castVote(confirmTarget)) return;
    setVoteSubmitting(true);
    setConfirmTarget(null);
  };

  return (
    <main className="screen command-game-screen vote-screen">
      <GameRoomHeader
        roomCode={roomCode}
        connected={connected}
        canManageGame={isCurrentHost}
        canSkipDiscussion={false}
        onOpenHostControls={openAdminPanel}
        onSkipDiscussion={() => undefined}
        onLeaveRoom={leaveRoom}
        confirmActiveLeave
      />

      {isCurrentHost && (
        <ReconnectHostBanner
          players={gameState.players}
          claimsCount={hostSeatClaims.length}
          onOpen={openAdminPanel}
        />
      )}

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
                  : voteSubmitting
                    ? "Голос отправляется…"
                    : voteUnavailable
                      ? "Голосование приостановлено до восстановления связи"
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
                const playerNumber =
                  gameState.players.findIndex((candidate) => candidate.id === player.id) + 1;
                return (
                  <div key={player.id} className="vote-candidate">
                    <div className="candidate-info">
                      <span className="candidate-name">
                        <span className="player-number">{playerNumber}</span>
                        {player.isBot && <span className="bot-badge">BOT</span>}
                        {player.name}
                      </span>
                      <div className="candidate-attrs">
                        {player.revealedAttributes.map((attribute, index) => (
                          <span key={index} className="mini-tag" data-attr-type={attribute.type}>
                            <span className="mini-tag-label">{attribute.label}:</span>{" "}
                            {attribute.value}
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
                    <button
                      type="button"
                      className="btn btn-vote"
                      disabled={voteLocked}
                      onClick={() => handleVote(player.id)}
                    >
                      Изгнать
                    </button>
                  </div>
                );
              })}
            </div>

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
                type="button"
                className="btn btn-reveal-action"
                disabled={voteLocked}
                onClick={() => setConfirmRevealAction(true)}
              >
                Раскрыть особое условие
              </button>
            )}
          </>
        )}
      </div>

      {error && <div className="error-toast">{error}</div>}

      {isCurrentHost && (
        <HostControlDialog
          open={adminOpen}
          gameState={gameState}
          onClose={closeAdminPanel}
          onShuffleAll={adminShuffleAll}
          onSwapAttribute={adminSwapAttribute}
          onReplaceAttribute={adminReplaceAttribute}
          onDeleteAttribute={adminDeleteAttribute}
          onForceRevealType={adminForceRevealType}
          onRemoveBunkerCard={adminRemoveBunkerCard}
          onReplaceBunkerCard={adminReplaceBunkerCard}
          onRevivePlayer={adminRevivePlayer}
          onEliminatePlayer={adminEliminatePlayer}
          onEndGame={endGameFromHostControls}
          seatClaims={hostSeatClaims}
          onResolveSeatClaim={resolveSeatClaim}
          onKickPlayer={kickPlayer}
          onTransferHost={transferHost}
        />
      )}

      {confirmTarget && (
        <AccessibleModal labelledBy="vote-confirm-title" onClose={() => setConfirmTarget(null)}>
          <h3 id="vote-confirm-title">Подтвердите голос</h3>
          <p>
            Вы уверены, что хотите изгнать{" "}
            <strong>{gameState.players.find((player) => player.id === confirmTarget)?.name}</strong>
            ?
          </p>
          <div className="modal-actions">
            <button type="button" className="btn btn-danger" onClick={confirmVote}>
              Изгнать
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setConfirmTarget(null)}
            >
              Отмена
            </button>
          </div>
        </AccessibleModal>
      )}

      {confirmRevealAction && (
        <AccessibleModal
          labelledBy="vote-reveal-action-title"
          onClose={() => setConfirmRevealAction(false)}
        >
          <h3 id="vote-reveal-action-title">Раскрыть особое условие?</h3>
          <p>Это действие нельзя отменить. Все игроки увидят вашу карту.</p>
          <div className="modal-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                revealActionCard();
                setConfirmRevealAction(false);
              }}
            >
              Раскрыть
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setConfirmRevealAction(false)}
            >
              Отмена
            </button>
          </div>
        </AccessibleModal>
      )}
    </main>
  );
}
