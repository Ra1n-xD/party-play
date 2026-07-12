import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { Server } from "socket.io";
import type {
  Character,
  ClientEvents,
  GamePhase,
  PublicGameState,
  ReconnectErrorCode,
  ServerEvents,
} from "../../../shared/types.js";
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
  getAllRooms,
  getRoom,
  joinRoom,
  removePlayer,
  type Player,
  type Room,
} from "../../src/roomManager.js";
import * as reconnectManager from "../../src/reconnectManager.js";
import { resetSocketHandlerStateForTests } from "../../src/socketHandlers.js";
import {
  createSocketTestServer,
  type SocketTestClient,
  type SocketTestServer,
} from "../helpers/socketTestServer.js";

type IOServer = Server<ClientEvents, ServerEvents>;

interface StartedRoom {
  room: Room;
  io: IOServer;
  humans: Player[];
  bots: Player[];
}

interface SocketPlayerCredential {
  roomCode: string;
  playerId: string;
  sessionToken: string;
}

interface SocketStartedGame {
  server: SocketTestServer;
  host: SocketTestClient;
  humans: SocketTestClient[];
  credentials: SocketPlayerCredential[];
  characters: Character[];
  room: Room;
}

interface SocketLobby {
  server: SocketTestServer;
  host: SocketTestClient;
  humans: SocketTestClient[];
  credentials: SocketPlayerCredential[];
  room: Room;
}

type ServerEventPayload<Event extends keyof ServerEvents> = ServerEvents[Event] extends (
  data: infer Payload,
) => void
  ? Payload
  : never;

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

function takeScheduledPhaseCallback(room: Room): () => void {
  const state = room.gameState;
  assert.ok(state);
  const callback = state.pausedCallback;
  assert.ok(callback);
  if (state.phaseTimer) clearTimeout(state.phaseTimer);
  state.phaseTimer = null;
  state.phaseEndTime = null;
  state.pausedCallback = null;
  return callback;
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

function useShortReconnectGrace(t: TestContext, gracePeriodMs = 20): void {
  const originalGracePeriod = CONFIG.RECONNECT_GRACE_PERIOD;
  CONFIG.RECONNECT_GRACE_PERIOD = gracePeriodMs;
  t.after(() => {
    CONFIG.RECONNECT_GRACE_PERIOD = originalGracePeriod;
  });
}

async function createFourHumanSocketLobby(t: TestContext): Promise<SocketLobby> {
  const server = await createSocketTestServer();
  t.after(() => server.close());

  const host = await server.connectClient();
  host.emit("room:create", { playerName: "Host" });
  const hostCredential = await host.waitFor("room:created");
  await host.waitFor("game:state", (state) => state.players.length === 1);

  const humans = [host];
  const credentials: SocketPlayerCredential[] = [hostCredential];
  for (let index = 1; index < 4; index++) {
    const human = await server.connectClient();
    human.emit("room:join", {
      roomCode: hostCredential.roomCode,
      playerName: `Human ${index}`,
    });
    credentials.push(await human.waitFor("room:joined"));
    humans.push(human);
    await host.waitFor("game:state", (state) => state.players.length === index + 1);
  }

  const room = getRoom(hostCredential.roomCode);
  assert.ok(room);
  return { server, host, humans, credentials, room };
}

async function createFourHumanSocketGame(t: TestContext): Promise<SocketStartedGame> {
  const lobby = await createFourHumanSocketLobby(t);

  for (const human of lobby.humans.slice(1)) {
    human.emit("player:ready", { ready: true });
  }
  await lobby.host.waitFor("game:state", (state) =>
    state.players.filter((player) => !player.isHost).every((player) => player.ready),
  );

  const characterPromises = lobby.humans.map((human) => human.waitFor("game:character"));
  lobby.host.emit("game:start");
  const characters = await Promise.all(characterPromises);
  await lobby.host.waitFor("game:state", (state) => state.phase === "CATASTROPHE_REVEAL");

  return { ...lobby, characters };
}

async function emitTransferAndWaitForServer(
  server: SocketTestServer,
  actor: SocketTestClient,
  targetPlayerId: string,
): Promise<void> {
  const actorSocketId = actor.socket.id;
  assert.ok(actorSocketId);
  const serverSocket = server.io.sockets.sockets.get(actorSocketId);
  assert.ok(serverSocket);
  const handled = new Promise<void>((resolve) => {
    serverSocket.once("admin:transferHost", () => resolve());
  });

  actor.emit("admin:transferHost", { targetPlayerId });
  await handled;
  await delay(10);
}

async function emitLeaveAndWaitForServer(
  server: SocketTestServer,
  client: SocketTestClient,
): Promise<void> {
  const socketId = client.socket.id;
  assert.ok(socketId);
  const serverSocket = server.io.sockets.sockets.get(socketId);
  assert.ok(serverSocket);
  const handled = new Promise<void>((resolve) => {
    serverSocket.once("room:leave", () => resolve());
  });

  client.emit("room:leave");
  await handled;
  await delay(10);
}

async function joinSpectator(
  server: SocketTestServer,
  roomCode: string,
  name = "Observer",
): Promise<SocketTestClient> {
  const spectator = await server.connectClient();
  spectator.emit("room:joinSpectator", { roomCode, spectatorName: name });
  await spectator.waitFor("room:spectatorJoined");
  await spectator.waitFor("game:state");
  return spectator;
}

type RejoinOutcome =
  | {
      event: "joined";
      payload: { roomCode: string; playerId: string; sessionToken: string };
    }
  | {
      event: "reconnectError";
      payload: { message: string; code: ReconnectErrorCode; terminal: boolean };
    }
  | { event: "roomError"; payload: { message: string } };

function waitForRejoinOutcome(client: SocketTestClient): Promise<RejoinOutcome> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for reconnect outcome"));
    }, 1_000);
    const cleanup = () => {
      clearTimeout(timer);
      client.socket.off("room:joined", onJoined);
      client.socket.off("room:reconnectError", onReconnectError);
      client.socket.off("room:error", onRoomError);
    };
    const onJoined = (payload: { roomCode: string; playerId: string; sessionToken: string }) => {
      cleanup();
      resolve({ event: "joined", payload });
    };
    const onReconnectError = (payload: {
      message: string;
      code: ReconnectErrorCode;
      terminal: boolean;
    }) => {
      cleanup();
      resolve({ event: "reconnectError", payload });
    };
    const onRoomError = (payload: { message: string }) => {
      cleanup();
      resolve({ event: "roomError", payload });
    };

    client.socket.on("room:joined", onJoined);
    client.socket.on("room:reconnectError", onReconnectError);
    client.socket.on("room:error", onRoomError);
  });
}

type MembershipOutcome = { event: "roomError"; message: string } | { event: "spectatorJoined" };

function waitForMembershipOutcome(client: SocketTestClient): Promise<MembershipOutcome> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for membership outcome"));
    }, 1_000);
    const cleanup = () => {
      clearTimeout(timer);
      client.socket.off("room:error", onRoomError);
      client.socket.off("room:spectatorJoined", onSpectatorJoined);
    };
    const onRoomError = ({ message }: { message: string }) => {
      cleanup();
      resolve({ event: "roomError", message });
    };
    const onSpectatorJoined = () => {
      cleanup();
      resolve({ event: "spectatorJoined" });
    };

    client.socket.on("room:error", onRoomError);
    client.socket.on("room:spectatorJoined", onSpectatorJoined);
  });
}

function waitForSocketEvent<Event extends keyof ServerEvents>(
  client: SocketTestClient,
  event: Event,
  predicate: (payload: ServerEventPayload<Event>) => boolean = () => true,
  timeoutMs = 750,
): Promise<ServerEventPayload<Event>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for Socket.IO event: ${String(event)}`));
    }, timeoutMs);
    const listener = (payload: ServerEventPayload<Event>) => {
      if (!predicate(payload)) return;
      cleanup();
      resolve(payload);
    };
    const cleanup = () => {
      clearTimeout(timer);
      client.socket.off(event, listener as never);
    };

    client.socket.on(event, listener as never);
  });
}

async function disconnectLobbyHuman(lobby: SocketLobby, index: number): Promise<void> {
  const credential = lobby.credentials[index];
  const disconnected = lobby.host.waitFor(
    "game:state",
    (state) =>
      state.players.find((player) => player.id === credential.playerId)?.connected === false,
  );
  lobby.humans[index].disconnect();
  await disconnected;
}

async function disconnectStartedHumanWithoutPause(
  game: SocketStartedGame,
  index: number,
): Promise<Player> {
  const player = game.room.players.get(game.credentials[index].playerId);
  assert.ok(player);
  const socketId = game.humans[index].socket.id;
  assert.ok(socketId);
  const serverSocket = game.server.io.sockets.sockets.get(socketId);
  assert.ok(serverSocket);
  const disconnected = new Promise<void>((resolve) => {
    serverSocket.once("disconnect", () => resolve());
  });

  // This seam isolates natural round completion from reconnect-pause behavior.
  player.connected = false;
  game.humans[index].disconnect();
  await disconnected;
  assert.equal(game.room.gameState?.pauseReasons.disconnectedPlayerIds.has(player.id), false);
  return player;
}

async function submitSeatClaim(
  claimant: SocketTestClient,
  roomCode: string,
  playerId: string,
  claimantName: string,
): Promise<{ requestId: string }> {
  const submitted = waitForSocketEvent(claimant, "room:seatClaimSubmitted");
  claimant.emit("room:requestSeatClaim", { roomCode, playerId, claimantName });
  return submitted;
}

async function waitForRoomError(
  client: SocketTestClient,
  message?: string,
): Promise<{ message: string }> {
  return waitForSocketEvent(
    client,
    "room:error",
    (payload) => message === undefined || payload.message === message,
  );
}

function isSocketInRoom(
  server: SocketTestServer,
  client: SocketTestClient,
  roomCode: string,
): boolean {
  const socketId = client.socket.id;
  assert.ok(socketId);
  return server.io.sockets.adapter.rooms.get(roomCode)?.has(socketId) ?? false;
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

test("reconnectable seat listing exposes only disconnected open humans and keeps the requester private", async (t) => {
  const lobby = await createFourHumanSocketLobby(t);
  lobby.host.emit("room:addBot");
  await lobby.host.waitFor("game:state", (state) => state.players.length === 5);

  await disconnectLobbyHuman(lobby, 1);
  await disconnectLobbyHuman(lobby, 2);
  const reconnectable = lobby.room.players.get(lobby.credentials[1].playerId);
  const closed = lobby.room.players.get(lobby.credentials[2].playerId);
  const bot = Array.from(lobby.room.players.values()).find((player) => player.isBot);
  assert.ok(reconnectable);
  assert.ok(closed);
  assert.ok(bot);
  reconnectable.alive = false;
  closed.kicked = true;
  bot.connected = false;

  const requester = await lobby.server.connectClient();
  const leakedStates: PublicGameState[] = [];
  const leakedCharacters: Character[] = [];
  const leakedClaims: unknown[] = [];
  requester.socket.on("game:state", (state) => leakedStates.push(state));
  requester.socket.on("game:character", (character) => leakedCharacters.push(character));
  requester.socket.on("admin:seatClaimsUpdated", (claims) => leakedClaims.push(claims));

  const seatsPromise = waitForSocketEvent(requester, "room:reconnectableSeats");
  requester.emit("room:listReconnectableSeats", {
    roomCode: ` ${lobby.room.code.toLowerCase()} `,
  });

  assert.deepEqual(await seatsPromise, {
    roomCode: lobby.room.code,
    seats: [
      {
        playerId: reconnectable.id,
        playerName: reconnectable.name,
      },
    ],
  });
  await delay(25);

  const requesterSocketId = requester.socket.id;
  assert.ok(requesterSocketId);
  assert.equal(
    lobby.server.io.sockets.adapter.rooms.get(lobby.room.code)?.has(requesterSocketId) ?? false,
    false,
  );
  assert.deepEqual(leakedStates, []);
  assert.deepEqual(leakedCharacters, []);
  assert.deepEqual(leakedClaims, []);
});

test("seat claim endpoints validate rooms, seats, names, and runtime payloads without mutation", async (t) => {
  const lobby = await createFourHumanSocketLobby(t);
  await disconnectLobbyHuman(lobby, 1);
  await disconnectLobbyHuman(lobby, 2);
  const closed = lobby.room.players.get(lobby.credentials[2].playerId);
  assert.ok(closed);
  closed.kicked = true;

  lobby.host.emit("room:addBot");
  await lobby.host.waitFor("game:state", (state) => state.players.length === 5);
  const bot = Array.from(lobby.room.players.values()).find((player) => player.isBot);
  assert.ok(bot);
  bot.connected = false;

  const invalidCases: Array<{
    payload: unknown;
    message: string;
  }> = [
    {
      payload: { roomCode: "?", playerId: lobby.credentials[1].playerId, claimantName: "A" },
      message: "Введите код комнаты",
    },
    {
      payload: {
        roomCode: "DEADBEEF",
        playerId: lobby.credentials[1].playerId,
        claimantName: "A",
      },
      message: "Комната не найдена",
    },
    {
      payload: { roomCode: lobby.room.code, playerId: "bad", claimantName: "A" },
      message: "Место недоступно для восстановления",
    },
    {
      payload: {
        roomCode: lobby.room.code,
        playerId: lobby.credentials[0].playerId,
        claimantName: "A",
      },
      message: "Место недоступно для восстановления",
    },
    {
      payload: { roomCode: lobby.room.code, playerId: bot.id, claimantName: "A" },
      message: "Место недоступно для восстановления",
    },
    {
      payload: { roomCode: lobby.room.code, playerId: closed.id, claimantName: "A" },
      message: "Место недоступно для восстановления",
    },
    {
      payload: {
        roomCode: lobby.room.code,
        playerId: lobby.credentials[1].playerId,
        claimantName: "<> ",
      },
      message: `Имя должно быть от 1 до ${CONFIG.MAX_PLAYER_NAME_LENGTH} символов`,
    },
    {
      payload: {
        roomCode: lobby.room.code,
        playerId: lobby.credentials[1].playerId,
        claimantName: "x".repeat(CONFIG.MAX_PLAYER_NAME_LENGTH + 1),
      },
      message: `Имя должно быть от 1 до ${CONFIG.MAX_PLAYER_NAME_LENGTH} символов`,
    },
  ];

  for (const { payload, message } of invalidCases) {
    const claimant = await lobby.server.connectClient();
    const error = waitForRoomError(claimant, message);
    claimant.socket.emit("room:requestSeatClaim", payload as never);
    assert.deepEqual(await error, { message });
    assert.equal(isSocketInRoom(lobby.server, claimant, lobby.room.code), false);
  }

  const invalidListRequester = await lobby.server.connectClient();
  const invalidListError = waitForRoomError(invalidListRequester, "Введите код комнаты");
  invalidListRequester.socket.emit("room:listReconnectableSeats", { roomCode: null } as never);
  assert.deepEqual(await invalidListError, { message: "Введите код комнаты" });
  assert.equal(lobby.room.pendingSeatClaims.size, 0);
});

test("claim submission uses a crypto id and two-minute expiry without leaking membership or game data", async (t) => {
  const game = await createFourHumanSocketGame(t);
  const targetIndex = 1;
  const targetCredential = game.credentials[targetIndex];
  game.humans[targetIndex].disconnect();
  await game.host.waitFor(
    "game:state",
    (state) =>
      state.players.find((player) => player.id === targetCredential.playerId)?.connected === false,
  );

  const claimant = await game.server.connectClient();
  const nonHost = game.humans[2];
  const leakedStates: PublicGameState[] = [];
  const leakedCharacters: Character[] = [];
  const claimantClaimLists: unknown[] = [];
  const nonHostClaimLists: unknown[] = [];
  claimant.socket.on("game:state", (state) => leakedStates.push(state));
  claimant.socket.on("game:character", (character) => leakedCharacters.push(character));
  claimant.socket.on("admin:seatClaimsUpdated", (claims) => claimantClaimLists.push(claims));
  nonHost.socket.on("admin:seatClaimsUpdated", (claims) => nonHostClaimLists.push(claims));

  const submitted = await submitSeatClaim(
    claimant,
    ` ${game.room.code.toLowerCase()} `,
    targetCredential.playerId,
    " <Replacement> ",
  );
  const update = await game.host.waitFor(
    "admin:seatClaimsUpdated",
    ({ claims }) => claims.length === 1,
  );
  assert.match(submitted.requestId, /^[a-f0-9]{32}$/);
  assert.deepEqual(update, {
    claims: [
      {
        requestId: submitted.requestId,
        playerId: targetCredential.playerId,
        playerName: "Human 1",
        claimantName: "Replacement",
      },
    ],
  });

  const stored = game.room.pendingSeatClaims.get(submitted.requestId);
  assert.ok(stored);
  assert.equal(stored.socketId, claimant.socket.id);
  assert.equal(stored.claimantName, "Replacement");
  assert.equal(stored.expiresAt - stored.createdAt, 120_000);
  await delay(30);

  assert.equal(isSocketInRoom(game.server, claimant, game.room.code), false);
  assert.deepEqual(leakedStates, []);
  assert.deepEqual(leakedCharacters, []);
  assert.deepEqual(claimantClaimLists, []);
  assert.deepEqual(nonHostClaimLists, []);
});

test("host rejection is terminal and duplicate or stale resolutions are idempotent", async (t) => {
  const lobby = await createFourHumanSocketLobby(t);
  await disconnectLobbyHuman(lobby, 1);
  const claimant = await lobby.server.connectClient();
  const { requestId } = await submitSeatClaim(
    claimant,
    lobby.room.code,
    lobby.credentials[1].playerId,
    "Replacement",
  );
  await lobby.host.waitFor("admin:seatClaimsUpdated", ({ claims }) =>
    claims.some((claim) => claim.requestId === requestId),
  );

  const resolutions: Array<{ requestId: string; approved: boolean; message: string }> = [];
  claimant.socket.on("room:seatClaimResolved", (resolution) => resolutions.push(resolution));
  const rejected = waitForSocketEvent(
    claimant,
    "room:seatClaimResolved",
    (resolution) => resolution.requestId === requestId,
  );
  const cleared = waitForSocketEvent(
    lobby.host,
    "admin:seatClaimsUpdated",
    ({ claims }) => claims.length === 0,
  );
  lobby.host.emit("admin:resolveSeatClaim", { requestId, approved: false });

  assert.deepEqual(await rejected, {
    requestId,
    approved: false,
    message: "Хост отклонил заявку",
  });
  assert.deepEqual(await cleared, { claims: [] });
  assert.equal(lobby.room.pendingSeatClaims.size, 0);

  const staleError = waitForRoomError(lobby.host, "Заявка уже обработана или не найдена");
  lobby.host.emit("admin:resolveSeatClaim", { requestId, approved: false });
  assert.deepEqual(await staleError, { message: "Заявка уже обработана или не найдена" });

  const malformedError = waitForRoomError(lobby.host, "Некорректный ID заявки");
  lobby.host.socket.emit("admin:resolveSeatClaim", {
    requestId: "not-a-claim",
    approved: true,
  } as never);
  assert.deepEqual(await malformedError, { message: "Некорректный ID заявки" });
  await delay(20);
  assert.equal(resolutions.length, 1);
});

test("only the owning requester can cancel a claim and repeated cancellation is stale", async (t) => {
  const lobby = await createFourHumanSocketLobby(t);
  await disconnectLobbyHuman(lobby, 1);
  const claimant = await lobby.server.connectClient();
  const intruder = await lobby.server.connectClient();
  const { requestId } = await submitSeatClaim(
    claimant,
    lobby.room.code,
    lobby.credentials[1].playerId,
    "Replacement",
  );

  const foreignError = waitForRoomError(intruder, "Заявка не найдена");
  intruder.emit("room:cancelSeatClaim", { requestId });
  assert.deepEqual(await foreignError, { message: "Заявка не найдена" });
  assert.equal(lobby.room.pendingSeatClaims.has(requestId), true);

  const cancelled = waitForSocketEvent(
    claimant,
    "room:seatClaimResolved",
    (resolution) => resolution.requestId === requestId,
  );
  const hostCleared = waitForSocketEvent(
    lobby.host,
    "admin:seatClaimsUpdated",
    ({ claims }) => claims.length === 0,
  );
  claimant.emit("room:cancelSeatClaim", { requestId });
  assert.deepEqual(await cancelled, {
    requestId,
    approved: false,
    message: "Заявка отменена",
  });
  assert.deepEqual(await hostCleared, { claims: [] });

  const repeatedError = waitForRoomError(claimant, "Заявка не найдена");
  claimant.emit("room:cancelSeatClaim", { requestId });
  assert.deepEqual(await repeatedError, { message: "Заявка не найдена" });
  assert.equal(lobby.room.pendingSeatClaims.size, 0);
});

test("seat claims expire exactly at the deterministic two-minute boundary", async (t) => {
  const lobby = await createFourHumanSocketLobby(t);
  await disconnectLobbyHuman(lobby, 1);
  const claimant = await lobby.server.connectClient();
  const { requestId } = await submitSeatClaim(
    claimant,
    lobby.room.code,
    lobby.credentials[1].playerId,
    "Replacement",
  );
  const claim = lobby.room.pendingSeatClaims.get(requestId);
  assert.ok(claim);
  assert.equal(claim.expiresAt - claim.createdAt, 120_000);

  assert.equal(
    reconnectManager.expireSeatClaims(lobby.room, lobby.server.io, claim.expiresAt - 1),
    0,
  );
  assert.equal(lobby.room.pendingSeatClaims.has(requestId), true);

  const expired = waitForSocketEvent(
    claimant,
    "room:seatClaimResolved",
    (resolution) => resolution.requestId === requestId,
  );
  const hostCleared = waitForSocketEvent(
    lobby.host,
    "admin:seatClaimsUpdated",
    ({ claims }) => claims.length === 0,
  );
  assert.equal(reconnectManager.expireSeatClaims(lobby.room, lobby.server.io, claim.expiresAt), 1);
  assert.deepEqual(await expired, {
    requestId,
    approved: false,
    message: "Время ожидания истекло",
  });
  assert.deepEqual(await hostCleared, { claims: [] });
  assert.equal(lobby.room.pendingSeatClaims.size, 0);

  const staleError = waitForRoomError(lobby.host, "Заявка уже обработана или не найдена");
  lobby.host.emit("admin:resolveSeatClaim", { requestId, approved: true });
  assert.deepEqual(await staleError, { message: "Заявка уже обработана или не найдена" });
});

test("requester cancellation expires a logically overdue claim before cancelling it", async (t) => {
  const lobby = await createFourHumanSocketLobby(t);
  await disconnectLobbyHuman(lobby, 1);
  const claimant = await lobby.server.connectClient();
  const { requestId } = await submitSeatClaim(
    claimant,
    lobby.room.code,
    lobby.credentials[1].playerId,
    "Replacement",
  );
  const claim = lobby.room.pendingSeatClaims.get(requestId);
  assert.ok(claim);
  claim.expiresAt = Date.now() - 1;

  const errors: string[] = [];
  claimant.socket.on("room:error", ({ message }) => errors.push(message));
  const expired = waitForSocketEvent(
    claimant,
    "room:seatClaimResolved",
    (resolution) => resolution.requestId === requestId,
  );
  const hostCleared = waitForSocketEvent(
    lobby.host,
    "admin:seatClaimsUpdated",
    ({ claims }) => claims.length === 0,
  );
  claimant.emit("room:cancelSeatClaim", { requestId });

  assert.deepEqual(await expired, {
    requestId,
    approved: false,
    message: "Время ожидания истекло",
  });
  assert.deepEqual(await hostCleared, { claims: [] });
  await delay(20);
  assert.deepEqual(errors, []);
});

test("requester leave expires overdue claims before socket cleanup cancellation", async (t) => {
  const lobby = await createFourHumanSocketLobby(t);
  await disconnectLobbyHuman(lobby, 1);
  const claimant = await lobby.server.connectClient();
  const { requestId } = await submitSeatClaim(
    claimant,
    lobby.room.code,
    lobby.credentials[1].playerId,
    "Replacement",
  );
  const claim = lobby.room.pendingSeatClaims.get(requestId);
  assert.ok(claim);
  claim.expiresAt = Date.now() - 1;

  const expired = waitForSocketEvent(
    claimant,
    "room:seatClaimResolved",
    (resolution) => resolution.requestId === requestId,
  );
  const hostCleared = waitForSocketEvent(
    lobby.host,
    "admin:seatClaimsUpdated",
    ({ claims }) => claims.length === 0,
  );
  claimant.emit("room:leave");

  assert.deepEqual(await expired, {
    requestId,
    approved: false,
    message: "Время ожидания истекло",
  });
  assert.deepEqual(await hostCleared, { claims: [] });
  assert.equal(lobby.room.pendingSeatClaims.size, 0);
});

test("original-owner rejoin expires overdue claims before owner-return cancellation", async (t) => {
  const lobby = await createFourHumanSocketLobby(t);
  const targetCredential = lobby.credentials[1];
  await disconnectLobbyHuman(lobby, 1);
  const claimant = await lobby.server.connectClient();
  const { requestId } = await submitSeatClaim(
    claimant,
    lobby.room.code,
    targetCredential.playerId,
    "Replacement",
  );
  const claim = lobby.room.pendingSeatClaims.get(requestId);
  assert.ok(claim);
  claim.expiresAt = Date.now() - 1;

  const expired = waitForSocketEvent(
    claimant,
    "room:seatClaimResolved",
    (resolution) => resolution.requestId === requestId,
  );
  const hostCleared = waitForSocketEvent(
    lobby.host,
    "admin:seatClaimsUpdated",
    ({ claims }) => claims.length === 0,
  );
  const owner = await lobby.server.connectClient();
  const joined = waitForSocketEvent(owner, "room:joined");
  owner.emit("room:rejoin", targetCredential);

  assert.deepEqual(await expired, {
    requestId,
    approved: false,
    message: "Время ожидания истекло",
  });
  assert.deepEqual(await hostCleared, { claims: [] });
  assert.deepEqual(await joined, targetCredential);
  assert.equal(lobby.room.pendingSeatClaims.size, 0);
});

test("ending a game expires overdue claims before room-end cancellation", async (t) => {
  const game = await createFourHumanSocketGame(t);
  game.humans[1].disconnect();
  await game.host.waitFor(
    "game:state",
    (state) =>
      state.players.find((player) => player.id === game.credentials[1].playerId)?.connected ===
      false,
  );
  const claimant = await game.server.connectClient();
  const { requestId } = await submitSeatClaim(
    claimant,
    game.room.code,
    game.credentials[1].playerId,
    "Replacement",
  );
  const claim = game.room.pendingSeatClaims.get(requestId);
  assert.ok(claim);
  claim.expiresAt = Date.now() - 1;

  const expired = waitForSocketEvent(
    claimant,
    "room:seatClaimResolved",
    (resolution) => resolution.requestId === requestId,
  );
  const ended = waitForSocketEvent(game.host, "game:state", (state) => state.phase === "GAME_OVER");
  game.host.emit("game:endGame");

  assert.deepEqual(await expired, {
    requestId,
    approved: false,
    message: "Время ожидания истекло",
  });
  assert.equal((await ended).phase, "GAME_OVER");
  assert.equal(game.room.pendingSeatClaims.size, 0);
});

test("the autonomous expiry scheduler can use a focused short lifetime", async (t) => {
  const lobby = await createFourHumanSocketLobby(t);
  await disconnectLobbyHuman(lobby, 1);
  const claimant = await lobby.server.connectClient();
  const claimantSocketId = claimant.socket.id;
  assert.ok(claimantSocketId);

  const result = reconnectManager.createSeatClaim(
    lobby.room,
    claimantSocketId,
    lobby.credentials[1].playerId,
    "Short claimant",
    lobby.server.io,
    { ttlMs: 25 },
  );
  assert.equal(result.success, true);
  if (!result.success) return;
  const hostUpdate = lobby.host.waitFor(
    "admin:seatClaimsUpdated",
    ({ claims }) => claims.length === 1,
  );
  const expired = claimant.waitFor(
    "room:seatClaimResolved",
    (resolution) => resolution.requestId === result.claim.id,
  );
  assert.equal(result.claim.expiresAt - result.claim.createdAt, 25);
  assert.equal((await hostUpdate).claims[0]?.requestId, result.claim.id);
  assert.deepEqual(await expired, {
    requestId: result.claim.id,
    approved: false,
    message: "Время ожидания истекло",
  });
  assert.equal(lobby.room.pendingSeatClaims.size, 0);
  assert.equal(isSocketInRoom(lobby.server, claimant, lobby.room.code), false);
});

test("claim approval reuses the exact player history, rotates only its token, and rejects the old owner", async (t) => {
  const game = await createFourHumanSocketGame(t);
  const targetIndex = 1;
  const targetCredential = game.credentials[targetIndex];
  const originalPlayer = game.room.players.get(targetCredential.playerId);
  assert.ok(originalPlayer);
  originalPlayer.revealedIndices = [0, 2];
  originalPlayer.hasVoted = true;
  originalPlayer.votedFor = game.credentials[3].playerId;
  originalPlayer.immuneThisRound = true;
  originalPlayer.actionCardRevealed = true;
  assert.ok(game.room.gameState);
  game.room.gameState.votes.set(originalPlayer.id, game.credentials[3].playerId);

  const originalCharacter = originalPlayer.character;
  const originalHistory = {
    alive: originalPlayer.alive,
    revealedIndices: [...originalPlayer.revealedIndices],
    hasVoted: originalPlayer.hasVoted,
    votedFor: originalPlayer.votedFor,
    immuneThisRound: originalPlayer.immuneThisRound,
    actionCardRevealed: originalPlayer.actionCardRevealed,
    recordedVote: game.room.gameState.votes.get(originalPlayer.id),
  };
  const originalCapacity = game.room.gameState.bunkerCapacity;
  const originalSchedule = [...game.room.gameState.votingSchedule];
  const originalTurnOrder = [...game.room.gameState.turnOrder];
  const otherCredential = game.room.players.get(game.credentials[2].playerId);
  const otherToken = otherCredential?.sessionToken;
  const originalHostId = game.room.hostId;

  await emitLeaveAndWaitForServer(game.server, game.humans[targetIndex]);
  await game.host.waitFor(
    "game:state",
    (state) =>
      state.players.find((player) => player.id === targetCredential.playerId)?.connected === false,
  );
  assert.equal(isSocketInRoom(game.server, game.humans[targetIndex], game.room.code), false);

  const claimant = await game.server.connectClient();
  const { requestId } = await submitSeatClaim(
    claimant,
    game.room.code,
    targetCredential.playerId,
    " <Replacement> ",
  );
  const storedClaim = game.room.pendingSeatClaims.get(requestId);
  assert.ok(storedClaim);
  storedClaim.claimantName = " <Replacement> ";

  const approved = waitForSocketEvent(
    claimant,
    "room:seatClaimResolved",
    (resolution) => resolution.requestId === requestId && resolution.approved,
  );
  const joined = waitForSocketEvent(claimant, "room:joined");
  const character = waitForSocketEvent(claimant, "game:character");
  const hostClaimsCleared = waitForSocketEvent(
    game.host,
    "admin:seatClaimsUpdated",
    ({ claims }) => claims.length === 0,
  );
  const reboundState = waitForSocketEvent(
    game.host,
    "game:state",
    (state) =>
      state.players.find((player) => player.id === targetCredential.playerId)?.connected === true,
  );
  game.host.emit("admin:resolveSeatClaim", { requestId, approved: true });

  assert.deepEqual(await approved, {
    requestId,
    approved: true,
    message: "Заявка одобрена",
  });
  const replacementCredential = await joined;
  assert.equal(replacementCredential.roomCode, game.room.code);
  assert.equal(replacementCredential.playerId, targetCredential.playerId);
  assert.match(replacementCredential.sessionToken, /^[a-f0-9]{64}$/);
  assert.notEqual(replacementCredential.sessionToken, targetCredential.sessionToken);
  assert.deepEqual(await character, originalCharacter);
  assert.deepEqual(await hostClaimsCleared, { claims: [] });
  const state = await reboundState;

  const reboundPlayer = game.room.players.get(targetCredential.playerId);
  assert.equal(reboundPlayer, originalPlayer);
  assert.equal(reboundPlayer?.socketId, claimant.socket.id);
  assert.equal(reboundPlayer?.sessionToken, replacementCredential.sessionToken);
  assert.equal(reboundPlayer?.name, "Replacement");
  assert.deepEqual(reboundPlayer?.character, originalCharacter);
  assert.deepEqual(
    {
      alive: reboundPlayer?.alive,
      revealedIndices: reboundPlayer?.revealedIndices,
      hasVoted: reboundPlayer?.hasVoted,
      votedFor: reboundPlayer?.votedFor,
      immuneThisRound: reboundPlayer?.immuneThisRound,
      actionCardRevealed: reboundPlayer?.actionCardRevealed,
      recordedVote: game.room.gameState.votes.get(originalPlayer.id),
    },
    originalHistory,
  );
  assert.equal(otherCredential?.sessionToken, otherToken);
  assert.equal(game.room.hostId, originalHostId);
  assert.equal(game.room.players.size, 4);
  assert.equal(game.room.startedPlayerCount, 4);
  assert.equal(game.room.gameState.bunkerCapacity, originalCapacity);
  assert.deepEqual(game.room.gameState.votingSchedule, originalSchedule);
  assert.deepEqual(game.room.gameState.turnOrder, originalTurnOrder);
  assert.equal(state.startedPlayerCount, 4);
  assert.equal(state.pauseKind, "none");
  assert.deepEqual(state.disconnectedPlayerIds, []);
  assert.equal(isSocketInRoom(game.server, claimant, game.room.code), true);

  const oldOwnerOutcome = waitForRejoinOutcome(game.humans[targetIndex]);
  game.humans[targetIndex].emit("room:rejoin", targetCredential);
  assert.deepEqual(await oldOwnerOutcome, {
    event: "reconnectError",
    payload: {
      message: "Не удалось переподключиться",
      code: "INVALID_SESSION",
      terminal: true,
    },
  });
  game.humans[targetIndex].disconnect();
  await delay(20);
  assert.equal(originalPlayer.connected, true);
  assert.equal(originalPlayer.socketId, claimant.socket.id);
});

test("one winning claim cancels competitors and the winner's other claims while preserving mixed pause reasons", async (t) => {
  const game = await createFourHumanSocketGame(t);
  game.host.emit("admin:pause");
  await game.host.waitFor("game:state", (state) => state.pauseKind === "admin");

  await emitLeaveAndWaitForServer(game.server, game.humans[1]);
  await game.host.waitFor(
    "game:state",
    (state) =>
      state.players.find((player) => player.id === game.credentials[1].playerId)?.connected ===
      false,
  );
  await emitLeaveAndWaitForServer(game.server, game.humans[2]);
  await game.host.waitFor(
    "game:state",
    (state) =>
      state.players.find((player) => player.id === game.credentials[2].playerId)?.connected ===
      false,
  );

  const claimantA = await game.server.connectClient();
  const claimantB = await game.server.connectClient();
  const first = await submitSeatClaim(
    claimantA,
    game.room.code,
    game.credentials[1].playerId,
    "Winner",
  );
  const sameSocketOtherSeat = await submitSeatClaim(
    claimantA,
    game.room.code,
    game.credentials[2].playerId,
    "Winner",
  );
  const competitor = await submitSeatClaim(
    claimantB,
    game.room.code,
    game.credentials[1].playerId,
    "Competitor",
  );
  assert.equal(
    new Set([first.requestId, sameSocketOtherSeat.requestId, competitor.requestId]).size,
    3,
  );

  const winnerResolution = waitForSocketEvent(
    claimantA,
    "room:seatClaimResolved",
    (resolution) => resolution.requestId === first.requestId,
  );
  const winnerOtherResolution = waitForSocketEvent(
    claimantA,
    "room:seatClaimResolved",
    (resolution) => resolution.requestId === sameSocketOtherSeat.requestId,
  );
  const competitorResolution = waitForSocketEvent(
    claimantB,
    "room:seatClaimResolved",
    (resolution) => resolution.requestId === competitor.requestId,
  );
  const joined = waitForSocketEvent(claimantA, "room:joined");
  const hostCleared = waitForSocketEvent(
    game.host,
    "admin:seatClaimsUpdated",
    ({ claims }) => claims.length === 0,
  );
  const statePromise = waitForSocketEvent(
    game.host,
    "game:state",
    (state) =>
      state.players.find((player) => player.id === game.credentials[1].playerId)?.connected ===
        true &&
      state.players.find((player) => player.id === game.credentials[2].playerId)?.connected ===
        false,
  );
  game.host.emit("admin:resolveSeatClaim", { requestId: first.requestId, approved: true });

  assert.deepEqual(await winnerResolution, {
    requestId: first.requestId,
    approved: true,
    message: "Заявка одобрена",
  });
  assert.deepEqual(await winnerOtherResolution, {
    requestId: sameSocketOtherSeat.requestId,
    approved: false,
    message: "Вы уже восстановили другое место",
  });
  assert.deepEqual(await competitorResolution, {
    requestId: competitor.requestId,
    approved: false,
    message: "Место уже занято другим игроком",
  });
  assert.equal((await joined).playerId, game.credentials[1].playerId);
  assert.deepEqual(await hostCleared, { claims: [] });
  const state = await statePromise;
  assert.equal(state.pauseKind, "mixed");
  assert.deepEqual(state.disconnectedPlayerIds, [game.credentials[2].playerId]);
  assert.equal(game.room.gameState?.pauseReasons.admin, true);
  assert.equal(game.room.players.size, 4);
  assert.equal(game.room.startedPlayerCount, 4);
  assert.equal(isSocketInRoom(game.server, claimantA, game.room.code), true);
  assert.equal(isSocketInRoom(game.server, claimantB, game.room.code), false);
  assert.equal(game.room.pendingSeatClaims.size, 0);

  const staleError = waitForRoomError(game.host, "Заявка уже обработана или не найдена");
  game.host.emit("admin:resolveSeatClaim", { requestId: competitor.requestId, approved: true });
  assert.deepEqual(await staleError, { message: "Заявка уже обработана или не найдена" });
});

test("the original credential owner wins first, rejects all claimants, and refreshes the current host", async (t) => {
  const game = await createFourHumanSocketGame(t);
  const targetCredential = game.credentials[1];
  game.humans[1].disconnect();
  await game.host.waitFor(
    "game:state",
    (state) =>
      state.players.find((player) => player.id === targetCredential.playerId)?.connected === false,
  );

  const claimantA = await game.server.connectClient();
  const claimantB = await game.server.connectClient();
  const claimA = await submitSeatClaim(
    claimantA,
    game.room.code,
    targetCredential.playerId,
    "Claimant A",
  );
  const claimB = await submitSeatClaim(
    claimantB,
    game.room.code,
    targetCredential.playerId,
    "Claimant B",
  );
  const claimantALeaks: unknown[] = [];
  const claimantBLeaks: unknown[] = [];
  claimantA.socket.on("game:state", (state) => claimantALeaks.push(state));
  claimantA.socket.on("game:character", (character) => claimantALeaks.push(character));
  claimantB.socket.on("game:state", (state) => claimantBLeaks.push(state));
  claimantB.socket.on("game:character", (character) => claimantBLeaks.push(character));

  const rejectedA = waitForSocketEvent(
    claimantA,
    "room:seatClaimResolved",
    (resolution) => resolution.requestId === claimA.requestId,
  );
  const rejectedB = waitForSocketEvent(
    claimantB,
    "room:seatClaimResolved",
    (resolution) => resolution.requestId === claimB.requestId,
  );
  const hostCleared = waitForSocketEvent(
    game.host,
    "admin:seatClaimsUpdated",
    ({ claims }) => claims.length === 0,
  );
  const owner = await game.server.connectClient();
  const ownerJoined = waitForSocketEvent(owner, "room:joined");
  const ownerCharacter = waitForSocketEvent(owner, "game:character");
  owner.emit("room:rejoin", targetCredential);

  assert.deepEqual(await rejectedA, {
    requestId: claimA.requestId,
    approved: false,
    message: "Владелец места вернулся",
  });
  assert.deepEqual(await rejectedB, {
    requestId: claimB.requestId,
    approved: false,
    message: "Владелец места вернулся",
  });
  assert.deepEqual(await hostCleared, { claims: [] });
  assert.deepEqual(await ownerJoined, targetCredential);
  assert.deepEqual(await ownerCharacter, game.characters[1]);
  assert.equal(
    game.room.players.get(targetCredential.playerId)?.sessionToken,
    targetCredential.sessionToken,
  );
  assert.equal(game.room.pendingSeatClaims.size, 0);
  assert.equal(isSocketInRoom(game.server, claimantA, game.room.code), false);
  assert.equal(isSocketInRoom(game.server, claimantB, game.room.code), false);
  await delay(20);
  assert.deepEqual(claimantALeaks, []);
  assert.deepEqual(claimantBLeaks, []);

  const staleError = waitForRoomError(game.host, "Заявка уже обработана или не найдена");
  game.host.emit("admin:resolveSeatClaim", { requestId: claimA.requestId, approved: true });
  assert.deepEqual(await staleError, { message: "Заявка уже обработана или не найдена" });
});

test("claimant disconnect removes every claim and refreshes the host before stale approval", async (t) => {
  const lobby = await createFourHumanSocketLobby(t);
  await disconnectLobbyHuman(lobby, 1);
  await disconnectLobbyHuman(lobby, 2);
  const claimant = await lobby.server.connectClient();
  const claimA = await submitSeatClaim(
    claimant,
    lobby.room.code,
    lobby.credentials[1].playerId,
    "Replacement",
  );
  const claimB = await submitSeatClaim(
    claimant,
    lobby.room.code,
    lobby.credentials[2].playerId,
    "Replacement",
  );
  assert.equal(lobby.room.pendingSeatClaims.size, 2);

  const hostCleared = waitForSocketEvent(
    lobby.host,
    "admin:seatClaimsUpdated",
    ({ claims }) => claims.length === 0,
  );
  const claimantSocketId = claimant.socket.id;
  assert.ok(claimantSocketId);
  const claimantServerSocket = lobby.server.io.sockets.sockets.get(claimantSocketId);
  assert.ok(claimantServerSocket);
  const disconnected = new Promise<void>((resolve) => {
    claimantServerSocket.once("disconnect", () => resolve());
  });
  claimant.disconnect();
  await disconnected;

  assert.deepEqual(await hostCleared, { claims: [] });
  assert.equal(lobby.room.pendingSeatClaims.size, 0);
  assert.equal(
    reconnectManager.expireSeatClaims(lobby.room, lobby.server.io, Number.MAX_SAFE_INTEGER),
    0,
  );

  const staleError = waitForRoomError(lobby.host, "Заявка уже обработана или не найдена");
  lobby.host.emit("admin:resolveSeatClaim", { requestId: claimA.requestId, approved: true });
  assert.deepEqual(await staleError, { message: "Заявка уже обработана или не найдена" });
  assert.equal(lobby.room.pendingSeatClaims.has(claimB.requestId), false);
  assert.equal(lobby.room.players.get(lobby.credentials[1].playerId)?.connected, false);
});

test("a claimant acquiring another membership cancels claims instead of being rebound", async (t) => {
  const lobby = await createFourHumanSocketLobby(t);
  await disconnectLobbyHuman(lobby, 1);
  const target = lobby.room.players.get(lobby.credentials[1].playerId);
  assert.ok(target);
  const oldToken = target.sessionToken;
  const claimant = await lobby.server.connectClient();
  const { requestId } = await submitSeatClaim(claimant, lobby.room.code, target.id, "Replacement");

  const cancelled = waitForSocketEvent(
    claimant,
    "room:seatClaimResolved",
    (resolution) => resolution.requestId === requestId,
  );
  const oldHostCleared = waitForSocketEvent(
    lobby.host,
    "admin:seatClaimsUpdated",
    ({ claims }) => claims.length === 0,
  );
  const created = waitForSocketEvent(claimant, "room:created");
  claimant.emit("room:create", { playerName: "Different room" });

  assert.deepEqual(await cancelled, {
    requestId,
    approved: false,
    message: "Заявитель присоединился к другой комнате",
  });
  assert.deepEqual(await oldHostCleared, { claims: [] });
  const otherRoom = await created;
  assert.notEqual(otherRoom.roomCode, lobby.room.code);
  assert.equal(isSocketInRoom(lobby.server, claimant, otherRoom.roomCode), true);
  assert.equal(isSocketInRoom(lobby.server, claimant, lobby.room.code), false);
  assert.equal(target.connected, false);
  assert.equal(target.sessionToken, oldToken);

  const staleError = waitForRoomError(lobby.host, "Заявка уже обработана или не найдена");
  lobby.host.emit("admin:resolveSeatClaim", { requestId, approved: true });
  assert.deepEqual(await staleError, { message: "Заявка уже обработана или не найдена" });
});

test("host transfer delivers real pending claims only to the successor and revokes former resolution", async (t) => {
  const lobby = await createFourHumanSocketLobby(t);
  await disconnectLobbyHuman(lobby, 3);
  const claimantA = await lobby.server.connectClient();
  const claimA = await submitSeatClaim(
    claimantA,
    lobby.room.code,
    lobby.credentials[3].playerId,
    "Claimant A",
  );
  await lobby.host.waitFor("admin:seatClaimsUpdated", ({ claims }) =>
    claims.some((claim) => claim.requestId === claimA.requestId),
  );

  const successor = lobby.humans[1];
  const successorClaims = waitForSocketEvent(successor, "admin:seatClaimsUpdated", ({ claims }) =>
    claims.some((claim) => claim.requestId === claimA.requestId),
  );
  lobby.host.emit("admin:transferHost", { targetPlayerId: lobby.credentials[1].playerId });
  assert.deepEqual(await successorClaims, {
    claims: [
      {
        requestId: claimA.requestId,
        playerId: lobby.credentials[3].playerId,
        playerName: "Human 3",
        claimantName: "Claimant A",
      },
    ],
  });
  assert.equal(lobby.room.hostId, lobby.credentials[1].playerId);

  const formerHostUpdates: unknown[] = [];
  lobby.host.socket.on("admin:seatClaimsUpdated", (claims) => formerHostUpdates.push(claims));
  const claimantB = await lobby.server.connectClient();
  const successorUpdate = waitForSocketEvent(
    successor,
    "admin:seatClaimsUpdated",
    ({ claims }) => claims.length === 2,
  );
  const claimB = await submitSeatClaim(
    claimantB,
    lobby.room.code,
    lobby.credentials[3].playerId,
    "Claimant B",
  );
  assert.equal(
    (await successorUpdate).claims.some((claim) => claim.requestId === claimB.requestId),
    true,
  );
  await delay(20);
  assert.deepEqual(formerHostUpdates, []);

  const denied = waitForRoomError(lobby.host, "Только хост может выполнить это действие");
  lobby.host.emit("admin:resolveSeatClaim", { requestId: claimA.requestId, approved: false });
  assert.deepEqual(await denied, { message: "Только хост может выполнить это действие" });
  assert.equal(lobby.room.pendingSeatClaims.size, 2);

  const rejectedA = waitForSocketEvent(
    claimantA,
    "room:seatClaimResolved",
    (resolution) => resolution.requestId === claimA.requestId,
  );
  successor.emit("admin:resolveSeatClaim", { requestId: claimA.requestId, approved: false });
  assert.equal((await rejectedA).approved, false);
  const rejectedB = waitForSocketEvent(
    claimantB,
    "room:seatClaimResolved",
    (resolution) => resolution.requestId === claimB.requestId,
  );
  successor.emit("admin:resolveSeatClaim", { requestId: claimB.requestId, approved: false });
  assert.equal((await rejectedB).approved, false);
});

test("reconnectable seat listing has an explicit deterministic rate limit", async (t) => {
  const lobby = await createFourHumanSocketLobby(t);
  await disconnectLobbyHuman(lobby, 1);
  const requester = await lobby.server.connectClient();

  for (let attempt = 0; attempt < 5; attempt++) {
    const response = waitForSocketEvent(requester, "room:reconnectableSeats");
    requester.emit("room:listReconnectableSeats", { roomCode: lobby.room.code });
    assert.equal((await response).seats.length, 1);
  }

  const limited = waitForRoomError(requester, "Слишком много запросов, подождите");
  requester.emit("room:listReconnectableSeats", { roomCode: lobby.room.code });
  assert.deepEqual(await limited, { message: "Слишком много запросов, подождите" });
  assert.equal(lobby.room.pendingSeatClaims.size, 0);
});

test("seat claim submission has an explicit deterministic rate limit", async (t) => {
  const lobby = await createFourHumanSocketLobby(t);
  await disconnectLobbyHuman(lobby, 1);
  const claimant = await lobby.server.connectClient();

  for (let attempt = 0; attempt < 3; attempt++) {
    const submitted = await submitSeatClaim(
      claimant,
      lobby.room.code,
      lobby.credentials[1].playerId,
      `Claimant ${attempt}`,
    );
    assert.match(submitted.requestId, /^[a-f0-9]{32}$/);
  }
  assert.equal(lobby.room.pendingSeatClaims.size, 3);

  const limited = waitForRoomError(claimant, "Слишком много запросов, подождите");
  claimant.emit("room:requestSeatClaim", {
    roomCode: lobby.room.code,
    playerId: lobby.credentials[1].playerId,
    claimantName: "Too many",
  });
  assert.deepEqual(await limited, { message: "Слишком много запросов, подождите" });
  assert.equal(lobby.room.pendingSeatClaims.size, 3);
});

test("seat claim submission rate limiting survives fresh socket churn from one IP", async (t) => {
  const lobby = await createFourHumanSocketLobby(t);
  await disconnectLobbyHuman(lobby, 1);

  for (let attempt = 0; attempt < 12; attempt++) {
    const claimant = await lobby.server.connectClient();
    const submitted = await submitSeatClaim(
      claimant,
      lobby.room.code,
      lobby.credentials[1].playerId,
      `Fresh ${attempt}`,
    );
    assert.match(submitted.requestId, /^[a-f0-9]{32}$/);
  }
  assert.equal(lobby.room.pendingSeatClaims.size, 12);

  const bypass = await lobby.server.connectClient();
  const limited = waitForRoomError(bypass, "Слишком много запросов, подождите");
  bypass.emit("room:requestSeatClaim", {
    roomCode: lobby.room.code,
    playerId: lobby.credentials[1].playerId,
    claimantName: "Bypass",
  });
  assert.deepEqual(await limited, { message: "Слишком много запросов, подождите" });
  assert.equal(lobby.room.pendingSeatClaims.size, 12);
});

test("a room-level pending claim cap bounds timers and host claim payloads", async (t) => {
  const lobby = await createFourHumanSocketLobby(t);
  await disconnectLobbyHuman(lobby, 1);
  const seedClaimant = await lobby.server.connectClient();
  const seedSocketId = seedClaimant.socket.id;
  assert.ok(seedSocketId);

  for (let attempt = 0; attempt < 32; attempt++) {
    const seeded = reconnectManager.createSeatClaim(
      lobby.room,
      seedSocketId,
      lobby.credentials[1].playerId,
      `Seed ${attempt}`,
      lobby.server.io,
    );
    assert.equal(seeded.success, true);
  }
  assert.equal(lobby.room.pendingSeatClaims.size, 32);

  const claimant = await lobby.server.connectClient();
  const capped = waitForRoomError(
    claimant,
    "Слишком много заявок на восстановление, попробуйте позже",
  );
  claimant.emit("room:requestSeatClaim", {
    roomCode: lobby.room.code,
    playerId: lobby.credentials[1].playerId,
    claimantName: "Overflow",
  });
  assert.deepEqual(await capped, {
    message: "Слишком много заявок на восстановление, попробуйте позже",
  });
  assert.equal(lobby.room.pendingSeatClaims.size, 32);
});

test("seat claim resolution has an explicit deterministic rate limit", async (t) => {
  const lobby = await createFourHumanSocketLobby(t);
  const staleId = "0".repeat(32);

  for (let attempt = 0; attempt < 5; attempt++) {
    const stale = waitForRoomError(lobby.host, "Заявка уже обработана или не найдена");
    lobby.host.emit("admin:resolveSeatClaim", { requestId: staleId, approved: false });
    assert.deepEqual(await stale, { message: "Заявка уже обработана или не найдена" });
  }

  const limited = waitForRoomError(lobby.host, "Слишком много запросов, подождите");
  lobby.host.emit("admin:resolveSeatClaim", { requestId: staleId, approved: false });
  assert.deepEqual(await limited, { message: "Слишком много запросов, подождите" });
  assert.equal(lobby.room.pendingSeatClaims.size, 0);
});

test("unauthenticated fresh sockets cannot spend the host's shared-IP resolution budget", async (t) => {
  const lobby = await createFourHumanSocketLobby(t);
  await disconnectLobbyHuman(lobby, 1);
  const claimant = await lobby.server.connectClient();
  const { requestId } = await submitSeatClaim(
    claimant,
    lobby.room.code,
    lobby.credentials[1].playerId,
    "Replacement",
  );

  for (let attempt = 0; attempt < 12; attempt++) {
    const attacker = await lobby.server.connectClient();
    const synchronized = waitForSocketEvent(attacker, "room:reconnectableSeats");
    attacker.emit("admin:resolveSeatClaim", { requestId, approved: true });
    attacker.emit("room:listReconnectableSeats", { roomCode: lobby.room.code });
    await synchronized;
    attacker.disconnect();
  }

  const outcome = new Promise<"approved" | "limited">((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for the authenticated host resolution"));
    }, 2_000);
    const onResolved = (resolution: ServerEventPayload<"room:seatClaimResolved">) => {
      if (resolution.requestId !== requestId) return;
      cleanup();
      resolve(resolution.approved ? "approved" : "limited");
    };
    const onError = ({ message }: ServerEventPayload<"room:error">) => {
      if (message !== "Слишком много запросов, подождите") return;
      cleanup();
      resolve("limited");
    };
    const cleanup = () => {
      clearTimeout(timeout);
      claimant.socket.off("room:seatClaimResolved", onResolved);
      lobby.host.socket.off("room:error", onError);
    };
    claimant.socket.on("room:seatClaimResolved", onResolved);
    lobby.host.socket.on("room:error", onError);
  });

  lobby.host.emit("admin:resolveSeatClaim", { requestId, approved: true });
  assert.equal(await outcome, "approved");
  assert.equal(lobby.room.pendingSeatClaims.size, 0);
});

test("natural final-round completion cancels pending claims before entering GAME_OVER", async (t) => {
  const game = await createFourHumanSocketGame(t);
  const target = await disconnectStartedHumanWithoutPause(game, 1);
  const claimant = await game.server.connectClient();
  const { requestId } = await submitSeatClaim(claimant, game.room.code, target.id, "Replacement");

  const state = game.room.gameState;
  assert.ok(state);
  if (state.phaseTimer) clearTimeout(state.phaseTimer);
  state.phaseTimer = null;
  state.phaseEndTime = null;
  state.pausedCallback = null;
  state.phase = "ROUND_DISCUSSION";
  state.roundNumber = CONFIG.TOTAL_ROUNDS;
  state.currentVotingInRound = 0;
  state.votingSchedule[CONFIG.TOTAL_ROUNDS - 1] = 1;
  state.votes.clear();
  for (const player of game.room.players.values()) {
    player.hasVoted = false;
    player.votedFor = null;
  }

  const votePhase = waitForSocketEvent(
    game.host,
    "game:state",
    (publicState) => publicState.phase === "ROUND_VOTE",
  );
  game.host.emit("admin:skipDiscussion");
  await votePhase;

  const naturalRoundEnd = takeScheduledPhaseCallback(game.room);

  const resolutions: ServerEventPayload<"room:seatClaimResolved">[] = [];
  claimant.socket.on("room:seatClaimResolved", (resolution) => resolutions.push(resolution));
  const cancelled = waitForSocketEvent(
    claimant,
    "room:seatClaimResolved",
    (resolution) => resolution.requestId === requestId,
  );
  const hostCleared = waitForSocketEvent(
    game.host,
    "admin:seatClaimsUpdated",
    ({ claims }) => claims.length === 0,
  );
  const gameOver = waitForSocketEvent(
    game.host,
    "game:state",
    (publicState) => publicState.phase === "GAME_OVER",
  );
  naturalRoundEnd();

  const [resolution, claimsUpdate, finalState] = await Promise.all([
    cancelled,
    hostCleared,
    gameOver,
  ]);
  assert.deepEqual(resolution, {
    requestId,
    approved: false,
    message: "Игра завершена",
  });
  assert.deepEqual(claimsUpdate, { claims: [] });
  assert.equal(finalState.phase, "GAME_OVER");
  assert.equal(game.room.pendingSeatClaims.size, 0);
  assert.equal(isSocketInRoom(game.server, claimant, game.room.code), false);

  const endedError = waitForRoomError(game.host, "Игра завершена");
  game.host.emit("admin:resolveSeatClaim", { requestId, approved: true });
  assert.deepEqual(await endedError, { message: "Игра завершена" });
  assert.equal(
    reconnectManager.expireSeatClaims(
      game.room,
      game.server.io,
      Date.now() + reconnectManager.SEAT_CLAIM_TTL_MS,
    ),
    0,
  );
  await delay(20);
  assert.equal(resolutions.filter((event) => event.requestId === requestId).length, 1);
});

test("defensive GAME_OVER resolution cancels a retained claim instead of approving it", async (t) => {
  const game = await createFourHumanSocketGame(t);
  const target = await disconnectStartedHumanWithoutPause(game, 1);
  const claimant = await game.server.connectClient();
  const { requestId } = await submitSeatClaim(claimant, game.room.code, target.id, "Replacement");

  const state = game.room.gameState;
  assert.ok(state);
  if (state.phaseTimer) clearTimeout(state.phaseTimer);
  state.phaseTimer = null;
  state.phaseEndTime = null;
  state.pausedCallback = null;
  state.phase = "GAME_OVER";

  const hostErrors: string[] = [];
  const hostClaimUpdates: ServerEventPayload<"admin:seatClaimsUpdated">[] = [];
  game.host.socket.on("room:error", ({ message }) => hostErrors.push(message));
  game.host.socket.on("admin:seatClaimsUpdated", (update) => hostClaimUpdates.push(update));
  const resolved = waitForSocketEvent(
    claimant,
    "room:seatClaimResolved",
    (resolution) => resolution.requestId === requestId,
  );
  game.host.emit("admin:resolveSeatClaim", { requestId, approved: true });

  assert.deepEqual(await resolved, {
    requestId,
    approved: false,
    message: "Игра завершена",
  });
  await delay(20);
  assert.equal(hostErrors.includes("Игра завершена"), true);
  assert.equal(
    hostClaimUpdates.some(({ claims }) => claims.length === 0),
    true,
  );
  assert.equal(game.room.pendingSeatClaims.size, 0);
  assert.equal(target.connected, false);
  assert.equal(isSocketInRoom(game.server, claimant, game.room.code), false);
});

test("ending the game cancels pending claims and makes ended seats unclaimable", async (t) => {
  const game = await createFourHumanSocketGame(t);
  game.humans[1].disconnect();
  await game.host.waitFor(
    "game:state",
    (state) =>
      state.players.find((player) => player.id === game.credentials[1].playerId)?.connected ===
      false,
  );
  const claimant = await game.server.connectClient();
  const { requestId } = await submitSeatClaim(
    claimant,
    game.room.code,
    game.credentials[1].playerId,
    "Replacement",
  );

  const cancelled = waitForSocketEvent(
    claimant,
    "room:seatClaimResolved",
    (resolution) => resolution.requestId === requestId,
  );
  const cleared = waitForSocketEvent(
    game.host,
    "admin:seatClaimsUpdated",
    ({ claims }) => claims.length === 0,
  );
  const ended = waitForSocketEvent(game.host, "game:state", (state) => state.phase === "GAME_OVER");
  game.host.emit("game:endGame");
  assert.deepEqual(await cancelled, {
    requestId,
    approved: false,
    message: "Игра завершена",
  });
  assert.deepEqual(await cleared, { claims: [] });
  assert.equal((await ended).phase, "GAME_OVER");
  assert.equal(game.room.pendingSeatClaims.size, 0);

  const lateClaimant = await game.server.connectClient();
  const endedError = waitForRoomError(lateClaimant, "Игра завершена");
  lateClaimant.emit("room:requestSeatClaim", {
    roomCode: game.room.code,
    playerId: game.credentials[1].playerId,
    claimantName: "Late",
  });
  assert.deepEqual(await endedError, { message: "Игра завершена" });
});

test("test reset clears pending claims and cancels their expiry timers hermetically", async (t) => {
  const lobby = await createFourHumanSocketLobby(t);
  await disconnectLobbyHuman(lobby, 1);
  const claimant = await lobby.server.connectClient();
  const claimantSocketId = claimant.socket.id;
  assert.ok(claimantSocketId);
  const resolutions: unknown[] = [];
  claimant.socket.on("room:seatClaimResolved", (resolution) => resolutions.push(resolution));

  const result = reconnectManager.createSeatClaim(
    lobby.room,
    claimantSocketId,
    lobby.credentials[1].playerId,
    "Reset claimant",
    lobby.server.io,
    { ttlMs: 40 },
  );
  assert.equal(result.success, true);
  assert.equal(lobby.room.pendingSeatClaims.size, 1);

  resetSocketHandlerStateForTests();
  assert.equal(lobby.room.pendingSeatClaims.size, 0);
  await delay(70);
  assert.deepEqual(resolutions, []);
  assert.equal(getAllRooms().size, 0);
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
  const firstOutcomePromise = waitForRejoinOutcome(firstClient);
  firstClient.emit("room:rejoin", invalidSession);
  assert.deepEqual(await firstOutcomePromise, {
    event: "reconnectError",
    payload: {
      message: "Комната не найдена",
      code: "ROOM_NOT_FOUND",
      terminal: true,
    },
  });

  await firstServer.close();

  secondServer = await createSocketTestServer();
  const secondClient = await secondServer.connectClient();
  const secondOutcomePromise = waitForRejoinOutcome(secondClient);
  secondClient.emit("room:rejoin", invalidSession);

  assert.deepEqual(await secondOutcomePromise, {
    event: "reconnectError",
    payload: {
      message: "Комната не найдена",
      code: "ROOM_NOT_FOUND",
      terminal: true,
    },
  });
});

test("invalid stored session returns a typed terminal reconnect error", async (t) => {
  const server = await createSocketTestServer();
  t.after(() => server.close());

  const host = await server.connectClient();
  host.emit("room:create", { playerName: "Host" });
  const credential = await host.waitFor("room:created");
  await host.waitFor("game:state");

  const attacker = await server.connectClient();
  const outcomePromise = waitForRejoinOutcome(attacker);
  attacker.emit("room:rejoin", {
    ...credential,
    sessionToken: credential.sessionToken === "a".repeat(64) ? "b".repeat(64) : "a".repeat(64),
  });

  assert.deepEqual(await outcomePromise, {
    event: "reconnectError",
    payload: {
      message: "Не удалось переподключиться",
      code: "INVALID_SESSION",
      terminal: true,
    },
  });
});

test("closed seat returns a typed terminal reconnect error", async (t) => {
  const server = await createSocketTestServer();
  t.after(() => server.close());

  const host = await server.connectClient();
  host.emit("room:create", { playerName: "Host" });
  const credential = await host.waitFor("room:created");
  await host.waitFor("game:state");
  const room = getRoom(credential.roomCode);
  const player = room?.players.get(credential.playerId);
  assert.ok(player);
  player.kicked = true;
  player.connected = false;
  player.sessionToken =
    credential.sessionToken === "c".repeat(64) ? "d".repeat(64) : "c".repeat(64);

  const reconnectingClient = await server.connectClient();
  const outcomePromise = waitForRejoinOutcome(reconnectingClient);
  reconnectingClient.emit("room:rejoin", credential);

  assert.deepEqual(await outcomePromise, {
    event: "reconnectError",
    payload: {
      message: "Место закрыто",
      code: "SEAT_CLOSED",
      terminal: true,
    },
  });
  assert.equal(player.connected, false);
  assert.equal(player.socketId, host.socket.id);
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

test("a bound socket cannot overwrite its active seat with a spectator membership", async (t) => {
  const game = await createFourHumanSocketGame(t);
  const boundIndex = 1;
  const credential = game.credentials[boundIndex];
  const boundClient = game.humans[boundIndex];
  const outcomePromise = waitForMembershipOutcome(boundClient);

  boundClient.emit("room:joinSpectator", {
    roomCode: game.room.code,
    spectatorName: "Duplicate membership",
  });

  assert.deepEqual(await outcomePromise, {
    event: "roomError",
    message: "Сокет уже привязан к комнате",
  });
  assert.equal(game.room.spectators.size, 0);

  boundClient.disconnect();
  const disconnectedState = await game.host.waitFor(
    "game:state",
    (state) =>
      state.players.find((player) => player.id === credential.playerId)?.connected === false,
  );
  assert.equal(disconnectedState.pauseKind, "reconnect");
  assert.deepEqual(disconnectedState.disconnectedPlayerIds, [credential.playerId]);
});

test("terminal missing-room rejoin prunes stale membership so the socket can join again", async (t) => {
  const server = await createSocketTestServer();
  t.after(() => server.close());

  const staleClient = await server.connectClient();
  staleClient.emit("room:create", { playerName: "Stale player" });
  const staleCredential = await staleClient.waitFor("room:created");
  await staleClient.waitFor("game:state");

  const destinationHost = await server.connectClient();
  destinationHost.emit("room:create", { playerName: "Destination host" });
  const destination = await destinationHost.waitFor("room:created");
  await destinationHost.waitFor("game:state");

  const staleSocketId = staleClient.socket.id;
  assert.ok(staleSocketId);
  assert.equal(getAllRooms().delete(staleCredential.roomCode), true);

  const terminalOutcomePromise = waitForRejoinOutcome(staleClient);
  staleClient.emit("room:rejoin", staleCredential);
  assert.deepEqual(await terminalOutcomePromise, {
    event: "reconnectError",
    payload: {
      message: "Комната не найдена",
      code: "ROOM_NOT_FOUND",
      terminal: true,
    },
  });
  assert.equal(
    server.io.sockets.adapter.rooms.get(staleCredential.roomCode)?.has(staleSocketId) ?? false,
    false,
  );

  const joinedOutcomePromise = waitForRejoinOutcome(staleClient);
  staleClient.emit("room:join", {
    roomCode: destination.roomCode,
    playerName: "Recovered player",
  });
  const joinedOutcome = await joinedOutcomePromise;
  assert.equal(joinedOutcome.event, "joined");
  if (joinedOutcome.event !== "joined") return;
  assert.equal(joinedOutcome.payload.roomCode, destination.roomCode);
  assert.equal(getRoom(destination.roomCode)?.players.size, 2);
});

test("stale deleted-room membership cannot block direct rejoin to another valid seat", async (t) => {
  const server = await createSocketTestServer();
  t.after(() => server.close());

  const staleClient = await server.connectClient();
  staleClient.emit("room:create", { playerName: "Stale player" });
  const staleCredential = await staleClient.waitFor("room:created");
  await staleClient.waitFor("game:state");

  const destinationHost = await server.connectClient();
  destinationHost.emit("room:create", { playerName: "Destination host" });
  const destination = await destinationHost.waitFor("room:created");
  await destinationHost.waitFor("game:state");

  const seatOwner = await server.connectClient();
  seatOwner.emit("room:join", {
    roomCode: destination.roomCode,
    playerName: "Reserved seat",
  });
  const seatCredential = await seatOwner.waitFor("room:joined");
  await destinationHost.waitFor("game:state", (state) => state.players.length === 2);
  seatOwner.disconnect();
  await destinationHost.waitFor(
    "game:state",
    (state) =>
      state.players.find((player) => player.id === seatCredential.playerId)?.connected === false,
  );

  const staleSocketId = staleClient.socket.id;
  assert.ok(staleSocketId);
  assert.equal(getAllRooms().delete(staleCredential.roomCode), true);

  const outcomePromise = waitForRejoinOutcome(staleClient);
  staleClient.emit("room:rejoin", seatCredential);
  const outcome = await outcomePromise;
  assert.equal(outcome.event, "joined");
  if (outcome.event !== "joined") return;
  assert.deepEqual(outcome.payload, seatCredential);

  const destinationRoom = getRoom(destination.roomCode);
  assert.equal(destinationRoom?.players.get(seatCredential.playerId)?.socketId, staleSocketId);
  assert.equal(
    server.io.sockets.adapter.rooms.get(staleCredential.roomCode)?.has(staleSocketId) ?? false,
    false,
  );
});

test("connected spectator ownership is first-winner", async (t) => {
  const server = await createSocketTestServer();
  t.after(() => server.close());

  const host = await server.connectClient();
  host.emit("room:create", { playerName: "Host" });
  const created = await host.waitFor("room:created");
  await host.waitFor("game:state");

  const owner = await server.connectClient();
  owner.emit("room:joinSpectator", {
    roomCode: created.roomCode,
    spectatorName: "Owner",
  });
  const credential = await owner.waitFor("room:spectatorJoined");
  await host.waitFor("game:state", (state) => state.spectatorCount === 1);

  const contender = await server.connectClient();
  const outcomePromise = waitForMembershipOutcome(contender);
  contender.emit("room:rejoinSpectator", credential);

  assert.deepEqual(await outcomePromise, {
    event: "roomError",
    message: "Место уже подключено",
  });
  const spectator = getRoom(created.roomCode)?.spectators.get(credential.spectatorId);
  assert.ok(spectator);
  assert.equal(spectator.connected, true);
  assert.equal(spectator.socketId, owner.socket.id);
  assert.equal(spectator.sessionToken, credential.sessionToken);
});

test("spectator rebind releases the stale socket and stale explicit leave is ignored", async (t) => {
  const server = await createSocketTestServer();
  t.after(() => server.close());

  const host = await server.connectClient();
  host.emit("room:create", { playerName: "Host" });
  const created = await host.waitFor("room:created");
  await host.waitFor("game:state");

  const oldOwner = await server.connectClient();
  oldOwner.emit("room:joinSpectator", {
    roomCode: created.roomCode,
    spectatorName: "Spectator",
  });
  const credential = await oldOwner.waitFor("room:spectatorJoined");
  await host.waitFor("game:state", (state) => state.spectatorCount === 1);

  const room = getRoom(created.roomCode);
  const spectator = room?.spectators.get(credential.spectatorId);
  assert.ok(room);
  assert.ok(spectator);
  spectator.connected = false;

  const newOwner = await server.connectClient();
  const reboundPromise = newOwner.waitFor("room:spectatorJoined");
  newOwner.emit("room:rejoinSpectator", credential);
  await reboundPromise;

  const oldSocketId = oldOwner.socket.id;
  const newSocketId = newOwner.socket.id;
  assert.ok(oldSocketId);
  assert.ok(newSocketId);
  const oldServerSocket = server.io.sockets.sockets.get(oldSocketId);
  assert.ok(oldServerSocket);
  const leaveHandled = new Promise<void>((resolve) => {
    oldServerSocket.once("room:leave", () => resolve());
  });
  oldOwner.emit("room:leave");
  await leaveHandled;

  assert.equal(room.spectators.get(credential.spectatorId), spectator);
  assert.equal(spectator.connected, true);
  assert.equal(spectator.socketId, newSocketId);
  const roomMembers = server.io.sockets.adapter.rooms.get(room.code);
  assert.equal(roomMembers?.has(oldSocketId), false);
  assert.equal(roomMembers?.has(newSocketId), true);
});

const ACTIVE_DISCONNECT_PHASES: GamePhase[] = [
  "CATASTROPHE_REVEAL",
  "BUNKER_EXPLORE",
  "ROUND_REVEAL",
  "ROUND_DISCUSSION",
  "ROUND_VOTE",
  "ROUND_VOTE_TIEBREAK",
  "ROUND_RESULT",
];

for (const phase of ACTIVE_DISCONNECT_PHASES) {
  test(`host disconnect transfers authority once during ${phase}`, async (t) => {
    const game = await createFourHumanSocketGame(t);
    const originalHost = game.credentials[0];
    const successor = game.credentials[1];
    assert.ok(game.room.gameState);
    if (phase !== "CATASTROPHE_REVEAL") moveToPhase(game.room, phase);

    const sequence: string[] = [];
    const visibleStates: PublicGameState[] = [];
    game.humans[1].socket.on("game:state", (state) => {
      if (
        state.players.find((player) => player.id === originalHost.playerId)?.connected === false
      ) {
        visibleStates.push(state);
        sequence.push("state");
      }
    });
    game.humans[1].socket.on("room:hostChanged", () => sequence.push("hostChanged"));

    game.host.disconnect();

    const state = await game.humans[1].waitFor(
      "game:state",
      (candidate) =>
        candidate.players.find((player) => player.id === originalHost.playerId)?.connected ===
        false,
    );
    assert.equal(game.room.hostId, successor.playerId);
    assert.equal(
      state.players.find((player) => player.id === originalHost.playerId)?.isHost,
      false,
    );
    assert.equal(state.players.find((player) => player.id === successor.playerId)?.isHost, true);
    assert.deepEqual(await game.humans[1].waitFor("room:hostChanged"), {
      hostId: successor.playerId,
      hostName: "Human 1",
      reason: "disconnect",
    });
    await delay(20);

    assert.equal(visibleStates.length, 1);
    assert.deepEqual(sequence, ["state", "hostChanged"]);
    assert.equal(state.phase, phase);
    assert.equal(state.pauseKind, "reconnect");
    assert.deepEqual(state.disconnectedPlayerIds, [originalHost.playerId]);
  });
}

test("lobby host disconnect transfers authority with the disconnect reason", async (t) => {
  const lobby = await createFourHumanSocketLobby(t);
  const originalHost = lobby.credentials[0];
  const successor = lobby.credentials[1];
  lobby.room.pendingSeatClaims.set("automatic-claim", {
    id: "automatic-claim",
    socketId: "automatic-claimant",
    playerId: lobby.credentials[3].playerId,
    claimantName: "Automatic replacement",
    createdAt: Date.now(),
    expiresAt: Date.now() + 120_000,
  });

  lobby.host.disconnect();

  const state = await lobby.humans[1].waitFor(
    "game:state",
    (candidate) =>
      candidate.players.find((player) => player.id === originalHost.playerId)?.connected === false,
  );
  assert.equal(lobby.room.hostId, successor.playerId);
  assert.equal(state.phase, "LOBBY");
  assert.equal(state.players.find((player) => player.id === successor.playerId)?.isHost, true);
  assert.deepEqual(await lobby.humans[1].waitFor("room:hostChanged"), {
    hostId: successor.playerId,
    hostName: "Human 1",
    reason: "disconnect",
  });
  assert.deepEqual(await lobby.humans[1].waitFor("admin:seatClaimsUpdated"), {
    claims: [
      {
        requestId: "automatic-claim",
        playerId: lobby.credentials[3].playerId,
        playerName: "Human 3",
        claimantName: "Automatic replacement",
      },
    ],
  });
});

test("host failover skips bots, disconnected humans, and kicked humans cyclically", async (t) => {
  const lobby = await createFourHumanSocketLobby(t);
  lobby.host.emit("room:addBot");
  await lobby.host.waitFor("game:state", (state) => state.players.length === 5);
  const bot = Array.from(lobby.room.players.values()).find((player) => player.isBot);
  assert.ok(bot);

  lobby.room.allPlayerIds = [
    lobby.credentials[0].playerId,
    bot.id,
    lobby.credentials[1].playerId,
    lobby.credentials[2].playerId,
    lobby.credentials[3].playerId,
  ];
  lobby.humans[1].disconnect();
  await lobby.host.waitFor(
    "game:state",
    (state) =>
      state.players.find((player) => player.id === lobby.credentials[1].playerId)?.connected ===
      false,
  );
  const kicked = lobby.room.players.get(lobby.credentials[2].playerId);
  assert.ok(kicked);
  kicked.kicked = true;
  kicked.connected = false;
  lobby.humans[2].disconnect();

  lobby.host.disconnect();
  await lobby.humans[3].waitFor(
    "game:state",
    (state) =>
      state.players.find((player) => player.id === lobby.credentials[0].playerId)?.connected ===
      false,
  );

  assert.equal(lobby.room.hostId, lobby.credentials[3].playerId);
  assert.deepEqual(await lobby.humans[3].waitFor("room:hostChanged"), {
    hostId: lobby.credentials[3].playerId,
    hostName: "Human 3",
    reason: "disconnect",
  });
});

test("an eliminated connected human remains eligible for host failover", async (t) => {
  const game = await createFourHumanSocketGame(t);
  const successor = game.room.players.get(game.credentials[1].playerId);
  assert.ok(successor);
  successor.alive = false;

  game.host.disconnect();
  const state = await game.humans[1].waitFor(
    "game:state",
    (candidate) =>
      candidate.players.find((player) => player.id === game.credentials[0].playerId)?.connected ===
      false,
  );

  assert.equal(game.room.hostId, successor.id);
  assert.equal(state.players.find((player) => player.id === successor.id)?.alive, false);
  assert.equal(state.players.find((player) => player.id === successor.id)?.isHost, true);
});

test("automatic host transfer clears admin pause while retaining reconnect pause", async (t) => {
  const game = await createFourHumanSocketGame(t);
  game.host.emit("admin:pause");
  await game.humans[1].waitFor("game:state", (state) => state.pauseKind === "admin");
  assert.ok(game.room.gameState);
  const frozenRemaining = game.room.gameState.pausedTimeRemaining;
  const visibleStates: PublicGameState[] = [];
  game.humans[1].socket.on("game:state", (state) => {
    if (
      state.players.find((player) => player.id === game.credentials[0].playerId)?.connected ===
      false
    ) {
      visibleStates.push(state);
    }
  });

  game.host.disconnect();
  const transferredState = await game.humans[1].waitFor(
    "game:state",
    (state) =>
      state.players.find((player) => player.id === game.credentials[0].playerId)?.connected ===
      false,
  );

  assert.equal(game.room.hostId, game.credentials[1].playerId);
  assert.equal(game.room.gameState.pauseReasons.admin, false);
  assert.equal(game.room.gameState.pausedTimeRemaining, frozenRemaining);
  assert.equal(transferredState.pauseKind, "reconnect");
  assert.deepEqual(transferredState.disconnectedPlayerIds, [game.credentials[0].playerId]);
  await game.humans[1].waitFor("room:hostChanged");
  await delay(20);
  assert.equal(visibleStates.length, 1);
});

test("no eligible host keeps the seat and pause until a different human recovers authority", async (t) => {
  const game = await createFourHumanSocketGame(t);
  const observer = await joinSpectator(game.server, game.room.code);
  const originalHost = game.credentials[0];
  const recoveringIndex = 2;
  const hostChanges: Array<{ hostId: string; reason: string }> = [];
  observer.socket.on("room:hostChanged", ({ hostId, reason }) => {
    hostChanges.push({ hostId, reason });
  });

  game.host.emit("admin:pause");
  await observer.waitFor("game:state", (state) => state.pauseKind === "admin");
  for (const index of [1, 2, 3]) {
    game.humans[index].disconnect();
    await observer.waitFor(
      "game:state",
      (state) =>
        state.players.find((player) => player.id === game.credentials[index].playerId)
          ?.connected === false,
    );
  }

  game.host.disconnect();
  const abandonedState = await observer.waitFor(
    "game:state",
    (state) =>
      state.players.find((player) => player.id === originalHost.playerId)?.connected === false,
  );
  assert.equal(game.room.hostId, originalHost.playerId);
  assert.equal(game.room.gameState?.pauseReasons.admin, true);
  assert.equal(abandonedState.pauseKind, "mixed");
  assert.equal(hostChanges.length, 0);

  const recoveringClient = await game.server.connectClient();
  const joinedPromise = recoveringClient.waitFor("room:joined");
  recoveringClient.emit("room:rejoin", game.credentials[recoveringIndex]);
  await joinedPromise;
  const recoveredState = await observer.waitFor(
    "game:state",
    (state) =>
      state.players.find((player) => player.id === game.credentials[recoveringIndex].playerId)
        ?.connected === true,
  );

  assert.equal(game.room.hostId, game.credentials[recoveringIndex].playerId);
  assert.equal(game.room.gameState?.pauseReasons.admin, false);
  assert.equal(recoveredState.pauseKind, "reconnect");
  assert.deepEqual(await observer.waitFor("room:hostChanged"), {
    hostId: game.credentials[recoveringIndex].playerId,
    hostName: "Human 2",
    reason: "recovery",
  });
});

test("the original host returning first keeps the anchored seat without a recovery event", async (t) => {
  const game = await createFourHumanSocketGame(t);
  const observer = await joinSpectator(game.server, game.room.code);
  const hostChanges: string[] = [];
  observer.socket.on("room:hostChanged", ({ reason }) => hostChanges.push(reason));

  for (const index of [1, 2, 3]) {
    game.humans[index].disconnect();
    await observer.waitFor(
      "game:state",
      (state) =>
        state.players.find((player) => player.id === game.credentials[index].playerId)
          ?.connected === false,
    );
  }
  game.host.disconnect();
  await observer.waitFor(
    "game:state",
    (state) =>
      state.players.find((player) => player.id === game.credentials[0].playerId)?.connected ===
      false,
  );

  const returningHost = await game.server.connectClient();
  const joinedPromise = returningHost.waitFor("room:joined");
  returningHost.emit("room:rejoin", game.credentials[0]);
  await joinedPromise;
  const state = await observer.waitFor(
    "game:state",
    (candidate) =>
      candidate.players.find((player) => player.id === game.credentials[0].playerId)?.connected ===
      true,
  );
  await delay(20);

  assert.equal(game.room.hostId, game.credentials[0].playerId);
  assert.equal(
    state.players.find((player) => player.id === game.credentials[0].playerId)?.isHost,
    true,
  );
  assert.deepEqual(hostChanges, []);
});

test("a former host reconnects without reclaiming authority and cannot use host actions", async (t) => {
  const game = await createFourHumanSocketGame(t);
  const originalHost = game.credentials[0];
  const successor = game.credentials[1];

  game.host.disconnect();
  await game.humans[1].waitFor(
    "game:state",
    (state) =>
      state.players.find((player) => player.id === originalHost.playerId)?.connected === false,
  );
  assert.equal(game.room.hostId, successor.playerId);
  await game.humans[1].waitFor("room:hostChanged");

  const formerHost = await game.server.connectClient();
  const joinedPromise = formerHost.waitFor("room:joined");
  formerHost.emit("room:rejoin", originalHost);
  await joinedPromise;
  const restoredState = await game.humans[1].waitFor(
    "game:state",
    (state) =>
      state.players.find((player) => player.id === originalHost.playerId)?.connected === true &&
      state.players.find((player) => player.id === successor.playerId)?.isHost === true,
  );
  assert.equal(game.room.hostId, successor.playerId);
  assert.equal(
    restoredState.players.find((player) => player.id === originalHost.playerId)?.isHost,
    false,
  );

  formerHost.emit("admin:pause");
  assert.equal(
    (await formerHost.waitFor("room:error")).message,
    "Только хост может выполнить это действие",
  );
  assert.equal(game.room.gameState?.pauseReasons.admin, false);
});

test("manual host transfer broadcasts once, sends pending claims, and revokes former authority", async (t) => {
  const lobby = await createFourHumanSocketLobby(t);
  const originalHost = lobby.credentials[0];
  const successor = lobby.credentials[1];
  lobby.room.pendingSeatClaims.set("claim-one", {
    id: "claim-one",
    socketId: "claimant-one",
    playerId: lobby.credentials[3].playerId,
    claimantName: "Replacement",
    createdAt: Date.now(),
    expiresAt: Date.now() + 120_000,
  });
  const sequence: string[] = [];
  const visibleStates: PublicGameState[] = [];
  lobby.humans[1].socket.on("game:state", (state) => {
    if (state.players.find((player) => player.id === successor.playerId)?.isHost) {
      visibleStates.push(state);
      sequence.push("state");
    }
  });
  lobby.humans[1].socket.on("room:hostChanged", () => sequence.push("hostChanged"));
  lobby.humans[1].socket.on("admin:seatClaimsUpdated", () => sequence.push("claims"));

  await emitTransferAndWaitForServer(lobby.server, lobby.host, successor.playerId);

  assert.equal(lobby.room.hostId, successor.playerId);
  const state = await lobby.humans[1].waitFor(
    "game:state",
    (candidate) =>
      candidate.players.find((player) => player.id === successor.playerId)?.isHost === true,
  );
  assert.equal(state.players.find((player) => player.id === originalHost.playerId)?.isHost, false);
  assert.deepEqual(await lobby.humans[1].waitFor("room:hostChanged"), {
    hostId: successor.playerId,
    hostName: "Human 1",
    reason: "manual",
  });
  assert.deepEqual(await lobby.humans[1].waitFor("admin:seatClaimsUpdated"), {
    claims: [
      {
        requestId: "claim-one",
        playerId: lobby.credentials[3].playerId,
        playerName: "Human 3",
        claimantName: "Replacement",
      },
    ],
  });
  await delay(20);
  assert.equal(visibleStates.length, 1);
  assert.deepEqual(sequence, ["state", "hostChanged", "claims"]);

  lobby.host.emit("room:addBot");
  assert.equal(
    (await lobby.host.waitFor("room:error")).message,
    "Только хост может выполнить это действие",
  );
  await emitTransferAndWaitForServer(lobby.server, lobby.host, lobby.credentials[2].playerId);
  assert.equal(lobby.room.hostId, successor.playerId);
  assert.equal(
    (await lobby.host.waitFor("room:error")).message,
    "Только текущий хост может передать права",
  );
});

test("manual host transfer clears only admin pause during a reconnect pause", async (t) => {
  const game = await createFourHumanSocketGame(t);
  const missing = game.credentials[3];
  game.humans[3].disconnect();
  await game.host.waitFor(
    "game:state",
    (state) => state.players.find((player) => player.id === missing.playerId)?.connected === false,
  );
  game.host.emit("admin:pause");
  await game.humans[1].waitFor("game:state", (state) => state.pauseKind === "mixed");
  assert.ok(game.room.gameState);
  const frozenRemaining = game.room.gameState.pausedTimeRemaining;
  const visibleStates: PublicGameState[] = [];
  game.humans[1].socket.on("game:state", (state) => {
    if (state.players.find((player) => player.id === game.credentials[1].playerId)?.isHost) {
      visibleStates.push(state);
    }
  });

  await emitTransferAndWaitForServer(game.server, game.host, game.credentials[1].playerId);

  assert.equal(game.room.hostId, game.credentials[1].playerId);
  assert.equal(game.room.gameState.pauseReasons.admin, false);
  assert.equal(game.room.gameState.pausedTimeRemaining, frozenRemaining);
  const state = await game.humans[1].waitFor(
    "game:state",
    (candidate) =>
      candidate.players.find((player) => player.id === game.credentials[1].playerId)?.isHost ===
      true,
  );
  assert.equal(state.pauseKind, "reconnect");
  assert.deepEqual(state.disconnectedPlayerIds, [missing.playerId]);
  assert.deepEqual(await game.humans[1].waitFor("room:hostChanged"), {
    hostId: game.credentials[1].playerId,
    hostName: "Human 1",
    reason: "manual",
  });
  await delay(20);
  assert.equal(visibleStates.length, 1);
});

test("manual host transfer rejects self, missing, bot, disconnected, and kicked targets", async (t) => {
  const lobby = await createFourHumanSocketLobby(t);
  lobby.host.emit("room:addBot");
  await lobby.host.waitFor("game:state", (state) => state.players.length === 5);
  const bot = Array.from(lobby.room.players.values()).find((player) => player.isBot);
  assert.ok(bot);

  lobby.humans[2].disconnect();
  await lobby.host.waitFor(
    "game:state",
    (state) =>
      state.players.find((player) => player.id === lobby.credentials[2].playerId)?.connected ===
      false,
  );
  const kicked = lobby.room.players.get(lobby.credentials[3].playerId);
  assert.ok(kicked);
  kicked.kicked = true;
  kicked.connected = false;
  lobby.humans[3].disconnect();

  const errors: string[] = [];
  const hostChanges: string[] = [];
  lobby.host.socket.on("room:error", ({ message }) => errors.push(message));
  lobby.host.socket.on("room:hostChanged", ({ reason }) => hostChanges.push(reason));
  const invalidTargets = [
    lobby.credentials[0].playerId,
    "not-a-player-id",
    `p_${"f".repeat(24)}`,
    bot.id,
    lobby.credentials[2].playerId,
    lobby.credentials[3].playerId,
  ];

  for (const [index, targetPlayerId] of invalidTargets.entries()) {
    await emitTransferAndWaitForServer(lobby.server, lobby.host, targetPlayerId);
    assert.equal(errors.length, index + 1);
    assert.equal(lobby.room.hostId, lobby.credentials[0].playerId);
  }
  assert.deepEqual(hostChanges, []);
});

test("automatic failover remains cyclic after a manual transfer", async (t) => {
  const lobby = await createFourHumanSocketLobby(t);
  await emitTransferAndWaitForServer(lobby.server, lobby.host, lobby.credentials[2].playerId);
  assert.equal(lobby.room.hostId, lobby.credentials[2].playerId);
  await lobby.humans[2].waitFor("room:hostChanged");

  lobby.humans[2].disconnect();
  await lobby.humans[3].waitFor(
    "game:state",
    (state) =>
      state.players.find((player) => player.id === lobby.credentials[2].playerId)?.connected ===
      false,
  );

  assert.equal(lobby.room.hostId, lobby.credentials[3].playerId);
  assert.deepEqual(
    await lobby.humans[3].waitFor(
      "room:hostChanged",
      (event) => event.hostId === lobby.credentials[3].playerId && event.reason === "disconnect",
    ),
    {
      hostId: lobby.credentials[3].playerId,
      hostName: "Human 3",
      reason: "disconnect",
    },
  );
});

test("explicit active-game host leave retains the seat and transfers authority", async (t) => {
  const game = await createFourHumanSocketGame(t);
  await emitLeaveAndWaitForServer(game.server, game.host);
  const state = await game.humans[1].waitFor(
    "game:state",
    (candidate) =>
      candidate.players.find((player) => player.id === game.credentials[0].playerId)?.connected ===
      false,
  );

  assert.ok(game.room.players.has(game.credentials[0].playerId));
  assert.equal(game.room.hostId, game.credentials[1].playerId);
  assert.equal(state.pauseKind, "reconnect");
  assert.deepEqual(await game.humans[1].waitFor("room:hostChanged"), {
    hostId: game.credentials[1].playerId,
    hostName: "Human 1",
    reason: "disconnect",
  });
});

test("explicit lobby host leave removes the seat and transfers to a connected human", async (t) => {
  const lobby = await createFourHumanSocketLobby(t);
  const changes: Array<{ hostId: string; reason: string }> = [];
  lobby.humans[1].socket.on("room:hostChanged", ({ hostId, reason }) => {
    changes.push({ hostId, reason });
  });

  await emitLeaveAndWaitForServer(lobby.server, lobby.host);
  const state = await lobby.humans[1].waitFor(
    "game:state",
    (candidate) =>
      candidate.players.length === 3 &&
      !candidate.players.some((player) => player.id === lobby.credentials[0].playerId) &&
      candidate.players.find((player) => player.id === lobby.credentials[1].playerId)?.isHost ===
        true,
  );
  await delay(20);

  assert.equal(lobby.room.players.has(lobby.credentials[0].playerId), false);
  assert.equal(lobby.room.hostId, lobby.credentials[1].playerId);
  assert.equal(
    state.players.find((player) => player.id === lobby.credentials[1].playerId)?.isHost,
    true,
  );
  assert.deepEqual(changes, [{ hostId: lobby.credentials[1].playerId, reason: "disconnect" }]);
});

test("lobby host leave without an eligible successor recovers on the next human join", async (t) => {
  const server = await createSocketTestServer();
  t.after(() => server.close());
  const host = await server.connectClient();
  host.emit("room:create", { playerName: "Host" });
  const credential = await host.waitFor("room:created");
  await host.waitFor("game:state");
  host.emit("room:addBot");
  await host.waitFor("game:state", (state) => state.players.length === 2);
  const room = getRoom(credential.roomCode);
  assert.ok(room);

  await emitLeaveAndWaitForServer(server, host);
  assert.equal(room.players.has(credential.playerId), false);
  assert.equal(room.hostId, credential.playerId);
  assert.equal(
    Array.from(room.players.values()).every((player) => player.isBot),
    true,
  );

  const newcomer = await server.connectClient();
  newcomer.emit("room:join", { roomCode: room.code, playerName: "Recovery host" });
  const joined = await newcomer.waitFor("room:joined");
  const state = await newcomer.waitFor(
    "game:state",
    (candidate) =>
      candidate.players.find((player) => player.id === joined.playerId)?.isHost === true,
  );

  assert.equal(room.hostId, joined.playerId);
  assert.equal(state.players.find((player) => player.id === joined.playerId)?.isHost, true);
  assert.deepEqual(await newcomer.waitFor("room:hostChanged"), {
    hostId: joined.playerId,
    hostName: "Recovery host",
    reason: "recovery",
  });
});

test("GAME_OVER host disconnect transfers authority without pausing", async (t) => {
  const game = await createFourHumanSocketGame(t);
  game.host.emit("game:endGame");
  await game.humans[1].waitFor("game:state", (state) => state.phase === "GAME_OVER");

  game.host.disconnect();
  const state = await game.humans[1].waitFor(
    "game:state",
    (candidate) =>
      candidate.players.find((player) => player.id === game.credentials[0].playerId)?.connected ===
      false,
  );

  assert.equal(game.room.hostId, game.credentials[1].playerId);
  assert.equal(state.phase, "GAME_OVER");
  assert.equal(state.paused, false);
  assert.deepEqual(state.disconnectedPlayerIds, []);
  assert.deepEqual(await game.humans[1].waitFor("room:hostChanged"), {
    hostId: game.credentials[1].playerId,
    hostName: "Human 1",
    reason: "disconnect",
  });
});

for (const phase of ACTIVE_DISCONNECT_PHASES) {
  test(`network disconnect reserves the seat and pauses ${phase}`, async (t) => {
    useShortReconnectGrace(t);
    const game = await createFourHumanSocketGame(t);
    const disconnectedIndex = 1;
    const credential = game.credentials[disconnectedIndex];
    const originalCharacter = game.characters[disconnectedIndex];
    const disconnectedPlayer = game.room.players.get(credential.playerId);
    const hostPlayer = game.room.players.get(game.credentials[0].playerId);
    assert.ok(disconnectedPlayer);
    assert.ok(hostPlayer);
    assert.ok(game.room.gameState);

    if (phase !== "CATASTROPHE_REVEAL") moveToPhase(game.room, phase);
    game.room.gameState.turnOrder = game.credentials.map(({ playerId }) => playerId);
    game.room.gameState.currentTurnIndex = disconnectedIndex;
    disconnectedPlayer.revealedIndices = [0];
    hostPlayer.hasVoted = true;
    hostPlayer.votedFor = credential.playerId;
    game.room.gameState.votes.set(hostPlayer.id, credential.playerId);

    const originalReveals = [...disconnectedPlayer.revealedIndices];
    const originalVotes = Array.from(game.room.gameState.votes.entries());
    const originalCapacity = game.room.gameState.bunkerCapacity;
    const originalSchedule = [...game.room.gameState.votingSchedule];

    game.humans[disconnectedIndex].disconnect();

    const pausedState = await game.host.waitFor(
      "game:state",
      (state) =>
        state.players.find((candidate) => candidate.id === credential.playerId)?.connected ===
        false,
    );

    assert.equal(pausedState.phase, phase);
    assert.equal(pausedState.paused, true);
    assert.equal(pausedState.pauseKind, "reconnect");
    assert.deepEqual(pausedState.disconnectedPlayerIds, [credential.playerId]);
    assert.equal(pausedState.players.length, 4);
    assert.equal(pausedState.startedPlayerCount, 4);

    await delay(50);

    const retainedPlayer = game.room.players.get(credential.playerId);
    assert.equal(retainedPlayer, disconnectedPlayer);
    assert.deepEqual(retainedPlayer?.character, originalCharacter);
    assert.equal(retainedPlayer?.connected, false);
    assert.deepEqual(retainedPlayer?.revealedIndices, originalReveals);
    assert.equal(game.room.players.size, 4);
    assert.equal(game.room.startedPlayerCount, 4);
    assert.equal(game.room.gameState.phase, phase);
    assert.equal(game.room.gameState.currentTurnIndex, disconnectedIndex);
    assert.deepEqual(Array.from(game.room.gameState.votes.entries()), originalVotes);
    assert.equal(game.room.gameState.bunkerCapacity, originalCapacity);
    assert.deepEqual(game.room.gameState.votingSchedule, originalSchedule);
  });
}

test("transient lobby disconnect reserves the seat without a game pause and blocks start", async (t) => {
  useShortReconnectGrace(t);
  const lobby = await createFourHumanSocketLobby(t);
  const disconnectedIndex = 1;
  const credential = lobby.credentials[disconnectedIndex];

  for (const human of lobby.humans.slice(1)) {
    human.emit("player:ready", { ready: true });
  }
  await lobby.host.waitFor("game:state", (state) =>
    state.players.filter((player) => !player.isHost).every((player) => player.ready),
  );

  lobby.humans[disconnectedIndex].disconnect();
  const disconnectedState = await lobby.host.waitFor(
    "game:state",
    (state) =>
      state.players.find((player) => player.id === credential.playerId)?.connected === false,
  );

  assert.equal(disconnectedState.phase, "LOBBY");
  assert.equal(disconnectedState.paused, false);
  assert.equal(disconnectedState.pauseKind, "none");
  assert.deepEqual(disconnectedState.disconnectedPlayerIds, []);
  assert.equal(disconnectedState.players.length, 4);

  await delay(50);
  assert.ok(lobby.room.players.has(credential.playerId));
  assert.equal(lobby.room.players.size, 4);
  assert.equal(lobby.room.startedPlayerCount, null);

  lobby.host.emit("game:start");
  assert.equal((await lobby.host.waitFor("room:error")).message, "Не все игроки подключены");
  assert.equal(lobby.room.gameState, null);
});

test("GAME_OVER disconnect retains the fixed seat without pausing", async (t) => {
  useShortReconnectGrace(t);
  const game = await createFourHumanSocketGame(t);
  const credential = game.credentials[1];

  game.host.emit("game:endGame");
  await game.host.waitFor("game:state", (state) => state.phase === "GAME_OVER");
  game.humans[1].disconnect();

  const disconnectedState = await game.host.waitFor(
    "game:state",
    (state) =>
      state.phase === "GAME_OVER" &&
      state.players.find((player) => player.id === credential.playerId)?.connected === false,
  );
  assert.equal(disconnectedState.paused, false);
  assert.equal(disconnectedState.pauseKind, "none");
  assert.deepEqual(disconnectedState.disconnectedPlayerIds, []);

  await delay(50);
  assert.ok(game.room.players.has(credential.playerId));
  assert.equal(game.room.players.size, 4);
  assert.equal(game.room.startedPlayerCount, 4);
  assert.equal(game.room.gameState?.phase, "GAME_OVER");
});

test("explicit active-game leave reserves the seat, pauses, and keeps its credential", async (t) => {
  const game = await createFourHumanSocketGame(t);
  const leavingIndex = 1;
  const credential = game.credentials[leavingIndex];
  const character = game.characters[leavingIndex];

  game.humans[leavingIndex].emit("room:leave");
  const pausedState = await game.host.waitFor(
    "game:state",
    (state) =>
      !state.players.some((player) => player.id === credential.playerId) ||
      state.players.find((player) => player.id === credential.playerId)?.connected === false,
  );

  assert.equal(pausedState.players.length, 4);
  assert.equal(pausedState.paused, true);
  assert.equal(pausedState.pauseKind, "reconnect");
  assert.ok(game.room.players.has(credential.playerId));
  assert.equal(game.room.startedPlayerCount, 4);

  const outcomePromise = waitForRejoinOutcome(game.humans[leavingIndex]);
  const characterPromise = game.humans[leavingIndex].waitFor("game:character");
  game.humans[leavingIndex].emit("room:rejoin", credential);
  const outcome = await outcomePromise;

  assert.equal(outcome.event, "joined");
  if (outcome.event !== "joined") return;
  assert.deepEqual(outcome.payload, credential);
  assert.deepEqual(await characterPromise, character);
  assert.equal(game.room.players.get(credential.playerId)?.sessionToken, credential.sessionToken);
});

test("explicit lobby leave removes the seat and original-order entry", async (t) => {
  const lobby = await createFourHumanSocketLobby(t);
  const leavingCredential = lobby.credentials[1];

  lobby.humans[1].emit("room:leave");
  const state = await lobby.host.waitFor(
    "game:state",
    (candidate) => candidate.players.length === 3,
  );

  assert.equal(state.phase, "LOBBY");
  assert.equal(
    state.players.some((player) => player.id === leavingCredential.playerId),
    false,
  );
  assert.equal(lobby.room.players.has(leavingCredential.playerId), false);
  assert.equal(lobby.room.allPlayerIds.includes(leavingCredential.playerId), false);
  assert.equal(lobby.room.startedPlayerCount, null);
});

test("ordinary reconnect restores the exact seat with a stable token and clears pending claims", async (t) => {
  useShortReconnectGrace(t);
  const game = await createFourHumanSocketGame(t);
  const disconnectedIndex = 1;
  const credential = game.credentials[disconnectedIndex];
  const character = game.characters[disconnectedIndex];
  const originalPlayer = game.room.players.get(credential.playerId);
  const originalCapacity = game.room.gameState?.bunkerCapacity;
  const originalSchedule = [...(game.room.gameState?.votingSchedule ?? [])];
  assert.ok(originalPlayer);

  game.room.pendingSeatClaims.set("claim-one", {
    id: "claim-one",
    socketId: "claimant-one",
    playerId: credential.playerId,
    claimantName: "Claimant One",
    createdAt: Date.now(),
    expiresAt: Date.now() + 120_000,
  });
  game.room.pendingSeatClaims.set("claim-two", {
    id: "claim-two",
    socketId: "claimant-two",
    playerId: credential.playerId,
    claimantName: "Claimant Two",
    createdAt: Date.now(),
    expiresAt: Date.now() + 120_000,
  });

  game.humans[disconnectedIndex].disconnect();
  const disconnectedState = await game.host.waitFor(
    "game:state",
    (state) =>
      state.players.find((player) => player.id === credential.playerId)?.connected === false,
  );
  assert.equal(disconnectedState.pauseKind, "reconnect");

  const reconnectingClient = await game.server.connectClient();
  const outcomePromise = waitForRejoinOutcome(reconnectingClient);
  const characterPromise = reconnectingClient.waitFor("game:character");
  reconnectingClient.emit("room:rejoin", {
    ...credential,
    roomCode: ` ${credential.roomCode.toLowerCase()} `,
  });

  const outcome = await outcomePromise;
  assert.equal(outcome.event, "joined");
  if (outcome.event !== "joined") return;
  assert.deepEqual(outcome.payload, credential);
  assert.deepEqual(await characterPromise, character);

  const resumedState = await game.host.waitFor(
    "game:state",
    (state) =>
      state.players.find((player) => player.id === credential.playerId)?.connected === true,
  );
  const reboundPlayer = game.room.players.get(credential.playerId);
  assert.equal(reboundPlayer, originalPlayer);
  assert.equal(reboundPlayer?.socketId, reconnectingClient.socket.id);
  assert.equal(reboundPlayer?.sessionToken, credential.sessionToken);
  assert.deepEqual(reboundPlayer?.character, character);
  assert.equal(game.room.pendingSeatClaims.size, 0);
  assert.equal(game.room.players.size, 4);
  assert.equal(game.room.startedPlayerCount, 4);
  assert.equal(game.room.gameState?.bunkerCapacity, originalCapacity);
  assert.deepEqual(game.room.gameState?.votingSchedule, originalSchedule);
  assert.equal(resumedState.players.length, 4);
  assert.equal(resumedState.startedPlayerCount, 4);
  assert.equal(resumedState.paused, false);
  assert.equal(resumedState.pauseKind, "none");
  assert.deepEqual(resumedState.disconnectedPlayerIds, []);
});

test("duplicate rejoin from the current socket is idempotent and does not rotate the token", async (t) => {
  const game = await createFourHumanSocketGame(t);
  const client = game.humans[1];
  const credential = game.credentials[1];
  const character = game.characters[1];
  const originalPlayer = game.room.players.get(credential.playerId);

  for (let attempt = 0; attempt < 2; attempt++) {
    const outcomePromise = waitForRejoinOutcome(client);
    const characterPromise = client.waitFor("game:character");
    client.emit("room:rejoin", credential);
    const outcome = await outcomePromise;

    assert.equal(outcome.event, "joined");
    if (outcome.event !== "joined") return;
    assert.deepEqual(outcome.payload, credential);
    assert.deepEqual(await characterPromise, character);
  }

  assert.equal(game.room.players.get(credential.playerId), originalPlayer);
  assert.equal(originalPlayer?.socketId, client.socket.id);
  assert.equal(originalPlayer?.sessionToken, credential.sessionToken);
  assert.equal(game.room.players.size, 4);
  assert.equal(game.room.startedPlayerCount, 4);
});

test("competing reconnect sockets have one winner and a nonterminal ownership error", async (t) => {
  useShortReconnectGrace(t);
  const game = await createFourHumanSocketGame(t);
  const credential = game.credentials[1];
  game.humans[1].disconnect();
  const disconnectedState = await game.host.waitFor(
    "game:state",
    (state) =>
      state.players.find((player) => player.id === credential.playerId)?.connected === false,
  );
  assert.equal(disconnectedState.pauseKind, "reconnect");

  const competitors = [await game.server.connectClient(), await game.server.connectClient()];
  const outcomePromises = competitors.map((client) => waitForRejoinOutcome(client));
  for (const competitor of competitors) competitor.emit("room:rejoin", credential);
  const outcomes = await Promise.all(outcomePromises);

  const winnerIndex = outcomes.findIndex((outcome) => outcome.event === "joined");
  const loserIndex = outcomes.findIndex((outcome) => outcome.event === "reconnectError");
  assert.notEqual(winnerIndex, -1);
  assert.notEqual(loserIndex, -1);
  assert.notEqual(winnerIndex, loserIndex);
  const loserOutcome = outcomes[loserIndex];
  assert.equal(loserOutcome.event, "reconnectError");
  if (loserOutcome.event !== "reconnectError") return;
  assert.deepEqual(loserOutcome.payload, {
    message: "Место уже подключено",
    code: "SEAT_ALREADY_CONNECTED",
    terminal: false,
  });

  const winner = competitors[winnerIndex];
  const winnerSocketId = winner.socket.id;
  const loserSocketId = competitors[loserIndex].socket.id;
  assert.ok(winnerSocketId);
  assert.ok(loserSocketId);
  assert.equal(game.room.players.get(credential.playerId)?.socketId, winnerSocketId);
  assert.equal(game.room.players.get(credential.playerId)?.sessionToken, credential.sessionToken);
  assert.equal(game.room.players.size, 4);
  assert.equal(game.room.startedPlayerCount, 4);
  const roomMembers = game.server.io.sockets.adapter.rooms.get(game.room.code);
  assert.equal(roomMembers?.has(winnerSocketId), true);
  assert.equal(roomMembers?.has(loserSocketId), false);
});

test("late disconnect from a stale socket cannot disconnect its rebound seat", async (t) => {
  useShortReconnectGrace(t);
  const game = await createFourHumanSocketGame(t);
  const credential = game.credentials[1];
  const oldClient = game.humans[1];
  const player = game.room.players.get(credential.playerId);
  assert.ok(player);

  player.connected = false;
  addDisconnectPause(game.room, player.id, game.server.io);
  await game.host.waitFor("game:state", (state) =>
    state.disconnectedPlayerIds.includes(credential.playerId),
  );

  const reboundClient = await game.server.connectClient();
  const outcomePromise = waitForRejoinOutcome(reboundClient);
  reboundClient.emit("room:rejoin", credential);
  const outcome = await outcomePromise;
  assert.equal(outcome.event, "joined");
  await game.host.waitFor(
    "game:state",
    (state) =>
      state.players.find((candidate) => candidate.id === credential.playerId)?.connected === true,
  );

  const oldSocketId = oldClient.socket.id;
  assert.ok(oldSocketId);
  const oldServerSocket = game.server.io.sockets.sockets.get(oldSocketId);
  assert.ok(oldServerSocket);
  const oldDisconnectProcessed = new Promise<void>((resolve) => {
    oldServerSocket.once("disconnect", () => resolve());
  });
  oldClient.disconnect();
  await oldDisconnectProcessed;

  assert.equal(player.connected, true);
  assert.equal(player.socketId, reboundClient.socket.id);
  assert.equal(game.room.gameState?.pauseReasons.disconnectedPlayerIds.has(player.id), false);
  assert.equal(game.room.players.size, 4);
  assert.equal(game.room.startedPlayerCount, 4);
});

test("disconnect removes pending claims even for sockets that never joined a room", async (t) => {
  const lobby = await createFourHumanSocketLobby(t);
  const claimant = await lobby.server.connectClient();
  const claimantSocketId = claimant.socket.id;
  assert.ok(claimantSocketId);
  lobby.room.pendingSeatClaims.set("orphan-claim", {
    id: "orphan-claim",
    socketId: claimantSocketId,
    playerId: lobby.credentials[1].playerId,
    claimantName: "Claimant",
    createdAt: Date.now(),
    expiresAt: Date.now() + 120_000,
  });

  const claimantServerSocket = lobby.server.io.sockets.sockets.get(claimantSocketId);
  assert.ok(claimantServerSocket);
  const disconnectProcessed = new Promise<void>((resolve) => {
    claimantServerSocket.once("disconnect", () => resolve());
  });
  claimant.disconnect();
  await disconnectProcessed;

  assert.equal(lobby.room.pendingSeatClaims.has("orphan-claim"), false);
});

test("new player joins remain closed after the roster is fixed", async (t) => {
  const game = await createFourHumanSocketGame(t);
  const newcomer = await game.server.connectClient();

  newcomer.emit("room:join", { roomCode: game.room.code, playerName: "Late Player" });

  assert.equal((await newcomer.waitFor("room:error")).message, "Игра уже началась");
  assert.equal(game.room.players.size, 4);
  assert.equal(game.room.startedPlayerCount, 4);
});

test("spectator disconnect keeps its grace behavior and never pauses the game", async (t) => {
  useShortReconnectGrace(t);
  const game = await createFourHumanSocketGame(t);
  const spectator = await game.server.connectClient();
  spectator.emit("room:joinSpectator", {
    roomCode: game.room.code,
    spectatorName: "Spectator",
  });
  await spectator.waitFor("room:spectatorJoined");
  await game.host.waitFor("game:state", (state) => state.spectatorCount === 1);

  spectator.disconnect();
  const state = await game.host.waitFor(
    "game:state",
    (candidate) => candidate.spectatorCount === 0,
  );

  assert.equal(state.paused, false);
  assert.equal(state.pauseKind, "none");
  assert.deepEqual(state.disconnectedPlayerIds, []);
  assert.equal(game.room.players.size, 4);
  assert.equal(game.room.startedPlayerCount, 4);
});

test("test reset cancels spectator grace before it can broadcast or reschedule bots", async (t) => {
  useShortReconnectGrace(t, 30);
  useFastBotTimers(t);
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

  const characterPromise = host.waitFor("game:character");
  host.emit("game:start");
  await characterPromise;
  await host.waitFor("game:state", (state) => state.phase === "CATASTROPHE_REVEAL");

  const room = getRoom(created.roomCode);
  const bot = Array.from(room?.players.values() ?? []).find((player) => player.isBot);
  assert.ok(room);
  assert.ok(bot);

  const spectator = await server.connectClient();
  spectator.emit("room:joinSpectator", {
    roomCode: room.code,
    spectatorName: "Spectator",
  });
  await spectator.waitFor("room:spectatorJoined");
  await host.waitFor("game:state", (state) => state.spectatorCount === 1);

  moveToPhase(room, "ROUND_REVEAL");
  assert.ok(room.gameState);
  room.gameState.roundNumber = 1;
  room.gameState.turnOrder = [bot.id];
  room.gameState.currentTurnIndex = 0;

  let lateStateCount = 0;
  const countLateState = () => {
    lateStateCount++;
  };
  host.socket.on("game:state", countLateState);
  t.after(() => host.socket.off("game:state", countLateState));

  const spectatorSocketId = spectator.socket.id;
  assert.ok(spectatorSocketId);
  const spectatorServerSocket = server.io.sockets.sockets.get(spectatorSocketId);
  assert.ok(spectatorServerSocket);
  const disconnectHandled = new Promise<void>((resolve) => {
    spectatorServerSocket.once("disconnect", () => resolve());
  });
  spectator.disconnect();
  await disconnectHandled;

  resetSocketHandlerStateForTests();
  await delay(80);

  assert.equal(lateStateCount, 0);
  assert.deepEqual(bot.revealedIndices, []);
  assert.equal(room.gameState.currentTurnIndex, 0);
});

test("pause engine exports composable reason helpers", () => {
  assert.equal(typeof addDisconnectPause, "function");
  assert.equal(typeof removeDisconnectPause, "function");
  assert.equal(typeof setAdminPause, "function");
  assert.equal(typeof isGameplayPaused, "function");
  assert.equal(typeof resumeGameIfReady, "function");
  assert.equal(typeof clearBotActions, "function");
});

test("test state reset cancels pending bot actions before clearing rooms", async (t) => {
  useFastBotTimers(t);
  const { room, io, bots } = createStartedRoom(t, { humanCount: 1, botCount: 1 });
  const bot = bots[0];
  moveToPhase(room, "ROUND_REVEAL");
  assert.ok(room.gameState);
  room.gameState.roundNumber = 1;
  room.gameState.turnOrder = [bot.id];
  room.gameState.currentTurnIndex = 0;

  scheduleBotActions(room, io);
  resetSocketHandlerStateForTests();
  await delay(50);

  assert.deepEqual(bot.revealedIndices, []);
  assert.equal(room.gameState.currentTurnIndex, 0);
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
  const originalDisconnectedIds = Array.from(room.gameState.pauseReasons.disconnectedPlayerIds);

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
  await host.waitFor("game:state", (state) => state.paused && state.pauseKind === "reconnect");

  const originalGameState = room.gameState;
  const originalCharacter = hostPlayer.character;
  const originalRemainingMs = room.gameState.pausedTimeRemaining;
  const originalDisconnectedIds = Array.from(room.gameState.pauseReasons.disconnectedPlayerIds);

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
