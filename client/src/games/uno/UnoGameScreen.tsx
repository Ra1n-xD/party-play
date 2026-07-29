import { useEffect, useMemo, useRef, useState } from "react";
import type {
  UnoCard as UnoCardData,
  UnoColor,
  UnoPlayerPublicState,
} from "../../../../shared/games/uno/types";
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
import { UnoCard, UnoCardBack, getUnoCardName } from "./components/UnoCard";
import { UnoColorDialog } from "./components/UnoColorDialog";

interface UnoGameScreenProps {
  snapshot: RoomSnapshot<"uno">;
}

type ColorChoice = { mode: "initial" } | { mode: "wild"; cardId: string };

const COLOR_LABELS: Record<UnoColor, string> = {
  red: "красный",
  yellow: "жёлтый",
  green: "зелёный",
  blue: "синий",
};

function formatCardCount(count: number): string {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return `${count} карт`;
  if (mod10 === 1) return `${count} карта`;
  if (mod10 >= 2 && mod10 <= 4) return `${count} карты`;
  return `${count} карт`;
}

function playerStatusLabel(player: UnoPlayerPublicState): string {
  if (player.status === "excluded") return "Исключён";
  if (player.temporaryBot) return "Временно играет бот";
  if (player.controllerKind === "bot") return "Бот";
  if (!player.connected) return "Нет связи";
  return "В игре";
}

export function UnoGameScreen({ snapshot }: UnoGameScreenProps) {
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
  const playableCardIds = useMemo(
    () => new Set(legalActions?.playableCardIds ?? []),
    [legalActions?.playableCardIds],
  );
  const bluffableWildDrawFourIds = useMemo(
    () => new Set(legalActions?.bluffableWildDrawFourCardIds ?? []),
    [legalActions?.bluffableWildDrawFourCardIds],
  );
  const timerEndTime = useMemo(
    () =>
      !game || paused || game.turnRemainingMs == null ? null : Date.now() + game.turnRemainingMs,
    [game?.turnRemainingMs, paused, snapshot.revision],
  );
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
  const currentActor = game.currentActorSeatId ? playersById.get(game.currentActorSeatId) : null;
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
  const canManage = isHost && connected && reconnectState === "connected" && !commandPending;
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

  const chooseColor = (color: UnoColor) => {
    if (!canAct || !colorChoice) return;
    if (colorChoice.mode === "initial") {
      if (sendGameCommand("uno", { type: "choose-initial-color", color })) setColorChoice(null);
      return;
    }
    const card = privateGame?.hand.find((candidate) => candidate.id === colorChoice.cardId);
    if (card) sendPlay(card, color);
  };

  const statusDescription = paused
    ? "Партия приостановлена"
    : pendingWildDrawFour
      ? `${playersById.get(pendingWildDrawFour.targetSeatId)?.name ?? "Игрок"} решает, принять +4 или оспорить ход.`
      : game.turnKind === "initial-color"
        ? "Нужно выбрать стартовый цвет."
        : currentActor
          ? `Ходит ${currentActor.name}`
          : "Сервер завершает переход";

  return (
    <main className="screen command-game-screen uno-screen">
      <GameRoomHeader
        roomCode={snapshot.roomCode}
        connected={connected}
        onLeaveRoom={leaveRoom}
        confirmActiveLeave={snapshot.viewer.role === "player"}
        gameTitle="UNO"
        brandIcon="◆"
      />

      {isHost && (
        <ReconnectHostBanner
          players={recoverySeats}
          claimsCount={hostSeatClaims.length}
          onOpen={openManagement}
        />
      )}

      <section className="uno-status-panel" aria-labelledby="uno-status-title">
        <div>
          <span className="uno-eyebrow">Цветовой стол</span>
          <h1 id="uno-status-title">{pendingWildDrawFour ? "Решение по +4" : "Партия в игре"}</h1>
          <p>{statusDescription}</p>
        </div>
        <div className="uno-status-actions">
          {snapshot.viewer.role === "spectator" && (
            <span className="uno-spectator-badge">Наблюдатель</span>
          )}
          {game.turnRemainingMs == null ? (
            <span className="uno-no-limit">Без лимита</span>
          ) : paused ? (
            <span className="uno-no-limit">Таймер заморожен</span>
          ) : (
            <Timer endTime={timerEndTime} size="large" />
          )}
          {isHost && (
            <button
              type="button"
              className="btn btn-secondary uno-manage-button"
              onClick={openManagement}
              disabled={!canManage}
            >
              Управление комнатой{hostSeatClaims.length > 0 ? ` · ${hostSeatClaims.length}` : ""}
            </button>
          )}
        </div>
      </section>

      <section className="uno-players" aria-label="Участники по порядку хода">
        {orderedPlayers.map((player) => {
          const seat = snapshot.seats.find((candidate) => candidate.seatId === player.seatId);
          return (
            <article
              className={`uno-player ${player.seatId === viewerSeatId ? "is-me" : ""} ${player.isCurrentActor ? "is-current" : ""} ${player.status !== "active" ? "is-inactive" : ""}`}
              key={player.seatId}
            >
              <span className="uno-player-order">
                {game.activeOrder.indexOf(player.seatId) + 1 || "—"}
              </span>
              <div>
                <strong>
                  {player.name}
                  {player.seatId === viewerSeatId ? " · вы" : ""}
                </strong>
                <small>{playerStatusLabel(player)}</small>
              </div>
              <div className="uno-player-tags">
                {seat?.isHost && <span>Хост</span>}
                {player.isDealer && <span>Сдаёт</span>}
                {player.isCurrentActor && <span>Ход</span>}
              </div>
              <span className="uno-player-cards">{formatCardCount(player.cardCount)}</span>
            </article>
          );
        })}
      </section>

      <section className="uno-table" aria-labelledby="uno-table-title">
        <div className="uno-table-heading">
          <div>
            <span className="uno-eyebrow">Стол</span>
            <h2 id="uno-table-title">
              Активный цвет: {game.activeColor ? COLOR_LABELS[game.activeColor] : "—"}
            </h2>
          </div>
          <span
            className={`uno-direction is-${game.direction}`}
            aria-label={
              game.direction === "clockwise" ? "По часовой стрелке" : "Против часовой стрелки"
            }
          >
            {game.direction === "clockwise" ? "↻" : "↺"}
          </span>
        </div>
        <div className="uno-piles">
          <button
            type="button"
            className="uno-pile uno-draw-pile"
            disabled={!canAct || !legalActions?.canDraw}
            onClick={() => sendGameCommand("uno", { type: "draw-card" })}
            aria-label={`Взять карту. В колоде ${formatCardCount(game.drawPileCount)}`}
          >
            <UnoCardBack label={`Колода, осталось ${formatCardCount(game.drawPileCount)}`} />
            <span>Колода · {game.drawPileCount}</span>
          </button>
          <div
            className="uno-pile"
            role="group"
            aria-label={`Отбой. ${game.discardPileCount} карт`}
          >
            {game.topDiscard ? (
              <UnoCard card={game.topDiscard} />
            ) : (
              <div className="uno-empty-card">—</div>
            )}
            <span>Отбой · {game.discardPileCount}</span>
          </div>
        </div>
        {pendingWildDrawFour && (
          <section className="uno-wdf-panel" aria-labelledby="uno-wdf-title">
            <div>
              <span className="uno-eyebrow">Wild +4</span>
              <h3 id="uno-wdf-title">Проверка рискованного хода</h3>
              <p>
                {playersById.get(pendingWildDrawFour.sourceSeatId)?.name ?? "Игрок"} объявил цвет «
                {COLOR_LABELS[pendingWildDrawFour.declaredColor]}».
              </p>
            </div>
            {ownWdfResponse ? (
              <div className="uno-wdf-actions">
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
              </div>
            ) : (
              <span className="uno-wdf-wait">Ждём решения защищающегося</span>
            )}
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

      {privateGame ? (
        <section className="uno-hand-section" aria-labelledby="uno-hand-title">
          <div className="uno-hand-heading">
            <div>
              <span className="uno-eyebrow">Личные карты</span>
              <h2 id="uno-hand-title">Ваша рука · {formatCardCount(privateGame.hand.length)}</h2>
            </div>
            {canOfferAtomicUnoIntent && (
              <button
                type="button"
                className={`uno-declare-intent ${declareWithPlay ? "is-active" : ""}`}
                aria-pressed={declareWithPlay}
                disabled={!canAct}
                onClick={() => setDeclareWithPlay((value) => !value)}
              >
                {declareWithPlay ? "UNO будет объявлено с ходом" : "Объявить UNO вместе с ходом"}
              </button>
            )}
          </div>
          <div className="uno-hand" role="group" aria-label="Карты в вашей руке">
            {privateGame.hand.map((card) => {
              const playable = playableCardIds.has(card.id);
              const bluffable = bluffableWildDrawFourIds.has(card.id);
              const isDrawnCard = legalActions?.drawnCardId === card.id;
              const allowed = playable || bluffable;
              return (
                <UnoCard
                  key={card.id}
                  card={card}
                  size="hand"
                  playable={playable && canAct}
                  bluffable={bluffable && canAct}
                  disabled={!canAct || !allowed}
                  onClick={() => playCard(card)}
                  ariaLabel={`${getUnoCardName(card)}${bluffable ? ". Рискованный Wild +4" : ""}${isDrawnCard ? ". Добрана сейчас" : ""}`}
                />
              );
            })}
          </div>
          <div className="uno-action-bar" aria-live="polite">
            {commandPending ? (
              <span>Сервер принимает действие…</span>
            ) : paused ? (
              <span>Действия недоступны во время паузы</span>
            ) : legalActions?.canChooseInitialColor ? (
              <button
                type="button"
                className="btn btn-primary"
                disabled={!canAct}
                onClick={() => setColorChoice({ mode: "initial" })}
              >
                Выбрать стартовый цвет
              </button>
            ) : (
              <>
                {canPreDeclareUno && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={!canAct}
                    onClick={() => sendGameCommand("uno", { type: "declare-uno" })}
                  >
                    Объявить UNO заранее
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
                {!legalActions?.canDraw && !legalActions?.canEndTurn && !ownWdfResponse && (
                  <span>
                    {playableCardIds.size > 0
                      ? "Выберите доступную карту"
                      : "Сейчас ходит другой участник"}
                  </span>
                )}
              </>
            )}
          </div>
          {game.unoWindow && (legalActions?.canDeclareUno || legalActions?.catchUno) && (
            <section className="uno-window-panel" aria-label="Окно объявления UNO">
              {canPostDeclareUno && (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!canAct}
                  onClick={() =>
                    sendGameCommand("uno", {
                      type: "declare-uno",
                      ...(legalActions.declareUnoWindowId != null
                        ? { windowId: legalActions.declareUnoWindowId }
                        : {}),
                    })
                  }
                >
                  Сказать UNO!
                </button>
              )}
              {legalActions.catchUno && (
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
            </section>
          )}
        </section>
      ) : snapshot.viewer.role === "spectator" ? (
        <section className="uno-public-only" role="status">
          <strong>Режим наблюдателя</strong>
          <span>Руки игроков скрыты. Доступно только публичное состояние стола.</span>
        </section>
      ) : (
        <section className="uno-public-only" role="status">
          <strong>Загружаем вашу руку…</strong>
          <span>Публичное состояние уже доступно.</span>
        </section>
      )}

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
    </main>
  );
}
