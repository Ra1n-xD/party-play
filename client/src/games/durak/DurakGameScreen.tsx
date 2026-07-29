import { useEffect, useMemo, useRef, useState } from "react";
import type {
  DurakCard as DurakCardData,
  DurakLegalAction,
  DurakPlayerPublicState,
} from "../../../../shared/games/durak/types";
import type { RoomSnapshot } from "../../../../shared/platform/room";
import { Timer } from "../../components/Timer";
import { AccessibleModal } from "../../platform/components/AccessibleModal";
import {
  ReconnectHostBanner,
  ReconnectHostControls,
  type RecoverySeat,
} from "../../platform/components/ReconnectHostControls";
import { usePlatform } from "../../platform/context/PlatformContext";
import { GameRoomHeader } from "../../screens/game/GameRoomHeader";
import { DurakCard, DurakCardBack, getSuitSymbol } from "./components/DurakCard";

interface DurakGameScreenProps {
  snapshot: RoomSnapshot<"durak">;
}

const FIGHT_STAGE_LABELS = {
  attack: "Атака",
  defense: "Защита",
  "throw-in": "Подкидывание",
  "take-throw-in": "Последнее подкидывание",
} as const;

const TRUMP_LOCATION_LABELS = {
  deck: "под колодой",
  hand: "в руке сдающего",
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
  const [selectedDefenseCardId, setSelectedDefenseCardId] = useState<string | null>(null);
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

  const timerEndTime = useMemo(
    () =>
      !game || paused || game.turnRemainingMs == null ? null : Date.now() + game.turnRemainingMs,
    [game?.turnRemainingMs, paused, snapshot.revision],
  );

  useEffect(() => {
    setSelectedCardIds([]);
    setSelectedDefenseCardId(null);
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
  const playableCardIds = getLegalPlayableIds(legalAction);
  const selectedCards = privateGame?.hand.filter((card) => selectedCardIds.includes(card.id)) ?? [];
  const selectedDefenseTargets =
    legalAction?.type === "defend" && selectedDefenseCardId
      ? new Set(
          legalAction.targets
            .filter((target) => target.defenseCardId === selectedDefenseCardId)
            .flatMap((target) => target.attackCardIds),
        )
      : new Set<string>();
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

  const isCardSelectable = (card: DurakCardData): boolean => {
    if (!canAct || !playableCardIds.has(card.id)) return false;
    if (legalAction?.type === "defend") return true;
    if (legalAction?.type !== "attack" && legalAction?.type !== "throw-in") return false;
    if (selectedCardIds.includes(card.id)) return true;
    if (selectedCardIds.length >= legalAction.maxCards) return false;
    if (legalAction.type !== "attack" || selectedCards.length === 0) return true;
    return selectedCards[0]?.rank === card.rank;
  };

  const selectHandCard = (card: DurakCardData) => {
    if (!isCardSelectable(card)) return;
    if (legalAction?.type === "defend") {
      setSelectedDefenseCardId((current) => (current === card.id ? null : card.id));
      return;
    }
    setSelectedCardIds((current) =>
      current.includes(card.id)
        ? current.filter((cardId) => cardId !== card.id)
        : [...current, card.id],
    );
  };

  const sendSelectedCards = () => {
    if (
      !canAct ||
      selectedCardIds.length === 0 ||
      (legalAction?.type !== "attack" && legalAction?.type !== "throw-in")
    ) {
      return;
    }
    const firstCardId = selectedCardIds[0];
    if (!firstCardId) return;
    const cardIds: [string, ...string[]] = [firstCardId, ...selectedCardIds.slice(1)];
    sendGameCommand(
      "durak",
      legalAction.type === "attack" ? { type: "attack", cardIds } : { type: "throw-in", cardIds },
    );
  };

  const defendAttack = (attackCardId: string) => {
    if (
      !canAct ||
      legalAction?.type !== "defend" ||
      !selectedDefenseCardId ||
      !selectedDefenseTargets.has(attackCardId)
    ) {
      return;
    }
    sendGameCommand("durak", {
      type: "defend",
      cardId: selectedDefenseCardId,
      attackCardId,
    });
  };

  const statusDescription = paused
    ? "Партия приостановлена"
    : game.takeDeclared
      ? "Защищающийся берёт карты — идёт последний круг подкидывания"
      : currentActor
        ? `Решение принимает ${currentActor.name}`
        : "Сервер завершает бой";

  return (
    <main className="screen command-game-screen durak-screen">
      <GameRoomHeader
        roomCode={snapshot.roomCode}
        connected={connected}
        onLeaveRoom={leaveRoom}
        confirmActiveLeave={snapshot.viewer.role === "player"}
        gameTitle="Подкидной дурак"
        brandIcon="♠"
      />

      {isHost && (
        <ReconnectHostBanner
          players={recoverySeats}
          claimsCount={hostSeatClaims.length}
          onOpen={openManagement}
        />
      )}

      <section className="durak-status-panel" aria-labelledby="durak-fight-title">
        <div>
          <span className="durak-section-eyebrow">
            {game.fightStage ? FIGHT_STAGE_LABELS[game.fightStage] : "Подготовка"}
          </span>
          <h1 id="durak-fight-title">
            {game.fightStage ? FIGHT_STAGE_LABELS[game.fightStage] : "Ждём первый ход"}
          </h1>
          <p>{statusDescription}</p>
        </div>
        <div className="durak-status-actions">
          {snapshot.viewer.role === "spectator" && (
            <span className="durak-spectator-badge">Наблюдатель</span>
          )}
          {game.turnRemainingMs == null ? (
            <span className="durak-no-limit">Без лимита времени</span>
          ) : paused ? (
            <span className="durak-no-limit">Таймер заморожен</span>
          ) : (
            <Timer endTime={timerEndTime} size="large" />
          )}
          {isHost && (
            <button
              type="button"
              className="btn btn-secondary durak-manage-button"
              onClick={openManagement}
              disabled={!canManage}
            >
              Управление комнатой
              {hostSeatClaims.length > 0 ? ` · ${hostSeatClaims.length}` : ""}
            </button>
          )}
        </div>
      </section>

      <section className="durak-players" aria-label="Участники по порядку хода">
        {orderedPlayers.map((player) => {
          const seat = snapshot.seats.find((candidate) => candidate.seatId === player.seatId);
          const orderIndex = game.activeOrder.indexOf(player.seatId);
          return (
            <article
              key={player.seatId}
              className={[
                "durak-player",
                player.seatId === viewerSeatId ? "is-me" : "",
                player.isCurrentActor ? "is-current" : "",
                player.status !== "active" ? "is-inactive" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <span className="durak-player-order">{orderIndex >= 0 ? orderIndex + 1 : "—"}</span>
              <div className="durak-player-copy">
                <strong>
                  {player.name}
                  {player.seatId === viewerSeatId ? " · вы" : ""}
                </strong>
                <span>{playerStatusLabel(player)}</span>
              </div>
              <div className="durak-player-roles" aria-label={`Роли игрока ${player.name}`}>
                {seat?.isHost && <span>Хост</span>}
                {player.isDealer && <span>Сдающий</span>}
                {player.isAttacker && <span>Атакует</span>}
                {player.isDefender && <span>Защищается</span>}
                {game.throwInOrder.includes(player.seatId) && (
                  <span>Подкидывает {game.throwInOrder.indexOf(player.seatId) + 1}-м</span>
                )}
                {game.passedSeatIds.includes(player.seatId) && <span>Пас</span>}
              </div>
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
            {game.trumpCard && <DurakCard card={game.trumpCard} size="mini" />}
            {game.trumpCardLocation && (
              <small>
                {TRUMP_LOCATION_LABELS[game.trumpCardLocation]}
                {game.trumpCardHolderSeatId
                  ? ` · ${playersById.get(game.trumpCardHolderSeatId)?.name ?? "игрок"}`
                  : ""}
              </small>
            )}
          </div>
          <span className="durak-discard-count">В отбое: {game.discardCount}</span>
        </aside>

        <section className="durak-table" aria-labelledby="durak-table-title">
          <div className="durak-table-heading">
            <div>
              <span className="durak-section-eyebrow">Стол</span>
              <h2 id="durak-table-title">Бой</h2>
            </div>
            <span>
              {game.table.length}/{game.maxAttackCards || "—"} атак
            </span>
          </div>

          {game.table.length === 0 ? (
            <div className="durak-empty-table">
              {legalAction?.type === "attack"
                ? "Выберите карты одного достоинства для первой атаки."
                : "Ждём атакующего."}
            </div>
          ) : (
            <div className="durak-table-grid">
              {game.table.map((pair, index) => {
                const canTarget =
                  !pair.defense && canAct && selectedDefenseTargets.has(pair.attack.id);
                return (
                  <article className="durak-table-pair" key={pair.attack.id}>
                    <span className="durak-pair-number">Атака {index + 1}</span>
                    <div className="durak-pair-cards">
                      <div>
                        <DurakCard card={pair.attack} size="table" />
                        <span>{playersById.get(pair.attackPlayedBySeatId)?.name ?? "Игрок"}</span>
                      </div>
                      <span className="durak-pair-arrow" aria-hidden="true">
                        →
                      </span>
                      {pair.defense ? (
                        <div>
                          <DurakCard card={pair.defense} size="table" />
                          <span>
                            {pair.defensePlayedBySeatId
                              ? (playersById.get(pair.defensePlayedBySeatId)?.name ?? "Игрок")
                              : "Защита"}
                          </span>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className={`durak-defense-target ${canTarget ? "is-available" : ""}`}
                          disabled={!canTarget}
                          onClick={() => defendAttack(pair.attack.id)}
                        >
                          {canTarget ? "Побить эту карту" : "Не покрыта"}
                        </button>
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
                ? selectedDefenseCardId
                  ? "Теперь выберите подсвеченную атакующую карту на столе."
                  : "Выберите карту для защиты, затем цель на столе."
                : legalAction?.type === "attack"
                  ? "Для нескольких карт выберите одно достоинство."
                  : legalAction?.type === "throw-in"
                    ? "Можно выбрать несколько разрешённых карт."
                    : legalAction?.type === "pass"
                      ? "Подкидывать больше не обязательно."
                      : "Ожидайте своего решения."}
            </p>
          </div>
          <div className="durak-hand" role="group" aria-label="Карты в вашей руке">
            {privateGame.hand.map((card) => {
              const selectable = isCardSelectable(card);
              const selected =
                selectedCardIds.includes(card.id) || selectedDefenseCardId === card.id;
              return (
                <DurakCard
                  key={card.id}
                  card={card}
                  size="hand"
                  selected={selected}
                  playable={playableCardIds.has(card.id) && canAct}
                  disabled={!selectable}
                  onClick={() => selectHandCard(card)}
                />
              );
            })}
          </div>

          <div className="durak-action-bar" aria-live="polite">
            {commandPending ? (
              <span className="durak-action-wait">Сервер принимает действие…</span>
            ) : paused ? (
              <span className="durak-action-wait">Действия недоступны во время паузы</span>
            ) : legalAction?.type === "attack" ? (
              <>
                <span>Выбрано: {selectedCardIds.length}</span>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!canAct || selectedCardIds.length === 0}
                  onClick={sendSelectedCards}
                >
                  Атаковать
                </button>
              </>
            ) : legalAction?.type === "defend" ? (
              <>
                <span>
                  {selectedDefenseCardId ? "Выберите цель на столе" : "Выберите карту для защиты"}
                </span>
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={!canAct}
                  onClick={() => sendGameCommand("durak", { type: "take" })}
                >
                  Взять
                </button>
              </>
            ) : legalAction?.type === "throw-in" ? (
              <>
                <span>Можно подкинуть ещё: {legalAction.maxCards}</span>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!canAct || selectedCardIds.length === 0}
                  onClick={sendSelectedCards}
                >
                  Подкинуть
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={!canAct}
                  onClick={() => sendGameCommand("durak", { type: "pass" })}
                >
                  Пас
                </button>
              </>
            ) : legalAction?.type === "pass" ? (
              <>
                <span>Ваше решение в круге подкидывания</span>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={!canAct}
                  onClick={() => sendGameCommand("durak", { type: "pass" })}
                >
                  Пас
                </button>
              </>
            ) : (
              <span className="durak-action-wait">Сейчас ходит другой участник</span>
            )}
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
    </main>
  );
}
