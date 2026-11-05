import { describe, expect, it } from 'vitest';
import { DOOR_SIDE_Y0, DOOR_SIDE_Y1, DOOR_VERT_X0, DOOR_VERT_X1, ROOM_H, ROOM_W } from '../../src/config';
import { floorSeed } from '../../src/core/rng';
import { BIOME_ORDER, Tile, type RoomType } from '../../src/data/types';
import { biomeForFloor, getDifficulty, isBossFloor } from '../../src/world/difficulty';
import { generateFloor, templatesFor } from '../../src/world/FloorGenerator';
import { LEGEND, ROOMS } from '../../src/world/rooms';
import { validateFloor } from '../../src/world/validate';
import { backFrames, frontFrames, solidMask } from '../../src/world/autotile';

describe('room templates', () => {
  it('has at least 25 templates with unique ids', () => {
    expect(ROOMS.length).toBeGreaterThanOrEqual(25);
    expect(new Set(ROOMS.map((r) => r.id)).size).toBe(ROOMS.length);
  });

  for (const t of ROOMS) {
    it(`${t.id} is well-formed`, () => {
      expect(t.rows).toHaveLength(ROOM_H);
      for (const row of t.rows) {
        expect(row).toHaveLength(ROOM_W);
        for (const ch of row) expect(LEGEND).toContain(ch);
      }
      const at = (x: number, y: number) => t.rows[y][x];
      for (let x = 0; x < ROOM_W; x++) {
        expect(at(x, 0)).toBe('#');
        expect(at(x, ROOM_H - 1)).toBe('#');
      }
      for (let y = 0; y < ROOM_H; y++) {
        expect(at(0, y)).toBe('#');
        expect(at(ROOM_W - 1, y)).toBe('#');
      }
      const clear = (ch: string) => !'#-^H'.includes(ch);
      if (t.doors.includes('L')) {
        for (let y = DOOR_SIDE_Y0; y <= DOOR_SIDE_Y1; y++) for (let x = 1; x <= 3; x++) expect(clear(at(x, y)), `L zone ${x},${y}`).toBe(true);
        for (let x = 0; x <= 3; x++) expect(at(x, ROOM_H - 2)).toBe('#');
      }
      if (t.doors.includes('R')) {
        for (let y = DOOR_SIDE_Y0; y <= DOOR_SIDE_Y1; y++) for (let x = ROOM_W - 4; x <= ROOM_W - 2; x++) expect(clear(at(x, y)), `R zone ${x},${y}`).toBe(true);
        for (let x = ROOM_W - 4; x < ROOM_W; x++) expect(at(x, ROOM_H - 2)).toBe('#');
      }
      if (t.doors.includes('T')) {
        for (let y = 1; y <= ROOM_H - 3; y++) for (let x = DOOR_VERT_X0; x <= DOOR_VERT_X1; x++) expect(clear(at(x, y)), `T shaft ${x},${y}`).toBe(true);
        for (let x = DOOR_VERT_X0; x <= DOOR_VERT_X1; x++) expect(at(x, ROOM_H - 2)).toBe('#');
      }
      if (t.doors.includes('B')) {
        for (let x = DOOR_VERT_X0 - 1; x <= DOOR_VERT_X1 + 1; x++) expect(at(x, ROOM_H - 2)).toBe('#');
        for (const x of [DOOR_VERT_X0 - 1, DOOR_VERT_X1 + 1]) for (const y of [ROOM_H - 3, ROOM_H - 4]) expect(clear(at(x, y))).toBe(true);
        for (let x = DOOR_VERT_X0; x <= DOOR_VERT_X1; x++) for (let y = DOOR_SIDE_Y0; y <= DOOR_SIDE_Y1; y++) expect(clear(at(x, y))).toBe(true);
      }
      const count = (ch: string) => t.rows.join('').split(ch).length - 1;
      if (t.type === 'start') expect(count('P')).toBe(1);
      if (t.type === 'exit') expect(count('X')).toBe(1);
      if (t.type === 'treasure') expect(count('C')).toBe(1);
      if (t.type === 'merchant') expect(count('M')).toBe(1);
      if (t.type === 'altar') expect(count('A')).toBe(1);
      if (t.type === 'boss') expect(count('B')).toBe(1);
    });
  }

  it('every room type has an all-door template in every biome', () => {
    const types: RoomType[] = ['start', 'exit', 'combat', 'treasure', 'merchant', 'altar', 'corridor'];
    for (const b of BIOME_ORDER) for (const ty of types) expect(templatesFor(ty, ['L', 'R', 'T', 'B'], b).length, `${ty}/${b}`).toBeGreaterThan(0);
    for (const b of BIOME_ORDER) expect(templatesFor('boss', ['L', 'R'], b).length).toBeGreaterThan(0);
  });
});

describe('difficulty', () => {
  it('maps floors to biomes and bosses', () => {
    expect(biomeForFloor(1)).toBe('cells');
    expect(biomeForFloor(5)).toBe('cells');
    expect(biomeForFloor(6)).toBe('ramparts');
    expect(biomeForFloor(15)).toBe('library');
    expect(biomeForFloor(20)).toBe('throne');
    expect(biomeForFloor(21)).toBe('cells');
    expect(isBossFloor(5)).toBe(true);
    expect(isBossFloor(10)).toBe(true);
    expect(isBossFloor(11)).toBe(false);
  });

  it('is monotonic with depth', () => {
    let prev = getDifficulty(1);
    expect(prev.hpMult).toBeCloseTo(1);
    expect(prev.eliteChance).toBeCloseTo(0.05);
    for (let f = 2; f <= 60; f++) {
      const d = getDifficulty(f);
      expect(d.hpMult).toBeGreaterThan(prev.hpMult);
      expect(d.dmgMult).toBeGreaterThan(prev.dmgMult);
      expect(d.enemiesPerRoom).toBeGreaterThanOrEqual(prev.enemiesPerRoom);
      expect(d.eliteChance).toBeGreaterThanOrEqual(prev.eliteChance);
      const share = (x: typeof d) => x.rarityWeights.legendary / Object.values(x.rarityWeights).reduce((a, b) => a + b, 0);
      expect(share(d)).toBeGreaterThanOrEqual(share(prev));
      prev = d;
    }
    expect(getDifficulty(60).eliteChance).toBe(0.5);
    expect(getDifficulty(60).enemiesPerRoom).toBeLessThanOrEqual(8);
    expect(getDifficulty(21).hpMult / getDifficulty(20).hpMult).toBeCloseTo(1.12 * 1.5);
  });
});

describe('floor generation', () => {
  it('is deterministic per seed', () => {
    const a = generateFloor(7, 12345);
    const b = generateFloor(7, 12345);
    expect(b).toEqual(a);
    const c = generateFloor(7, 54321);
    expect(c.tiles).not.toEqual(a.tiles);
  });

  it('builds boss floors as start → corridor → boss → exit', () => {
    const l = generateFloor(5, 99);
    expect(l.isBoss).toBe(true);
    expect(l.rooms.map((r) => r.type)).toEqual(['start', 'corridor', 'boss', 'exit']);
    expect(l.spawns.filter((s) => s.kind === 'boss')).toHaveLength(1);
    expect(l.spawns.filter((s) => s.kind === 'enemy' || s.kind === 'flyer')).toHaveLength(0);
  });

  it('produces valid, fully reachable floors for 1000 seeds across floors 1..40', () => {
    const failures: string[] = [];
    for (let i = 0; i < 1000; i++) {
      const floor = 1 + (i % 40);
      const seed = floorSeed(0xbeef + i, floor);
      const l = generateFloor(floor, seed);
      const v = validateFloor(l);
      const types = l.rooms.map((r) => r.type);
      const n = (t: RoomType) => types.filter((x) => x === t).length;
      const problems = [...v.errors];
      if (l.tiles.length !== l.width * l.height) problems.push('tile array size');
      if (n('start') !== 1 || n('exit') !== 1) problems.push('start/exit count');
      if (l.playerStart.tx === l.exit.tx && l.playerStart.ty === l.exit.ty) problems.push('exit == start');
      const startRoom = l.rooms[0];
      if (!startRoom || startRoom.type !== 'start') problems.push('rooms[0] must be start');
      const tpl = ROOMS.find((t) => t.id === startRoom.templateId)!;
      if (!tpl.rows.join('').includes('P')) problems.push('start template lacks P');
      if (!l.isBoss) {
        if (n('treasure') < 1) problems.push('no treasure');
        if (n('altar') < 1) problems.push('no altar');
        const exitRoom = l.rooms.find((r) => r.type === 'exit')!;
        if (exitRoom.depth < 3) problems.push(`exit too close (${exitRoom.depth})`);
      }
      if (l.spawns.some((s) => s.room === 0 && (s.kind === 'enemy' || s.kind === 'flyer'))) problems.push('enemies in start room');
      if (problems.length) failures.push(`floor ${floor} seed ${seed}: ${problems.join('; ')}`);
    }
    expect(failures.slice(0, 15)).toEqual([]);
  }, 120_000);

  it('spawns roughly enemiesPerRoom enemies in combat rooms', () => {
    for (const floor of [1, 9, 19, 33]) {
      const l = generateFloor(floor, floorSeed(77, floor));
      const want = getDifficulty(floor).enemiesPerRoom;
      l.rooms.forEach((r, i) => {
        if (r.type !== 'combat') return;
        const n = l.spawns.filter((s) => s.room === i && (s.kind === 'enemy' || s.kind === 'flyer')).length;
        expect(n).toBeGreaterThanOrEqual(Math.max(1, want - 2));
        expect(n).toBeLessThanOrEqual(want + 1);
      });
      for (const s of l.spawns) {
        if (s.kind === 'enemy') expect(l.tiles[(s.ty + 1) * l.width + s.tx]).not.toBe(Tile.Empty);
      }
    }
  });
});

describe('autotiling', () => {
  it('computes masks and frames', () => {
    const l = generateFloor(3, 4242);
    const front = frontFrames(l);
    const back = backFrames(l);
    expect(front).toHaveLength(l.height);
    expect(front[0]).toHaveLength(l.width);
    expect(back).toHaveLength(l.height);
    // Top-left corner: out of bounds counts as solid, so N and W are set.
    expect(solidMask(l, 0, 0) & 9).toBe(9);
    for (let y = 0; y < l.height; y++)
      for (let x = 0; x < l.width; x++) {
        const t = l.tiles[y * l.width + x];
        if (t === Tile.Empty) expect(front[y][x]).toBe(-1);
        else expect(front[y][x]).toBeGreaterThanOrEqual(0);
      }
  });
});
