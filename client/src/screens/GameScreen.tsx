import { useCallback, useEffect, useRef, useState } from "react";
import { CardImage } from "../components/CardImage";
import { useGame } from "../context/GameContext";
import "../styles/game-screen.css";
import { AccessibleModal } from "./game/AccessibleModal";
import { CharacterLoadingState } from "./game/CharacterLoadingState";
import { CharacterDossier } from "./game/CharacterDossier";
import { GameStatusHeader } from "./game/GameStatusHeader";
import { GameRoomHeader } from "./game/GameRoomHeader";
import { HostControlDialog } from "./game/HostControlDialog";
import { ReconnectHostBanner } from "./game/ReconnectHostControls";
import { MobileGameTabs } from "./game/MobileGameTabs";
import { PlayerBoard } from "./game/PlayerBoard";
import { ScenarioSummary } from "./game/ScenarioSummary";
import {
  buildGameScreenViewModel,
  isExpandedActionCardPublic,
  type MobileGameTab,
} from "./game/gameScreenViewModel";

export function GameScreen() {
  const {
    gameState,
    playerId,
    isSpectator,
    myCharacter,
    connected,
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
    kickPlayer,
    transferHost,
  } = useGame();
  const [showAttrPicker, setShowAttrPicker] = useState(false);
  const [expandedPlayerId, setExpandedPlayerId] = useState<string | null>(null);
  const [confirmRevealAction, setConfirmRevealAction] = useState(false);
  const [activeMobileTab, setActiveMobileTab] = useState<MobileGameTab>("players");
  const [hostControlsOpen, setHostControlsOpen] = useState(false);
  const hostPauseActiveRef = useRef(false);
  const isCurrentHost =
    !isSpectator && Boolean(gameState?.players.find((player) => player.id === playerId)?.isHost);

  const closeLocalModals = useCallback(() => {
    setShowAttrPicker(false);
    setExpandedPlayerId(null);
    setConfirmRevealAction(false);
  }, []);

  const openAttributePicker = useCallback(() => {
    if (hostControlsOpen || hostPauseActiveRef.current) return;
    closeLocalModals();
    setShowAttrPicker(true);
  }, [closeLocalModals, hostControlsOpen]);

  const openExpandedPlayer = useCallback(
    (nextPlayerId: string) => {
      if (hostControlsOpen || hostPauseActiveRef.current) return;
      closeLocalModals();
      setExpandedPlayerId(nextPlayerId);
    },
    [closeLocalModals, hostControlsOpen],
  );

  const openRevealActionConfirmation = useCallback(() => {
    if (hostControlsOpen || hostPauseActiveRef.current) return;
    closeLocalModals();
    setConfirmRevealAction(true);
  }, [closeLocalModals, hostControlsOpen]);

  const openHostControls = useCallback(() => {
    if (!isCurrentHost) return;
    if (hostControlsOpen || hostPauseActiveRef.current) return;
    closeLocalModals();
    hostPauseActiveRef.current = true;
    setHostControlsOpen(true);
    adminPause();
  }, [adminPause, closeLocalModals, hostControlsOpen, isCurrentHost]);

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
    if (!isCurrentHost) {
      setHostControlsOpen(false);
      hostPauseActiveRef.current = false;
    }
  }, [isCurrentHost]);

  if (!gameState) return null;
  if (!isSpectator && !myCharacter) {
    return <CharacterLoadingState error={error} />;
  }

  const view = buildGameScreenViewModel({ gameState, playerId, isSpectator, myCharacter });

  const handleReveal = (attributeIndex: number) => {
    revealAttribute(attributeIndex);
    closeLocalModals();
  };

  const playerBoard = (
    <PlayerBoard
      players={gameState.players}
      playerId={playerId}
      currentTurnPlayerId={gameState.currentTurnPlayerId}
      lastEliminatedPlayerId={gameState.lastEliminatedPlayerId}
      onSelectPlayer={openExpandedPlayer}
    />
  );

  const characterDossier =
    !isSpectator && myCharacter ? (
      <CharacterDossier
        character={myCharacter}
        revealedIndices={view.revealedIndices}
        alive={view.me?.alive ?? false}
        actionCardRevealed={view.me?.actionCardRevealed ?? false}
      />
    ) : null;

  return (
    <main
      className={`screen command-game-screen ${view.hasBottomAction ? "has-game-actions" : ""}`}
    >
      <GameRoomHeader
        roomCode={roomCode}
        connected={connected}
        canManageGame={Boolean(view.me?.isHost)}
        canSkipDiscussion={gameState.phase === "ROUND_DISCUSSION"}
        onOpenHostControls={openHostControls}
        onSkipDiscussion={adminSkipDiscussion}
        onLeaveRoom={leaveRoom}
        confirmActiveLeave={!isSpectator}
      />
      {isCurrentHost && (
        <ReconnectHostBanner
          players={gameState.players}
          claimsCount={hostSeatClaims.length}
          onOpen={openHostControls}
        />
      )}
      <GameStatusHeader
        gameState={gameState}
        phaseLabel={view.phaseLabel}
        phaseDescription={view.phaseDescription}
        isMyTurn={view.isMyTurn}
      />

      {isSpectator && (
        <div className="gs-spectator-status" role="status">
          Режим наблюдателя
        </div>
      )}

      <div className="gs-desktop-layout">
        <div className="gs-workspace">
          {playerBoard}
          {characterDossier && <div className="gs-dossier-column">{characterDossier}</div>}
        </div>
      </div>

      <div className="gs-mobile-layout">
        <MobileGameTabs
          activeTab={activeMobileTab}
          showCharacter={!isSpectator}
          onChange={setActiveMobileTab}
          players={playerBoard}
          character={characterDossier}
          situation={
            <ScenarioSummary
              idPrefix="gs-scenario-mobile"
              gameState={gameState}
              expanded
              alwaysExpanded
              onToggle={() => undefined}
            />
          }
        />
      </div>

      {view.hasBottomAction && (
        <div className="gs-action-bar" aria-label="Игровые действия">
          {view.canRevealAction && (
            <button
              type="button"
              className="btn btn-reveal-action btn-bottom-action"
              onClick={openRevealActionConfirmation}
            >
              Раскрыть особое условие
            </button>
          )}
          {view.canReveal && (
            <button
              type="button"
              className="btn btn-primary btn-reveal btn-bottom-action"
              onClick={() => {
                if (gameState.roundNumber === 1) {
                  revealAttribute(0);
                } else {
                  openAttributePicker();
                }
              }}
            >
              Раскрыть характеристику
            </button>
          )}
        </div>
      )}

      {isCurrentHost && (
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
                  {myCharacter.attributes[index].label}: {myCharacter.attributes[index].value}
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
                {!player.alive && <span className="eliminated-badge">ИЗГНАН</span>}
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
                          <CardImage type={attribute.type} className="attr-card-image" />
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
                        <CardImage type={attribute.type} className="attr-card-image" />
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
                          <CardImage type="action" className="attr-card-image" />
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
