import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React, { type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import type { HostWeddingState } from "../../../shared/types";
import { AdminWeddingScreen } from "../../src/wedding/AdminWeddingApp";

const hostState: HostWeddingState = {
  phase: "OPEN",
  questionNumber: 4,
  optionStyle: "letters",
  correctOption: 1,
  expiresAt: Date.now() + 81 * 60 * 60 * 1_000,
  connectedCount: 3,
  answeredCount: 2,
  participants: [
    { id: "vera", name: "Вера", connected: true, correctAnswers: 3, hasAnswered: true },
    { id: "oleg", name: "Олег", connected: false, correctAnswers: 0, hasAnswered: false },
    { id: "nik", name: "Николай", connected: true, correctAnswers: 4, hasAnswered: true },
  ],
  answers: [
    {
      sequence: 1,
      participantId: "vera",
      participantName: "Вера",
      optionIndex: 2,
      optionStyle: "letters",
      submittedAt: Date.now(),
      firstCorrect: false,
    },
    {
      sequence: 2,
      participantId: "nik",
      participantName: "Николай",
      optionIndex: 1,
      optionStyle: "letters",
      submittedAt: Date.now() + 200,
      firstCorrect: true,
    },
  ],
};

function createActions() {
  const calls: string[] = [];
  return {
    calls,
    actions: {
      createRoom: () => calls.push("create"),
      setDraft: (style: "letters" | "numbers", option: number | null) =>
        calls.push(`draft:${style}:${option}`),
      startQuestion: () => calls.push("start"),
      prepareNextQuestion: () => calls.push("next"),
      adjustScore: (participantId: string, delta: -1 | 1) =>
        calls.push(`score:${participantId}:${delta}`),
      finishContest: () => calls.push("finish"),
    },
  };
}

function buttonText(button: ReactTestInstance): string {
  return button.children.filter((child): child is string => typeof child === "string").join("");
}

function findButton(renderer: ReturnType<typeof create>, label: string): ReactTestInstance {
  const button = renderer.root
    .findAllByType("button")
    .find((candidate) => buttonText(candidate).includes(label));
  assert.ok(button, `Missing button: ${label}`);
  return button;
}

function propsFor(
  state: HostWeddingState | null,
  actions = createActions().actions,
): ComponentProps<typeof AdminWeddingScreen> {
  return {
    roomExists: state !== null,
    state,
    connected: true,
    error: null,
    actions,
  };
}

test("current-question tab shows chronology, cumulative scores, and the first correct answer", () => {
  const html = renderToStaticMarkup(<AdminWeddingScreen {...propsFor(hostState)} />);

  assert.match(html, /Текущий вопрос/);
  assert.match(html, /Счёт участников/);
  assert.match(html, /Вера/);
  assert.match(html, /верных: 3/);
  assert.match(html, /Николай/);
  assert.match(html, /первый верный/);
  assert.match(html, /wedding-answer-row wedding-first-correct/);
  assert.doesNotMatch(html, /Прогресс|progress/i);
  assert.match(html, /Закончить конкурс/);
});

test("score tab sorts participants and exposes reversible score controls", async () => {
  const { calls, actions } = createActions();
  const renderer = create(<AdminWeddingScreen {...propsFor(hostState, actions)} />);

  await act(async () => findButton(renderer, "Счёт участников").props.onClick());
  const text = renderer.toJSON();
  assert.ok(text);
  const html = JSON.stringify(text);
  assert.ok(html.indexOf("Николай") < html.indexOf("Вера"));
  assert.match(html, /Уменьшить счёт Вера/);
  assert.match(html, /Увеличить счёт Вера/);

  await act(async () => {
    renderer.root.findByProps({ "aria-label": "Увеличить счёт Вера" }).props.onClick();
  });
  assert.deepEqual(calls, ["score:vera:1"]);
  assert.equal(
    renderer.root.findByProps({ "aria-label": "Уменьшить счёт Олег" }).props.disabled,
    true,
  );
});

test("preparing state lets the host choose labels and explicitly start the question", () => {
  const html = renderToStaticMarkup(
    <AdminWeddingScreen {...propsFor({ ...hostState, phase: "PREPARING", questionNumber: 4 })} />,
  );

  assert.match(html, /Подготовка вопроса 05/);
  assert.match(html, /А · Б · В · Г/);
  assert.match(html, /1 · 2 · 3 · 4/);
  assert.match(html, /Правильный ответ/);
  assert.match(html, /Начать вопрос 05/);
});

test("a new question stays unstartable until the host chooses a fresh correct answer", () => {
  const html = renderToStaticMarkup(
    <AdminWeddingScreen
      {...propsFor({
        ...hostState,
        phase: "PREPARING",
        questionNumber: 4,
        correctOption: null,
      })}
    />,
  );

  assert.match(html, /Сначала выберите правильный ответ/);
  assert.doesNotMatch(html, /Начать вопрос 05/);
});

test("preparing the next question retains the previous chronology and its original labels", () => {
  const html = renderToStaticMarkup(
    <AdminWeddingScreen
      {...propsFor({
        ...hostState,
        phase: "PREPARING",
        optionStyle: "numbers",
        correctOption: null,
      })}
    />,
  );

  assert.match(html, /Ответы вопроса 04/);
  assert.match(html, /wedding-answer-chip">В/);
  assert.match(html, /первый верный/);
});

test("phase actions require confirmation before sending a socket mutation", async () => {
  const { calls, actions } = createActions();
  const renderer = create(<AdminWeddingScreen {...propsFor(hostState, actions)} />);

  await act(async () => findButton(renderer, "Следующий вопрос").props.onClick());
  assert.deepEqual(calls, []);
  assert.ok(findButton(renderer, "Да, перейти дальше"));

  await act(async () => findButton(renderer, "Да, перейти дальше").props.onClick());
  assert.deepEqual(calls, ["next"]);
});

test("contest completion uses a destructive confirmation dialog", async () => {
  const { calls, actions } = createActions();
  const renderer = create(<AdminWeddingScreen {...propsFor(hostState, actions)} />);

  await act(async () => findButton(renderer, "Закончить конкурс").props.onClick());
  assert.deepEqual(calls, []);
  assert.match(JSON.stringify(renderer.toJSON()), /Конкурс будет завершён/);

  await act(async () => findButton(renderer, "Да, закончить конкурс").props.onClick());
  assert.deepEqual(calls, ["finish"]);
});

test("wedding stylesheet keeps mobile touch targets and the approved palette", () => {
  const css = readFileSync(new URL("../../src/styles/wedding.css", import.meta.url), "utf8");
  assert.match(css, /--wedding-wine: #70213d/);
  assert.match(css, /--wedding-ivory: #fffaf2/);
  assert.match(css, /min-height: 44px/);
  assert.match(
    css,
    /\.wedding-score-stepper button \{[\s\S]*?width: 44px;[\s\S]*?min-height: 44px;/,
  );
  assert.match(css, /@media \(max-width: 360px\)/);
});
