/**
 * Pure analytical balance model. Not used at runtime: it exists so the
 * difficulty curve and the economy can be inspected and pinned by unit tests
 * (tests/unit/balance.test.ts). Numbers here mirror the runtime formulas:
 *  - Enemy.ts: hp = def.hp × hpMult × (elite 2.6), dmg = def.damage × dmgMult × (elite 1.3)
 *  - combat/damage.ts: player hits (item level, rarity, track scrolls, damagePct, crits)
 *  - GameScene.onEnemyKilled / chests / bosses: coin & ember income
 *
 * Behavioural assumptions (documented, tweakable):
 *  - The player collects SCROLL_COLLECT_RATE of altars and every boss scroll and
 *    concentrates scrolls: 60% main track, 25% secondary, 15% third (vigor
 *    counted for HP from its share).
 *  - Found gear lags one floor behind (item level f−1) at the floor's expected rarity.
 *  - "Uptime": fraction of time actually spent hitting (positioning, dodging).
 *  - Boss output was calibrated from in-game measurements of an idle player:
 *    ~0.3 damage per second per point of boss damage (several attack types,
 *    windups and recoveries averaged).
 */
import { BOSSES } from '../data/bosses';
import { ENEMIES } from '../data/enemies';
import { META_UPGRADES } from '../data/meta';
import { RARITY_INFO } from '../data/rarity';
import { WEAPONS } from '../data/weapons';
import { RELICS } from '../data/relics';
import { SKILLS } from '../data/skills';
import type { BiomeId, EnemyDef, PlayerStats, Rarity, StatTrack, WeaponDef } from '../data/types';
import { BASE_CRIT_MULT, itemLevelMult } from '../combat/damage';
import { generateFloor } from '../world/FloorGenerator';
import { biomeForFloor, getDifficulty, isBossFloor, loopForFloor } from '../world/difficulty';
import { metaStats, SCROLL_HP, SCROLL_HP_VIGOR, SCROLL_TRACK_DAMAGE } from './stats';
import { itemPrice } from './Economy';
import { CHEST_COIN_GROWTH, CHEST_COINS, ENEMY_COIN_GROWTH, makeItem } from './Loot';
import { floorSeed } from '../core/rng';

export const SCROLL_COLLECT_RATE = 0.85;
export const UPTIME_NORMAL = 0.6;
export const UPTIME_BOSS = 0.5;
export const BOSS_DPS_PER_DAMAGE = 0.3;
/** Fraction of run income a typical player spends at merchants. */
export const MERCHANT_SPEND_RATE = 0.25;

export type SaveProfile = 'new' | 'mid' | 'late';

/** Representative meta-upgrade levels for each save profile. */
export const PROFILE_UPGRADES: Record<SaveProfile, Record<string, number>> = {
  new: {},
  // ~10 runs in: a few cheap tiers of the core stats.
  mid: { vitality: 2, strength: 2, flask: 1, potency: 1, toughness: 1, precision: 1, greed: 1 },
  // dozens of runs: nearly everything.
  late: { vitality: 5, strength: 5, flask: 2, potency: 3, toughness: 4, precision: 3, greed: 4, purse: 2, kindling: 2, agility: 2, focus: 2 },
};

// ---------------------------------------------------------------------------
// Floor content (measured from the real generator)
// ---------------------------------------------------------------------------

export interface FloorContent {
  enemies: number;
  chests: number;
  altars: number;
  coinMarkers: number;
  merchants: number;
}

const contentCache = new Map<number, FloorContent>();

/** Average content of floor f over `samples` generated layouts. */
export function floorContent(f: number, samples = 24): FloorContent {
  const key = f * 1000 + samples;
  const hit = contentCache.get(key);
  if (hit) return hit;
  const acc: FloorContent = { enemies: 0, chests: 0, altars: 0, coinMarkers: 0, merchants: 0 };
  for (let s = 0; s < samples; s++) {
    const L = generateFloor(f, floorSeed(0xba1 ^ s, f));
    for (const sp of L.spawns) {
      if (sp.kind === 'enemy' || sp.kind === 'flyer') acc.enemies++;
      else if (sp.kind === 'chest') acc.chests++;
      else if (sp.kind === 'altar') acc.altars++;
      else if (sp.kind === 'coin') acc.coinMarkers++;
      else if (sp.kind === 'merchant') acc.merchants++;
    }
  }
  for (const k of Object.keys(acc) as (keyof FloorContent)[]) acc[k] /= samples;
  contentCache.set(key, acc);
  return acc;
}

// ---------------------------------------------------------------------------
// Player side
// ---------------------------------------------------------------------------

/** Expected scrolls collected before entering floor f. */
export function expectedScrolls(f: number): number {
  let n = 0;
  for (let k = 1; k < f; k++) {
    n += floorContent(k).altars * SCROLL_COLLECT_RATE;
    if (isBossFloor(k)) n += 1;
  }
  return n;
}

export function scrollSplit(total: number): Record<StatTrack, number> {
  return { might: total * 0.6, cunning: total * 0.25, vigor: total * 0.15 };
}

/** Expected damage multiplier from rarity at floor f (weighted by drop weights). */
export function expectedRarityMult(f: number): number {
  const w = getDifficulty(f).rarityWeights;
  let tot = 0, acc = 0;
  for (const r of Object.keys(w) as Rarity[]) {
    tot += w[r];
    acc += w[r] * RARITY_INFO[r].damageMult;
  }
  return acc / tot;
}

/** Damage per second of a weapon's raw cycle (1.0 = baseDamage per hit), no crits. */
export function weaponCycleDps(def: WeaponDef): number {
  if (def.melee) {
    let dmg = 0, ms = 0;
    for (const s of def.melee.combo) {
      dmg += s.dmg;
      ms += s.windupMs + s.activeMs + s.recoverMs;
    }
    return (def.baseDamage * dmg * 1000) / ms;
  }
  if (def.ranged) {
    const r = def.ranged;
    return (def.baseDamage * r.dmg * (r.count ?? 1) * 1000) / r.cooldownMs;
  }
  if (def.shield) {
    const b = def.shield.bash;
    return (def.baseDamage * b.dmg * 1000) / (b.windupMs + b.activeMs + b.recoverMs);
  }
  return 0;
}

/** Average damage of one hit of a weapon (combo average), no crits. */
export function weaponAvgHit(def: WeaponDef): number {
  if (def.melee) return (def.baseDamage * def.melee.combo.reduce((a, s) => a + s.dmg, 0)) / def.melee.combo.length;
  if (def.ranged) return def.baseDamage * def.ranged.dmg;
  if (def.shield) return def.baseDamage * def.shield.bash.dmg;
  return 0;
}

export interface PlayerModel {
  floor: number;
  profile: SaveProfile;
  stats: PlayerStats;
  scrolls: number;
  /** Effective HP including potions and armor. */
  ehp: number;
  /** Multiplier on a weapon's base damage (gear, scrolls, damagePct, crits). */
  dmgMult: number;
  /** Average hit of the reference weapon. */
  avgHit: number;
  /** Sustained DPS of the reference weapon (before uptime). */
  dps: number;
}

export const REFERENCE_WEAPON = 'rusty_sword';

export function playerAt(f: number, profile: SaveProfile, weaponId = REFERENCE_WEAPON): PlayerModel {
  const stats = metaStats(PROFILE_UPGRADES[profile]);
  const total = expectedScrolls(f);
  const sc = scrollSplit(total);
  stats.maxHp += SCROLL_HP * (sc.might + sc.cunning) + SCROLL_HP_VIGOR * sc.vigor;
  const def = WEAPONS[weaponId];
  const level = Math.max(1, f - 1);
  const gear = f === 1 ? 1 : itemLevelMult(level) * expectedRarityMult(f);
  // The reference weapon's track is treated as the player's main track.
  const mainTrack = 1 + SCROLL_TRACK_DAMAGE * sc.might;
  const crit = 1 + Math.min(1, stats.critChance + (def.critChance ?? 0)) * (BASE_CRIT_MULT + stats.critDamage - 1);
  const dmgMult = gear * mainTrack * (1 + stats.damagePct) * crit;
  const ehp = (stats.maxHp * (1 + stats.potionCharges * stats.potionHeal)) / (1 - stats.armor);
  return {
    floor: f,
    profile,
    stats,
    scrolls: total,
    ehp,
    dmgMult,
    avgHit: weaponAvgHit(def) * dmgMult,
    dps: weaponCycleDps(def) * dmgMult,
  };
}

// ---------------------------------------------------------------------------
// Enemy side
// ---------------------------------------------------------------------------

export function enemyPool(f: number): EnemyDef[] {
  const biome: BiomeId = biomeForFloor(f);
  const eff = f > 20 ? Infinity : f;
  return Object.values(ENEMIES).filter((e) => e.biomes.includes(biome) && e.minFloor <= eff);
}

export interface EnemyModel {
  hp: number;
  hit: number;
  /** Sustained single-enemy damage per second (attack every windup+cooldown). */
  dps: number;
}

export function enemyAt(def: EnemyDef, f: number, elite = false): EnemyModel {
  const d = getDifficulty(f);
  const hp = def.hp * d.hpMult * (elite ? 2.6 : 1);
  const hit = def.damage * d.dmgMult * (elite ? 1.3 : 1);
  const period = ((def.params.cooldownMs ?? 1200) * (elite ? 0.85 : 1) + (def.params.windupMs ?? 500)) / 1000;
  return { hp, hit, dps: hit / period };
}

/** Spawn-weight-averaged enemy of floor f. */
export function avgEnemy(f: number, elite = false): EnemyModel {
  const pool = enemyPool(f);
  let w = 0;
  const acc = { hp: 0, hit: 0, dps: 0 };
  for (const e of pool) {
    const m = enemyAt(e, f, elite);
    acc.hp += m.hp * e.weight;
    acc.hit += m.hit * e.weight;
    acc.dps += m.dps * e.weight;
    w += e.weight;
  }
  return { hp: acc.hp / w, hit: acc.hit / w, dps: acc.dps / w };
}

/** Strongest single hit among the floor's enemies (elite). */
export function maxEnemyHit(f: number, elite = true): number {
  return Math.max(...enemyPool(f).map((e) => enemyAt(e, f, elite).hit));
}

// ---------------------------------------------------------------------------
// Floor report
// ---------------------------------------------------------------------------

export interface FloorReport {
  floor: number;
  profile: SaveProfile;
  scrolls: number;
  maxHp: number;
  hitsNormal: number;
  ttkNormal: number;
  ttkElite: number;
  /** Average enemy hit as a fraction of max HP. */
  hitPct: number;
  /** Strongest elite hit as a fraction of max HP. */
  maxHitPct: number;
  /** Seconds to die to one average enemy hitting continuously (with potions). */
  surviveSec: number;
  bossTtk?: number;
  /** Seconds of continuous boss damage to empty a full HP bar (no potions). */
  bossBarSec?: number;
}

export function floorReport(f: number, profile: SaveProfile): FloorReport {
  const p = playerAt(f, profile);
  const n = avgEnemy(f);
  const el = avgEnemy(f, true);
  const r: FloorReport = {
    floor: f,
    profile,
    scrolls: p.scrolls,
    maxHp: p.stats.maxHp,
    hitsNormal: n.hp / p.avgHit,
    ttkNormal: n.hp / (p.dps * UPTIME_NORMAL),
    ttkElite: el.hp / (p.dps * UPTIME_NORMAL),
    hitPct: (n.hit * (1 - p.stats.armor)) / p.stats.maxHp,
    maxHitPct: (maxEnemyHit(f) * (1 - p.stats.armor)) / p.stats.maxHp,
    surviveSec: p.ehp / n.dps,
  };
  if (isBossFloor(f)) {
    const b = bossAt(f);
    r.bossTtk = b.hp / (p.dps * UPTIME_BOSS);
    r.bossBarSec = p.stats.maxHp / (b.dps * (1 - p.stats.armor));
  }
  return r;
}

export function bossAt(f: number): { hp: number; dps: number; id: string } {
  const biome = biomeForFloor(f);
  const def = Object.values(BOSSES).find((b) => b.biome === biome)!;
  const d = getDifficulty(f);
  return { id: def.id, hp: def.hp * d.hpMult, dps: def.damage * d.dmgMult * BOSS_DPS_PER_DAMAGE };
}

// ---------------------------------------------------------------------------
// Economy
// ---------------------------------------------------------------------------

/** Expected coins earned on floor f (before coinPct), including the boss. */
export function coinsPerFloor(f: number): number {
  const c = floorContent(f);
  const d = getDifficulty(f);
  const pool = enemyPool(f);
  let w = 0, avg = 0;
  for (const e of pool) {
    avg += ((e.coins[0] + e.coins[1]) / 2) * e.weight;
    w += e.weight;
  }
  avg /= w;
  const perEnemy = avg * coinFloorMult(f) * (1 + d.eliteChance * 2); // elites drop 3x
  const chest = ((CHEST_COINS[0] + CHEST_COINS[1]) / 2) * chestFloorMult(f);
  let coins = c.enemies * perEnemy + c.chests * chest + c.coinMarkers;
  if (isBossFloor(f)) {
    const b = Object.values(BOSSES).find((x) => x.biome === biomeForFloor(f))!;
    coins += b.coins * (1 + loopForFloor(f) * 0.5);
  }
  return coins;
}

/** Mirrors Loot.rollEnemyCoins floor growth. */
export function coinFloorMult(f: number): number {
  return 1 + ENEMY_COIN_GROWTH * (f - 1);
}
/** Mirrors Loot.chestContents floor growth. */
export function chestFloorMult(f: number): number {
  return 1 + CHEST_COIN_GROWTH * (f - 1);
}

/** Expected embers on floor f (elites drop 2, normal enemies by emberChance, bosses). */
export function embersPerFloor(f: number): number {
  const c = floorContent(f);
  const d = getDifficulty(f);
  const pool = enemyPool(f);
  let w = 0, chance = 0;
  for (const e of pool) {
    chance += e.emberChance * e.weight;
    w += e.weight;
  }
  chance /= w;
  let n = c.enemies * (d.eliteChance * 2 + (1 - d.eliteChance) * chance);
  if (isBossFloor(f)) n += Object.values(BOSSES).find((x) => x.biome === biomeForFloor(f))!.embers;
  return n;
}

/** Typical coin income of a regular (non-boss) floor around f. */
export function regularFloorIncome(f: number): number {
  const fl = isBossFloor(f) ? f + 1 : f;
  return coinsPerFloor(fl);
}

/** Average merchant stock price on floor f (rare+ items at the floor's rarity weights). */
export function avgMerchantPrice(f: number): number {
  const d = getDifficulty(f);
  const w = { ...d.rarityWeights, common: 0 };
  let tot = 0, acc = 0;
  for (const kind of ['weapon', 'skill', 'relic'] as const) {
    for (const r of ['rare', 'epic', 'legendary'] as Rarity[]) {
      const id = kind === 'weapon' ? 'rusty_sword' : kind === 'skill' ? 'fire_grenade' : 'iron_heart';
      const it = makeItem(kind, id, d.itemLevel, r);
      it.rarity = r; // relic rarity is fixed by def; model the price spread instead
      acc += itemPrice(it) * w[r];
      tot += w[r];
    }
  }
  return acc / tot;
}

export interface RunSim {
  run: number;
  depth: number;
  coins: number;
  embers: number;
  upgradesOwned: number;
  wallet: number;
  embersWallet: number;
  blueprintsOwned: number;
}

export function totalUnlockCost(): number {
  let t = 0;
  for (const tbl of [WEAPONS, SKILLS, RELICS] as Record<string, { unlockCost: number }>[]) for (const d of Object.values(tbl)) t += d.unlockCost;
  return t;
}

export function metaCostList(): number[] {
  const list: number[] = [];
  for (const d of Object.values(META_UPGRADES)) list.push(...d.costs.slice(0, d.maxLevel));
  return list.sort((a, b) => a - b);
}

/**
 * Typical depth reached on run k given upgrades owned: early runs die around
 * floor 3–5, skill + upgrades push deeper over time (capped at 30).
 */
export function typicalDepth(run: number, upgradesOwned: number): number {
  return Math.min(30, 3 + 0.35 * run + 0.25 * upgradesOwned);
}

/**
 * Simulate `runs` runs: income from floors reached (last floor counts half;
 * embers from the last floor are lost), a share spent at merchants, then
 * cheapest-first meta purchases and blueprint unlocks.
 */
export function simulateRuns(runs: number): RunSim[] {
  const costs = metaCostList();
  const unlockCosts = [WEAPONS, SKILLS, RELICS]
    .flatMap((t) => Object.values(t as Record<string, { unlockCost: number }>).map((d) => d.unlockCost))
    .filter((c) => c > 0)
    .sort((a, b) => a - b);
  let wallet = 0, embersWallet = 0, owned = 0, bp = 0;
  const out: RunSim[] = [];
  for (let k = 1; k <= runs; k++) {
    const depth = typicalDepth(k, owned);
    const full = Math.floor(depth);
    let coins = 0, embers = 0;
    const greed = 1 + metaStats(owned >= 6 ? PROFILE_UPGRADES.mid : {}).coinPct;
    for (let f = 1; f <= full; f++) {
      const last = f === full;
      coins += coinsPerFloor(f) * (last ? 0.5 : 1);
      if (!last) embers += embersPerFloor(f);
    }
    coins *= greed * (1 - MERCHANT_SPEND_RATE);
    wallet += coins;
    embersWallet += embers;
    while (owned < costs.length && wallet >= costs[owned]) wallet -= costs[owned++];
    while (bp < unlockCosts.length && embersWallet >= unlockCosts[bp]) embersWallet -= unlockCosts[bp++];
    out.push({ run: k, depth, coins, embers, upgradesOwned: owned, wallet, embersWallet, blueprintsOwned: bp });
  }
  return out;
}
