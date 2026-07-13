import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { QuestionsEditorState, QuestionsObserverState } from "../../../shared/types";
import {
  isNearPageBottom,
  mergeEditorDrafts,
  QuestionsEditorScreen,
  QuestionsObserverScreen,
  QuestionsRolePicker,
} from "../../src/questions/QuestionsApp";
import { getPartyPlayAppKind } from "../../src/wedding/mainRouter";

const noop = () => undefined;

test("routes /questions without changing existing app routes", () => {
  assert.equal(getPartyPlayAppKind("/questions"), "questions");
  assert.equal(getPartyPlayAppKind("/questions/"), "questions");
  assert.equal(getPartyPlayAppKind("/wedding"), "wedding-guest");
  assert.equal(getPartyPlayAppKind("/admin"), "wedding-admin");
  assert.equal(getPartyPlayAppKind("/"), "bunker");
});

test("role picker offers exactly the two editors and observer", () => {
  const html = renderToStaticMarkup(<QuestionsRolePicker onSelect={noop} connected />);
  assert.match(html, />Шаша</);
  assert.match(html, />Даниил</);
  assert.match(html, />Наблюдатель</);
  assert.match(html, /ДанИИл/);
});

test("editor renders only the selected participant's fields with author-based labels", () => {
  const state: QuestionsEditorState = {
    role: "daniil",
    questions: [
      {
        id: 1,
        number: 1,
        ownAnswer: "Синий",
        partnerGuess: "Розовый",
        updatedAt: 1_000,
      },
      {
        id: 2,
        number: 2,
        ownAnswer: "Лето",
        partnerGuess: "Весна",
        updatedAt: 2_000,
      },
    ],
  };
  const html = renderToStaticMarkup(
    <QuestionsEditorScreen
      state={state}
      connected
      error={null}
      onExit={noop}
      onAddQuestion={noop}
      onUpdate={noop}
    />,
  );

  assert.match(html, /Вопрос 01/);
  assert.match(html, /Вопрос 02/);
  assert.match(html, /Вариант ДанИИла/);
  assert.match(html, /Вариант Шаши/);
  assert.doesNotMatch(html, /Мой ответ|Как ответит/);
  assert.doesNotMatch(html, /Красный|Зелёный/);
});

test("observer shows every question and all four live fields", () => {
  const state: QuestionsObserverState = {
    questions: [
      {
        id: 1,
        number: 1,
        createdAt: 500,
        daniil: { ownAnswer: "Синий", partnerGuess: "Розовый", updatedAt: 1_000 },
        shasha: { ownAnswer: "Красный", partnerGuess: "Голубой", updatedAt: 1_100 },
      },
      {
        id: 2,
        number: 2,
        createdAt: 2_000,
        daniil: { ownAnswer: "", partnerGuess: "", updatedAt: 2_000 },
        shasha: { ownAnswer: "", partnerGuess: "", updatedAt: 2_000 },
      },
    ],
  };
  const html = renderToStaticMarkup(
    <QuestionsObserverScreen state={state} connected error={null} />,
  );

  assert.match(html, /Вопрос 01/);
  assert.match(html, /Вопрос 02/);
  assert.match(html, /Синий/);
  assert.match(html, /Розовый/);
  assert.match(html, /Красный/);
  assert.match(html, /Голубой/);
  assert.match(html, /Ждём ответ/);
  assert.equal((html.match(/Вариант ДанИИла/g) ?? []).length, 4);
  assert.equal((html.match(/Вариант Шаши/g) ?? []).length, 4);
  assert.doesNotMatch(html, /Мой ответ|Как ответит/);
});

test("authoritative editor state replaces clean drafts but preserves unsaved fields", () => {
  const state: QuestionsEditorState = {
    role: "daniil",
    questions: [
      {
        id: 1,
        number: 1,
        ownAnswer: "Ответ с сервера",
        partnerGuess: "Догадка с сервера",
        updatedAt: 2_000,
      },
    ],
  };

  assert.deepEqual(
    mergeEditorDrafts(
      { "1:ownAnswer": "Старый ответ", "1:partnerGuess": "Локальная догадка" },
      state,
      new Set(["1:partnerGuess"]),
    ),
    {
      "1:ownAnswer": "Ответ с сервера",
      "1:partnerGuess": "Локальная догадка",
    },
  );
});

test("detects whether a projector was already near the page bottom", () => {
  assert.equal(
    isNearPageBottom({ scrollY: 1_000, viewportHeight: 900, documentHeight: 2_000 }),
    true,
  );
  assert.equal(
    isNearPageBottom({ scrollY: 100, viewportHeight: 900, documentHeight: 2_000 }),
    false,
  );
});
