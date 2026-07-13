import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type {
  GuestWeddingState,
  HostWeddingState,
  WeddingOptionStyle,
  WeddingParticipantSummary,
} from "../../../shared/types";
import { weddingSocket } from "./weddingSocket";

const SESSION_KEY = "partyplay:wedding-participant";

export interface WeddingSession {
  participantId: string;
  participantName: string;
}

export function toWeddingRejoinPayload(session: WeddingSession): {
  participantId: string;
  name: string;
} {
  return { participantId: session.participantId, name: session.participantName };
}

export function readWeddingSession(): WeddingSession | null {
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const session = value as Partial<WeddingSession>;
    return typeof session.participantId === "string" && typeof session.participantName === "string"
      ? { participantId: session.participantId, participantName: session.participantName }
      : null;
  } catch {
    return null;
  }
}

function saveWeddingSession(session: WeddingSession): void {
  try {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // Name selection remains available when browser storage is unavailable.
  }
}

function clearWeddingSession(): void {
  try {
    window.sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // The server remains authoritative even when storage cannot be cleared.
  }
}

interface WeddingContextValue {
  role: "guest" | "host";
  connected: boolean;
  roomExists: boolean;
  expiresAt: number | null;
  participants: WeddingParticipantSummary[];
  guestState: GuestWeddingState | null;
  hostState: HostWeddingState | null;
  error: string | null;
  joinNew: (name: string) => void;
  rejoin: (participantId: string, name: string) => void;
  answer: (optionIndex: number) => void;
  createRoom: () => void;
  setDraft: (optionStyle: WeddingOptionStyle, correctOption: number | null) => void;
  startQuestion: () => void;
  prepareNextQuestion: () => void;
  adjustScore: (participantId: string, delta: -1 | 1) => void;
  finishContest: () => void;
  restartContest: () => void;
}

const WeddingContext = createContext<WeddingContextValue | null>(null);

export function WeddingProvider({
  role,
  children,
}: {
  role: "guest" | "host";
  children: React.ReactNode;
}) {
  const [connected, setConnected] = useState(false);
  const [roomExists, setRoomExists] = useState(false);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [participants, setParticipants] = useState<WeddingParticipantSummary[]>([]);
  const [guestState, setGuestState] = useState<GuestWeddingState | null>(null);
  const [hostState, setHostState] = useState<HostWeddingState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onConnect = () => {
      setConnected(true);
      setError(null);
      if (role === "host") {
        weddingSocket.emit("wedding:hostConnect");
      } else {
        const session = readWeddingSession();
        if (session) weddingSocket.emit("wedding:rejoin", toWeddingRejoinPayload(session));
        else weddingSocket.emit("wedding:listParticipants");
      }
    };
    const onDisconnect = () => setConnected(false);
    const onAvailability = (data: { exists: boolean; expiresAt: number | null }) => {
      setRoomExists(data.exists);
      setExpiresAt(data.expiresAt);
      if (!data.exists) {
        setGuestState(null);
        setHostState(null);
      }
    };
    const onParticipants = (data: { participants: WeddingParticipantSummary[] }) =>
      setParticipants(data.participants);
    const onJoined = (data: WeddingSession) => saveWeddingSession(data);
    const onGuestState = (state: GuestWeddingState) => setGuestState(state);
    const onHostState = (state: HostWeddingState) => setHostState(state);
    const onError = (data: { message: string }) => {
      setError(data.message);
      if (/участник не найден/i.test(data.message)) clearWeddingSession();
    };
    const onExpired = () => {
      setRoomExists(false);
      setGuestState(null);
      setHostState(null);
      clearWeddingSession();
    };

    weddingSocket.on("connect", onConnect);
    weddingSocket.on("disconnect", onDisconnect);
    weddingSocket.on("wedding:availability", onAvailability);
    weddingSocket.on("wedding:participants", onParticipants);
    weddingSocket.on("wedding:joined", onJoined);
    weddingSocket.on("wedding:guestState", onGuestState);
    weddingSocket.on("wedding:hostState", onHostState);
    weddingSocket.on("wedding:error", onError);
    weddingSocket.on("wedding:expired", onExpired);
    if (!weddingSocket.connected) weddingSocket.connect();
    else onConnect();

    return () => {
      weddingSocket.off("connect", onConnect);
      weddingSocket.off("disconnect", onDisconnect);
      weddingSocket.off("wedding:availability", onAvailability);
      weddingSocket.off("wedding:participants", onParticipants);
      weddingSocket.off("wedding:joined", onJoined);
      weddingSocket.off("wedding:guestState", onGuestState);
      weddingSocket.off("wedding:hostState", onHostState);
      weddingSocket.off("wedding:error", onError);
      weddingSocket.off("wedding:expired", onExpired);
      weddingSocket.disconnect();
    };
  }, [role]);

  const joinNew = useCallback(
    (name: string) => weddingSocket.emit("wedding:joinNew", { name }),
    [],
  );
  const rejoin = useCallback(
    (participantId: string, name: string) =>
      weddingSocket.emit("wedding:rejoin", { participantId, name }),
    [],
  );
  const answer = useCallback(
    (optionIndex: number) => weddingSocket.emit("wedding:answer", { optionIndex }),
    [],
  );
  const createRoom = useCallback(() => weddingSocket.emit("wedding:createRoom"), []);
  const setDraft = useCallback(
    (optionStyle: WeddingOptionStyle, correctOption: number | null) =>
      weddingSocket.emit("wedding:setDraft", { optionStyle, correctOption }),
    [],
  );
  const startQuestion = useCallback(() => weddingSocket.emit("wedding:startQuestion"), []);
  const prepareNextQuestion = useCallback(() => weddingSocket.emit("wedding:prepareNext"), []);
  const adjustScore = useCallback(
    (participantId: string, delta: -1 | 1) =>
      weddingSocket.emit("wedding:adjustScore", { participantId, delta }),
    [],
  );
  const finishContest = useCallback(() => weddingSocket.emit("wedding:endContest"), []);
  const restartContest = useCallback(() => weddingSocket.emit("wedding:restartContest"), []);

  const value = useMemo<WeddingContextValue>(
    () => ({
      role,
      connected,
      roomExists,
      expiresAt,
      participants,
      guestState,
      hostState,
      error,
      joinNew,
      rejoin,
      answer,
      createRoom,
      setDraft,
      startQuestion,
      prepareNextQuestion,
      adjustScore,
      finishContest,
      restartContest,
    }),
    [
      role,
      connected,
      roomExists,
      expiresAt,
      participants,
      guestState,
      hostState,
      error,
      joinNew,
      rejoin,
      answer,
      createRoom,
      setDraft,
      startQuestion,
      prepareNextQuestion,
      adjustScore,
      finishContest,
      restartContest,
    ],
  );

  return <WeddingContext.Provider value={value}>{children}</WeddingContext.Provider>;
}

export function useWedding(): WeddingContextValue {
  const context = useContext(WeddingContext);
  if (!context) throw new Error("useWedding must be used inside WeddingProvider");
  return context;
}
