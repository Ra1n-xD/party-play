import type {
  AnyRoomCommandEnvelope,
  RoomCommandRejectionCode,
  RoomCommandResult,
} from "../../../shared/types.js";
import { addBotToRoom, removeBotFromRoom, type Room } from "./roomManager.js";
import {
  assignTemporaryBot,
  cancelAllSeatClaims,
  kickPlayerPermanently,
  transferHost,
} from "./reconnectManager.js";
import { getServerGameModule } from "./gameRegistry.js";
import type { GameCommandExecution, IOServer } from "./gameModule.js";

const MAX_PROCESSED_COMMANDS = 128;
type AnyPlatformCommand = AnyRoomCommandEnvelope["command"];

export interface RoomCommandHooks {
  resolveSeatClaim(requestId: string, approved: boolean): GameCommandExecution;
}

function reject(
  commandId: string,
  room: Room,
  code: RoomCommandRejectionCode,
  message: string,
): RoomCommandResult {
  return {
    commandId,
    status: "rejected",
    revision: room.revision,
    code,
    message,
  };
}

function remember(room: Room, key: string, result: RoomCommandResult): void {
  room.processedCommands.set(key, result);
  while (room.processedCommands.size > MAX_PROCESSED_COMMANDS) {
    const oldest = room.processedCommands.keys().next().value;
    if (oldest === undefined) break;
    room.processedCommands.delete(oldest);
  }
}

function fromExecution(
  commandId: string,
  room: Room,
  execution: GameCommandExecution,
): RoomCommandResult {
  if (!execution.success) {
    return reject(
      commandId,
      room,
      execution.code ?? "CONFLICT",
      execution.error ?? "Команда отклонена",
    );
  }
  return {
    commandId,
    status: "applied",
    revision: room.revision,
    duplicate: false,
  };
}

function requireHost(room: Room, actorSeatId: string): GameCommandExecution | null {
  return room.hostId === actorSeatId
    ? null
    : {
        success: false,
        code: "FORBIDDEN",
        error: "Только хост может выполнить это действие",
      };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasString(value: Record<string, unknown>, key: string): boolean {
  return typeof value[key] === "string" && value[key].length > 0;
}

function isPlatformCommand(value: unknown): value is AnyPlatformCommand {
  if (!isRecord(value) || typeof value.type !== "string") return false;

  switch (value.type) {
    case "seat:set-ready":
      return typeof value.ready === "boolean";
    case "room:start":
    case "room:play-again":
    case "room:add-bot":
      return true;
    case "room:update-settings":
      return "settings" in value;
    case "room:remove-bot":
    case "room:assign-temporary-bot":
    case "room:return-human-control":
    case "room:exclude-seat":
    case "room:transfer-host":
      return hasString(value, "seatId");
    case "room:set-admin-pause":
      return typeof value.paused === "boolean";
    case "room:resolve-seat-claim":
      return hasString(value, "requestId") && typeof value.approved === "boolean";
    case "game":
      return "command" in value;
    default:
      return false;
  }
}

function applyCommand(
  room: Room,
  actorSeatId: string,
  command: AnyPlatformCommand,
  io: IOServer,
  hooks?: RoomCommandHooks,
): GameCommandExecution {
  const module = getServerGameModule(room.gameId);
  if (!module) {
    return { success: false, code: "INVALID_COMMAND", error: "Игра недоступна" };
  }

  switch (command.type) {
    case "seat:set-ready": {
      const player = room.players.get(actorSeatId);
      if (!player || player.kicked || module.lifecycle(room) !== "lobby") {
        return { success: false, code: "CONFLICT", error: "Готовность нельзя изменить" };
      }
      player.ready = command.ready;
      module.publish(room, io);
      return { success: true };
    }
    case "room:start": {
      const forbidden = requireHost(room, actorSeatId);
      if (forbidden) return forbidden;
      if (room.players.size < module.minSeats) {
        return {
          success: false,
          code: "CONFLICT",
          error: `Нужно минимум ${module.minSeats} игрока`,
        };
      }
      if (room.players.size > module.maxSeats) {
        return { success: false, code: "CONFLICT", error: "Комната заполнена" };
      }
      const allControlled = Array.from(room.players.values()).every(
        (player) => player.owner.kind === "bot" || player.controller.kind === "human",
      );
      if (!allControlled) {
        return { success: false, code: "CONFLICT", error: "Не все игроки подключены" };
      }
      const allReady = Array.from(room.players.values()).every(
        (player) => player.ready || player.id === room.hostId,
      );
      if (!allReady) {
        return { success: false, code: "CONFLICT", error: "Не все игроки готовы" };
      }
      return module.start(room, io);
    }
    case "room:play-again": {
      const forbidden = requireHost(room, actorSeatId);
      if (forbidden) return forbidden;
      const result = module.resetForReplay(room, io);
      if (result.success) {
        cancelAllSeatClaims(room, io, "Игра сброшена");
      }
      return result;
    }
    case "room:update-settings": {
      const forbidden = requireHost(room, actorSeatId);
      if (forbidden) return forbidden;
      if (!module.validateSettings(command.settings)) {
        return { success: false, code: "INVALID_COMMAND", error: "Некорректные настройки" };
      }
      return module.updateSettings(room, command.settings, io);
    }
    case "room:add-bot": {
      const forbidden = requireHost(room, actorSeatId);
      if (forbidden) return forbidden;
      if (!addBotToRoom(room, module.maxSeats)) {
        return { success: false, code: "CONFLICT", error: "Невозможно добавить бота" };
      }
      module.publish(room, io);
      return { success: true };
    }
    case "room:remove-bot": {
      const forbidden = requireHost(room, actorSeatId);
      if (forbidden) return forbidden;
      if (!removeBotFromRoom(room, command.seatId)) {
        return {
          success: false,
          code: "CONFLICT",
          error: "Невозможно удалить этого игрока",
        };
      }
      module.publish(room, io);
      return { success: true };
    }
    case "room:assign-temporary-bot": {
      const result = assignTemporaryBot(room, actorSeatId, command.seatId, io);
      return result.success
        ? { success: true }
        : { success: false, code: "CONFLICT", error: result.error };
    }
    case "room:return-human-control": {
      if (actorSeatId !== command.seatId) {
        return { success: false, code: "FORBIDDEN", error: "Нельзя управлять чужим местом" };
      }
      const player = room.players.get(actorSeatId);
      if (!player || player.controller.kind !== "human") {
        return { success: false, code: "CONFLICT", error: "Место не подключено" };
      }
      module.onControllerChanged(room, actorSeatId, "human-return", io);
      module.publish(room, io);
      return { success: true };
    }
    case "room:exclude-seat": {
      const result = kickPlayerPermanently(room, actorSeatId, command.seatId, io);
      if (!result.success) {
        return { success: false, code: "CONFLICT", error: result.error };
      }
      if (result.releasedSocketId) {
        const releasedSocket = io.sockets.sockets.get(result.releasedSocketId);
        releasedSocket?.emit("room:kicked", { message: "Вы удалены из комнаты хостом" });
        releasedSocket?.leave(room.code);
        releasedSocket?.disconnect(true);
      }
      return { success: true };
    }
    case "room:transfer-host": {
      const result = transferHost(room, actorSeatId, command.seatId, io);
      return result.success
        ? { success: true }
        : { success: false, code: "CONFLICT", error: result.error };
    }
    case "room:set-admin-pause": {
      const forbidden = requireHost(room, actorSeatId);
      if (forbidden) return forbidden;
      return module.setAdminPause(room, command.paused, io);
    }
    case "room:resolve-seat-claim":
      return (
        hooks?.resolveSeatClaim(command.requestId, command.approved) ?? {
          success: false,
          code: "INVALID_COMMAND",
          error: "Подтверждение заявки недоступно",
        }
      );
    case "game": {
      const parsed = module.parseCommand(command.command);
      if (!parsed) {
        return { success: false, code: "INVALID_COMMAND", error: "Некорректная команда игры" };
      }
      return module.executeCommand(room, actorSeatId, parsed, io);
    }
  }
}

export function dispatchRoomCommand(
  room: Room,
  actorSeatId: string,
  envelope: unknown,
  io: IOServer,
  hooks?: RoomCommandHooks,
): RoomCommandResult {
  if (!isRecord(envelope)) {
    return reject("", room, "INVALID_COMMAND", "Некорректная команда");
  }

  const commandId = typeof envelope.commandId === "string" ? envelope.commandId.trim() : "";
  if (!commandId || commandId.length > 128) {
    return reject(commandId, room, "INVALID_COMMAND", "Некорректный ID команды");
  }

  const cacheKey = `${actorSeatId}:${commandId}`;
  const duplicate = room.processedCommands.get(cacheKey);
  if (duplicate?.status === "applied") {
    return { ...duplicate, duplicate: true, revision: room.revision };
  }
  if (envelope.gameId !== room.gameId) {
    return reject(commandId, room, "WRONG_GAME", "Команда предназначена для другой игры");
  }
  if (!Number.isInteger(envelope.expectedRevision) || envelope.expectedRevision !== room.revision) {
    return reject(commandId, room, "STALE_REVISION", "Состояние комнаты уже изменилось");
  }
  if (!isPlatformCommand(envelope.command)) {
    return reject(commandId, room, "INVALID_COMMAND", "Некорректная команда");
  }

  const execution = applyCommand(room, actorSeatId, envelope.command, io, hooks);
  const result = fromExecution(commandId, room, execution);
  if (result.status === "applied") remember(room, cacheKey, result);
  return result;
}
