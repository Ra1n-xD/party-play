import type { GamePhase } from "../../../shared/types";

const ROOM_KEY = "bunker_room";
const PARTICIPANT_KEY = "bunker_player";
const TOKEN_KEY = "bunker_token";
const SPECTATOR_KEY = "bunker_spectator";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type ReconnectRole = "player" | "spectator";

export interface ReconnectSession {
  role: ReconnectRole;
  roomCode: string;
  participantId: string;
  sessionToken: string;
}

function getBrowserStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function normalizeSession(session: ReconnectSession): ReconnectSession | null {
  const roomCode = session.roomCode.trim().toUpperCase();
  const participantId = session.participantId.trim();
  const sessionToken = session.sessionToken.trim();

  if (!/^[A-Z0-9]{4,16}$/.test(roomCode)) return null;
  if (!/^p_[a-f0-9]{24}$/.test(participantId)) return null;
  if (!/^[a-f0-9]{64}$/.test(sessionToken)) return null;
  if (session.role !== "player" && session.role !== "spectator") return null;

  return { role: session.role, roomCode, participantId, sessionToken };
}

export function readReconnectSession(
  storage: StorageLike | null = getBrowserStorage(),
): ReconnectSession | null {
  if (!storage) return null;

  try {
    const roomCode = storage.getItem(ROOM_KEY);
    const participantId = storage.getItem(PARTICIPANT_KEY);
    const sessionToken = storage.getItem(TOKEN_KEY);
    if (!roomCode || !participantId || !sessionToken) return null;

    return normalizeSession({
      role: storage.getItem(SPECTATOR_KEY) === "true" ? "spectator" : "player",
      roomCode,
      participantId,
      sessionToken,
    });
  } catch {
    return null;
  }
}

export function saveReconnectSession(
  session: ReconnectSession,
  storage: StorageLike | null = getBrowserStorage(),
): boolean {
  if (!storage) return false;
  const normalized = normalizeSession(session);
  if (!normalized) return false;

  try {
    storage.setItem(ROOM_KEY, normalized.roomCode);
    storage.setItem(PARTICIPANT_KEY, normalized.participantId);
    storage.setItem(TOKEN_KEY, normalized.sessionToken);
    if (normalized.role === "spectator") {
      storage.setItem(SPECTATOR_KEY, "true");
    } else {
      storage.removeItem(SPECTATOR_KEY);
    }
    return true;
  } catch {
    return false;
  }
}

export function clearReconnectSession(storage: StorageLike | null = getBrowserStorage()): void {
  if (!storage) return;

  for (const key of [ROOM_KEY, PARTICIPANT_KEY, TOKEN_KEY, SPECTATOR_KEY]) {
    try {
      storage.removeItem(key);
    } catch {
      // A disabled storage backend must not prevent local UI teardown.
    }
  }
}

export function shouldRetainReconnectSessionOnLeave(
  phase: GamePhase | null,
  isSpectator: boolean,
): boolean {
  return !isSpectator && phase !== null && phase !== "LOBBY" && phase !== "GAME_OVER";
}
