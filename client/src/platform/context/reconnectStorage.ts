import type { GameId } from "../../../../shared/platform/gameContract";
import type { RoomLifecycle } from "../../../../shared/platform/room";

const SESSION_KEY = "partyplay_reconnect_v1";
const LEGACY_ROOM_KEY = "bunker_room";
const LEGACY_PARTICIPANT_KEY = "bunker_player";
const LEGACY_TOKEN_KEY = "bunker_token";
const LEGACY_SPECTATOR_KEY = "bunker_spectator";

const LEGACY_KEYS = [
  LEGACY_ROOM_KEY,
  LEGACY_PARTICIPANT_KEY,
  LEGACY_TOKEN_KEY,
  LEGACY_SPECTATOR_KEY,
] as const;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type ReconnectRole = "player" | "spectator";

export interface ReconnectSession {
  version: 1;
  gameId: GameId;
  role: ReconnectRole;
  roomCode: string;
  participantId: string;
  sessionToken: string;
  autoRejoin: boolean;
}

function getBrowserStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isGameId(value: unknown): value is GameId {
  return value === "bunker" || value === "durak" || value === "uno";
}

function normalizeSession(value: unknown): ReconnectSession | null {
  if (!value || typeof value !== "object") return null;

  const session = value as Partial<ReconnectSession>;
  const roomCode =
    typeof session.roomCode === "string" ? session.roomCode.trim().toUpperCase() : "";
  const participantId =
    typeof session.participantId === "string" ? session.participantId.trim() : "";
  const sessionToken = typeof session.sessionToken === "string" ? session.sessionToken.trim() : "";

  if (session.version !== 1 || !isGameId(session.gameId)) return null;
  if (session.role !== "player" && session.role !== "spectator") return null;
  if (!/^[A-Z0-9]{4,16}$/.test(roomCode)) return null;
  if (!/^p_[a-f0-9]{24}$/.test(participantId)) return null;
  if (!/^[a-f0-9]{64}$/.test(sessionToken)) return null;

  return {
    version: 1,
    gameId: session.gameId,
    role: session.role,
    roomCode,
    participantId,
    sessionToken,
    autoRejoin: session.autoRejoin !== false,
  };
}

function clearLegacySession(storage: StorageLike): void {
  for (const key of LEGACY_KEYS) {
    try {
      storage.removeItem(key);
    } catch {
      // A partially unavailable storage backend must not break the app.
    }
  }
}

function readLegacySession(storage: StorageLike): ReconnectSession | null {
  const roomCode = storage.getItem(LEGACY_ROOM_KEY);
  const participantId = storage.getItem(LEGACY_PARTICIPANT_KEY);
  const sessionToken = storage.getItem(LEGACY_TOKEN_KEY);
  if (!roomCode || !participantId || !sessionToken) return null;

  return normalizeSession({
    version: 1,
    gameId: "bunker",
    role: storage.getItem(LEGACY_SPECTATOR_KEY) === "true" ? "spectator" : "player",
    roomCode,
    participantId,
    sessionToken,
  });
}

export function readReconnectSession(
  storage: StorageLike | null = getBrowserStorage(),
): ReconnectSession | null {
  if (!storage) return null;

  try {
    const stored = storage.getItem(SESSION_KEY);
    if (stored) {
      const normalized = normalizeSession(JSON.parse(stored));
      if (normalized) return normalized;
    }

    const legacy = readLegacySession(storage);
    if (!legacy) return null;

    if (saveReconnectSession(legacy, storage)) {
      clearLegacySession(storage);
    }
    return legacy;
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
    storage.setItem(SESSION_KEY, JSON.stringify(normalized));
    clearLegacySession(storage);
    return true;
  } catch {
    return false;
  }
}

export function clearReconnectSession(storage: StorageLike | null = getBrowserStorage()): void {
  if (!storage) return;

  for (const key of [SESSION_KEY, ...LEGACY_KEYS]) {
    try {
      storage.removeItem(key);
    } catch {
      // A disabled storage backend must not prevent local UI teardown.
    }
  }
}

export function shouldRetainReconnectSessionOnLeave(
  lifecycle: RoomLifecycle | null,
  isSpectator: boolean,
): boolean {
  return !isSpectator && lifecycle === "playing";
}
