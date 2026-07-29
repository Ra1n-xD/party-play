import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  AnyGameEvent,
  GameCommand,
  GameId,
  GameSettings,
} from "../../../../shared/platform/gameContract";
import type {
  HostChangeReason,
  ReconnectableSeat,
  SeatClaimInfo,
  ServerEvents,
} from "../../../../shared/platform/protocol";
import type {
  AnyRoomCommandEnvelope,
  AnyRoomSnapshot,
  PlatformCommand,
} from "../../../../shared/platform/room";
import { socket } from "../../socket";
import {
  clearReconnectSession,
  readReconnectSession,
  saveReconnectSession,
  shouldRetainReconnectSessionOnLeave,
  type ReconnectSession,
} from "./reconnectStorage";

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

export interface RetainedReconnectSessionSummary {
  role: "player";
  gameId: GameId;
  roomCode: string;
  participantId: string;
}

export interface SeatLookupState {
  status: "idle" | "pending" | "complete";
  roomCode: string | null;
}

export interface QueuedGameEvent {
  sequence: number;
  payload: AnyGameEvent;
}

type CommonPlatformCommand = Exclude<
  PlatformCommand<GameId>,
  { type: "game" } | { type: "room:update-settings" }
>;

type SessionAcceptanceExpectation = {
  event: "room:created" | "room:joined" | "room:spectatorJoined";
  source: "create" | "join" | "spectator" | "rejoin" | "claim";
  roomCode?: string;
  participantId?: string;
  gameId?: GameId;
};

type PendingSeatClaimTarget = {
  requestId: string | null;
  roomCode: string;
  playerId: string;
};

type QueuedRoomCommand = {
  [G in GameId]: {
    commandId: string;
    gameId: G;
    command: PlatformCommand<G>;
    staleRetries: number;
  };
}[GameId];

interface PlatformContextValue {
  connected: boolean;
  sessionPending: boolean;
  commandPending: boolean;
  activeGameId: GameId | null;
  roomCode: string | null;
  playerId: string | null;
  isSpectator: boolean;
  snapshot: AnyRoomSnapshot | null;
  error: string | null;
  reconnectState: ReconnectState;
  reconnectableSeats: ReconnectableSeat[];
  reconnectableSeatsRoomCode: string | null;
  seatLookupState: SeatLookupState;
  retainedReconnectSession: RetainedReconnectSessionSummary | null;
  pendingSeatClaim: PendingSeatClaimState | null;
  hostSeatClaims: SeatClaimInfo[];
  hostChangeNotice: HostChangeNotice | null;
  gameEvents: QueuedGameEvent[];
  createRoom: (gameId: GameId, name: string) => void;
  joinRoom: (code: string, name: string) => void;
  joinAsSpectator: (code: string, name: string) => void;
  rejoinRoom: (code: string, participantId: string) => boolean;
  resumeRetainedSession: () => boolean;
  leaveRoom: () => void;
  clearError: () => void;
  setReady: (ready: boolean) => boolean;
  startGame: () => boolean;
  playAgain: () => boolean;
  addBot: () => boolean;
  removeBot: (seatId: string) => boolean;
  assignTemporaryBot: (seatId: string) => boolean;
  returnHumanControl: (seatId: string) => boolean;
  kickPlayer: (seatId: string) => boolean;
  transferHost: (seatId: string) => boolean;
  setAdminPause: (paused: boolean) => boolean;
  resolveSeatClaim: (requestId: string, approved: boolean) => boolean;
  updateSettings: <G extends GameId>(gameId: G, settings: GameSettings<G>) => boolean;
  sendGameCommand: <G extends GameId>(gameId: G, command: GameCommand<G>) => boolean;
  listReconnectableSeats: (roomCode: string) => void;
  clearReconnectableSeats: () => void;
  resetSeatRecovery: () => void;
  requestSeatClaim: (roomCode: string, playerId: string, claimantName: string) => void;
  cancelSeatClaim: () => void;
  clearHostChangeNotice: () => void;
}

const PlatformContext = createContext<PlatformContextValue | null>(null);

function summarizeRetainedSession(
  session: ReconnectSession | null,
): RetainedReconnectSessionSummary | null {
  if (!session || session.role !== "player") return null;
  return {
    role: "player",
    gameId: session.gameId,
    roomCode: session.roomCode,
    participantId: session.participantId,
  };
}

function matchesSessionAcceptance(
  expectation: SessionAcceptanceExpectation | null,
  event: SessionAcceptanceExpectation["event"],
  roomCode: string,
  participantId: string,
): boolean {
  if (!expectation || expectation.event !== event) return false;
  if (expectation.roomCode && expectation.roomCode !== roomCode) return false;
  return !expectation.participantId || expectation.participantId === participantId;
}

function createCommandId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `cmd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

export function PlatformProvider({ children }: { children: ReactNode }) {
  const [connected, setConnected] = useState(false);
  const [sessionPending, setSessionPending] = useState(false);
  const [commandPending, setCommandPending] = useState(false);
  const [activeGameId, setActiveGameId] = useState<GameId | null>(null);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [isSpectator, setIsSpectator] = useState(false);
  const [snapshot, setSnapshot] = useState<AnyRoomSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reconnectState, setReconnectState] = useState<ReconnectState>("idle");
  const [reconnectableSeats, setReconnectableSeats] = useState<ReconnectableSeat[]>([]);
  const [reconnectableSeatsRoomCode, setReconnectableSeatsRoomCode] = useState<string | null>(null);
  const [seatLookupState, setSeatLookupState] = useState<SeatLookupState>({
    status: "idle",
    roomCode: null,
  });
  const [retainedReconnectSession, setRetainedReconnectSession] =
    useState<RetainedReconnectSessionSummary | null>(() =>
      summarizeRetainedSession(readReconnectSession()),
    );
  const [pendingSeatClaim, setPendingSeatClaim] = useState<PendingSeatClaimState | null>(null);
  const [hostSeatClaims, setHostSeatClaims] = useState<SeatClaimInfo[]>([]);
  const [hostChangeNotice, setHostChangeNotice] = useState<HostChangeNotice | null>(null);
  const [gameEvents, setGameEvents] = useState<QueuedGameEvent[]>([]);

  const errorTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const acceptedSessionRef = useRef<ReconnectSession | null>(null);
  const reconnectSessionTombstonedRef = useRef(false);
  const sessionAcceptanceExpectationRef = useRef<SessionAcceptanceExpectation | null>(null);
  const pendingSeatClaimTargetRef = useRef<PendingSeatClaimTarget | null>(null);
  const membershipRequestPendingRef = useRef(false);
  const membershipReadyRef = useRef(false);
  const seatLookupPendingRoomRef = useRef<string | null>(null);
  const completedSeatLookupRoomRef = useRef<string | null>(null);
  const discardPendingSeatLookupRef = useRef(false);
  const lastRejoinSocketIdRef = useRef<string | null>(null);
  const explicitLeaveSuppressedRef = useRef(false);
  const ignoreRoomEventsRef = useRef(true);
  const ignoreRecoveryEventsRef = useRef(true);
  const snapshotRef = useRef<AnyRoomSnapshot | null>(null);
  const gameEventSequenceRef = useRef(0);
  const queuedCommandsRef = useRef<QueuedRoomCommand[]>([]);
  const inFlightCommandRef = useRef<QueuedRoomCommand | null>(null);
  const latestServerRevisionRef = useRef<number | null>(null);

  const resetCommandQueue = useCallback(() => {
    queuedCommandsRef.current = [];
    inFlightCommandRef.current = null;
    latestServerRevisionRef.current = null;
    setCommandPending(false);
  }, []);

  const flushCommandQueue = useCallback(() => {
    if (inFlightCommandRef.current || !socket.connected || !membershipReadyRef.current) {
      return;
    }

    const current = snapshotRef.current;
    if (!current) return;

    while (queuedCommandsRef.current[0] && queuedCommandsRef.current[0].gameId !== current.gameId) {
      queuedCommandsRef.current.shift();
    }
    const next = queuedCommandsRef.current[0];
    if (!next) return;

    const expectedRevision = Math.max(
      current.revision,
      latestServerRevisionRef.current ?? current.revision,
    );
    inFlightCommandRef.current = next;
    socket.emit("room:command", {
      commandId: next.commandId,
      gameId: next.gameId,
      expectedRevision,
      command: next.command,
    } as AnyRoomCommandEnvelope);
  }, []);

  const enqueueRoomCommand = useCallback(
    <G extends GameId>(gameId: G, command: PlatformCommand<G>): boolean => {
      const current = snapshotRef.current;
      if (
        !current ||
        current.gameId !== gameId ||
        !socket.connected ||
        !membershipReadyRef.current
      ) {
        return false;
      }

      queuedCommandsRef.current.push({
        commandId: createCommandId(),
        gameId,
        command,
        staleRetries: 0,
      } as QueuedRoomCommand);
      setCommandPending(true);
      flushCommandQueue();
      return true;
    },
    [flushCommandQueue],
  );

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    const setTimedError = (message: string) => {
      setError(message);
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      errorTimerRef.current = setTimeout(() => setError(null), 4000);
    };

    const resetRoomUi = () => {
      ignoreRoomEventsRef.current = true;
      ignoreRecoveryEventsRef.current = true;
      sessionAcceptanceExpectationRef.current = null;
      pendingSeatClaimTargetRef.current = null;
      membershipRequestPendingRef.current = false;
      membershipReadyRef.current = false;
      seatLookupPendingRoomRef.current = null;
      completedSeatLookupRoomRef.current = null;
      discardPendingSeatLookupRef.current = false;
      snapshotRef.current = null;
      resetCommandQueue();
      setSessionPending(false);
      setActiveGameId(null);
      setRoomCode(null);
      setPlayerId(null);
      setIsSpectator(false);
      setSnapshot(null);
      setReconnectState("idle");
      setReconnectableSeats([]);
      setReconnectableSeatsRoomCode(null);
      setSeatLookupState({ status: "idle", roomCode: null });
      setRetainedReconnectSession(null);
      setPendingSeatClaim(null);
      setHostSeatClaims([]);
      setHostChangeNotice(null);
      setGameEvents([]);
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
      if (membershipRequestPendingRef.current || reconnectSessionTombstonedRef.current) {
        return false;
      }
      const savedSession = acceptedSessionRef.current ?? readReconnectSession();
      if (!savedSession) return false;

      acceptedSessionRef.current = savedSession;
      setRetainedReconnectSession(summarizeRetainedSession(savedSession));
      membershipRequestPendingRef.current = true;
      setSessionPending(true);
      sessionAcceptanceExpectationRef.current = {
        event: savedSession.role === "spectator" ? "room:spectatorJoined" : "room:joined",
        source: "rejoin",
        roomCode: savedSession.roomCode,
        participantId: savedSession.participantId,
      };
      setActiveGameId(savedSession.gameId);
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
      membershipReadyRef.current = false;
      resetCommandQueue();
      lastRejoinSocketIdRef.current = null;
      explicitLeaveSuppressedRef.current = false;
      sessionAcceptanceExpectationRef.current = null;
      pendingSeatClaimTargetRef.current = null;
      membershipRequestPendingRef.current = false;
      setSessionPending(false);
      seatLookupPendingRoomRef.current = null;
      completedSeatLookupRoomRef.current = null;
      discardPendingSeatLookupRef.current = false;
      setReconnectableSeats([]);
      setReconnectableSeatsRoomCode(null);
      setSeatLookupState({ status: "idle", roomCode: null });
      ignoreRecoveryEventsRef.current = true;

      if (
        !reconnectSessionTombstonedRef.current &&
        (acceptedSessionRef.current ?? readReconnectSession())
      ) {
        setReconnectState("reconnecting");
      }
      setPendingSeatClaim((current) =>
        current && ["submitting", "waiting", "cancelling", "approved"].includes(current.status)
          ? { ...current, status: "cancelled", message: "Соединение потеряно" }
          : current,
      );
    };

    const acceptSession = (
      role: "player" | "spectator",
      gameId: GameId,
      code: string,
      participantId: string,
      token: string,
    ) => {
      const acceptedSession: ReconnectSession = {
        version: 1,
        gameId,
        role,
        roomCode: code,
        participantId,
        sessionToken: token,
      };
      acceptedSessionRef.current = acceptedSession;
      membershipReadyRef.current = true;
      reconnectSessionTombstonedRef.current = false;
      sessionAcceptanceExpectationRef.current = null;
      pendingSeatClaimTargetRef.current = null;
      membershipRequestPendingRef.current = false;
      setSessionPending(false);
      seatLookupPendingRoomRef.current = null;
      completedSeatLookupRoomRef.current = null;
      discardPendingSeatLookupRef.current = false;
      ignoreRoomEventsRef.current = false;
      ignoreRecoveryEventsRef.current = true;
      explicitLeaveSuppressedRef.current = false;
      setActiveGameId(gameId);
      setRoomCode(code);
      setPlayerId(participantId);
      setIsSpectator(role === "spectator");
      setReconnectState("connected");
      setReconnectableSeats([]);
      setReconnectableSeatsRoomCode(null);
      setSeatLookupState({ status: "idle", roomCode: null });
      setRetainedReconnectSession(summarizeRetainedSession(acceptedSession));
      setPendingSeatClaim(null);
      setSnapshot(null);
      snapshotRef.current = null;
      resetCommandQueue();
      setGameEvents([]);
      saveReconnectSession(acceptedSession);
    };

    const handleRoomCreated: ServerEvents["room:created"] = ({
      roomCode: code,
      gameId,
      playerId: seatId,
      sessionToken,
    }) => {
      const expectation = sessionAcceptanceExpectationRef.current;
      if (!matchesSessionAcceptance(expectation, "room:created", code, seatId)) return;
      if (expectation?.gameId && expectation.gameId !== gameId) {
        membershipRequestPendingRef.current = false;
        setSessionPending(false);
        sessionAcceptanceExpectationRef.current = null;
        socket.emit("room:leave");
        setTimedError("Сервер создал комнату для другой игры");
        return;
      }
      acceptSession("player", gameId, code, seatId, sessionToken);
    };

    const handleRoomJoined: ServerEvents["room:joined"] = ({
      roomCode: code,
      gameId,
      playerId: seatId,
      sessionToken,
    }) => {
      if (
        !matchesSessionAcceptance(
          sessionAcceptanceExpectationRef.current,
          "room:joined",
          code,
          seatId,
        )
      ) {
        return;
      }
      acceptSession("player", gameId, code, seatId, sessionToken);
    };

    const handleSpectatorJoined: ServerEvents["room:spectatorJoined"] = ({
      roomCode: code,
      gameId,
      spectatorId,
      sessionToken,
    }) => {
      if (
        !matchesSessionAcceptance(
          sessionAcceptanceExpectationRef.current,
          "room:spectatorJoined",
          code,
          spectatorId,
        )
      ) {
        return;
      }
      acceptSession("spectator", gameId, code, spectatorId, sessionToken);
    };

    const handleRoomError: ServerEvents["room:error"] = ({ message }) => {
      const commandTransportFailed =
        message === "Команда доступна только игроку" || message === "Не удалось обработать команду";
      if (inFlightCommandRef.current && commandTransportFailed) resetCommandQueue();
      const expectation = sessionAcceptanceExpectationRef.current;
      membershipRequestPendingRef.current = false;
      setSessionPending(false);
      if (expectation && expectation.source !== "claim") {
        sessionAcceptanceExpectationRef.current = null;
      }
      if (seatLookupPendingRoomRef.current) seatLookupPendingRoomRef.current = null;
      setSeatLookupState({ status: "idle", roomCode: null });
      discardPendingSeatLookupRef.current = false;
      completedSeatLookupRoomRef.current = null;
      setReconnectableSeats([]);
      setReconnectableSeatsRoomCode(null);
      if (pendingSeatClaimTargetRef.current?.requestId === null) {
        pendingSeatClaimTargetRef.current = null;
      }
      setPendingSeatClaim((current) => {
        if (current?.status === "submitting") {
          if (sessionAcceptanceExpectationRef.current?.source === "claim") {
            sessionAcceptanceExpectationRef.current = null;
          }
          pendingSeatClaimTargetRef.current = null;
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
      sessionAcceptanceExpectationRef.current = null;
      membershipRequestPendingRef.current = false;
      setSessionPending(false);
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

    const handleSnapshot: ServerEvents["room:snapshot"] = (nextSnapshot) => {
      if (ignoreRoomEventsRef.current) return;
      const accepted = acceptedSessionRef.current;
      if (!accepted) return;
      if (nextSnapshot.roomCode !== accepted.roomCode || nextSnapshot.gameId !== accepted.gameId) {
        setTimedError("Получено состояние другой комнаты");
        return;
      }

      latestServerRevisionRef.current = Math.max(
        latestServerRevisionRef.current ?? nextSnapshot.revision,
        nextSnapshot.revision,
      );
      setSnapshot((current) => {
        if (
          current &&
          current.roomCode === nextSnapshot.roomCode &&
          current.revision > nextSnapshot.revision
        ) {
          return current;
        }
        snapshotRef.current = nextSnapshot;
        return nextSnapshot;
      });

      if (nextSnapshot.viewer.role === "player") {
        const viewerSeatId = nextSnapshot.viewer.seatId;
        setPlayerId(viewerSeatId);
        const me = nextSnapshot.seats.find((seat) => seat.seatId === viewerSeatId);
        if (!me?.isHost) {
          setHostSeatClaims([]);
          setHostChangeNotice(null);
        }
      }
    };

    const handleCommandResult: ServerEvents["room:commandResult"] = (result) => {
      if (ignoreRoomEventsRef.current) return;
      const inFlight = inFlightCommandRef.current;
      if (!inFlight || inFlight.commandId !== result.commandId) return;

      latestServerRevisionRef.current = Math.max(
        latestServerRevisionRef.current ?? result.revision,
        result.revision,
      );
      if (
        result.status === "rejected" &&
        result.code === "STALE_REVISION" &&
        inFlight.staleRetries < 1
      ) {
        inFlight.staleRetries += 1;
        inFlightCommandRef.current = null;
        flushCommandQueue();
        return;
      }

      if (queuedCommandsRef.current[0]?.commandId === result.commandId) {
        queuedCommandsRef.current.shift();
      }
      inFlightCommandRef.current = null;
      setCommandPending(queuedCommandsRef.current.length > 0);
      if (result.status === "rejected") setTimedError(result.message);
      flushCommandQueue();
    };

    const handleGameEvent: ServerEvents["game:event"] = (payload) => {
      if (ignoreRoomEventsRef.current) return;
      if (payload.gameId !== acceptedSessionRef.current?.gameId) return;
      const sequence = ++gameEventSequenceRef.current;
      setGameEvents((current) => [...current.slice(-49), { sequence, payload }]);
    };

    const handleReconnectableSeats: ServerEvents["room:reconnectableSeats"] = ({
      roomCode: recoveryRoomCode,
      seats,
    }) => {
      if (ignoreRecoveryEventsRef.current) return;
      if (seatLookupPendingRoomRef.current !== recoveryRoomCode) return;
      seatLookupPendingRoomRef.current = null;
      const discardResult = discardPendingSeatLookupRef.current;
      discardPendingSeatLookupRef.current = false;
      if (discardResult) {
        setSeatLookupState({ status: "idle", roomCode: null });
        return;
      }
      completedSeatLookupRoomRef.current = recoveryRoomCode;
      setReconnectableSeats(seats);
      setReconnectableSeatsRoomCode(recoveryRoomCode);
      setSeatLookupState({ status: "complete", roomCode: recoveryRoomCode });
    };

    const handleSeatClaimSubmitted: ServerEvents["room:seatClaimSubmitted"] = ({ requestId }) => {
      if (ignoreRecoveryEventsRef.current) return;
      if (pendingSeatClaimTargetRef.current) {
        pendingSeatClaimTargetRef.current.requestId = requestId;
      }
      setPendingSeatClaim((current) =>
        current ? { ...current, requestId, status: "waiting", message: null } : current,
      );
    };

    const handleSeatClaimResolved: ServerEvents["room:seatClaimResolved"] = ({
      requestId,
      approved,
      message,
    }) => {
      if (ignoreRecoveryEventsRef.current) return;
      const target = pendingSeatClaimTargetRef.current;
      const matchesTarget =
        !!target && (target.requestId === null || target.requestId === requestId);
      if (approved && matchesTarget) {
        sessionAcceptanceExpectationRef.current = {
          event: "room:joined",
          source: "claim",
          roomCode: target.roomCode,
          participantId: target.playerId,
        };
        membershipRequestPendingRef.current = true;
        setSessionPending(true);
      } else if (!approved && matchesTarget) {
        pendingSeatClaimTargetRef.current = null;
      }
      setPendingSeatClaim((current) => {
        if (!current || (current.requestId !== null && current.requestId !== requestId)) {
          return current;
        }
        const status: SeatClaimStatus = approved
          ? "approved"
          : current.status === "cancelling" || current.status === "cancelled"
            ? "cancelled"
            : "rejected";
        if (!approved && sessionAcceptanceExpectationRef.current?.source === "claim") {
          sessionAcceptanceExpectationRef.current = null;
        }
        return { ...current, requestId, status, message };
      });
    };

    const handleSeatClaimsUpdated: ServerEvents["admin:seatClaimsUpdated"] = ({ claims }) => {
      if (ignoreRoomEventsRef.current) return;
      setHostSeatClaims(claims);
    };

    const handleHostChanged: ServerEvents["room:hostChanged"] = ({ hostId, hostName, reason }) => {
      if (ignoreRoomEventsRef.current) return;
      const currentSeatId =
        snapshotRef.current?.viewer.role === "player"
          ? snapshotRef.current.viewer.seatId
          : playerId;
      if (hostId === currentSeatId) {
        setHostChangeNotice({ hostId, hostName, reason });
      } else {
        setHostChangeNotice(null);
        setHostSeatClaims([]);
      }
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("room:created", handleRoomCreated);
    socket.on("room:joined", handleRoomJoined);
    socket.on("room:spectatorJoined", handleSpectatorJoined);
    socket.on("room:error", handleRoomError);
    socket.on("room:reconnectError", handleReconnectError);
    socket.on("room:kicked", handleKicked);
    socket.on("room:snapshot", handleSnapshot);
    socket.on("room:commandResult", handleCommandResult);
    socket.on("game:event", handleGameEvent);
    socket.on("room:reconnectableSeats", handleReconnectableSeats);
    socket.on("room:seatClaimSubmitted", handleSeatClaimSubmitted);
    socket.on("room:seatClaimResolved", handleSeatClaimResolved);
    socket.on("admin:seatClaimsUpdated", handleSeatClaimsUpdated);
    socket.on("room:hostChanged", handleHostChanged);

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
      socket.off("room:snapshot", handleSnapshot);
      socket.off("room:commandResult", handleCommandResult);
      socket.off("game:event", handleGameEvent);
      socket.off("room:reconnectableSeats", handleReconnectableSeats);
      socket.off("room:seatClaimSubmitted", handleSeatClaimSubmitted);
      socket.off("room:seatClaimResolved", handleSeatClaimResolved);
      socket.off("admin:seatClaimsUpdated", handleSeatClaimsUpdated);
      socket.off("room:hostChanged", handleHostChanged);
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      resetCommandQueue();
    };
  }, [flushCommandQueue, resetCommandQueue]);

  const createRoom = useCallback((gameId: GameId, name: string) => {
    if (
      membershipRequestPendingRef.current ||
      seatLookupPendingRoomRef.current ||
      pendingSeatClaimTargetRef.current
    ) {
      return;
    }
    membershipRequestPendingRef.current = true;
    setSessionPending(true);
    explicitLeaveSuppressedRef.current = false;
    ignoreRecoveryEventsRef.current = true;
    sessionAcceptanceExpectationRef.current = {
      event: "room:created",
      source: "create",
      gameId,
    };
    socket.emit("room:create", { gameId, playerName: name });
  }, []);

  const joinRoom = useCallback((code: string, name: string) => {
    if (
      membershipRequestPendingRef.current ||
      seatLookupPendingRoomRef.current ||
      pendingSeatClaimTargetRef.current
    ) {
      return;
    }
    const normalizedRoomCode = code.trim().toUpperCase();
    membershipRequestPendingRef.current = true;
    setSessionPending(true);
    explicitLeaveSuppressedRef.current = false;
    ignoreRecoveryEventsRef.current = true;
    sessionAcceptanceExpectationRef.current = {
      event: "room:joined",
      source: "join",
      roomCode: normalizedRoomCode,
    };
    socket.emit("room:join", { roomCode: normalizedRoomCode, playerName: name });
  }, []);

  const joinAsSpectator = useCallback((code: string, name: string) => {
    if (
      membershipRequestPendingRef.current ||
      seatLookupPendingRoomRef.current ||
      pendingSeatClaimTargetRef.current
    ) {
      return;
    }
    const normalizedRoomCode = code.trim().toUpperCase();
    membershipRequestPendingRef.current = true;
    setSessionPending(true);
    explicitLeaveSuppressedRef.current = false;
    ignoreRecoveryEventsRef.current = true;
    sessionAcceptanceExpectationRef.current = {
      event: "room:spectatorJoined",
      source: "spectator",
      roomCode: normalizedRoomCode,
    };
    socket.emit("room:joinSpectator", {
      roomCode: normalizedRoomCode,
      spectatorName: name,
    });
  }, []);

  const rejoinRoom = useCallback((code: string, participantId: string) => {
    if (
      membershipReadyRef.current ||
      membershipRequestPendingRef.current ||
      seatLookupPendingRoomRef.current ||
      pendingSeatClaimTargetRef.current ||
      reconnectSessionTombstonedRef.current
    ) {
      return false;
    }
    const savedSession = acceptedSessionRef.current ?? readReconnectSession();
    if (!savedSession) return false;
    if (
      savedSession.roomCode !== code.trim().toUpperCase() ||
      savedSession.participantId !== participantId
    ) {
      return false;
    }

    membershipRequestPendingRef.current = true;
    setSessionPending(true);
    explicitLeaveSuppressedRef.current = false;
    sessionAcceptanceExpectationRef.current = {
      event: savedSession.role === "spectator" ? "room:spectatorJoined" : "room:joined",
      source: "rejoin",
      roomCode: savedSession.roomCode,
      participantId: savedSession.participantId,
    };
    setActiveGameId(savedSession.gameId);
    setRoomCode(savedSession.roomCode);
    setPlayerId(savedSession.participantId);
    setIsSpectator(savedSession.role === "spectator");
    setReconnectState("reconnecting");

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
  }, []);

  const resumeRetainedSession = useCallback(() => {
    if (!retainedReconnectSession) return false;
    return rejoinRoom(retainedReconnectSession.roomCode, retainedReconnectSession.participantId);
  }, [rejoinRoom, retainedReconnectSession]);

  const emitCommonCommand = useCallback(
    (command: CommonPlatformCommand): boolean => {
      const current = snapshotRef.current;
      if (!current) return false;
      return enqueueRoomCommand(current.gameId, command);
    },
    [enqueueRoomCommand],
  );

  const sendGameCommand = useCallback(
    <G extends GameId>(gameId: G, command: GameCommand<G>): boolean => {
      return enqueueRoomCommand(gameId, { type: "game", command });
    },
    [enqueueRoomCommand],
  );

  const updateSettings = useCallback(
    <G extends GameId>(gameId: G, settings: GameSettings<G>): boolean => {
      return enqueueRoomCommand(gameId, { type: "room:update-settings", settings });
    },
    [enqueueRoomCommand],
  );

  const setAdminPause = useCallback(
    (paused: boolean): boolean => emitCommonCommand({ type: "room:set-admin-pause", paused }),
    [emitCommonCommand],
  );

  const leaveRoom = useCallback(() => {
    const current = snapshotRef.current;
    const retainOwnership = shouldRetainReconnectSessionOnLeave(
      current?.lifecycle ?? null,
      isSpectator,
    );
    explicitLeaveSuppressedRef.current = retainOwnership;
    ignoreRoomEventsRef.current = true;
    ignoreRecoveryEventsRef.current = true;
    membershipReadyRef.current = false;
    sessionAcceptanceExpectationRef.current = null;
    pendingSeatClaimTargetRef.current = null;
    membershipRequestPendingRef.current = false;
    seatLookupPendingRoomRef.current = null;
    completedSeatLookupRoomRef.current = null;
    discardPendingSeatLookupRef.current = false;
    socket.emit("room:leave");

    if (!retainOwnership) {
      reconnectSessionTombstonedRef.current = true;
      clearReconnectSession();
      acceptedSessionRef.current = null;
    }
    snapshotRef.current = null;
    resetCommandQueue();
    setSessionPending(false);
    setActiveGameId(null);
    setRoomCode(null);
    setPlayerId(null);
    setIsSpectator(false);
    setSnapshot(null);
    setReconnectState("idle");
    setReconnectableSeats([]);
    setReconnectableSeatsRoomCode(null);
    setSeatLookupState({ status: "idle", roomCode: null });
    setPendingSeatClaim(null);
    setHostSeatClaims([]);
    setHostChangeNotice(null);
    setGameEvents([]);
    if (!retainOwnership) setRetainedReconnectSession(null);
  }, [isSpectator, resetCommandQueue]);

  const listReconnectableSeats = useCallback((code: string) => {
    if (
      membershipRequestPendingRef.current ||
      seatLookupPendingRoomRef.current ||
      pendingSeatClaimTargetRef.current
    ) {
      return;
    }
    const normalizedRoomCode = code.trim().toUpperCase();
    seatLookupPendingRoomRef.current = normalizedRoomCode;
    completedSeatLookupRoomRef.current = null;
    discardPendingSeatLookupRef.current = false;
    ignoreRecoveryEventsRef.current = false;
    sessionAcceptanceExpectationRef.current = null;
    pendingSeatClaimTargetRef.current = null;
    setReconnectableSeats([]);
    setReconnectableSeatsRoomCode(null);
    setSeatLookupState({ status: "pending", roomCode: normalizedRoomCode });
    setPendingSeatClaim(null);
    socket.emit("room:listReconnectableSeats", { roomCode: normalizedRoomCode });
  }, []);

  const requestSeatClaim = useCallback(
    (code: string, targetPlayerId: string, claimantName: string) => {
      const normalizedRoomCode = code.trim().toUpperCase();
      const selectedSeat = reconnectableSeats.find((seat) => seat.playerId === targetPlayerId);
      if (
        membershipRequestPendingRef.current ||
        seatLookupPendingRoomRef.current ||
        pendingSeatClaimTargetRef.current ||
        completedSeatLookupRoomRef.current !== normalizedRoomCode ||
        !selectedSeat
      ) {
        return;
      }
      ignoreRecoveryEventsRef.current = false;
      sessionAcceptanceExpectationRef.current = null;
      pendingSeatClaimTargetRef.current = {
        requestId: null,
        roomCode: normalizedRoomCode,
        playerId: targetPlayerId,
      };
      completedSeatLookupRoomRef.current = null;
      setReconnectableSeats([]);
      setReconnectableSeatsRoomCode(null);
      setSeatLookupState({ status: "idle", roomCode: null });
      setPendingSeatClaim({
        requestId: null,
        roomCode: normalizedRoomCode,
        playerId: targetPlayerId,
        playerName: selectedSeat.playerName,
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

  const clearReconnectableSeats = useCallback(() => {
    if (seatLookupPendingRoomRef.current) {
      discardPendingSeatLookupRef.current = true;
    } else {
      setSeatLookupState({ status: "idle", roomCode: null });
    }
    completedSeatLookupRoomRef.current = null;
    setReconnectableSeats([]);
    setReconnectableSeatsRoomCode(null);
  }, []);

  const resetSeatRecovery = useCallback(() => {
    if (seatLookupPendingRoomRef.current) {
      discardPendingSeatLookupRef.current = true;
    } else {
      setSeatLookupState({ status: "idle", roomCode: null });
    }
    completedSeatLookupRoomRef.current = null;
    setReconnectableSeats([]);
    setReconnectableSeatsRoomCode(null);
    if (pendingSeatClaimTargetRef.current) return;
    if (sessionAcceptanceExpectationRef.current?.source === "claim") {
      sessionAcceptanceExpectationRef.current = null;
    }
    setPendingSeatClaim((current) =>
      current && (current.status === "rejected" || current.status === "cancelled") ? null : current,
    );
  }, []);

  const cancelSeatClaim = useCallback(() => {
    if (!pendingSeatClaim?.requestId) return;
    socket.emit("room:cancelSeatClaim", { requestId: pendingSeatClaim.requestId });
    setPendingSeatClaim((current) =>
      current?.requestId === pendingSeatClaim.requestId
        ? { ...current, status: "cancelling", message: null }
        : current,
    );
  }, [pendingSeatClaim?.requestId]);

  const clearError = useCallback(() => setError(null), []);
  const clearHostChangeNotice = useCallback(() => setHostChangeNotice(null), []);

  return (
    <PlatformContext.Provider
      value={{
        connected,
        sessionPending,
        commandPending,
        activeGameId,
        roomCode,
        playerId,
        isSpectator,
        snapshot,
        error,
        reconnectState,
        reconnectableSeats,
        reconnectableSeatsRoomCode,
        seatLookupState,
        retainedReconnectSession,
        pendingSeatClaim,
        hostSeatClaims,
        hostChangeNotice,
        gameEvents,
        createRoom,
        joinRoom,
        joinAsSpectator,
        rejoinRoom,
        resumeRetainedSession,
        leaveRoom,
        clearError,
        setReady: (ready) => emitCommonCommand({ type: "seat:set-ready", ready }),
        startGame: () => emitCommonCommand({ type: "room:start" }),
        playAgain: () => emitCommonCommand({ type: "room:play-again" }),
        addBot: () => emitCommonCommand({ type: "room:add-bot" }),
        removeBot: (seatId) => emitCommonCommand({ type: "room:remove-bot", seatId }),
        assignTemporaryBot: (seatId) =>
          emitCommonCommand({ type: "room:assign-temporary-bot", seatId }),
        returnHumanControl: (seatId) =>
          emitCommonCommand({ type: "room:return-human-control", seatId }),
        kickPlayer: (seatId) => emitCommonCommand({ type: "room:exclude-seat", seatId }),
        transferHost: (seatId) => emitCommonCommand({ type: "room:transfer-host", seatId }),
        setAdminPause,
        resolveSeatClaim: (requestId, approved) =>
          emitCommonCommand({ type: "room:resolve-seat-claim", requestId, approved }),
        updateSettings,
        sendGameCommand,
        listReconnectableSeats,
        clearReconnectableSeats,
        resetSeatRecovery,
        requestSeatClaim,
        cancelSeatClaim,
        clearHostChangeNotice,
      }}
    >
      {children}
    </PlatformContext.Provider>
  );
}

export function usePlatform(): PlatformContextValue {
  const context = useContext(PlatformContext);
  if (!context) throw new Error("usePlatform must be used within PlatformProvider");
  return context;
}
