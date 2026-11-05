import { describe, expect, it } from 'vitest';
import { Rng } from '../../src/core/rng';
import { DEFAULT_UNLOCKS, defaultSave } from '../../src/core/save';
import { computeHit, enemyDamageToPlayer, itemDamageMult, ITEM_LEVEL_SCALING } from '../../src/combat/damage';
import { ENEMIES, META_UPGRADES, WEAPONS } from '../../src/data';
import { defaultRarityWeights } from '../../src/data/rarity';
import type { Difficulty, ItemInstance } from '../../src/data/types';
import { BASE_ITEM_PRICE, canAfford, itemPrice, metaUpgradeCost, potionRefillPrice, rerollPrice, totalMetaCost } from '../../src/run/Economy';
import { chestContents, makeItem, rollEnemyCoins } from '../../src/run/Loot';
import { RunState } from '../../src/run/RunState';
import { BASE_STATS, computeStats, emptyScrolls, SCROLL_HP, SCROLL_HP_VIGOR } from '../../src/run/stats';

function diff(floor: number): Difficulty {
  return {
    floor, biome: 'cells', loop: 0, isBoss: false,
    hpMult: Math.pow(1.12, floor - 1), dmgMult: Math.pow(1.08, floor - 1),
    enemiesPerRoom: 3, eliteChance: 0.05, itemLevel: floor, rarityWeights: defaultRarityWeights(floor),
  };
}

describe('stats', () => {
  it('base stats match anchors', () => {
    expect(BASE_STATS.maxHp).toBe(100);
    expect(BASE_STATS.extraJumps).toBe(1);
    expect(BASE_STATS.potionCharges).toBe(3);
    expect(BASE_STATS.potionHeal).toBeCloseTo(0.4);
  });

  it('applies upgrades, relics, affixes, scrolls and clamps', () => {
    const relics = Array.from({ length: 10 }, () => makeItem('relic', 'heavy_plate'));
    const s = computeStats({
      upgrades: { vitality: 2, toughness: 5 },
      relics: [...relics, makeItem('relic', 'hourglass'), makeItem('relic', 'hourglass'), makeItem('relic', 'hourglass')],
      equipped: [makeItem('weapon', 'rusty_sword', 1, 'rare', [{ id: 'of_the_bear', value: 20 }])],
      scrolls: { might: 1, cunning: 0, vigor: 2 },
    });
    expect(s.maxHp).toBe(100 + 30 + 20 + SCROLL_HP + 2 * SCROLL_HP_VIGOR);
    expect(s.armor).toBe(0.75);
    expect(s.skillCooldownPct).toBe(0.6);
    expect(s.moveSpeedPct).toBeGreaterThanOrEqual(-0.5);
    const glass = computeStats({ upgrades: {}, relics: Array.from({ length: 5 }, () => makeItem('relic', 'glass_cannon')), equipped: [], scrolls: emptyScrolls() });
    expect(glass.maxHp).toBe(10);
  });
});

describe('damage', () => {
  const stats = { ...BASE_STATS, critChance: 0 };
  const hitsToKill = (hp: number, item: ItemInstance, rng: Rng) => {
    const combo = WEAPONS[item.defId].melee!.combo;
    let n = 0;
    while (hp > 0) {
      const step = combo[n % combo.length];
      hp -= computeHit({ baseDamage: WEAPONS[item.defId].baseDamage, mult: step.dmg, item, track: 'might', stats, scrolls: emptyScrolls(), rng, playerHpFrac: 1 }).amount;
      n++;
    }
    return n;
  };

  it('starter sword kills a 40hp floor-1 enemy in 3-4 hits', () => {
    const rng = new Rng(1);
    const sword = makeItem('weapon', 'rusty_sword', 1);
    for (let i = 0; i < 200; i++) {
      const n = hitsToKill(40, sword, rng);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(4);
    }
  });

  it('item level, rarity, scrolls and crits scale damage', () => {
    expect(itemDamageMult(makeItem('weapon', 'rusty_sword', 10))).toBeCloseTo(1 + 9 * ITEM_LEVEL_SCALING);
    expect(itemDamageMult(makeItem('weapon', 'rusty_sword', 1, 'epic', [{ id: 'brutal', value: 0.3 }]))).toBeCloseTo(1.3 * 1.3);
    const rng = new Rng(2);
    const base = { baseDamage: 10, mult: 1, track: 'might' as const, stats, rng, playerHpFrac: 1, noVariance: true };
    const a = computeHit({ ...base, scrolls: emptyScrolls() }).amount;
    const b = computeHit({ ...base, scrolls: { might: 4, cunning: 0, vigor: 0 } }).amount;
    const c = computeHit({ ...base, scrolls: emptyScrolls(), forceCrit: true });
    const low = computeHit({ ...base, stats: { ...stats, lowHpDamagePct: 0.5 }, scrolls: emptyScrolls(), playerHpFrac: 0.2 }).amount;
    expect(a).toBe(10);
    expect(b).toBe(16);
    expect(c).toEqual({ amount: 15, crit: true });
    expect(low).toBe(15);
  });

  it('armor reduces incoming damage but never below 1', () => {
    expect(enemyDamageToPlayer(20, { ...BASE_STATS, armor: 0.5 })).toBe(10);
    expect(enemyDamageToPlayer(1, { ...BASE_STATS, armor: 0.75 })).toBe(1);
  });
});

describe('RunState', () => {
  it('creates from save with loadout and meta upgrades', () => {
    const save = defaultSave();
    save.upgrades = { vitality: 1, flask: 1, purse: 2 };
    save.loadout = { weapon: 'hunter_bow', skill: 'frost_nova' };
    const run = RunState.create(123, save);
    expect(run.weapons[0]?.defId).toBe('hunter_bow');
    expect(run.weapons[0]?.rarity).toBe('common');
    expect(run.skills[0]?.defId).toBe('frost_nova');
    expect(run.stats.maxHp).toBe(115);
    expect(run.hp).toBe(115);
    expect(run.potions).toBe(4);
    expect(run.startingCoins).toBe(40);
  });

  it('equips into free slots, then requires a slot', () => {
    const run = RunState.create(1, defaultSave());
    const bow = makeItem('weapon', 'hunter_bow');
    expect(run.equip(bow)).toEqual({ replaced: null, slot: 1 });
    const spear = makeItem('weapon', 'spear');
    expect(run.equip(spear)).toEqual({ replaced: null, slot: -1 });
    const res = run.equip(spear, 0);
    expect(res.slot).toBe(0);
    expect(res.replaced?.defId).toBe('rusty_sword');
    const r = run.equip(makeItem('relic', 'iron_heart'));
    expect(r.slot).toBe(0);
    expect(run.stats.maxHp).toBe(130);
    expect(run.hp).toBe(130);
  });

  it('scrolls raise max HP and heal the difference', () => {
    const run = RunState.create(1, defaultSave());
    run.damage(50);
    expect(run.addScroll('vigor')).toBe(1);
    expect(run.stats.maxHp).toBe(100 + SCROLL_HP_VIGOR);
    expect(run.hp).toBe(50 + SCROLL_HP_VIGOR);
    run.addScroll('might');
    expect(run.stats.maxHp).toBe(100 + SCROLL_HP_VIGOR + SCROLL_HP);
  });

  it('potions heal and refill; revive works', () => {
    const run = RunState.create(1, defaultSave());
    expect(run.usePotion()).toBe(0); // full HP
    run.damage(90);
    expect(run.usePotion()).toBe(40);
    expect(run.potions).toBe(2);
    run.refillPotions();
    expect(run.potions).toBe(3);
    run.damage(999);
    expect(run.isDead).toBe(true);
    expect(run.tryRevive()).toBe(false);
    run.equip(makeItem('relic', 'phoenix_feather'));
    expect(run.tryRevive(0.5)).toBe(true);
    expect(run.hp).toBe(50);
    expect(run.tryRevive()).toBe(false);
  });

  it('embers bank and records report depth', () => {
    const run = RunState.create(7, defaultSave());
    run.addEmbers(3);
    expect(run.bankEmbers()).toBe(3);
    expect(run.emberUnbanked).toBe(0);
    run.enterFloor(4);
    run.enterFloor(3);
    run.addKill();
    const rec = run.toRecord('Shambler');
    expect(rec.depth).toBe(4);
    expect(rec.kills).toBe(1);
    expect(rec.weapon).toBe('rusty_sword');
  });
});

describe('economy', () => {
  it('prices scale with rarity, level and discount', () => {
    const c = makeItem('weapon', 'spear', 1, 'common');
    const l = makeItem('weapon', 'spear', 10, 'legendary');
    // Balance pass: prices track per-floor coin income (see balance.test.ts).
    expect(itemPrice(c)).toBe(Math.round(BASE_ITEM_PRICE.weapon / 5) * 5);
    expect(itemPrice(l)).toBeGreaterThan(itemPrice(c) * 5);
    expect(itemPrice(c, { shopDiscount: 0.25 })).toBe(20);
    expect(potionRefillPrice(5)).toBe(105);
    expect(rerollPrice(1, 1)).toBe(rerollPrice(1, 0) * 2);
    expect(metaUpgradeCost(META_UPGRADES.vitality, 5)).toBe(Infinity);
    expect(canAfford(100, Infinity)).toBe(false);
  });

  it('first meta tier is affordable within ~1-3 runs reaching floor 3-5; full meta takes many runs', () => {
    // Model: ~14 enemies per floor from the floor's biome plus ~1.5 chests per floor.
    const rng = new Rng(11);
    const cells = Object.values(ENEMIES).filter((e) => e.biomes.includes('cells') && e.minFloor <= 3);
    const floorCoins = (f: number) => {
      let c = 0;
      for (let i = 0; i < 14; i++) c += rollEnemyCoins(rng, rng.pick(cells), diff(f), rng.chance(0.08));
      c += 1.5 * chestContents(rng, diff(f), DEFAULT_UNLOCKS).coins;
      return c;
    };
    const f1 = floorCoins(1);
    // Balance pass raised early coin drops (floor 1 ≈ 60–120 with 14 enemies).
    expect(f1).toBeGreaterThanOrEqual(40);
    expect(f1).toBeLessThanOrEqual(130);
    const runTo = (depth: number) => { let t = 0; for (let f = 1; f <= depth; f++) t += floorCoins(f); return t; };
    const runCoins = (runTo(3) + runTo(4) + runTo(5)) / 3;
    const firstTiers = Object.values(META_UPGRADES).map((m) => m.costs[0]).sort((a, b) => a - b);
    expect(runCoins * 3).toBeGreaterThanOrEqual(firstTiers[0]);
    expect(runCoins).toBeLessThan(firstTiers[firstTiers.length - 1] * 1.5);
    expect(totalMetaCost(Object.values(META_UPGRADES)) / runCoins).toBeGreaterThan(30);
  });
});
