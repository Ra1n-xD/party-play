import type { GameId } from "../../../shared/types.js";
import { bunkerModule } from "../games/bunker/module.js";
import { durakModule } from "../games/durak/module.js";
import { unoModule } from "../games/uno/module.js";
import type { ServerGameModule } from "./gameModule.js";

export type RegisteredGameId = "bunker" | "durak" | "uno";

export function isRegisteredGameId(value: unknown): value is RegisteredGameId {
  return value === "bunker" || value === "durak" || value === "uno";
}

export function getServerGameModule<G extends GameId>(gameId: G): ServerGameModule<G> | null {
  if (gameId === "bunker") return bunkerModule as ServerGameModule<G>;
  if (gameId === "durak") return durakModule as ServerGameModule<G>;
  if (gameId === "uno") return unoModule as ServerGameModule<G>;
  return null;
}

export const serverGameRegistry = {
  bunker: bunkerModule,
  durak: durakModule,
  uno: unoModule,
} as const;
