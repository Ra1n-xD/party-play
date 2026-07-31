import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type {
  DurakCard as DurakCardData,
  DurakLegalAction,
  DurakPlayerPublicState,
} from "../../../../shared/games/durak/types";
import type { RoomSnapshot } from "../../../../shared/platform/room";
import { Timer } from "../../components/Timer";
import { AccessibleModal } from "../../platform/components/AccessibleModal";
import {
  ReconnectHostControls,
  type RecoverySeat,
} from "../../platform/components/ReconnectHostControls";
import { usePlatform } from "../../platform/context/PlatformContext";
import { GameRoomHeader } from "../../screens/game/GameRoomHeader";
import { CardDragLayer } from "../shared/CardDragLayer";
import { useCardDrag } from "../shared/useCardDrag";
import { useTableCardFlight } from "../shared/useTableCardFlight";
import { DurakCard, DurakCardBack, getCardName, getSuitSymbol } from "./components/DurakCard";

interface DurakGameScreenProps {
  snapshot: RoomSnapshot<"durak">;
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
    };

const FIGHT_STAGE_LABELS = {
  attack: "Атака",
  defense: "Защита",
  "throw-in": "Подкидывание",
  "take-throw-in": "Последнее подкидывание",
} as const;

const TRUMP_LOCATION_LABELS = {
  deck: "под колодой",
  hand: "забран",
  table: "на столе",
  discard: "в отбое",
  removed: "вне партии",
} as const;

function formatCardCount(count: number): string {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return `${count} карт`;
  if (mod10 === 1) return `${count} карта`;
  if (mod10 >= 2 && mod10 <= 4) return `${count} карты`;
  return `${count} карт`;
}

function playerStatusLabel(player: DurakPlayerPublicState): string {
  if (player.status === "out") return "Вышел";
  if (player.status === "excluded") return "Исключён";
  if (player.temporaryBot) return "Временно играет бот";
  if (player.controllerKind === "bot") return "Бот";
  if (!player.connected) return "Нет связи";
  return "В игре";
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

export function DurakGameScreen({ snapshot }: DurakGameScreenProps) {
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
  const canAct = Boolean(privateGame && canUseConnection && !paused && !commandPending);
  const playableCardIds = getLegalPlayableIds(legalAction);
  const selectedCards = privateGame?.hand.filter((card) => selectedCardIds.includes(card.id)) ?? [];

  const isCardSelectable = (card: DurakCardData): boolean => {
    if (!canAct || !playableCardIds.has(card.id)) return false;
    if (legalAction?.type === "defend") return false;
    if (legalAction?.type !== "attack" && legalAction?.type !== "throw-in") return false;
    if (selectedCardIds.includes(card.id)) return true;
    if (selectedCardIds.length >= legalAction.maxCards) return false;
    if (legalAction.type !== "attack" || selectedCards.length === 0) return true;
    return selectedCards[0]?.rank === card.rank;
  };

  const isCardDraggable = (card: DurakCardData): boolean => canAct && playableCardIds.has(card.id);

  const createDragPayload = (card: DurakCardData): DurakDragPayload | null => {
    if (!privateGame || !isCardDraggable(card)) return null;

    if (legalAction?.type === "defend") {
      return {
        kind: "defend",
        card,
        attackCardIds: legalAction.targets
          .filter((target) => target.defenseCardId === card.id)
          .flatMap((target) => target.attackCardIds),
      };
    }

    if (legalAction?.type !== "attack" && legalAction?.type !== "throw-in") return null;

    const cards = selectedCardIds.includes(card.id) ? selectedCards : [card];
    const firstCard = cards[0];
    if (!firstCard) return null;

    return {
      kind: "attack",
      action: legalAction.type,
      cards,
      cardIds: [firstCard.id, ...cards.slice(1).map((candidate) => candidate.id)],
    };
  };

  const timerEndTime = useMemo(
    () =>
      !game || paused || game.turnRemainingMs == null ? null : Date.now() + game.turnRemainingMs,
    [game?.turnRemainingMs, paused, snapshot.revision],
  );
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

  useTableCardFlight({ revision: snapshot.revision, flights: tableFlights });

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
      disabled: !canAct,
      resetKey: snapshot.revision,
      canDrop: (payload, targetId) => {
        if (payload.kind === "attack") return targetId === "durak-table";
        const attackCardId = targetId.startsWith("durak-attack:")
          ? targetId.slice("durak-attack:".length)
          : "";
        return attackCardId.length > 0 && payload.attackCardIds.includes(attackCardId);
      },
      onDrop: (payload, targetId) => {
        if (!canAct) return;
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
  const currentActor = game.currentActorSeatId ? playersById.get(game.currentActorSeatId) : null;
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

  const statusDescription = paused
    ? "Партия приостановлена"
    : game.takeDeclared
      ? "Защищающийся берёт — атакующие могут подкидывать без очереди"
      : game.fightStage === "defense"
        ? "Защитник отбивается, остальные могут подкидывать одновременно"
        : currentActor
          ? `Первую атаку начинает ${currentActor.name}`
          : "Сервер завершает бой";

  return (
    <main className="screen command-game-screen durak-screen has-durak-command-dock">
      <GameRoomHeader
        gameId="durak"
        roomCode={snapshot.roomCode}
        connected={connected}
        onLeaveRoom={leaveRoom}
        confirmActiveLeave={snapshot.viewer.role === "player"}
        gameTitle="Подкидной дурак"
        brandIcon="♠"
      />

      <section className="durak-players" aria-label="Участники">
        {orderedPlayers.map((player) => {
          const seat = snapshot.seats.find((candidate) => candidate.seatId === player.seatId);
          return (
            <article
              key={player.seatId}
              data-card-player-seat={player.seatId}
              className={[
                "durak-player",
                player.seatId === viewerSeatId ? "is-me" : "",
                player.isCurrentActor ? "is-current" : "",
                player.status !== "active" ? "is-inactive" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <div className="durak-player-copy">
                <strong>
                  {player.name}
                  {player.seatId === viewerSeatId ? " · вы" : ""}
                </strong>
                <span>{playerStatusLabel(player)}</span>
              </div>
              <div className="durak-player-roles" aria-label={`Статусы игрока ${player.name}`}>
                {seat?.isHost && <span>Хост</span>}
                {player.isDealer && <span>Сдающий</span>}
              </div>
              {player.isCurrentActor && (
                <span className="durak-player-timer">
                  {game.turnRemainingMs == null ? (
                    "Без лимита"
                  ) : paused ? (
                    "Пауза"
                  ) : timerEndTime ? (
                    <Timer endTime={timerEndTime} />
                  ) : null}
                </span>
              )}
              <span className="durak-player-cards">{formatCardCount(player.cardCount)}</span>
            </article>
          );
        })}
      </section>

      <section className="durak-board">
        <aside className="durak-deck-panel" aria-label="Колода и козырь">
          <span className="durak-section-eyebrow">Колода</span>
          <div className="durak-deck-visual">
            {game.deckCount > 0 ? (
              <DurakCardBack label={`Колода, осталось ${formatCardCount(game.deckCount)}`} />
            ) : (
              <div className="durak-empty-deck" aria-label="Колода пуста">
                ∅
              </div>
            )}
            <strong>{formatCardCount(game.deckCount)}</strong>
          </div>
          <div className="durak-trump">
            <span>
              Козырь <strong>{game.trumpSuit ? getSuitSymbol(game.trumpSuit) : "—"}</strong>
            </span>
            {game.trumpCard && game.trumpCardLocation === "deck" ? (
              <DurakCard card={game.trumpCard} size="mini" />
            ) : (
              <span className="durak-trump-status" role="status">
                <strong>
                  {game.trumpCardLocation === "hand"
                    ? "Козырь забран"
                    : "Козырь больше не в колоде"}
                </strong>
                <small>
                  {game.trumpCardLocation
                    ? TRUMP_LOCATION_LABELS[game.trumpCardLocation]
                    : "местоположение неизвестно"}
                  {game.trumpCardHolderSeatId
                    ? ` · ${playersById.get(game.trumpCardHolderSeatId)?.name ?? "игрок"}`
                    : ""}
                </small>
              </span>
            )}
            {game.trumpCardLocation === "deck" && <small>под колодой</small>}
          </div>
          <span className="durak-discard-count">В отбое: {game.discardCount}</span>
        </aside>

        <section
          className={`durak-table ${isAttackDragging ? "is-drag-target" : ""} ${
            isAttackDragging && activeTargetId === "durak-table" ? "is-drag-over" : ""
          }`}
          aria-labelledby="durak-table-title"
          data-card-drop-target="durak-table"
        >
          <div className="durak-table-heading">
            <div>
              <span className="durak-section-eyebrow">Стол</span>
              <h2 id="durak-table-title">Бой</h2>
            </div>
          </div>

          {game.table.length === 0 ? (
            <div className="durak-empty-table">
              {legalAction?.type === "attack"
                ? "Выберите карты одного достоинства для первой атаки."
                : "Ждём атакующего."}
            </div>
          ) : (
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
                          isDefenseDragTarget && activeTargetId === `durak-attack:${pair.attack.id}`
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

      {privateGame ? (
        <section className="durak-hand-section" aria-labelledby="durak-hand-title">
          <div className="durak-hand-heading">
            <div>
              <span className="durak-section-eyebrow">Личные карты</span>
              <h2 id="durak-hand-title">Ваша рука · {formatCardCount(privateGame.hand.length)}</h2>
            </div>
            <p>
              {legalAction?.type === "defend"
                ? "Дважды нажмите карту при одной цели или перетащите её на нужную атаку."
                : legalAction?.type === "attack"
                  ? "Дважды нажмите карту или выберите одинаковые карты и перетащите группу."
                  : legalAction?.type === "throw-in"
                    ? "Подкидывайте без очереди двойным нажатием или перетаскиванием."
                    : legalAction?.type === "pass"
                      ? "Если закончили подкидывать, нажмите «Бито» внизу."
                      : "Следите за столом — доступное действие появится автоматически."}
            </p>
          </div>
          <div className="durak-hand" role="group" aria-label="Карты в вашей руке">
            <p id="durak-card-drag-instructions" className="durak-drag-instruction">
              Карту можно разыграть двойным нажатием или перетащить на доступную цель.
            </p>
            {privateGame.hand.map((card, index) => {
              const selectable = isCardSelectable(card);
              const draggable = isCardDraggable(card);
              const selected = selectedCardIds.includes(card.id);
              const dragPayload = draggable ? createDragPayload(card) : null;
              const dragSource = dragPayload
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
                  style={{ "--card-index": Math.min(index, 5) } as CSSProperties}
                  {...dragBindings}
                >
                  <DurakCard
                    card={card}
                    size="hand"
                    selected={selected}
                    playable={playableCardIds.has(card.id) && canAct}
                    disabled={!draggable}
                    onClick={selectable ? () => selectHandCard(card) : undefined}
                    onDoubleClick={draggable ? () => activateHandCard(card) : undefined}
                    onKeyboardActivate={draggable ? () => activateHandCard(card) : undefined}
                    ariaDescribedBy={dragSource ? "durak-card-drag-instructions" : undefined}
                  />
                </div>
              );
            })}
          </div>
        </section>
      ) : snapshot.viewer.role === "spectator" ? (
        <section className="durak-public-only" role="status">
          <strong>Режим наблюдателя</strong>
          <span>Руки игроков скрыты. Доступно только публичное состояние стола.</span>
        </section>
      ) : (
        <section className="durak-public-only" role="status" aria-live="polite">
          <strong>Загружаем вашу руку…</strong>
          <span>Публичный стол уже доступен, личные карты появятся после синхронизации.</span>
        </section>
      )}

      <aside className="durak-command-dock" aria-label="Игровые действия">
        <div className="durak-command-status" role="status" aria-live="polite">
          <small>
            {snapshot.viewer.role === "spectator"
              ? "Наблюдение"
              : game.fightStage
                ? FIGHT_STAGE_LABELS[game.fightStage]
                : "Партия"}
          </small>
          <strong>
            {commandPending
              ? "Сервер принимает действие…"
              : paused
                ? "Действия приостановлены"
                : statusDescription}
          </strong>
        </div>
        <div className="durak-command-actions">
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
            >
              Управление
              {recoveryAttentionCount > 0 ? ` · ${recoveryAttentionCount}` : ""}
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
          const cards = payload.kind === "defend" ? [payload.card] : payload.cards;
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
