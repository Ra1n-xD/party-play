import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { Server } from "socket.io";
import type { ClientEvents, GamePhase, ServerEvents } from "../../../shared/types.js";
import { clearBotActions, scheduleBotActions } from "../../src/botManager.js";
import { CONFIG } from "../../src/config.js";
import * as gameEngine from "../../src/gameEngine.js";
import {
  addDisconnectPause,
  isGameplayPaused,
  removeDisconnectPause,
  resumeGameIfReady,
  setAdminPause,
} from "../../src/gameEngine.js";
import {
  addBotToRoom,
  createRoom,
  getRoom,
  joinRoom,
  removePlayer,
  type Player,
  type Room,
} from "../../src/roomManager.js";
import { createSocketTestServer } from "../helpers/socketTestServer.js";

type IOServer = Server<ClientEvents, ServerEvents>;

interface StartedRoom {
  room: Room;
  io: IOServer;
  humans: Player[];
  bots: Player[];
}

function createStartedRoom(
  t: TestContext,
  { humanCount = 2, botCount = 0 }: { humanCount?: number; botCount?: number } = {},
): StartedRoom {
  const io = new Server<ClientEvents, ServerEvents>();
  const { room, player: host } = createRoom(`host-${Date.now()}`, "Host");
  const humans = [host];
  const bots: Player[] = [];

  for (let index = 1; index < humanCount; index++) {
    const joined = joinRoom(room.code, `human-${index}-${Date.now()}`, `Human ${index}`);
    if ("error" in joined) throw new Error(joined.error);
    humans.push(joined.player);
  }

  for (let index = 0; index < botCount; index++) {
    const bot = addBotToRoom(room);
    assert.ok(bot);
    bots.push(bot);
  }

  gameEngine.startGame(room, io);

  t.after(() => {
    clearBotActions(room.code);
    if (room.gameState?.phaseTimer) clearTimeout(room.gameState.phaseTimer);
    for (const playerId of Array.from(room.players.keys())) removePlayer(room, playerId);
    io.removeAllListeners();
  });

  return { room, io, humans, bots };
}

function moveToPhase(room: Room, phase: GamePhase): void {
  assert.ok(room.gameState);
  if (room.gameState.phaseTimer) clearTimeout(room.gameState.phaseTimer);
  room.gameState.phaseTimer = null;
  room.gameState.phaseEndTime = null;
  room.gameState.pausedCallback = null;
  room.gameState.phase = phase;
}

function useFastBotTimers(t: TestContext): void {
  const originalMin = CONFIG.BOT_ACTION_DELAY_MIN;
  const originalMax = CONFIG.BOT_ACTION_DELAY_MAX;
  CONFIG.BOT_ACTION_DELAY_MIN = 10;
  CONFIG.BOT_ACTION_DELAY_MAX = 10;
  t.after(() => {
    CONFIG.BOT_ACTION_DELAY_MIN = originalMin;
    CONFIG.BOT_ACTION_DELAY_MAX = originalMax;
  });
}

test("socket harness creates a typed lobby room", async (t) => {
  const server = await createSocketTestServer();
  t.after(() => server.close());

  const host = await server.connectClient();
  host.emit("room:create", { playerName: "Host" });

  const created = await host.waitFor("room:created");
  const state = await host.waitFor("game:state");

  assert.equal(created.roomCode.length, 8);
  assert.equal(state.phase, "LOBBY");
  assert.equal(state.pauseKind, "none");
  assert.deepEqual(state.disconnectedPlayerIds, []);
  assert.equal(state.players[0]?.kicked, false);
});

test("consecutive socket harnesses isolate failed rejoin state", async (t) => {
  const firstServer = await createSocketTestServer();
  let secondServer: Awaited<ReturnType<typeof createSocketTestServer>> | undefined;
  t.after(async () => {
    await firstServer.close();
    await secondServer?.close();
  });

  const invalidSession = {
    roomCode: "DEADBEEF",
    playerId: `p_${"a".repeat(24)}`,
    sessionToken: "b".repeat(64),
  };

  const firstClient = await firstServer.connectClient();
  firstClient.emit("room:rejoin", invalidSession);
  assert.equal((await firstClient.waitFor("room:error")).message, "Не удалось переподключиться");

  await firstServer.close();

  secondServer = await createSocketTestServer();
  const secondClient = await secondServer.connectClient();
  secondClient.emit("room:rejoin", invalidSession);

  assert.equal((await secondClient.waitFor("room:error")).message, "Не удалось переподключиться");
});

test("started player count is dynamic only while the room is in the lobby", async (t) => {
  const server = await createSocketTestServer();
  t.after(() => server.close());

  const host = await server.connectClient();
  host.emit("room:create", { playerName: "Host" });

  const created = await host.waitFor("room:created");
  const initialLobby = await host.waitFor("game:state");
  assert.equal(initialLobby.startedPlayerCount, 1);

  for (let playerCount = 2; playerCount <= 4; playerCount++) {
    host.emit("room:addBot");
    const lobbyState = await host.waitFor(
      "game:state",
      (state) => state.players.length === playerCount,
    );
    assert.equal(lobbyState.startedPlayerCount, playerCount);
  }

  const room = getRoom(created.roomCode);
  assert.ok(room);

  host.emit("game:start");
  const startedState = await host.waitFor(
    "game:state",
    (state) => state.phase === "CATASTROPHE_REVEAL",
  );
  assert.equal(startedState.startedPlayerCount, 4);

  const bot = Array.from(room.players.values()).find((player) => player.isBot);
  assert.ok(bot);
  removePlayer(room, bot.id);
  assert.equal(gameEngine.buildPublicState(room).startedPlayerCount, 4);

  gameEngine.resetGame(room, server.io);
  const resetState = gameEngine.buildPublicState(room);
  assert.equal(resetState.phase, "LOBBY");
  assert.equal(resetState.startedPlayerCount, 3);
});

test("pause engine exports composable reason helpers", () => {
  assert.equal(typeof addDisconnectPause, "function");
  assert.equal(typeof removeDisconnectPause, "function");
  assert.equal(typeof setAdminPause, "function");
  assert.equal(typeof isGameplayPaused, "function");
  assert.equal(typeof resumeGameIfReady, "function");
  assert.equal(typeof clearBotActions, "function");
});

test("startGame cannot replace an active reconnect-paused game", (t) => {
  const { room, io, humans } = createStartedRoom(t);
  addDisconnectPause(room, humans[0].id, io);
  assert.ok(room.gameState);
  assert.ok(humans[0].character);

  const originalGameState = room.gameState;
  const originalCharacter = humans[0].character;
  const originalPhase = room.gameState.phase;
  const originalTimer = room.gameState.phaseTimer;
  const originalPhaseEndTime = room.gameState.phaseEndTime;
  const originalRemainingMs = room.gameState.pausedTimeRemaining;
  const originalCallback = room.gameState.pausedCallback;
  const originalAdminPause = room.gameState.pauseReasons.admin;
  const originalDisconnectedIds = Array.from(
    room.gameState.pauseReasons.disconnectedPlayerIds,
  );

  gameEngine.startGame(room, io);

  assert.equal(room.gameState, originalGameState);
  assert.equal(humans[0].character, originalCharacter);
  assert.equal(room.gameState.phase, originalPhase);
  assert.equal(room.gameState.phaseTimer, originalTimer);
  assert.equal(room.gameState.phaseEndTime, originalPhaseEndTime);
  assert.equal(room.gameState.pausedTimeRemaining, originalRemainingMs);
  assert.equal(room.gameState.pausedCallback, originalCallback);
  assert.equal(room.gameState.pauseReasons.admin, originalAdminPause);
  assert.deepEqual(
    Array.from(room.gameState.pauseReasons.disconnectedPlayerIds),
    originalDisconnectedIds,
  );
});

test("game:start socket rejects an active reconnect-paused game without mutation", async (t) => {
  const server = await createSocketTestServer();
  t.after(() => server.close());

  const host = await server.connectClient();
  host.emit("room:create", { playerName: "Host" });
  const created = await host.waitFor("room:created");
  await host.waitFor("game:state");

  for (let playerCount = 2; playerCount <= 4; playerCount++) {
    host.emit("room:addBot");
    await host.waitFor("game:state", (state) => state.players.length === playerCount);
  }

  host.emit("game:start");
  await host.waitFor("game:state", (state) => state.phase === "CATASTROPHE_REVEAL");

  const room = getRoom(created.roomCode);
  assert.ok(room?.gameState);
  const hostPlayer = room.players.get(created.playerId);
  assert.ok(hostPlayer?.character);

  addDisconnectPause(room, hostPlayer.id, server.io);
  await host.waitFor(
    "game:state",
    (state) => state.paused && state.pauseKind === "reconnect",
  );

  const originalGameState = room.gameState;
  const originalCharacter = hostPlayer.character;
  const originalRemainingMs = room.gameState.pausedTimeRemaining;
  const originalDisconnectedIds = Array.from(
    room.gameState.pauseReasons.disconnectedPlayerIds,
  );

  type StartAttemptOutcome =
    | { event: "error"; message: string }
    | { event: "state" }
    | { event: "timeout" };

  const outcome = await new Promise<StartAttemptOutcome>((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout>;

    const cleanup = () => {
      clearTimeout(timer);
      host.socket.off("room:error", onError);
      host.socket.off("game:state", onState);
    };
    const finish = (value: StartAttemptOutcome) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };
    const onError = ({ message }: { message: string }) => finish({ event: "error", message });
    const onState = () => finish({ event: "state" });

    host.socket.on("room:error", onError);
    host.socket.on("game:state", onState);
    timer = setTimeout(() => finish({ event: "timeout" }), 250);
    host.emit("game:start");
  });

  assert.deepEqual(outcome, { event: "error", message: "Игра уже началась" });
  assert.equal(room.gameState, originalGameState);
  assert.equal(hostPlayer.character, originalCharacter);
  assert.equal(room.gameState.pausedTimeRemaining, originalRemainingMs);
  assert.deepEqual(
    Array.from(room.gameState.pauseReasons.disconnectedPlayerIds),
    originalDisconnectedIds,
  );
});

test("reconnect pause preserves the phase timer and resumes from the frozen remainder", async (t) => {
  const { room, io, humans } = createStartedRoom(t);
  const beforeDisconnectRemainingMs = gameEngine.buildPublicState(room).phaseRemainingMs;
  assert.ok(beforeDisconnectRemainingMs);

  await delay(20);
  addDisconnectPause(room, humans[0].id, io);

  const firstPause = gameEngine.buildPublicState(room);
  assert.equal(firstPause.phaseRemainingMs, null);
  assert.equal(firstPause.pauseKind, "reconnect");
  assert.deepEqual(firstPause.disconnectedPlayerIds, [humans[0].id]);

  await delay(20);
  removeDisconnectPause(room, humans[0].id, io);

  const resumed = gameEngine.buildPublicState(room);
  const resumedRemainingMs = resumed.phaseRemainingMs;
  assert.equal(resumed.paused, false);
  assert.ok(resumedRemainingMs !== null);
  assert.ok(resumedRemainingMs <= beforeDisconnectRemainingMs);
  assert.ok(resumedRemainingMs > beforeDisconnectRemainingMs - 500);
});

test("pause remains active until two missing player reasons are both removed", (t) => {
  const { room, io, humans } = createStartedRoom(t);

  addDisconnectPause(room, humans[0].id, io);
  assert.ok(room.gameState);
  const capturedRemainingMs = room.gameState.pausedTimeRemaining;

  addDisconnectPause(room, humans[1].id, io);
  assert.equal(room.gameState.pausedTimeRemaining, capturedRemainingMs);

  removeDisconnectPause(room, humans[0].id, io);
  const afterOneReturn = gameEngine.buildPublicState(room);
  assert.equal(afterOneReturn.paused, true);
  assert.equal(afterOneReturn.pauseKind, "reconnect");
  assert.deepEqual(afterOneReturn.disconnectedPlayerIds, [humans[1].id]);

  removeDisconnectPause(room, humans[1].id, io);
  const afterAllReturn = gameEngine.buildPublicState(room);
  assert.equal(afterAllReturn.paused, false);
  assert.equal(afterAllReturn.pauseKind, "none");
  assert.deepEqual(afterAllReturn.disconnectedPlayerIds, []);
});

test("admin and reconnect pause reasons compose without overwriting the timer snapshot", (t) => {
  const { room, io, humans } = createStartedRoom(t);

  addDisconnectPause(room, humans[0].id, io);
  assert.ok(room.gameState);
  const capturedRemainingMs = room.gameState.pausedTimeRemaining;

  setAdminPause(room, true, io);
  const mixedPause = gameEngine.buildPublicState(room);
  assert.equal(mixedPause.paused, true);
  assert.equal(mixedPause.pauseKind, "mixed");
  assert.equal(room.gameState.pausedTimeRemaining, capturedRemainingMs);

  removeDisconnectPause(room, humans[0].id, io);
  const adminOnlyPause = gameEngine.buildPublicState(room);
  assert.equal(adminOnlyPause.paused, true);
  assert.equal(adminOnlyPause.pauseKind, "admin");
  assert.equal(adminOnlyPause.phaseRemainingMs, null);

  setAdminPause(room, false, io);
  assert.equal(gameEngine.buildPublicState(room).paused, false);
});

test("paused phase callbacks cannot advance the game", (t) => {
  const { room, io, humans } = createStartedRoom(t);
  assert.ok(room.gameState?.pausedCallback);
  const callback = room.gameState.pausedCallback;
  const originalPhase = room.gameState.phase;
  const originalRound = room.gameState.roundNumber;

  addDisconnectPause(room, humans[0].id, io);
  callback();

  assert.equal(room.gameState.phase, originalPhase);
  assert.equal(room.gameState.roundNumber, originalRound);
});

test("revealAttribute rejects gameplay mutation while paused", (t) => {
  const { room, io, humans } = createStartedRoom(t);
  moveToPhase(room, "ROUND_REVEAL");
  assert.ok(room.gameState);
  room.gameState.roundNumber = 1;
  room.gameState.turnOrder = humans.map((player) => player.id);
  room.gameState.currentTurnIndex = 0;

  addDisconnectPause(room, humans[1].id, io);
  const accepted = gameEngine.revealAttribute(room, humans[0].id, undefined, io);

  assert.equal(accepted, false);
  assert.deepEqual(humans[0].revealedIndices, []);
  assert.equal(room.gameState.currentTurnIndex, 0);
});

test("revealActionCard rejects gameplay mutation while paused", (t) => {
  const { room, io, humans } = createStartedRoom(t);
  addDisconnectPause(room, humans[1].id, io);

  const accepted = gameEngine.revealActionCard(room, humans[0].id, io);

  assert.equal(accepted, false);
  assert.equal(humans[0].actionCardRevealed, false);
});

test("castVote rejects gameplay mutation while paused", (t) => {
  const { room, io, humans } = createStartedRoom(t);
  moveToPhase(room, "ROUND_VOTE");
  assert.ok(room.gameState);
  addDisconnectPause(room, humans[1].id, io);

  const accepted = gameEngine.castVote(room, humans[0].id, humans[1].id, io);

  assert.equal(accepted, false);
  assert.equal(humans[0].hasVoted, false);
  assert.equal(room.gameState.votes.size, 0);
});

test("skipDiscussion rejects phase mutation while paused", (t) => {
  const { room, io, humans } = createStartedRoom(t);
  moveToPhase(room, "ROUND_DISCUSSION");
  addDisconnectPause(room, humans[1].id, io);

  const result = gameEngine.skipDiscussion(room, io);

  assert.equal(result.success, false);
  assert.equal(room.gameState?.phase, "ROUND_DISCUSSION");
});

test("bot reveal timer is cancelled while paused and rescheduled once on final resume", async (t) => {
  useFastBotTimers(t);
  const { room, io, humans, bots } = createStartedRoom(t, { humanCount: 1, botCount: 1 });
  const bot = bots[0];
  moveToPhase(room, "ROUND_REVEAL");
  assert.ok(room.gameState);
  room.gameState.roundNumber = 1;
  room.gameState.turnOrder = [bot.id];
  room.gameState.currentTurnIndex = 0;

  scheduleBotActions(room, io);
  addDisconnectPause(room, humans[0].id, io);
  await delay(50);

  assert.deepEqual(bot.revealedIndices, []);
  assert.equal(room.gameState.currentTurnIndex, 0);

  removeDisconnectPause(room, humans[0].id, io);
  removeDisconnectPause(room, humans[0].id, io);
  resumeGameIfReady(room, io);
  await delay(50);

  assert.deepEqual(bot.revealedIndices, [0]);
});

test("bot vote timer is cancelled while paused and rescheduled once on final resume", async (t) => {
  useFastBotTimers(t);
  const { room, io, humans, bots } = createStartedRoom(t, { humanCount: 1, botCount: 1 });
  const bot = bots[0];
  moveToPhase(room, "ROUND_VOTE");
  assert.ok(room.gameState);

  scheduleBotActions(room, io);
  addDisconnectPause(room, humans[0].id, io);
  await delay(50);

  assert.equal(bot.hasVoted, false);
  assert.equal(room.gameState.votes.size, 0);

  removeDisconnectPause(room, humans[0].id, io);
  removeDisconnectPause(room, humans[0].id, io);
  resumeGameIfReady(room, io);
  await delay(50);

  assert.equal(bot.hasVoted, true);
  assert.equal(room.gameState.votes.size, 1);
  assert.equal(room.gameState.votes.get(bot.id), humans[0].id);

  await delay(30);
  assert.equal(room.gameState.votes.size, 1);
});

test("bot seats never create reconnect pause reasons", (t) => {
  const { room, io, bots } = createStartedRoom(t, { humanCount: 1, botCount: 1 });

  addDisconnectPause(room, bots[0].id, io);

  const state = gameEngine.buildPublicState(room);
  assert.equal(state.paused, false);
  assert.equal(state.pauseKind, "none");
  assert.deepEqual(state.disconnectedPlayerIds, []);
});
