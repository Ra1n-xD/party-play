import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  ActionCard,
  Attribute,
  AttributeType,
  BunkerGamePhase,
  BunkerPlayerInfo,
  BunkerPublicState,
  Character,
} from "../../../../../shared/games/bunker/types";
import type { SeatClaimInfo } from "../../../../../shared/platform/protocol";
import { usePlatform, type HostChangeNotice } from "../../../platform/context/PlatformContext";

export type ClientGameState = BunkerPublicState & { phaseEndTime: number | null };

export type OverlayItem =
  | {
      kind: "announcement";
      title: string;
      subtitle?: string;
      description?: string;
      duration: number;
    }
  | { kind: "attribute"; playerName: string; attribute: Attribute; duration: number }
  | { kind: "actionCard"; playerName: string; actionCard: ActionCard; duration: number };

interface BunkerGameContextValue {
  connected: boolean;
  roomCode: string | null;
  playerId: string | null;
  isSpectator: boolean;
  gameState: ClientGameState | null;
  myCharacter: Character | null;
  myHasVoted: boolean;
  error: string | null;
  reconnectState: "idle" | "reconnecting" | "connected";
  hostSeatClaims: SeatClaimInfo[];
  hostChangeNotice: HostChangeNotice | null;
  setReady: (ready: boolean) => void;
  startGame: () => void;
  revealAttribute: (attributeIndex?: number) => void;
  revealActionCard: () => void;
  castVote: (targetId: string) => boolean;
  endGame: () => void;
  playAgain: () => void;
  leaveRoom: () => void;
  clearError: () => void;
  addBot: () => void;
  removeBot: (playerId: string) => void;
  adminShuffleAll: (attributeType: AttributeType | "action") => void;
  adminSwapAttribute: (
    player1Id: string,
    player2Id: string,
    attributeType: AttributeType | "action",
  ) => void;
  adminReplaceAttribute: (targetPlayerId: string, attributeType: AttributeType | "action") => void;
  adminRemoveBunkerCard: (cardIndex: number) => void;
  adminReplaceBunkerCard: (cardIndex: number) => void;
  adminDeleteAttribute: (targetPlayerId: string, attributeType: AttributeType) => void;
  adminForceRevealType: (attributeType: AttributeType) => void;
  adminPause: () => void;
  adminUnpause: () => void;
  adminSkipDiscussion: () => void;
  adminRevivePlayer: (targetPlayerId: string) => void;
  adminEliminatePlayer: (targetPlayerId: string) => void;
  resolveSeatClaim: (requestId: string, approved: boolean) => void;
  assignTemporaryBot: (targetPlayerId: string) => void;
  returnHumanControl: (targetPlayerId: string) => void;
  kickPlayer: (targetPlayerId: string) => void;
  transferHost: (targetPlayerId: string) => void;
  clearHostChangeNotice: () => void;
  currentOverlay: OverlayItem | null;
  pendingAdminOpen: boolean;
  consumePendingAdminOpen: () => void;
}

const BunkerGameContext = createContext<BunkerGameContextValue | null>(null);

function getPauseKind(
  adminPaused: boolean,
  disconnectedPlayerIds: readonly string[],
): BunkerPublicState["pauseKind"] {
  const reconnectPaused = disconnectedPlayerIds.length > 0;
  if (adminPaused && reconnectPaused) return "mixed";
  if (adminPaused) return "admin";
  if (reconnectPaused) return "reconnect";
  return "none";
}

function mergePlatformPlayers(
  gamePlayers: BunkerPlayerInfo[],
  seats: readonly {
    seatId: string;
    name: string;
    ready: boolean;
    connected: boolean;
    closed: boolean;
    isHost: boolean;
    occupantKind: "human" | "bot";
    temporaryBot: boolean;
  }[],
): BunkerPlayerInfo[] {
  const seatsById = new Map(seats.map((seat) => [seat.seatId, seat]));
  return gamePlayers.map((player) => {
    const seat = seatsById.get(player.id);
    if (!seat) return player;
    return {
      ...player,
      name: seat.name,
      ready: seat.ready,
      connected: seat.connected,
      isHost: seat.isHost,
      isBot: seat.occupantKind === "bot",
      temporaryBot: seat.temporaryBot,
      kicked: seat.closed,
    };
  });
}

export function BunkerGameProvider({ children }: { children: ReactNode }) {
  const platform = usePlatform();
  const [overlayQueue, setOverlayQueue] = useState<OverlayItem[]>([]);
  const [currentOverlay, setCurrentOverlay] = useState<OverlayItem | null>(null);
  const [pendingAdminOpen, setPendingAdminOpen] = useState(false);
  const previousPhaseRef = useRef<BunkerGamePhase | null>(null);
  const processedEventSequenceRef = useRef(0);

  const bunkerSnapshot = platform.snapshot?.gameId === "bunker" ? platform.snapshot : null;

  const gameState = useMemo<ClientGameState | null>(() => {
    const game = bunkerSnapshot?.game;
    if (!game) return null;

    const disconnectedPlayerIds = [...bunkerSnapshot.pause.disconnectedSeatIds];
    return {
      ...game,
      players: mergePlatformPlayers(game.players, bunkerSnapshot.seats),
      paused: bunkerSnapshot.pause.active,
      pauseKind: getPauseKind(bunkerSnapshot.pause.admin, disconnectedPlayerIds),
      disconnectedPlayerIds,
      spectatorCount: bunkerSnapshot.spectatorCount,
      phaseEndTime: game.phaseRemainingMs == null ? null : Date.now() + game.phaseRemainingMs,
    };
  }, [bunkerSnapshot]);

  const privateState =
    bunkerSnapshot?.viewer.role === "player" ? bunkerSnapshot.viewer.privateGame : null;
  const myCharacter = privateState?.character ?? null;
  const privateVoterStatus = privateState?.voterStatus ?? null;
  const myHasVoted = Boolean(
    privateVoterStatus &&
    gameState &&
    privateVoterStatus.phase === gameState.phase &&
    privateVoterStatus.roundNumber === gameState.roundNumber &&
    privateVoterStatus.currentVotingInRound === gameState.currentVotingInRound &&
    privateVoterStatus.hasVoted,
  );

  const enqueueOverlay = useCallback((item: OverlayItem) => {
    setOverlayQueue((current) => [...current, item]);
  }, []);

  useEffect(() => {
    if (currentOverlay || overlayQueue.length === 0) return;
    const [next, ...rest] = overlayQueue;
    setOverlayQueue(rest);
    setCurrentOverlay(next);
  }, [currentOverlay, overlayQueue]);

  useEffect(() => {
    if (!currentOverlay) return;
    const timer = window.setTimeout(() => {
      if (currentOverlay.kind === "actionCard") setPendingAdminOpen(true);
      setCurrentOverlay(null);
    }, currentOverlay.duration);
    return () => window.clearTimeout(timer);
  }, [currentOverlay]);

  useEffect(() => {
    previousPhaseRef.current = null;
    processedEventSequenceRef.current = 0;
    setOverlayQueue([]);
    setCurrentOverlay(null);
    setPendingAdminOpen(false);
  }, [platform.roomCode]);

  const latestGameEventSequence =
    platform.gameEvents[platform.gameEvents.length - 1]?.sequence ?? 0;

  useEffect(() => {
    if (bunkerSnapshot?.lifecycle !== "lobby") return;
    previousPhaseRef.current = null;
    processedEventSequenceRef.current = latestGameEventSequence;
    setOverlayQueue([]);
    setCurrentOverlay(null);
    setPendingAdminOpen(false);
  }, [bunkerSnapshot?.lifecycle, latestGameEventSequence]);

  useEffect(() => {
    if (!gameState) return;
    const previousPhase = previousPhaseRef.current;
    const nextPhase = gameState.phase;
    if (previousPhase === nextPhase) return;
    previousPhaseRef.current = nextPhase;

    if (nextPhase === "CATASTROPHE_REVEAL" && gameState.catastrophe) {
      enqueueOverlay({
        kind: "announcement",
        duration: 3000,
        title: "Катастрофа!",
        subtitle: gameState.catastrophe.title,
        description: gameState.catastrophe.description,
      });
    } else if (nextPhase === "BUNKER_EXPLORE" && gameState.revealedBunkerCards.length > 0) {
      const lastCard = gameState.revealedBunkerCards[gameState.revealedBunkerCards.length - 1];
      enqueueOverlay({
        kind: "announcement",
        duration: 3000,
        title: "Новая карта бункера",
        subtitle: lastCard.title,
        description: lastCard.description,
      });
    } else if (nextPhase === "ROUND_REVEAL") {
      enqueueOverlay({
        kind: "announcement",
        duration: 3000,
        title: `Раунд ${gameState.roundNumber}`,
        subtitle: "Раскрытие карт",
      });
    } else if (nextPhase === "ROUND_DISCUSSION") {
      enqueueOverlay({
        kind: "announcement",
        duration: 3000,
        title: "Обсуждение",
        subtitle: `Раунд ${gameState.roundNumber}`,
      });
    } else if (nextPhase === "ROUND_VOTE") {
      enqueueOverlay({
        kind: "announcement",
        duration: 3000,
        title: "Голосование",
        subtitle: `Раунд ${gameState.roundNumber}`,
      });
    } else if (nextPhase === "ROUND_VOTE_TIEBREAK") {
      enqueueOverlay({
        kind: "announcement",
        duration: 3000,
        title: "Переголосование",
        subtitle: "Ничья! Повторное голосование",
      });
    } else if (nextPhase === "ROUND_RESULT" && gameState.eliminatedPlayerId) {
      const eliminated = gameState.players.find(
        (player) => player.id === gameState.eliminatedPlayerId,
      );
      enqueueOverlay({
        kind: "announcement",
        duration: 3000,
        title: "Изгнан!",
        subtitle: eliminated?.name ?? "Игрок",
      });
    }
  }, [enqueueOverlay, gameState]);

  useEffect(() => {
    for (const queuedEvent of platform.gameEvents) {
      if (queuedEvent.sequence <= processedEventSequenceRef.current) continue;
      processedEventSequenceRef.current = queuedEvent.sequence;
      if (queuedEvent.payload.gameId !== "bunker") continue;

      const event = queuedEvent.payload.event;
      if (event.type === "attribute-revealed") {
        enqueueOverlay({
          kind: "attribute",
          playerName: event.playerName,
          attribute: event.attribute,
          duration: 4000,
        });
      } else if (event.type === "action-card-revealed") {
        enqueueOverlay({
          kind: "actionCard",
          playerName: event.playerName,
          actionCard: event.actionCard,
          duration: 10000,
        });
      }
    }
  }, [enqueueOverlay, platform.gameEvents]);

  const revealAttribute = useCallback(
    (attributeIndex?: number) => {
      platform.sendGameCommand("bunker", { type: "reveal-attribute", attributeIndex });
    },
    [platform.sendGameCommand],
  );

  const revealActionCard = useCallback(() => {
    platform.sendGameCommand("bunker", { type: "reveal-action-card" });
  }, [platform.sendGameCommand]);

  const castVote = useCallback(
    (targetId: string) =>
      platform.sendGameCommand("bunker", { type: "cast-vote", targetSeatId: targetId }),
    [platform.sendGameCommand],
  );

  const consumePendingAdminOpen = useCallback(() => setPendingAdminOpen(false), []);

  return (
    <BunkerGameContext.Provider
      value={{
        connected: platform.connected,
        roomCode: platform.roomCode,
        playerId:
          bunkerSnapshot?.viewer.role === "player"
            ? bunkerSnapshot.viewer.seatId
            : platform.playerId,
        isSpectator: platform.isSpectator,
        gameState,
        myCharacter,
        myHasVoted,
        error: platform.error,
        reconnectState: platform.reconnectState,
        hostSeatClaims: platform.hostSeatClaims,
        hostChangeNotice: platform.hostChangeNotice,
        setReady: (ready) => {
          platform.setReady(ready);
        },
        startGame: () => {
          platform.startGame();
        },
        revealAttribute,
        revealActionCard,
        castVote,
        endGame: () => {
          platform.sendGameCommand("bunker", { type: "force-end" });
        },
        playAgain: () => {
          platform.playAgain();
        },
        leaveRoom: platform.leaveRoom,
        clearError: platform.clearError,
        addBot: () => {
          platform.addBot();
        },
        removeBot: (seatId) => {
          platform.removeBot(seatId);
        },
        adminShuffleAll: (attributeType) => {
          platform.sendGameCommand("bunker", { type: "shuffle-all", attributeType });
        },
        adminSwapAttribute: (firstSeatId, secondSeatId, attributeType) => {
          platform.sendGameCommand("bunker", {
            type: "swap-attribute",
            firstSeatId,
            secondSeatId,
            attributeType,
          });
        },
        adminReplaceAttribute: (seatId, attributeType) => {
          platform.sendGameCommand("bunker", {
            type: "replace-attribute",
            seatId,
            attributeType,
          });
        },
        adminRemoveBunkerCard: (cardIndex) => {
          platform.sendGameCommand("bunker", { type: "remove-bunker-card", cardIndex });
        },
        adminReplaceBunkerCard: (cardIndex) => {
          platform.sendGameCommand("bunker", { type: "replace-bunker-card", cardIndex });
        },
        adminDeleteAttribute: (seatId, attributeType) => {
          platform.sendGameCommand("bunker", {
            type: "delete-attribute",
            seatId,
            attributeType,
          });
        },
        adminForceRevealType: (attributeType) => {
          platform.sendGameCommand("bunker", { type: "force-reveal-type", attributeType });
        },
        adminPause: () => {
          platform.setAdminPause(true);
        },
        adminUnpause: () => {
          platform.setAdminPause(false);
        },
        adminSkipDiscussion: () => {
          platform.sendGameCommand("bunker", { type: "skip-discussion" });
        },
        adminRevivePlayer: (seatId) => {
          platform.sendGameCommand("bunker", { type: "revive-seat", seatId });
        },
        adminEliminatePlayer: (seatId) => {
          platform.sendGameCommand("bunker", { type: "eliminate-seat", seatId });
        },
        resolveSeatClaim: (requestId, approved) => {
          platform.resolveSeatClaim(requestId, approved);
        },
        assignTemporaryBot: (seatId) => {
          platform.assignTemporaryBot(seatId);
        },
        returnHumanControl: (seatId) => {
          platform.returnHumanControl(seatId);
        },
        kickPlayer: (seatId) => {
          platform.kickPlayer(seatId);
        },
        transferHost: (seatId) => {
          platform.transferHost(seatId);
        },
        clearHostChangeNotice: platform.clearHostChangeNotice,
        currentOverlay,
        pendingAdminOpen,
        consumePendingAdminOpen,
      }}
    >
      {children}
    </BunkerGameContext.Provider>
  );
}

export function useBunkerGame(): BunkerGameContextValue {
  const context = useContext(BunkerGameContext);
  if (!context) {
    throw new Error("useBunkerGame must be used within BunkerGameProvider");
  }
  return context;
}

export const GameProvider = BunkerGameProvider;
export const useGame = useBunkerGame;
