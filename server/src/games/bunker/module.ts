import type {
  BunkerCommand,
  BunkerPrivateState,
  BunkerPublicState,
  AttributeType,
} from "../../../../shared/types.js";
import { CONFIG } from "./config.js";
import {
  adminDeleteAttribute,
  adminEliminatePlayer,
  adminForceRevealType,
  adminRemoveBunkerCard,
  adminReplaceAttribute,
  adminReplaceBunkerCard,
  adminRevivePlayer,
  adminShuffleAll,
  adminSwapAttribute,
  addDisconnectPause,
  buildPrivateState,
  buildPublicState,
  broadcastState,
  castVote,
  forceEndGame,
  isGameplayPaused,
  normalizeGameAfterPermanentKick,
  removeDisconnectPause,
  revealActionCard,
  revealAttribute,
  resetGame,
  setAdminPause,
  skipDiscussion,
  startGame,
} from "./engine.js";
import { removePlayer, type Room } from "../../platform/roomManager.js";
import { clearBotActions } from "./botManager.js";
import { asBunkerRoom, type BunkerRoom } from "./runtime.js";
import type {
  GameCommandExecution,
  IOServer,
  ServerGameModule,
} from "../../platform/gameModule.js";

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isIndex(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

const ATTRIBUTE_TYPES = new Set([
  "profession",
  "bio",
  "health",
  "hobby",
  "baggage",
  "fact",
  "action",
]);

function isAttributeType(value: unknown): value is AttributeType | "action" {
  return typeof value === "string" && ATTRIBUTE_TYPES.has(value);
}

export function parseBunkerCommand(value: unknown): BunkerCommand | null {
  if (!value || typeof value !== "object" || !("type" in value)) return null;
  const command = value as Record<string, unknown>;
  switch (command.type) {
    case "reveal-attribute":
      return command.attributeIndex === undefined ||
        (isIndex(command.attributeIndex) && command.attributeIndex < CONFIG.ATTRIBUTE_COUNT)
        ? {
            type: "reveal-attribute",
            ...(command.attributeIndex === undefined
              ? {}
              : { attributeIndex: command.attributeIndex }),
          }
        : null;
    case "reveal-action-card":
    case "force-end":
    case "skip-discussion":
      return { type: command.type };
    case "cast-vote":
      return isString(command.targetSeatId)
        ? { type: "cast-vote", targetSeatId: command.targetSeatId }
        : null;
    case "shuffle-all":
      return isAttributeType(command.attributeType)
        ? {
            type: "shuffle-all",
            attributeType: command.attributeType,
          }
        : null;
    case "swap-attribute":
      return isString(command.firstSeatId) &&
        isString(command.secondSeatId) &&
        isAttributeType(command.attributeType)
        ? {
            type: "swap-attribute",
            firstSeatId: command.firstSeatId,
            secondSeatId: command.secondSeatId,
            attributeType: command.attributeType,
          }
        : null;
    case "replace-attribute":
      return isString(command.seatId) && isAttributeType(command.attributeType)
        ? {
            type: "replace-attribute",
            seatId: command.seatId,
            attributeType: command.attributeType,
          }
        : null;
    case "remove-bunker-card":
    case "replace-bunker-card":
      return isIndex(command.cardIndex)
        ? { type: command.type, cardIndex: command.cardIndex }
        : null;
    case "delete-attribute":
      return isString(command.seatId) &&
        isAttributeType(command.attributeType) &&
        command.attributeType !== "action"
        ? {
            type: "delete-attribute",
            seatId: command.seatId,
            attributeType: command.attributeType,
          }
        : null;
    case "force-reveal-type":
      return isAttributeType(command.attributeType) && command.attributeType !== "action"
        ? {
            type: "force-reveal-type",
            attributeType: command.attributeType,
          }
        : null;
    case "revive-seat":
    case "eliminate-seat":
      return isString(command.seatId) ? { type: command.type, seatId: command.seatId } : null;
    default:
      return null;
  }
}

function requireHost(room: BunkerRoom, actorSeatId: string): GameCommandExecution | null {
  return room.hostId === actorSeatId
    ? null
    : {
        success: false,
        code: "FORBIDDEN",
        error: "Только хост может выполнить это действие",
      };
}

function fromAdminResult(result: { success: boolean; error: string }): GameCommandExecution {
  return result.success
    ? { success: true }
    : { success: false, code: "CONFLICT", error: result.error };
}

function executeBunkerRoomCommand(
  room: BunkerRoom,
  actorSeatId: string,
  command: BunkerCommand,
  io: IOServer,
): GameCommandExecution {
  if (isGameplayPaused(room)) {
    const gameplayCommand =
      command.type === "reveal-attribute" ||
      command.type === "reveal-action-card" ||
      command.type === "cast-vote" ||
      command.type === "skip-discussion";
    if (gameplayCommand) {
      return { success: false, code: "PAUSED", error: "Игра на паузе" };
    }
  }

  switch (command.type) {
    case "reveal-attribute":
      return revealAttribute(room, actorSeatId, command.attributeIndex, io)
        ? { success: true }
        : { success: false, code: "CONFLICT", error: "Сейчас не ваш ход" };
    case "reveal-action-card":
      return revealActionCard(room, actorSeatId, io)
        ? { success: true }
        : {
            success: false,
            code: "CONFLICT",
            error: "Невозможно раскрыть особое условие сейчас",
          };
    case "cast-vote":
      return castVote(room, actorSeatId, command.targetSeatId, io)
        ? { success: true }
        : { success: false, code: "CONFLICT", error: "Невозможно проголосовать" };
    case "force-end": {
      const forbidden = requireHost(room, actorSeatId);
      if (forbidden) return forbidden;
      forceEndGame(room, io);
      return { success: true };
    }
    case "shuffle-all": {
      const forbidden = requireHost(room, actorSeatId);
      return forbidden ?? fromAdminResult(adminShuffleAll(room, command.attributeType, io));
    }
    case "swap-attribute": {
      const forbidden = requireHost(room, actorSeatId);
      return (
        forbidden ??
        fromAdminResult(
          adminSwapAttribute(
            room,
            command.firstSeatId,
            command.secondSeatId,
            command.attributeType,
            io,
          ),
        )
      );
    }
    case "replace-attribute": {
      const forbidden = requireHost(room, actorSeatId);
      return (
        forbidden ??
        fromAdminResult(adminReplaceAttribute(room, command.seatId, command.attributeType, io))
      );
    }
    case "remove-bunker-card": {
      const forbidden = requireHost(room, actorSeatId);
      return forbidden ?? fromAdminResult(adminRemoveBunkerCard(room, command.cardIndex, io));
    }
    case "replace-bunker-card": {
      const forbidden = requireHost(room, actorSeatId);
      return forbidden ?? fromAdminResult(adminReplaceBunkerCard(room, command.cardIndex, io));
    }
    case "delete-attribute": {
      const forbidden = requireHost(room, actorSeatId);
      return (
        forbidden ??
        fromAdminResult(adminDeleteAttribute(room, command.seatId, command.attributeType, io))
      );
    }
    case "force-reveal-type": {
      const forbidden = requireHost(room, actorSeatId);
      return forbidden ?? fromAdminResult(adminForceRevealType(room, command.attributeType, io));
    }
    case "skip-discussion": {
      const forbidden = requireHost(room, actorSeatId);
      return forbidden ?? fromAdminResult(skipDiscussion(room, io));
    }
    case "revive-seat": {
      const forbidden = requireHost(room, actorSeatId);
      return forbidden ?? fromAdminResult(adminRevivePlayer(room, command.seatId, io));
    }
    case "eliminate-seat": {
      const forbidden = requireHost(room, actorSeatId);
      return forbidden ?? fromAdminResult(adminEliminatePlayer(room, command.seatId, io));
    }
  }
}

export function executeBunkerCommand(
  room: Room,
  actorSeatId: string,
  command: BunkerCommand,
  io: IOServer,
): GameCommandExecution {
  const bunkerRoom = asBunkerRoom(room);
  if (!bunkerRoom) {
    return {
      success: false,
      code: "INVALID_COMMAND",
      error: "Команда Бункера недоступна в этой комнате",
    };
  }
  return executeBunkerRoomCommand(bunkerRoom, actorSeatId, command, io);
}

export function buildBunkerPrivateState(
  room: BunkerRoom,
  seatId: string,
): BunkerPrivateState | null {
  return buildPrivateState(room, seatId);
}

function requireBunkerRoom(room: Room): BunkerRoom {
  const bunkerRoom = asBunkerRoom(room);
  if (!bunkerRoom) {
    throw new Error("Bunker module received a room for another game");
  }
  return bunkerRoom;
}

export const bunkerModule: ServerGameModule<"bunker"> = {
  id: "bunker",
  minSeats: CONFIG.MIN_PLAYERS,
  maxSeats: CONFIG.MAX_PLAYERS,
  initialSettings: () => null,
  publicRoomListingSettings: () => null,
  validateSettings: (value): value is null => value === null,
  updateSettings: (room, settings, io) => {
    room.settings = settings;
    broadcastState(requireBunkerRoom(room), io);
    return { success: true };
  },
  lifecycle: (room) => room.lifecycle,
  parseCommand: parseBunkerCommand,
  start: (room, io) => {
    const bunkerRoom = requireBunkerRoom(room);
    if (bunkerRoom.lifecycle !== "lobby" || bunkerRoom.gameState) {
      return { success: false, code: "CONFLICT", error: "Игра уже началась" };
    }
    startGame(bunkerRoom, io);
    return { success: true };
  },
  resetForReplay: (room, io) => {
    const bunkerRoom = requireBunkerRoom(room);
    if (bunkerRoom.lifecycle !== "results" || bunkerRoom.gameState?.phase !== "GAME_OVER") {
      return { success: false, code: "CONFLICT", error: "Игра ещё не завершена" };
    }
    resetGame(bunkerRoom, io);
    return { success: true };
  },
  executeCommand: executeBunkerCommand,
  publicProjection: (room): BunkerPublicState => buildPublicState(requireBunkerRoom(room)),
  privateProjection: (room, seatId) => buildBunkerPrivateState(requireBunkerRoom(room), seatId),
  publish: (room, io) => {
    broadcastState(requireBunkerRoom(room), io);
  },
  setAdminPause: (room, paused, io, shouldPublish = true) =>
    fromAdminResult(setAdminPause(requireBunkerRoom(room), paused, io, shouldPublish)),
  onControllerChanged: (room, seatId, change, io) => {
    const bunkerRoom = requireBunkerRoom(room);
    clearBotActions(bunkerRoom.code);
    if (change === "disconnect") {
      addDisconnectPause(bunkerRoom, seatId, io, false);
    } else {
      removeDisconnectPause(bunkerRoom, seatId, io, false);
    }
  },
  excludeSeat: (room, seatId, io) => {
    const bunkerRoom = requireBunkerRoom(room);
    if (bunkerRoom.lifecycle === "results") {
      return { success: false, code: "CONFLICT", error: "Игра завершена" };
    }
    if (bunkerRoom.lifecycle === "lobby") {
      removePlayer(bunkerRoom, seatId);
      if (bunkerRoom.players.size > 0) broadcastState(bunkerRoom, io);
      return { success: true };
    }
    const player = bunkerRoom.players.get(seatId);
    if (!bunkerRoom.gameState || !player || player.kicked) {
      return { success: false, code: "CONFLICT", error: "Игрок не найден" };
    }
    if (player.controller.kind !== "none") {
      player.controller = {
        kind: "none",
        epoch: player.controller.epoch + 1,
      };
    }
    player.isBot = false;
    player.temporaryBot = false;
    return normalizeGameAfterPermanentKick(bunkerRoom, seatId, io)
      ? { success: true }
      : { success: false, code: "CONFLICT", error: "Игрок не найден" };
  },
  dispose: (room) => {
    const bunkerRoom = requireBunkerRoom(room);
    if (bunkerRoom.gameState?.phaseTimer) {
      clearTimeout(bunkerRoom.gameState.phaseTimer);
      bunkerRoom.gameState.phaseTimer = null;
    }
    clearBotActions(bunkerRoom.code);
  },
};
