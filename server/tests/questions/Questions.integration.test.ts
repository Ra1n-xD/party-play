import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Server } from "socket.io";
import { io as createClient, type Socket as ClientSocket } from "socket.io-client";
import type { QuestionsClientEvents, QuestionsServerEvents } from "../../../shared/types.js";
import { registerQuestionsHandlers } from "../../src/questions/socketHandlers.js";
import {
  FileQuestionsSessionStore,
  QuestionsSessionService,
} from "../../src/questions/questionsSession.js";

type ServerEvent = keyof QuestionsServerEvents;
type ServerPayload<Event extends ServerEvent> = QuestionsServerEvents[Event] extends (
  data: infer Payload,
) => void
  ? Payload
  : never;

interface TestClient {
  socket: ClientSocket<QuestionsServerEvents, QuestionsClientEvents>;
  emit<Event extends keyof QuestionsClientEvents>(
    event: Event,
    ...args: Parameters<QuestionsClientEvents[Event]>
  ): void;
  waitFor<Event extends ServerEvent>(
    event: Event,
    predicate?: (payload: ServerPayload<Event>) => boolean,
  ): Promise<ServerPayload<Event>>;
}

async function createHarness() {
  const directory = mkdtempSync(join(tmpdir(), "party-play-questions-socket-"));
  const httpServer = createServer();
  const io = new Server(httpServer);
  const service = new QuestionsSessionService(
    new FileQuestionsSessionStore(join(directory, "session.json")),
  );
  registerQuestionsHandlers(io.of("/questions"), service);
  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const address = httpServer.address() as AddressInfo;
  const clients: ClientSocket<QuestionsServerEvents, QuestionsClientEvents>[] = [];

  async function connect(): Promise<TestClient> {
    const socket: ClientSocket<QuestionsServerEvents, QuestionsClientEvents> = createClient(
      `http://127.0.0.1:${address.port}/questions`,
      { forceNew: true, reconnection: false },
    );
    clients.push(socket);
    const queue = new Map<ServerEvent, unknown[]>();
    const waiters = new Map<ServerEvent, ((payload: unknown) => boolean)[]>();
    socket.onAny((event, payload: unknown) => {
      const key = event as ServerEvent;
      const pending = waiters.get(key) ?? [];
      const accepted = pending.findIndex((waiter) => waiter(payload));
      if (accepted >= 0) {
        pending.splice(accepted, 1);
        return;
      }
      queue.set(key, [...(queue.get(key) ?? []), payload]);
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
        const queued = queue.get(event) ?? [];
        const index = queued.findIndex((payload) =>
          predicate(payload as ServerPayload<typeof event>),
        );
        if (index >= 0) {
          const [payload] = queued.splice(index, 1);
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

test("streams both editors' full live values to an observer", async () => {
  const harness = await createHarness();
  try {
    const daniil = await harness.connect();
    const observer = await harness.connect();
    daniil.emit("questions:selectRole", { role: "daniil" });
    observer.emit("questions:selectRole", { role: "observer" });
    await daniil.waitFor("questions:editorState");
    await observer.waitFor("questions:observerState");

    daniil.emit("questions:addQuestion");
    const created = await observer.waitFor(
      "questions:observerState",
      (state) => state.questions.length === 1,
    );
    const questionId = created.questions[0].id;

    daniil.emit("questions:updateAnswer", {
      questionId,
      field: "ownAnswer",
      value: "Си",
    });
    const first = await observer.waitFor(
      "questions:observerState",
      (state) => state.questions[0]?.daniil.ownAnswer === "Си",
    );
    assert.equal(first.questions[0].daniil.ownAnswer, "Си");

    daniil.emit("questions:updateAnswer", {
      questionId,
      field: "ownAnswer",
      value: "Синий",
    });
    const second = await observer.waitFor(
      "questions:observerState",
      (state) => state.questions[0]?.daniil.ownAnswer === "Синий",
    );
    assert.equal(second.questions[0].daniil.ownAnswer, "Синий");
  } finally {
    await harness.close();
  }
});

test("keeps observers read-only and editor payloads private", async () => {
  const harness = await createHarness();
  try {
    const shasha = await harness.connect();
    const observer = await harness.connect();
    shasha.emit("questions:selectRole", { role: "shasha" });
    observer.emit("questions:selectRole", { role: "observer" });
    await shasha.waitFor("questions:editorState");
    await observer.waitFor("questions:observerState");

    observer.emit("questions:addQuestion");
    assert.match((await observer.waitFor("questions:error")).message, /наблюдател/i);

    shasha.emit("questions:addQuestion");
    const editorState = await shasha.waitFor(
      "questions:editorState",
      (state) => state.questions.length === 1,
    );
    assert.equal(JSON.stringify(editorState).includes("daniil"), false);
    assert.equal(JSON.stringify(editorState).includes("shasha"), true);
  } finally {
    await harness.close();
  }
});

test("lets either editor delete only the latest question for every screen", async () => {
  const harness = await createHarness();
  try {
    const daniil = await harness.connect();
    const shasha = await harness.connect();
    const observer = await harness.connect();
    daniil.emit("questions:selectRole", { role: "daniil" });
    shasha.emit("questions:selectRole", { role: "shasha" });
    observer.emit("questions:selectRole", { role: "observer" });
    await daniil.waitFor("questions:editorState");
    await shasha.waitFor("questions:editorState");
    await observer.waitFor("questions:observerState");

    daniil.emit("questions:addQuestion");
    await observer.waitFor("questions:observerState", (state) => state.questions.length === 1);
    shasha.emit("questions:addQuestion");
    await observer.waitFor("questions:observerState", (state) => state.questions.length === 2);

    shasha.emit("questions:deleteLatestQuestion");
    const observerAfterDelete = await observer.waitFor(
      "questions:observerState",
      (state) => state.questions.length === 1,
    );
    const daniilAfterDelete = await daniil.waitFor(
      "questions:editorState",
      (state) => state.questions.length === 1,
    );
    assert.deepEqual(
      observerAfterDelete.questions.map((question) => question.number),
      [1],
    );
    assert.deepEqual(
      daniilAfterDelete.questions.map((question) => question.number),
      [1],
    );

    observer.emit("questions:deleteLatestQuestion");
    assert.match((await observer.waitFor("questions:error")).message, /наблюдател/i);
  } finally {
    await harness.close();
  }
});
