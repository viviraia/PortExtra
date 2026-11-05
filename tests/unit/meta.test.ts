import { describe, expect, it } from 'vitest';
import { defaultSave, normalizeSave, DEFAULT_UNLOCKS } from '../../src/core/save';
import { COSMETICS, META_UPGRADES, unlockCostOf } from '../../src/data';
import {
  armoryIds, buyCosmetic, buyUpgrade, equipCosmetic, formatDate, formatTime, isUnlocked, isUpgradeMaxed,
  setLoadoutSkill, setLoadoutWeapon, starterSkillIds, starterWeaponIds, unlockItem, upgradeCost, upgradeLevel,
  validateLoadout, bestDepth,
} from '../../src/ui/sanctum/model';
import { RunState } from '../../src/run/RunState';

describe('upgrades', () => {
  it('buys a level, charges coins, and refuses when poor', () => {
    const s = defaultSave();
    const cost = upgradeCost(s, 'vitality');
    expect(cost).toBe(META_UPGRADES.vitality.costs[0]);
    expect(buyUpgrade(s, 'vitality')).toEqual({ ok: false, reason: 'poor' });
    s.coins = cost + 5;
    expect(buyUpgrade(s, 'vitality')).toEqual({ ok: true, spent: cost });
    expect(s.coins).toBe(5);
    expect(upgradeLevel(s, 'vitality')).toBe(1);
    expect(upgradeCost(s, 'vitality')).toBe(META_UPGRADES.vitality.costs[1]);
  });
  it('stops at max level', () => {
    const s = defaultSave();
    s.coins = 1e9;
    const def = META_UPGRADES.flask;
    for (let i = 0; i < def.maxLevel; i++) expect(buyUpgrade(s, 'flask').ok).toBe(true);
    expect(isUpgradeMaxed(s, 'flask')).toBe(true);
    expect(buyUpgrade(s, 'flask').reason).toBe('maxed');
    expect(upgradeCost(s, 'flask')).toBe(Infinity);
  });
  it('rejects unknown ids', () => {
    expect(buyUpgrade(defaultSave(), 'nope').reason).toBe('unknown');
  });
  it('purchased upgrades affect a new run', () => {
    const s = defaultSave();
    s.coins = 1e9;
    buyUpgrade(s, 'vitality');
    buyUpgrade(s, 'flask');
    const base = RunState.create(1, defaultSave());
    const run = RunState.create(1, s);
    expect(run.stats.maxHp).toBe(base.stats.maxHp + META_UPGRADES.vitality.perLevel.maxHp!);
    expect(run.potions).toBe(base.potions + 1);
  });
});

describe('armory', () => {
  it('unlocks with embers once', () => {
    const s = defaultSave();
    const id = 'meteor';
    const cost = unlockCostOf(id);
    expect(cost).toBeGreaterThan(0);
    expect(isUnlocked(s, id)).toBe(false);
    expect(unlockItem(s, id).reason).toBe('poor');
    s.embers = cost;
    expect(unlockItem(s, id)).toEqual({ ok: true, spent: cost });
    expect(s.embers).toBe(0);
    expect(isUnlocked(s, id)).toBe(true);
    expect(unlockItem(s, id).reason).toBe('owned');
  });
  it('default unlocks are owned and listed first', () => {
    const s = defaultSave();
    for (const id of DEFAULT_UNLOCKS) expect(isUnlocked(s, id)).toBe(true);
    const ws = armoryIds('weapon');
    expect(unlockCostOf(ws[0])).toBe(0);
    for (let i = 1; i < ws.length; i++) expect(unlockCostOf(ws[i])).toBeGreaterThanOrEqual(unlockCostOf(ws[i - 1]));
  });
  it('unlocks survive save normalization', () => {
    const s = defaultSave();
    s.embers = 999;
    unlockItem(s, 'storm_rod');
    const re = normalizeSave(JSON.parse(JSON.stringify(s)));
    expect(isUnlocked(re, 'storm_rod')).toBe(true);
  });
});

describe('loadout', () => {
  it('only allows unlocked starter weapons', () => {
    const s = defaultSave();
    expect(setLoadoutWeapon(s, 'hunter_bow').ok).toBe(true);
    expect(s.loadout.weapon).toBe('hunter_bow');
    expect(setLoadoutWeapon(s, 'war_hammer').reason).toBe('not-starter');
    const lockedStarter = starterWeaponIds().find((id) => !isUnlocked(s, id));
    if (lockedStarter) expect(setLoadoutWeapon(s, lockedStarter).reason).toBe('locked');
    expect(setLoadoutWeapon(s, 'bogus').reason).toBe('unknown');
  });
  it('skills can be none', () => {
    const s = defaultSave();
    expect(setLoadoutSkill(s, null).ok).toBe(true);
    expect(s.loadout.skill).toBeNull();
    const sk = starterSkillIds().find((id) => isUnlocked(s, id))!;
    expect(setLoadoutSkill(s, sk).ok).toBe(true);
    expect(s.loadout.skill).toBe(sk);
  });
  it('a new run starts with the chosen loadout', () => {
    const s = defaultSave();
    setLoadoutWeapon(s, 'spear');
    setLoadoutSkill(s, 'frost_nova');
    const run = RunState.create(7, s);
    expect(run.weapons[0]?.defId).toBe('spear');
    expect(run.skills[0]?.defId).toBe('frost_nova');
  });
  it('validateLoadout repairs bad data', () => {
    const s = defaultSave();
    s.loadout = { weapon: 'war_hammer', skill: 'meteor' };
    s.cosmetics.equipped = 'gilded';
    expect(validateLoadout(s)).toBe(true);
    expect(s.loadout.weapon).toBe('rusty_sword');
    expect(s.loadout.skill).toBeNull();
    expect(s.cosmetics.equipped).toBe('default');
    expect(validateLoadout(s)).toBe(false);
  });
});

describe('wardrobe', () => {
  it('buys then equips', () => {
    const s = defaultSave();
    const id = 'crimson';
    expect(equipCosmetic(s, id).reason).toBe('not-owned');
    expect(buyCosmetic(s, id).reason).toBe('poor');
    s.coins = COSMETICS[id].cost;
    expect(buyCosmetic(s, id).ok).toBe(true);
    expect(s.coins).toBe(0);
    expect(buyCosmetic(s, id).reason).toBe('owned');
    expect(equipCosmetic(s, id).ok).toBe(true);
    expect(s.cosmetics.equipped).toBe(id);
    expect(equipCosmetic(s, 'default').ok).toBe(true);
  });
});

describe('records formatting', () => {
  it('formats time and date', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(65_000)).toBe('1:05');
    expect(formatTime(3_725_000)).toBe('1:02:05');
    expect(formatDate('2026-03-04T10:00:00Z')).toMatch(/^2026-03-0[34]$/);
    expect(formatDate('garbage')).toBe('-');
  });
  it('best depth considers history and stats', () => {
    const s = defaultSave();
    expect(bestDepth(s)).toBe(0);
    s.history.push({ depth: 9, kills: 1, timeMs: 1, coins: 0, date: '', seed: 1, cause: '', weapon: '' });
    expect(bestDepth(s)).toBe(9);
  });
});
