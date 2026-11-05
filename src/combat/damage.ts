/** Pure damage math (no Phaser). */
import { AFFIXES } from '../data/affixes';
import { RARITY_INFO } from '../data/rarity';
import type { Rng } from '../core/rng';
import type { ItemInstance, PlayerStats, StatTrack, StatusId } from '../data/types';
import { trackDamageMult } from '../run/stats';

/** Item damage growth per item level above 1. */
export const ITEM_LEVEL_SCALING = 0.08;
/** Base crit multiplier before PlayerStats.critDamage. */
export const BASE_CRIT_MULT = 1.5;
/** Hits are randomized by ±DAMAGE_VARIANCE. */
export const DAMAGE_VARIANCE = 0.06;
/** HP fraction under which lowHpDamagePct applies. */
export const LOW_HP_THRESHOLD = 0.35;

export function itemLevelMult(level: number): number {
  return 1 + ITEM_LEVEL_SCALING * Math.max(0, level - 1);
}

/** Multiplier from an item's level, rarity, and item-damage affixes. */
export function itemDamageMult(item: ItemInstance | undefined): number {
  if (!item) return 1;
  let affix = 0;
  for (const a of item.affixes) if (AFFIXES[a.id]?.itemDamage) affix += a.value;
  return itemLevelMult(item.level) * RARITY_INFO[item.rarity].damageMult * (1 + affix);
}

export interface HitArgs {
  /** Weapon baseDamage or skill damage. */
  baseDamage: number;
  /** Per-attack multiplier (combo step dmg, charge bonus, ...). */
  mult: number;
  item?: ItemInstance;
  track: StatTrack;
  stats: PlayerStats;
  scrolls: Record<StatTrack, number>;
  rng: Rng;
  forceCrit?: boolean;
  /** Weapon critChance or situational bonus. */
  extraCritChance?: number;
  /** Player's current HP / max HP. */
  playerHpFrac: number;
  /** Disable random variance (tooltips). */
  noVariance?: boolean;
}

export interface HitResult {
  amount: number;
  crit: boolean;
}

/** Expected damage before crit/variance — used by tooltips. */
export function rawHitDamage(a: Omit<HitArgs, 'rng' | 'forceCrit' | 'extraCritChance' | 'noVariance'>): number {
  const low = a.playerHpFrac < LOW_HP_THRESHOLD ? a.stats.lowHpDamagePct : 0;
  return (
    a.baseDamage *
    a.mult *
    itemDamageMult(a.item) *
    trackDamageMult(a.track, a.scrolls) *
    Math.max(0.1, 1 + a.stats.damagePct + low)
  );
}

export function computeHit(a: HitArgs): HitResult {
  let dmg = rawHitDamage(a);
  const crit = a.forceCrit || a.rng.chance(Math.min(1, a.stats.critChance + (a.extraCritChance ?? 0)));
  if (crit) dmg *= BASE_CRIT_MULT + a.stats.critDamage;
  if (!a.noVariance) dmg *= a.rng.range(1 - DAMAGE_VARIANCE, 1 + DAMAGE_VARIANCE);
  return { amount: Math.max(1, Math.round(dmg)), crit };
}

/** Incoming damage after armor. Always at least 1. */
export function enemyDamageToPlayer(raw: number, stats: PlayerStats): number {
  return Math.max(1, Math.round(raw * (1 - stats.armor)));
}

export interface StatusInfo {
  /** Default duration when the source doesn't specify. */
  durationMs: number;
  /** DoT tick interval. */
  tickMs?: number;
  /** DoT damage per second as a fraction of the applying hit's damage (min 1 per tick). */
  dpsFrac?: number;
  /** DoT stacks (re-application refreshes duration and adds a stack up to this). */
  maxStacks?: number;
  /** Movement/attack speed reduction fraction while active. */
  slow?: number;
  /** AI is fully disabled while active. */
  disables?: boolean;
  /** UI/tint color. */
  color: number;
}

/**
 * Status effects:
 *  burn   — DoT, 30%/s of the hit, 1 stack (refresh).
 *  poison — DoT, 15%/s of the hit, stacks up to 5.
 *  bleed  — DoT, 25%/s of the hit, stacks up to 3.
 *  freeze — 70% slow; 'crit-vs-frozen' weapons always crit; breaks after duration.
 *  stun   — disables AI/attacks for the duration (bosses: duration × 0.3).
 */
export const statusDefaults: Record<StatusId, StatusInfo> = {
  burn: { durationMs: 3000, tickMs: 500, dpsFrac: 0.3, maxStacks: 1, color: 0xff7a2a },
  poison: { durationMs: 4000, tickMs: 500, dpsFrac: 0.15, maxStacks: 5, color: 0x8ad04a },
  bleed: { durationMs: 3000, tickMs: 500, dpsFrac: 0.25, maxStacks: 3, color: 0xd02a3a },
  freeze: { durationMs: 1600, slow: 0.7, color: 0x8ad8ff },
  stun: { durationMs: 800, disables: true, color: 0xffe04a },
};

/** Status-applying hits on bosses have their crowd control shortened by this factor. */
export const BOSS_CC_FACTOR = 0.3;
