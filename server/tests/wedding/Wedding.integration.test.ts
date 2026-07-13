import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Server } from "socket.io";
import { io as createClient, type Socket as ClientSocket } from "socket.io-client";
import type {
  WeddingClientEvents,
  WeddingServerEvents,
} from "../../../shared/types.js";
import { registerWeddingHandlers } from "../../src/wedding/socketHandlers.js";
import { FileWeddingRoomStore, WeddingRoomService } from "../../src/wedding/weddingRoom.js";

type ServerEvent = keyof WeddingServerEvents;
type ServerPayload<Event extends ServerEvent> = WeddingServerEvents[Event] extends (
  data: infer Payload,
) => void
  ? Payload
  : never;

interface TestClient {
  socket: ClientSocket<WeddingServerEvents, WeddingClientEvents>;
  emit<Event extends keyof WeddingClientEvents>(
    event: Event,
    ...args: Parameters<WeddingClientEvents[Event]>
  ): void;
  waitFor<Event extends ServerEvent>(
    event: Event,
    predicate?: (payload: ServerPayload<Event>) => boolean,
  ): Promise<ServerPayload<Event>>;
}

async function createHarness() {
  const directory = mkdtempSync(join(tmpdir(), "party-play-wedding-socket-"));
  const httpServer = createServer();
  const io = new Server(httpServer);
  const service = new WeddingRoomService(
    new FileWeddingRoomStore(join(directory, "room.json")),
  );
  registerWeddingHandlers(io.of("/wedding"), service);

  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const address = httpServer.address() as AddressInfo;
  const url = `http://127.0.0.1:${address.port}/wedding`;
  const clients: ClientSocket<WeddingServerEvents, WeddingClientEvents>[] = [];

  async function connect(): Promise<TestClient> {
    const socket: ClientSocket<WeddingServerEvents, WeddingClientEvents> = createClient(url, {
      forceNew: true,
      reconnection: false,
    });
    clients.push(socket);
    const queued = new Map<ServerEvent, unknown[]>();
    const waiters = new Map<ServerEvent, ((payload: unknown) => boolean)[]>();
    socket.onAny((event, payload: unknown) => {
      const key = event as ServerEvent;
      const pending = waiters.get(key) ?? [];
      const accepted = pending.findIndex((waiter) => waiter(payload));
      if (accepted >= 0) {
        pending.splice(accepted, 1);
        return;
      }
      const events = queued.get(key) ?? [];
      events.push(payload);
      queued.set(key, events);
    });
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("connect_error", reject);
    });

    return {
      socket,
      emit(event, ...args) {
        socket.emit(event, ...args);
      },
      waitFor(event, predicate = () => true) {
        const events = queued.get(event) ?? [];
        const index = events.findIndex((payload) =>
          predicate(payload as ServerPayload<typeof event>),
        );
        if (index >= 0) {
          const [payload] = events.splice(index, 1);
          return Promise.resolve(payload as ServerPayload<typeof event>);
        }
        return new Promise((resolve, reject) => {
          const timer = setTimeout(
            () => reject(new Error(`Timed out waiting for ${String(event)}`)),
            3_000,
          );
          const pending = waiters.get(event) ?? [];
          pending.push((payload) => {
            if (!predicate(payload as ServerPayload<typeof event>)) return false;
            clearTimeout(timer);
            resolve(payload as ServerPayload<typeof event>);
            return true;
          });
          waiters.set(event, pending);
        });
      },
    };
  }

  return {
    connect,
    async close() {
      for (const client of clients) client.disconnect();
      await new Promise<void>((resolve) => io.close(() => resolve()));
      if (httpServer.listening) {
        await new Promise<void>((resolve) => httpServer.close(() => resolve()));
      }
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

test("keeps host details private while broadcasting an accepted guest vote", async () => {
  const harness = await createHarness();
  try {
    const host = await harness.connect();
    host.emit("wedding:hostConnect");
    host.emit("wedding:createRoom");
    await host.waitFor("wedding:hostState");

    const guest = await harness.connect();
    guest.emit("wedding:joinNew", { name: "Вера" });
    const joined = await guest.waitFor("wedding:joined");

    host.emit("wedding:setDraft", { optionStyle: "letters", correctOption: 1 });
    host.emit("wedding:startQuestion");
    await guest.waitFor("wedding:guestState", (state) => state.phase === "OPEN");

    guest.emit("wedding:answer", { optionIndex: 1 });
    const guestState = await guest.waitFor(
      "wedding:guestState",
      (state) => state.hasAnswered,
    );
    assert.equal(JSON.stringify(guestState).includes("correctOption"), false);
    assert.equal(JSON.stringify(guestState).includes("correctAnswers"), false);

    const hostState = await host.waitFor(
      "wedding:hostState",
      (state) => state.answers.length === 1,
    );
    assert.equal(hostState.answers[0].participantId, joined.participantId);
    assert.equal(hostState.answers[0].firstCorrect, true);
    assert.equal(hostState.participants[0].correctAnswers, 1);
  } finally {
    await harness.close();
  }
});

test("rebinds an existing name to the newest socket and keeps the seat", async () => {
  const harness = await createHarness();
  try {
    const host = await harness.connect();
    host.emit("wedding:hostConnect");
    host.emit("wedding:createRoom");
    await host.waitFor("wedding:hostState");

    const oldGuest = await harness.connect();
    oldGuest.emit("wedding:joinNew", { name: "Вера" });
    const joined = await oldGuest.waitFor("wedding:joined");

    const newGuest = await harness.connect();
    newGuest.emit("wedding:rejoin", {
      participantId: joined.participantId,
      name: "Вера",
    });
    const rebound = await newGuest.waitFor("wedding:joined");
    assert.equal(rebound.participantId, joined.participantId);
    await new Promise<void>((resolve) => {
      if (!oldGuest.socket.connected) resolve();
      else oldGuest.socket.once("disconnect", () => resolve());
    });

    const hostState = await host.waitFor(
      "wedding:hostState",
      (state) => state.participants[0]?.connected === true,
    );
    assert.equal(hostState.participants.length, 1);
  } finally {
    await harness.close();
  }
});

test("rejects host mutations from guests and broadcasts manual score changes", async () => {
  const harness = await createHarness();
  try {
    const host = await harness.connect();
    host.emit("wedding:hostConnect");
    host.emit("wedding:createRoom");
    await host.waitFor("wedding:hostState");

    const guest = await harness.connect();
    guest.emit("wedding:joinNew", { name: "Вера" });
    const joined = await guest.waitFor("wedding:joined");
    guest.emit("wedding:startQuestion");
    assert.match((await guest.waitFor("wedding:error")).message, /ведущ/i);

    host.emit("wedding:adjustScore", { participantId: joined.participantId, delta: 1 });
    const scored = await host.waitFor(
      "wedding:hostState",
      (state) => state.participants[0]?.correctAnswers === 1,
    );
    assert.equal(scored.participants[0].correctAnswers, 1);

    host.emit("wedding:endContest");
    const finished = await guest.waitFor(
      "wedding:guestState",
      (state) => state.phase === "FINISHED",
    );
    assert.equal(finished.participantName, "Вера");
  } finally {
    await harness.close();
  }
});
