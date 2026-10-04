import {
  getCosmetic,
  isCosmeticInUse,
  type Cosmetic,
  type ProfileSnapshot,
  type Rarity,
} from "./cosmetics.js";

export const UPGRADE_VALUES: Record<Rarity, number> = {
  basic: 0.1,
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

/** Keep starter access, equipped cosmetics and unlocked reactions available. */
export function getUpgradeAvailableCount(profile: ProfileSnapshot, item: Cosmetic): number {
  const protectedCopy = item.rarity === "basic" || isCosmeticInUse(profile, item) ? 1 : 0;
  return Math.max(0, (profile.inventory[item.id] ?? 0) - protectedCopy);
}

export function getUpgradeInputValue(inputs: readonly UpgradeInput[]): number {
  const units = inputs.reduce((sum, input) => {
    const item = getCosmetic(input.itemId);
    return sum + (item ? Math.round(UPGRADE_VALUES[item.rarity] * 10) * input.count : 0);
  }, 0);
  return units / 10;
}

export function getUpgradeQuote(inputs: UpgradeInput[], targetItemId: string): UpgradeQuote | null {
  const target = getCosmetic(targetItemId);
  if (!target || target.rarity === "basic" || !Array.isArray(inputs) || !inputs.length) return null;
  const seen = new Set<string>();
  let count = 0;
  for (const input of inputs) {
    const item = getCosmetic(input?.itemId);
    if (
      !item ||
      seen.has(item.id) ||
      !Number.isSafeInteger(input.count) ||
      input.count < 1 ||
      input.count > MAX_UPGRADE_ITEMS
    )
      return null;
    seen.add(item.id);
    count += input.count;
  }
  const inputValue = getUpgradeInputValue(inputs);
  const targetValue = UPGRADE_VALUES[target.rarity];
  if (count > MAX_UPGRADE_ITEMS || inputValue >= targetValue) return null;
  return {
    inputValue,
    targetValue,
    chanceBasisPoints: Math.min(
      MAX_UPGRADE_CHANCE,
      // Count tenths as integers so three basic copies produce exactly 0.3 units.
      Math.floor((Math.round(inputValue * 10) * 10_000) / (targetValue * 10)),
    ),
  };
}
