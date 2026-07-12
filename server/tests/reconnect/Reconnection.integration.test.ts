import assert from "node:assert/strict";
import test from "node:test";
import { buildPublicState, resetGame } from "../../src/gameEngine.js";
import { getRoom, removePlayer } from "../../src/roomManager.js";
import { createSocketTestServer } from "../helpers/socketTestServer.js";

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
  assert.equal(buildPublicState(room).startedPlayerCount, 4);

  resetGame(room, server.io);
  const resetState = buildPublicState(room);
  assert.equal(resetState.phase, "LOBBY");
  assert.equal(resetState.startedPlayerCount, 3);
});
