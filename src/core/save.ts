/**
 * Persistent meta-progression save (localStorage), versioned with migrations.
 * Pure logic; storage is injectable so it is unit-testable in Node.
 */
import { SAVE_KEY, SAVE_VERSION } from '../config';
import type { RunRecord, SaveData, Settings } from '../data/types';

/** Items in the drop pool from the very first run (their unlockCost must be 0). */
export const DEFAULT_UNLOCKS: readonly string[] = [
  // weapons
  'rusty_sword', 'hunter_bow', 'oak_buckler', 'twin_daggers', 'spear', 'throwing_knives',
  // skills
  'fire_grenade', 'spike_trap', 'frost_nova',
  // relics
  'iron_heart', 'whetstone', 'swift_boots', 'lucky_coin', 'keen_eye', 'heavy_plate',
  'vampire_fang', 'feather_charm',
];

export const DEFAULT_SETTINGS: Settings = {
  master: 0.8,
  music: 0.5,
  sfx: 0.8,
  screenShake: true,
  damageNumbers: true,
  touchControls: 'auto',
};

export const HISTORY_LIMIT = 10;

export function defaultSave(): SaveData {
  return {
    version: SAVE_VERSION,
    coins: 0,
    embers: 0,
    upgrades: {},
    unlocked: [...DEFAULT_UNLOCKS],
    loadout: { weapon: 'rusty_sword', skill: 'fire_grenade' },
    cosmetics: { owned: ['default'], equipped: 'default' },
    history: [],
    stats: { runs: 0, deaths: 0, totalKills: 0, totalCoins: 0, bossesKilled: 0, deepest: 0 },
    settings: { ...DEFAULT_SETTINGS },
    seenTutorial: false,
  };
}

export interface KVStorage {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

export class MemoryStorage implements KVStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}

type Migration = (data: any) => any;
/** MIGRATIONS[n] upgrades a save from version n to n+1. */
const MIGRATIONS: Record<number, Migration> = {
  0: (d) => ({ ...d, version: 1 }),
};

/** Fill in any missing fields with defaults (forward-compatible loading). */
export function normalizeSave(raw: any): SaveData {
  const def = defaultSave();
  if (!raw || typeof raw !== 'object') return def;
  let d = raw;
  let v = typeof d.version === 'number' ? d.version : 0;
  while (v < SAVE_VERSION) {
    const m = MIGRATIONS[v];
    d = m ? m(d) : { ...d, version: v + 1 };
    v = d.version;
  }
  const num = (x: unknown, fb: number) => (typeof x === 'number' && Number.isFinite(x) ? x : fb);
  const out: SaveData = {
    version: SAVE_VERSION,
    coins: Math.max(0, Math.floor(num(d.coins, 0))),
    embers: Math.max(0, Math.floor(num(d.embers, 0))),
    upgrades: typeof d.upgrades === 'object' && d.upgrades ? { ...d.upgrades } : {},
    unlocked: Array.isArray(d.unlocked) ? [...new Set([...DEFAULT_UNLOCKS, ...d.unlocked])] : [...DEFAULT_UNLOCKS],
    loadout: {
      weapon: typeof d.loadout?.weapon === 'string' ? d.loadout.weapon : def.loadout.weapon,
      skill: typeof d.loadout?.skill === 'string' || d.loadout?.skill === null ? d.loadout.skill : def.loadout.skill,
    },
    cosmetics: {
      owned: Array.isArray(d.cosmetics?.owned) ? [...new Set(['default', ...d.cosmetics.owned])] : ['default'],
      equipped: typeof d.cosmetics?.equipped === 'string' ? d.cosmetics.equipped : 'default',
    },
    history: Array.isArray(d.history) ? d.history.slice(0, HISTORY_LIMIT) : [],
    stats: { ...def.stats, ...(typeof d.stats === 'object' && d.stats ? d.stats : {}) },
    settings: { ...DEFAULT_SETTINGS, ...(typeof d.settings === 'object' && d.settings ? d.settings : {}) },
    seenTutorial: !!d.seenTutorial,
  };
  return out;
}

/** Sort: deeper first, then more kills, then faster. */
export function compareRuns(a: RunRecord, b: RunRecord): number {
  return b.depth - a.depth || b.kills - a.kills || a.timeMs - b.timeMs;
}

/** Insert a run into the history, keeping the top HISTORY_LIMIT. Returns its rank (0-based) or -1. */
export function recordRun(save: SaveData, run: RunRecord): number {
  const list = [...save.history, run].sort(compareRuns);
  const rank = list.indexOf(run);
  save.history = list.slice(0, HISTORY_LIMIT);
  save.stats.runs += 1;
  save.stats.deaths += 1;
  save.stats.totalKills += run.kills;
  save.stats.deepest = Math.max(save.stats.deepest, run.depth);
  return rank < HISTORY_LIMIT ? rank : -1;
}

export class SaveManager {
  data: SaveData;

  constructor(private storage: KVStorage | null = SaveManager.defaultStorage()) {
    this.data = this.load();
  }

  static defaultStorage(): KVStorage | null {
    try {
      if (typeof localStorage !== 'undefined') return localStorage;
    } catch {
      /* private mode etc. */
    }
    return null;
  }

  load(): SaveData {
    if (!this.storage) return defaultSave();
    try {
      const raw = this.storage.getItem(SAVE_KEY);
      return normalizeSave(raw ? JSON.parse(raw) : null);
    } catch {
      return defaultSave();
    }
  }

  save(): void {
    if (!this.storage) return;
    try {
      this.storage.setItem(SAVE_KEY, JSON.stringify(this.data));
    } catch {
      /* quota */
    }
  }

  reset(): void {
    this.data = defaultSave();
    this.save();
  }
}

/** Singleton used by the game. Tests construct their own SaveManager. */
export const saves = new SaveManager();
