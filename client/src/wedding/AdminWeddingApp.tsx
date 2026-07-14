import { useMemo, useState } from "react";
import type { HostWeddingState, WeddingOptionStyle } from "../../../shared/types";
import { useWedding } from "./WeddingContext";
import { WeddingBrand } from "./WeddingBrand";
import { WeddingConfirmDialog } from "./WeddingConfirmDialog";

const OPTION_LABELS = {
  letters: ["А", "Б", "В", "Г"],
  latin: ["A", "B", "C", "D"],
  numbers: ["1", "2", "3", "4"],
} as const;

export interface AdminWeddingActions {
  createRoom: () => void;
  setDraft: (optionStyle: WeddingOptionStyle, correctOption: number | null) => void;
  startQuestion: () => void;
  prepareNextQuestion: () => void;
  adjustScore: (participantId: string, delta: -1 | 1) => void;
  finishContest: () => void;
  restartContest: () => void;
}

interface AdminWeddingScreenProps {
  roomExists: boolean;
  state: HostWeddingState | null;
  connected: boolean;
  error: string | null;
  actions: AdminWeddingActions;
}

type ConfirmationKind = "next" | "start" | "finish" | "restart" | null;

function remainingHours(expiresAt: number): number {
  return Math.max(0, Math.ceil((expiresAt - Date.now()) / (60 * 60 * 1_000)));
}

function formatAnswerTime(value: number): string {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(value);
}

function WeddingAnswerFeed({ state, title }: { state: HostWeddingState; title: string }) {
  return (
    <>
      <div className="wedding-section-heading">
        <h2>{title}</h2>
        <span>{state.answers.length} получено</span>
      </div>
      <div className="wedding-answer-feed">
        {state.answers.length === 0 && <p className="wedding-empty-copy">Пока никто не ответил</p>}
        {state.answers.map((answer) => {
          const participant = state.participants.find((item) => item.id === answer.participantId);
          const answerLabel = OPTION_LABELS[answer.optionStyle][answer.optionIndex];
          return (
            <div
              className={`wedding-answer-row${answer.firstCorrect ? " wedding-first-correct" : ""}`}
              key={`${state.questionNumber}-${answer.sequence}`}
            >
              <span className="wedding-sequence">{String(answer.sequence).padStart(2, "0")}</span>
              <strong>
                {answer.participantName}
                <small>
                  {answer.firstCorrect ? "первый верный · " : ""}верных:{" "}
                  {participant?.correctAnswers ?? 0}
                </small>
              </strong>
              <span className="wedding-answer-chip">{answerLabel}</span>
              <time dateTime={new Date(answer.submittedAt).toISOString()}>
                {formatAnswerTime(answer.submittedAt)}
              </time>
            </div>
          );
        })}
      </div>
    </>
  );
}

export function AdminWeddingScreen({
  roomExists,
  state,
  connected,
  error,
  actions,
}: AdminWeddingScreenProps) {
  const [tab, setTab] = useState<"question" | "scores">("question");
  const [confirmation, setConfirmation] = useState<ConfirmationKind>(null);
  const sortedParticipants = useMemo(
    () =>
      [...(state?.participants ?? [])].sort(
        (left, right) =>
          right.correctAnswers - left.correctAnswers || left.name.localeCompare(right.name, "ru"),
      ),
    [state?.participants],
  );

  const confirmAction = () => {
    if (confirmation === "next") actions.prepareNextQuestion();
    if (confirmation === "start") actions.startQuestion();
    if (confirmation === "finish") actions.finishContest();
    if (confirmation === "restart") {
      setTab("question");
      actions.restartContest();
    }
    setConfirmation(null);
  };

  const confirmationCopy = {
    next: {
      title: `Перейти к вопросу ${(state?.questionNumber ?? 0) + 1}?`,
      description: "Текущий вопрос закроется, а гости увидят экран ожидания.",
      label: "Да, перейти дальше",
      destructive: false,
    },
    start: {
      title: `Начать вопрос ${(state?.questionNumber ?? 0) + 1}?`,
      description: "У всех подключённых гостей одновременно появятся четыре варианта ответа.",
      label: "Да, начать вопрос",
      destructive: false,
    },
    finish: {
      title: "Закончить конкурс?",
      description: "Конкурс будет завершён. Гости больше не смогут отправлять ответы.",
      label: "Да, закончить конкурс",
      destructive: true,
    },
    restart: {
      title: "Начать новый конкурс?",
      description:
        "Все участники, очки и ответы будут удалены. Гостям потребуется подключиться заново.",
      label: "Да, начать новый конкурс",
      destructive: true,
    },
  } as const;
  const activeConfirmation = confirmation ? confirmationCopy[confirmation] : null;

  if (!roomExists) {
    return (
      <main className="wedding-page wedding-admin-page">
        <div className="wedding-admin-shell wedding-admin-empty">
          <WeddingBrand />
          <span className="wedding-kicker">Панель ведущего</span>
          <h1>Свадебная викторина</h1>
          <p>Создайте единственную комнату. Она будет храниться четыре дня.</p>
          <button
            className="wedding-button wedding-button-primary"
            type="button"
            disabled={!connected}
            onClick={actions.createRoom}
          >
            Создать комнату
          </button>
          {error && (
            <p className="wedding-error" role="alert">
              {error}
            </p>
          )}
        </div>
      </main>
    );
  }

  if (!state) {
    return (
      <main className="wedding-page wedding-admin-page">
        <div className="wedding-admin-shell wedding-admin-empty">
          <WeddingBrand />
          <p>Загружаем состояние комнаты…</p>
        </div>
      </main>
    );
  }

  const labels = OPTION_LABELS[state.optionStyle];
  return (
    <main className="wedding-page wedding-admin-page">
      <div className="wedding-admin-shell">
        <header className="wedding-admin-header">
          <WeddingBrand />
          <div>
            <span className={`wedding-status wedding-status-${state.phase.toLowerCase()}`}>
              {state.phase === "OPEN"
                ? "Ответы открыты"
                : state.phase === "PREPARING"
                  ? "Подготовка"
                  : "Завершено"}
            </span>
            <span className="wedding-online-status">
              {connected ? "соединение активно" : "переподключение…"}
            </span>
          </div>
        </header>

        <nav className="wedding-admin-tabs" aria-label="Разделы панели ведущего">
          <button
            type="button"
            aria-selected={tab === "question"}
            onClick={() => setTab("question")}
          >
            Текущий вопрос
          </button>
          <button type="button" aria-selected={tab === "scores"} onClick={() => setTab("scores")}>
            Счёт участников
          </button>
        </nav>

        <div className="wedding-room-life">
          <span>Единая комната</span>
          <strong>ещё {remainingHours(state.expiresAt)} ч</strong>
        </div>

        {tab === "question" ? (
          <section>
            {state.phase === "PREPARING" && (
              <>
                <span className="wedding-kicker">Гости находятся в режиме ожидания</span>
                <h1>Подготовка вопроса {String(state.questionNumber + 1).padStart(2, "0")}</h1>
                <p className="wedding-helper">
                  Спокойно выберите формат и правильный ответ. До запуска гости не увидят кнопки.
                </p>
                <div className="wedding-admin-panel">
                  <span className="wedding-panel-label">Формат вариантов</span>
                  <div className="wedding-option-mode">
                    <button
                      type="button"
                      aria-pressed={state.optionStyle === "letters"}
                      onClick={() => actions.setDraft("letters", state.correctOption)}
                    >
                      А · Б · В · Г
                    </button>
                    <button
                      type="button"
                      aria-pressed={state.optionStyle === "latin"}
                      onClick={() => actions.setDraft("latin", state.correctOption)}
                    >
                      A · B · C · D
                    </button>
                    <button
                      type="button"
                      aria-pressed={state.optionStyle === "numbers"}
                      onClick={() => actions.setDraft("numbers", state.correctOption)}
                    >
                      1 · 2 · 3 · 4
                    </button>
                  </div>
                  <span className="wedding-panel-label">Правильный ответ</span>
                  <div className="wedding-correct-options">
                    {labels.map((label, index) => (
                      <button
                        type="button"
                        key={label}
                        aria-pressed={state.correctOption === index}
                        onClick={() => actions.setDraft(state.optionStyle, index)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                {state.correctOption === null ? (
                  <p className="wedding-choice-required">Сначала выберите правильный ответ</p>
                ) : (
                  <button
                    className="wedding-button wedding-button-primary"
                    type="button"
                    disabled={!connected}
                    onClick={() => setConfirmation("start")}
                  >
                    Начать вопрос {String(state.questionNumber + 1).padStart(2, "0")}
                  </button>
                )}
                {state.answers.length > 0 && (
                  <WeddingAnswerFeed
                    state={state}
                    title={`Ответы вопроса ${String(state.questionNumber).padStart(2, "0")}`}
                  />
                )}
              </>
            )}

            {state.phase === "OPEN" && (
              <>
                <span className="wedding-kicker">Гости отвечают с телефонов</span>
                <h1>Вопрос {String(state.questionNumber).padStart(2, "0")}</h1>
                <div className="wedding-stat-grid">
                  <div>
                    <span>Подключено</span>
                    <strong>{state.connectedCount}</strong>
                  </div>
                  <div>
                    <span>Ответили</span>
                    <strong>{state.answeredCount}</strong>
                  </div>
                </div>
                <WeddingAnswerFeed state={state} title="Ответы по порядку" />
                <button
                  className="wedding-button wedding-button-primary"
                  type="button"
                  disabled={!connected}
                  onClick={() => setConfirmation("next")}
                >
                  Следующий вопрос →
                </button>
              </>
            )}

            {state.phase === "FINISHED" && (
              <div className="wedding-finished-card">
                <span className="wedding-big-heart" aria-hidden="true">
                  ♥
                </span>
                <span className="wedding-kicker">ДанИИл и Шаша</span>
                <h1>Конкурс завершён</h1>
                <p>Перейдите во вкладку со счётом, чтобы объявить победителей.</p>
                <button
                  className="wedding-button wedding-button-outline"
                  type="button"
                  onClick={() => setTab("scores")}
                >
                  Показать итоговый счёт
                </button>
                <button
                  className="wedding-button wedding-button-danger"
                  type="button"
                  disabled={!connected}
                  onClick={() => setConfirmation("restart")}
                >
                  Начать новый конкурс
                </button>
              </div>
            )}
          </section>
        ) : (
          <section>
            <span className="wedding-kicker">
              {state.phase === "FINISHED"
                ? "Итоги конкурса"
                : `После ${state.questionNumber} вопросов`}
            </span>
            <h1>Правильные ответы</h1>
            <p className="wedding-helper">
              Счёт обновляется автоматически. Кнопками можно исправить ошибку.
            </p>
            <div className="wedding-score-list">
              {sortedParticipants.map((participant, index) => (
                <div className="wedding-score-row" key={participant.id}>
                  <span className="wedding-rank">{index + 1}</span>
                  <strong>
                    {participant.name}
                    <small>{participant.connected ? "онлайн" : "не в сети"}</small>
                  </strong>
                  <div className="wedding-score-stepper">
                    <button
                      type="button"
                      aria-label={`Уменьшить счёт ${participant.name}`}
                      disabled={participant.correctAnswers === 0 || !connected}
                      onClick={() => actions.adjustScore(participant.id, -1)}
                    >
                      −
                    </button>
                    <output aria-label={`Правильных ответов у ${participant.name}`}>
                      {participant.correctAnswers}
                    </output>
                    <button
                      type="button"
                      aria-label={`Увеличить счёт ${participant.name}`}
                      disabled={!connected}
                      onClick={() => actions.adjustScore(participant.id, 1)}
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {state.phase === "FINISHED" && (
              <button
                className="wedding-button wedding-button-danger wedding-end-button"
                type="button"
                disabled={!connected}
                onClick={() => setConfirmation("restart")}
              >
                Начать новый конкурс
              </button>
            )}
          </section>
        )}

        {state.phase !== "FINISHED" && (
          <button
            className="wedding-button wedding-button-danger wedding-end-button"
            type="button"
            disabled={!connected}
            onClick={() => setConfirmation("finish")}
          >
            Закончить конкурс
          </button>
        )}
        {error && (
          <p className="wedding-error" role="alert">
            {error}
          </p>
        )}
      </div>

      <WeddingConfirmDialog
        open={activeConfirmation !== null}
        title={activeConfirmation?.title ?? ""}
        description={activeConfirmation?.description ?? ""}
        confirmLabel={activeConfirmation?.label ?? ""}
        destructive={activeConfirmation?.destructive}
        onCancel={() => setConfirmation(null)}
        onConfirm={confirmAction}
      />
    </main>
  );
}

export function AdminWeddingApp() {
  const wedding = useWedding();
  return (
    <AdminWeddingScreen
      roomExists={wedding.roomExists}
      state={wedding.hostState}
      connected={wedding.connected}
      error={wedding.error}
      actions={{
        createRoom: wedding.createRoom,
        setDraft: wedding.setDraft,
        startQuestion: wedding.startQuestion,
        prepareNextQuestion: wedding.prepareNextQuestion,
        adjustScore: wedding.adjustScore,
        finishContest: wedding.finishContest,
        restartContest: wedding.restartContest,
      }}
    />
  );
}
