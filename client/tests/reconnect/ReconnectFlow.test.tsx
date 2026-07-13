import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React, { StrictMode } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import type { Character, PublicGameState } from "../../../shared/types";
import type { Socket } from "socket.io-client";
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

class DeniedStorage implements StorageLike {
  getItem(): string | null {
    throw new DOMException("Storage disabled", "SecurityError");
  }

  setItem(): void {
    throw new DOMException("Storage disabled", "SecurityError");
  }

  removeItem(): void {
    throw new DOMException("Storage disabled", "SecurityError");
  }
}

class WriteDeniedStorage implements StorageLike {
  constructor(private readonly readable: StorageLike) {}

  getItem(key: string): string | null {
    return this.readable.getItem(key);
  }

  setItem(): void {
    throw new DOMException("Storage is read-only", "QuotaExceededError");
  }

  removeItem(key: string): void {
    this.readable.removeItem(key);
  }
}

class RemoveDeniedStorage implements StorageLike {
  constructor(private readonly readable: StorageLike) {}

  getItem(key: string): string | null {
    return this.readable.getItem(key);
  }

  setItem(key: string, value: string): void {
    this.readable.setItem(key, value);
  }

  removeItem(): void {
    throw new DOMException("Storage deletion is blocked", "SecurityError");
  }
}

const roomCode = "ABCD";
const participantId = `p_${"1".repeat(24)}`;
const sessionToken = "a".repeat(64);

const browserWindow = { location: { hostname: "localhost" } } as Window;
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: browserWindow,
});

function setBrowserStorage(storage: StorageLike): void {
  Object.defineProperty(browserWindow, "localStorage", {
    configurable: true,
    value: storage,
  });
}

type AnySocket = Socket<
  Record<string, (...args: any[]) => void>,
  Record<string, (...args: any[]) => void>
>;

class FakeSocketHarness {
  connected = false;
  id = "fake-socket-1";
  connectCalls = 0;
  readonly emitted: Array<{ event: string; args: unknown[] }> = [];
  readonly listeners = new Map<string, Set<(...args: any[]) => void>>();
  private readonly descriptors = new Map<string, PropertyDescriptor | undefined>();

  constructor(private readonly socket: AnySocket) {}

  install(): void {
    for (const key of ["connected", "id", "connect", "on", "off", "emit"]) {
      this.descriptors.set(key, Object.getOwnPropertyDescriptor(this.socket, key));
    }

    Object.defineProperties(this.socket, {
      connected: { configurable: true, get: () => this.connected },
      id: { configurable: true, get: () => this.id },
      connect: {
        configurable: true,
        value: () => {
          this.connectCalls++;
          return this.socket;
        },
      },
      on: {
        configurable: true,
        value: (event: string, listener: (...args: any[]) => void) => {
          let eventListeners = this.listeners.get(event);
          if (!eventListeners) {
            eventListeners = new Set();
            this.listeners.set(event, eventListeners);
          }
          eventListeners.add(listener);
          return this.socket;
        },
      },
      off: {
        configurable: true,
        value: (event: string, listener?: (...args: any[]) => void) => {
          if (listener) this.listeners.get(event)?.delete(listener);
          else this.listeners.delete(event);
          return this.socket;
        },
      },
      emit: {
        configurable: true,
        value: (event: string, ...args: unknown[]) => {
          this.emitted.push({ event, args });
          return this.socket;
        },
      },
    });
  }

  restore(): void {
    for (const [key, descriptor] of this.descriptors) {
      if (descriptor) Object.defineProperty(this.socket, key, descriptor);
      else delete (this.socket as unknown as Record<string, unknown>)[key];
    }
  }

  serverEmit(event: string, ...args: unknown[]): void {
    for (const listener of [...(this.listeners.get(event) ?? [])]) listener(...args);
  }

  emittedFor(event: string): Array<{ event: string; args: unknown[] }> {
    return this.emitted.filter((entry) => entry.event === event);
  }

  listenerCount(event: string): number {
    return this.listeners.get(event)?.size ?? 0;
  }
}

type GameContextSnapshot = ReturnType<(typeof import("../../src/context/GameContext"))["useGame"]>;

let runtimePromise:
  | Promise<{
      GameProvider: (typeof import("../../src/context/GameContext"))["GameProvider"];
      useGame: (typeof import("../../src/context/GameContext"))["useGame"];
      socket: (typeof import("../../src/socket"))["socket"];
    }>
  | undefined;

function loadRuntime() {
  runtimePromise ??= Promise.all([
    import("../../src/context/GameContext"),
    import("../../src/socket"),
  ]).then(([contextModule, socketModule]) => ({
    GameProvider: contextModule.GameProvider,
    useGame: contextModule.useGame,
    socket: socketModule.socket,
  }));
  return runtimePromise;
}

async function mountProvider(options: { connected?: boolean; socketId?: string } = {}) {
  const { GameProvider, useGame, socket } = await loadRuntime();
  const fake = new FakeSocketHarness(socket as unknown as AnySocket);
  fake.connected = options.connected ?? false;
  fake.id = options.socketId ?? "fake-socket-1";
  fake.install();

  let latest: GameContextSnapshot | null = null;
  const Probe = () => {
    latest = useGame();
    return null;
  };
  let renderer: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      <StrictMode>
        <GameProvider>
          <Probe />
        </GameProvider>
      </StrictMode>,
    );
  });

  return {
    fake,
    snapshot: () => {
      assert.ok(latest);
      return latest;
    },
    cleanup: async () => {
      await act(async () => renderer.unmount());
      fake.restore();
    },
  };
}

const otherPlayerId = `p_${"2".repeat(24)}`;
const session = {
  role: "player" as const,
  roomCode,
  participantId,
  sessionToken,
};

const character: Character = {
  attributes: [{ type: "profession", label: "Профессия", value: "Врач" }],
  actionCard: {
    id: "action-1",
    title: "План Б",
    description: "Повторное голосование",
    targetRequired: false,
  },
};

function makeGameState(
  phase: PublicGameState["phase"] = "ROUND_DISCUSSION",
  options: { includeCurrentPlayer?: boolean; isHost?: boolean } = {},
): PublicGameState {
  const players =
    options.includeCurrentPlayer === false
      ? []
      : [
          {
            id: participantId,
            name: "Player",
            ready: true,
            connected: true,
            alive: true,
            revealedAttributes: [],
            actionCardRevealed: false,
            isHost: options.isHost ?? false,
            isBot: false,
            kicked: false,
          },
        ];
  return {
    phase,
    roundNumber: phase === "LOBBY" ? 0 : 2,
    totalRounds: 5,
    catastrophe: null,
    revealedBunkerCards: [],
    totalBunkerCards: 3,
    threatCard: null,
    bunkerCapacity: 2,
    startedPlayerCount: players.length,
    players,
    currentTurnPlayerId: null,
    votesCount: 0,
    totalVotesExpected: 0,
    voteResults: null,
    eliminatedPlayerId: null,
    votingSchedule: [],
    currentVotingInRound: 0,
    votingsInCurrentRound: 0,
    lastEliminatedPlayerId: null,
    tiebreakCandidateIds: null,
    phaseRemainingMs: null,
    paused: false,
    pauseKind: "none",
    disconnectedPlayerIds: [],
    spectatorCount: 0,
  };
}

async function acceptPlayerSession(
  mounted: Awaited<ReturnType<typeof mountProvider>>,
): Promise<void> {
  await act(async () => mounted.snapshot().joinRoom(roomCode, "Player"));
  await act(async () => {
    mounted.fake.serverEmit("room:joined", {
      roomCode,
      playerId: participantId,
      sessionToken,
    });
  });
}

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

test("browser storage property SecurityError is treated as unavailable", () => {
  Object.defineProperty(browserWindow, "localStorage", {
    configurable: true,
    get: () => {
      throw new DOMException("Storage disabled", "SecurityError");
    },
  });

  try {
    assert.doesNotThrow(() => readReconnectSession());
    assert.equal(readReconnectSession(), null);
    assert.equal(saveReconnectSession(session), false);
    assert.doesNotThrow(() => clearReconnectSession());
  } finally {
    setBrowserStorage(new MemoryStorage());
  }
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
  assert.match(contextSource, /acceptedSessionRef\.current \?\? readReconnectSession\(\)/);
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

test("every room-scoped recovery handler ignores late events", () => {
  for (const handler of [
    "handleReconnectableSeats",
    "handleSeatClaimSubmitted",
    "handleSeatClaimResolved",
  ]) {
    const start = contextSource.indexOf(`const ${handler}`);
    assert.notEqual(start, -1, `${handler} must exist`);
    const nextHandler = contextSource.indexOf("\n\n    const handle", start + handler.length);
    const handlerSource = contextSource.slice(start, nextHandler === -1 ? undefined : nextHandler);
    assert.match(handlerSource, /if \(ignoreRecoveryEventsRef\.current\) return;/);
  }

  for (const handler of ["handleSeatClaimsUpdated", "handleHostChanged"]) {
    const start = contextSource.indexOf(`const ${handler}`);
    assert.notEqual(start, -1, `${handler} must exist`);
    const nextHandler = contextSource.indexOf("\n\n    const handle", start + handler.length);
    const handlerSource = contextSource.slice(start, nextHandler === -1 ? undefined : nextHandler);
    assert.match(handlerSource, /if \(ignoreRoomEventsRef\.current\) return;/);
  }
});

test("StrictMode-wrapped provider deduplicates same-socket connects and removes exact listeners", async () => {
  const storage = new MemoryStorage();
  saveReconnectSession(session, storage);
  setBrowserStorage(storage);
  const mounted = await mountProvider({ connected: true });
  let cleaned = false;

  try {
    assert.equal(mounted.fake.emittedFor("room:rejoin").length, 1);
    assert.deepEqual(mounted.fake.emittedFor("room:rejoin")[0]?.args, [
      { roomCode, playerId: participantId, sessionToken },
    ]);
    assert.equal(mounted.fake.listenerCount("connect"), 1);
    assert.equal(mounted.fake.listenerCount("room:reconnectError"), 1);

    await act(async () => mounted.fake.serverEmit("connect"));
    assert.equal(mounted.fake.emittedFor("room:rejoin").length, 1);

    await act(async () => mounted.fake.serverEmit("disconnect"));
    mounted.fake.id = "fake-socket-2";
    await act(async () => mounted.fake.serverEmit("connect"));
    assert.equal(mounted.fake.emittedFor("room:rejoin").length, 2);

    await mounted.cleanup();
    cleaned = true;
    assert.equal(mounted.fake.listenerCount("connect"), 0);
    assert.equal(mounted.fake.listenerCount("room:reconnectError"), 0);
  } finally {
    if (!cleaned) await mounted.cleanup();
  }
});

test("accepted in-memory session reconnects when storage fails and terminal errors clear it", async () => {
  setBrowserStorage(new DeniedStorage());
  const mounted = await mountProvider();

  try {
    await acceptPlayerSession(mounted);
    await act(async () => {
      mounted.fake.serverEmit("game:state", makeGameState());
      mounted.fake.serverEmit("game:character", character);
      mounted.fake.serverEmit("disconnect");
    });

    assert.equal(mounted.snapshot().reconnectState, "reconnecting");
    assert.equal(mounted.snapshot().roomCode, roomCode);
    assert.equal(mounted.snapshot().gameState?.phase, "ROUND_DISCUSSION");
    assert.equal(mounted.snapshot().myCharacter, character);

    mounted.fake.connected = true;
    mounted.fake.id = "fake-socket-2";
    await act(async () => mounted.fake.serverEmit("connect"));
    assert.deepEqual(mounted.fake.emittedFor("room:rejoin").at(-1)?.args, [
      { roomCode, playerId: participantId, sessionToken },
    ]);

    await act(async () => {
      mounted.fake.serverEmit("room:reconnectError", {
        message: "Место уже подключено",
        code: "SEAT_ALREADY_CONNECTED",
        terminal: false,
      });
    });
    assert.equal(mounted.snapshot().roomCode, roomCode);
    assert.equal(mounted.snapshot().gameState?.phase, "ROUND_DISCUSSION");

    await act(async () => {
      mounted.fake.serverEmit("room:reconnectError", {
        message: "Сессия недействительна",
        code: "INVALID_SESSION",
        terminal: true,
      });
    });
    assert.equal(mounted.snapshot().roomCode, null);
    assert.equal(mounted.snapshot().gameState, null);
    assert.equal(mounted.snapshot().myCharacter, null);

    const attemptsBefore = mounted.fake.emittedFor("room:rejoin").length;
    mounted.fake.id = "fake-socket-3";
    await act(async () => mounted.fake.serverEmit("connect"));
    assert.equal(mounted.fake.emittedFor("room:rejoin").length, attemptsBefore);
  } finally {
    await mounted.cleanup();
  }
});

test("a newly accepted in-memory session wins over stale readable storage after a write failure", async () => {
  const readableStorage = new MemoryStorage();
  const staleSession = {
    role: "player" as const,
    roomCode: "WXYZ",
    participantId: otherPlayerId,
    sessionToken: "b".repeat(64),
  };
  saveReconnectSession(staleSession, readableStorage);
  setBrowserStorage(new WriteDeniedStorage(readableStorage));
  const mounted = await mountProvider();

  try {
    await acceptPlayerSession(mounted);
    await act(async () => mounted.fake.serverEmit("disconnect"));
    mounted.fake.connected = true;
    mounted.fake.id = "fake-socket-2";
    await act(async () => mounted.fake.serverEmit("connect"));

    assert.deepEqual(mounted.fake.emittedFor("room:rejoin").at(-1)?.args, [
      { roomCode, playerId: participantId, sessionToken },
    ]);
  } finally {
    await mounted.cleanup();
  }
});

test("terminal teardown tombstones a stored session when browser deletion fails", async () => {
  const readableStorage = new MemoryStorage();
  saveReconnectSession(session, readableStorage);
  setBrowserStorage(new RemoveDeniedStorage(readableStorage));
  const mounted = await mountProvider({ connected: true });

  try {
    assert.equal(mounted.fake.emittedFor("room:rejoin").length, 1);
    await act(async () => {
      mounted.fake.serverEmit("room:reconnectError", {
        message: "Сессия недействительна",
        code: "INVALID_SESSION",
        terminal: true,
      });
      mounted.fake.serverEmit("room:joined", {
        roomCode: "WXYZ",
        playerId: otherPlayerId,
        sessionToken: "c".repeat(64),
      });
    });
    assert.equal(mounted.snapshot().roomCode, null);
    await act(async () => mounted.snapshot().rejoinRoom(roomCode, participantId));
    assert.equal(mounted.fake.emittedFor("room:rejoin").length, 1);

    await act(async () => mounted.fake.serverEmit("disconnect"));
    mounted.fake.id = "fake-socket-2";
    await act(async () => mounted.fake.serverEmit("connect"));

    assert.equal(mounted.snapshot().roomCode, null);
    assert.equal(mounted.fake.emittedFor("room:rejoin").length, 1);

    await act(async () => mounted.snapshot().joinRoom("WXYZ", "Fresh player"));
    await act(async () => {
      mounted.fake.serverEmit("room:error", { message: "Комната не найдена" });
      mounted.fake.serverEmit("disconnect");
    });
    mounted.fake.id = "fake-socket-3";
    await act(async () => mounted.fake.serverEmit("connect"));
    assert.equal(mounted.fake.emittedFor("room:rejoin").length, 1);

    await act(async () => mounted.snapshot().createRoom("Fresh player"));
    await act(async () => {
      mounted.fake.serverEmit("room:created", {
        roomCode: "WXYZ",
        playerId: otherPlayerId,
        sessionToken: "c".repeat(64),
      });
    });
    assert.equal(mounted.snapshot().roomCode, "WXYZ");
    assert.equal(mounted.snapshot().playerId, otherPlayerId);
  } finally {
    await mounted.cleanup();
  }
});

test("active leave retains in-memory ownership until a real disconnect while lobby leave clears it", async () => {
  setBrowserStorage(new DeniedStorage());
  const mounted = await mountProvider();

  try {
    await acceptPlayerSession(mounted);
    await act(async () => mounted.fake.serverEmit("game:state", makeGameState()));
    await act(async () => mounted.snapshot().leaveRoom());

    assert.equal(mounted.snapshot().roomCode, null);
    assert.equal(mounted.fake.emittedFor("room:leave").length, 1);
    await act(async () => mounted.fake.serverEmit("connect"));
    assert.equal(mounted.fake.emittedFor("room:rejoin").length, 0);

    await act(async () => mounted.fake.serverEmit("disconnect"));
    mounted.fake.id = "fake-socket-2";
    await act(async () => mounted.fake.serverEmit("connect"));
    assert.equal(mounted.fake.emittedFor("room:rejoin").length, 1);

    await acceptPlayerSession(mounted);
    await act(async () => mounted.fake.serverEmit("game:state", makeGameState("LOBBY")));
    await act(async () => mounted.snapshot().leaveRoom());
    await act(async () => mounted.fake.serverEmit("disconnect"));
    mounted.fake.id = "fake-socket-3";
    await act(async () => mounted.fake.serverEmit("connect"));
    assert.equal(mounted.fake.emittedFor("room:rejoin").length, 1);
  } finally {
    await mounted.cleanup();
  }
});

test("late recovery events stay ignored while Home recovery actions deliberately reopen them", async () => {
  setBrowserStorage(new MemoryStorage());
  const mounted = await mountProvider();

  try {
    await acceptPlayerSession(mounted);
    await act(async () => mounted.fake.serverEmit("game:state", makeGameState()));
    await act(async () => mounted.snapshot().leaveRoom());

    await act(async () => {
      mounted.fake.serverEmit("room:reconnectableSeats", {
        roomCode,
        seats: [{ playerId: otherPlayerId, playerName: "Late seat" }],
      });
      mounted.fake.serverEmit("admin:seatClaimsUpdated", {
        claims: [
          {
            requestId: "late-claim",
            playerId: otherPlayerId,
            playerName: "Late seat",
            claimantName: "Late claimant",
          },
        ],
      });
    });
    assert.deepEqual(mounted.snapshot().reconnectableSeats, []);
    assert.deepEqual(mounted.snapshot().hostSeatClaims, []);

    await act(async () => mounted.snapshot().listReconnectableSeats("efgh"));
    await act(async () => {
      mounted.fake.serverEmit("room:joined", {
        roomCode: "WXYZ",
        playerId: otherPlayerId,
        sessionToken: "c".repeat(64),
      });
      mounted.fake.serverEmit("room:reconnectableSeats", {
        roomCode: "EFGH",
        seats: [{ playerId: otherPlayerId, playerName: "Available seat" }],
      });
    });
    assert.equal(mounted.snapshot().roomCode, null);
    assert.deepEqual(mounted.snapshot().reconnectableSeats, [
      { playerId: otherPlayerId, playerName: "Available seat" },
    ]);

    await act(async () => mounted.snapshot().leaveRoom());
    await act(async () => mounted.snapshot().listReconnectableSeats("efgh"));
    await act(async () => {
      mounted.fake.serverEmit("room:reconnectableSeats", {
        roomCode: "EFGH",
        seats: [{ playerId: otherPlayerId, playerName: "Available seat" }],
      });
    });
    await act(async () => mounted.snapshot().requestSeatClaim("efgh", otherPlayerId, "Claimant"));
    await act(async () => {
      mounted.fake.serverEmit("room:joined", {
        roomCode: "EFGH",
        playerId: otherPlayerId,
        sessionToken: "d".repeat(64),
      });
      mounted.fake.serverEmit("room:seatClaimSubmitted", { requestId: "claim-1" });
    });
    assert.equal(mounted.snapshot().roomCode, null);
    assert.equal(mounted.snapshot().pendingSeatClaim?.status, "waiting");
    assert.equal(mounted.snapshot().pendingSeatClaim?.requestId, "claim-1");

    await act(async () => {
      mounted.fake.serverEmit("room:seatClaimResolved", {
        requestId: "claim-1",
        approved: true,
        message: "Заявка одобрена",
      });
      mounted.fake.serverEmit("room:joined", {
        roomCode: "EFGH",
        playerId: otherPlayerId,
        sessionToken: "d".repeat(64),
      });
    });
    assert.equal(mounted.snapshot().roomCode, "EFGH");
    assert.equal(mounted.snapshot().playerId, otherPlayerId);
  } finally {
    await mounted.cleanup();
  }
});

test("late session acceptance events cannot restore a room after active leave", async () => {
  setBrowserStorage(new MemoryStorage());
  const mounted = await mountProvider();
  const lateToken = "c".repeat(64);

  try {
    await acceptPlayerSession(mounted);
    await act(async () => mounted.fake.serverEmit("game:state", makeGameState()));
    await act(async () => mounted.snapshot().leaveRoom());
    await act(async () => {
      mounted.fake.serverEmit("room:created", {
        roomCode: "WXYZ",
        playerId: otherPlayerId,
        sessionToken: lateToken,
      });
      mounted.fake.serverEmit("room:joined", {
        roomCode: "WXYZ",
        playerId: otherPlayerId,
        sessionToken: lateToken,
      });
      mounted.fake.serverEmit("room:spectatorJoined", {
        roomCode: "WXYZ",
        spectatorId: otherPlayerId,
        sessionToken: lateToken,
      });
    });

    assert.equal(mounted.snapshot().roomCode, null);
    assert.equal(mounted.snapshot().playerId, null);
    assert.equal(mounted.snapshot().isSpectator, false);

    await act(async () => mounted.fake.serverEmit("disconnect"));
    mounted.fake.id = "fake-socket-2";
    await act(async () => mounted.fake.serverEmit("connect"));
    assert.deepEqual(mounted.fake.emittedFor("room:rejoin").at(-1)?.args, [
      { roomCode, playerId: participantId, sessionToken },
    ]);
  } finally {
    await mounted.cleanup();
  }
});

test("authoritative non-host state clears claims and host-change notice", async () => {
  setBrowserStorage(new MemoryStorage());
  const mounted = await mountProvider();
  const claim = {
    requestId: "claim-1",
    playerId: otherPlayerId,
    playerName: "Missing player",
    claimantName: "Claimant",
  };

  try {
    await acceptPlayerSession(mounted);
    await act(async () => {
      mounted.fake.serverEmit("game:state", makeGameState("ROUND_DISCUSSION", { isHost: true }));
      mounted.fake.serverEmit("room:hostChanged", {
        hostId: participantId,
        hostName: "Player",
        reason: "manual",
      });
      mounted.fake.serverEmit("admin:seatClaimsUpdated", { claims: [claim] });
    });
    assert.equal(mounted.snapshot().hostChangeNotice?.hostId, participantId);
    assert.deepEqual(mounted.snapshot().hostSeatClaims, [claim]);

    await act(async () => {
      mounted.fake.serverEmit(
        "game:state",
        makeGameState("ROUND_DISCUSSION", { includeCurrentPlayer: false }),
      );
    });
    assert.equal(mounted.snapshot().hostChangeNotice, null);
    assert.deepEqual(mounted.snapshot().hostSeatClaims, []);

    await act(async () => {
      mounted.fake.serverEmit("room:hostChanged", {
        hostId: participantId,
        hostName: "Player",
        reason: "recovery",
      });
      mounted.fake.serverEmit("admin:seatClaimsUpdated", { claims: [claim] });
      mounted.fake.serverEmit("game:state", makeGameState("ROUND_DISCUSSION", { isHost: false }));
    });
    assert.equal(mounted.snapshot().hostChangeNotice, null);
    assert.deepEqual(mounted.snapshot().hostSeatClaims, []);
  } finally {
    await mounted.cleanup();
  }
});

test("claim cancellation is explicit and does not depend on localized server copy", async () => {
  setBrowserStorage(new MemoryStorage());
  const mounted = await mountProvider();

  const loadSeat = async () => {
    await act(async () => mounted.snapshot().listReconnectableSeats(roomCode));
    await act(async () => {
      mounted.fake.serverEmit("room:reconnectableSeats", {
        roomCode,
        seats: [{ playerId: otherPlayerId, playerName: "Seat owner" }],
      });
    });
  };

  try {
    await loadSeat();
    await act(async () => mounted.snapshot().requestSeatClaim(roomCode, otherPlayerId, "Claimant"));
    await act(async () => {
      mounted.fake.serverEmit("room:seatClaimSubmitted", { requestId: "claim-1" });
    });
    await act(async () => mounted.snapshot().cancelSeatClaim());
    assert.equal(mounted.snapshot().pendingSeatClaim?.status, "cancelling");
    assert.deepEqual(mounted.fake.emittedFor("room:cancelSeatClaim").at(-1)?.args, [
      { requestId: "claim-1" },
    ]);

    await act(async () => {
      mounted.fake.serverEmit("room:seatClaimResolved", {
        requestId: "claim-1",
        approved: false,
        message: "Cancelled by requester",
      });
      mounted.fake.serverEmit("room:seatClaimResolved", {
        requestId: "claim-1",
        approved: false,
        message: "Duplicate resolution",
      });
    });
    assert.equal(mounted.snapshot().pendingSeatClaim?.status, "cancelled");

    await loadSeat();
    await act(async () => mounted.snapshot().requestSeatClaim(roomCode, otherPlayerId, "Claimant"));
    await act(async () => {
      mounted.fake.serverEmit("room:seatClaimSubmitted", { requestId: "claim-2" });
    });
    await act(async () => mounted.snapshot().cancelSeatClaim());
    await act(async () => {
      mounted.fake.serverEmit("room:error", { message: "Слишком много запросов" });
    });
    assert.equal(mounted.snapshot().pendingSeatClaim?.status, "waiting");
    assert.equal(mounted.snapshot().pendingSeatClaim?.message, "Слишком много запросов");

    await act(async () => {
      mounted.fake.serverEmit("room:seatClaimResolved", {
        requestId: "claim-2",
        approved: false,
        message: "Заявка отменена",
      });
    });
    assert.equal(mounted.snapshot().pendingSeatClaim?.status, "rejected");

    await loadSeat();
    await act(async () => mounted.snapshot().requestSeatClaim(roomCode, otherPlayerId, "Claimant"));
    await act(async () =>
      mounted.fake.serverEmit("room:error", { message: "Некорректная заявка" }),
    );
    assert.equal(mounted.snapshot().pendingSeatClaim?.status, "rejected");
    assert.equal(mounted.snapshot().pendingSeatClaim?.message, "Некорректная заявка");
    await act(async () => mounted.snapshot().resetSeatRecovery());
    assert.equal(mounted.snapshot().pendingSeatClaim, null);
  } finally {
    await mounted.cleanup();
  }
});

test("membership requests serialize until the current attempt resolves", async () => {
  setBrowserStorage(new MemoryStorage());
  const mounted = await mountProvider();

  try {
    await act(async () => {
      mounted.snapshot().joinRoom("AAAA", "Player");
      mounted.snapshot().joinRoom("BBBB", "Player");
    });
    assert.deepEqual(
      mounted.fake.emittedFor("room:join").map((entry) => entry.args),
      [[{ roomCode: "AAAA", playerName: "Player" }]],
    );

    await act(async () => {
      mounted.fake.serverEmit("room:error", { message: "Комната AAAA не найдена" });
      mounted.snapshot().joinRoom("BBBB", "Player");
    });
    assert.equal(mounted.fake.emittedFor("room:join").length, 2);

    await act(async () => {
      mounted.fake.serverEmit("room:joined", {
        roomCode: "BBBB",
        playerId: participantId,
        sessionToken,
      });
    });
    assert.equal(mounted.snapshot().roomCode, "BBBB");
  } finally {
    await mounted.cleanup();
  }
});

test("seat lookup and claim submission serialize recovery operations", async () => {
  setBrowserStorage(new MemoryStorage());
  const mounted = await mountProvider();
  const thirdPlayerId = `p_${"3".repeat(24)}`;

  try {
    await act(async () => {
      mounted.snapshot().listReconnectableSeats("AAAA");
      mounted.snapshot().listReconnectableSeats("BBBB");
      mounted.snapshot().requestSeatClaim("AAAA", otherPlayerId, "First claimant");
    });
    assert.deepEqual(
      mounted.fake.emittedFor("room:listReconnectableSeats").map((entry) => entry.args),
      [[{ roomCode: "AAAA" }]],
    );
    assert.equal(mounted.fake.emittedFor("room:requestSeatClaim").length, 0);

    await act(async () => {
      mounted.fake.serverEmit("room:error", { message: "Комната AAAA не найдена" });
      mounted.snapshot().listReconnectableSeats("BBBB");
    });
    await act(async () => {
      mounted.fake.serverEmit("room:reconnectableSeats", {
        roomCode: "BBBB",
        seats: [
          { playerId: otherPlayerId, playerName: "Михаил" },
          { playerId: thirdPlayerId, playerName: "Ольга" },
        ],
      });
    });

    await act(async () => {
      mounted.snapshot().requestSeatClaim("BBBB", otherPlayerId, "First claimant");
      mounted.snapshot().requestSeatClaim("BBBB", thirdPlayerId, "Second claimant");
    });
    assert.equal(mounted.fake.emittedFor("room:requestSeatClaim").length, 1);

    await act(async () => {
      mounted.fake.serverEmit("room:error", { message: "Первая заявка отклонена" });
    });
    await act(async () => mounted.snapshot().listReconnectableSeats("BBBB"));
    await act(async () => {
      mounted.fake.serverEmit("room:reconnectableSeats", {
        roomCode: "BBBB",
        seats: [{ playerId: thirdPlayerId, playerName: "Ольга" }],
      });
    });
    await act(async () =>
      mounted.snapshot().requestSeatClaim("BBBB", thirdPlayerId, "Second claimant"),
    );
    assert.equal(mounted.fake.emittedFor("room:requestSeatClaim").length, 2);
    assert.deepEqual(mounted.fake.emittedFor("room:requestSeatClaim").at(-1)?.args, [
      { roomCode: "BBBB", playerId: thirdPlayerId, claimantName: "Second claimant" },
    ]);
  } finally {
    await mounted.cleanup();
  }
});

test("completed seat lookup stays bound to its room and clears before claim", async () => {
  setBrowserStorage(new MemoryStorage());
  const mounted = await mountProvider();

  try {
    await act(async () => mounted.snapshot().listReconnectableSeats("AAAA"));
    await act(async () => {
      mounted.fake.serverEmit("room:reconnectableSeats", {
        roomCode: "AAAA",
        seats: [{ playerId: otherPlayerId, playerName: "Seat A" }],
      });
    });
    assert.equal(mounted.snapshot().reconnectableSeatsRoomCode, "AAAA");

    await act(async () => mounted.snapshot().requestSeatClaim("BBBB", otherPlayerId, "Wrong room"));
    assert.equal(mounted.fake.emittedFor("room:requestSeatClaim").length, 0);

    await act(async () => mounted.snapshot().clearReconnectableSeats());
    assert.deepEqual(mounted.snapshot().reconnectableSeats, []);
    assert.equal(mounted.snapshot().reconnectableSeatsRoomCode, null);

    await act(async () => mounted.snapshot().listReconnectableSeats("BBBB"));
    await act(async () => {
      mounted.fake.serverEmit("room:reconnectableSeats", {
        roomCode: "BBBB",
        seats: [{ playerId: otherPlayerId, playerName: "Seat B" }],
      });
    });
    await act(async () =>
      mounted.snapshot().requestSeatClaim("BBBB", otherPlayerId, "Correct room"),
    );
    assert.equal(mounted.fake.emittedFor("room:requestSeatClaim").length, 1);
    assert.deepEqual(mounted.snapshot().reconnectableSeats, []);
    assert.equal(mounted.snapshot().reconnectableSeatsRoomCode, null);
  } finally {
    await mounted.cleanup();
  }
});
