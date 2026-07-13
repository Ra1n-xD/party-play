import { basename, resolve } from "node:path";
import type { Namespace } from "socket.io";
import type {
  QuestionsAnswerField,
  QuestionsClientEvents,
  QuestionsEditorRole,
  QuestionsRole,
  QuestionsServerEvents,
} from "../../../shared/types.js";
import { FileQuestionsSessionStore, QuestionsSessionService } from "./questionsSession.js";

type QuestionsNamespace = Namespace<QuestionsClientEvents, QuestionsServerEvents>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRole(value: unknown): value is QuestionsRole {
  return value === "daniil" || value === "shasha" || value === "observer";
}

function isEditorRole(value: QuestionsRole | undefined): value is QuestionsEditorRole {
  return value === "daniil" || value === "shasha";
}

function isField(value: unknown): value is QuestionsAnswerField {
  return value === "ownAnswer" || value === "partnerGuess";
}

export function resolveQuestionsSessionFilePath(
  currentWorkingDirectory: string,
  override: string | undefined,
): string {
  if (override) return override;
  const serverDirectory =
    basename(currentWorkingDirectory) === "server"
      ? currentWorkingDirectory
      : resolve(currentWorkingDirectory, "server");
  return resolve(serverDirectory, ".data/questions-session.json");
}

export function createQuestionsSessionService(): QuestionsSessionService {
  return new QuestionsSessionService(
    new FileQuestionsSessionStore(
      resolveQuestionsSessionFilePath(process.cwd(), process.env.QUESTIONS_SESSION_FILE),
    ),
  );
}

export function registerQuestionsHandlers(
  rawNamespace: Namespace,
  service: QuestionsSessionService = createQuestionsSessionService(),
): void {
  const namespace = rawNamespace as QuestionsNamespace;
  const roles = new Map<string, QuestionsRole>();

  const emitError = (socketId: string, error: unknown) => {
    const message = error instanceof Error ? error.message : "Не удалось сохранить ответ";
    namespace.sockets.get(socketId)?.emit("questions:error", { message });
  };

  const emitState = (socketId: string) => {
    const socket = namespace.sockets.get(socketId);
    const role = roles.get(socketId);
    if (!socket || !role) return;
    if (role === "observer") socket.emit("questions:observerState", service.getObserverState());
    else socket.emit("questions:editorState", service.getEditorState(role));
  };

  const broadcastAll = () => {
    for (const socketId of Array.from(roles.keys())) {
      if (!namespace.sockets.has(socketId)) roles.delete(socketId);
      else emitState(socketId);
    }
  };

  namespace.on("connection", (socket) => {
    socket.on("questions:selectRole", (data) => {
      if (!isRecord(data) || !isRole(data.role)) {
        socket.emit("questions:error", { message: "Выберите роль" });
        return;
      }
      roles.set(socket.id, data.role);
      emitState(socket.id);
    });

    socket.on("questions:addQuestion", () => {
      const role = roles.get(socket.id);
      if (!isEditorRole(role)) {
        socket.emit("questions:error", {
          message:
            role === "observer" ? "Наблюдатели могут только смотреть" : "Сначала выберите роль",
        });
        return;
      }
      try {
        service.addQuestion();
        broadcastAll();
      } catch (error) {
        emitError(socket.id, error);
      }
    });

    socket.on("questions:deleteLatestQuestion", () => {
      const role = roles.get(socket.id);
      if (!isEditorRole(role)) {
        socket.emit("questions:error", {
          message:
            role === "observer" ? "Наблюдатели могут только смотреть" : "Сначала выберите роль",
        });
        return;
      }
      try {
        service.deleteLatestQuestion();
        broadcastAll();
      } catch (error) {
        emitError(socket.id, error);
      }
    });

    socket.on("questions:updateAnswer", (data) => {
      const role = roles.get(socket.id);
      if (!isEditorRole(role)) {
        socket.emit("questions:error", {
          message:
            role === "observer" ? "Наблюдатели могут только смотреть" : "Сначала выберите роль",
        });
        return;
      }
      if (
        !isRecord(data) ||
        typeof data.questionId !== "number" ||
        !isField(data.field) ||
        typeof data.value !== "string"
      ) {
        socket.emit("questions:error", { message: "Не удалось сохранить ответ" });
        return;
      }
      try {
        service.updateAnswer(role, data.questionId, data.field, data.value);
        broadcastAll();
      } catch (error) {
        emitError(socket.id, error);
      }
    });

    socket.on("disconnect", () => {
      roles.delete(socket.id);
    });
  });
}
