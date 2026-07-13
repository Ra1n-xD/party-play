import { useEffect, useMemo, useRef, useState } from "react";
import type {
  QuestionsAnswerField,
  QuestionsEditorState,
  QuestionsObserverState,
  QuestionsRole,
} from "../../../shared/types";
import { useQuestions } from "./QuestionsContext";
import { questionsUpdateKey, type QuestionsSaveStatus } from "./QuestionsUpdateQueue";

function QuestionBrand({ eyebrow }: { eyebrow: string }) {
  return (
    <div className="questions-brand">
      <span className="questions-brand-eyebrow">{eyebrow}</span>
      <div className="questions-brand-title" aria-label="ДанИИл и Шаша">
        <span>Дан</span>
        <span className="questions-brand-highlight">ИИ</span>
        <span>л</span>
        <span className="questions-brand-heart" aria-hidden="true">
          ♥
        </span>
        <span>Шаша</span>
      </div>
    </div>
  );
}

function ConnectionStatus({ connected }: { connected: boolean }) {
  return (
    <span className={`questions-connection ${connected ? "is-online" : "is-offline"}`}>
      <span className="questions-connection-dot" aria-hidden="true" />
      {connected ? "В эфире" : "Переподключаемся…"}
    </span>
  );
}

export function QuestionsRolePicker({
  onSelect,
  connected,
}: {
  onSelect: (role: QuestionsRole) => void;
  connected: boolean;
}) {
  return (
    <main className="questions-shell questions-role-shell">
      <div className="questions-paper-orbit" aria-hidden="true" />
      <section className="questions-role-card">
        <QuestionBrand eyebrow="Кто кого лучше знает" />
        <div className="questions-role-copy">
          <span className="questions-kicker">Добро пожаловать</span>
          <h1>Кто вы сегодня?</h1>
          <p>Выберите свой экран. Ответы появляются на проекторе прямо во время набора.</p>
        </div>
        <div className="questions-role-actions">
          <button type="button" onClick={() => onSelect("shasha")}>
            <span className="questions-role-icon" aria-hidden="true">
              Ш
            </span>
            <span>
              <strong>Шаша</strong>
              <small>Писать ответы</small>
            </span>
          </button>
          <button type="button" onClick={() => onSelect("daniil")}>
            <span className="questions-role-icon" aria-hidden="true">
              Д
            </span>
            <span>
              <strong>Даниил</strong>
              <small>Писать ответы</small>
            </span>
          </button>
          <button
            type="button"
            className="questions-observer-choice"
            onClick={() => onSelect("observer")}
          >
            <span className="questions-role-icon" aria-hidden="true">
              ◉
            </span>
            <span>
              <strong>Наблюдатель</strong>
              <small>Экран для проектора</small>
            </span>
          </button>
        </div>
        <ConnectionStatus connected={connected} />
      </section>
    </main>
  );
}

function formatQuestionNumber(number: number): string {
  return String(number).padStart(2, "0");
}

type DraftMap = Record<string, string>;

function createDraftMap(state: QuestionsEditorState): DraftMap {
  const drafts: DraftMap = {};
  for (const question of state.questions) {
    drafts[`${question.id}:ownAnswer`] = question.ownAnswer;
    drafts[`${question.id}:partnerGuess`] = question.partnerGuess;
  }
  return drafts;
}

export function mergeEditorDrafts(
  current: DraftMap,
  state: QuestionsEditorState,
  dirtyKeys: ReadonlySet<string>,
): DraftMap {
  const authoritative = createDraftMap(state);
  for (const key of dirtyKeys) {
    if (key in current) authoritative[key] = current[key];
  }
  return authoritative;
}

export function QuestionsEditorScreen({
  state,
  connected,
  error,
  onExit,
  onAddQuestion,
  onUpdate,
  onFlush = () => undefined,
  saveStatuses = {},
}: {
  state: QuestionsEditorState;
  connected: boolean;
  error: string | null;
  onExit: () => void;
  onAddQuestion: () => void;
  onUpdate: (questionId: number, field: QuestionsAnswerField, value: string) => void;
  onFlush?: (questionId: number, field: QuestionsAnswerField) => void;
  saveStatuses?: Record<string, QuestionsSaveStatus>;
}) {
  const [drafts, setDrafts] = useState<DraftMap>(() => createDraftMap(state));
  const partnerName = state.role === "daniil" ? "Шаша" : "Даниил";
  const ownName = state.role === "daniil" ? "Даниил" : "Шаша";
  const ownVariantLabel = state.role === "daniil" ? "Вариант ДанИИла" : "Вариант Шаши";
  const partnerVariantLabel = state.role === "daniil" ? "Вариант Шаши" : "Вариант ДанИИла";

  useEffect(() => {
    const dirtyKeys = new Set(
      Object.entries(saveStatuses)
        .filter(([, status]) => status === "saving" || status === "offline")
        .map(([key]) => key),
    );
    setDrafts((current) => mergeEditorDrafts(current, state, dirtyKeys));
  }, [state, saveStatuses]);

  const update = (questionId: number, field: QuestionsAnswerField, value: string) => {
    setDrafts((current) => ({ ...current, [`${questionId}:${field}`]: value }));
    onUpdate(questionId, field, value);
  };

  const saveNote = (questionId: number): string => {
    if (!connected) return "Сохраним после подключения";
    const statuses = [
      saveStatuses[questionsUpdateKey(questionId, "ownAnswer")],
      saveStatuses[questionsUpdateKey(questionId, "partnerGuess")],
    ];
    if (statuses.includes("saving")) return "Сохраняем…";
    if (statuses.includes("saved")) return "Сохранено";
    return "Ответы сохраняются автоматически";
  };

  return (
    <main className="questions-shell questions-editor-shell">
      <header className="questions-mobile-header">
        <button type="button" className="questions-text-button" onClick={onExit}>
          Выйти
        </button>
        <QuestionBrand eyebrow={`Отвечает ${ownName}`} />
        <button
          type="button"
          className="questions-add-button"
          onClick={onAddQuestion}
          disabled={!connected}
        >
          <span aria-hidden="true">＋</span> Добавить вопрос
        </button>
      </header>

      <section className="questions-editor-intro">
        <div>
          <span className="questions-kicker">Ваши ответы</span>
          <h1>Пишите первое, что приходит в голову</h1>
          <p>Всё, что вы вводите, сразу появляется на экране у гостей.</p>
        </div>
        <ConnectionStatus connected={connected} />
      </section>

      {error && <div className="questions-error">{error}</div>}

      <section className="questions-editor-list" aria-live="polite">
        {state.questions.length === 0 ? (
          <div className="questions-empty-state">
            <span className="questions-empty-heart" aria-hidden="true">
              ♥
            </span>
            <h2>Пока нет вопросов</h2>
            <p>Когда прозвучит первый вопрос, нажмите «Добавить вопрос».</p>
            <button type="button" onClick={onAddQuestion} disabled={!connected}>
              Добавить вопрос 01
            </button>
          </div>
        ) : (
          state.questions.map((question) => (
            <article className="questions-editor-card" key={question.id}>
              <div className="questions-card-number">
                Вопрос {formatQuestionNumber(question.number)}
              </div>
              <label className="questions-answer-field">
                <span>{ownVariantLabel}</span>
                <textarea
                  value={drafts[`${question.id}:ownAnswer`] ?? question.ownAnswer}
                  maxLength={240}
                  rows={2}
                  placeholder="Начните печатать…"
                  onChange={(event) => update(question.id, "ownAnswer", event.target.value)}
                  onBlur={() => onFlush(question.id, "ownAnswer")}
                />
              </label>
              <label className="questions-answer-field questions-guess-field">
                <span>{partnerVariantLabel}</span>
                <textarea
                  value={drafts[`${question.id}:partnerGuess`] ?? question.partnerGuess}
                  maxLength={240}
                  rows={2}
                  placeholder={`Как вам кажется, что напишет ${partnerName}?`}
                  onChange={(event) => update(question.id, "partnerGuess", event.target.value)}
                  onBlur={() => onFlush(question.id, "partnerGuess")}
                />
              </label>
              <div className="questions-save-note">{saveNote(question.id)}</div>
            </article>
          ))
        )}
      </section>
    </main>
  );
}

function ObserverValue({ value, label }: { value: string; label: string }) {
  return (
    <div className={`questions-observer-value ${value ? "has-value" : "is-empty"}`}>
      <span>{label}</span>
      <strong>{value || "Ждём ответ"}</strong>
    </div>
  );
}

export function isNearPageBottom({
  scrollY,
  viewportHeight,
  documentHeight,
  threshold = 180,
}: {
  scrollY: number;
  viewportHeight: number;
  documentHeight: number;
  threshold?: number;
}): boolean {
  return scrollY + viewportHeight >= documentHeight - threshold;
}

export function QuestionsObserverScreen({
  state,
  connected,
  error,
  onExit,
}: {
  state: QuestionsObserverState;
  connected: boolean;
  error: string | null;
  onExit?: () => void;
}) {
  const newestQuestionId = state.questions.at(-1)?.id;
  const newestCardRef = useRef<HTMLElement | null>(null);
  const previousQuestionCount = useRef(state.questions.length);
  const wasNearBottom = useRef(true);

  useEffect(() => {
    const updateScrollPosition = () => {
      wasNearBottom.current = isNearPageBottom({
        scrollY: window.scrollY,
        viewportHeight: window.innerHeight,
        documentHeight: document.documentElement.scrollHeight,
      });
    };
    updateScrollPosition();
    window.addEventListener("scroll", updateScrollPosition, { passive: true });
    return () => window.removeEventListener("scroll", updateScrollPosition);
  }, []);

  useEffect(() => {
    if (state.questions.length > previousQuestionCount.current && wasNearBottom.current) {
      newestCardRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
    previousQuestionCount.current = state.questions.length;
  }, [state.questions.length]);

  return (
    <main className="questions-shell questions-observer-shell">
      <div className="questions-observer-topbar">
        <QuestionBrand eyebrow="Гостевой интерфейс · вопросы" />
        <div className="questions-observer-status">
          <ConnectionStatus connected={connected} />
          {onExit && (
            <button type="button" className="questions-text-button" onClick={onExit}>
              Сменить роль
            </button>
          )}
        </div>
      </div>

      <section className="questions-observer-hero">
        <span className="questions-kicker">Кто кого лучше знает</span>
        <h1>Ответы без секретов</h1>
        <p>Следим за мыслями молодожёнов в прямом эфире.</p>
      </section>

      {error && <div className="questions-error">{error}</div>}

      {state.questions.length === 0 ? (
        <section className="questions-observer-empty">
          <span aria-hidden="true">♥</span>
          <h2>Ждём первый вопрос</h2>
          <p>Ответы Даниила и Шаши появятся здесь прямо во время набора.</p>
        </section>
      ) : (
        <section className="questions-observer-grid" aria-live="polite">
          {state.questions.map((question) => (
            <article
              className={`questions-observer-card ${question.id === newestQuestionId ? "is-newest" : ""}`}
              key={question.id}
              ref={question.id === newestQuestionId ? newestCardRef : undefined}
            >
              <header>
                <span>Вопрос {formatQuestionNumber(question.number)}</span>
                {question.id === newestQuestionId && <small>Новый вопрос</small>}
              </header>
              <div className="questions-couple-columns">
                <section className="questions-person-column">
                  <h2>Даниил</h2>
                  <ObserverValue value={question.daniil.ownAnswer} label="Вариант ДанИИла" />
                  <ObserverValue value={question.daniil.partnerGuess} label="Вариант Шаши" />
                </section>
                <div className="questions-column-heart" aria-hidden="true">
                  ♥
                </div>
                <section className="questions-person-column">
                  <h2>Шаша</h2>
                  <ObserverValue value={question.shasha.ownAnswer} label="Вариант Шаши" />
                  <ObserverValue value={question.shasha.partnerGuess} label="Вариант ДанИИла" />
                </section>
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}

function QuestionsLoading({ onExit }: { onExit: () => void }) {
  return (
    <main className="questions-shell questions-loading-shell">
      <QuestionBrand eyebrow="Подключаем экран" />
      <div className="questions-loading-heart" aria-hidden="true">
        ♥
      </div>
      <h1>Секунду…</h1>
      <p>Получаем последние ответы.</p>
      <button type="button" className="questions-text-button" onClick={onExit}>
        Вернуться к выбору роли
      </button>
    </main>
  );
}

export function QuestionsApp() {
  const {
    role,
    connected,
    editorState,
    observerState,
    error,
    saveStatuses,
    selectRole,
    exitRole,
    addQuestion,
    updateAnswer,
    flushAnswer,
  } = useQuestions();

  const activeScreen = useMemo(() => {
    if (!role) return <QuestionsRolePicker connected={connected} onSelect={selectRole} />;
    if (role === "observer" && observerState) {
      return (
        <QuestionsObserverScreen
          state={observerState}
          connected={connected}
          error={error}
          onExit={exitRole}
        />
      );
    }
    if (role !== "observer" && editorState) {
      return (
        <QuestionsEditorScreen
          state={editorState}
          connected={connected}
          error={error}
          onExit={exitRole}
          onAddQuestion={addQuestion}
          onUpdate={updateAnswer}
          onFlush={flushAnswer}
          saveStatuses={saveStatuses}
        />
      );
    }
    return <QuestionsLoading onExit={exitRole} />;
  }, [
    role,
    connected,
    editorState,
    observerState,
    error,
    saveStatuses,
    selectRole,
    exitRole,
    addQuestion,
    updateAnswer,
    flushAnswer,
  ]);

  return activeScreen;
}
