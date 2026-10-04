import {
  getCosmetic,
  isCosmeticInUse,
  type Cosmetic,
  type ProfileSnapshot,
  type Rarity,
} from "./cosmetics.js";

export const UPGRADE_VALUES: Record<Rarity, number> = {
  // Kept for completed attempts made before basic items became singletons.
  basic: 1,
  common: 10,
  rare: 30,
  epic: 90,
  legendary: 270,
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

export type UpgradeReply =
  | { ok: true; value: { profile: ProfileSnapshot; attempt: UpgradeAttempt } }
  | { ok: false; error: string; retryable?: boolean };

/** Keep starter access, equipped cosmetics and unlocked reactions available. */
export function getUpgradeAvailableCount(profile: ProfileSnapshot, item: Cosmetic): number {
  if (item.rarity === "basic") return 0;
  const protectedCopy = isCosmeticInUse(profile, item) ? 1 : 0;
  return Math.max(0, (profile.inventory[item.id] ?? 0) - protectedCopy);
}

export function getUpgradeInputValue(inputs: readonly UpgradeInput[]): number {
  return inputs.reduce((sum, input) => {
    const item = getCosmetic(input.itemId);
    return sum + (item ? UPGRADE_VALUES[item.rarity] * input.count : 0);
  }, 0);
}

/** Legacy inputs are accepted only when reading completed historical attempts. */
export function getUpgradeQuote(
  inputs: UpgradeInput[],
  targetItemId: string,
  allowLegacyBasicInputs = false,
): UpgradeQuote | null {
  const target = getCosmetic(targetItemId);
  if (!target || target.rarity === "basic" || !Array.isArray(inputs) || !inputs.length) return null;
  const seen = new Set<string>();
  let count = 0;
  for (const input of inputs) {
    const item = getCosmetic(input?.itemId);
    if (
      !item ||
      (item.rarity === "basic" && !allowLegacyBasicInputs) ||
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
      Math.floor((inputValue * 10_000) / targetValue),
    ),
  };
}
