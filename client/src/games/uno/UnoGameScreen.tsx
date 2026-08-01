import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { FiSettings } from "react-icons/fi";
import type {
  UnoCard as UnoCardData,
  UnoColor,
  UnoPlayerPublicState,
  UnoVisualAction,
} from "../../../../shared/games/uno/types";
import type { CardTransferVisualEvent } from "../../../../shared/platform/cardVisualEvents";
import type { RoomSnapshot } from "../../../../shared/platform/room";
import { AccessibleModal } from "../../platform/components/AccessibleModal";
import {
  ReconnectHostControls,
  type RecoverySeat,
} from "../../platform/components/ReconnectHostControls";
import { usePlatform } from "../../platform/context/PlatformContext";
import { GameRoomHeader } from "../../screens/game/GameRoomHeader";
import { GameDockTools } from "../../screens/game/GameDockTools";
import { CardDragLayer } from "../shared/CardDragLayer";
import { CardPlayerSeat } from "../shared/CardPlayerSeat";
import { HandSortButton, type HandSortMode } from "../shared/HandSortButton";
import { useCardDrag } from "../shared/useCardDrag";
import { useCardTransferMotion } from "../shared/useCardTransferMotion";
import { usePlayerActionIndicators } from "../shared/usePlayerActionIndicators";
import { useTableCardFlight } from "../shared/useTableCardFlight";
import { UnoCard, UnoCardBack, getUnoCardName } from "./components/UnoCard";
import { UnoColorDialog } from "./components/UnoColorDialog";

interface UnoGameScreenProps {
  snapshot: RoomSnapshot<"uno">;
  animateInitialDeal?: boolean;
}

type ColorChoice = { mode: "initial" } | { mode: "wild"; cardId: string };

interface UnoDragPayload {
  card: UnoCardData;
}

const COLOR_LABELS: Record<UnoColor, string> = {
  red: "красный",
  yellow: "жёлтый",
  green: "зелёный",
  blue: "синий",
};

const UNO_ACTION_LABELS: Record<UnoVisualAction, string> = {
  "play-card": "Ходит картой",
  "draw-card": "Берёт карту",
  "end-turn": "Завершает ход",
  "choose-color": "Выбирает цвет",
  "accept-draw-four": "Принимает +4",
  "challenge-draw-four": "Оспаривает +4",
  "declare-uno": "UNO!",
  "catch-uno": "Поймал UNO",
};

const UNO_COLOR_ORDER: Record<UnoColor, number> = {
  red: 0,
  yellow: 1,
  green: 2,
  blue: 3,
};

const UNO_KIND_ORDER: Record<UnoCardData["kind"], number> = {
  number: 0,
  skip: 10,
  reverse: 11,
  "draw-two": 12,
  wild: 13,
  "wild-draw-four": 14,
};

function compareUnoHandCards(first: UnoCardData, second: UnoCardData, mode: HandSortMode): number {
  const firstColor = first.color === null ? 4 : UNO_COLOR_ORDER[first.color];
  const secondColor = second.color === null ? 4 : UNO_COLOR_ORDER[second.color];
  const colorDifference = firstColor - secondColor;
  const firstRank = first.kind === "number" ? first.number : UNO_KIND_ORDER[first.kind];
  const secondRank = second.kind === "number" ? second.number : UNO_KIND_ORDER[second.kind];
  const rankDifference = firstRank - secondRank;

  return mode === "suit"
    ? colorDifference || rankDifference || first.id.localeCompare(second.id)
    : rankDifference || colorDifference || first.id.localeCompare(second.id);
}

function formatCardCount(count: number): string {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return `${count} карт`;
  if (mod10 === 1) return `${count} карта`;
  if (mod10 >= 2 && mod10 <= 4) return `${count} карты`;
  return `${count} карт`;
}

export function UnoGameScreen({ snapshot, animateInitialDeal = false }: UnoGameScreenProps) {
  const {
    connected,
    reconnectState,
    commandPending,
    error,
    hostSeatClaims,
    leaveRoom,
    sendGameCommand,
    resolveSeatClaim,
    assignTemporaryBot,
    returnHumanControl,
    kickPlayer,
    transferHost,
    setAdminPause,
  } = usePlatform();
  const game = snapshot.game;
  const [colorChoice, setColorChoice] = useState<ColorChoice | null>(null);
  const [declareWithPlay, setDeclareWithPlay] = useState(false);
  const [handSortMode, setHandSortMode] = useState<HandSortMode>("suit");
  const [managementOpen, setManagementOpen] = useState(false);
  const adminPauseActiveRef = useRef(false);

  const viewerSeatId = snapshot.viewer.role === "player" ? snapshot.viewer.seatId : null;
  const viewerSeat = viewerSeatId
    ? snapshot.seats.find((seat) => seat.seatId === viewerSeatId)
    : null;
  const isHost = viewerSeat?.isHost ?? false;
  const privateGame = snapshot.viewer.role === "player" ? snapshot.viewer.privateGame : null;
  const legalActions = privateGame?.legalActions;
  const paused = snapshot.pause.active || game?.paused === true;
  const canUseConnection =
    connected && reconnectState === "connected" && viewerSeat?.controllerKind === "human";
  const canAct = Boolean(privateGame && canUseConnection && !paused && !commandPending);
  const displayedHand = useMemo(
    () =>
      privateGame
        ? [...privateGame.hand].sort((first, second) =>
            compareUnoHandCards(first, second, handSortMode),
          )
        : [],
    [handSortMode, privateGame],
  );
  const playableCardIds = useMemo(
    () => new Set(legalActions?.playableCardIds ?? []),
    [legalActions?.playableCardIds],
  );
  const bluffableWildDrawFourIds = useMemo(
    () => new Set(legalActions?.bluffableWildDrawFourCardIds ?? []),
    [legalActions?.bluffableWildDrawFourCardIds],
  );
  const tableFlights = useMemo(
    () =>
      game?.topDiscard && game.lastPlayedBySeatId
        ? [
            {
              key: `discard:${game.topDiscard.id}`,
              sourceSeatId: game.lastPlayedBySeatId,
              targetId: `uno-discard-flight:${game.topDiscard.id}`,
            },
          ]
        : [],
    [game?.lastPlayedBySeatId, game?.topDiscard?.id],
  );
  const transferEvents = useMemo<CardTransferVisualEvent[]>(
    () => [
      ...(animateInitialDeal && game
        ? game.players.map((player, index) => ({
            id: -(index + 1),
            type: "transfer" as const,
            source: { kind: "deck" as const },
            target: { kind: "player" as const, seatId: player.seatId },
            cardCount: 7,
          }))
        : []),
      ...(game?.visualEvents.filter((event) => event.type === "transfer") ?? []),
    ],
    [animateInitialDeal, game],
  );
  const actionEvents = useMemo(
    () => game?.visualEvents.filter((event) => event.type === "action") ?? [],
    [game?.visualEvents],
  );

  useTableCardFlight({ revision: snapshot.revision, flights: tableFlights });
  useCardTransferMotion({
    gameId: "uno",
    revision: snapshot.revision,
    events: transferEvents,
    animateInitial: animateInitialDeal,
  });
  const actionIndicators = usePlayerActionIndicators(actionEvents, UNO_ACTION_LABELS);
  const canOfferAtomicUnoIntent = Boolean(
    privateGame &&
    privateGame.hand.length === 2 &&
    game?.turnKind === "normal" &&
    !game.pendingWildDrawFour &&
    (legalActions?.playableCardIds.length || legalActions?.bluffableWildDrawFourCardIds.length),
  );
  const canPreDeclareUno = Boolean(
    legalActions?.canDeclareUno && legalActions.declareUnoWindowId == null,
  );
  const canPostDeclareUno = Boolean(
    legalActions?.canDeclareUno && legalActions.declareUnoWindowId != null,
  );

  useEffect(() => {
    setDeclareWithPlay(false);
  }, [snapshot.revision]);

  useEffect(() => {
    if (!canOfferAtomicUnoIntent) setDeclareWithPlay(false);
  }, [canOfferAtomicUnoIntent]);

  useEffect(() => {
    if (!colorChoice) return;
    if (colorChoice.mode === "initial") {
      if (!legalActions?.canChooseInitialColor) setColorChoice(null);
      return;
    }
    const stillPlayable =
      playableCardIds.has(colorChoice.cardId) || bluffableWildDrawFourIds.has(colorChoice.cardId);
    if (!stillPlayable || !privateGame?.hand.some((card) => card.id === colorChoice.cardId)) {
      setColorChoice(null);
    }
  }, [
    bluffableWildDrawFourIds,
    colorChoice,
    legalActions?.canChooseInitialColor,
    playableCardIds,
    privateGame?.hand,
  ]);

  useEffect(() => {
    if (isHost || !managementOpen) return;
    adminPauseActiveRef.current = false;
    setManagementOpen(false);
  }, [isHost, managementOpen]);

  useEffect(
    () => () => {
      if (adminPauseActiveRef.current) setAdminPause(false);
    },
    [setAdminPause],
  );

  const sendPlay = (card: UnoCardData, chosenColor?: UnoColor) => {
    if (!canAct) return;
    const accepted = sendGameCommand("uno", {
      type: "play-card",
      cardId: card.id,
      ...(chosenColor ? { chosenColor } : {}),
      ...(declareWithPlay ? { declareUno: true } : {}),
    });
    if (accepted) setColorChoice(null);
  };

  const playCard = (card: UnoCardData) => {
    const isPlayable = playableCardIds.has(card.id) || bluffableWildDrawFourIds.has(card.id);
    if (!canAct || !isPlayable) return;
    if (card.kind === "wild" || card.kind === "wild-draw-four") {
      setColorChoice({ mode: "wild", cardId: card.id });
      return;
    }
    sendPlay(card);
  };

  const { session, announcement, bindDragSource, isDragging, activeTargetId } =
    useCardDrag<UnoDragPayload>({
      disabled: !canAct,
      resetKey: `${snapshot.revision}:${handSortMode}`,
      canDrop: (_payload, targetId) => targetId === "uno-discard",
      onDrop: ({ card }) => playCard(card),
    });

  if (!game) {
    return (
      <div className="screen platform-room-loading" role="status">
        Раскладываем карты…
      </div>
    );
  }

  const playersById = new Map(game.players.map((player) => [player.seatId, player]));
  const orderedPlayers = [
    ...game.activeOrder
      .map((seatId) => playersById.get(seatId))
      .filter((player): player is UnoPlayerPublicState => player !== undefined),
    ...game.players.filter((player) => !game.activeOrder.includes(player.seatId)),
  ];
  const viewerPlayer = viewerSeatId
    ? (orderedPlayers.find((player) => player.seatId === viewerSeatId) ?? null)
    : null;
  const opponentPlayers = viewerPlayer
    ? orderedPlayers.filter((player) => player.seatId !== viewerPlayer.seatId)
    : orderedPlayers;
  const turnTimeoutMs =
    snapshot.settings.turnTimeoutSeconds == null
      ? null
      : snapshot.settings.turnTimeoutSeconds * 1000;
  const handFanAngleStep = Math.min(1.35, 9 / Math.max(displayedHand.length - 1, 1));
  const pendingWildDrawFour = game.pendingWildDrawFour;
  const unoSubject = game.unoWindow ? playersById.get(game.unoWindow.subjectSeatId) : null;
  const recoverySeats: RecoverySeat[] = snapshot.seats
    .filter((seat) => !seat.closed)
    .map((seat) => ({
      id: seat.seatId,
      name: seat.name,
      isBot: seat.occupantKind === "bot",
      isHost: seat.isHost,
      kicked: seat.closed,
      connected: seat.connected,
      controllerKind: seat.controllerKind,
      temporaryBot: seat.temporaryBot,
    }));
  const recoveryAttentionCount =
    hostSeatClaims.length +
    recoverySeats.filter((seat) => !seat.isBot && !seat.connected && !seat.kicked).length;
  const canManage = isHost && connected && reconnectState === "connected" && !commandPending;
  const renderPlayerSeat = (player: UnoPlayerPublicState) => {
    const seat = snapshot.seats.find((candidate) => candidate.seatId === player.seatId);
    return (
      <CardPlayerSeat
        key={player.seatId}
        seatId={player.seatId}
        name={player.name}
        cardCount={player.cardCount}
        connected={player.connected}
        controllerKind={player.controllerKind}
        temporaryBot={player.temporaryBot}
        isHost={seat?.isHost ?? false}
        isDealer={player.isDealer}
        isMe={player.seatId === viewerSeatId}
        isCurrent={player.isCurrentActor}
        status={player.status}
        paused={paused}
        turnRemainingMs={game.turnRemainingMs}
        turnTimeoutMs={turnTimeoutMs}
        turnAnimationKey={`${snapshot.revision}:${player.seatId}:${paused}`}
        action={actionIndicators[player.seatId]}
      />
    );
  };
  const ownWdfResponse =
    legalActions?.wildDrawFourResponseId != null &&
    (legalActions.canAcceptWildDrawFour || legalActions.canChallengeWildDrawFour);

  const respondToWildDrawFour = (decision: "accept" | "challenge") => {
    const pendingId = legalActions?.wildDrawFourResponseId;
    if (!canAct || pendingId == null) return;
    sendGameCommand("uno", { type: "respond-wild-draw-four", pendingId, decision });
  };

  const openManagement = () => {
    if (!canManage || managementOpen || !setAdminPause(true)) return;
    adminPauseActiveRef.current = true;
    setManagementOpen(true);
  };

  const closeManagement = () => {
    setManagementOpen(false);
    if (!adminPauseActiveRef.current) return;
    adminPauseActiveRef.current = false;
    setAdminPause(false);
  };

  const chooseColor = (color: UnoColor) => {
    if (!canAct || !colorChoice) return;
    if (colorChoice.mode === "initial") {
      if (sendGameCommand("uno", { type: "choose-initial-color", color })) setColorChoice(null);
      return;
    }
    const card = privateGame?.hand.find((candidate) => candidate.id === colorChoice.cardId);
    if (card) sendPlay(card, color);
  };

  return (
    <main className="screen command-game-screen card-game-screen uno-screen has-uno-command-dock">
      <GameRoomHeader
        roomCode={snapshot.roomCode}
        connected={connected}
        onLeaveRoom={leaveRoom}
        confirmActiveLeave={snapshot.viewer.role === "player"}
        gameTitle="UNO"
        brandIcon="◆"
      />

      <div className="card-game-arena uno-arena">
        <section className="card-arena-opponents" aria-label="Соперники">
          {opponentPlayers.map(renderPlayerSeat)}
        </section>

        <section className="card-arena-table-zone uno-arena-table-zone" aria-label="Игровой стол">
          <section
            className="uno-table"
            aria-label={`Карты на столе. Активный цвет: ${
              game.activeColor ? COLOR_LABELS[game.activeColor] : "не выбран"
            }`}
            data-card-motion-anchor="uno:table"
          >
            <div className="uno-arena-status">
              <span
                className={`uno-active-color is-${game.activeColor ?? "none"}`}
                aria-label={`Активный цвет: ${
                  game.activeColor ? COLOR_LABELS[game.activeColor] : "не выбран"
                }`}
              >
                {game.activeColor ? COLOR_LABELS[game.activeColor] : "Цвет"}
              </span>
              <span
                className={`uno-direction is-${game.direction}`}
                aria-label={
                  game.direction === "clockwise" ? "По часовой стрелке" : "Против часовой стрелки"
                }
              >
                <span className="uno-direction-label">Ход</span>
                <span aria-hidden="true">{game.direction === "clockwise" ? "↻" : "↺"}</span>
              </span>
            </div>

            <div className="uno-piles">
              <div
                className="uno-pile uno-draw-pile"
                aria-label={`В колоде ${formatCardCount(game.drawPileCount)}`}
                data-card-motion-anchor="uno:deck"
              >
                <UnoCardBack label={`Колода, осталось ${formatCardCount(game.drawPileCount)}`} />
                <span>{game.drawPileCount}</span>
              </div>
              <div
                className={`uno-pile ${isDragging ? "is-drag-target" : ""} ${
                  activeTargetId === "uno-discard" ? "is-drag-over" : ""
                }`}
                role="group"
                aria-label={`Отбой. ${game.discardPileCount} карт`}
                data-card-drop-target="uno-discard"
                data-card-motion-anchor="uno:discard"
              >
                {game.topDiscard ? (
                  <div
                    className="uno-discard-card-shell"
                    key={game.topDiscard.id}
                    style={
                      {
                        "--discard-tilt": `${game.discardPileCount % 2 === 0 ? -1.4 : 1.4}deg`,
                      } as CSSProperties
                    }
                  >
                    <div
                      className="uno-discard-flight-target"
                      data-table-card-flight={`uno-discard-flight:${game.topDiscard.id}`}
                    >
                      <UnoCard card={game.topDiscard} />
                    </div>
                  </div>
                ) : (
                  <div className="uno-empty-card">—</div>
                )}
                <span>{game.discardPileCount}</span>
              </div>
            </div>

            {pendingWildDrawFour && (
              <section className="uno-wdf-panel" aria-labelledby="uno-wdf-title">
                <div>
                  <span className="uno-eyebrow">Wild +4</span>
                  <h3 id="uno-wdf-title">Проверка рискованного хода</h3>
                  <p>
                    {playersById.get(pendingWildDrawFour.sourceSeatId)?.name ?? "Игрок"} объявил
                    цвет «{COLOR_LABELS[pendingWildDrawFour.declaredColor]}».
                  </p>
                </div>
                <span className="uno-wdf-wait">
                  {ownWdfResponse ? "Решение — внизу" : "Ждём решения"}
                </span>
              </section>
            )}
            {game.lastChallengeResolution && (
              <p className="uno-resolution" role="status">
                {game.lastChallengeResolution.outcome === "challenge-succeeded"
                  ? "Оспаривание удалось."
                  : game.lastChallengeResolution.outcome === "challenge-failed"
                    ? "Оспаривание не удалось."
                    : "Штраф +4 принят."}
              </p>
            )}
          </section>
        </section>

        {viewerPlayer && (
          <div className="card-arena-self-seat" aria-label="Ваше место за столом">
            {renderPlayerSeat(viewerPlayer)}
          </div>
        )}

        {privateGame ? (
          <section className="card-arena-hand uno-hand-section" aria-label="Карты в вашей руке">
            <div
              className="uno-hand"
              role="group"
              aria-label="Карты в вашей руке"
              style={{ "--hand-count": displayedHand.length } as CSSProperties}
            >
              {displayedHand.map((card, index) => {
                const playable = playableCardIds.has(card.id);
                const bluffable = bluffableWildDrawFourIds.has(card.id);
                const isDrawnCard = legalActions?.drawnCardId === card.id;
                const allowed = playable || bluffable;
                const dragSource =
                  allowed && canAct ? bindDragSource({ card }, getUnoCardName(card)) : undefined;
                const { className: dragClassName, ...dragBindings } = dragSource ?? {};
                return (
                  <div
                    key={card.id}
                    className={`uno-hand-card-shell ${dragClassName ?? "card-motion-shell"}`}
                    style={
                      {
                        "--card-index": Math.min(index, 5),
                        "--fan-angle": `${
                          (index - (displayedHand.length - 1) / 2) * handFanAngleStep
                        }deg`,
                        "--fan-rise": `${Math.abs(index - (displayedHand.length - 1) / 2)}px`,
                      } as CSSProperties
                    }
                    {...dragBindings}
                  >
                    <UnoCard
                      card={card}
                      size="hand"
                      playable={playable && canAct}
                      bluffable={bluffable && canAct}
                      disabled={!canAct || !allowed}
                      onDoubleClick={() => playCard(card)}
                      onKeyboardActivate={() => playCard(card)}
                      ariaLabel={`${getUnoCardName(card)}${bluffable ? ". Рискованный Wild +4" : ""}${isDrawnCard ? ". Добрана сейчас" : ""}`}
                    />
                  </div>
                );
              })}
            </div>
          </section>
        ) : snapshot.viewer.role === "spectator" ? (
          <section className="card-arena-public uno-public-only" role="status">
            <strong>Режим наблюдателя</strong>
            <span>Руки игроков скрыты.</span>
          </section>
        ) : (
          <section className="card-arena-public uno-public-only" role="status">
            <strong>Загружаем вашу руку…</strong>
          </section>
        )}
      </div>

      <aside className="uno-command-dock" aria-label="Игровые действия">
        <div className="uno-command-actions">
          {privateGame && (
            <HandSortButton
              mode={handSortMode}
              onToggle={() => setHandSortMode((mode) => (mode === "suit" ? "rank" : "suit"))}
            />
          )}
          <GameDockTools gameId="uno" gameTitle="UNO" />
          {ownWdfResponse && (
            <>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={!canAct || !legalActions?.canAcceptWildDrawFour}
                onClick={() => respondToWildDrawFour("accept")}
              >
                Принять +4
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!canAct || !legalActions?.canChallengeWildDrawFour}
                onClick={() => respondToWildDrawFour("challenge")}
              >
                Оспорить
              </button>
            </>
          )}
          {legalActions?.canChooseInitialColor && (
            <button
              type="button"
              className="btn btn-primary"
              disabled={!canAct}
              onClick={() => setColorChoice({ mode: "initial" })}
            >
              Выбрать цвет
            </button>
          )}
          {canOfferAtomicUnoIntent && (
            <button
              type="button"
              className={`uno-declare-intent ${declareWithPlay ? "is-active" : ""}`}
              aria-pressed={declareWithPlay}
              disabled={!canAct}
              onClick={() => setDeclareWithPlay((value) => !value)}
            >
              {declareWithPlay ? "UNO включено" : "UNO с ходом"}
            </button>
          )}
          {canPreDeclareUno && (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={!canAct}
              onClick={() => sendGameCommand("uno", { type: "declare-uno" })}
            >
              Объявить UNO
            </button>
          )}
          {legalActions?.canDraw && (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={!canAct}
              onClick={() => sendGameCommand("uno", { type: "draw-card" })}
            >
              Взять карту
            </button>
          )}
          {legalActions?.canEndTurn && (
            <button
              type="button"
              className="btn btn-primary"
              disabled={!canAct}
              onClick={() => sendGameCommand("uno", { type: "end-turn" })}
            >
              Завершить ход
            </button>
          )}
          {canPostDeclareUno && (
            <button
              type="button"
              className="btn btn-primary"
              disabled={!canAct}
              onClick={() =>
                sendGameCommand("uno", {
                  type: "declare-uno",
                  ...(legalActions?.declareUnoWindowId != null
                    ? { windowId: legalActions.declareUnoWindowId }
                    : {}),
                })
              }
            >
              Сказать UNO!
            </button>
          )}
          {legalActions?.catchUno && (
            <button
              type="button"
              className="btn btn-danger"
              disabled={!canAct}
              onClick={() =>
                sendGameCommand("uno", {
                  type: "catch-uno",
                  windowId: legalActions.catchUno!.windowId,
                })
              }
            >
              Поймать {unoSubject?.name ?? "игрока"}
            </button>
          )}
          {isHost && (
            <button
              type="button"
              className="btn btn-secondary uno-manage-button"
              onClick={openManagement}
              disabled={!canManage}
              aria-label={
                recoveryAttentionCount > 0
                  ? `Управление комнатой, требует внимания: ${recoveryAttentionCount}`
                  : "Управление комнатой"
              }
              title="Управление комнатой"
            >
              <FiSettings aria-hidden="true" />
              {recoveryAttentionCount > 0 && (
                <span className="card-manage-badge" aria-hidden="true">
                  {recoveryAttentionCount}
                </span>
              )}
            </button>
          )}
        </div>
      </aside>

      {colorChoice && (
        <UnoColorDialog
          mode={colorChoice.mode}
          onChoose={chooseColor}
          onClose={() => setColorChoice(null)}
        />
      )}

      {managementOpen && isHost && (
        <AccessibleModal
          labelledBy="uno-management-title"
          onClose={closeManagement}
          overlayClassName="uno-management-modal"
          panelClassName="uno-management-panel"
        >
          <div className="uno-management-heading">
            <div>
              <span className="uno-eyebrow">Хост</span>
              <h2 id="uno-management-title">Управление комнатой</h2>
            </div>
            <button type="button" className="btn btn-secondary" onClick={closeManagement}>
              Закрыть
            </button>
          </div>
          {error && (
            <div className="uno-inline-error" role="alert">
              {error}
            </div>
          )}
          <ReconnectHostControls
            players={recoverySeats}
            claims={hostSeatClaims}
            onResolveClaim={resolveSeatClaim}
            onAssignTemporaryBot={assignTemporaryBot}
            onReturnHumanControl={returnHumanControl}
            onKickPlayer={kickPlayer}
            onTransferHost={transferHost}
          />
        </AccessibleModal>
      )}
      {error && !managementOpen && (
        <div className="error-toast" role="alert">
          {error}
        </div>
      )}
      <CardDragLayer
        session={session}
        announcement={announcement}
        renderPreview={({ card }) => <UnoCard card={card} size="hand" />}
      />
    </main>
  );
}
