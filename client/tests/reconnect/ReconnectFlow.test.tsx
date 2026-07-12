import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  clearReconnectSession,
  readReconnectSession,
  saveReconnectSession,
  shouldRetainReconnectSessionOnLeave,
  type StorageLike,
} from "../../src/context/reconnectStorage";

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

const roomCode = "ABCD";
const participantId = `p_${"1".repeat(24)}`;
const sessionToken = "a".repeat(64);

test("reconnect storage preserves the legacy bunker keys for players", () => {
  const storage = new MemoryStorage();

  assert.equal(
    saveReconnectSession({ role: "player", roomCode, participantId, sessionToken }, storage),
    true,
  );

  assert.deepEqual(readReconnectSession(storage), {
    role: "player",
    roomCode,
    participantId,
    sessionToken,
  });
  assert.equal(storage.getItem("bunker_room"), roomCode);
  assert.equal(storage.getItem("bunker_player"), participantId);
  assert.equal(storage.getItem("bunker_token"), sessionToken);
  assert.equal(storage.getItem("bunker_spectator"), null);
});

test("reconnect storage round-trips the legacy spectator marker", () => {
  const storage = new MemoryStorage();

  assert.equal(
    saveReconnectSession({ role: "spectator", roomCode, participantId, sessionToken }, storage),
    true,
  );

  assert.deepEqual(readReconnectSession(storage), {
    role: "spectator",
    roomCode,
    participantId,
    sessionToken,
  });
  assert.equal(storage.getItem("bunker_spectator"), "true");
});

test("reconnect storage rejects malformed values without deleting them", () => {
  const storage = new MemoryStorage();
  storage.setItem("bunker_room", "bad room");
  storage.setItem("bunker_player", participantId);
  storage.setItem("bunker_token", sessionToken);

  assert.equal(readReconnectSession(storage), null);
  assert.equal(storage.getItem("bunker_room"), "bad room");
  assert.equal(
    saveReconnectSession(
      { role: "player", roomCode, participantId: "invalid", sessionToken },
      storage,
    ),
    false,
  );
  assert.equal(storage.getItem("bunker_room"), "bad room");
});

test("terminal cleanup removes every compatible reconnect key", () => {
  const storage = new MemoryStorage();
  saveReconnectSession({ role: "spectator", roomCode, participantId, sessionToken }, storage);

  clearReconnectSession(storage);

  assert.equal(readReconnectSession(storage), null);
  assert.deepEqual([...storage.values], []);
});

test("only an active player seat retains ownership on explicit leave", () => {
  assert.equal(shouldRetainReconnectSessionOnLeave("ROUND_DISCUSSION", false), true);
  assert.equal(shouldRetainReconnectSessionOnLeave("LOBBY", false), false);
  assert.equal(shouldRetainReconnectSessionOnLeave("GAME_OVER", false), false);
  assert.equal(shouldRetainReconnectSessionOnLeave("ROUND_DISCUSSION", true), false);
  assert.equal(shouldRetainReconnectSessionOnLeave(null, false), false);
});

const contextSource = readFileSync(
  new URL("../../src/context/GameContext.tsx", import.meta.url),
  "utf8",
);

test("context installs reconnect handlers before connecting and retries each connection", () => {
  assert.match(contextSource, /socket\.on\("connect", handleConnect\)/);
  assert.match(contextSource, /handleConnect[\s\S]*attemptStoredRejoin/);
  assert.match(contextSource, /socket\.on\("connect", handleConnect\)[\s\S]*socket\.connect\(\)/);
  assert.match(contextSource, /if \(socket\.connected\)[\s\S]*handleConnect\(\)/);
  assert.match(contextSource, /socket\.off\("connect", handleConnect\)/);
});

test("transient disconnect keeps the current room and game snapshot", () => {
  assert.match(contextSource, /socket\.on\("disconnect", handleDisconnect\)/);
  assert.doesNotMatch(contextSource, /handleDisconnect[^}]*setRoomCode\(null\)/);
  assert.doesNotMatch(contextSource, /handleDisconnect[^}]*setGameState\(null\)/);
  assert.match(contextSource, /playerIdRef\.current !== null \|\| readReconnectSession\(\)/);
  assert.match(contextSource, /handleDisconnect[\s\S]*setReconnectState\("reconnecting"\)/);
});

test("terminal reconnect errors and kicks use the authoritative teardown", () => {
  assert.match(contextSource, /socket\.on\("room:reconnectError", handleReconnectError\)/);
  assert.match(contextSource, /handleReconnectError[\s\S]*if \(terminal\)/);
  assert.match(contextSource, /if \(terminal\)[\s\S]*clearStoredSession/);
  assert.match(contextSource, /socket\.on\("room:kicked", handleKicked\)/);
  assert.match(contextSource, /handleKicked[\s\S]*clearStoredSession/);
});

test("claim submission errors leave a resolved requester state", () => {
  assert.match(contextSource, /handleRoomError[\s\S]*current\?\.status === "submitting"/);
  assert.match(contextSource, /status: "rejected", message/);
});

test("context exposes typed claim and host orchestration", () => {
  for (const field of [
    "reconnectState",
    "reconnectableSeats",
    "pendingSeatClaim",
    "hostSeatClaims",
    "hostChangeNotice",
    "listReconnectableSeats",
    "requestSeatClaim",
    "cancelSeatClaim",
    "resolveSeatClaim",
    "kickPlayer",
    "transferHost",
    "clearHostChangeNotice",
  ]) {
    assert.match(contextSource, new RegExp(`\\b${field}\\b`), `${field} must be exposed`);
  }

  for (const event of [
    "room:reconnectableSeats",
    "room:seatClaimSubmitted",
    "room:seatClaimResolved",
    "admin:seatClaimsUpdated",
    "room:hostChanged",
  ]) {
    assert.match(contextSource, new RegExp(`socket\\.on\\("${event}"`));
  }
});

test("all reconnect storage writes are centralized in the helper", () => {
  assert.doesNotMatch(contextSource, /\blocalStorage\b/);
  assert.match(contextSource, /saveReconnectSession/);
  assert.match(contextSource, /readReconnectSession/);
  assert.match(contextSource, /clearReconnectSession/);
});

test("explicit active leave retains ownership and suppresses same-socket rejoin", () => {
  assert.match(contextSource, /shouldRetainReconnectSessionOnLeave/);
  assert.match(contextSource, /explicitLeaveSuppressedRef\.current = true/);
  assert.match(contextSource, /handleConnect[\s\S]*explicitLeaveSuppressedRef\.current/);
});
