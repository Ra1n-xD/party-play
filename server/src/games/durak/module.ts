import { randomBytes, randomInt } from "crypto";
import type {
  DurakCommand,
  DurakPrivateState,
  DurakPublicState,
  DurakSettings,
} from "../../../../shared/types.js";
import { runBeforeGameOverHook } from "../../gameLifecycle.js";
import type {
  ControllerChangeKind,
  GameCommandExecution,
  IOServer,
  ServerGameModule,
} from "../../platform/gameModule.js";
import { publishRoomSnapshots } from "../../platform/statePublisher.js";
import { executeInRoom } from "../../platform/roomExecutor.js";
import { getRoom, removePlayer, touchRoom, type Room } from "../../platform/roomManager.js";
import { shuffle } from "../../utils.js";
import { chooseDurakBotCommand } from "./bot.js";
import { createDurakDeck } from "./cards.js";
import {
  applyDurakCommand,
  applyDurakTurnTimeout,
  createDurakGameState,
  excludeDurakSeat,
  freezeDurakTurn,
  resumeDurakTurn,
} from "./engine.js";
import { buildDurakPrivateState, buildDurakPublicState } from "./projections.js";
import { asDurakRoom, type DurakGameState, type DurakRoom } from "./runtime.js";

interface PendingDurakActions {
  turnTimer: ReturnType<typeof setTimeout> | null;
  botTimer: ReturnType<typeof setTimeout> | null;
}

interface DurakReplayMetadata {
  previousDealerSeatId: string;
  previousSeatOrder: string[];
}

const pendingActions = new Map<string, PendingDurakActions>();
const replayMetadata = new WeakMap<DurakRoom, DurakReplayMetadata>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPaused(room: DurakRoom): boolean {
  return room.pauseReasons.admin || room.pauseReasons.disconnectedSeatIds.size > 0;
}

function requireDurakRoom(room: Room): DurakRoom {
  const durakRoom = asDurakRoom(room);
  if (!durakRoom) throw new Error("Durak module received a room for another game");
  return durakRoom;
}

function clearDurakActions(roomCode: string): void {
  const pending = pendingActions.get(roomCode);
  if (pending?.turnTimer) clearTimeout(pending.turnTimer);
  if (pending?.botTimer) clearTimeout(pending.botTimer);
  pendingActions.delete(roomCode);
}

function rememberTimer(
  roomCode: string,
  kind: keyof PendingDurakActions,
  timer: ReturnType<typeof setTimeout>,
): void {
  const pending = pendingActions.get(roomCode) ?? {
    turnTimer: null,
    botTimer: null,
  };
  pending[kind] = timer;
  pendingActions.set(roomCode, pending);
}

function publishDurak(room: DurakRoom, io: IOServer): void {
  clearDurakActions(room.code);
  room.revision++;
  publishRoomSnapshots(room, io, {
    lifecycle: (currentRoom) => currentRoom.lifecycle,
    publicProjection: (currentRoom) => buildDurakPublicState(currentRoom),
    privateProjection: (currentRoom, seatId) => buildDurakPrivateState(currentRoom, seatId),
  });
  touchRoom(room.code);
  scheduleDurakActions(room, io);
}

function commitDurakState(room: DurakRoom, nextState: DurakGameState, io: IOServer): void {
  const enteredResults = room.lifecycle !== "results" && nextState.phase === "GAME_OVER";
  if (enteredResults) {
    runBeforeGameOverHook(room, io);
    room.pauseReasons.admin = false;
    room.pauseReasons.disconnectedSeatIds.clear();
  }
  room.gameState = nextState;
  room.lifecycle = nextState.phase === "GAME_OVER" ? "results" : "playing";
  publishDurak(room, io);
}

function scheduleDurakActions(room: DurakRoom, io: IOServer): void {
  clearDurakActions(room.code);
  const state = room.gameState;
  const turn = state?.turn;
  if (
    room.lifecycle !== "playing" ||
    !state ||
    state.phase !== "PLAYING" ||
    !turn ||
    isPaused(room)
  ) {
    return;
  }

  const expectedGameInstanceId = state.gameInstanceId;
  const expectedTurnId = turn.id;
  if (turn.clock.kind === "running") {
    const expectedDeadline = turn.clock.deadlineAt;
    const expectedRevision = room.revision;
    const expectedControllerEpoch = room.players.get(turn.actorSeatId)?.controller.epoch ?? null;
    const delay = Math.max(0, expectedDeadline - Date.now());
    const timer = setTimeout(() => {
      void executeInRoom(room.code, () => {
        if (getRoom(room.code) !== room || room.revision !== expectedRevision || isPaused(room)) {
          return;
        }
        const currentState = room.gameState;
        const currentTurn = currentState?.turn;
        const currentActor = currentTurn ? room.players.get(currentTurn.actorSeatId) : null;
        if (
          !currentState ||
          currentState.gameInstanceId !== expectedGameInstanceId ||
          currentTurn?.id !== expectedTurnId ||
          currentActor?.controller.epoch !== expectedControllerEpoch ||
          currentTurn.clock.kind !== "running" ||
          currentTurn.clock.deadlineAt !== expectedDeadline
        ) {
          return;
        }
        const result = applyDurakTurnTimeout(currentState, expectedTurnId, Date.now());
        if (result.success) commitDurakState(room, result.state, io);
      }).catch(() => {});
    }, delay);
    timer.unref();
    rememberTimer(room.code, "turnTimer", timer);
  }

  const actor = state.seatOrder
    .map((seatId) => room.players.get(seatId))
    .find((candidate) => {
      if (!candidate || candidate.controller.kind !== "bot" || candidate.kicked) return false;
      return buildDurakPrivateState(room, candidate.id)?.legalAction.type !== "wait";
    });
  if (!actor) return;

  const expectedControllerEpoch = actor.controller.epoch;
  const expectedRevision = room.revision;
  const naturalDelay = randomInt(650, 1401);
  const remainingMs =
    turn.clock.kind === "running" ? Math.max(0, turn.clock.deadlineAt - Date.now()) : null;
  const botDelay =
    remainingMs === null
      ? naturalDelay
      : Math.max(25, Math.min(naturalDelay, Math.max(25, remainingMs - 100)));
  const botTimer = setTimeout(() => {
    void executeInRoom(room.code, () => {
      if (getRoom(room.code) !== room || room.revision !== expectedRevision || isPaused(room)) {
        return;
      }
      const currentState = room.gameState;
      const currentTurn = currentState?.turn;
      const currentActor = room.players.get(actor.id);
      if (
        !currentState ||
        currentState.gameInstanceId !== expectedGameInstanceId ||
        currentTurn?.id !== expectedTurnId ||
        currentActor !== actor ||
        currentActor.controller.kind !== "bot" ||
        currentActor.controller.epoch !== expectedControllerEpoch
      ) {
        return;
      }

      const publicState = buildDurakPublicState(room);
      const privateState = buildDurakPrivateState(room, currentActor.id);
      if (!privateState || privateState.legalAction.type === "wait") return;
      const command = chooseDurakBotCommand(
        publicState,
        privateState,
        () => randomInt(1_000_000) / 1_000_000,
      );
      if (!command) return;
      const result = applyDurakCommand(currentState, currentActor.id, command, Date.now(), false);
      if (result.success) commitDurakState(room, result.state, io);
    }).catch(() => {});
  }, botDelay);
  botTimer.unref();
  rememberTimer(room.code, "botTimer", botTimer);
}

function chooseDealer(room: DurakRoom, seatOrder: readonly string[]): string {
  const metadata = replayMetadata.get(room);
  if (!metadata) return seatOrder[randomInt(seatOrder.length)];

  const previousIndex = metadata.previousSeatOrder.indexOf(metadata.previousDealerSeatId);
  if (previousIndex >= 0) {
    for (let offset = 1; offset < metadata.previousSeatOrder.length; offset++) {
      const candidate =
        metadata.previousSeatOrder[(previousIndex + offset) % metadata.previousSeatOrder.length];
      if (seatOrder.includes(candidate)) return candidate;
    }
  }
  return seatOrder.find((seatId) => seatId !== metadata.previousDealerSeatId) ?? seatOrder[0];
}

function parseCardIds(value: unknown): [string, ...string[]] | null {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > 6 ||
    value.some((cardId) => typeof cardId !== "string" || cardId.length === 0 || cardId.length > 64)
  ) {
    return null;
  }
  if (new Set(value).size !== value.length) return null;
  return value as [string, ...string[]];
}

export function parseDurakCommand(value: unknown): DurakCommand | null {
  if (!isRecord(value) || typeof value.type !== "string") return null;
  switch (value.type) {
    case "attack":
    case "throw-in": {
      const cardIds = parseCardIds(value.cardIds);
      return cardIds ? { type: value.type, cardIds } : null;
    }
    case "defend":
      return typeof value.cardId === "string" &&
        value.cardId.length > 0 &&
        value.cardId.length <= 64 &&
        typeof value.attackCardId === "string" &&
        value.attackCardId.length > 0 &&
        value.attackCardId.length <= 64
        ? {
            type: "defend",
            cardId: value.cardId,
            attackCardId: value.attackCardId,
          }
        : null;
    case "take":
    case "pass":
      return { type: value.type };
    default:
      return null;
  }
}

function validateDurakSettings(value: unknown): value is DurakSettings {
  if (!isRecord(value) || Object.keys(value).length !== 1) return false;
  const timeout = value.turnTimeoutSeconds;
  return timeout === null || timeout === 30 || timeout === 60 || timeout === 90;
}

function executeDurakCommand(
  room: DurakRoom,
  actorSeatId: string,
  command: DurakCommand,
  io: IOServer,
): GameCommandExecution {
  if (!room.gameState || room.lifecycle !== "playing") {
    return { success: false, code: "CONFLICT", error: "Партия не запущена" };
  }
  if (isPaused(room)) {
    return { success: false, code: "PAUSED", error: "Игра на паузе" };
  }
  const result = applyDurakCommand(room.gameState, actorSeatId, command, Date.now(), false);
  if (!result.success) {
    return { success: false, code: "CONFLICT", error: result.error };
  }
  commitDurakState(room, result.state, io);
  return { success: true };
}

function resetDurakRoom(room: DurakRoom, io: IOServer): void {
  const previousState = room.gameState;
  if (previousState) {
    replayMetadata.set(room, {
      previousDealerSeatId: previousState.dealerSeatId,
      previousSeatOrder: [...previousState.seatOrder],
    });
  }
  clearDurakActions(room.code);

  const excludedSeatIds = new Set(
    Array.from(room.players.values())
      .filter((player) => player.kicked)
      .map((player) => player.id),
  );
  for (const seatId of excludedSeatIds) room.players.delete(seatId);
  room.allPlayerIds = room.allPlayerIds.filter((seatId) => !excludedSeatIds.has(seatId));

  for (const player of room.players.values()) {
    if (
      player.owner.kind === "human" &&
      player.controller.kind === "bot" &&
      player.controller.temporary
    ) {
      player.controller = { kind: "none", epoch: player.controller.epoch + 1 };
      player.isBot = false;
      player.temporaryBot = false;
      player.connected = false;
      player.socketId = "";
    }
    player.ready = player.owner.kind === "bot";
    player.alive = true;
  }

  room.gameState = null;
  room.lifecycle = "lobby";
  room.pauseReasons.admin = false;
  room.pauseReasons.disconnectedSeatIds.clear();
  room.startedPlayerCount = null;
  publishDurak(room, io);
}

export const durakModule: ServerGameModule<"durak"> = {
  id: "durak",
  minSeats: 2,
  maxSeats: 6,
  initialSettings: () => ({ turnTimeoutSeconds: null }),
  publicRoomListingSettings: (room) => ({
    turnTimeoutSeconds: room.settings.turnTimeoutSeconds,
  }),
  validateSettings: validateDurakSettings,
  updateSettings: (room, settings, io) => {
    const durakRoom = requireDurakRoom(room);
    if (durakRoom.lifecycle !== "lobby" || durakRoom.gameState) {
      return {
        success: false,
        code: "CONFLICT",
        error: "Настройки можно менять только в лобби",
      };
    }
    durakRoom.settings = { ...settings };
    publishDurak(durakRoom, io);
    return { success: true };
  },
  lifecycle: (room) => room.lifecycle,
  parseCommand: parseDurakCommand,
  start: (room, io) => {
    const durakRoom = requireDurakRoom(room);
    if (durakRoom.lifecycle !== "lobby" || durakRoom.gameState) {
      return { success: false, code: "CONFLICT", error: "Игра уже началась" };
    }
    const seatOrder = durakRoom.allPlayerIds.filter((seatId) => {
      const player = durakRoom.players.get(seatId);
      return Boolean(player && !player.kicked);
    });
    if (seatOrder.length < 2 || seatOrder.length > 6) {
      return {
        success: false,
        code: "CONFLICT",
        error: "Для Дурака нужно от 2 до 6 участников",
      };
    }
    const dealerSeatId = chooseDealer(durakRoom, seatOrder);
    const state = createDurakGameState({
      seatOrder,
      dealerSeatId,
      shuffledDeck: shuffle(createDurakDeck()),
      settings: durakRoom.settings,
      nowMs: Date.now(),
      gameInstanceId: randomBytes(12).toString("hex"),
    });
    for (const player of durakRoom.players.values()) {
      player.alive = true;
    }
    durakRoom.pauseReasons.admin = false;
    durakRoom.pauseReasons.disconnectedSeatIds.clear();
    durakRoom.startedPlayerCount = seatOrder.length;
    durakRoom.gameState = state;
    durakRoom.lifecycle = "playing";
    publishDurak(durakRoom, io);
    return { success: true };
  },
  resetForReplay: (room, io) => {
    const durakRoom = requireDurakRoom(room);
    if (durakRoom.lifecycle !== "results" || durakRoom.gameState?.phase !== "GAME_OVER") {
      return {
        success: false,
        code: "CONFLICT",
        error: "Игра ещё не завершена",
      };
    }
    resetDurakRoom(durakRoom, io);
    return { success: true };
  },
  executeCommand: (room, actorSeatId, command, io) =>
    executeDurakCommand(requireDurakRoom(room), actorSeatId, command, io),
  publicProjection: (room): DurakPublicState => buildDurakPublicState(requireDurakRoom(room)),
  privateProjection: (room, seatId): DurakPrivateState | null =>
    buildDurakPrivateState(requireDurakRoom(room), seatId),
  publish: (room, io) => publishDurak(requireDurakRoom(room), io),
  setAdminPause: (room, paused, io, shouldPublish = true) => {
    const durakRoom = requireDurakRoom(room);
    if (!durakRoom.gameState) {
      return {
        success: false,
        code: "CONFLICT",
        error: "Игра не запущена",
      };
    }
    if (durakRoom.lifecycle !== "playing") {
      if (!paused) {
        durakRoom.pauseReasons.admin = false;
        return { success: true };
      }
      return {
        success: false,
        code: "CONFLICT",
        error: "Игра уже завершена",
      };
    }
    if (durakRoom.pauseReasons.admin === paused) return { success: true };

    const wasPaused = isPaused(durakRoom);
    durakRoom.pauseReasons.admin = paused;
    const nowPaused = isPaused(durakRoom);
    if (!wasPaused && nowPaused) {
      durakRoom.gameState = freezeDurakTurn(durakRoom.gameState, Date.now());
    } else if (wasPaused && !nowPaused) {
      durakRoom.gameState = resumeDurakTurn(durakRoom.gameState, Date.now());
    }
    clearDurakActions(durakRoom.code);
    if (shouldPublish) publishDurak(durakRoom, io);
    return { success: true };
  },
  onControllerChanged: (room, seatId, change: ControllerChangeKind) => {
    const durakRoom = requireDurakRoom(room);
    clearDurakActions(durakRoom.code);
    const state = durakRoom.gameState;
    if (!state || durakRoom.lifecycle !== "playing") return;

    const wasPaused = isPaused(durakRoom);
    if (change === "disconnect" && state.statusBySeatId[seatId] === "active") {
      durakRoom.pauseReasons.disconnectedSeatIds.add(seatId);
    } else if (change !== "disconnect") {
      durakRoom.pauseReasons.disconnectedSeatIds.delete(seatId);
    }
    const nowPaused = isPaused(durakRoom);
    if (!wasPaused && nowPaused) {
      durakRoom.gameState = freezeDurakTurn(state, Date.now());
    } else if (wasPaused && !nowPaused) {
      durakRoom.gameState = resumeDurakTurn(state, Date.now());
    }
  },
  excludeSeat: (room, seatId, io) => {
    const durakRoom = requireDurakRoom(room);
    const player = durakRoom.players.get(seatId);
    if (!player || player.kicked) {
      return { success: false, code: "CONFLICT", error: "Игрок не найден" };
    }
    if (durakRoom.lifecycle === "results") {
      return { success: false, code: "CONFLICT", error: "Игра завершена" };
    }
    if (durakRoom.lifecycle === "lobby") {
      removePlayer(durakRoom, seatId);
      if (durakRoom.players.size > 0) publishDurak(durakRoom, io);
      return { success: true };
    }
    if (!durakRoom.gameState) {
      return { success: false, code: "CONFLICT", error: "Партия не запущена" };
    }
    if (durakRoom.gameState.statusBySeatId[seatId] === "out") {
      durakRoom.pauseReasons.disconnectedSeatIds.delete(seatId);
      return { success: true };
    }

    const remainingDisconnected = new Set(durakRoom.pauseReasons.disconnectedSeatIds);
    remainingDisconnected.delete(seatId);
    const remainsPaused = durakRoom.pauseReasons.admin || remainingDisconnected.size > 0;
    const result = excludeDurakSeat(durakRoom.gameState, seatId, Date.now(), remainsPaused);
    if (!result.success) {
      return { success: false, code: "CONFLICT", error: result.error };
    }

    durakRoom.pauseReasons.disconnectedSeatIds.delete(seatId);
    player.kicked = true;
    player.connected = false;
    player.alive = false;
    player.socketId = "";
    player.isBot = false;
    player.temporaryBot = false;
    if (player.controller.kind !== "none") {
      player.controller = {
        kind: "none",
        epoch: player.controller.epoch + 1,
      };
    }
    commitDurakState(durakRoom, result.state, io);
    return { success: true };
  },
  dispose: (room) => {
    const durakRoom = requireDurakRoom(room);
    clearDurakActions(durakRoom.code);
    replayMetadata.delete(durakRoom);
  },
};
