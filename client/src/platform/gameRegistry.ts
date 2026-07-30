import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import type { GameId } from "../../../shared/platform/gameContract";
import bunkerCover from "../assets/game-covers/bunker.jpg";
import durakCover from "../assets/game-covers/durak.jpg";
import unoCover from "../assets/game-covers/uno.jpg";
import { bunkerRules } from "../games/bunker/rules";
import { durakRules } from "../games/durak/rules";
import { unoRules } from "../games/uno/rules";
import type { GameRules } from "./gameRules";

export interface GameCatalogMetadata {
  title: string;
  description: string;
  playerSummary: string;
  minPlayers: number;
  maxPlayers: number;
  catalogSlot: number;
  coverImage: string;
  coverAlt: string;
}

export interface ClientGameModule<G extends GameId> {
  id: G;
  metadata: GameCatalogMetadata;
  rules: GameRules;
  load: () => Promise<{ default: ComponentType }>;
}

const bunkerModule = {
  id: "bunker",
  metadata: {
    title: "Бункер",
    description: "Социальная игра о выборе, убеждении и выживании.",
    playerSummary: "4–16 игроков · боты",
    minPlayers: 4,
    maxPlayers: 16,
    catalogSlot: 0,
    coverImage: bunkerCover,
    coverAlt: "Защищённый вход в подземный бункер",
  },
  rules: bunkerRules,
  load: () => import("../games/bunker/BunkerModule"),
} satisfies ClientGameModule<"bunker">;

const durakModule = {
  id: "durak",
  metadata: {
    title: "Дурак",
    description: "Подкидная карточная партия с защитой, добором и ботами.",
    playerSummary: "2–6 игроков · боты",
    minPlayers: 2,
    maxPlayers: 6,
    catalogSlot: 1,
    coverImage: durakCover,
    coverAlt: "Игральные карты на тёмном столе",
  },
  rules: durakRules,
  load: () => import("../games/durak/DurakModule"),
} satisfies ClientGameModule<"durak">;

const unoModule = {
  id: "uno",
  metadata: {
    title: "UNO",
    description: "Быстрая карточная игра с цветами, эффектами и вызовом «одна карта».",
    playerSummary: "2–10 игроков · боты",
    minPlayers: 2,
    maxPlayers: 10,
    catalogSlot: 2,
    coverImage: unoCover,
    coverAlt: "Веер из шести ярких игровых карт с цифрами и символами на тёмном столе",
  },
  rules: unoRules,
  load: () => import("../games/uno/UnoModule"),
} satisfies ClientGameModule<"uno">;

export const clientGameRegistry = {
  bunker: bunkerModule,
  durak: durakModule,
  uno: unoModule,
} as const;

export type RegisteredClientGameId = keyof typeof clientGameRegistry;

const lazyGameComponents: Record<RegisteredClientGameId, LazyExoticComponent<ComponentType>> = {
  bunker: lazy(bunkerModule.load),
  durak: lazy(durakModule.load),
  uno: lazy(unoModule.load),
};

export function isRegisteredClientGameId(gameId: GameId): gameId is RegisteredClientGameId {
  return gameId in clientGameRegistry;
}

export function getClientGameModule(
  gameId: GameId,
): ClientGameModule<RegisteredClientGameId> | null {
  return isRegisteredClientGameId(gameId) ? clientGameRegistry[gameId] : null;
}

export function getLazyGameComponent(gameId: GameId): LazyExoticComponent<ComponentType> | null {
  return isRegisteredClientGameId(gameId) ? lazyGameComponents[gameId] : null;
}
