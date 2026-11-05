import type { Rarity } from './types';

export interface RarityInfo {
  label: string;
  /** UI color (0xRRGGBB). */
  color: number;
  /** Inclusive range of affix count rolled on items of this rarity. */
  affixes: [number, number];
  /** Multiplier on the item's own damage. */
  damageMult: number;
  /** Multiplier on merchant prices. */
  priceMult: number;
  /** Baseline drop weight at floor 1 (shifted deeper by getDifficulty/defaultRarityWeights). */
  weight: number;
}

export const RARITY_INFO: Record<Rarity, RarityInfo> = {
  common: { label: 'Common', color: 0xc8c8c8, affixes: [0, 0], damageMult: 1.0, priceMult: 1.0, weight: 70 },
  rare: { label: 'Rare', color: 0x4fa3ff, affixes: [1, 1], damageMult: 1.15, priceMult: 1.6, weight: 24 },
  epic: { label: 'Epic', color: 0xb05cff, affixes: [2, 2], damageMult: 1.3, priceMult: 2.4, weight: 5.5 },
  legendary: { label: 'Legendary', color: 0xffb23a, affixes: [3, 3], damageMult: 1.5, priceMult: 3.6, weight: 0.5 },
};

export const RARITY_RANK: Record<Rarity, number> = { common: 0, rare: 1, epic: 2, legendary: 3 };

export function rarityAtLeast(r: Rarity, min: Rarity): boolean {
  return RARITY_RANK[r] >= RARITY_RANK[min];
}

/**
 * Reference rarity weights by floor. The World agent's getDifficulty may use
 * this directly; Loot only reads `difficulty.rarityWeights`.
 */
export function defaultRarityWeights(floor: number): Record<Rarity, number> {
  const f = Math.max(0, floor - 1);
  return {
    common: Math.max(15, 70 - f * 2.5),
    rare: 24 + f * 1.2,
    epic: 5.5 + f * 0.8,
    legendary: 0.5 + f * 0.25,
  };
}
