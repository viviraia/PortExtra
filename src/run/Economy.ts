/** Prices & currency helpers (pure). */
import { RARITY_INFO } from '../data/rarity';
import type { ItemInstance, MetaUpgradeDef, PlayerStats } from '../data/types';

/** Merchant base price by kind before rarity/level multipliers. */
export const BASE_ITEM_PRICE = { weapon: 28, skill: 26, relic: 32 } as const;
/** Price growth per item level: tracks per-floor coin income (≈ 60–120% of a floor's coins). */
export const PRICE_LEVEL_GROWTH = 0.35;

const round5 = (n: number) => Math.max(5, Math.round(n / 5) * 5);

/** Merchant price: base × rarity × (1 + PRICE_LEVEL_GROWTH × (level − 1)) × (1 − discount). */
export function itemPrice(inst: ItemInstance, stats?: Pick<PlayerStats, 'shopDiscount'>): number {
  const raw = BASE_ITEM_PRICE[inst.kind] * RARITY_INFO[inst.rarity].priceMult * (1 + PRICE_LEVEL_GROWTH * (inst.level - 1));
  return round5(raw * (1 - (stats?.shopDiscount ?? 0)));
}

/** Merchant potion refill (all charges). */
export function potionRefillPrice(floor: number, stats?: Pick<PlayerStats, 'shopDiscount'>): number {
  return round5((30 + 15 * floor) * (1 - (stats?.shopDiscount ?? 0)));
}

/** Rerolling a merchant's stock; doubles each time on the same floor. */
export function rerollPrice(floor: number, rerollsSoFar: number): number {
  return round5((30 + 5 * floor) * Math.pow(2, rerollsSoFar));
}

/** Coin cost to go from `level` to `level+1`; Infinity when maxed. */
export function metaUpgradeCost(def: MetaUpgradeDef, level: number): number {
  if (level >= def.maxLevel) return Infinity;
  return def.costs[level] ?? Infinity;
}

export function totalMetaCost(defs: Iterable<MetaUpgradeDef>): number {
  let t = 0;
  for (const d of defs) for (let i = 0; i < d.maxLevel; i++) t += d.costs[i];
  return t;
}

export function canAfford(wallet: number, price: number): boolean {
  return Number.isFinite(price) && wallet >= price;
}

/** Embers held in a run are only kept once banked at a floor exit. */
export interface EmberHolder {
  emberUnbanked: number;
  embersBanked: number;
}

/** Bank all unbanked embers; returns the amount to add to the save. */
export function bankEmbers(run: EmberHolder): number {
  const n = run.emberUnbanked;
  run.embersBanked += n;
  run.emberUnbanked = 0;
  return n;
}

/** Unbanked embers lost on death. */
export function lostOnDeath(run: EmberHolder): number {
  return run.emberUnbanked;
}
