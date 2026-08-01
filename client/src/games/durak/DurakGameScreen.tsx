import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { FiSettings } from "react-icons/fi";
import type {
  DurakCard as DurakCardData,
  DurakLegalAction,
  DurakPlayerPublicState,
  DurakRank,
  DurakSuit,
  DurakVisualAction,
} from "../../../../shared/games/durak/types";
import type { CardTransferVisualEvent } from "../../../../shared/platform/cardVisualEvents";
import type { PlayerActionVisualEvent } from "../../../../shared/types";
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
import { DurakCard, DurakCardBack, getCardName, getSuitSymbol } from "./components/DurakCard";

interface DurakGameScreenProps {
  snapshot: RoomSnapshot<"durak">;
  animateInitialDeal?: boolean;
}

type DurakDragPayload =
  | {
      kind: "attack";
      action: "attack" | "throw-in";
      cards: DurakCardData[];
      cardIds: [string, ...string[]];
    }
  | {
      kind: "defend";
      card: DurakCardData;
      attackCardIds: string[];
    }
  | {
      kind: "return-only";
      card: DurakCardData;
    };

type DurakShownAction = Extract<DurakVisualAction, "take" | "pass">;

const DURAK_ACTION_LABELS: Record<DurakShownAction, string> = {
  take: "Беру",
  pass: "Бито",
};

const DURAK_SUIT_ORDER: Record<DurakSuit, number> = {
  clubs: 0,
  diamonds: 1,
  hearts: 2,
  spades: 3,
};

const DURAK_RANK_ORDER: Record<DurakRank, number> = {
  "6": 0,
  "7": 1,
  "8": 2,
  "9": 3,
  "10": 4,
  jack: 5,
  queen: 6,
  king: 7,
  ace: 8,
};

function compareDurakHandCards(
  first: DurakCardData,
  second: DurakCardData,
  mode: HandSortMode,
  trumpSuit?: DurakSuit | null,
): number {
  const firstSuit = DURAK_SUIT_ORDER[first.suit] + (first.suit === trumpSuit ? 10 : 0);
  const secondSuit = DURAK_SUIT_ORDER[second.suit] + (second.suit === trumpSuit ? 10 : 0);
  const suitDifference = firstSuit - secondSuit;
  const rankDifference = DURAK_RANK_ORDER[first.rank] - DURAK_RANK_ORDER[second.rank];

  return mode === "suit"
    ? suitDifference || rankDifference || first.id.localeCompare(second.id)
    : rankDifference || suitDifference || first.id.localeCompare(second.id);
}

function formatCardCount(count: number): string {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return `${count} карт`;
  if (mod10 === 1) return `${count} карта`;
  if (mod10 >= 2 && mod10 <= 4) return `${count} карты`;
  return `${count} карт`;
}

function getLegalPlayableIds(legalAction: DurakLegalAction | null): Set<string> {
  if (!legalAction || legalAction.type === "wait" || legalAction.type === "pass") {
    return new Set();
  }
  if (legalAction.type === "defend") {
    return new Set(legalAction.targets.map((target) => target.defenseCardId));
  }
  return new Set(legalAction.playableCardIds);
}

export function DurakGameScreen({ snapshot, animateInitialDeal = false }: DurakGameScreenProps) {
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
    kickPlayer,
    transferHost,
    setAdminPause,
  } = usePlatform();
  const game = snapshot.game;
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [handSortMode, setHandSortMode] = useState<HandSortMode>("suit");
  const [managementOpen, setManagementOpen] = useState(false);
  const adminPauseActiveRef = useRef(false);

  const viewerSeatId = snapshot.viewer.role === "player" ? snapshot.viewer.seatId : null;
  const viewerSeat = viewerSeatId
    ? snapshot.seats.find((seat) => seat.seatId === viewerSeatId)
    : null;
  const isHost = viewerSeat?.isHost ?? false;
  const privateGame = snapshot.viewer.role === "player" ? snapshot.viewer.privateGame : null;
  const legalAction = privateGame?.legalAction ?? null;
  const paused = snapshot.pause.active || game?.paused === true;
  const canUseConnection =
    connected && reconnectState === "connected" && viewerSeat?.controllerKind === "human";
  const canDrag = Boolean(privateGame && canUseConnection);
  const canAct = Boolean(privateGame && canUseConnection && !paused && !commandPending);
  const playableCardIds = getLegalPlayableIds(legalAction);
  const displayedHand = useMemo(
    () =>
      privateGame
        ? [...privateGame.hand].sort((first, second) =>
            compareDurakHandCards(first, second, handSortMode, game?.trumpSuit),
          )
        : [],
    [game?.trumpSuit, handSortMode, privateGame],
  );
  const selectedCards = displayedHand.filter((card) => selectedCardIds.includes(card.id));

  const isCardSelectable = (card: DurakCardData): boolean => {
    if (!canAct || !playableCardIds.has(card.id)) return false;
    if (legalAction?.type === "defend") return false;
    if (legalAction?.type !== "attack" && legalAction?.type !== "throw-in") return false;
    if (selectedCardIds.includes(card.id)) return true;
    if (selectedCardIds.length >= legalAction.maxCards) return false;
    if (legalAction.type !== "attack" || selectedCards.length === 0) return true;
    return selectedCards[0]?.rank === card.rank;
  };

  const createDragPayload = (card: DurakCardData): DurakDragPayload => {
    if (!canAct || !playableCardIds.has(card.id)) return { kind: "return-only", card };

    if (legalAction?.type === "defend") {
      return {
        kind: "defend",
        card,
        attackCardIds: legalAction.targets
          .filter((target) => target.defenseCardId === card.id)
          .flatMap((target) => target.attackCardIds),
      };
    }

    if (legalAction?.type !== "attack" && legalAction?.type !== "throw-in") {
      return { kind: "return-only", card };
    }

    const cards = selectedCardIds.includes(card.id) ? selectedCards : [card];
    const firstCard = cards[0];
    if (!firstCard) return { kind: "return-only", card };

    return {
      kind: "attack",
      action: legalAction.type,
      cards,
      cardIds: [firstCard.id, ...cards.slice(1).map((candidate) => candidate.id)],
    };
  };

  const tableFlights = useMemo(
    () =>
      game?.table.flatMap((pair) => [
        {
          key: `attack:${pair.attack.id}`,
          sourceSeatId: pair.attackPlayedBySeatId,
          targetId: `durak-attack-flight:${pair.attack.id}`,
        },
        ...(pair.defense && pair.defensePlayedBySeatId
          ? [
              {
                key: `defense:${pair.defense.id}`,
                sourceSeatId: pair.defensePlayedBySeatId,
                targetId: `durak-defense-flight:${pair.defense.id}`,
              },
            ]
          : []),
      ]) ?? [],
    [game?.table],
  );
  const transferEvents = useMemo<CardTransferVisualEvent[]>(
    () => [
      ...(animateInitialDeal && game
        ? game.players.map((player, index) => ({
            id: -(index + 1),
            type: "transfer" as const,
            source: { kind: "deck" as const },
            target: { kind: "player" as const, seatId: player.seatId },
            cardCount: 6,
          }))
        : []),
      ...(game?.visualEvents.filter((event) => event.type === "transfer") ?? []),
    ],
    [animateInitialDeal, game],
  );
  const actionEvents = useMemo<PlayerActionVisualEvent<DurakShownAction>[]>(
    () =>
      game?.visualEvents.flatMap((event): PlayerActionVisualEvent<DurakShownAction>[] => {
        if (event.type !== "action" || (event.action !== "take" && event.action !== "pass")) {
          return [];
        }
        return [{ ...event, action: event.action }];
      }) ?? [],
    [game?.visualEvents],
  );

  useTableCardFlight({ revision: snapshot.revision, flights: tableFlights });
  useCardTransferMotion({
    gameId: "durak",
    revision: snapshot.revision,
    events: transferEvents,
    animateInitial: animateInitialDeal,
  });
  const actionIndicators = usePlayerActionIndicators(actionEvents, DURAK_ACTION_LABELS);

  useEffect(() => {
    setSelectedCardIds([]);
  }, [snapshot.revision, legalAction?.type]);

  useEffect(() => {
    if (isHost || !managementOpen) return;
    adminPauseActiveRef.current = false;
    setManagementOpen(false);
  }, [isHost, managementOpen]);

  useEffect(
    () => () => {
      if (adminPauseActiveRef.current) setAdminPause(false);
    },
    [],
  );

  const { session, announcement, bindDragSource, isDragging, activeTargetId } =
    useCardDrag<DurakDragPayload>({
      disabled: !canDrag,
      resetKey: `${snapshot.revision}:${handSortMode}`,
      canDrop: (payload, targetId) => {
        if (!canAct || payload.kind === "return-only") return false;
        if (payload.kind === "attack") return targetId === "durak-table";
        const attackCardId = targetId.startsWith("durak-attack:")
          ? targetId.slice("durak-attack:".length)
          : "";
        return attackCardId.length > 0 && payload.attackCardIds.includes(attackCardId);
      },
      onDrop: (payload, targetId) => {
        if (!canAct || payload.kind === "return-only") return;
        if (payload.kind === "attack") {
          sendGameCommand("durak", {
            type: payload.action,
            cardIds: payload.cardIds,
          });
          return;
        }

        const attackCardId = targetId.slice("durak-attack:".length);
        if (!attackCardId) return;
        sendGameCommand("durak", {
          type: "defend",
          cardId: payload.card.id,
          attackCardId,
        });
      },
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
      .filter((player): player is DurakPlayerPublicState => player !== undefined),
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
  const handFanAngleStep = Math.min(1.5, 9 / Math.max(displayedHand.length - 1, 1));
  const attackDragPayload =
    isDragging && session?.payload.kind === "attack" ? session.payload : null;
  const defenseDragPayload =
    isDragging && session?.payload.kind === "defend" ? session.payload : null;
  const isAttackDragging = attackDragPayload !== null;
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

  const renderPlayerSeat = (player: DurakPlayerPublicState) => {
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

  const openManagement = () => {
    if (!canManage || managementOpen) return;
    if (!setAdminPause(true)) return;
    adminPauseActiveRef.current = true;
    setManagementOpen(true);
  };

  const closeManagement = () => {
    setManagementOpen(false);
    if (!adminPauseActiveRef.current) return;
    adminPauseActiveRef.current = false;
    setAdminPause(false);
  };

  const selectHandCard = (card: DurakCardData) => {
    if (!isCardSelectable(card)) return;
    setSelectedCardIds((current) =>
      current.includes(card.id)
        ? current.filter((cardId) => cardId !== card.id)
        : [...current, card.id],
    );
  };

  const activateHandCard = (card: DurakCardData) => {
    if (!canAct || !playableCardIds.has(card.id)) return;
    if (legalAction?.type === "defend") {
      const target = legalAction.targets.find((candidate) => candidate.defenseCardId === card.id);
      if (!target || target.attackCardIds.length !== 1) return;
      sendGameCommand("durak", {
        type: "defend",
        cardId: card.id,
        attackCardId: target.attackCardIds[0],
      });
      return;
    }
    if (legalAction?.type !== "attack" && legalAction?.type !== "throw-in") {
      return;
    }
    const ids = selectedCardIds.includes(card.id) ? selectedCardIds : [card.id];
    const firstCardId = ids[0];
    if (!firstCardId) return;
    const cardIds: [string, ...string[]] = [firstCardId, ...ids.slice(1)];
    sendGameCommand(
      "durak",
      legalAction.type === "attack" ? { type: "attack", cardIds } : { type: "throw-in", cardIds },
    );
  };

  return (
    <main className="screen command-game-screen card-game-screen durak-screen has-durak-command-dock">
      <GameRoomHeader
        roomCode={snapshot.roomCode}
        connected={connected}
        onLeaveRoom={leaveRoom}
        confirmActiveLeave={snapshot.viewer.role === "player"}
        gameTitle="Подкидной дурак"
        brandIcon="♠"
      />

      <div className="card-game-arena durak-arena">
        <section className="card-arena-opponents" aria-label="Соперники">
          {opponentPlayers.map(renderPlayerSeat)}
        </section>

        <section className="card-arena-table-zone durak-arena-table-zone" aria-label="Игровой стол">
          <aside className="durak-deck-panel" aria-label="Колода и козырь">
            <div
              className={`durak-deck-visual ${game.deckCount > 0 ? "has-cards" : ""}`}
              data-card-motion-anchor="durak:deck"
            >
              {game.deckCount > 0 ? (
                <DurakCardBack label={`Колода, осталось ${formatCardCount(game.deckCount)}`} />
              ) : (
                <div className="durak-empty-deck" aria-label="Колода пуста">
                  ∅
                </div>
              )}
              <strong aria-label={`В колоде ${formatCardCount(game.deckCount)}`}>
                {game.deckCount}
              </strong>
            </div>
            <div
              className={`durak-trump ${
                game.trumpCard && game.trumpCardLocation === "deck" ? "has-card" : "is-status"
              }`}
            >
              {game.trumpCard && game.trumpCardLocation === "deck" ? (
                <DurakCard card={game.trumpCard} size="table" />
              ) : (
                <span className="durak-trump-status" role="status">
                  <strong>{game.trumpSuit ? getSuitSymbol(game.trumpSuit) : "—"}</strong>
                  <small>Козырь вне колоды</small>
                </span>
              )}
            </div>
            <span
              className="durak-discard-motion-anchor"
              data-card-motion-anchor="durak:discard"
              aria-hidden="true"
            />
          </aside>

          <section
            className={`durak-table ${isAttackDragging ? "is-drag-target" : ""} ${
              isAttackDragging && activeTargetId === "durak-table" ? "is-drag-over" : ""
            }`}
            aria-label={
              game.table.length === 0 ? "Карты на столе, стол свободен" : "Карты на столе"
            }
            data-card-drop-target="durak-table"
            data-card-motion-anchor="durak:table"
          >
            {game.table.length > 0 && (
              <div className="durak-table-grid">
                {game.table.map((pair) => {
                  const canTarget =
                    !pair.defense &&
                    canAct &&
                    legalAction?.type === "defend" &&
                    legalAction.targets.some((target) =>
                      target.attackCardIds.includes(pair.attack.id),
                    );
                  const isDefenseDragTarget =
                    !pair.defense &&
                    defenseDragPayload?.attackCardIds.includes(pair.attack.id) === true;
                  const attackerName = playersById.get(pair.attackPlayedBySeatId)?.name ?? "Игрок";
                  const defenderName = pair.defensePlayedBySeatId
                    ? (playersById.get(pair.defensePlayedBySeatId)?.name ?? "Игрок")
                    : "Защита";
                  return (
                    <article
                      className={`durak-table-pair ${pair.defense ? "is-covered" : ""}`}
                      key={pair.attack.id}
                    >
                      <div className="durak-pair-cards">
                        <div
                          className={`durak-pair-card is-attack ${
                            isDefenseDragTarget ? "is-drag-target" : ""
                          } ${
                            isDefenseDragTarget &&
                            activeTargetId === `durak-attack:${pair.attack.id}`
                              ? "is-drag-over"
                              : ""
                          }`}
                          {...(isDefenseDragTarget
                            ? { "data-card-drop-target": `durak-attack:${pair.attack.id}` }
                            : {})}
                          data-table-card-flight={`durak-attack-flight:${pair.attack.id}`}
                        >
                          <DurakCard
                            card={pair.attack}
                            size="table"
                            ariaLabel={
                              canTarget
                                ? `Побить карту: ${getCardName(pair.attack)} — атаковал ${attackerName}`
                                : `${attackerName} атаковал: ${getCardName(pair.attack)}`
                            }
                          />
                        </div>
                        {pair.defense && (
                          <div
                            className="durak-pair-card is-defense"
                            data-table-card-flight={`durak-defense-flight:${pair.defense.id}`}
                          >
                            <DurakCard
                              card={pair.defense}
                              size="table"
                              ariaLabel={`${defenderName} побил: ${getCardName(pair.defense)}`}
                            />
                          </div>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </section>

        {viewerPlayer && (
          <div className="card-arena-self-seat" aria-label="Ваше место за столом">
            {renderPlayerSeat(viewerPlayer)}
          </div>
        )}

        {privateGame ? (
          <section className="card-arena-hand durak-hand-section" aria-label="Карты в вашей руке">
            <div
              className="durak-hand"
              role="group"
              aria-label="Карты в вашей руке"
              style={{ "--hand-count": displayedHand.length } as CSSProperties}
            >
              {displayedHand.map((card, index) => {
                const selectable = isCardSelectable(card);
                const playable = playableCardIds.has(card.id) && canAct;
                const selected = selectedCardIds.includes(card.id);
                const dragPayload = createDragPayload(card);
                const dragSource = canDrag
                  ? bindDragSource(
                      dragPayload,
                      dragPayload.kind === "attack" && dragPayload.cards.length > 1
                        ? `Группа: ${formatCardCount(dragPayload.cards.length)}`
                        : getCardName(card),
                    )
                  : undefined;
                const { className: dragClassName, ...dragBindings } = dragSource ?? {};
                return (
                  <div
                    key={card.id}
                    className={`durak-hand-card-shell ${dragClassName ?? "card-motion-shell"}`}
                    style={
                      {
                        "--card-index": Math.min(index, 5),
                        "--fan-angle": `${
                          (index - (displayedHand.length - 1) / 2) * handFanAngleStep
                        }deg`,
                        "--fan-rise": `${Math.abs(index - (displayedHand.length - 1) / 2) * 1.2}px`,
                      } as CSSProperties
                    }
                    {...dragBindings}
                  >
                    <DurakCard
                      card={card}
                      size="hand"
                      selected={selected}
                      playable={playable}
                      onClick={selectable ? () => selectHandCard(card) : undefined}
                      onDoubleClick={playable ? () => activateHandCard(card) : undefined}
                      onKeyboardActivate={playable ? () => activateHandCard(card) : undefined}
                    />
                  </div>
                );
              })}
            </div>
          </section>
        ) : snapshot.viewer.role === "spectator" ? (
          <section className="card-arena-public durak-public-only" role="status">
            <strong>Режим наблюдателя</strong>
            <span>Руки игроков скрыты.</span>
          </section>
        ) : (
          <section className="card-arena-public durak-public-only" role="status" aria-live="polite">
            <strong>Загружаем вашу руку…</strong>
          </section>
        )}
      </div>

      <aside className="durak-command-dock" aria-label="Игровые действия">
        <div className="durak-command-actions">
          {privateGame && (
            <HandSortButton
              mode={handSortMode}
              onToggle={() => setHandSortMode((mode) => (mode === "suit" ? "rank" : "suit"))}
            />
          )}
          <GameDockTools gameId="durak" gameTitle="Подкидной дурак" />
          {legalAction?.type === "defend" && (
            <button
              type="button"
              className="btn btn-danger"
              disabled={!canAct}
              onClick={() => sendGameCommand("durak", { type: "take" })}
            >
              Взять
            </button>
          )}
          {(legalAction?.type === "throw-in" || legalAction?.type === "pass") && (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={!canAct}
              onClick={() => sendGameCommand("durak", { type: "pass" })}
            >
              Бито
            </button>
          )}
          {isHost && (
            <button
              type="button"
              className="btn btn-secondary durak-manage-button"
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

      {managementOpen && isHost && (
        <AccessibleModal
          labelledBy="durak-management-title"
          onClose={closeManagement}
          overlayClassName="durak-management-modal"
          panelClassName="durak-management-panel"
        >
          <div className="durak-management-heading">
            <div>
              <span className="durak-section-eyebrow">Хост</span>
              <h2 id="durak-management-title">Управление комнатой</h2>
            </div>
            <button type="button" className="btn btn-secondary" onClick={closeManagement}>
              Закрыть
            </button>
          </div>
          {error && (
            <div className="durak-inline-error" role="alert">
              {error}
            </div>
          )}
          <ReconnectHostControls
            players={recoverySeats}
            claims={hostSeatClaims}
            onResolveClaim={resolveSeatClaim}
            onAssignTemporaryBot={assignTemporaryBot}
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
        renderPreview={(payload) => {
          const cards = payload.kind === "attack" ? payload.cards : [payload.card];
          if (cards.length === 1) return <DurakCard card={cards[0]} size="hand" />;

          return (
            <div className="durak-drag-stack">
              {cards.slice(0, 3).map((card, index) => (
                <div
                  className="durak-drag-stack-card"
                  key={card.id}
                  style={{ "--drag-stack-index": index } as CSSProperties}
                >
                  <DurakCard card={card} size="hand" />
                </div>
              ))}
              <span className="durak-drag-stack-count">{formatCardCount(cards.length)}</span>
            </div>
          );
        }}
      />
    </main>
  );
}
