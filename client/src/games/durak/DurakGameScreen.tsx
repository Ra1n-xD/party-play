import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { FiSettings } from "react-icons/fi";
import type {
  DurakCard as DurakCardData,
  DurakLegalAction,
  DurakPlayerPublicState,
  DurakRank,
  DurakSuit,
  DurakVisualAction,
} from "../../../../shared/games/durak/types";
import type {
  CardTransferVisualEvent,
  PlayerActionVisualEvent,
} from "../../../../shared/platform/cardVisualEvents";
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
import { useDurakTransferPresentation } from "./useDurakTransferPresentation";

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

const DURAK_SUIT_ORDER: Record<DurakSuit, number> = {
  clubs: 0,
  diamonds: 1,
  hearts: 2,
  spades: 3,
};

const DURAK_SUIT_LABELS: Record<DurakSuit, string> = {
  clubs: "трефы",
  diamonds: "бубны",
  hearts: "червы",
  spades: "пики",
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

type DurakShownAction = Extract<DurakVisualAction, "beat" | "pass" | "take">;

interface CachedDurakTableCard {
  element: HTMLElement;
  rect: DOMRect;
}

const DURAK_ACTION_LABELS: Readonly<Record<DurakShownAction, string>> = {
  beat: "Бито",
  pass: "Пас",
  take: "Беру",
};

const DURAK_HAND_CARD_SOURCE_ATTRIBUTE = "data-durak-hand-card-source";
const DURAK_TABLE_CARD_ATTRIBUTE = "data-durak-table-card";
const DURAK_TABLE_RESOLUTION_DURATION_MS = 1_650;
const DURAK_TABLE_RESOLUTION_STAGGER_MS = 100;
const DURAK_TABLE_RESOLUTION_CLEANUP_BUFFER_MS = 250;
const DURAK_LOCAL_DROP_SUPPRESSION_MS = 5_000;

function isDurakShownAction(action: DurakVisualAction): action is DurakShownAction {
  return action === "beat" || action === "pass" || action === "take";
}

function isDurakTableResolutionEvent(event: CardTransferVisualEvent): boolean {
  return (
    event.source.kind === "table" &&
    (event.target.kind === "discard" || event.target.kind === "player")
  );
}

function shouldRenderGenericDurakTransfer(event: CardTransferVisualEvent): boolean {
  return !isDurakTableResolutionEvent(event);
}

function findDurakMotionTarget(
  event: CardTransferVisualEvent,
  viewerSeatId: string | null,
): HTMLElement | null {
  if (event.target.kind === "player") {
    const targetSeatId = event.target.seatId;
    if (targetSeatId === viewerSeatId) {
      const handTarget = Array.from(
        document.querySelectorAll<HTMLElement>("[data-card-motion-anchor]"),
      ).find((element) => element.getAttribute("data-card-motion-anchor") === "durak:hand");
      if (handTarget) return handTarget;
    }
    return (
      Array.from(document.querySelectorAll<HTMLElement>("[data-card-player-seat]")).find(
        (element) => element.getAttribute("data-card-player-seat") === targetSeatId,
      ) ?? null
    );
  }
  return (
    Array.from(document.querySelectorAll<HTMLElement>("[data-card-motion-anchor]")).find(
      (element) => element.getAttribute("data-card-motion-anchor") === "durak:discard",
    ) ?? null
  );
}

function useDurakTableResolutionMotion(
  revision: string | number,
  events: readonly CardTransferVisualEvent[],
  tableCardCount: number,
  viewerSeatId: string | null,
): void {
  const previousEventIdsRef = useRef<Set<number> | null>(null);
  const cachedCardsRef = useRef<CachedDurakTableCard[]>([]);
  const pendingEventRef = useRef<CardTransferVisualEvent | null>(null);
  const activeFlightsRef = useRef<HTMLElement[]>([]);
  const cleanupTimersRef = useRef<number[]>([]);

  useLayoutEffect(() => {
    const currentEventIds = new Set(events.map((event) => event.id));
    const previousEventIds = previousEventIdsRef.current;
    previousEventIdsRef.current = currentEventIds;

    if (previousEventIds) {
      const freshResolutionEvent = [...events]
        .reverse()
        .find((event) => !previousEventIds.has(event.id) && isDurakTableResolutionEvent(event));
      if (freshResolutionEvent) pendingEventRef.current = freshResolutionEvent;
    }

    const pendingEvent = pendingEventRef.current;
    if (tableCardCount === 0 && pendingEvent) {
      const target = findDurakMotionTarget(pendingEvent, viewerSeatId);
      const cachedCards = cachedCardsRef.current.slice(0, pendingEvent.cardCount);
      if (target && cachedCards.length > 0) {
        const targetRect = target.getBoundingClientRect();
        const targetCenterX = targetRect.left + targetRect.width / 2;
        const targetCenterY = targetRect.top + targetRect.height / 2;

        cachedCards.forEach((cachedCard, index) => {
          const sourceCenterX = cachedCard.rect.left + cachedCard.rect.width / 2;
          const sourceCenterY = cachedCard.rect.top + cachedCard.rect.height / 2;
          const flightDelay = Math.min(index, 2) * DURAK_TABLE_RESOLUTION_STAGGER_MS;
          const flight = cachedCard.element.cloneNode(true) as HTMLElement;
          flight.classList.add("durak-table-resolution-flight");
          flight.setAttribute("aria-hidden", "true");
          flight.style.left = `${cachedCard.rect.left}px`;
          flight.style.top = `${cachedCard.rect.top}px`;
          flight.style.width = `${cachedCard.rect.width}px`;
          flight.style.height = `${cachedCard.rect.height}px`;
          flight.style.setProperty(
            "--durak-table-resolution-x",
            `${targetCenterX - sourceCenterX}px`,
          );
          flight.style.setProperty(
            "--durak-table-resolution-y",
            `${targetCenterY - sourceCenterY}px`,
          );
          flight.style.setProperty("--durak-table-resolution-delay", `${flightDelay}ms`);
          flight.style.setProperty(
            "--durak-table-resolution-duration",
            `${DURAK_TABLE_RESOLUTION_DURATION_MS}ms`,
          );
          flight.style.setProperty("--durak-table-resolution-tilt", `${((index % 5) - 2) * 2}deg`);
          document.body.append(flight);
          activeFlightsRef.current.push(flight);

          const cleanupTimer = window.setTimeout(
            () => {
              flight.remove();
              activeFlightsRef.current = activeFlightsRef.current.filter(
                (candidate) => candidate !== flight,
              );
              cleanupTimersRef.current = cleanupTimersRef.current.filter(
                (candidate) => candidate !== cleanupTimer,
              );
            },
            flightDelay +
              DURAK_TABLE_RESOLUTION_DURATION_MS +
              DURAK_TABLE_RESOLUTION_CLEANUP_BUFFER_MS,
          );
          cleanupTimersRef.current.push(cleanupTimer);
        });
      }

      pendingEventRef.current = null;
      cachedCardsRef.current = [];
    }

    if (tableCardCount > 0) {
      cachedCardsRef.current = Array.from(
        document.querySelectorAll<HTMLElement>(`[${DURAK_TABLE_CARD_ATTRIBUTE}]`),
      ).flatMap((wrapper): CachedDurakTableCard[] => {
        const card = wrapper.querySelector<HTMLElement>(".durak-card");
        if (!card) return [];
        return [
          { element: card.cloneNode(true) as HTMLElement, rect: card.getBoundingClientRect() },
        ];
      });
    }
  }, [events, revision, tableCardCount, viewerSeatId]);

  useEffect(
    () => () => {
      cleanupTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      cleanupTimersRef.current = [];
      activeFlightsRef.current.forEach((flight) => flight.remove());
      activeFlightsRef.current = [];
      cachedCardsRef.current = [];
      pendingEventRef.current = null;
      previousEventIdsRef.current = null;
    },
    [],
  );
}

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
  if (
    !legalAction ||
    legalAction.type === "wait" ||
    legalAction.type === "pass" ||
    legalAction.type === "beat"
  ) {
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
    clearError,
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
  const recentLocalDropIdsRef = useRef<Map<string, number>>(new Map());

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
          sourceId: pair.attack.id,
          targetId: `durak-attack-flight:${pair.attack.id}`,
          suppress:
            pair.attackPlayedBySeatId === viewerSeatId &&
            Date.now() - (recentLocalDropIdsRef.current.get(pair.attack.id) ?? 0) <
              DURAK_LOCAL_DROP_SUPPRESSION_MS,
        },
        ...(pair.defense && pair.defensePlayedBySeatId
          ? [
              {
                key: `defense:${pair.defense.id}`,
                sourceSeatId: pair.defensePlayedBySeatId,
                sourceId: pair.defense.id,
                targetId: `durak-defense-flight:${pair.defense.id}`,
                suppress:
                  pair.defensePlayedBySeatId === viewerSeatId &&
                  Date.now() - (recentLocalDropIdsRef.current.get(pair.defense.id) ?? 0) <
                    DURAK_LOCAL_DROP_SUPPRESSION_MS,
              },
            ]
          : []),
      ]) ?? [],
    [game?.table, viewerSeatId],
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
        if (event.type !== "action" || !isDurakShownAction(event.action)) return [];
        return [
          {
            id: event.id,
            type: "action",
            seatId: event.seatId,
            action: event.action,
          },
        ];
      }) ?? [],
    [game?.visualEvents],
  );
  const transientActionIndicators = usePlayerActionIndicators(actionEvents, DURAK_ACTION_LABELS);
  const persistentActionIndicators = useMemo(() => {
    const indicators: Record<string, { eventId: string; label: string }> = {};
    for (const seatId of game?.passedSeatIds ?? []) {
      const isPrimaryAttacker = seatId === game?.attackerSeatId && game?.takeDeclared === false;
      indicators[seatId] = {
        eventId: `${isPrimaryAttacker ? "beat" : "pass"}:${seatId}`,
        label: isPrimaryAttacker ? "Бито" : "Пас",
      };
    }
    if (game?.takeDeclared && game.defenderSeatId) {
      indicators[game.defenderSeatId] = {
        eventId: `take:${game.defenderSeatId}`,
        label: "Беру",
      };
    }
    return indicators;
  }, [game?.attackerSeatId, game?.defenderSeatId, game?.passedSeatIds, game?.takeDeclared]);
  const actionIndicators = useMemo(
    () => ({ ...persistentActionIndicators, ...transientActionIndicators }),
    [persistentActionIndicators, transientActionIndicators],
  );
  const playerTargetAnchors = useMemo<Readonly<Record<string, string>>>(
    () => (viewerSeatId ? { [viewerSeatId]: "durak:hand" } : {}),
    [viewerSeatId],
  );
  const tableCardCount =
    game?.table.reduce((count, pair) => count + (pair.defense ? 2 : 1), 0) ?? 0;
  const transferPresentation = useDurakTransferPresentation({
    revision: snapshot.revision,
    events: transferEvents,
    players: game?.players ?? [],
    deckCount: game?.deckCount ?? 0,
    hand: privateGame?.hand ?? [],
    viewerSeatId,
    animateInitial: animateInitialDeal,
  });
  const presentedHand = displayedHand.filter(
    (card) => transferPresentation.handArrivalPhases[card.id] !== "hidden",
  );

  useDurakTableResolutionMotion(snapshot.revision, transferEvents, tableCardCount, viewerSeatId);
  useTableCardFlight({
    revision: snapshot.revision,
    flights: tableFlights,
    sourceDataAttribute: DURAK_HAND_CARD_SOURCE_ATTRIBUTE,
    sourceElementSelector: ".durak-card",
  });
  useCardTransferMotion({
    gameId: "durak",
    revision: snapshot.revision,
    events: transferEvents,
    animateInitial: animateInitialDeal,
    playerTargetAnchors,
    shouldRenderEvent: shouldRenderGenericDurakTransfer,
  });
  useEffect(() => {
    const tableCardIds = new Set(
      game?.table.flatMap((pair) => [pair.attack.id, ...(pair.defense ? [pair.defense.id] : [])]) ??
        [],
    );
    const now = Date.now();
    for (const [cardId, droppedAt] of recentLocalDropIdsRef.current) {
      if (tableCardIds.has(cardId) || now - droppedAt >= DURAK_LOCAL_DROP_SUPPRESSION_MS) {
        recentLocalDropIdsRef.current.delete(cardId);
      }
    }
  }, [game?.table, snapshot.revision]);
  useEffect(() => {
    if (error) recentLocalDropIdsRef.current.clear();
  }, [error]);
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
        clearError();
        if (payload.kind === "attack") {
          const sent = sendGameCommand("durak", {
            type: payload.action,
            cardIds: payload.cardIds,
          });
          if (sent) {
            const droppedAt = Date.now();
            payload.cardIds.forEach((cardId) =>
              recentLocalDropIdsRef.current.set(cardId, droppedAt),
            );
          }
          return;
        }

        const attackCardId = targetId.slice("durak-attack:".length);
        if (!attackCardId) return;
        const sent = sendGameCommand("durak", {
          type: "defend",
          cardId: payload.card.id,
          attackCardId,
        });
        if (sent) recentLocalDropIdsRef.current.set(payload.card.id, Date.now());
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
  const orderedPlayers = game.players;
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
  const presentedDeckCount = transferPresentation.deckCountOverride ?? game.deckCount;
  const handFanAngleStep = Math.min(1.5, 9 / Math.max(presentedHand.length - 1, 1));
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
        cardCount={transferPresentation.cardCountOverrides[player.seatId] ?? player.cardCount}
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
        turnSemantics={game.fightStage === "attack" ? "exclusive-turn" : "simultaneous-decision"}
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
          <aside
            className={`durak-deck-panel ${presentedDeckCount === 0 ? "is-empty" : ""}`}
            aria-label="Колода и козырь"
          >
            <div
              className={`durak-deck-visual ${presentedDeckCount > 0 ? "has-cards" : ""}`}
              data-card-motion-anchor="durak:deck"
            >
              {presentedDeckCount > 0 ? (
                <DurakCardBack label={`Колода, осталось ${formatCardCount(presentedDeckCount)}`} />
              ) : (
                <div
                  className={`durak-empty-deck is-trump-marker ${
                    game.trumpSuit === "diamonds" || game.trumpSuit === "hearts"
                      ? "is-red"
                      : "is-black"
                  }`}
                  role="status"
                  aria-label={`Колода пуста. Козырь — ${
                    game.trumpSuit ? DURAK_SUIT_LABELS[game.trumpSuit] : "не определён"
                  }`}
                >
                  <span aria-hidden="true">
                    {game.trumpSuit ? getSuitSymbol(game.trumpSuit) : "—"}
                  </span>
                </div>
              )}
              <strong aria-label={`В колоде ${formatCardCount(presentedDeckCount)}`}>
                {presentedDeckCount}
              </strong>
            </div>
            {presentedDeckCount > 0 && (
              <div
                className={`durak-trump ${
                  game.trumpCard &&
                  (game.trumpCardLocation === "deck" || presentedDeckCount > game.deckCount)
                    ? "has-card"
                    : "is-status"
                }`}
              >
                {game.trumpCard &&
                (game.trumpCardLocation === "deck" || presentedDeckCount > game.deckCount) ? (
                  <DurakCard card={game.trumpCard} size="table" />
                ) : (
                  <span className="durak-trump-status" role="status">
                    <strong>{game.trumpSuit ? getSuitSymbol(game.trumpSuit) : "—"}</strong>
                    <small>Козырь вне колоды</small>
                  </span>
                )}
              </div>
            )}
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
                          className="durak-table-card-flight-shell is-attack"
                          data-table-card-flight={`durak-attack-flight:${pair.attack.id}`}
                        >
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
                            data-durak-table-card={pair.attack.id}
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
                        </div>
                        {pair.defense && (
                          <div
                            className="durak-table-card-flight-shell is-defense"
                            data-table-card-flight={`durak-defense-flight:${pair.defense.id}`}
                          >
                            <div
                              className="durak-pair-card is-defense"
                              data-durak-table-card={pair.defense.id}
                            >
                              <DurakCard
                                card={pair.defense}
                                size="table"
                                ariaLabel={`${defenderName} побил: ${getCardName(pair.defense)}`}
                              />
                            </div>
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
              data-card-motion-anchor="durak:hand"
              style={{ "--hand-count": presentedHand.length } as CSSProperties}
            >
              {presentedHand.map((card, index) => {
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
                    className={`durak-hand-card-shell ${dragClassName ?? "card-motion-shell"} ${
                      transferPresentation.handArrivalPhases[card.id]
                        ? `is-${transferPresentation.handArrivalPhases[card.id]}`
                        : ""
                    }`}
                    data-durak-hand-card-source={card.id}
                    style={
                      {
                        "--card-index": Math.min(index, 5),
                        "--fan-angle": `${
                          (index - (presentedHand.length - 1) / 2) * handFanAngleStep
                        }deg`,
                        "--fan-rise": `${Math.abs(index - (presentedHand.length - 1) / 2) * 1.2}px`,
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
          {(legalAction?.type === "pass" ||
            (legalAction?.type === "throw-in" && legalAction.canPass)) && (
            <button
              type="button"
              className="btn durak-finish-action"
              disabled={!canAct}
              onClick={() => sendGameCommand("durak", { type: "pass" })}
            >
              Пас
            </button>
          )}
          {(legalAction?.type === "beat" ||
            (legalAction?.type === "throw-in" && legalAction.canBeat)) && (
            <button
              type="button"
              className="btn durak-finish-action"
              disabled={!canAct}
              onClick={() => sendGameCommand("durak", { type: "beat" })}
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
            disabled={!canManage}
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
