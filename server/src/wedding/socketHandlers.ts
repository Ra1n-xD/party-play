import { basename, resolve } from "node:path";
import type { Namespace } from "socket.io";
import type {
  WeddingClientEvents,
  WeddingOptionStyle,
  WeddingServerEvents,
} from "../../../shared/types.js";
import { FileWeddingRoomStore, WeddingRoomService } from "./weddingRoom.js";

type WeddingNamespace = Namespace<WeddingClientEvents, WeddingServerEvents>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isOptionStyle(value: unknown): value is WeddingOptionStyle {
  return value === "letters" || value === "numbers";
}

export function resolveWeddingRoomFilePath(
  currentWorkingDirectory: string,
  override: string | undefined,
): string {
  if (override) return override;
  const serverDirectory =
    basename(currentWorkingDirectory) === "server"
      ? currentWorkingDirectory
      : resolve(currentWorkingDirectory, "server");
  return resolve(serverDirectory, ".data/wedding-room.json");
}

export function createWeddingRoomService(): WeddingRoomService {
  const filePath = resolveWeddingRoomFilePath(process.cwd(), process.env.WEDDING_ROOM_FILE);
  return new WeddingRoomService(new FileWeddingRoomStore(filePath));
}

export function registerWeddingHandlers(
  rawNamespace: Namespace,
  service: WeddingRoomService = createWeddingRoomService(),
): void {
  const namespace = rawNamespace as WeddingNamespace;
  const hostSocketIds = new Set<string>();
  const participantBySocket = new Map<string, string>();
  let expirationTimer: ReturnType<typeof setTimeout> | null = null;

  const emitError = (socketId: string, error: unknown) => {
    const message = error instanceof Error ? error.message : "Не удалось выполнить действие";
    namespace.sockets.get(socketId)?.emit("wedding:error", { message });
  };

  const broadcastAll = () => {
    const hostState = service.getHostState();
    namespace.emit("wedding:availability", {
      exists: hostState !== null,
      expiresAt: hostState?.expiresAt ?? null,
    });
    namespace.emit("wedding:participants", { participants: service.listParticipants() });

    for (const socketId of Array.from(hostSocketIds)) {
      const socket = namespace.sockets.get(socketId);
      if (!socket) {
        hostSocketIds.delete(socketId);
        continue;
      }
      if (hostState) socket.emit("wedding:hostState", hostState);
    }

    for (const [socketId, participantId] of Array.from(participantBySocket.entries())) {
      const socket = namespace.sockets.get(socketId);
      if (!socket) {
        participantBySocket.delete(socketId);
        continue;
      }
      const guestState = service.getGuestState(participantId);
      if (guestState) socket.emit("wedding:guestState", guestState);
    }
  };

  const scheduleExpiration = () => {
    if (expirationTimer) clearTimeout(expirationTimer);
    const delay = service.getExpirationDelay();
    if (delay === null) {
      expirationTimer = null;
      return;
    }
    expirationTimer = setTimeout(() => {
      expirationTimer = null;
      if (service.getExpirationDelay() !== null) {
        scheduleExpiration();
        return;
      }
      participantBySocket.clear();
      namespace.emit("wedding:expired");
      broadcastAll();
    }, delay);
    expirationTimer.unref();
  };

  scheduleExpiration();

  namespace.on("connection", (socket) => {
    const emitInitialState = () => {
      const hostState = service.getHostState();
      socket.emit("wedding:availability", {
        exists: hostState !== null,
        expiresAt: hostState?.expiresAt ?? null,
      });
      socket.emit("wedding:participants", { participants: service.listParticipants() });
    };

    emitInitialState();

    const requireHost = (): boolean => {
      if (hostSocketIds.has(socket.id)) return true;
      socket.emit("wedding:error", { message: "Действие доступно только ведущему" });
      return false;
    };

    socket.on("wedding:hostConnect", () => {
      hostSocketIds.add(socket.id);
      const hostState = service.getHostState();
      if (hostState) socket.emit("wedding:hostState", hostState);
      emitInitialState();
    });

    socket.on("wedding:createRoom", () => {
      if (!requireHost()) return;
      try {
        service.createRoom();
        scheduleExpiration();
        broadcastAll();
      } catch (error) {
        emitError(socket.id, error);
      }
    });

    socket.on("wedding:listParticipants", () => {
      emitInitialState();
    });

    socket.on("wedding:joinNew", (data) => {
      if (!isRecord(data) || typeof data.name !== "string") {
        socket.emit("wedding:error", { message: "Введите имя" });
        return;
      }
      try {
        const binding = service.joinNew(data.name, socket.id);
        participantBySocket.set(socket.id, binding.participantId);
        socket.emit("wedding:joined", binding);
        broadcastAll();
      } catch (error) {
        emitError(socket.id, error);
      }
    });

    socket.on("wedding:rejoin", (data) => {
      if (
        !isRecord(data) ||
        typeof data.participantId !== "string" ||
        typeof data.name !== "string"
      ) {
        socket.emit("wedding:error", { message: "Не удалось восстановить участника" });
        return;
      }
      try {
        const binding = service.rejoin(data.participantId, data.name, socket.id);
        participantBySocket.set(socket.id, binding.participantId);
        if (binding.replacedSocketId) {
          participantBySocket.delete(binding.replacedSocketId);
          namespace.sockets.get(binding.replacedSocketId)?.disconnect(true);
        }
        socket.emit("wedding:joined", {
          participantId: binding.participantId,
          participantName: binding.participantName,
        });
        broadcastAll();
      } catch (error) {
        emitError(socket.id, error);
      }
    });

    socket.on("wedding:answer", (data) => {
      const participantId = participantBySocket.get(socket.id);
      if (!participantId) {
        socket.emit("wedding:error", { message: "Сначала выберите своё имя" });
        return;
      }
      if (!isRecord(data) || typeof data.optionIndex !== "number") {
        socket.emit("wedding:error", { message: "Выберите вариант ответа" });
        return;
      }
      try {
        service.submitAnswer(participantId, socket.id, data.optionIndex);
        broadcastAll();
      } catch (error) {
        emitError(socket.id, error);
      }
    });

    socket.on("wedding:setDraft", (data) => {
      if (!requireHost()) return;
      if (
        !isRecord(data) ||
        !isOptionStyle(data.optionStyle) ||
        (data.correctOption !== null && typeof data.correctOption !== "number")
      ) {
        socket.emit("wedding:error", { message: "Проверьте настройки вопроса" });
        return;
      }
      try {
        service.setDraft(data.optionStyle, data.correctOption);
        broadcastAll();
      } catch (error) {
        emitError(socket.id, error);
      }
    });

    socket.on("wedding:startQuestion", () => {
      if (!requireHost()) return;
      try {
        service.startQuestion();
        broadcastAll();
      } catch (error) {
        emitError(socket.id, error);
      }
    });

    socket.on("wedding:prepareNext", () => {
      if (!requireHost()) return;
      try {
        service.prepareNextQuestion();
        broadcastAll();
      } catch (error) {
        emitError(socket.id, error);
      }
    });

    socket.on("wedding:adjustScore", (data) => {
      if (!requireHost()) return;
      if (
        !isRecord(data) ||
        typeof data.participantId !== "string" ||
        (data.delta !== -1 && data.delta !== 1)
      ) {
        socket.emit("wedding:error", { message: "Не удалось изменить счёт" });
        return;
      }
      try {
        service.adjustScore(data.participantId, data.delta);
        broadcastAll();
      } catch (error) {
        emitError(socket.id, error);
      }
    });

    socket.on("wedding:endContest", () => {
      if (!requireHost()) return;
      try {
        service.finishContest();
        broadcastAll();
      } catch (error) {
        emitError(socket.id, error);
      }
    });

    socket.on("disconnect", () => {
      hostSocketIds.delete(socket.id);
      participantBySocket.delete(socket.id);
      try {
        if (service.disconnectSocket(socket.id)) broadcastAll();
      } catch {
        // The connection is already gone; persistence errors are surfaced on the next active action.
      }
    });
  });
}
