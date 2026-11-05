/**
 * Procedural floor generation. Pure and deterministic per (floor, seed).
 *
 * A floor is a grid of fixed-size room cells (ROOM_W x ROOM_H tiles). A main
 * path runs from the start room to the exit room; side branches hold the
 * treasure / merchant / altar rooms. Room templates are stitched into a single
 * tile array, door openings are carved between connected rooms, and a ladder
 * is dropped through every vertical connection so it can be climbed back up.
 */
import {
  DOOR_SIDE_Y0,
  DOOR_SIDE_Y1,
  DOOR_VERT_X0,
  DOOR_VERT_X1,
  ROOM_H,
  ROOM_W,
} from '../config';
import { Rng } from '../core/rng';
import {
  Tile,
  type BiomeId,
  type Door,
  type FloorLayout,
  type PlacedRoom,
  type RoomTemplate,
  type RoomType,
  type Spawn,
  type SpawnKind,
  type TileId,
} from '../data/types';
import { getDifficulty, gridSizeForFloor } from './difficulty';
import { ROOMS } from './rooms';

export const OPPOSITE: Record<Door, Door> = { L: 'R', R: 'L', T: 'B', B: 'T' };
const DIRS: { door: Door; dx: number; dy: number }[] = [
  { door: 'L', dx: -1, dy: 0 },
  { door: 'R', dx: 1, dy: 0 },
  { door: 'T', dx: 0, dy: -1 },
  { door: 'B', dx: 0, dy: 1 },
];

/** Column of the ladder dropped through vertical connections. */
export const SHAFT_LADDER_X = DOOR_VERT_X0;

const CHAR_TILE: Record<string, TileId> = {
  '#': Tile.Solid,
  '-': Tile.Platform,
  '^': Tile.Spikes,
  H: Tile.Ladder,
};

const MARKER_SPAWN: Record<string, SpawnKind | undefined> = {
  E: 'enemy',
  F: 'flyer',
  C: 'chest',
  M: 'merchant',
  A: 'altar',
  o: 'coin',
  B: 'boss',
  t: 'torch',
  w: 'banner',
};

/** Room types that receive enemies from their 'E'/'F' markers. */
const ENEMY_ROOMS: ReadonlySet<RoomType> = new Set<RoomType>(['combat', 'treasure']);

interface Cell {
  gx: number;
  gy: number;
}
interface GraphRoom extends Cell {
  type: RoomType;
  doors: Set<Door>;
}

const key = (gx: number, gy: number) => `${gx},${gy}`;

export function templatesFor(type: RoomType, doors: Iterable<Door>, biome: BiomeId): RoomTemplate[] {
  const need = [...doors];
  return ROOMS.filter(
    (t) => t.type === type && need.every((d) => t.doors.includes(d)) && (!t.biomes || t.biomes.includes(biome)),
  );
}

/** Self-avoiding path of `len` cells via randomized DFS with backtracking. */
function findPath(rng: Rng, w: number, h: number, len: number): Cell[] {
  let best: Cell[] = [];
  let budget = 20000;
  const visited = new Set<string>();
  const path: Cell[] = [];

  const dfs = (c: Cell): boolean => {
    if (--budget < 0) return false;
    path.push(c);
    visited.add(key(c.gx, c.gy));
    if (path.length > best.length) best = [...path];
    if (path.length >= len) return true;
    // Prefer horizontal moves (rooms read as wide castle halls) but allow vertical.
    const dirs = DIRS.map((d) => ({ d, k: weightDir(d) + rng.next() * 1.5 }))
      .sort((a, b) => b.k - a.k)
      .map((x) => x.d);
    for (const d of dirs) {
      const n: Cell = { gx: c.gx + d.dx, gy: c.gy + d.dy };
      if (n.gx < 0 || n.gy < 0 || n.gx >= w || n.gy >= h || visited.has(key(n.gx, n.gy))) continue;
      if (dfs(n)) return true;
    }
    path.pop();
    visited.delete(key(c.gx, c.gy));
    return false;
  };

  const start = { gx: rng.int(0, w - 1), gy: rng.int(0, Math.max(0, Math.floor((h - 1) / 2))) };
  dfs(start);
  return path.length >= len ? path : best;
}

function weightDir(d: { dx: number; dy: number }): number {
  if (d.dy === 1) return 0.8; // descending feels right in a sinking spire
  if (d.dy === -1) return 0.2;
  return 1;
}

function connect(a: GraphRoom, b: GraphRoom): void {
  const dx = b.gx - a.gx;
  const dy = b.gy - a.gy;
  const d = DIRS.find((x) => x.dx === dx && x.dy === dy);
  if (!d) throw new Error('connect: rooms not adjacent');
  a.doors.add(d.door);
  b.doors.add(OPPOSITE[d.door]);
}

/** Build the room graph for a normal floor. */
function buildNormalGraph(rng: Rng, floor: number): { w: number; h: number; rooms: GraphRoom[] } {
  const { w, h } = gridSizeForFloor(floor);
  const cells = w * h;
  const pathLen = Math.min(10, cells - 5, 4 + Math.floor((floor - 1) / 3));
  const path = findPath(rng, w, h, pathLen);

  const rooms: GraphRoom[] = [];
  const at = new Map<string, GraphRoom>();
  const add = (c: Cell, type: RoomType): GraphRoom => {
    const r: GraphRoom = { gx: c.gx, gy: c.gy, type, doors: new Set() };
    rooms.push(r);
    at.set(key(c.gx, c.gy), r);
    return r;
  };

  path.forEach((c, i) => {
    const type: RoomType =
      i === 0 ? 'start' : i === path.length - 1 ? 'exit' : rng.chance(0.12) ? 'corridor' : 'combat';
    const r = add(c, type);
    if (i > 0) connect(rooms[i - 1], r);
  });

  const freeNeighbours = (r: GraphRoom): Cell[] =>
    DIRS.map((d) => ({ gx: r.gx + d.dx, gy: r.gy + d.dy })).filter(
      (n) => n.gx >= 0 && n.gy >= 0 && n.gx < w && n.gy < h && !at.has(key(n.gx, n.gy)),
    );

  /** Attach a branch ending in `type`, optionally via one combat room. Returns success. */
  const attach = (type: RoomType, allowVia: boolean): boolean => {
    const hosts = rooms.filter(
      (r) => (r.type === 'combat' || r.type === 'corridor' || r.type === 'start') && freeNeighbours(r).length > 0,
    );
    const fallbackHosts = rooms.filter((r) => freeNeighbours(r).length > 0);
    const pool = hosts.length ? hosts : fallbackHosts;
    if (!pool.length) return false;
    const host = rng.pick(pool);
    const first = rng.pick(freeNeighbours(host));
    if (allowVia && rng.chance(0.4)) {
      const via = add(first, 'combat');
      connect(host, via);
      const next = freeNeighbours(via);
      if (next.length) {
        const end = add(rng.pick(next), type);
        connect(via, end);
        return true;
      }
      via.type = type; // could not extend: the via room becomes the special room
      return true;
    }
    const end = add(first, type);
    connect(host, end);
    return true;
  };

  const specials: RoomType[] = ['treasure', 'altar'];
  if (rng.chance(0.8) || floor % 5 === 4) specials.push('merchant');
  if (rng.chance(Math.min(0.5, 0.1 + floor * 0.02))) specials.push('treasure');
  if (rng.chance(0.35)) specials.push('altar');
  const extraCombat = rng.int(0, Math.min(2, Math.floor(floor / 4)));
  for (const s of specials) attach(s, true);
  for (let i = 0; i < extraCombat; i++) attach('combat', false);

  // Occasional loop between adjacent rooms on similar depth.
  if (rng.chance(0.3)) {
    const candidates: [GraphRoom, GraphRoom][] = [];
    for (const r of rooms) {
      for (const d of DIRS) {
        const n = at.get(key(r.gx + d.dx, r.gy + d.dy));
        if (!n || r.doors.has(d.door)) continue;
        const ok = (x: GraphRoom) => x.type === 'combat' || x.type === 'corridor';
        if (ok(r) && ok(n)) candidates.push([r, n]);
      }
    }
    if (candidates.length) {
      const [a, b] = rng.pick(candidates);
      connect(a, b);
    }
  }
  return { w, h, rooms };
}

/** Boss floors: start → corridor → boss arena → exit, in one row. */
function buildBossGraph(): { w: number; h: number; rooms: GraphRoom[] } {
  const types: RoomType[] = ['start', 'corridor', 'boss', 'exit'];
  const rooms: GraphRoom[] = types.map((type, i) => ({ gx: i, gy: 0, type, doors: new Set<Door>() }));
  for (let i = 1; i < rooms.length; i++) connect(rooms[i - 1], rooms[i]);
  return { w: rooms.length, h: 1, rooms };
}

function bfsDepths(rooms: GraphRoom[]): number[] {
  const at = new Map(rooms.map((r, i) => [key(r.gx, r.gy), i]));
  const depth = rooms.map(() => -1);
  depth[0] = 0;
  const q = [0];
  while (q.length) {
    const i = q.shift()!;
    const r = rooms[i];
    for (const d of DIRS) {
      if (!r.doors.has(d.door)) continue;
      const j = at.get(key(r.gx + d.dx, r.gy + d.dy));
      if (j !== undefined && depth[j] < 0) {
        depth[j] = depth[i] + 1;
        q.push(j);
      }
    }
  }
  return depth;
}

export function generateFloor(floor: number, seed: number): FloorLayout {
  const rng = new Rng(seed);
  const diff = getDifficulty(floor);
  const biome = diff.biome;
  const graph = diff.isBoss ? buildBossGraph() : buildNormalGraph(rng, floor);
  const { w: gridW, h: gridH, rooms: groom } = graph;
  const width = gridW * ROOM_W;
  const height = gridH * ROOM_H;
  const tiles: TileId[] = new Array(width * height).fill(Tile.Solid);
  const set = (x: number, y: number, t: TileId) => {
    if (x >= 0 && y >= 0 && x < width && y < height) tiles[y * width + x] = t;
  };
  const get = (x: number, y: number): TileId =>
    x < 0 || y < 0 || x >= width || y >= height ? Tile.Solid : tiles[y * width + x];

  const depths = bfsDepths(groom);
  const used = new Map<string, number>();
  const rooms: PlacedRoom[] = [];
  const spawns: Spawn[] = [];
  const markers: { kind: SpawnKind; tx: number; ty: number; room: number }[] = [];
  let playerStart = { tx: 2, ty: ROOM_H - 3 };
  let exit = { tx: ROOM_W - 3, ty: ROOM_H - 3 };

  groom.forEach((g, idx) => {
    let cands = templatesFor(g.type, g.doors, biome);
    if (!cands.length && g.type === 'corridor') cands = templatesFor('combat', g.doors, biome);
    if (!cands.length && g.type === 'boss') cands = ROOMS.filter((t) => t.type === 'boss');
    if (!cands.length) throw new Error(`No template for ${g.type} with doors ${[...g.doors].join('')}`);
    const fresh = cands.filter((t) => !used.has(t.id));
    const tpl = rng.pick(fresh.length ? fresh : cands);
    used.set(tpl.id, (used.get(tpl.id) ?? 0) + 1);

    const ox = g.gx * ROOM_W;
    const oy = g.gy * ROOM_H;
    for (let y = 0; y < ROOM_H; y++) {
      const row = tpl.rows[y];
      for (let x = 0; x < ROOM_W; x++) {
        const ch = row[x];
        const border = x === 0 || y === 0 || x === ROOM_W - 1 || y === ROOM_H - 1;
        const t = border ? Tile.Solid : (CHAR_TILE[ch] ?? Tile.Empty);
        set(ox + x, oy + y, t);
        if (border) continue;
        if (ch === 'P') {
          if (g.type === 'start') playerStart = { tx: ox + x, ty: oy + y };
        } else if (ch === 'X') {
          if (g.type === 'exit') exit = { tx: ox + x, ty: oy + y };
        } else {
          const kind = MARKER_SPAWN[ch];
          if (kind) markers.push({ kind, tx: ox + x, ty: oy + y, room: idx });
        }
      }
    }
    rooms.push({ gx: g.gx, gy: g.gy, type: g.type, templateId: tpl.id, doors: [...g.doors].sort(), depth: depths[idx] });
  });

  // Carve door openings.
  groom.forEach((g) => {
    const ox = g.gx * ROOM_W;
    const oy = g.gy * ROOM_H;
    for (const d of g.doors) {
      if (d === 'L' || d === 'R') {
        const x = d === 'L' ? ox : ox + ROOM_W - 1;
        for (let y = DOOR_SIDE_Y0; y <= DOOR_SIDE_Y1; y++) set(x, oy + y, Tile.Empty);
      } else if (d === 'T') {
        for (let x = DOOR_VERT_X0; x <= DOOR_VERT_X1; x++) set(ox + x, oy, Tile.Empty);
      } else {
        for (let x = DOOR_VERT_X0; x <= DOOR_VERT_X1; x++) {
          set(ox + x, oy + ROOM_H - 2, Tile.Empty);
          set(ox + x, oy + ROOM_H - 1, Tile.Empty);
        }
      }
    }
  });

  // Ladders through vertical connections: from just above the upper room's floor
  // hole down to the first surface below.
  groom.forEach((g) => {
    if (!g.doors.has('B')) return;
    const x = g.gx * ROOM_W + SHAFT_LADDER_X;
    let y = g.gy * ROOM_H + ROOM_H - 3;
    while (y < height) {
      const t = get(x, y);
      if (t === Tile.Solid || t === Tile.Platform || t === Tile.Spikes) break;
      set(x, y, Tile.Ladder);
      y++;
    }
  });

  // Spawns: decor/pickups always; enemies only in enemy rooms, sized to difficulty.
  const enemyMarkers = new Map<number, typeof markers>();
  for (const m of markers) {
    if (m.kind === 'enemy' || m.kind === 'flyer') {
      const room = rooms[m.room];
      if (!ENEMY_ROOMS.has(room.type)) continue;
      if (!enemyMarkers.has(m.room)) enemyMarkers.set(m.room, []);
      enemyMarkers.get(m.room)!.push(m);
    } else {
      spawns.push({ kind: m.kind, tx: m.tx, ty: m.ty, room: m.room });
    }
  }

  rooms.forEach((room, idx) => {
    if (!ENEMY_ROOMS.has(room.type)) return;
    const own = rng.shuffle([...(enemyMarkers.get(idx) ?? [])]);
    let target: number;
    if (room.type === 'treasure') target = Math.min(own.length, Math.ceil(diff.enemiesPerRoom / 2));
    else target = Math.max(1, diff.enemiesPerRoom + rng.int(-1, 1));
    const chosen = own.slice(0, target);
    for (const m of chosen) spawns.push({ kind: m.kind, tx: m.tx, ty: m.ty, room: idx });
    let missing = target - chosen.length;
    if (missing > 0) {
      const taken = new Set(chosen.map((m) => key(m.tx, m.ty)));
      const ground = groundCells(room, get).filter((c) => !taken.has(key(c.tx, c.ty)));
      rng.shuffle(ground);
      for (const c of ground) {
        if (missing <= 0) break;
        if ([...taken].some((k) => near(k, c.tx, c.ty))) continue;
        spawns.push({ kind: 'enemy', tx: c.tx, ty: c.ty, room: idx });
        taken.add(key(c.tx, c.ty));
        missing--;
      }
    }
  });

  return {
    seed,
    floor,
    biome,
    isBoss: diff.isBoss,
    gridW,
    gridH,
    width,
    height,
    tiles,
    rooms,
    spawns,
    playerStart,
    exit,
  };
}

function near(k: string, tx: number, ty: number): boolean {
  const [x, y] = k.split(',').map(Number);
  return Math.abs(x - tx) < 2 && Math.abs(y - ty) < 2;
}

/**
 * Cells inside a room where a ground enemy can stand (empty feet + head cell,
 * solid or platform below), away from door openings.
 */
function groundCells(room: PlacedRoom, get: (x: number, y: number) => TileId): { tx: number; ty: number }[] {
  const ox = room.gx * ROOM_W;
  const oy = room.gy * ROOM_H;
  const out: { tx: number; ty: number }[] = [];
  for (let y = 2; y < ROOM_H - 1; y++) {
    for (let x = 5; x < ROOM_W - 5; x++) {
      if (x >= DOOR_VERT_X0 - 1 && x <= DOOR_VERT_X1 + 1) continue; // keep the vertical shaft clear
      const tx = ox + x;
      const ty = oy + y;
      if (get(tx, ty) !== Tile.Empty || get(tx, ty - 1) !== Tile.Empty) continue;
      const below = get(tx, ty + 1);
      if (below === Tile.Solid || below === Tile.Platform) out.push({ tx, ty });
    }
  }
  return out;
}
