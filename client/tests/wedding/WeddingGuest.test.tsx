import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { GuestWeddingState } from "../../../shared/types";
import { GuestWeddingScreen } from "../../src/wedding/GuestWeddingApp";
import { getPartyPlayAppKind } from "../../src/wedding/mainRouter";
import { toWeddingRejoinPayload } from "../../src/wedding/WeddingContext";

const openState: GuestWeddingState = {
  phase: "OPEN",
  questionNumber: 5,
  optionStyle: "letters",
  expiresAt: Date.now() + 1_000,
  participantId: "w_vera",
  participantName: "Вера",
  hasAnswered: false,
  selectedOption: null,
};

const baseProps = {
  roomExists: true,
  participants: [],
  connected: true,
  error: null,
  onJoinNew: () => undefined,
  onRejoin: () => undefined,
  onAnswer: () => undefined,
};

test("routes wedding guests and admins without changing the bunker fallback", () => {
  assert.equal(getPartyPlayAppKind("/wedding"), "wedding-guest");
  assert.equal(getPartyPlayAppKind("/wedding/"), "wedding-guest");
  assert.equal(getPartyPlayAppKind("/admin"), "wedding-admin");
  assert.equal(getPartyPlayAppKind("/"), "bunker");
  assert.equal(getPartyPlayAppKind("/anything-else"), "bunker");
});

test("maps stored participant names to the server rejoin contract", () => {
  assert.deepEqual(
    toWeddingRejoinPayload({ participantId: "w_vera", participantName: "Вера" }),
    { participantId: "w_vera", name: "Вера" },
  );
});

test("guest buttons match letter and number formats without revealing correctness", () => {
  const letters = renderToStaticMarkup(
    <GuestWeddingScreen {...baseProps} state={openState} />,
  );
  assert.match(letters, />А<.*>Б<.*>В<.*>Г</s);

  const numbers = renderToStaticMarkup(
    <GuestWeddingScreen
      {...baseProps}
      state={{ ...openState, questionNumber: 6, optionStyle: "numbers" }}
    />,
  );
  assert.match(numbers, />1<.*>2<.*>3<.*>4</s);
  assert.doesNotMatch(`${letters}${numbers}`, /правильн|неверн/i);
});

test("preparing guests see the waiting state and no active answer buttons", () => {
  const html = renderToStaticMarkup(
    <GuestWeddingScreen
      {...baseProps}
      state={{ ...openState, phase: "PREPARING", optionStyle: null }}
    />,
  );

  assert.match(html, /Ждём следующий вопрос/);
  assert.doesNotMatch(html, /wedding-answer-button/);
});

test("a submitted answer is locked with a neutral confirmation", () => {
  const html = renderToStaticMarkup(
    <GuestWeddingScreen
      {...baseProps}
      state={{ ...openState, hasAnswered: true, selectedOption: 1 }}
    />,
  );

  assert.match(html, /Ответ принят/);
  assert.match(html, /Изменить выбор уже нельзя/);
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /disabled=""/);
  assert.doesNotMatch(html, /правильн|неверн/i);
});

test("guest landing lists existing names and supports a first-time participant", () => {
  const html = renderToStaticMarkup(
    <GuestWeddingScreen
      {...baseProps}
      state={null}
      participants={[
        { id: "w_vera", name: "Вера", connected: false },
        { id: "w_oleg", name: "Олег", connected: true },
      ]}
    />,
  );

  assert.match(html, /Найдите своё имя/);
  assert.match(html, /Вера/);
  assert.match(html, /Олег/);
  assert.match(html, /Я здесь впервые/);
});

test("finished guests see thanks instead of standings", () => {
  const html = renderToStaticMarkup(
    <GuestWeddingScreen
      {...baseProps}
      state={{ ...openState, phase: "FINISHED", optionStyle: null }}
    />,
  );

  assert.match(html, /Спасибо за игру/);
  assert.doesNotMatch(html, /место|балл|счёт/i);
});
