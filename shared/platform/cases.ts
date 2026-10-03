import { COSMETICS, RARITIES, type CosmeticKind, type Rarity } from "./cosmetics.js";

export const CASES = [
  {
    id: "partyplay",
    name: "Кейс PartyPlay",
    description: "Все предметы игры",
    kind: null,
    cost: 1,
  },
  {
    id: "avatar",
    name: "Кейс персонажа",
    description: "Только персонажи",
    kind: "avatar",
    cost: 1,
  },
  {
    id: "durak",
    name: "Кейс карт Дурака",
    description: "Рубашки для Дурака",
    kind: "durak",
    cost: 1,
  },
  { id: "uno", name: "Кейс карт UNO", description: "Рубашки для UNO", kind: "uno", cost: 1 },
  {
    id: "reaction",
    name: "Кейс эмоций",
    description: "Жесты и реакции",
    kind: "reaction",
    cost: 1,
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
  basic: 20,
  common: 45,
  rare: 22,
  epic: 10,
  legendary: 3,
};
const rarityOrder = Object.keys(RARITIES);
export function getCase(id: unknown) {
  return CASES.find((entry) => entry.id === id);
}
export function getCaseItems(id: CaseId) {
  const definition = getCase(id)!;
  return COSMETICS.filter((item) => !definition.kind || item.kind === definition.kind).sort(
    (a, b) =>
      rarityOrder.indexOf(a.rarity) - rarityOrder.indexOf(b.rarity) ||
      a.name.localeCompare(b.name, "ru"),
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
