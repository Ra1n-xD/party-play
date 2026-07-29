import type {
  BunkerCommand,
  BunkerEvent,
  BunkerPrivateState,
  BunkerPublicState,
} from "../games/bunker/types.js";
import type {
  DurakCommand,
  DurakEvent,
  DurakPrivateState,
  DurakPublicState,
  DurakSettings,
} from "../games/durak/types.js";
import type {
  UnoCommand,
  UnoEvent,
  UnoPrivateState,
  UnoPublicState,
  UnoSettings,
} from "../games/uno/types.js";

export interface GameContractById {
  bunker: {
    settings: null;
    publicState: BunkerPublicState;
    privateState: BunkerPrivateState;
    command: BunkerCommand;
    event: BunkerEvent;
  };
  durak: {
    settings: DurakSettings;
    publicState: DurakPublicState;
    privateState: DurakPrivateState;
    command: DurakCommand;
    event: DurakEvent;
  };
  uno: {
    settings: UnoSettings;
    publicState: UnoPublicState;
    privateState: UnoPrivateState;
    command: UnoCommand;
    event: UnoEvent;
  };
}

export type GameId = keyof GameContractById;
export type GameSettings<G extends GameId> = GameContractById[G]["settings"];
export type GamePublicProjection<G extends GameId> = GameContractById[G]["publicState"];
export type GamePrivateProjection<G extends GameId> = GameContractById[G]["privateState"];
export type GameCommand<G extends GameId> = GameContractById[G]["command"];
export type GameEvent<G extends GameId> = GameContractById[G]["event"];

export type AnyGamePublicProjection = {
  [G in GameId]: GamePublicProjection<G>;
}[GameId];

export type AnyGamePrivateProjection = {
  [G in GameId]: GamePrivateProjection<G>;
}[GameId];

export type AnyGameEvent = {
  [G in GameId]: { gameId: G; event: GameEvent<G> };
}[GameId];
