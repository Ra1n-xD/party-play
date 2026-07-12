import type { Server } from "socket.io";
import type { ClientEvents, ServerEvents } from "../../shared/types.js";
import type { Room } from "./roomManager.js";

type IOServer = Server<ClientEvents, ServerEvents>;
type BeforeGameOverHook = (room: Room, io: IOServer) => void;

const NOOP_BEFORE_GAME_OVER: BeforeGameOverHook = () => {};
let beforeGameOverHook: BeforeGameOverHook = NOOP_BEFORE_GAME_OVER;

export function setBeforeGameOverHook(hook: BeforeGameOverHook): void {
  beforeGameOverHook = hook;
}

export function runBeforeGameOverHook(room: Room, io: IOServer): void {
  beforeGameOverHook(room, io);
}

export function resetGameLifecycleHooksForTests(): void {
  beforeGameOverHook = NOOP_BEFORE_GAME_OVER;
}
