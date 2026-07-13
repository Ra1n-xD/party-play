import { useMemo, useState } from "react";
import type { GuestWeddingState, WeddingParticipantSummary } from "../../../shared/types";
import { useWedding } from "./WeddingContext";
import { WeddingBrand } from "./WeddingBrand";

const OPTION_LABELS = {
  letters: ["А", "Б", "В", "Г"],
  numbers: ["1", "2", "3", "4"],
} as const;

interface GuestWeddingScreenProps {
  roomExists: boolean;
  state: GuestWeddingState | null;
  participants: WeddingParticipantSummary[];
  connected: boolean;
  error: string | null;
  onJoinNew: (name: string) => void;
  onRejoin: (participantId: string, name: string) => void;
  onAnswer: (optionIndex: number) => void;
}

function GuestShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="wedding-page wedding-guest-page">
      <div className="wedding-phone-card">
        <WeddingBrand />
        {children}
      </div>
    </main>
  );
}

export function GuestWeddingScreen({
  roomExists,
  state,
  participants,
  connected,
  error,
  onJoinNew,
  onRejoin,
  onAnswer,
}: GuestWeddingScreenProps) {
  const [search, setSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const filteredParticipants = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("ru-RU");
    return participants.filter((participant) =>
      participant.name.toLocaleLowerCase("ru-RU").includes(query),
    );
  }, [participants, search]);

  if (!roomExists) {
    return (
      <GuestShell>
        <section className="wedding-centered-state">
          <span className="wedding-kicker">Свадебная викторина</span>
          <h1>Скоро начнём</h1>
          <p>Ведущий ещё не создал комнату. Оставьте страницу открытой.</p>
        </section>
      </GuestShell>
    );
  }

  if (!state) {
    return (
      <GuestShell>
        <section>
          <span className="wedding-kicker">С возвращением</span>
          <h1>Найдите своё имя</h1>
          <p className="wedding-helper">Если вы уже подключались, выберите себя из списка.</p>
          {!creating ? (
            <>
              <label className="wedding-field">
                <span>Поиск</span>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Начните вводить имя"
                />
              </label>
              <div className="wedding-name-list">
                {filteredParticipants.map((participant) => (
                  <button
                    type="button"
                    key={participant.id}
                    onClick={() => onRejoin(participant.id, participant.name)}
                  >
                    <span>{participant.name}</span>
                    <small>{participant.connected ? "онлайн" : "вернуться"}</small>
                  </button>
                ))}
              </div>
              <button
                className="wedding-button wedding-button-outline"
                type="button"
                onClick={() => setCreating(true)}
              >
                Я здесь впервые
              </button>
            </>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (newName.trim()) onJoinNew(newName.trim());
              }}
            >
              <label className="wedding-field">
                <span>Ваше имя</span>
                <input
                  value={newName}
                  maxLength={20}
                  autoFocus
                  onChange={(event) => setNewName(event.target.value)}
                  placeholder="Например, Вера"
                />
              </label>
              <button
                className="wedding-button wedding-button-primary"
                type="submit"
                disabled={!newName.trim() || !connected}
              >
                Подключиться
              </button>
              <button
                className="wedding-button wedding-button-text"
                type="button"
                onClick={() => setCreating(false)}
              >
                Назад к списку
              </button>
            </form>
          )}
          {error && <p className="wedding-error" role="alert">{error}</p>}
        </section>
      </GuestShell>
    );
  }

  if (state.phase === "FINISHED") {
    return (
      <GuestShell>
        <section className="wedding-centered-state">
          <span className="wedding-big-heart" aria-hidden="true">♥</span>
          <span className="wedding-kicker">ДанИИл и Шаша</span>
          <h1>Спасибо за игру!</h1>
          <p>Правильные ответы и победителей объявит ведущий.</p>
        </section>
      </GuestShell>
    );
  }

  if (state.phase === "PREPARING") {
    return (
      <GuestShell>
        <section className="wedding-centered-state">
          <span className="wedding-kicker">{state.participantName}</span>
          <h1>Ждём следующий вопрос</h1>
          <div className="wedding-wait-card">
            <span className="wedding-big-heart" aria-hidden="true">♥</span>
            <strong>Смотрите на проектор</strong>
            <p>Кнопки появятся после сигнала ведущего.</p>
          </div>
        </section>
      </GuestShell>
    );
  }

  const optionStyle = state.optionStyle ?? "letters";
  const labels = OPTION_LABELS[optionStyle];
  return (
    <GuestShell>
      <section>
        <div className="wedding-question-meta">
          <span className="wedding-kicker">Вопрос {String(state.questionNumber).padStart(2, "0")}</span>
          <span>{state.participantName}</span>
        </div>
        <h1>Выберите ответ</h1>
        <p className="wedding-helper">Вопрос и варианты показаны на проекторе.</p>
        <div className="wedding-answer-grid">
          {labels.map((label, index) => (
            <button
              className="wedding-answer-button"
              type="button"
              key={label}
              disabled={state.hasAnswered || !connected}
              aria-pressed={state.selectedOption === index}
              onClick={() => onAnswer(index)}
            >
              {label}
            </button>
          ))}
        </div>
        {state.hasAnswered && (
          <div className="wedding-accepted" role="status">
            <span aria-hidden="true">✓</span>
            <div>
              <strong>Ответ принят</strong>
              <small>Изменить выбор уже нельзя</small>
            </div>
          </div>
        )}
        {!connected && <p className="wedding-error">Восстанавливаем соединение…</p>}
        {error && <p className="wedding-error" role="alert">{error}</p>}
      </section>
    </GuestShell>
  );
}

export function GuestWeddingApp() {
  const wedding = useWedding();
  return (
    <GuestWeddingScreen
      roomExists={wedding.roomExists}
      state={wedding.guestState}
      participants={wedding.participants}
      connected={wedding.connected}
      error={wedding.error}
      onJoinNew={wedding.joinNew}
      onRejoin={wedding.rejoin}
      onAnswer={wedding.answer}
    />
  );
}
