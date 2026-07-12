import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { socket } from "../socket";
import {
  PublicGameState,
  Character,
  AttributeType,
  ActionCard,
  Attribute,
  GamePhase,
  HostChangeReason,
  ReconnectableSeat,
  SeatClaimInfo,
  ServerEvents,
} from "../../../shared/types";
import {
  clearReconnectSession,
  readReconnectSession,
  saveReconnectSession,
  shouldRetainReconnectSessionOnLeave,
  type ReconnectSession,
} from "./reconnectStorage";

/** Client-side game state with local phaseEndTime computed from server's phaseRemainingMs */
export type ClientGameState = PublicGameState & { phaseEndTime: number | null };

export type ReconnectState = "idle" | "reconnecting" | "connected";
export type SeatClaimStatus =
  | "submitting"
  | "waiting"
  | "cancelling"
  | "approved"
  | "rejected"
  | "cancelled";

export interface PendingSeatClaimState {
  requestId: string | null;
  roomCode: string;
  playerId: string;
  playerName: string | null;
  claimantName: string;
  status: SeatClaimStatus;
  message: string | null;
}

export interface HostChangeNotice {
  hostId: string;
  hostName: string;
  reason: HostChangeReason;
}

/** Overlay queue item types */
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

interface GameContextType {
  connected: boolean;
  roomCode: string | null;
  playerId: string | null;
  isSpectator: boolean;
  gameState: ClientGameState | null;
  myCharacter: Character | null;
  error: string | null;
  reconnectState: ReconnectState;
  reconnectableSeats: ReconnectableSeat[];
  pendingSeatClaim: PendingSeatClaimState | null;
  hostSeatClaims: SeatClaimInfo[];
  hostChangeNotice: HostChangeNotice | null;
  createRoom: (name: string) => void;
  joinRoom: (code: string, name: string) => void;
  joinAsSpectator: (code: string, name: string) => void;
  rejoinRoom: (code: string, pid: string) => void;
  setReady: (ready: boolean) => void;
  startGame: () => void;
  revealAttribute: (attributeIndex?: number) => void;
  revealActionCard: () => void;
  castVote: (targetId: string) => void;
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
  listReconnectableSeats: (roomCode: string) => void;
  requestSeatClaim: (roomCode: string, playerId: string, claimantName: string) => void;
  cancelSeatClaim: () => void;
  resolveSeatClaim: (requestId: string, approved: boolean) => void;
  kickPlayer: (targetPlayerId: string) => void;
  transferHost: (targetPlayerId: string) => void;
  clearHostChangeNotice: () => void;
  currentOverlay: OverlayItem | null;
  pendingAdminOpen: boolean;
  consumePendingAdminOpen: () => void;
}

const GameContext = createContext<GameContextType | null>(null);

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [connected, setConnected] = useState(false);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [isSpectator, setIsSpectator] = useState(false);
  const [gameState, setGameState] = useState<ClientGameState | null>(null);
  const [myCharacter, setMyCharacter] = useState<Character | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reconnectState, setReconnectState] = useState<ReconnectState>("idle");
  const [reconnectableSeats, setReconnectableSeats] = useState<ReconnectableSeat[]>([]);
  const [pendingSeatClaim, setPendingSeatClaim] = useState<PendingSeatClaimState | null>(null);
  const [hostSeatClaims, setHostSeatClaims] = useState<SeatClaimInfo[]>([]);
  const [hostChangeNotice, setHostChangeNotice] = useState<HostChangeNotice | null>(null);
  const [pendingAdminOpen, setPendingAdminOpen] = useState(false);
  // Overlay queue: items shown one at a time, sequentially
  const [currentOverlay, setCurrentOverlay] = useState<OverlayItem | null>(null);
  const overlayQueueRef = useRef<OverlayItem[]>([]);
  const overlayTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const prevPhaseRef = useRef<GamePhase | null>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const overlayActiveRef = useRef(false);
  const playerIdRef = useRef<string | null>(null);
  const acceptedSessionRef = useRef<ReconnectSession | null>(null);
  const reconnectSessionTombstonedRef = useRef(false);
  const lastRejoinSocketIdRef = useRef<string | null>(null);
  const explicitLeaveSuppressedRef = useRef(false);
  const ignoreRoomEventsRef = useRef(false);

  // Show an overlay item and schedule its auto-dismiss
  function showOverlayItem(item: OverlayItem) {
    overlayActiveRef.current = true;
    setCurrentOverlay(item);
    if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
    overlayTimerRef.current = setTimeout(() => {
      if (item.kind === "actionCard") {
        setPendingAdminOpen(true);
      }
      // Advance to next in queue
      const next = overlayQueueRef.current.shift();
      if (next) {
        showOverlayItem(next);
      } else {
        overlayActiveRef.current = false;
        setCurrentOverlay(null);
      }
    }, item.duration);
  }

  // Enqueue an overlay item. If nothing is showing, show immediately.
  function enqueueOverlay(item: OverlayItem) {
    if (!overlayActiveRef.current) {
      showOverlayItem(item);
    } else {
      overlayQueueRef.current.push(item);
    }
  }

  useEffect(() => {
    const setTimedError = (message: string) => {
      setError(message);
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      errorTimerRef.current = setTimeout(() => setError(null), 4000);
    };

    const resetRoomUi = () => {
      ignoreRoomEventsRef.current = true;
      playerIdRef.current = null;
      setRoomCode(null);
      setPlayerId(null);
      setIsSpectator(false);
      setGameState(null);
      setMyCharacter(null);
      setReconnectState("idle");
      setReconnectableSeats([]);
      setPendingSeatClaim(null);
      setHostSeatClaims([]);
      setHostChangeNotice(null);
      setPendingAdminOpen(false);
      prevPhaseRef.current = null;
      overlayQueueRef.current = [];
      overlayActiveRef.current = false;
      setCurrentOverlay(null);
      if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
    };

    const clearStoredSession = () => {
      reconnectSessionTombstonedRef.current = true;
      clearReconnectSession();
      acceptedSessionRef.current = null;
      explicitLeaveSuppressedRef.current = false;
      lastRejoinSocketIdRef.current = null;
      resetRoomUi();
    };

    const attemptStoredRejoin = (): boolean => {
      if (reconnectSessionTombstonedRef.current) return false;
      const savedSession = acceptedSessionRef.current ?? readReconnectSession();
      if (!savedSession) return false;

      acceptedSessionRef.current = savedSession;
      ignoreRoomEventsRef.current = false;
      playerIdRef.current = savedSession.participantId;
      setRoomCode(savedSession.roomCode);
      setPlayerId(savedSession.participantId);
      setIsSpectator(savedSession.role === "spectator");
      if (savedSession.role === "spectator") {
        socket.emit("room:rejoinSpectator", {
          roomCode: savedSession.roomCode,
          spectatorId: savedSession.participantId,
          sessionToken: savedSession.sessionToken,
        });
      } else {
        socket.emit("room:rejoin", {
          roomCode: savedSession.roomCode,
          playerId: savedSession.participantId,
          sessionToken: savedSession.sessionToken,
        });
      }
      return true;
    };

    const handleConnect = () => {
      setConnected(true);
      if (explicitLeaveSuppressedRef.current) return;
      if (lastRejoinSocketIdRef.current === socket.id) return;
      lastRejoinSocketIdRef.current = socket.id ?? null;
      setReconnectState(attemptStoredRejoin() ? "reconnecting" : "idle");
    };

    const handleDisconnect = () => {
      setConnected(false);
      lastRejoinSocketIdRef.current = null;
      explicitLeaveSuppressedRef.current = false;
      if (
        !reconnectSessionTombstonedRef.current &&
        (acceptedSessionRef.current ?? readReconnectSession())
      ) {
        setReconnectState("reconnecting");
      }
      setPendingSeatClaim((current) =>
        current &&
        (current.status === "submitting" ||
          current.status === "waiting" ||
          current.status === "cancelling")
          ? { ...current, status: "cancelled", message: "Соединение потеряно" }
          : current,
      );
    };

    const acceptSession = (
      role: "player" | "spectator",
      code: string,
      participantId: string,
      token: string,
    ) => {
      const acceptedSession: ReconnectSession = {
        role,
        roomCode: code,
        participantId,
        sessionToken: token,
      };
      acceptedSessionRef.current = acceptedSession;
      reconnectSessionTombstonedRef.current = false;
      ignoreRoomEventsRef.current = false;
      explicitLeaveSuppressedRef.current = false;
      playerIdRef.current = participantId;
      setRoomCode(code);
      setPlayerId(participantId);
      setIsSpectator(role === "spectator");
      setReconnectState("connected");
      setReconnectableSeats([]);
      setPendingSeatClaim(null);
      saveReconnectSession(acceptedSession);
    };

    const handleRoomCreated: ServerEvents["room:created"] = ({
      roomCode: code,
      playerId: pid,
      sessionToken: token,
    }) => {
      if (ignoreRoomEventsRef.current) return;
      acceptSession("player", code, pid, token);
    };

    const handleRoomJoined: ServerEvents["room:joined"] = ({
      roomCode: code,
      playerId: pid,
      sessionToken: token,
    }) => {
      if (ignoreRoomEventsRef.current) return;
      acceptSession("player", code, pid, token);
    };

    const handleSpectatorJoined: ServerEvents["room:spectatorJoined"] = ({
      roomCode: code,
      spectatorId: sid,
      sessionToken: token,
    }) => {
      if (ignoreRoomEventsRef.current) return;
      acceptSession("spectator", code, sid, token);
    };

    const handleRoomError: ServerEvents["room:error"] = ({ message }) => {
      setPendingSeatClaim((current) => {
        if (current?.status === "submitting") {
          return { ...current, status: "rejected", message };
        }
        if (current?.status === "cancelling") {
          return { ...current, status: "waiting", message };
        }
        return current;
      });
      setTimedError(message);
    };

    const handleReconnectError: ServerEvents["room:reconnectError"] = ({ message, terminal }) => {
      if (terminal) {
        clearStoredSession();
      } else {
        setReconnectState("reconnecting");
      }
      setTimedError(message);
    };

    const handleKicked: ServerEvents["room:kicked"] = ({ message }) => {
      clearStoredSession();
      setTimedError(message);
    };

    const handleReconnectableSeats: ServerEvents["room:reconnectableSeats"] = ({ seats }) => {
      if (ignoreRoomEventsRef.current) return;
      setReconnectableSeats(seats);
    };

    const handleSeatClaimSubmitted: ServerEvents["room:seatClaimSubmitted"] = ({ requestId }) => {
      if (ignoreRoomEventsRef.current) return;
      setPendingSeatClaim((current) =>
        current ? { ...current, requestId, status: "waiting", message: null } : current,
      );
    };

    const handleSeatClaimResolved: ServerEvents["room:seatClaimResolved"] = ({
      requestId,
      approved,
      message,
    }) => {
      if (ignoreRoomEventsRef.current) return;
      setPendingSeatClaim((current) => {
        if (!current || (current.requestId !== null && current.requestId !== requestId)) {
          return current;
        }
        const status: SeatClaimStatus = approved
          ? "approved"
          : current.status === "cancelling" || current.status === "cancelled"
            ? "cancelled"
            : "rejected";
        return { ...current, requestId, status, message };
      });
    };

    const handleSeatClaimsUpdated: ServerEvents["admin:seatClaimsUpdated"] = ({ claims }) => {
      if (ignoreRoomEventsRef.current) return;
      setHostSeatClaims(claims);
    };

    const handleHostChanged: ServerEvents["room:hostChanged"] = ({ hostId, hostName, reason }) => {
      if (ignoreRoomEventsRef.current) return;
      if (hostId === playerIdRef.current) {
        setHostChangeNotice({ hostId, hostName, reason });
      } else {
        setHostChangeNotice(null);
        setHostSeatClaims([]);
      }
    };

    const handleGameState: ServerEvents["game:state"] = (state) => {
      if (ignoreRoomEventsRef.current) return;
      // Convert server-relative remaining time to local absolute endTime
      // This avoids clock desync between server and client
      const phaseEndTime =
        state.phaseRemainingMs != null ? Date.now() + state.phaseRemainingMs : null;

      // Detect phase change and enqueue announcement overlay
      const prevPhase = prevPhaseRef.current;
      const newPhase = state.phase;
      if (prevPhase !== newPhase) {
        prevPhaseRef.current = newPhase;

        if (newPhase === "CATASTROPHE_REVEAL" && state.catastrophe) {
          enqueueOverlay({
            kind: "announcement",
            duration: 3000,
            title: "Катастрофа!",
            subtitle: state.catastrophe.title,
            description: state.catastrophe.description,
          });
        } else if (newPhase === "BUNKER_EXPLORE" && state.revealedBunkerCards.length > 0) {
          const lastCard = state.revealedBunkerCards[state.revealedBunkerCards.length - 1];
          enqueueOverlay({
            kind: "announcement",
            duration: 3000,
            title: "Новая карта бункера",
            subtitle: lastCard.title,
            description: lastCard.description,
          });
        } else if (newPhase === "ROUND_REVEAL") {
          enqueueOverlay({
            kind: "announcement",
            duration: 3000,
            title: `Раунд ${state.roundNumber}`,
            subtitle: "Раскрытие карт",
          });
        } else if (newPhase === "ROUND_DISCUSSION") {
          enqueueOverlay({
            kind: "announcement",
            duration: 3000,
            title: "Обсуждение",
            subtitle: `Раунд ${state.roundNumber}`,
          });
        } else if (newPhase === "ROUND_VOTE") {
          enqueueOverlay({
            kind: "announcement",
            duration: 3000,
            title: "Голосование",
            subtitle: `Раунд ${state.roundNumber}`,
          });
        } else if (newPhase === "ROUND_VOTE_TIEBREAK") {
          enqueueOverlay({
            kind: "announcement",
            duration: 3000,
            title: "Перевоевание",
            subtitle: "Ничья! Повторное голосование",
          });
        } else if (newPhase === "ROUND_RESULT" && state.eliminatedPlayerId) {
          const eliminated = state.players.find((p: any) => p.id === state.eliminatedPlayerId);
          enqueueOverlay({
            kind: "announcement",
            duration: 3000,
            title: "Изгнан!",
            subtitle: eliminated?.name || "Игрок",
          });
        }
      }

      const currentPlayer = state.players.find((player) => player.id === playerIdRef.current);
      if (!currentPlayer?.isHost) {
        setHostSeatClaims([]);
        setHostChangeNotice(null);
      }
      setGameState({ ...state, phaseEndTime });
    };

    const handleCharacter: ServerEvents["game:character"] = (character) => {
      if (ignoreRoomEventsRef.current) return;
      setMyCharacter(character);
    };

    const handleAttributeRevealed: ServerEvents["game:attributeRevealed"] = ({
      playerName,
      attribute,
    }) => {
      if (ignoreRoomEventsRef.current) return;
      enqueueOverlay({ kind: "attribute", playerName, attribute, duration: 4000 });
    };

    const handleActionCardRevealed: ServerEvents["game:actionCardRevealed"] = ({
      playerName,
      actionCard,
    }) => {
      if (ignoreRoomEventsRef.current) return;
      enqueueOverlay({ kind: "actionCard", playerName, actionCard, duration: 10000 });
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("room:created", handleRoomCreated);
    socket.on("room:joined", handleRoomJoined);
    socket.on("room:spectatorJoined", handleSpectatorJoined);
    socket.on("room:error", handleRoomError);
    socket.on("room:reconnectError", handleReconnectError);
    socket.on("room:kicked", handleKicked);
    socket.on("room:reconnectableSeats", handleReconnectableSeats);
    socket.on("room:seatClaimSubmitted", handleSeatClaimSubmitted);
    socket.on("room:seatClaimResolved", handleSeatClaimResolved);
    socket.on("admin:seatClaimsUpdated", handleSeatClaimsUpdated);
    socket.on("room:hostChanged", handleHostChanged);
    socket.on("game:state", handleGameState);
    socket.on("game:character", handleCharacter);
    socket.on("game:attributeRevealed", handleAttributeRevealed);
    socket.on("game:actionCardRevealed", handleActionCardRevealed);

    if (socket.connected) {
      handleConnect();
    } else {
      socket.connect();
    }

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("room:created", handleRoomCreated);
      socket.off("room:joined", handleRoomJoined);
      socket.off("room:spectatorJoined", handleSpectatorJoined);
      socket.off("room:error", handleRoomError);
      socket.off("room:reconnectError", handleReconnectError);
      socket.off("room:kicked", handleKicked);
      socket.off("room:reconnectableSeats", handleReconnectableSeats);
      socket.off("room:seatClaimSubmitted", handleSeatClaimSubmitted);
      socket.off("room:seatClaimResolved", handleSeatClaimResolved);
      socket.off("admin:seatClaimsUpdated", handleSeatClaimsUpdated);
      socket.off("room:hostChanged", handleHostChanged);
      socket.off("game:state", handleGameState);
      socket.off("game:character", handleCharacter);
      socket.off("game:attributeRevealed", handleAttributeRevealed);
      socket.off("game:actionCardRevealed", handleActionCardRevealed);
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
    };
  }, []);

  const createRoom = useCallback((name: string) => {
    reconnectSessionTombstonedRef.current = false;
    explicitLeaveSuppressedRef.current = false;
    ignoreRoomEventsRef.current = false;
    socket.emit("room:create", { playerName: name });
  }, []);

  const joinRoom = useCallback((code: string, name: string) => {
    reconnectSessionTombstonedRef.current = false;
    explicitLeaveSuppressedRef.current = false;
    ignoreRoomEventsRef.current = false;
    socket.emit("room:join", { roomCode: code, playerName: name });
  }, []);

  const joinAsSpectator = useCallback((code: string, name: string) => {
    reconnectSessionTombstonedRef.current = false;
    explicitLeaveSuppressedRef.current = false;
    ignoreRoomEventsRef.current = false;
    socket.emit("room:joinSpectator", { roomCode: code, spectatorName: name });
  }, []);

  const rejoinRoom = useCallback((code: string, pid: string) => {
    if (reconnectSessionTombstonedRef.current) return;
    const savedSession = acceptedSessionRef.current ?? readReconnectSession();
    if (!savedSession || savedSession.role !== "player") return;
    if (savedSession.roomCode !== code.trim().toUpperCase() || savedSession.participantId !== pid) {
      return;
    }
    explicitLeaveSuppressedRef.current = false;
    ignoreRoomEventsRef.current = false;
    setReconnectState("reconnecting");
    socket.emit("room:rejoin", {
      roomCode: savedSession.roomCode,
      playerId: savedSession.participantId,
      sessionToken: savedSession.sessionToken,
    });
  }, []);

  const setReady = useCallback((ready: boolean) => {
    socket.emit("player:ready", { ready });
  }, []);

  const startGameFn = useCallback(() => {
    socket.emit("game:start");
  }, []);

  const revealAttributeFn = useCallback((attributeIndex?: number) => {
    socket.emit("game:revealAttribute", { attributeIndex });
  }, []);

  const revealActionCardFn = useCallback(() => {
    socket.emit("game:revealActionCard");
  }, []);

  const castVoteFn = useCallback((targetId: string) => {
    socket.emit("vote:cast", { targetPlayerId: targetId });
  }, []);

  const endGame = useCallback(() => {
    socket.emit("game:endGame");
  }, []);

  const playAgainFn = useCallback(() => {
    socket.emit("game:playAgain");
    setMyCharacter(null);
  }, []);

  const leaveRoom = useCallback(() => {
    const retainOwnership = shouldRetainReconnectSessionOnLeave(
      gameState?.phase ?? null,
      isSpectator,
    );
    if (retainOwnership) {
      explicitLeaveSuppressedRef.current = true;
    } else {
      explicitLeaveSuppressedRef.current = false;
    }
    ignoreRoomEventsRef.current = true;
    socket.emit("room:leave");
    if (!retainOwnership) {
      reconnectSessionTombstonedRef.current = true;
      clearReconnectSession();
      acceptedSessionRef.current = null;
    }
    playerIdRef.current = null;
    setRoomCode(null);
    setPlayerId(null);
    setIsSpectator(false);
    setGameState(null);
    setMyCharacter(null);
    setReconnectState("idle");
    setReconnectableSeats([]);
    setPendingSeatClaim(null);
    setHostSeatClaims([]);
    setHostChangeNotice(null);
    setPendingAdminOpen(false);
    prevPhaseRef.current = null;
    overlayQueueRef.current = [];
    overlayActiveRef.current = false;
    setCurrentOverlay(null);
    if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
  }, [gameState?.phase, isSpectator]);

  const clearError = useCallback(() => setError(null), []);

  const addBot = useCallback(() => {
    socket.emit("room:addBot");
  }, []);

  const removeBot = useCallback((botPlayerId: string) => {
    socket.emit("room:removeBot", { playerId: botPlayerId });
  }, []);

  const adminShuffleAllFn = useCallback((attributeType: AttributeType | "action") => {
    socket.emit("admin:shuffleAll", { attributeType });
  }, []);

  const adminSwapAttributeFn = useCallback(
    (player1Id: string, player2Id: string, attributeType: AttributeType | "action") => {
      socket.emit("admin:swapAttribute", { player1Id, player2Id, attributeType });
    },
    [],
  );

  const adminReplaceAttributeFn = useCallback(
    (targetPlayerId: string, attributeType: AttributeType | "action") => {
      socket.emit("admin:replaceAttribute", { targetPlayerId, attributeType });
    },
    [],
  );

  const adminRemoveBunkerCardFn = useCallback((cardIndex: number) => {
    socket.emit("admin:removeBunkerCard", { cardIndex });
  }, []);

  const adminReplaceBunkerCardFn = useCallback((cardIndex: number) => {
    socket.emit("admin:replaceBunkerCard", { cardIndex });
  }, []);

  const adminDeleteAttributeFn = useCallback(
    (targetPlayerId: string, attributeType: AttributeType) => {
      socket.emit("admin:deleteAttribute", { targetPlayerId, attributeType });
    },
    [],
  );

  const adminForceRevealTypeFn = useCallback((attributeType: AttributeType) => {
    socket.emit("admin:forceRevealType", { attributeType });
  }, []);

  const consumePendingAdminOpenFn = useCallback(() => {
    setPendingAdminOpen(false);
  }, []);

  const adminPauseFn = useCallback(() => {
    socket.emit("admin:pause");
  }, []);

  const adminUnpauseFn = useCallback(() => {
    socket.emit("admin:unpause");
  }, []);

  const adminSkipDiscussionFn = useCallback(() => {
    socket.emit("admin:skipDiscussion");
  }, []);

  const adminRevivePlayerFn = useCallback((targetPlayerId: string) => {
    socket.emit("admin:revivePlayer", { targetPlayerId });
  }, []);

  const adminEliminatePlayerFn = useCallback((targetPlayerId: string) => {
    socket.emit("admin:eliminatePlayer", { targetPlayerId });
  }, []);

  const listReconnectableSeats = useCallback((code: string) => {
    ignoreRoomEventsRef.current = false;
    setReconnectableSeats([]);
    setPendingSeatClaim(null);
    socket.emit("room:listReconnectableSeats", { roomCode: code.trim().toUpperCase() });
  }, []);

  const requestSeatClaim = useCallback(
    (code: string, targetPlayerId: string, claimantName: string) => {
      ignoreRoomEventsRef.current = false;
      const normalizedRoomCode = code.trim().toUpperCase();
      const selectedSeat = reconnectableSeats.find((seat) => seat.playerId === targetPlayerId);
      setPendingSeatClaim({
        requestId: null,
        roomCode: normalizedRoomCode,
        playerId: targetPlayerId,
        playerName: selectedSeat?.playerName ?? null,
        claimantName: claimantName.trim(),
        status: "submitting",
        message: null,
      });
      socket.emit("room:requestSeatClaim", {
        roomCode: normalizedRoomCode,
        playerId: targetPlayerId,
        claimantName,
      });
    },
    [reconnectableSeats],
  );

  const cancelSeatClaim = useCallback(() => {
    if (!pendingSeatClaim?.requestId) return;
    socket.emit("room:cancelSeatClaim", { requestId: pendingSeatClaim.requestId });
    setPendingSeatClaim((current) =>
      current?.requestId === pendingSeatClaim.requestId
        ? { ...current, status: "cancelling", message: null }
        : current,
    );
  }, [pendingSeatClaim?.requestId]);

  const resolveSeatClaim = useCallback((requestId: string, approved: boolean) => {
    socket.emit("admin:resolveSeatClaim", { requestId, approved });
  }, []);

  const kickPlayer = useCallback((targetPlayerId: string) => {
    socket.emit("admin:kickPlayer", { targetPlayerId });
  }, []);

  const transferHost = useCallback((targetPlayerId: string) => {
    socket.emit("admin:transferHost", { targetPlayerId });
  }, []);

  const clearHostChangeNotice = useCallback(() => {
    setHostChangeNotice(null);
  }, []);

  return (
    <GameContext.Provider
      value={{
        connected,
        roomCode,
        playerId,
        isSpectator,
        gameState,
        myCharacter,
        error,
        reconnectState,
        reconnectableSeats,
        pendingSeatClaim,
        hostSeatClaims,
        hostChangeNotice,
        createRoom,
        joinRoom,
        joinAsSpectator,
        rejoinRoom,
        setReady,
        startGame: startGameFn,
        revealAttribute: revealAttributeFn,
        revealActionCard: revealActionCardFn,
        castVote: castVoteFn,
        endGame,
        playAgain: playAgainFn,
        leaveRoom,
        clearError,
        addBot,
        removeBot,
        adminShuffleAll: adminShuffleAllFn,
        adminSwapAttribute: adminSwapAttributeFn,
        adminReplaceAttribute: adminReplaceAttributeFn,
        adminRemoveBunkerCard: adminRemoveBunkerCardFn,
        adminReplaceBunkerCard: adminReplaceBunkerCardFn,
        adminDeleteAttribute: adminDeleteAttributeFn,
        adminForceRevealType: adminForceRevealTypeFn,
        adminPause: adminPauseFn,
        adminUnpause: adminUnpauseFn,
        adminSkipDiscussion: adminSkipDiscussionFn,
        adminRevivePlayer: adminRevivePlayerFn,
        adminEliminatePlayer: adminEliminatePlayerFn,
        listReconnectableSeats,
        requestSeatClaim,
        cancelSeatClaim,
        resolveSeatClaim,
        kickPlayer,
        transferHost,
        clearHostChangeNotice,
        currentOverlay,
        pendingAdminOpen,
        consumePendingAdminOpen: consumePendingAdminOpenFn,
      }}
    >
      {children}
    </GameContext.Provider>
  );
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error("useGame must be used within GameProvider");
  return ctx;
}
