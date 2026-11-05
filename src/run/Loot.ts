/** Loot rolling (pure). */
import { uid, type Rng } from '../core/rng';
import { AFFIXES, isPercentRange } from '../data/affixes';
import { RARITY_INFO, RARITY_RANK, rarityAtLeast } from '../data/rarity';
import { RELICS } from '../data/relics';
import { SKILLS } from '../data/skills';
import { WEAPONS } from '../data/weapons';
import type { AffixRoll, Difficulty, EnemyDef, ItemInstance, ItemKind, PlayerStats, Rarity, StatTrack } from '../data/types';
import { STAT_TRACKS } from '../data/types';

/** Relative chance of each item kind when `kind` is not specified. */
export const KIND_WEIGHTS: Record<ItemKind, number> = { weapon: 40, skill: 25, relic: 35 };

const tableOf = (kind: ItemKind): Record<string, unknown> =>
  kind === 'weapon' ? WEAPONS : kind === 'skill' ? SKILLS : RELICS;

export function makeItem(kind: ItemKind, defId: string, level = 1, rarity: Rarity = 'common', affixes: AffixRoll[] = []): ItemInstance {
  const r = kind === 'relic' ? RELICS[defId]?.rarity ?? rarity : rarity;
  return { uid: uid('i'), kind, defId, rarity: r, affixes, level: Math.max(1, Math.floor(level)) };
}

export function rollRarity(rng: Rng, difficulty: Difficulty, minRarity: Rarity = 'common'): Rarity {
  const r = rng.weightedKey(difficulty.rarityWeights);
  return RARITY_RANK[r] >= RARITY_RANK[minRarity] ? r : minRarity;
}

function rollAffixValue(rng: Rng, range: [number, number]): number {
  if (isPercentRange(range)) return Math.round(rng.range(range[0], range[1]) * 100) / 100;
  return rng.int(Math.round(range[0]), Math.round(range[1]));
}

export function rollAffixes(rng: Rng, kind: ItemKind, rarity: Rarity): AffixRoll[] {
  if (kind === 'relic') return [];
  const [lo, hi] = RARITY_INFO[rarity].affixes;
  const count = rng.int(lo, hi);
  const pool = Object.values(AFFIXES).filter((a) => a.appliesTo.includes(kind) && rarityAtLeast(rarity, a.minRarity));
  rng.shuffle(pool);
  const out: AffixRoll[] = [];
  const usedStatus = new Set<string>();
  for (const a of pool) {
    if (out.length >= count) break;
    if (a.status) {
      if (usedStatus.has(a.status)) continue;
      usedStatus.add(a.status);
    }
    out.push({ id: a.id, value: rollAffixValue(rng, a.range) });
  }
  return out;
}

export interface RollItemOpts {
  kind?: ItemKind;
  difficulty: Difficulty;
  unlocked: readonly string[];
  /** Def ids to avoid (e.g. already equipped / already offered). */
  exclude?: readonly string[];
  minRarity?: Rarity;
}

function candidates(kind: ItemKind, unlocked: ReadonlySet<string>, exclude: ReadonlySet<string>, minRarity: Rarity): string[] {
  return Object.keys(tableOf(kind)).filter(
    (id) => unlocked.has(id) && !exclude.has(id) && (kind !== 'relic' || rarityAtLeast(RELICS[id].rarity, minRarity)),
  );
}

/**
 * Roll a random item from the unlocked pool. Falls back to other kinds if the
 * requested kind has no candidates; if `exclude` empties everything, it is ignored.
 */
export function rollItem(rng: Rng, opts: RollItemOpts): ItemInstance {
  const unlocked = new Set(opts.unlocked);
  const minRarity = opts.minRarity ?? 'common';
  let exclude = new Set(opts.exclude ?? []);
  const kinds: ItemKind[] = ['weapon', 'skill', 'relic'];
  const hasAny = () => kinds.some((k) => candidates(k, unlocked, exclude, minRarity).length > 0);
  if (!hasAny()) exclude = new Set();
  if (!hasAny()) throw new Error('rollItem: no unlocked items');

  let kind: ItemKind = opts.kind ?? rng.weightedKey(KIND_WEIGHTS);
  let pool = candidates(kind, unlocked, exclude, minRarity);
  if (pool.length === 0) {
    const others = kinds.filter((k) => candidates(k, unlocked, exclude, minRarity).length > 0);
    kind = rng.weighted(others, (k) => KIND_WEIGHTS[k]);
    pool = candidates(kind, unlocked, exclude, minRarity);
  }

  const level = opts.difficulty.itemLevel;
  if (kind === 'relic') {
    const id = rng.weighted(pool, (id) => opts.difficulty.rarityWeights[RELICS[id].rarity] + 0.01);
    return makeItem('relic', id, level);
  }
  const id = rng.pick(pool);
  const rarity = rollRarity(rng, opts.difficulty, minRarity);
  return makeItem(kind, id, level, rarity, rollAffixes(rng, kind, rarity));
}

/** Per-enemy coin growth per floor (enemy counts also grow with depth). */
export const ENEMY_COIN_GROWTH = 0.01;
/** Chest coin growth per floor. */
export const CHEST_COIN_GROWTH = 0.05;
/** Chest coin roll range at floor 1. */
export const CHEST_COINS: [number, number] = [16, 30];

/** Coins per enemy grow ENEMY_COIN_GROWTH/floor; elites drop 3x. Before PlayerStats.coinPct (see applyCoinBonus). */
export function rollEnemyCoins(rng: Rng, def: EnemyDef, difficulty: Difficulty, elite = false): number {
  const base = rng.int(def.coins[0], def.coins[1]);
  return Math.max(1, Math.round(base * (1 + ENEMY_COIN_GROWTH * (difficulty.floor - 1)) * (elite ? 3 : 1)));
}

export function applyCoinBonus(amount: number, stats: PlayerStats): number {
  return Math.max(0, Math.round(amount * (1 + stats.coinPct)));
}

export function applyEmberBonus(amount: number, stats: PlayerStats, rng?: Rng): number {
  const v = amount * (1 + stats.emberPct);
  const whole = Math.floor(v);
  const frac = v - whole;
  return whole + (rng && frac > 0 && rng.chance(frac) ? 1 : 0);
}

export interface ChestContents {
  coins: number;
  item: ItemInstance | null;
  /** Spawn a health orb too. */
  heal: boolean;
}

/** Treasure chest: coins always, an item 70% of the time (rare+ 1 in 3), sometimes a heal. */
export function chestContents(rng: Rng, difficulty: Difficulty, unlocked: readonly string[]): ChestContents {
  const coins = Math.round(rng.int(CHEST_COINS[0], CHEST_COINS[1]) * (1 + CHEST_COIN_GROWTH * (difficulty.floor - 1)));
  const item = rng.chance(0.7)
    ? rollItem(rng, { difficulty, unlocked, minRarity: rng.chance(0.33) ? 'rare' : 'common' })
    : null;
  return { coins, item, heal: rng.chance(0.2) };
}

/** An altar offers a choice between two distinct stat tracks. */
export function altarOffer(rng: Rng): StatTrack[] {
  return rng.shuffle([...STAT_TRACKS]).slice(0, 2);
}

/** Elite enemies always drop at least one ember; regular enemies use emberChance. */
export function rollEnemyEmbers(rng: Rng, def: EnemyDef, elite = false): number {
  if (elite) return rng.chance(0.3) ? 2 : 1;
  return rng.chance(def.emberChance) ? 1 : 0;
}
