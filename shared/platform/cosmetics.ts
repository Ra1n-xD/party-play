import { AVATARS, type AvatarId } from "./avatars.js";
import type { UpgradeAttempt } from "./upgrades.js";

export const RARITIES = {
  basic: { name: "Базовый", color: "#9da7b5", chance: 0 },
  common: { name: "Обычный", color: "#79a6f6", chance: 60 },
  rare: { name: "Редкий", color: "#9277ff", chance: 25 },
  epic: { name: "Эпический", color: "#e16be5", chance: 12 },
  legendary: { name: "Легендарный", color: "#ffc35d", chance: 3 },
} as const;
export type Rarity = keyof typeof RARITIES;
export type CosmeticKind = "avatar" | "durak" | "uno";
export const CARD_SKINS = [
  {
    id: "classic",
    name: "Классика",
    rarity: "basic",
    background: "#284c62",
    accent: "#d6bf82",
    face: "#fffcf4",
    mark: "◆",
  },
  {
    id: "mint",
    name: "Мята",
    rarity: "common",
    background: "#145b53",
    accent: "#80f5ce",
    face: "#eefbf5",
    mark: "❖",
  },
  {
    id: "midnight",
    name: "Полночь",
    rarity: "rare",
    background: "#171d49",
    accent: "#8c9eff",
    face: "#eef0ff",
    mark: "☾",
  },
  {
    id: "ember",
    name: "Уголь и пламя",
    rarity: "rare",
    background: "#4a2020",
    accent: "#ff9566",
    face: "#fff2e8",
    mark: "✺",
  },
  {
    id: "aurora",
    name: "Северное сияние",
    rarity: "epic",
    background: "#35204e",
    accent: "#e59bff",
    face: "#fbecff",
    mark: "✦",
  },
  {
    id: "royal",
    name: "Золотой век",
    rarity: "legendary",
    background: "#111b2b",
    accent: "#f5d580",
    face: "#111b2b",
    mark: "♛",
  },
] as const;
export type CardSkinId = (typeof CARD_SKINS)[number]["id"];
export interface Cosmetic {
  id: string;
  kind: CosmeticKind;
  name: string;
  rarity: Rarity;
  avatarId?: AvatarId;
  cardSkinId?: CardSkinId;
}
const avatarRarities: Record<AvatarId, Rarity> = {
  human: "basic",
  cat: "common",
  dog: "common",
  monkey: "common",
  bear: "rare",
  panda: "rare",
  rabbit: "rare",
  alien: "epic",
  robot: "epic",
  astronaut: "legendary",
};
export const COSMETICS: Cosmetic[] = [
  ...AVATARS.map(
    (avatar): Cosmetic => ({
      id: `avatar:${avatar.id}`,
      kind: "avatar",
      name: avatar.name,
      rarity: avatarRarities[avatar.id],
      avatarId: avatar.id,
    }),
  ),
  ...(["durak", "uno"] as const).flatMap((kind) =>
    CARD_SKINS.map(
      (skin): Cosmetic => ({
        id: `${kind}:${skin.id}`,
        kind,
        name: skin.name,
        rarity: skin.rarity,
        cardSkinId: skin.id,
      }),
    ),
  ),
];
export const CASE_ITEMS = COSMETICS.filter((item) => item.rarity !== "basic");
export const BASIC_ITEMS = ["avatar:human", "durak:classic", "uno:classic"];
export const COSMETIC_KIND_NAMES: Record<CosmeticKind, string> = {
  avatar: "Персонажи",
  durak: "Карты Дурака",
  uno: "Карты UNO",
};
export const CASE_COST = 1;
export const GAME_REWARD = 1;
export const INITIAL_COINS = 20;
export function getCosmetic(id: unknown) {
  return COSMETICS.find((item) => item.id === id);
}
export function getCardSkin(id: unknown) {
  return CARD_SKINS.find((skin) => skin.id === id) ?? CARD_SKINS[0];
}
export function normalizeNickname(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.normalize("NFKC").trim().replace(/\s+/g, " ");
  return name.length > 0 && name.length <= 20 && !/[<>&"'`/\\\x00-\x1f\x7f]/.test(name)
    ? name
    : null;
}
export function nicknameKey(name: string): string {
  return name.toLocaleLowerCase("ru-RU");
}
export interface CaseOpening {
  requestId: string;
  itemId: string;
  duplicate: boolean;
  openedAt: number;
}
export interface ProfileSnapshot {
  id: string;
  nickname: string;
  coins: number;
  completedGames: number;
  wins: number;
  inventory: Record<string, number>;
  equipped: { avatar: AvatarId; durak: CardSkinId; uno: CardSkinId };
  recentOpenings: CaseOpening[];
  recentUpgrades?: UpgradeAttempt[];
}
export type ProfileReply<T> = { ok: true; value: T } | { ok: false; error: string };
