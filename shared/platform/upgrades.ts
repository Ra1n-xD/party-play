import { getCosmetic, type Rarity } from "./cosmetics.js";

export const UPGRADE_VALUES: Record<Rarity, number> = {
  basic: 0,
  common: 1,
  rare: 3,
  epic: 9,
  legendary: 27,
};
export const MAX_UPGRADE_ITEMS = 5;
export const MAX_UPGRADE_CHANCE = 9000;

export interface UpgradeInput {
  itemId: string;
  count: number;
}
export interface UpgradeRequest {
  requestId: string;
  inputs: UpgradeInput[];
  targetItemId: string;
}
export interface UpgradeQuote {
  inputValue: number;
  targetValue: number;
  chanceBasisPoints: number;
}
export interface UpgradeAttempt extends UpgradeRequest, UpgradeQuote {
  roll: number;
  success: boolean;
  createdAt: number;
}

export function getUpgradeQuote(inputs: UpgradeInput[], targetItemId: string): UpgradeQuote | null {
  const target = getCosmetic(targetItemId);
  if (!target || target.rarity === "basic" || !Array.isArray(inputs) || !inputs.length) return null;
  const seen = new Set<string>();
  let count = 0;
  let inputValue = 0;
  for (const input of inputs) {
    const item = getCosmetic(input?.itemId);
    if (
      !item ||
      item.rarity === "basic" ||
      seen.has(item.id) ||
      !Number.isSafeInteger(input.count) ||
      input.count < 1 ||
      input.count > MAX_UPGRADE_ITEMS
    )
      return null;
    seen.add(item.id);
    count += input.count;
    inputValue += UPGRADE_VALUES[item.rarity] * input.count;
  }
  const targetValue = UPGRADE_VALUES[target.rarity];
  if (count > MAX_UPGRADE_ITEMS || inputValue >= targetValue) return null;
  return {
    inputValue,
    targetValue,
    chanceBasisPoints: Math.min(
      MAX_UPGRADE_CHANCE,
      Math.floor((inputValue / targetValue) * 10_000),
    ),
  };
}
