import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { FiSettings } from "react-icons/fi";
import { VoteProgressBar } from "../components/VoteProgressBar";
import { useGame } from "../context/GameContext";
import "../styles/game-screen.css";
import { AccessibleModal } from "./game/AccessibleModal";
import { Bunker2DLayout } from "../games/bunker/Bunker2DLayout";
import { GameViewToggle } from "../games/shared/GameViewToggle";
import { buildGameScreenViewModel } from "./game/gameScreenViewModel";
import { GameRoomHeader } from "./game/GameRoomHeader";
import { GameDockTools } from "./game/GameDockTools";
import { HostControlDialog } from "./game/HostControlDialog";
import { useTableActionDock } from "../games/shared/table3d/useTableActionDock";
import { useTableHotkeys } from "../games/shared/table3d/useTableHotkeys";

const BunkerTable3D = lazy(() => import("../games/bunker/BunkerTable3D"));

export function VoteScreen({
  is3D = false,
  onToggle3D = () => {},
}: {
  is3D?: boolean;
  onToggle3D?: () => void;
}) {
  const [cursorVisible, setCursorVisible] = useState(false);
  const {
    gameState,
    playerId,
    isSpectator,
    myCharacter,
    myHasVoted,
    connected,
    commandPending,
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
    assignTemporaryBot,
    kickPlayer,
    transferHost,
  } = useGame();
  const [confirmTarget, setConfirmTarget] = useState<string | null>(null);
  const screenRef = useTableActionDock(is3D && Boolean(gameState));
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [confirmRevealAction, setConfirmRevealAction] = useState(false);
  const [voteSubmitting, setVoteSubmitting] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const adminPauseActiveRef = useRef(false);
  const isCurrentHost =
    !isSpectator && Boolean(gameState?.players.find((player) => player.id === playerId)?.isHost);
  const hasLiveConnection = connected && reconnectState === "connected";
  const canUseRoomActions = hasLiveConnection && !commandPending;

  const openAdminPanel = useCallback(() => {
    if (!isCurrentHost || !canUseRoomActions || adminOpen || adminPauseActiveRef.current) return;

    setConfirmTarget(null);
    setConfirmRevealAction(false);
    adminPauseActiveRef.current = true;
    setAdminOpen(true);
    adminPause();
  }, [adminOpen, adminPause, canUseRoomActions, isCurrentHost]);

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
    setSelectedTarget(null);
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
    if (!isCurrentHost || !hasLiveConnection) {
      setAdminOpen(false);
      adminPauseActiveRef.current = false;
    }
  }, [hasLiveConnection, isCurrentHost]);

  useEffect(() => {
    if (!pendingAdminOpen) return;

    consumePendingAdminOpen();
    if (isCurrentHost && canUseRoomActions) openAdminPanel();
  }, [canUseRoomActions, consumePendingAdminOpen, isCurrentHost, openAdminPanel, pendingAdminOpen]);

  useTableHotkeys(
    is3D && Boolean(confirmTarget || confirmRevealAction || adminOpen),
    (code) => {
      if (code === "KeyE" && confirmTarget) setConfirmTarget(null);
      else if (code === "KeyF" && confirmRevealAction) setConfirmRevealAction(false);
      else if (code === "KeyH" && adminOpen) closeAdminPanel();
      else return false;
      return true;
    },
    true,
  );

  if (!gameState) return null;

  const me = isSpectator ? undefined : gameState.players.find((player) => player.id === playerId);
  const isTiebreak = gameState.phase === "ROUND_VOTE_TIEBREAK";

  if (isSpectator) {
    const spectatorTools = (
      <aside className="vote-command-bar is-tools-only" aria-label="Правила и эмоции">
        <GameDockTools gameId="bunker" />
      </aside>
    );
    return (
      <main
        ref={screenRef}
        className={`screen command-game-screen vote-screen has-vote-command-bar ${is3D ? "is-3d bunker3d-screen" : "game-2d bunker-2d"} ${is3D && !cursorVisible ? "is-looking" : ""}`}
      >
        <GameRoomHeader
          roomCode={roomCode}
          connected={connected}
          onLeaveRoom={leaveRoom}
          playerCount={!is3D ? gameState.players.length : undefined}
          tools={!is3D ? spectatorTools : undefined}
        >
          {!is3D && <GameViewToggle onOpen3D={onToggle3D} />}
        </GameRoomHeader>
        {is3D ? (
          <Suspense fallback={<div className="table3d-loading">Готовим комнату…</div>}>
            <BunkerTable3D onCursorChange={setCursorVisible} onClassic={onToggle3D} />
          </Suspense>
        ) : (
          <Bunker2DLayout
            gameState={gameState}
            playerId={null}
            character={null}
            phaseLabel={isTiebreak ? "Переголосование" : "Голосование"}
            phaseDescription="Вы наблюдаете за голосованием"
            progress={
              <VoteProgressBar
                votesCount={gameState.votesCount}
                totalVotesExpected={gameState.totalVotesExpected}
              />
            }
          />
        )}
        {is3D && spectatorTools}
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
    setSelectedTarget(targetId);
  };

  const confirmVote = () => {
    if (!confirmTarget || voteLocked) return;
    if (!castVote(confirmTarget)) return;
    setVoteSubmitting(true);
    setConfirmTarget(null);
  };

  const voteTools = (
    <aside className="vote-command-bar" aria-label="Действия голосования">
      <div className="vote-command-status" role="status" aria-live="polite">
        <small>{isTiebreak ? "Переголосование" : "Голосование"}</small>
        <strong>
          {selectedTarget
            ? `Выбран: ${gameState.players.find((player) => player.id === selectedTarget)?.name ?? "игрок"}`
            : voted
              ? "Ваш голос принят"
              : canVote
                ? "Выберите кандидата"
                : "Вы наблюдаете за голосованием"}
        </strong>
      </div>
      <div className="vote-command-actions">
        <GameDockTools gameId="bunker" />
        {is3D && canRevealAction && (
          <button
            type="button"
            className="btn btn-reveal-action"
            disabled={voteLocked}
            onClick={() => setConfirmRevealAction(true)}
          >
            Раскрыть особое условие
          </button>
        )}
        {isCurrentHost && hasLiveConnection && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={openAdminPanel}
            disabled={!canUseRoomActions}
            aria-label="Управление игрой"
            aria-haspopup="dialog"
            aria-expanded={adminOpen}
          >
            <FiSettings aria-hidden="true" />
            <span>
              Админ-панель{hostSeatClaims.length > 0 ? ` · ${hostSeatClaims.length}` : ""}
            </span>
          </button>
        )}
        {canVote && !voted && (
          <button
            type="button"
            className="btn btn-danger"
            disabled={!selectedTarget || voteLocked}
            onClick={() => setConfirmTarget(selectedTarget)}
          >
            Изгнать выбранного
          </button>
        )}
      </div>
    </aside>
  );

  return (
    <main
      ref={screenRef}
      className={`screen command-game-screen vote-screen has-vote-command-bar ${is3D ? "is-3d bunker3d-screen" : "game-2d bunker-2d"} ${is3D && !cursorVisible ? "is-looking" : ""}`}
    >
      <GameRoomHeader
        roomCode={roomCode}
        connected={connected}
        onLeaveRoom={leaveRoom}
        confirmActiveLeave
        playerCount={!is3D ? gameState.players.length : undefined}
        tools={!is3D ? voteTools : undefined}
      >
        {!is3D && <GameViewToggle onOpen3D={onToggle3D} />}
      </GameRoomHeader>

      {is3D ? (
        <Suspense fallback={<div className="table3d-loading">Готовим комнату…</div>}>
          <BunkerTable3D
            onCursorChange={setCursorVisible}
            onClassic={onToggle3D}
            onSpecial={
              canUseRoomActions && canRevealAction && !voteLocked
                ? () => setConfirmRevealAction(true)
                : undefined
            }
            onManage={isCurrentHost && canUseRoomActions ? openAdminPanel : undefined}
            vote={{
              candidates: candidates.map((player) => player.id),
              selectedId: selectedTarget,
              canVote: canUseRoomActions && canVote && !voted && !voteLocked,
              onSelect: handleVote,
              onConfirm: (id) => {
                if (
                  canUseRoomActions &&
                  canVote &&
                  !voted &&
                  !voteLocked &&
                  candidates.some((player) => player.id === id)
                )
                  setConfirmTarget(id);
              },
            }}
          />
        </Suspense>
      ) : (
        <Bunker2DLayout
          gameState={gameState}
          playerId={playerId}
          character={myCharacter}
          canRevealAction={Boolean(canUseRoomActions && canRevealAction && !voteLocked)}
          onRevealAction={() => setConfirmRevealAction(true)}
          revealedIndices={
            buildGameScreenViewModel({ gameState, playerId, isSpectator, myCharacter })
              .revealedIndices
          }
          phaseLabel={isTiebreak ? "Переголосование" : "Кого оставить за бортом?"}
          phaseDescription={
            !canVote
              ? "Вы наблюдаете за голосованием"
              : voted
                ? "Ваш голос принят · ждём остальных"
                : voteSubmitting
                  ? "Голос отправляется…"
                  : voteUnavailable
                    ? "Голосование приостановлено"
                    : isTiebreak
                      ? "Ничья · выберите одного из кандидатов"
                      : isLastEliminated && !me?.alive
                        ? "Вы голосуете как последний изгнанный"
                        : "Выберите кандидата и подтвердите голос"
          }
          voting={{
            candidateIds: candidates.map((player) => player.id),
            selectedId: selectedTarget,
            canSelect: canVote && !voted && !voteLocked,
            onSelect: handleVote,
            onConfirm: setConfirmTarget,
          }}
          progress={
            <VoteProgressBar
              votesCount={gameState.votesCount}
              totalVotesExpected={gameState.totalVotesExpected}
            />
          }
        />
      )}

      {is3D && voteTools}

      {error && <div className="error-toast">{error}</div>}

      {isCurrentHost && hasLiveConnection && (
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
          onAssignTemporaryBot={assignTemporaryBot}
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
