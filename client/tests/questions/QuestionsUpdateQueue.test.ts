import assert from "node:assert/strict";
import test from "node:test";
import type { QuestionsEditorState } from "../../../shared/types";
import {
  QuestionsUpdateQueue,
  type QuestionsSaveStatus,
} from "../../src/questions/QuestionsUpdateQueue";

test("debounces to the latest value and clears acknowledged updates", () => {
  let nextTimer = 1;
  const timers = new Map<number, () => void>();
  const sent: string[] = [];
  const statuses: [string, QuestionsSaveStatus][] = [];
  const queue = new QuestionsUpdateQueue({
    send: (update) => sent.push(update.value),
    onStatus: (key, status) => statuses.push([key, status]),
    setTimer: (callback) => {
      const id = nextTimer++;
      timers.set(id, callback);
      return id;
    },
    clearTimer: (id) => timers.delete(id as number),
  });

  queue.enqueue({ questionId: 1, field: "ownAnswer", value: "С" }, true);
  queue.enqueue({ questionId: 1, field: "ownAnswer", value: "Синий" }, true);
  assert.deepEqual(sent, []);
  assert.equal(timers.size, 1);

  [...timers.values()][0]();
  assert.deepEqual(sent, ["Синий"]);

  const state: QuestionsEditorState = {
    role: "daniil",
    questions: [{ id: 1, number: 1, ownAnswer: "Синий", partnerGuess: "", updatedAt: 1_000 }],
  };
  queue.acknowledge(state);
  queue.reconnect();
  assert.deepEqual(sent, ["Синий"]);
  assert.deepEqual(statuses.at(-1), ["1:ownAnswer", "saved"]);
});

test("keeps offline edits queued and flushes the latest value on reconnect", () => {
  const sent: string[] = [];
  const statuses: QuestionsSaveStatus[] = [];
  const queue = new QuestionsUpdateQueue({
    send: (update) => sent.push(update.value),
    onStatus: (_key, status) => statuses.push(status),
  });

  queue.enqueue({ questionId: 2, field: "partnerGuess", value: "Весна" }, false);
  assert.deepEqual(sent, []);
  assert.equal(statuses.at(-1), "offline");
  queue.reconnect();
  assert.deepEqual(sent, ["Весна"]);
  assert.equal(statuses.at(-1), "saving");
  queue.clear();
});

test("flush sends a pending value immediately instead of waiting for debounce", () => {
  const sent: string[] = [];
  const timers = new Map<number, () => void>();
  const queue = new QuestionsUpdateQueue({
    send: (update) => sent.push(update.value),
    onStatus: () => undefined,
    setTimer: (callback) => {
      timers.set(1, callback);
      return 1;
    },
    clearTimer: (id) => timers.delete(id as number),
  });

  queue.enqueue({ questionId: 3, field: "ownAnswer", value: "Сразу" }, true);
  queue.flush(3, "ownAnswer", true);
  assert.deepEqual(sent, ["Сразу"]);
  assert.equal(timers.size, 0);
  queue.clear();
});

test("drops pending updates when their question was deleted", () => {
  const sent: string[] = [];
  const timers = new Map<number, () => void>();
  const queue = new QuestionsUpdateQueue({
    send: (update) => sent.push(update.value),
    onStatus: () => undefined,
    setTimer: (callback) => {
      timers.set(1, callback);
      return 1;
    },
    clearTimer: (id) => timers.delete(id as number),
  });

  queue.enqueue({ questionId: 2, field: "ownAnswer", value: "Лишний ответ" }, true);
  queue.acknowledge({ role: "daniil", questions: [] });
  queue.reconnect();

  assert.equal(timers.size, 0);
  assert.deepEqual(sent, []);
});
