import { describe, expect, it } from 'vitest';
import { Rng, floorSeed } from '../../src/core/rng';
import { MemoryStorage, SaveManager, compareRuns, defaultSave, normalizeSave, recordRun, DEFAULT_UNLOCKS } from '../../src/core/save';
import type { RunRecord } from '../../src/data/types';

describe('Rng', () => {
  it('is deterministic per seed', () => {
    const a = new Rng(42), b = new Rng(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });
  it('int stays in range and covers both ends', () => {
    const r = new Rng(1);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = r.int(2, 5);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(5);
      seen.add(v);
    }
    expect([...seen].sort()).toEqual([2, 3, 4, 5]);
  });
  it('weighted never picks zero weight', () => {
    const r = new Rng(7);
    for (let i = 0; i < 500; i++) expect(r.weighted(['a', 'b', 'c'], (x) => (x === 'b' ? 0 : 1))).not.toBe('b');
  });
  it('floorSeed differs per floor', () => {
    expect(floorSeed(1, 1)).not.toBe(floorSeed(1, 2));
  });
});

const run = (depth: number, kills = 0, timeMs = 1000): RunRecord => ({
  depth, kills, timeMs, coins: 0, date: '2026-01-01', seed: 1, cause: 'x', weapon: 'rusty_sword',
});

describe('save', () => {
  it('round-trips through storage', () => {
    const st = new MemoryStorage();
    const m = new SaveManager(st);
    m.data.coins = 123;
    m.data.upgrades.vitality = 2;
    m.save();
    const m2 = new SaveManager(st);
    expect(m2.data.coins).toBe(123);
    expect(m2.data.upgrades.vitality).toBe(2);
  });
  it('normalizes garbage and old versions', () => {
    expect(normalizeSave(null)).toEqual(defaultSave());
    const old = normalizeSave({ coins: 50, unlocked: ['meteor'] });
    expect(old.coins).toBe(50);
    expect(old.unlocked).toContain('meteor');
    for (const id of DEFAULT_UNLOCKS) expect(old.unlocked).toContain(id);
    expect(old.settings.master).toBeTypeOf('number');
  });
  it('survives corrupted JSON', () => {
    const st = new MemoryStorage();
    st.setItem('hollow-spire-save', '{not json');
    expect(new SaveManager(st).data).toEqual(defaultSave());
  });
  it('keeps history sorted and capped', () => {
    const s = defaultSave();
    for (let i = 0; i < 15; i++) recordRun(s, run(i % 7, i));
    expect(s.history).toHaveLength(10);
    for (let i = 1; i < s.history.length; i++) expect(compareRuns(s.history[i - 1], s.history[i])).toBeLessThanOrEqual(0);
    expect(s.stats.deepest).toBe(6);
    expect(s.stats.runs).toBe(15);
  });
});
