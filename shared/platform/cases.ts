import {
  CASE_ITEMS,
  compareCosmetics,
  RARITIES,
  type CosmeticKind,
  type Rarity,
} from "./cosmetics.js";

export const CASES = [
  {
    id: "partyplay",
    name: "Кейс PartySide",
    description: "Все предметы из кейсов",
    kind: null,
    cost: 1,
  },
  {
    id: "avatar",
    name: "Кейс «Персонажи»",
    description: "Только персонажи",
    kind: "avatar",
    cost: 5,
  },
  {
    id: "durak",
    name: "Кейс «Дурак»",
    description: "Рубашки для Дурака",
    kind: "durak",
    cost: 5,
  },
  { id: "uno", name: "Кейс «UNO»", description: "Рубашки для UNO", kind: "uno", cost: 5 },
  {
    id: "reaction",
    name: "Кейс «Эмоции»",
    description: "Жесты и реакции",
    kind: "reaction",
    cost: 5,
  },
] as const satisfies readonly {
  id: string;
  name: string;
  description: string;
  kind: CosmeticKind | null;
  cost: number;
}[];
export type CaseId = (typeof CASES)[number]["id"];
export interface CaseRequest {
  requestId: string;
  caseId: CaseId;
}
export const CASE_RARITY_WEIGHTS: Record<Rarity, number> = {
  basic: 0,
  common: 75,
  rare: 15,
  epic: 8,
  legendary: 2,
};
const rarityOrder = Object.keys(RARITIES);
export function getCase(id: unknown) {
  return CASES.find((entry) => entry.id === id);
}
export function getCaseItems(id: CaseId) {
  const definition = getCase(id)!;
  return CASE_ITEMS.filter((item) => !definition.kind || item.kind === definition.kind).sort(
    compareCosmetics,
  );
}
export function getCaseRarities(id: CaseId) {
  const items = getCaseItems(id);
  const rarities = rarityOrder.filter((rarity) =>
    items.some((item) => item.rarity === rarity),
  ) as Rarity[];
  const total = rarities.reduce((sum, rarity) => sum + CASE_RARITY_WEIGHTS[rarity], 0);
  return rarities.map((rarity) => ({
    rarity,
    chance: (CASE_RARITY_WEIGHTS[rarity] / total) * 100,
  }));
}
