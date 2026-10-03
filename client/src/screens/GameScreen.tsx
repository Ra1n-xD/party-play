import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { BunkerAttributeIcon } from "../games/bunker/BunkerAttributeIcon";
import { useGame } from "../context/GameContext";
import "../styles/game-screen.css";
import { AccessibleModal } from "./game/AccessibleModal";
import { CharacterLoadingState } from "./game/CharacterLoadingState";
import { GameCommandBar } from "./game/GameCommandBar";
import { Bunker2DLayout } from "../games/bunker/Bunker2DLayout";
import { GameViewToggle } from "../games/shared/GameViewToggle";
import { GameRoomHeader } from "./game/GameRoomHeader";
import { HostControlDialog } from "./game/HostControlDialog";
import { buildGameScreenViewModel, isExpandedActionCardPublic } from "./game/gameScreenViewModel";

import { useTableHotkeys } from "../games/shared/table3d/useTableHotkeys";
import { useTableActionDock } from "../games/shared/table3d/useTableActionDock";
const BunkerTable3D = lazy(() => import("../games/bunker/BunkerTable3D"));

export function GameScreen({
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
    connected,
    commandPending,
    reconnectState,
    roomCode,
    revealAttribute,
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
    adminSkipDiscussion,
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
  const [showAttrPicker, setShowAttrPicker] = useState(false);
  const screenRef = useTableActionDock(is3D && Boolean(gameState));
  const [expandedPlayerId, setExpandedPlayerId] = useState<string | null>(null);
  const [confirmRevealAction, setConfirmRevealAction] = useState(false);
  const [hostControlsOpen, setHostControlsOpen] = useState(false);
  const hostPauseActiveRef = useRef(false);
  const isCurrentHost =
    !isSpectator && Boolean(gameState?.players.find((player) => player.id === playerId)?.isHost);
  const hasLiveConnection = connected && reconnectState === "connected";
  const canUseRoomActions = hasLiveConnection && !commandPending;

  const closeLocalModals = useCallback(() => {
    setShowAttrPicker(false);
    setExpandedPlayerId(null);
    setConfirmRevealAction(false);
  }, []);

  const openAttributePicker = useCallback(() => {
    if (!canUseRoomActions || hostControlsOpen || hostPauseActiveRef.current) return;
    closeLocalModals();
    setShowAttrPicker(true);
  }, [canUseRoomActions, closeLocalModals, hostControlsOpen]);

  const openExpandedPlayer = useCallback(
    (nextPlayerId: string) => {
      if (hostControlsOpen || hostPauseActiveRef.current) return;
      closeLocalModals();
      setExpandedPlayerId(nextPlayerId);
    },
    [closeLocalModals, hostControlsOpen],
  );

  const openRevealActionConfirmation = useCallback(() => {
    if (!canUseRoomActions || hostControlsOpen || hostPauseActiveRef.current) return;
    closeLocalModals();
    setConfirmRevealAction(true);
  }, [canUseRoomActions, closeLocalModals, hostControlsOpen]);

  const openHostControls = useCallback(() => {
    if (!isCurrentHost || !canUseRoomActions) return;
    if (hostControlsOpen || hostPauseActiveRef.current) return;
    closeLocalModals();
    hostPauseActiveRef.current = true;
    setHostControlsOpen(true);
    adminPause();
  }, [adminPause, canUseRoomActions, closeLocalModals, hostControlsOpen, isCurrentHost]);

  const closeHostControls = useCallback(() => {
    if (!hostControlsOpen && !hostPauseActiveRef.current) return;
    setHostControlsOpen(false);
    if (!hostPauseActiveRef.current) return;

    hostPauseActiveRef.current = false;
    adminUnpause();
  }, [adminUnpause, hostControlsOpen]);

  const endGameFromHostControls = useCallback(() => {
    if (hostPauseActiveRef.current) {
      hostPauseActiveRef.current = false;
      adminUnpause();
    }
    endGame();
  }, [adminUnpause, endGame]);

  useEffect(() => {
    if (!pendingAdminOpen) return;

    consumePendingAdminOpen();
    const isHost =
      !isSpectator && gameState?.players.find((player) => player.id === playerId)?.isHost;
    if (isHost) openHostControls();
  }, [
    consumePendingAdminOpen,
    gameState,
    isSpectator,
    openHostControls,
    pendingAdminOpen,
    playerId,
  ]);

  useEffect(() => {
    if (!isCurrentHost || !hasLiveConnection) {
      setHostControlsOpen(false);
      hostPauseActiveRef.current = false;
    }
  }, [hasLiveConnection, isCurrentHost]);

  useTableHotkeys(
    is3D && (showAttrPicker || confirmRevealAction || hostControlsOpen),
    (code) => {
      if (code === "KeyE" && showAttrPicker) closeLocalModals();
      else if (code === "KeyF" && confirmRevealAction) closeLocalModals();
      else if (code === "KeyH" && hostControlsOpen) closeHostControls();
      else return false;
      return true;
    },
    true,
  );

  useTableHotkeys(
    is3D && showAttrPicker && canUseRoomActions,
    (code) => {
      const index = ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6"].indexOf(code);
      if (index < 0 || !gameState || !myCharacter || gameState.paused) return false;
      const view = buildGameScreenViewModel({ gameState, playerId, isSpectator, myCharacter });
      if (view.canReveal && view.unrevealedIndices.includes(index)) {
        revealAttribute(index);
        closeLocalModals();
      }
      return true;
    },
    true,
  );

  if (!gameState) return null;
  if (!isSpectator && !myCharacter) {
    return <CharacterLoadingState error={error} />;
  }

  const view = buildGameScreenViewModel({ gameState, playerId, isSpectator, myCharacter });
  const managementAttentionCount =
    hostSeatClaims.length +
    gameState.players.filter((player) => !player.isBot && !player.connected && !player.kicked)
      .length;

  const handleReveal = (attributeIndex: number) => {
    revealAttribute(attributeIndex);
    closeLocalModals();
  };

  const commandBar = (
    <GameCommandBar
      currentTurnPlayer={view.currentTurnPlayer}
      isMyTurn={view.isMyTurn}
      phaseLabel={view.phaseLabel}
      phaseDescription={view.phaseDescription}
      canReveal={is3D && canUseRoomActions && view.canReveal}
      canRevealAction={is3D && canUseRoomActions && view.canRevealAction}
      canManageGame={canUseRoomActions && Boolean(view.me?.isHost)}
      canSkipDiscussion={canUseRoomActions && view.canSkipDiscussion}
      managementAttentionCount={managementAttentionCount}
      hostControlsOpen={hostControlsOpen}
      onReveal={() => {
        if (gameState.roundNumber === 1) {
          revealAttribute(0);
        } else {
          openAttributePicker();
        }
      }}
      onRevealAction={openRevealActionConfirmation}
      onOpenHostControls={openHostControls}
      onSkipDiscussion={adminSkipDiscussion}
    />
  );

  return (
    <main
      ref={screenRef}
      className={`screen command-game-screen has-game-command-bar ${is3D ? "is-3d bunker3d-screen" : "game-2d bunker-2d"} ${is3D && !cursorVisible ? "is-looking" : ""}`}
    >
      <GameRoomHeader
        roomCode={roomCode}
        connected={connected}
        onLeaveRoom={leaveRoom}
        confirmActiveLeave={!isSpectator}
        playerCount={!is3D ? gameState.players.length : undefined}
        tools={!is3D ? commandBar : undefined}
      >
        {!is3D && <GameViewToggle onOpen3D={onToggle3D} />}
      </GameRoomHeader>

      {is3D ? (
        <Suspense fallback={<div className="table3d-loading">Готовим комнату…</div>}>
          <BunkerTable3D
            onCursorChange={setCursorVisible}
            onClassic={onToggle3D}
            onReveal={
              canUseRoomActions && view.canReveal
                ? () => (gameState.roundNumber === 1 ? revealAttribute(0) : openAttributePicker())
                : undefined
            }
            onSpecial={
              canUseRoomActions && view.canRevealAction ? openRevealActionConfirmation : undefined
            }
            onManage={canUseRoomActions && view.me?.isHost ? openHostControls : undefined}
            onSkip={
              canUseRoomActions && view.me?.isHost && view.canSkipDiscussion
                ? adminSkipDiscussion
                : undefined
            }
          />
        </Suspense>
      ) : (
        <Bunker2DLayout
          gameState={gameState}
          playerId={playerId}
          character={isSpectator ? null : myCharacter}
          phaseLabel={view.phaseLabel}
          phaseDescription={
            isSpectator ? "Вы наблюдаете · " + view.phaseDescription : view.phaseDescription
          }
          revealedIndices={view.revealedIndices}
          canReveal={canUseRoomActions && view.canReveal}
          onReveal={handleReveal}
          canRevealAction={canUseRoomActions && view.canRevealAction}
          onRevealAction={openRevealActionConfirmation}
        />
      )}

      {is3D && commandBar}

      {isCurrentHost && hasLiveConnection && (
        <HostControlDialog
          open={hostControlsOpen}
          gameState={gameState}
          onClose={closeHostControls}
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

      {showAttrPicker && myCharacter && (
        <AccessibleModal labelledBy="gs-attribute-picker-title" onClose={closeLocalModals}>
          <h3 id="gs-attribute-picker-title">Выберите характеристику для раскрытия</h3>
          <p>Одна карта должна остаться закрытой до финала</p>
          <div className="target-list">
            {view.unrevealedIndices
              .filter(() => view.unrevealedIndices.length > 1)
              .map((index) => (
                <button
                  type="button"
                  key={index}
                  className="btn btn-target"
                  onClick={() => handleReveal(index)}
                >
                  {myCharacter.attributes[index].label}: {myCharacter.attributes[index].value}{" "}
                  {is3D && <kbd>{index + 1}</kbd>}
                </button>
              ))}
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={closeLocalModals}>
              Отмена
            </button>
          </div>
        </AccessibleModal>
      )}

      {expandedPlayerId &&
        (() => {
          const player = gameState.players.find((candidate) => candidate.id === expandedPlayerId);
          if (!player) return null;

          const isMe = !isSpectator && player.id === playerId;
          const attributes = isMe && myCharacter ? myCharacter.attributes : [];
          const playerNumber =
            gameState.players.findIndex((candidate) => candidate.id === player.id) + 1;

          return (
            <AccessibleModal
              labelledBy="gs-expanded-player-title"
              onClose={closeLocalModals}
              panelClassName="expanded-player-modal"
            >
              <button
                type="button"
                className="modal-close-btn"
                onClick={closeLocalModals}
                aria-label="Закрыть"
              >
                &times;
              </button>
              <div className="expanded-player-header">
                <span className="player-number">{playerNumber}</span>
                <h3 id="gs-expanded-player-title">
                  {player.isBot && <span className="bot-badge">BOT</span>}
                  {player.name}
                  {isMe && <span className="me-badge">ВЫ</span>}
                </h3>
                {!player.alive && (
                  <span className="eliminated-badge">
                    {player.kicked ? "УДАЛЁН АДМИНИСТРАТОРОМ" : "ИЗГНАН"}
                  </span>
                )}
              </div>
              <div className="attributes-grid">
                {isMe ? (
                  attributes.map((attribute, index) => {
                    const isRevealed = view.revealedIndices.has(index);

                    return (
                      <div
                        key={index}
                        className={`attribute-card ${isRevealed ? "revealed" : "hidden"}`}
                        data-attr-type={attribute.type}
                      >
                        <div className="attr-content">
                          <BunkerAttributeIcon type={attribute.type} className="attr-card-image" />
                          <div className="attr-text">
                            <span className="attr-label">{attribute.label}</span>
                            <span className="attr-value">{attribute.value}</span>
                            {attribute.detail && (
                              <span className="attr-detail">{attribute.detail}</span>
                            )}
                          </div>
                        </div>
                        {!isRevealed && <span className="attr-status">Скрыто</span>}
                      </div>
                    );
                  })
                ) : player.revealedAttributes.length === 0 ? (
                  <p className="no-attrs">Пока ничего не раскрыто</p>
                ) : (
                  player.revealedAttributes.map((attribute, index) => (
                    <div
                      key={index}
                      className="attribute-card revealed"
                      data-attr-type={attribute.type}
                    >
                      <div className="attr-content">
                        <BunkerAttributeIcon type={attribute.type} className="attr-card-image" />
                        <div className="attr-text">
                          <span className="attr-label">{attribute.label}</span>
                          <span className="attr-value">{attribute.value}</span>
                          {attribute.detail && (
                            <span className="attr-detail">{attribute.detail}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
              {((isMe && myCharacter?.actionCard) || (!isMe && player.actionCard)) &&
                (() => {
                  const actionCard =
                    isMe && myCharacter ? myCharacter.actionCard : player.actionCard;
                  if (!actionCard) return null;
                  const isActionCardPublic = isExpandedActionCardPublic(
                    isMe,
                    Boolean(view.me?.actionCardRevealed),
                  );

                  return (
                    <div className="action-card-display">
                      <div
                        className={`attribute-card ${isActionCardPublic ? "revealed" : "hidden"}`}
                        data-attr-type="action"
                      >
                        <div className="attr-content">
                          <BunkerAttributeIcon type="action" className="attr-card-image" />
                          <div className="attr-text">
                            <span className="attr-label">Особое условие</span>
                            <span className="attr-value">{actionCard.title}</span>
                            <span className="attr-detail">{actionCard.description}</span>
                          </div>
                        </div>
                        {isMe && (
                          <span className="attr-status">
                            {isActionCardPublic ? "Раскрыто всем" : "Не раскрыто"}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })()}
            </AccessibleModal>
          );
        })()}

      {confirmRevealAction && (
        <AccessibleModal labelledBy="gs-action-reveal-title" onClose={closeLocalModals}>
          <h3 id="gs-action-reveal-title">Раскрыть особое условие?</h3>
          <p>Это действие нельзя отменить. Все игроки увидят вашу карту.</p>
          <div className="modal-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                revealActionCard();
                closeLocalModals();
              }}
            >
              Раскрыть
            </button>
            <button type="button" className="btn btn-secondary" onClick={closeLocalModals}>
              Отмена
            </button>
          </div>
        </AccessibleModal>
      )}

      {error && (
        <div className="error-toast" role="alert">
          {error}
        </div>
      )}
    </main>
  );
}
