/** Player stat derivation (pure). */
import { AFFIXES } from '../data/affixes';
import { META_UPGRADES } from '../data/meta';
import { RELICS } from '../data/relics';
import type { ItemInstance, PlayerStats, StatKey, StatMods, StatTrack } from '../data/types';

export const BASE_STATS: Readonly<PlayerStats> = Object.freeze({
  maxHp: 100,
  damagePct: 0,
  critChance: 0.05,
  critDamage: 0,
  moveSpeedPct: 0,
  extraJumps: 1,
  lifesteal: 0,
  armor: 0,
  skillCooldownPct: 0,
  dodgeCooldownPct: 0,
  coinPct: 0,
  emberPct: 0,
  potionCharges: 3,
  potionHeal: 0.4,
  statusChance: 0,
  healOnKill: 0,
  thorns: 0,
  shopDiscount: 0,
  lowHpDamagePct: 0,
  revives: 0,
  startingCoins: 0,
});

/** Damage bonus per scroll level on items of that track. */
export const SCROLL_TRACK_DAMAGE = 0.15;
/** Max HP per scroll (might / cunning), vigor scrolls give more. */
export const SCROLL_HP = 10;
export const SCROLL_HP_VIGOR = 20;

export function emptyScrolls(): Record<StatTrack, number> {
  return { might: 0, cunning: 0, vigor: 0 };
}

export function trackDamageMult(track: StatTrack, scrolls: Record<StatTrack, number>): number {
  return 1 + SCROLL_TRACK_DAMAGE * (scrolls[track] ?? 0);
}

export function addMods(target: PlayerStats, mods: StatMods | undefined, times = 1): void {
  if (!mods) return;
  for (const k of Object.keys(mods) as StatKey[]) {
    target[k] += (mods[k] ?? 0) * times;
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Apply the documented clamps (see PlayerStats in data/types.ts). Mutates and returns. */
export function clampStats(s: PlayerStats): PlayerStats {
  s.maxHp = Math.max(10, Math.round(s.maxHp));
  s.armor = clamp(s.armor, 0, 0.75);
  s.skillCooldownPct = clamp(s.skillCooldownPct, 0, 0.6);
  s.dodgeCooldownPct = clamp(s.dodgeCooldownPct, 0, 0.6);
  s.shopDiscount = clamp(s.shopDiscount, 0, 0.5);
  s.critChance = clamp(s.critChance, 0, 1);
  s.critDamage = Math.max(0, s.critDamage);
  s.lifesteal = clamp(s.lifesteal, 0, 0.5);
  s.moveSpeedPct = clamp(s.moveSpeedPct, -0.5, 1);
  s.extraJumps = Math.max(0, Math.floor(s.extraJumps));
  s.potionCharges = Math.max(0, Math.floor(s.potionCharges));
  s.potionHeal = clamp(s.potionHeal, 0, 1);
  s.revives = Math.max(0, Math.floor(s.revives));
  s.damagePct = Math.max(-0.9, s.damagePct);
  s.coinPct = Math.max(0, s.coinPct);
  s.emberPct = Math.max(0, s.emberPct);
  s.thorns = Math.max(0, s.thorns);
  s.healOnKill = Math.max(0, s.healOnKill);
  s.lowHpDamagePct = Math.max(0, s.lowHpDamagePct);
  s.statusChance = clamp(s.statusChance, 0, 1);
  s.startingCoins = Math.max(0, Math.floor(s.startingCoins));
  return s;
}

export interface StatsInput {
  upgrades: Record<string, number>;
  relics: ItemInstance[];
  /** Equipped weapons + skills; their stat affixes apply. */
  equipped: (ItemInstance | null)[];
  scrolls: Record<StatTrack, number>;
}

/** Meta-upgrade-only stats (used by the Sanctum preview and RunState.create). */
export function metaStats(upgrades: Record<string, number>): PlayerStats {
  const s: PlayerStats = { ...BASE_STATS };
  for (const [id, lvl] of Object.entries(upgrades)) {
    const def = META_UPGRADES[id];
    if (!def || !lvl) continue;
    addMods(s, def.perLevel, Math.min(lvl, def.maxLevel));
  }
  return s;
}

export function computeStats(input: StatsInput): PlayerStats {
  const s = metaStats(input.upgrades);
  for (const r of input.relics) addMods(s, RELICS[r.defId]?.mods);
  for (const it of input.equipped) {
    if (!it) continue;
    for (const a of it.affixes) {
      const def = AFFIXES[a.id];
      if (def?.stat) s[def.stat] += a.value;
    }
  }
  const sc = input.scrolls;
  s.maxHp += SCROLL_HP * ((sc.might ?? 0) + (sc.cunning ?? 0)) + SCROLL_HP_VIGOR * (sc.vigor ?? 0);
  return clampStats(s);
}
