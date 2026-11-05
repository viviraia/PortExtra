/**
 * Pure platformer reachability checker for generated floors.
 *
 * Models the player as a 1x2-tile body (feet cell + head cell) with:
 *  - walking, falling (straight down, may grab ladders on the way)
 *  - jumps: rise up to MAX_RISE tiles (double jump), then drift up to
 *    maxDrift(rise) tiles sideways, then fall
 *  - one-way platforms: passable from below and sideways, stand on top, drop through
 *  - ladders: climb up/down, jump off
 *  - spikes are lethal: the body may never overlap a spike cell
 * It is deliberately a little conservative compared to the real controller
 * (no wall-jumps, no air control while falling).
 */
import { ROOM_H, ROOM_W } from '../config';
import { Tile, type FloorLayout, type Spawn, type TileId } from '../data/types';

export const MAX_RISE = 6;
export function maxDrift(rise: number): number {
  return rise <= 2 ? 6 : rise <= 4 ? 5 : 4;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  reachableStates: number;
  unreachableRooms: number[];
  exitReachable: boolean;
  unreachableSpawns: Spawn[];
  /** Reachable positions from which the exit can no longer be reached. */
  softlockStates: number;
  softlockRooms: number[];
}

/** Spawn kinds the player must be able to get to. */
const MUST_REACH = new Set(['chest', 'merchant', 'altar']);
const INTERACT_X = 2;
const INTERACT_Y = 2;

export function validateFloor(layout: FloorLayout): ValidationResult {
  const W = layout.width;
  const H = layout.height;
  const T = layout.tiles;
  // Local copies: imported bindings can be slow getters under some bundlers/test runners.
  const SOLID = Tile.Solid, PLATFORM = Tile.Platform, SPIKES = Tile.Spikes, LADDER = Tile.Ladder;
  const tile = (x: number, y: number): TileId => (x < 0 || y < 0 || x >= W || y >= H ? SOLID : T[y * W + x]);
  const cellOk = (x: number, y: number) => {
    const t = tile(x, y);
    return t !== SOLID && t !== SPIKES;
  };
  const bodyOk = (x: number, y: number) => cellOk(x, y) && cellOk(x, y - 1);
  const grounded = (x: number, y: number) => {
    const b = tile(x, y + 1);
    return b === SOLID || b === PLATFORM;
  };
  const onLadder = (x: number, y: number) => tile(x, y) === LADDER || tile(x, y - 1) === LADDER;
  const support = (x: number, y: number) => bodyOk(x, y) && (grounded(x, y) || onLadder(x, y));
  const id = (x: number, y: number) => y * W + x;

  const fallMemo: (number[] | undefined)[] = new Array(W * H);
  const NONE: number[] = [];
  /** Landing (and optional ladder grabs) when falling from (x, y0). Memoized per cell, chained downward. */
  const fall = (x: number, y0: number): number[] => {
    const memo = fallMemo[id(x, y0)];
    if (memo) return memo;
    // Walk down until a memoized cell or a terminal cell, then fill memos bottom-up.
    const path: number[] = [];
    let tail: number[] = NONE;
    for (let y = y0; ; y++) {
      if (y >= H || !bodyOk(x, y)) break; // spikes (or out of map): no landing
      const k = id(x, y);
      const m = fallMemo[k];
      if (m) {
        tail = m;
        break;
      }
      if (grounded(x, y)) {
        fallMemo[k] = tail = [k];
        break;
      }
      path.push(y);
    }
    for (let i = path.length - 1; i >= 0; i--) {
      const k = id(x, path[i]);
      tail = onLadder(x, path[i]) ? [k, ...tail] : tail;
      fallMemo[k] = tail;
    }
    return fallMemo[id(x, y0)] ?? NONE;
  };
  const arrive = (x: number, y: number, into: number[]) => {
    if (!bodyOk(x, y)) return;
    if (support(x, y)) into.push(id(x, y));
    else for (const s of fall(x, y)) into.push(s);
  };

  const neighbours = (s: number): number[] => {
    const x = s % W;
    const y = (s - x) / W;
    const out: number[] = [];
    arrive(x - 1, y, out);
    arrive(x + 1, y, out);
    if (onLadder(x, y)) {
      arrive(x, y - 1, out);
      arrive(x, y + 1, out);
    }
    if (tile(x, y + 1) === PLATFORM || tile(x, y + 1) === LADDER) arrive(x, y + 1, out);
    for (let rise = 0; rise <= MAX_RISE; rise++) {
      const ay = y - rise;
      if (rise > 0) {
        if (!bodyOk(x, ay)) break;
        arrive(x, ay, out);
      }
      const drift = maxDrift(rise);
      for (const dir of [-1, 1]) {
        for (let dx = 1; dx <= drift; dx++) {
          const ax = x + dir * dx;
          if (!bodyOk(ax, ay)) break;
          arrive(ax, ay, out);
        }
      }
    }
    return out;
  };

  // Forward BFS, recording edges for the reverse pass.
  const visited = new Uint8Array(W * H);
  const queue: number[] = [];
  const efrom: number[] = [];
  const eto: number[] = [];
  const startStates: number[] = [];
  arrive(layout.playerStart.tx, layout.playerStart.ty, startStates);
  const errors: string[] = [];
  if (!startStates.length) errors.push('player start is not a valid position');
  for (const s of startStates) {
    if (!visited[s]) {
      visited[s] = 1;
      queue.push(s);
    }
  }
  const stamp = new Int32Array(W * H).fill(-1);
  for (let qi = 0; qi < queue.length; qi++) {
    const s = queue[qi];
    for (const n of neighbours(s)) {
      if (n === s || stamp[n] === s) continue;
      stamp[n] = s;
      efrom.push(s);
      eto.push(n);
      if (!visited[n]) {
        visited[n] = 1;
        queue.push(n);
      }
    }
  }
  const reachable = queue;

  const roomIndex = new Map<number, number>();
  layout.rooms.forEach((r, i) => roomIndex.set(r.gy * layout.gridW + r.gx, i));
  const roomOf = (s: number) => {
    const x = s % W;
    const y = (s - x) / W;
    return roomIndex.get(Math.floor(y / ROOM_H) * layout.gridW + Math.floor(x / ROOM_W)) ?? -1;
  };
  const isNear = (s: number, tx: number, ty: number) => {
    const x = s % W;
    const y = (s - x) / W;
    return Math.abs(x - tx) <= INTERACT_X && Math.abs(y - ty) <= INTERACT_Y;
  };

  const roomSeen = new Set<number>();
  for (const s of reachable) roomSeen.add(roomOf(s));
  const unreachableRooms = layout.rooms.map((_, i) => i).filter((i) => !roomSeen.has(i));

  const goals = reachable.filter((s) => isNear(s, layout.exit.tx, layout.exit.ty));
  const exitReachable = goals.length > 0;

  const unreachableSpawns = layout.spawns.filter(
    (sp) => MUST_REACH.has(sp.kind) && !reachable.some((s) => isNear(s, sp.tx, sp.ty)),
  );

  // Reverse BFS from the exit over recorded edges (CSR adjacency).
  const N = W * H;
  const counts = new Int32Array(N + 1);
  for (const t of eto) counts[t + 1]++;
  for (let i = 0; i < N; i++) counts[i + 1] += counts[i];
  const rev = new Int32Array(eto.length);
  const fill = counts.slice(0, N);
  for (let e = 0; e < eto.length; e++) rev[fill[eto[e]]++] = efrom[e];
  const canExit = new Uint8Array(N);
  const rq: number[] = [];
  for (const g of goals) {
    canExit[g] = 1;
    rq.push(g);
  }
  for (let qi = 0; qi < rq.length; qi++) {
    const t = rq[qi];
    for (let k = counts[t]; k < counts[t + 1]; k++) {
      const f = rev[k];
      if (!canExit[f]) {
        canExit[f] = 1;
        rq.push(f);
      }
    }
  }
  let softlockStates = 0;
  const softRooms = new Set<number>();
  for (const s of reachable) {
    if (!canExit[s]) {
      softlockStates++;
      softRooms.add(roomOf(s));
    }
  }

  if (unreachableRooms.length) errors.push(`unreachable rooms: ${unreachableRooms.map((i) => layout.rooms[i].templateId).join(', ')}`);
  if (!exitReachable) errors.push('exit not reachable');
  if (unreachableSpawns.length)
    errors.push(`unreachable spawns: ${unreachableSpawns.map((s) => `${s.kind}@${layout.rooms[s.room]?.templateId}`).join(', ')}`);
  if (softlockStates)
    errors.push(`softlocks (${softlockStates}) in: ${[...softRooms].map((i) => layout.rooms[i]?.templateId ?? '?').join(', ')}`);

  return {
    ok: errors.length === 0,
    errors,
    reachableStates: reachable.length,
    unreachableRooms,
    exitReachable,
    unreachableSpawns,
    softlockStates,
    softlockRooms: [...softRooms],
  };
}
