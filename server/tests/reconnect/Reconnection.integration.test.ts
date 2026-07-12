import assert from "node:assert/strict";
import test from "node:test";
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
});
