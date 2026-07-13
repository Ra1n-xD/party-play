import type { QuestionsAnswerField, QuestionsEditorState } from "../../../shared/types";

export type QuestionsSaveStatus = "saving" | "saved" | "offline";

export interface QuestionsPendingUpdate {
  questionId: number;
  field: QuestionsAnswerField;
  value: string;
}

interface PendingEntry {
  update: QuestionsPendingUpdate;
  timer: unknown | null;
}

interface QuestionsUpdateQueueOptions {
  send: (update: QuestionsPendingUpdate) => void;
  onStatus: (key: string, status: QuestionsSaveStatus) => void;
  delayMs?: number;
  setTimer?: (callback: () => void, delayMs: number) => unknown;
  clearTimer?: (timer: unknown) => void;
}

export function questionsUpdateKey(questionId: number, field: QuestionsAnswerField): string {
  return `${questionId}:${field}`;
}

export class QuestionsUpdateQueue {
  private readonly pending = new Map<string, PendingEntry>();
  private readonly delayMs: number;
  private readonly setTimer: (callback: () => void, delayMs: number) => unknown;
  private readonly clearTimer: (timer: unknown) => void;

  constructor(private readonly options: QuestionsUpdateQueueOptions) {
    this.delayMs = options.delayMs ?? 80;
    this.setTimer =
      options.setTimer ?? ((callback, delayMs) => window.setTimeout(callback, delayMs));
    this.clearTimer = options.clearTimer ?? ((timer) => window.clearTimeout(timer as number));
  }

  enqueue(update: QuestionsPendingUpdate, connected: boolean): void {
    const key = questionsUpdateKey(update.questionId, update.field);
    const existing = this.pending.get(key);
    if (existing?.timer !== null && existing?.timer !== undefined) {
      this.clearTimer(existing.timer);
    }
    const entry: PendingEntry = { update, timer: null };
    this.pending.set(key, entry);
    this.options.onStatus(key, connected ? "saving" : "offline");
    if (!connected) return;
    entry.timer = this.setTimer(() => {
      entry.timer = null;
      this.options.send(entry.update);
    }, this.delayMs);
  }

  flush(questionId: number, field: QuestionsAnswerField, connected: boolean): void {
    const key = questionsUpdateKey(questionId, field);
    const entry = this.pending.get(key);
    if (!entry) return;
    if (!connected) {
      this.options.onStatus(key, "offline");
      return;
    }
    if (entry.timer !== null) this.clearTimer(entry.timer);
    entry.timer = null;
    this.options.onStatus(key, "saving");
    this.options.send(entry.update);
  }

  acknowledge(state: QuestionsEditorState): void {
    for (const [key, entry] of this.pending) {
      const question = state.questions.find((item) => item.id === entry.update.questionId);
      if (!question) {
        if (entry.timer !== null) this.clearTimer(entry.timer);
        this.pending.delete(key);
        continue;
      }
      if (question[entry.update.field] !== entry.update.value) continue;
      if (entry.timer !== null) this.clearTimer(entry.timer);
      this.pending.delete(key);
      this.options.onStatus(key, "saved");
    }
  }

  disconnect(): void {
    for (const [key, entry] of this.pending) {
      if (entry.timer !== null) this.clearTimer(entry.timer);
      entry.timer = null;
      this.options.onStatus(key, "offline");
    }
  }

  reconnect(): void {
    for (const [key, entry] of this.pending) {
      if (entry.timer !== null) this.clearTimer(entry.timer);
      entry.timer = null;
      this.options.onStatus(key, "saving");
      this.options.send(entry.update);
    }
  }

  clear(): void {
    for (const entry of this.pending.values()) {
      if (entry.timer !== null) this.clearTimer(entry.timer);
    }
    this.pending.clear();
  }
}
