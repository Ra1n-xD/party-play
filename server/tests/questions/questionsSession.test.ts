import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  FileQuestionsSessionStore,
  type QuestionsSessionSnapshot,
  type QuestionsSessionStore,
  QuestionsSessionService,
} from "../../src/questions/questionsSession.js";

function withService(
  run: (service: QuestionsSessionService, setNow: (value: number) => void) => void,
) {
  const directory = mkdtempSync(join(tmpdir(), "party-play-questions-"));
  let now = 1_000;
  const file = join(directory, "session.json");
  const service = new QuestionsSessionService(new FileQuestionsSessionStore(file), () => now);

  try {
    run(service, (value) => {
      now = value;
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("adds persistent questions with monotonically increasing numbers", () => {
  const directory = mkdtempSync(join(tmpdir(), "party-play-questions-persisted-"));
  const file = join(directory, "session.json");

  try {
    const first = new QuestionsSessionService(new FileQuestionsSessionStore(file), () => 10_000);
    assert.equal(first.getObserverState().questions.length, 0);
    assert.equal(first.addQuestion().questions[0].number, 1);
    assert.equal(first.addQuestion().questions[1].number, 2);

    const restored = new QuestionsSessionService(new FileQuestionsSessionStore(file), () => 11_000);
    assert.deepEqual(
      restored.getObserverState().questions.map((question) => question.number),
      [1, 2],
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("updates only the selected participant fields and keeps editor state private", () => {
  withService((service, setNow) => {
    const question = service.addQuestion().questions[0];
    setNow(2_000);
    service.updateAnswer("daniil", question.id, "ownAnswer", "Синий");
    setNow(2_100);
    service.updateAnswer("daniil", question.id, "partnerGuess", "Розовый");
    setNow(2_200);
    service.updateAnswer("shasha", question.id, "ownAnswer", "Красный");

    const daniil = service.getEditorState("daniil");
    assert.deepEqual(daniil.questions[0], {
      id: question.id,
      number: 1,
      ownAnswer: "Синий",
      partnerGuess: "Розовый",
      updatedAt: 2_100,
    });
    assert.equal(JSON.stringify(daniil).includes("Красный"), false);

    const observer = service.getObserverState();
    assert.equal(observer.questions[0].daniil.ownAnswer, "Синий");
    assert.equal(observer.questions[0].daniil.partnerGuess, "Розовый");
    assert.equal(observer.questions[0].shasha.ownAnswer, "Красный");
  });
});

test("rejects invalid questions, fields, and oversized live values", () => {
  withService((service) => {
    const question = service.addQuestion().questions[0];
    assert.throws(
      () => service.updateAnswer("daniil", question.id + 1, "ownAnswer", "Ответ"),
      /вопрос не найден/i,
    );
    assert.throws(
      () => service.updateAnswer("observer" as "daniil", question.id, "ownAnswer", "Ответ"),
      /роль/i,
    );
    assert.throws(
      () => service.updateAnswer("daniil", question.id, "unknown" as "ownAnswer", "Ответ"),
      /поле/i,
    );
    assert.throws(
      () => service.updateAnswer("daniil", question.id, "ownAnswer", "а".repeat(241)),
      /240/i,
    );
  });
});

test("discards a malformed snapshot without crashing", () => {
  const directory = mkdtempSync(join(tmpdir(), "party-play-questions-malformed-"));
  const file = join(directory, "session.json");
  writeFileSync(file, JSON.stringify({ version: 1, questions: [null] }));

  try {
    assert.doesNotThrow(() => {
      const service = new QuestionsSessionService(new FileQuestionsSessionStore(file));
      assert.deepEqual(service.getObserverState().questions, []);
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("rolls back failed persistence without exposing a system error", () => {
  class FailingStore implements QuestionsSessionStore {
    snapshot: QuestionsSessionSnapshot | null = null;

    load() {
      return this.snapshot;
    }

    save() {
      const error = new Error("ENOSPC: no space left on device, open '/secret/path'");
      Object.assign(error, { code: "ENOSPC" });
      throw error;
    }
  }

  const service = new QuestionsSessionService(new FailingStore(), Date.now, () => undefined);
  assert.throws(() => service.addQuestion(), /не удалось сохранить/i);
  assert.deepEqual(service.getObserverState().questions, []);
});
