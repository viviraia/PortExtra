/** Seeded deterministic RNG (mulberry32) with helpers. */
export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0;
  }

  get state(): number {
    return this.s;
  }

  /** Float in [0, 1). */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Float in [min, max). */
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error('Rng.pick on empty array');
    return arr[Math.floor(this.next() * arr.length)];
  }

  /** Pick by weight; items with weight <= 0 are never picked. */
  weighted<T>(items: readonly T[], weight: (t: T) => number): T {
    let total = 0;
    for (const it of items) total += Math.max(0, weight(it));
    if (total <= 0) throw new Error('Rng.weighted with no positive weights');
    let r = this.next() * total;
    for (const it of items) {
      r -= Math.max(0, weight(it));
      if (r < 0) return it;
    }
    return items[items.length - 1];
  }

  /** Pick a key of a weight record. */
  weightedKey<K extends string>(rec: Record<K, number>): K {
    const keys = Object.keys(rec) as K[];
    return this.weighted(keys, (k) => rec[k]);
  }

  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /** Derive an independent child RNG (e.g. per floor) from this one. */
  fork(salt = 0): Rng {
    return new Rng(hash32(this.s ^ Math.imul(salt + 1, 0x9e3779b9)));
  }
}

export function hash32(n: number): number {
  let h = n >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Stable seed for (runSeed, floor). */
export function floorSeed(runSeed: number, floor: number): number {
  return hash32(runSeed ^ Math.imul(floor, 0x27d4eb2d));
}

export function randomSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0;
}

let uidCounter = 0;
export function uid(prefix = 'u'): string {
  uidCounter = (uidCounter + 1) % 1e9;
  return `${prefix}${Date.now().toString(36)}${uidCounter.toString(36)}`;
}
