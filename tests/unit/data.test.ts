import { describe, expect, it } from 'vitest';
import { Rng } from '../../src/core/rng';
import { DEFAULT_UNLOCKS } from '../../src/core/save';
import {
  AFFIXES, BIOMES, BOSSES, COSMETICS, ENEMIES, META_UPGRADES, RARITY_INFO, RELICS, SKILLS, WEAPONS,
  allIds, getItemDef, itemDescription, itemDisplayName, kindOfId, rarityAtLeast,
} from '../../src/data';
import { BOSS_IDS, ENEMY_IDS, RELIC_IDS, SKILL_IDS, WEAPON_IDS } from '../../src/data/ids';
import { BIOME_ORDER, type Difficulty } from '../../src/data/types';
import { defaultRarityWeights } from '../../src/data/rarity';
import { rollItem } from '../../src/run/Loot';

const sameKeys = (a: object, b: object) => expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort());

export function diff(floor: number): Difficulty {
  return {
    floor, biome: 'cells', loop: 0, isBoss: false,
    hpMult: Math.pow(1.12, floor - 1), dmgMult: Math.pow(1.08, floor - 1),
    enemiesPerRoom: 3, eliteChance: 0.05, itemLevel: floor, rarityWeights: defaultRarityWeights(floor),
  };
}

describe('content catalog', () => {
  it('every id has a def and vice versa', () => {
    sameKeys(WEAPONS, WEAPON_IDS);
    sameKeys(SKILLS, SKILL_IDS);
    sameKeys(RELICS, RELIC_IDS);
    sameKeys(ENEMIES, ENEMY_IDS);
    sameKeys(BOSSES, BOSS_IDS);
    expect(Object.keys(BIOMES).sort()).toEqual([...BIOME_ORDER].sort());
    for (const [table, names] of [[WEAPONS, WEAPON_IDS], [SKILLS, SKILL_IDS], [RELICS, RELIC_IDS], [ENEMIES, ENEMY_IDS], [BOSSES, BOSS_IDS]] as const) {
      for (const [id, def] of Object.entries(table)) {
        expect(def.id).toBe(id);
        expect(def.name).toBe((names as Record<string, string>)[id]);
      }
    }
  });

  it('unlockCost is 0 exactly for default unlocks', () => {
    const defaults = new Set(DEFAULT_UNLOCKS);
    for (const def of [...Object.values(WEAPONS), ...Object.values(SKILLS), ...Object.values(RELICS)]) {
      if (defaults.has(def.id)) expect(def.unlockCost, def.id).toBe(0);
      else {
        expect(def.unlockCost, def.id).toBeGreaterThanOrEqual(3);
        expect(def.unlockCost, def.id).toBeLessThanOrEqual(25);
      }
    }
    for (const id of DEFAULT_UNLOCKS) expect(kindOfId(id), id).not.toBeNull();
  });

  it('weapon shapes are consistent with kind', () => {
    for (const w of Object.values(WEAPONS)) {
      expect(!!w.melee, w.id).toBe(w.kind === 'melee');
      expect(!!w.ranged, w.id).toBe(w.kind === 'ranged');
      expect(!!w.shield, w.id).toBe(w.kind === 'shield');
      if (w.melee) expect(w.melee.combo.length).toBeGreaterThanOrEqual(2);
    }
    for (const id of ['rusty_sword', 'hunter_bow', 'oak_buckler', 'twin_daggers', 'spear']) expect(WEAPONS[id].starter).toBe(true);
    for (const id of ['fire_grenade', 'spike_trap', 'frost_nova']) expect(SKILLS[id].starter).toBe(true);
  });

  it('enemies are in balance range and reference valid biomes', () => {
    for (const e of Object.values(ENEMIES)) {
      for (const b of e.biomes) expect(BIOME_ORDER).toContain(b);
      if (e.minFloor === 1) {
        expect(e.hp).toBeGreaterThanOrEqual(20);
        expect(e.hp).toBeLessThanOrEqual(60);
        expect(e.damage).toBeGreaterThanOrEqual(8);
        expect(e.damage).toBeLessThanOrEqual(15);
      }
    }
    for (const b of BIOME_ORDER) {
      expect(Object.values(ENEMIES).filter((e) => e.biomes.includes(b)).length).toBeGreaterThanOrEqual(3);
      expect(BOSSES[BIOMES[b].bossId].biome).toBe(b);
    }
  });

  it('meta upgrades & cosmetics are well-formed', () => {
    expect(Object.keys(META_UPGRADES).length).toBeGreaterThanOrEqual(8);
    for (const m of Object.values(META_UPGRADES)) {
      expect(m.costs).toHaveLength(m.maxLevel);
      for (let i = 1; i < m.costs.length; i++) expect(m.costs[i]).toBeGreaterThan(m.costs[i - 1]);
      expect(m.costs[0]).toBeGreaterThanOrEqual(150);
      expect(m.costs[0]).toBeLessThanOrEqual(450);
    }
    expect(Object.keys(COSMETICS).length).toBeGreaterThanOrEqual(8);
    expect(COSMETICS.default.cost).toBe(0);
    expect(Object.keys(AFFIXES).length).toBeGreaterThanOrEqual(14);
  });

  it('getItemDef/allIds work', () => {
    expect(getItemDef('weapon', 'spear').name).toBe('Pilgrim Spear');
    expect(() => getItemDef('skill', 'nope')).toThrow();
    expect(allIds('relic')).toHaveLength(20);
  });
});

describe('loot rolls', () => {
  const unlockedAll = [...Object.keys(WEAPONS), ...Object.keys(SKILLS), ...Object.keys(RELICS)];

  it('5000 rolled items are valid', () => {
    const rng = new Rng(99);
    for (let i = 0; i < 5000; i++) {
      const floor = 1 + (i % 30);
      const it = rollItem(rng, { difficulty: diff(floor), unlocked: unlockedAll });
      expect(it.level).toBe(floor);
      expect(kindOfId(it.defId)).toBe(it.kind);
      const ids = it.affixes.map((a) => a.id);
      expect(new Set(ids).size).toBe(ids.length);
      if (it.kind === 'relic') {
        expect(it.affixes).toHaveLength(0);
        expect(it.rarity).toBe(RELICS[it.defId].rarity);
      } else {
        const [lo, hi] = RARITY_INFO[it.rarity].affixes;
        expect(it.affixes.length).toBeGreaterThanOrEqual(lo);
        expect(it.affixes.length).toBeLessThanOrEqual(hi);
      }
      for (const a of it.affixes) {
        const def = AFFIXES[a.id];
        expect(def.appliesTo).toContain(it.kind);
        expect(rarityAtLeast(it.rarity, def.minRarity)).toBe(true);
        expect(a.value).toBeGreaterThanOrEqual(def.range[0] - 1e-9);
        expect(a.value).toBeLessThanOrEqual(def.range[1] + 1e-9);
      }
      expect(itemDisplayName(it).length).toBeGreaterThan(0);
      expect(itemDescription(it).length).toBeGreaterThan(1);
    }
  });

  it('only rolls unlocked ids and respects exclude/minRarity', () => {
    const rng = new Rng(5);
    for (let i = 0; i < 1000; i++) {
      const it = rollItem(rng, { difficulty: diff(3), unlocked: DEFAULT_UNLOCKS, exclude: ['rusty_sword'], minRarity: 'rare' });
      expect(DEFAULT_UNLOCKS).toContain(it.defId);
      expect(it.defId).not.toBe('rusty_sword');
      expect(rarityAtLeast(it.rarity, 'rare')).toBe(true);
    }
  });

  it('rarity distribution shifts with depth', () => {
    const count = (floor: number) => {
      const rng = new Rng(floor);
      let good = 0;
      for (let i = 0; i < 4000; i++) {
        const it = rollItem(rng, { kind: 'weapon', difficulty: diff(floor), unlocked: unlockedAll });
        if (rarityAtLeast(it.rarity, 'epic')) good++;
      }
      return good;
    };
    expect(count(20)).toBeGreaterThan(count(1) * 2);
  });
});
