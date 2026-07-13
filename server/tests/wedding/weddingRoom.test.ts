import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  FileWeddingRoomStore,
  WeddingRoomService,
  WEDDING_ROOM_TTL_MS,
} from "../../src/wedding/weddingRoom.js";

function withService(run: (service: WeddingRoomService, setNow: (value: number) => void) => void) {
  const directory = mkdtempSync(join(tmpdir(), "party-play-wedding-"));
  let now = 1_000;
  const service = new WeddingRoomService(
    new FileWeddingRoomStore(join(directory, "room.json")),
    () => now,
  );

  try {
    run(service, (value) => {
      now = value;
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("discards malformed persisted participant records instead of crashing", () => {
  const directory = mkdtempSync(join(tmpdir(), "party-play-wedding-malformed-"));
  const file = join(directory, "room.json");
  writeFileSync(
    file,
    JSON.stringify({
      version: 1,
      createdAt: 1_000,
      expiresAt: Date.now() + WEDDING_ROOM_TTL_MS,
      phase: "PREPARING",
      questionNumber: 0,
      optionStyle: "letters",
      correctOption: null,
      participants: [null],
      answers: [],
    }),
  );

  try {
    let service: WeddingRoomService | null = null;
    assert.doesNotThrow(() => {
      service = new WeddingRoomService(new FileWeddingRoomStore(file));
    });
    assert.equal(service?.getHostState(), null);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("creates one persisted room for exactly 96 hours", () => {
  const directory = mkdtempSync(join(tmpdir(), "party-play-wedding-"));
  const file = join(directory, "room.json");
  let now = 10_000;

  try {
    const first = new WeddingRoomService(new FileWeddingRoomStore(file), () => now);
    const room = first.createRoom();

    assert.equal(room.expiresAt, now + WEDDING_ROOM_TTL_MS);
    assert.equal(room.phase, "PREPARING");
    assert.equal(room.correctOption, null);
    assert.throws(() => first.startQuestion(), /правильный ответ/i);
    assert.throws(() => first.createRoom(), /уже создана/i);

    now += 1;
    const restored = new WeddingRoomService(new FileWeddingRoomStore(file), () => now);
    assert.equal(restored.getHostState()?.expiresAt, room.expiresAt);

    now = room.expiresAt;
    assert.equal(restored.getHostState(), null);
    const replacement = restored.createRoom();
    assert.equal(replacement.expiresAt, now + WEDDING_ROOM_TTL_MS);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("joins unique names and reconnects the newest socket to the same seat", () => {
  withService((service) => {
    service.createRoom();
    const vera = service.joinNew("  Вера  ", "socket-old");

    assert.equal(vera.participantName, "Вера");
    assert.throws(() => service.joinNew("вЕрА", "socket-duplicate"), /уже существует/i);

    const rebound = service.rejoin(vera.participantId, "Вера", "socket-new");
    assert.equal(rebound.replacedSocketId, "socket-old");
    assert.equal(service.listParticipants()[0].connected, true);

    service.disconnectSocket("socket-old");
    assert.equal(service.listParticipants()[0].connected, true);
    service.disconnectSocket("socket-new");
    assert.equal(service.listParticipants()[0].connected, false);
  });
});

test("accepts one final answer and automatically scores the first correct response", () => {
  withService((service, setNow) => {
    service.createRoom();
    const dmitry = service.joinNew("Дмитрий", "socket-dmitry");
    const vera = service.joinNew("Вера", "socket-vera");
    service.setDraft("letters", 1);
    service.startQuestion();

    setNow(2_000);
    service.submitAnswer(dmitry.participantId, "socket-dmitry", 2);
    setNow(2_100);
    service.submitAnswer(vera.participantId, "socket-vera", 1);

    assert.throws(() => service.submitAnswer(vera.participantId, "socket-vera", 0), /уже принят/i);

    const host = service.getHostState();
    assert.ok(host);
    assert.deepEqual(
      host.answers.map((answer) => [answer.sequence, answer.participantName, answer.optionIndex]),
      [
        [1, "Дмитрий", 2],
        [2, "Вера", 1],
      ],
    );
    assert.equal(host.answers[0].firstCorrect, false);
    assert.equal(host.answers[1].firstCorrect, true);
    assert.equal(host.answers[1].optionStyle, "letters");
    assert.equal(
      host.participants.find((participant) => participant.id === vera.participantId)
        ?.correctAnswers,
      1,
    );

    const guest = service.getGuestState(vera.participantId);
    assert.ok(guest);
    assert.equal(guest.hasAnswered, true);
    assert.equal(guest.selectedOption, 1);
    assert.equal("correctOption" in guest, false);
    assert.equal("answers" in guest, false);
    assert.equal("participants" in guest, false);
  });
});

test("keeps guests waiting until the host explicitly starts the next question", () => {
  withService((service) => {
    service.createRoom();
    const vera = service.joinNew("Вера", "socket-vera");
    service.setDraft("numbers", 3);

    assert.throws(() => service.submitAnswer(vera.participantId, "socket-vera", 3), /не открыт/i);
    service.startQuestion();
    assert.equal(service.getGuestState(vera.participantId)?.questionNumber, 1);
    service.submitAnswer(vera.participantId, "socket-vera", 3);
    service.prepareNextQuestion();

    const waiting = service.getGuestState(vera.participantId);
    assert.equal(waiting?.phase, "PREPARING");
    assert.equal(waiting?.hasAnswered, true);
    assert.equal(service.getHostState()?.correctOption, null);
    assert.throws(() => service.startQuestion(), /правильный ответ/i);
    assert.throws(() => service.submitAnswer(vera.participantId, "socket-vera", 0), /не открыт/i);

    service.setDraft("letters", 0);
    service.startQuestion();
    const next = service.getGuestState(vera.participantId);
    assert.equal(next?.phase, "OPEN");
    assert.equal(next?.questionNumber, 2);
    assert.equal(next?.hasAnswered, false);
  });
});

test("lets the host correct non-negative scores and finish the contest", () => {
  withService((service) => {
    service.createRoom();
    const vera = service.joinNew("Вера", "socket-vera");

    service.adjustScore(vera.participantId, 1);
    service.adjustScore(vera.participantId, 1);
    service.adjustScore(vera.participantId, -1);
    assert.equal(service.getHostState()?.participants[0].correctAnswers, 1);

    service.adjustScore(vera.participantId, -1);
    assert.throws(() => service.adjustScore(vera.participantId, -1), /ниже нуля/i);
    assert.throws(() => service.adjustScore(vera.participantId, 2), /изменение счёта/i);

    service.finishContest();
    assert.equal(service.getHostState()?.phase, "FINISHED");
    assert.equal(service.getGuestState(vera.participantId)?.phase, "FINISHED");
  });
});
