/**
 * Balance targets, pinned against the analytical model in src/run/balanceModel.ts.
 * Print the full tables with:  BALANCE_TABLE=1 npx vitest run tests/unit/balance.test.ts
 */
import { describe, expect, it } from 'vitest';
import * as M from '../../src/run/balanceModel';
import { isBossFloor } from '../../src/world/difficulty';
import { SCROLL_TRACK_DAMAGE } from '../../src/run/stats';

const R = (f: number, p: M.SaveProfile = 'new') => M.floorReport(f, p);
const sim = M.simulateRuns(60);
const firstRunWhere = (pred: (r: M.RunSim) => boolean) => sim.find(pred)?.run ?? Infinity;

describe('balance: combat curve', () => {
  it('floor 1 is a fair start: ~3 sword hits per enemy, hits take ~8-12% HP', () => {
    const r = R(1);
    expect(r.hitsNormal).toBeGreaterThanOrEqual(2.4);
    expect(r.hitsNormal).toBeLessThanOrEqual(4);
    expect(r.hitPct).toBeGreaterThanOrEqual(0.08);
    expect(r.hitPct).toBeLessThanOrEqual(0.12);
  });

  it('floors 1-5 are forgiving for a fresh save', () => {
    for (let f = 1; f <= 5; f++) {
      expect(R(f).hitPct).toBeLessThanOrEqual(0.13);
      expect(R(f).surviveSec).toBeGreaterThan(30);
    }
  });

  it('the first boss is beatable on a first or second run', () => {
    const r = R(5);
    expect(r.bossTtk!).toBeGreaterThanOrEqual(45);
    expect(r.bossTtk!).toBeLessThanOrEqual(75);
    expect(r.bossBarSec!).toBeGreaterThanOrEqual(20);
    expect(r.bossBarSec!).toBeLessThanOrEqual(30);
  });

  it('difficulty grows smoothly (no cliffs within a loop)', () => {
    for (let f = 2; f <= 20; f++) {
      const a = R(f - 1), b = R(f);
      expect(b.hitPct / a.hitPct).toBeLessThan(1.35);
      expect(b.hitPct / a.hitPct).toBeGreaterThan(0.85);
      expect(b.hitsNormal / a.hitsNormal).toBeLessThan(1.45);
    }
  });

  it('a fresh save is clearly outscaled by floors 17-20', () => {
    expect(R(17).hitPct).toBeGreaterThanOrEqual(0.2);
    for (const f of [19, 20]) {
      expect(R(f).hitPct).toBeGreaterThanOrEqual(0.25);
      expect(R(f).hitPct).toBeLessThanOrEqual(0.38);
    }
    expect(R(20).hitsNormal).toBeGreaterThan(R(5).hitsNormal * 1.6);
  });

  it('a late save can push to floors 20-30', () => {
    expect(R(20, 'late').bossTtk!).toBeLessThanOrEqual(75);
    expect(R(25, 'late').surviveSec).toBeGreaterThanOrEqual(25);
    expect(R(28, 'late').hitsNormal).toBeLessThanOrEqual(10);
    // Meta upgrades matter: late beats new on every axis.
    expect(R(20, 'late').surviveSec).toBeGreaterThan(R(20, 'new').surviveSec * 2);
  });

  it('the Ascension loop is a step up in difficulty', () => {
    expect(R(22).hitsNormal).toBeGreaterThan(R(20).hitsNormal);
    expect(R(25).bossTtk!).toBeGreaterThan(R(20).bossTtk! * 1.5);
  });

  it('no regular enemy (elite included) one-shots a fresh save before floor 25', () => {
    for (let f = 1; f < 25; f++) if (!isBossFloor(f)) expect(R(f).maxHitPct).toBeLessThan(0.75);
  });

  it('scrolls are the main power source', () => {
    expect(SCROLL_TRACK_DAMAGE).toBeGreaterThanOrEqual(0.1);
    const sc = M.scrollSplit(M.expectedScrolls(15));
    expect(1 + SCROLL_TRACK_DAMAGE * sc.might).toBeGreaterThanOrEqual(2);
  });
});

describe('balance: economy', () => {
  it('merchant items cost ~60-120% of a floor of coins', () => {
    for (let f = 1; f <= 20; f++) {
      const ratio = M.avgMerchantPrice(f) / M.regularFloorIncome(f);
      expect(ratio, `floor ${f}`).toBeGreaterThanOrEqual(0.6);
      expect(ratio, `floor ${f}`).toBeLessThanOrEqual(1.3);
    }
  });

  it('first meaningful upgrades arrive within ~3-5 runs', () => {
    expect(sim[0].coins).toBeGreaterThanOrEqual(80);
    expect(firstRunWhere((r) => r.upgradesOwned >= 1)).toBeLessThanOrEqual(3);
    const at5 = sim[4].upgradesOwned;
    expect(at5).toBeGreaterThanOrEqual(2);
    expect(at5).toBeLessThanOrEqual(5);
  });

  it('blueprints unlock over ~15-25 runs', () => {
    const all = firstRunWhere((r) => r.blueprintsOwned >= sim[sim.length - 1].blueprintsOwned);
    expect(all).toBeGreaterThanOrEqual(15);
    expect(all).toBeLessThanOrEqual(25);
  });

  it('the full meta shop is a 40+ run goal', () => {
    const full = M.metaCostList().length;
    expect(firstRunWhere((r) => r.upgradesOwned >= full)).toBeGreaterThanOrEqual(38);
  });
});

if (process.env.BALANCE_TABLE) {
  it('prints balance tables', () => {
    const fmt = (n: number | undefined, d = 1) => (n === undefined ? '-' : n.toFixed(d)).padStart(6);
    for (const prof of ['new', 'mid', 'late'] as const) {
      console.log(`\n== ${prof} ==\n  f    scr     hp   hits   ttkN   ttkE   hit%   max%   surv bossTTK bossBar`);
      for (const f of [1, 2, 3, 4, 5, 8, 10, 12, 15, 17, 20, 22, 25, 30]) {
        const r = M.floorReport(f, prof);
        console.log(`${String(f).padStart(3)} ${fmt(r.scrolls)} ${fmt(r.maxHp, 0)} ${fmt(r.hitsNormal)} ${fmt(r.ttkNormal)} ${fmt(r.ttkElite)} ${fmt(r.hitPct * 100, 0)} ${fmt(r.maxHitPct * 100, 0)} ${fmt(r.surviveSec)} ${fmt(r.bossTtk)} ${fmt(r.bossBarSec)}`);
      }
    }
    console.log('\n  f  coins embers  shop  ratio');
    for (const f of [1, 2, 3, 4, 5, 8, 10, 12, 15, 17, 20, 25])
      console.log(`${String(f).padStart(3)} ${fmt(M.coinsPerFloor(f), 0)} ${fmt(M.embersPerFloor(f))} ${fmt(M.avgMerchantPrice(f), 0)} ${fmt(M.avgMerchantPrice(f) / M.regularFloorIncome(f), 2)}`);
    console.log(`\nrun  depth  coins embers   upg wallet    bp   (meta total ${M.metaCostList().reduce((a, b) => a + b, 0)}, unlocks ${M.totalUnlockCost()})`);
    for (const r of sim) if (r.run <= 6 || r.run % 5 === 0) console.log(`${String(r.run).padStart(3)} ${fmt(r.depth)} ${fmt(r.coins, 0)} ${fmt(r.embers)} ${fmt(r.upgradesOwned, 0)} ${fmt(r.wallet, 0)} ${fmt(r.blueprintsOwned, 0)}`);
  });
}
