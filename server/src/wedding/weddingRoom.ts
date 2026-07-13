import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type {
  GuestWeddingState,
  HostWeddingState,
  WeddingHostAnswer,
  WeddingOptionStyle,
  WeddingParticipantSummary,
  WeddingPhase,
} from "../../../shared/types.js";

export const WEDDING_ROOM_TTL_MS = 96 * 60 * 60 * 1_000;
const MAX_NAME_LENGTH = 20;

interface WeddingParticipantRecord {
  id: string;
  name: string;
  normalizedName: string;
  connected: boolean;
  socketId: string | null;
  correctAnswers: number;
  answerOption: number | null;
  answerSubmittedAt: number | null;
}

interface WeddingAnswerRecord {
  sequence: number;
  participantId: string;
  optionIndex: number;
  optionStyle: WeddingOptionStyle;
  submittedAt: number;
  firstCorrect: boolean;
}

export interface WeddingRoomSnapshot {
  version: 1;
  createdAt: number;
  expiresAt: number;
  phase: WeddingPhase;
  questionNumber: number;
  optionStyle: WeddingOptionStyle;
  correctOption: number | null;
  participants: WeddingParticipantRecord[];
  answers: WeddingAnswerRecord[];
}

export interface WeddingRoomStore {
  load(): WeddingRoomSnapshot | null;
  save(room: WeddingRoomSnapshot): void;
  remove(): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isOptionIndex(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 3;
}

function isParticipantRecord(value: unknown): value is WeddingParticipantRecord {
  if (!isRecord(value)) return false;
  const answerOptionIsValid = value.answerOption === null || isOptionIndex(value.answerOption);
  const answerTimeIsValid =
    value.answerSubmittedAt === null ||
    (typeof value.answerSubmittedAt === "number" && Number.isFinite(value.answerSubmittedAt));
  return (
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.name === "string" &&
    value.name.length > 0 &&
    value.name.length <= MAX_NAME_LENGTH &&
    typeof value.normalizedName === "string" &&
    value.normalizedName.length > 0 &&
    typeof value.connected === "boolean" &&
    (value.socketId === null || typeof value.socketId === "string") &&
    Number.isInteger(value.correctAnswers) &&
    Number(value.correctAnswers) >= 0 &&
    answerOptionIsValid &&
    answerTimeIsValid &&
    (value.answerOption === null) === (value.answerSubmittedAt === null)
  );
}

function isAnswerRecord(value: unknown): value is WeddingAnswerRecord {
  return (
    isRecord(value) &&
    Number.isInteger(value.sequence) &&
    Number(value.sequence) > 0 &&
    typeof value.participantId === "string" &&
    value.participantId.length > 0 &&
    isOptionIndex(value.optionIndex) &&
    (value.optionStyle === "letters" || value.optionStyle === "numbers") &&
    typeof value.submittedAt === "number" &&
    Number.isFinite(value.submittedAt) &&
    typeof value.firstCorrect === "boolean"
  );
}

function isSnapshot(value: unknown): value is WeddingRoomSnapshot {
  if (!value || typeof value !== "object") return false;
  const room = value as Partial<WeddingRoomSnapshot>;
  if (
    !(
      room.version === 1 &&
      typeof room.createdAt === "number" &&
      Number.isFinite(room.createdAt) &&
      typeof room.expiresAt === "number" &&
      Number.isFinite(room.expiresAt) &&
      room.expiresAt > room.createdAt &&
      (room.phase === "PREPARING" || room.phase === "OPEN" || room.phase === "FINISHED") &&
      Number.isInteger(room.questionNumber) &&
      Number(room.questionNumber) >= 0 &&
      (room.optionStyle === "letters" || room.optionStyle === "numbers") &&
      (room.correctOption === null || isOptionIndex(room.correctOption)) &&
      Array.isArray(room.participants) &&
      Array.isArray(room.answers)
    )
  ) {
    return false;
  }
  if (!room.participants.every(isParticipantRecord) || !room.answers.every(isAnswerRecord)) {
    return false;
  }
  if (room.phase === "OPEN" && room.correctOption === null) return false;
  const participantIds = new Set(room.participants.map((participant) => participant.id));
  const normalizedNames = new Set(
    room.participants.map((participant) => participant.normalizedName),
  );
  if (
    participantIds.size !== room.participants.length ||
    normalizedNames.size !== room.participants.length
  ) {
    return false;
  }
  return room.answers.every(
    (answer, index) => answer.sequence === index + 1 && participantIds.has(answer.participantId),
  );
}

export class FileWeddingRoomStore implements WeddingRoomStore {
  constructor(private readonly filePath: string) {}

  load(): WeddingRoomSnapshot | null {
    if (!existsSync(this.filePath)) return null;
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.filePath, "utf8"));
      if (!isSnapshot(parsed)) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  save(room: WeddingRoomSnapshot): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    writeFileSync(temporaryPath, `${JSON.stringify(room, null, 2)}\n`, "utf8");
    renameSync(temporaryPath, this.filePath);
  }

  remove(): void {
    rmSync(this.filePath, { force: true });
    rmSync(`${this.filePath}.tmp`, { force: true });
  }
}

export interface WeddingSeatBinding {
  participantId: string;
  participantName: string;
  replacedSocketId: string | null;
}

function sanitizeName(value: string): string {
  return value
    .replace(/[<>&"'`/\\]/g, "")
    .replace(/[\x00-\x1F\x7F]/g, "")
    .trim();
}

function normalizeName(value: string): string {
  return value.toLocaleLowerCase("ru-RU");
}

function validateOptionIndex(value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > 3) {
    throw new Error("Выберите один из четырёх вариантов");
  }
}

export class WeddingRoomService {
  private room: WeddingRoomSnapshot | null;

  constructor(
    private readonly store: WeddingRoomStore,
    private readonly now: () => number = Date.now,
    private readonly roomTtlMs: number = WEDDING_ROOM_TTL_MS,
  ) {
    this.room = store.load();
    if (this.room) {
      for (const participant of this.room.participants) {
        participant.connected = false;
        participant.socketId = null;
      }
    }
    this.expireIfNeeded();
  }

  createRoom(): HostWeddingState {
    this.expireIfNeeded();
    if (this.room) throw new Error("Свадебная комната уже создана");
    const createdAt = this.now();
    this.room = {
      version: 1,
      createdAt,
      expiresAt: createdAt + this.roomTtlMs,
      phase: "PREPARING",
      questionNumber: 0,
      optionStyle: "letters",
      correctOption: null,
      participants: [],
      answers: [],
    };
    try {
      this.store.save(this.room);
    } catch (error) {
      this.room = null;
      throw error;
    }
    return this.serializeHost(this.room);
  }

  getHostState(): HostWeddingState | null {
    this.expireIfNeeded();
    return this.room ? this.serializeHost(this.room) : null;
  }

  getExpirationDelay(): number | null {
    this.expireIfNeeded();
    return this.room ? Math.max(0, this.room.expiresAt - this.now()) : null;
  }

  getGuestState(participantId: string): GuestWeddingState | null {
    this.expireIfNeeded();
    if (!this.room) return null;
    const participant = this.room.participants.find((item) => item.id === participantId);
    if (!participant) return null;
    return {
      phase: this.room.phase,
      questionNumber: this.room.questionNumber,
      optionStyle: this.room.phase === "OPEN" ? this.room.optionStyle : null,
      expiresAt: this.room.expiresAt,
      participantId: participant.id,
      participantName: participant.name,
      hasAnswered: participant.answerOption !== null,
      selectedOption: participant.answerOption,
    };
  }

  listParticipants(): WeddingParticipantSummary[] {
    this.expireIfNeeded();
    return (
      this.room?.participants.map(({ id, name, connected }) => ({ id, name, connected })) ?? []
    );
  }

  joinNew(rawName: string, socketId: string): WeddingSeatBinding {
    const room = this.requireRoom();
    if (room.phase === "FINISHED") throw new Error("Конкурс уже завершён");
    const name = sanitizeName(rawName);
    if (!name || name.length > MAX_NAME_LENGTH) {
      throw new Error("Введите имя длиной до 20 символов");
    }
    const normalizedName = normalizeName(name);
    if (room.participants.some((participant) => participant.normalizedName === normalizedName)) {
      throw new Error("Участник с таким именем уже существует");
    }
    const participantId = `w_${randomBytes(12).toString("hex")}`;
    return this.mutate((draft) => {
      draft.participants.push({
        id: participantId,
        name,
        normalizedName,
        connected: true,
        socketId,
        correctAnswers: 0,
        answerOption: null,
        answerSubmittedAt: null,
      });
      return { participantId, participantName: name, replacedSocketId: null };
    });
  }

  rejoin(participantId: string, rawName: string, socketId: string): WeddingSeatBinding {
    const room = this.requireRoom();
    const normalizedName = normalizeName(sanitizeName(rawName));
    const participant = room.participants.find(
      (item) => item.id === participantId && item.normalizedName === normalizedName,
    );
    if (!participant) throw new Error("Участник не найден");
    const replacedSocketId =
      participant.socketId && participant.socketId !== socketId ? participant.socketId : null;
    return this.mutate((draft) => {
      const target = draft.participants.find((item) => item.id === participantId)!;
      target.connected = true;
      target.socketId = socketId;
      return {
        participantId: target.id,
        participantName: target.name,
        replacedSocketId,
      };
    });
  }

  disconnectSocket(socketId: string): boolean {
    const room = this.getRoom();
    const participant = room?.participants.find((item) => item.socketId === socketId);
    if (!participant) return false;
    return this.mutate((draft) => {
      const target = draft.participants.find((item) => item.id === participant.id)!;
      target.connected = false;
      target.socketId = null;
      return true;
    });
  }

  setDraft(optionStyle: WeddingOptionStyle, correctOption: number | null): HostWeddingState {
    const room = this.requireRoom();
    if (room.phase !== "PREPARING") throw new Error("Сначала завершите текущий вопрос");
    if (optionStyle !== "letters" && optionStyle !== "numbers") {
      throw new Error("Неизвестный формат вариантов");
    }
    if (correctOption !== null) validateOptionIndex(correctOption);
    return this.mutate((draft) => {
      draft.optionStyle = optionStyle;
      draft.correctOption = correctOption;
      return this.serializeHost(draft);
    });
  }

  startQuestion(): HostWeddingState {
    const room = this.requireRoom();
    if (room.phase !== "PREPARING") throw new Error("Вопрос уже открыт");
    if (room.correctOption === null) throw new Error("Сначала выберите правильный ответ");
    return this.mutate((draft) => {
      draft.phase = "OPEN";
      draft.questionNumber += 1;
      draft.answers = [];
      for (const participant of draft.participants) {
        participant.answerOption = null;
        participant.answerSubmittedAt = null;
      }
      return this.serializeHost(draft);
    });
  }

  prepareNextQuestion(): HostWeddingState {
    const room = this.requireRoom();
    if (room.phase !== "OPEN") throw new Error("Нет открытого вопроса");
    return this.mutate((draft) => {
      draft.phase = "PREPARING";
      draft.correctOption = null;
      return this.serializeHost(draft);
    });
  }

  submitAnswer(participantId: string, socketId: string, optionIndex: number): HostWeddingState {
    const room = this.requireRoom();
    if (room.phase !== "OPEN") throw new Error("Вопрос ещё не открыт");
    validateOptionIndex(optionIndex);
    const participant = room.participants.find((item) => item.id === participantId);
    if (!participant || participant.socketId !== socketId)
      throw new Error("Сессия участника устарела");
    if (participant.answerOption !== null) throw new Error("Ваш ответ уже принят");
    return this.mutate((draft) => {
      const target = draft.participants.find((item) => item.id === participantId)!;
      const isCorrect = optionIndex === draft.correctOption;
      const firstCorrect = isCorrect && !draft.answers.some((answer) => answer.firstCorrect);
      target.answerOption = optionIndex;
      target.answerSubmittedAt = this.now();
      if (isCorrect) target.correctAnswers += 1;
      draft.answers.push({
        sequence: draft.answers.length + 1,
        participantId,
        optionIndex,
        optionStyle: draft.optionStyle,
        submittedAt: target.answerSubmittedAt,
        firstCorrect,
      });
      return this.serializeHost(draft);
    });
  }

  adjustScore(participantId: string, delta: number): HostWeddingState {
    const room = this.requireRoom();
    if (delta !== -1 && delta !== 1) throw new Error("Недопустимое изменение счёта");
    const participant = room.participants.find((item) => item.id === participantId);
    if (!participant) throw new Error("Участник не найден");
    if (participant.correctAnswers + delta < 0) throw new Error("Счёт не может быть ниже нуля");
    return this.mutate((draft) => {
      draft.participants.find((item) => item.id === participantId)!.correctAnswers += delta;
      return this.serializeHost(draft);
    });
  }

  finishContest(): HostWeddingState {
    const room = this.requireRoom();
    if (room.phase === "FINISHED") throw new Error("Конкурс уже завершён");
    return this.mutate((draft) => {
      draft.phase = "FINISHED";
      return this.serializeHost(draft);
    });
  }

  private getRoom(): WeddingRoomSnapshot | null {
    this.expireIfNeeded();
    return this.room;
  }

  private requireRoom(): WeddingRoomSnapshot {
    const room = this.getRoom();
    if (!room) throw new Error("Свадебная комната ещё не создана");
    return room;
  }

  private expireIfNeeded(): void {
    if (!this.room || this.now() < this.room.expiresAt) return;
    this.room = null;
    this.store.remove();
  }

  private mutate<Result>(mutation: (room: WeddingRoomSnapshot) => Result): Result {
    const room = this.requireRoom();
    const previous = structuredClone(room);
    try {
      const result = mutation(room);
      this.store.save(room);
      return result;
    } catch (error) {
      this.room = previous;
      throw error;
    }
  }

  private serializeHost(room: WeddingRoomSnapshot): HostWeddingState {
    const names = new Map(
      room.participants.map((participant) => [participant.id, participant.name]),
    );
    const answers: WeddingHostAnswer[] = room.answers.map((answer) => ({
      sequence: answer.sequence,
      participantId: answer.participantId,
      participantName: names.get(answer.participantId) ?? "Участник",
      optionIndex: answer.optionIndex,
      optionStyle: answer.optionStyle,
      submittedAt: answer.submittedAt,
      firstCorrect: answer.firstCorrect,
    }));
    return {
      phase: room.phase,
      questionNumber: room.questionNumber,
      optionStyle: room.optionStyle,
      correctOption: room.correctOption,
      expiresAt: room.expiresAt,
      connectedCount: room.participants.filter((participant) => participant.connected).length,
      answeredCount: room.participants.filter((participant) => participant.answerOption !== null)
        .length,
      participants: room.participants.map((participant) => ({
        id: participant.id,
        name: participant.name,
        connected: participant.connected,
        correctAnswers: participant.correctAnswers,
        hasAnswered: participant.answerOption !== null,
      })),
      answers,
    };
  }
}
