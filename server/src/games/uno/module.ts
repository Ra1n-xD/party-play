import { randomBytes, randomInt } from "crypto";
import type {
  UnoCommand,
  UnoPrivateState,
  UnoPublicState,
  UnoSettings,
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
import { chooseUnoBotCommand } from "./bot.js";
import { createUnoDeck, shuffleUnoDeck } from "./cards.js";
import {
  applyUnoCommand,
  applyUnoTurnTimeout,
  createUnoGameState,
  excludeUnoSeat,
  freezeUnoTurn,
  resumeUnoTurn,
} from "./engine.js";
import { buildUnoPrivateState, buildUnoPublicState } from "./projections.js";
import { asUnoRoom, type UnoGameState, type UnoRoom } from "./runtime.js";

interface PendingUnoActions {
  turnTimer: ReturnType<typeof setTimeout> | null;
  botTimer: ReturnType<typeof setTimeout> | null;
  unoReactionTimer: ReturnType<typeof setTimeout> | null;
}

interface UnoReplayMetadata {
  previousDealerSeatId: string;
  previousSeatOrder: string[];
}

const pendingActions = new Map<string, PendingUnoActions>();
const replayMetadata = new WeakMap<UnoRoom, UnoReplayMetadata>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUnoColor(value: unknown): value is "red" | "yellow" | "green" | "blue" {
  return value === "red" || value === "yellow" || value === "green" || value === "blue";
}

function isPaused(room: UnoRoom): boolean {
  return room.pauseReasons.admin || room.pauseReasons.disconnectedSeatIds.size > 0;
}

function requireUnoRoom(room: Room): UnoRoom {
  const unoRoom = asUnoRoom(room);
  if (!unoRoom) throw new Error("UNO module received a room for another game");
  return unoRoom;
}

function clearUnoActions(roomCode: string): void {
  const pending = pendingActions.get(roomCode);
  if (pending?.turnTimer) clearTimeout(pending.turnTimer);
  if (pending?.botTimer) clearTimeout(pending.botTimer);
  if (pending?.unoReactionTimer) clearTimeout(pending.unoReactionTimer);
  pendingActions.delete(roomCode);
}

function rememberTimer(
  roomCode: string,
  kind: keyof PendingUnoActions,
  timer: ReturnType<typeof setTimeout>,
): void {
  const pending = pendingActions.get(roomCode) ?? {
    turnTimer: null,
    botTimer: null,
    unoReactionTimer: null,
  };
  pending[kind] = timer;
  pendingActions.set(roomCode, pending);
}

function publishUno(room: UnoRoom, io: IOServer): void {
  clearUnoActions(room.code);
  room.revision++;
  publishRoomSnapshots(room, io, {
    lifecycle: (currentRoom) => currentRoom.lifecycle,
    publicProjection: (currentRoom) => buildUnoPublicState(currentRoom),
    privateProjection: (currentRoom, seatId) => buildUnoPrivateState(currentRoom, seatId),
  });
  touchRoom(room.code);
  scheduleUnoActions(room, io);
}

function commitUnoState(room: UnoRoom, nextState: UnoGameState, io: IOServer): void {
  const enteredResults = room.lifecycle !== "results" && nextState.phase === "GAME_OVER";
  if (enteredResults) {
    runBeforeGameOverHook(room, io);
    room.pauseReasons.admin = false;
    room.pauseReasons.disconnectedSeatIds.clear();
  }
  room.gameState = nextState;
  room.lifecycle = nextState.phase === "GAME_OVER" ? "results" : "playing";
  publishUno(room, io);
}

function scheduleUnoActions(room: UnoRoom, io: IOServer): void {
  clearUnoActions(room.code);
  const state = room.gameState;
  const turn = state?.turn;
  if (
    room.lifecycle !== "playing" ||
    !state ||
    state.phase !== "PLAYING" ||
    !turn ||
    isPaused(room)
  )
    return;

  const expectedGameInstanceId = state.gameInstanceId;
  const expectedTurnId = turn.id;
  const expectedRevision = room.revision;
  const actor = room.players.get(turn.actorSeatId);
  const expectedControllerEpoch = actor?.controller.epoch ?? null;

  if (turn.clock.kind === "running") {
    const expectedDeadline = turn.clock.deadlineAt;
    const timeout = setTimeout(
      () => {
        void executeInRoom(room.code, () => {
          if (getRoom(room.code) !== room || room.revision !== expectedRevision || isPaused(room))
            return;
          const currentState = room.gameState;
          const currentTurn = currentState?.turn;
          const currentActor = currentTurn ? room.players.get(currentTurn.actorSeatId) : null;
          if (
            !currentState ||
            currentState.gameInstanceId !== expectedGameInstanceId ||
            currentTurn?.id !== expectedTurnId ||
            currentTurn.clock.kind !== "running" ||
            currentTurn.clock.deadlineAt !== expectedDeadline ||
            currentActor?.controller.epoch !== expectedControllerEpoch
          ) {
            return;
          }
          const result = applyUnoTurnTimeout(currentState, expectedTurnId, Date.now());
          if (result.success) commitUnoState(room, result.state, io);
        }).catch(() => {});
      },
      Math.max(0, expectedDeadline - Date.now()),
    );
    timeout.unref();
    rememberTimer(room.code, "turnTimer", timeout);
  }

  if (actor?.controller.kind === "bot" && !actor.kicked) {
    const delay = randomInt(650, 1401);
    const botTimer = setTimeout(() => {
      void executeInRoom(room.code, () => {
        if (getRoom(room.code) !== room || room.revision !== expectedRevision || isPaused(room))
          return;
        const currentState = room.gameState;
        const currentTurn = currentState?.turn;
        const currentActor = room.players.get(turn.actorSeatId);
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
        const publicState = buildUnoPublicState(room);
        const privateState = buildUnoPrivateState(room, currentActor.id);
        if (!privateState) return;
        const command = chooseUnoBotCommand(
          publicState,
          privateState,
          () => randomInt(1_000_000) / 1_000_000,
        );
        if (!command) return;
        const result = applyUnoCommand(currentState, currentActor.id, command, Date.now(), false);
        if (result.success) commitUnoState(room, result.state, io);
      }).catch(() => {});
    }, delay);
    botTimer.unref();
    rememberTimer(room.code, "botTimer", botTimer);
  }

  const unoWindow = state.unoWindow;
  if (!unoWindow) return;
  const catchingBot = state.activeSeatIds
    .map((seatId) => room.players.get(seatId))
    .find(
      (player) =>
        player &&
        player.id !== unoWindow.subjectSeatId &&
        player.controller.kind === "bot" &&
        !player.kicked,
    );
  if (!catchingBot) return;
  const expectedWindowId = unoWindow.id;
  const expectedBotEpoch = catchingBot.controller.epoch;
  const reactionTimer = setTimeout(
    () => {
      void executeInRoom(room.code, () => {
        if (getRoom(room.code) !== room || room.revision !== expectedRevision || isPaused(room))
          return;
        const currentState = room.gameState;
        const currentBot = room.players.get(catchingBot.id);
        if (
          !currentState ||
          currentState.gameInstanceId !== expectedGameInstanceId ||
          currentState.unoWindow?.id !== expectedWindowId ||
          currentBot !== catchingBot ||
          currentBot.controller.kind !== "bot" ||
          currentBot.controller.epoch !== expectedBotEpoch
        ) {
          return;
        }
        const privateState = buildUnoPrivateState(room, catchingBot.id);
        const command = privateState?.legalActions.catchUno
          ? { type: "catch-uno" as const, windowId: expectedWindowId }
          : null;
        if (!command) return;
        const result = applyUnoCommand(currentState, catchingBot.id, command, Date.now(), false);
        if (result.success) commitUnoState(room, result.state, io);
      }).catch(() => {});
    },
    randomInt(450, 901),
  );
  reactionTimer.unref();
  rememberTimer(room.code, "unoReactionTimer", reactionTimer);
}

function chooseDealer(room: UnoRoom, seatOrder: readonly string[]): string {
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

function isCardId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 64;
}

export function parseUnoCommand(value: unknown): UnoCommand | null {
  if (!isRecord(value) || typeof value.type !== "string") return null;
  switch (value.type) {
    case "play-card":
      return isCardId(value.cardId) &&
        (value.chosenColor === undefined || isUnoColor(value.chosenColor)) &&
        (value.declareUno === undefined || typeof value.declareUno === "boolean")
        ? {
            type: "play-card",
            cardId: value.cardId,
            ...(value.chosenColor === undefined ? {} : { chosenColor: value.chosenColor }),
            ...(value.declareUno === undefined ? {} : { declareUno: value.declareUno }),
          }
        : null;
    case "draw-card":
    case "end-turn":
      return { type: value.type };
    case "choose-initial-color":
      return isUnoColor(value.color) ? { type: "choose-initial-color", color: value.color } : null;
    case "respond-wild-draw-four":
      return Number.isInteger(value.pendingId) &&
        typeof value.pendingId === "number" &&
        value.pendingId > 0 &&
        (value.decision === "accept" || value.decision === "challenge")
        ? { type: "respond-wild-draw-four", pendingId: value.pendingId, decision: value.decision }
        : null;
    case "declare-uno":
      return value.windowId === undefined ||
        (typeof value.windowId === "number" &&
          Number.isInteger(value.windowId) &&
          value.windowId > 0)
        ? {
            type: "declare-uno",
            ...(value.windowId === undefined ? {} : { windowId: value.windowId }),
          }
        : null;
    case "catch-uno":
      return typeof value.windowId === "number" &&
        Number.isInteger(value.windowId) &&
        value.windowId > 0
        ? { type: "catch-uno", windowId: value.windowId }
        : null;
    default:
      return null;
  }
}

function validateUnoSettings(value: unknown): value is UnoSettings {
  return (
    isRecord(value) &&
    Object.keys(value).length === 1 &&
    (value.turnTimeoutSeconds === null ||
      value.turnTimeoutSeconds === 30 ||
      value.turnTimeoutSeconds === 60 ||
      value.turnTimeoutSeconds === 90)
  );
}

function executeUnoCommand(
  room: UnoRoom,
  actorSeatId: string,
  command: UnoCommand,
  io: IOServer,
): GameCommandExecution {
  if (!room.gameState || room.lifecycle !== "playing") {
    return { success: false, code: "CONFLICT", error: "Партия не запущена" };
  }
  if (isPaused(room)) return { success: false, code: "PAUSED", error: "Игра на паузе" };
  const result = applyUnoCommand(room.gameState, actorSeatId, command, Date.now(), false);
  if (!result.success) return { success: false, code: "CONFLICT", error: result.error };
  commitUnoState(room, result.state, io);
  return { success: true };
}

function resetUnoRoom(room: UnoRoom, io: IOServer): void {
  const previous = room.gameState;
  if (previous) {
    replayMetadata.set(room, {
      previousDealerSeatId: previous.dealerSeatId,
      previousSeatOrder: [...previous.seatOrder],
    });
  }
  clearUnoActions(room.code);
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
  publishUno(room, io);
}

export const unoModule: ServerGameModule<"uno"> = {
  id: "uno",
  minSeats: 2,
  maxSeats: 10,
  initialSettings: () => ({ turnTimeoutSeconds: null }),
  publicRoomListingSettings: (room) => ({
    turnTimeoutSeconds: room.settings.turnTimeoutSeconds,
  }),
  validateSettings: validateUnoSettings,
  updateSettings: (room, settings, io) => {
    const unoRoom = requireUnoRoom(room);
    if (unoRoom.lifecycle !== "lobby" || unoRoom.gameState) {
      return { success: false, code: "CONFLICT", error: "Настройки можно менять только в лобби" };
    }
    unoRoom.settings = { ...settings };
    publishUno(unoRoom, io);
    return { success: true };
  },
  lifecycle: (room) => room.lifecycle,
  parseCommand: parseUnoCommand,
  start: (room, io) => {
    const unoRoom = requireUnoRoom(room);
    if (unoRoom.lifecycle !== "lobby" || unoRoom.gameState) {
      return { success: false, code: "CONFLICT", error: "Игра уже началась" };
    }
    const seatOrder = unoRoom.allPlayerIds.filter((seatId) => {
      const player = unoRoom.players.get(seatId);
      return Boolean(player && !player.kicked);
    });
    if (seatOrder.length < 2 || seatOrder.length > 10) {
      return { success: false, code: "CONFLICT", error: "Для UNO нужно от 2 до 10 участников" };
    }
    const dealerSeatId = chooseDealer(unoRoom, seatOrder);
    const state = createUnoGameState({
      seatOrder,
      dealerSeatId,
      shuffledDeck: shuffleUnoDeck(createUnoDeck()),
      settings: unoRoom.settings,
      nowMs: Date.now(),
      gameInstanceId: randomBytes(12).toString("hex"),
    });
    for (const player of unoRoom.players.values()) player.alive = true;
    unoRoom.pauseReasons.admin = false;
    unoRoom.pauseReasons.disconnectedSeatIds.clear();
    unoRoom.startedPlayerCount = seatOrder.length;
    unoRoom.gameState = state;
    unoRoom.lifecycle = "playing";
    publishUno(unoRoom, io);
    return { success: true };
  },
  resetForReplay: (room, io) => {
    const unoRoom = requireUnoRoom(room);
    if (unoRoom.lifecycle !== "results" || unoRoom.gameState?.phase !== "GAME_OVER") {
      return { success: false, code: "CONFLICT", error: "Игра ещё не завершена" };
    }
    resetUnoRoom(unoRoom, io);
    return { success: true };
  },
  executeCommand: (room, actorSeatId, command, io) =>
    executeUnoCommand(requireUnoRoom(room), actorSeatId, command, io),
  publicProjection: (room): UnoPublicState => buildUnoPublicState(requireUnoRoom(room)),
  privateProjection: (room, seatId): UnoPrivateState | null =>
    buildUnoPrivateState(requireUnoRoom(room), seatId),
  publish: (room, io) => publishUno(requireUnoRoom(room), io),
  setAdminPause: (room, paused, io, shouldPublish = true) => {
    const unoRoom = requireUnoRoom(room);
    if (!unoRoom.gameState) return { success: false, code: "CONFLICT", error: "Игра не запущена" };
    if (unoRoom.lifecycle !== "playing") {
      if (!paused) {
        unoRoom.pauseReasons.admin = false;
        return { success: true };
      }
      return { success: false, code: "CONFLICT", error: "Игра уже завершена" };
    }
    if (unoRoom.pauseReasons.admin === paused) return { success: true };
    const wasPaused = isPaused(unoRoom);
    unoRoom.pauseReasons.admin = paused;
    const nowPaused = isPaused(unoRoom);
    if (!wasPaused && nowPaused) unoRoom.gameState = freezeUnoTurn(unoRoom.gameState, Date.now());
    else if (wasPaused && !nowPaused)
      unoRoom.gameState = resumeUnoTurn(unoRoom.gameState, Date.now());
    clearUnoActions(unoRoom.code);
    if (shouldPublish) publishUno(unoRoom, io);
    return { success: true };
  },
  onControllerChanged: (room, seatId, change: ControllerChangeKind) => {
    const unoRoom = requireUnoRoom(room);
    clearUnoActions(unoRoom.code);
    const state = unoRoom.gameState;
    if (!state || unoRoom.lifecycle !== "playing") return;
    const wasPaused = isPaused(unoRoom);
    if (change === "disconnect" && state.statusBySeatId[seatId] === "active") {
      unoRoom.pauseReasons.disconnectedSeatIds.add(seatId);
    } else if (change !== "disconnect") {
      unoRoom.pauseReasons.disconnectedSeatIds.delete(seatId);
    }
    const nowPaused = isPaused(unoRoom);
    if (!wasPaused && nowPaused) unoRoom.gameState = freezeUnoTurn(state, Date.now());
    else if (wasPaused && !nowPaused) unoRoom.gameState = resumeUnoTurn(state, Date.now());
  },
  excludeSeat: (room, seatId, io) => {
    const unoRoom = requireUnoRoom(room);
    const player = unoRoom.players.get(seatId);
    if (!player || player.kicked)
      return { success: false, code: "CONFLICT", error: "Игрок не найден" };
    if (unoRoom.lifecycle === "results")
      return { success: false, code: "CONFLICT", error: "Игра завершена" };
    if (unoRoom.lifecycle === "lobby") {
      removePlayer(unoRoom, seatId);
      if (unoRoom.players.size > 0) publishUno(unoRoom, io);
      return { success: true };
    }
    if (!unoRoom.gameState)
      return { success: false, code: "CONFLICT", error: "Партия не запущена" };
    const remainingDisconnected = new Set(unoRoom.pauseReasons.disconnectedSeatIds);
    remainingDisconnected.delete(seatId);
    const remainsPaused = unoRoom.pauseReasons.admin || remainingDisconnected.size > 0;
    const result = excludeUnoSeat(unoRoom.gameState, seatId, Date.now(), remainsPaused);
    if (!result.success) return { success: false, code: "CONFLICT", error: result.error };
    unoRoom.pauseReasons.disconnectedSeatIds.delete(seatId);
    player.kicked = true;
    player.connected = false;
    player.alive = false;
    player.socketId = "";
    player.isBot = false;
    player.temporaryBot = false;
    if (player.controller.kind !== "none")
      player.controller = { kind: "none", epoch: player.controller.epoch + 1 };
    commitUnoState(unoRoom, result.state, io);
    return { success: true };
  },
  dispose: (room) => {
    const unoRoom = requireUnoRoom(room);
    clearUnoActions(unoRoom.code);
    replayMetadata.delete(unoRoom);
  },
};
