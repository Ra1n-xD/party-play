import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type {
  QuestionsAnswerField,
  QuestionsEditorRole,
  QuestionsEditorState,
  QuestionsObserverQuestion,
  QuestionsObserverState,
  QuestionsParticipantAnswers,
} from "../../../shared/types.js";

export const QUESTIONS_ANSWER_MAX_LENGTH = 240;

interface QuestionsQuestionRecord extends QuestionsObserverQuestion {}

export interface QuestionsSessionSnapshot {
  version: 1;
  questions: QuestionsQuestionRecord[];
}

export interface QuestionsSessionStore {
  load(): QuestionsSessionSnapshot | null;
  save(snapshot: QuestionsSessionSnapshot): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isAnswers(value: unknown): value is QuestionsParticipantAnswers {
  return (
    isRecord(value) &&
    typeof value.ownAnswer === "string" &&
    value.ownAnswer.length <= QUESTIONS_ANSWER_MAX_LENGTH &&
    typeof value.partnerGuess === "string" &&
    value.partnerGuess.length <= QUESTIONS_ANSWER_MAX_LENGTH &&
    isTimestamp(value.updatedAt)
  );
}

function isQuestion(value: unknown, expectedIndex: number): value is QuestionsQuestionRecord {
  return (
    isRecord(value) &&
    Number.isInteger(value.id) &&
    value.id === expectedIndex + 1 &&
    Number.isInteger(value.number) &&
    value.number === expectedIndex + 1 &&
    isTimestamp(value.createdAt) &&
    isAnswers(value.daniil) &&
    isAnswers(value.shasha)
  );
}

function isSnapshot(value: unknown): value is QuestionsSessionSnapshot {
  return (
    isRecord(value) &&
    value.version === 1 &&
    Array.isArray(value.questions) &&
    value.questions.every((question, index) => isQuestion(question, index))
  );
}

export class FileQuestionsSessionStore implements QuestionsSessionStore {
  constructor(private readonly filePath: string) {}

  load(): QuestionsSessionSnapshot | null {
    if (!existsSync(this.filePath)) return null;
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.filePath, "utf8"));
      return isSnapshot(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  save(snapshot: QuestionsSessionSnapshot): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    writeFileSync(temporaryPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
    renameSync(temporaryPath, this.filePath);
  }
}

function emptyAnswers(createdAt: number): QuestionsParticipantAnswers {
  return { ownAnswer: "", partnerGuess: "", updatedAt: createdAt };
}

function assertEditorRole(role: string): asserts role is QuestionsEditorRole {
  if (role !== "daniil" && role !== "shasha") {
    throw new Error("Неизвестная роль участника");
  }
}

function assertField(field: string): asserts field is QuestionsAnswerField {
  if (field !== "ownAnswer" && field !== "partnerGuess") {
    throw new Error("Неизвестное поле ответа");
  }
}

export class QuestionsSessionService {
  private snapshot: QuestionsSessionSnapshot;

  constructor(
    private readonly store: QuestionsSessionStore,
    private readonly now: () => number = Date.now,
    private readonly logError: (message: string, error: unknown) => void = console.error,
  ) {
    this.snapshot = store.load() ?? { version: 1, questions: [] };
  }

  getEditorState(role: QuestionsEditorRole): QuestionsEditorState {
    assertEditorRole(role);
    return {
      role,
      questions: this.snapshot.questions.map((question) => ({
        id: question.id,
        number: question.number,
        ownAnswer: question[role].ownAnswer,
        partnerGuess: question[role].partnerGuess,
        updatedAt: question[role].updatedAt,
      })),
    };
  }

  getObserverState(): QuestionsObserverState {
    return structuredClone({ questions: this.snapshot.questions });
  }

  addQuestion(): QuestionsObserverState {
    return this.mutate((snapshot) => {
      const number = snapshot.questions.length + 1;
      const createdAt = this.now();
      snapshot.questions.push({
        id: number,
        number,
        createdAt,
        daniil: emptyAnswers(createdAt),
        shasha: emptyAnswers(createdAt),
      });
      return this.getObserverStateFrom(snapshot);
    });
  }

  deleteLatestQuestion(): QuestionsObserverState {
    if (this.snapshot.questions.length === 0) {
      throw new Error("Нет вопросов для удаления");
    }
    return this.mutate((snapshot) => {
      snapshot.questions.pop();
      return this.getObserverStateFrom(snapshot);
    });
  }

  updateAnswer(
    role: QuestionsEditorRole,
    questionId: number,
    field: QuestionsAnswerField,
    value: string,
  ): QuestionsObserverState {
    assertEditorRole(role);
    assertField(field);
    if (!Number.isInteger(questionId) || questionId < 1) {
      throw new Error("Вопрос не найден");
    }
    if (typeof value !== "string" || value.length > QUESTIONS_ANSWER_MAX_LENGTH) {
      throw new Error(`Ответ должен быть не длиннее ${QUESTIONS_ANSWER_MAX_LENGTH} символов`);
    }
    const question = this.snapshot.questions.find((item) => item.id === questionId);
    if (!question) throw new Error("Вопрос не найден");

    return this.mutate((snapshot) => {
      const target = snapshot.questions.find((item) => item.id === questionId)!;
      target[role][field] = value;
      target[role].updatedAt = this.now();
      return this.getObserverStateFrom(snapshot);
    });
  }

  private getObserverStateFrom(snapshot: QuestionsSessionSnapshot): QuestionsObserverState {
    return structuredClone({ questions: snapshot.questions });
  }

  private mutate<Result>(mutation: (snapshot: QuestionsSessionSnapshot) => Result): Result {
    const previous = structuredClone(this.snapshot);
    let result: Result;
    try {
      result = mutation(this.snapshot);
    } catch (error) {
      this.snapshot = previous;
      throw error;
    }
    try {
      this.store.save(this.snapshot);
    } catch (error) {
      this.snapshot = previous;
      this.logError("Questions session persistence failed", error);
      throw new Error("Не удалось сохранить изменения. Попробуйте ещё раз");
    }
    return result;
  }
}
