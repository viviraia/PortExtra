/**
 * Pure Sanctum (meta-progression) logic. No Phaser: unit-tested in Node.
 * Every mutator returns a MetaResult and only mutates `save` on success.
 */
import { COSMETICS, META_UPGRADES, SKILLS, WEAPONS, allIds, kindOfId, unlockCostOf } from '../../data';
import type { ItemKind, SaveData } from '../../data/types';
import { canAfford, metaUpgradeCost } from '../../run/Economy';

export type MetaFailure = 'unknown' | 'maxed' | 'poor' | 'owned' | 'locked' | 'not-starter' | 'not-owned';

export interface MetaResult {
  ok: boolean;
  reason?: MetaFailure;
  /** Amount spent (coins or embers) on success. */
  spent?: number;
}

const fail = (reason: MetaFailure): MetaResult => ({ ok: false, reason });

export const DEFAULT_WEAPON = 'rusty_sword';

// ---- upgrades ---------------------------------------------------------------

export function upgradeLevel(save: SaveData, id: string): number {
  return Math.max(0, Math.floor(save.upgrades[id] ?? 0));
}

/** Next level cost in coins, Infinity when maxed or unknown. */
export function upgradeCost(save: SaveData, id: string): number {
  const def = META_UPGRADES[id];
  return def ? metaUpgradeCost(def, upgradeLevel(save, id)) : Infinity;
}

export function isUpgradeMaxed(save: SaveData, id: string): boolean {
  const def = META_UPGRADES[id];
  return !!def && upgradeLevel(save, id) >= def.maxLevel;
}

export function buyUpgrade(save: SaveData, id: string): MetaResult {
  const def = META_UPGRADES[id];
  if (!def) return fail('unknown');
  if (isUpgradeMaxed(save, id)) return fail('maxed');
  const cost = upgradeCost(save, id);
  if (!canAfford(save.coins, cost)) return fail('poor');
  save.coins -= cost;
  save.upgrades[id] = upgradeLevel(save, id) + 1;
  return { ok: true, spent: cost };
}

// ---- armory (blueprint unlocks, paid in embers) -----------------------------

export function isUnlocked(save: SaveData, id: string): boolean {
  return unlockCostOf(id) <= 0 || save.unlocked.includes(id);
}

export function unlockItem(save: SaveData, id: string): MetaResult {
  if (!kindOfId(id)) return fail('unknown');
  if (isUnlocked(save, id)) return fail('owned');
  const cost = unlockCostOf(id);
  if (!canAfford(save.embers, cost)) return fail('poor');
  save.embers -= cost;
  save.unlocked = [...save.unlocked, id];
  return { ok: true, spent: cost };
}

/** Armory listing grouped by kind, cheapest first; unlocked-by-default items first. */
export function armoryIds(kind: ItemKind): string[] {
  return [...allIds(kind)].sort((a, b) => unlockCostOf(a) - unlockCostOf(b));
}

// ---- loadout -----------------------------------------------------------------

export const starterWeaponIds = (): string[] => Object.values(WEAPONS).filter((w) => w.starter).map((w) => w.id);
export const starterSkillIds = (): string[] => Object.values(SKILLS).filter((s) => s.starter).map((s) => s.id);

export function setLoadoutWeapon(save: SaveData, id: string): MetaResult {
  const w = WEAPONS[id];
  if (!w) return fail('unknown');
  if (!w.starter) return fail('not-starter');
  if (!isUnlocked(save, id)) return fail('locked');
  save.loadout = { ...save.loadout, weapon: id };
  return { ok: true };
}

export function setLoadoutSkill(save: SaveData, id: string | null): MetaResult {
  if (id === null) {
    save.loadout = { ...save.loadout, skill: null };
    return { ok: true };
  }
  const s = SKILLS[id];
  if (!s) return fail('unknown');
  if (!s.starter) return fail('not-starter');
  if (!isUnlocked(save, id)) return fail('locked');
  save.loadout = { ...save.loadout, skill: id };
  return { ok: true };
}

/** Repair an invalid loadout (e.g. from an old/corrupt save). Returns true if it changed. */
export function validateLoadout(save: SaveData): boolean {
  let changed = false;
  const w = WEAPONS[save.loadout.weapon];
  if (!w || !w.starter || !isUnlocked(save, w.id)) {
    save.loadout = { ...save.loadout, weapon: DEFAULT_WEAPON };
    changed = true;
  }
  const sid = save.loadout.skill;
  if (sid !== null) {
    const s = SKILLS[sid];
    if (!s || !s.starter || !isUnlocked(save, sid)) {
      save.loadout = { ...save.loadout, skill: null };
      changed = true;
    }
  }
  if (!COSMETICS[save.cosmetics.equipped] || !save.cosmetics.owned.includes(save.cosmetics.equipped)) {
    save.cosmetics = { ...save.cosmetics, equipped: 'default' };
    changed = true;
  }
  return changed;
}

// ---- wardrobe ----------------------------------------------------------------

export function ownsCosmetic(save: SaveData, id: string): boolean {
  return id === 'default' || save.cosmetics.owned.includes(id);
}

export function buyCosmetic(save: SaveData, id: string): MetaResult {
  const c = COSMETICS[id];
  if (!c) return fail('unknown');
  if (ownsCosmetic(save, id)) return fail('owned');
  if (!canAfford(save.coins, c.cost)) return fail('poor');
  save.coins -= c.cost;
  save.cosmetics = { ...save.cosmetics, owned: [...save.cosmetics.owned, id] };
  return { ok: true, spent: c.cost };
}

export function equipCosmetic(save: SaveData, id: string): MetaResult {
  if (!COSMETICS[id]) return fail('unknown');
  if (!ownsCosmetic(save, id)) return fail('not-owned');
  save.cosmetics = { ...save.cosmetics, equipped: id };
  return { ok: true };
}

// ---- records -----------------------------------------------------------------

export function formatTime(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function bestDepth(save: SaveData): number {
  return Math.max(save.stats.deepest, ...save.history.map((r) => r.depth), 0);
}

/** Human message for a failure reason. */
export function failureText(r: MetaFailure | undefined, currency: 'coins' | 'embers' = 'coins'): string {
  switch (r) {
    case 'poor':
      return `Not enough ${currency}`;
    case 'maxed':
      return 'Already mastered';
    case 'owned':
      return 'Already owned';
    case 'locked':
      return 'Unlock it in the Armory first';
    case 'not-starter':
      return 'Cannot start with this';
    case 'not-owned':
      return 'Buy it first';
    default:
      return 'Unavailable';
  }
}
