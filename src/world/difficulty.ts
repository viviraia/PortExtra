/**
 * Depth-based difficulty scaling. Pure; used by the generator, spawners and loot.
 */
import { BIOME_COUNT, FLOORS_PER_BIOME } from '../config';
import { BIOME_ORDER, type BiomeId, type Difficulty, type Rarity } from '../data/types';

/** Floors per full cycle through all biomes (20). */
export const FLOORS_PER_LOOP = FLOORS_PER_BIOME * BIOME_COUNT;

/** Floors 1–5 cells, 6–10 ramparts, 11–15 library, 16–20 throne, then repeats. */
export function biomeForFloor(floor: number): BiomeId {
  const f = Math.max(1, Math.floor(floor));
  return BIOME_ORDER[Math.floor((f - 1) / FLOORS_PER_BIOME) % BIOME_COUNT];
}

/** Every 5th floor ends its biome with a boss. */
export function isBossFloor(floor: number): boolean {
  return floor >= 1 && floor % FLOORS_PER_BIOME === 0;
}

/** Ascension loop index: 0 for floors 1–20, 1 for 21–40, ... */
export function loopForFloor(floor: number): number {
  return Math.floor((Math.max(1, floor) - 1) / FLOORS_PER_LOOP);
}

export function rarityWeightsForFloor(floor: number): Record<Rarity, number> {
  const d = Math.max(0, floor - 1);
  return {
    common: Math.max(12, 70 - 2.4 * d),
    rare: Math.min(40, 25 + 0.75 * d),
    epic: Math.min(35, 4 + 1.1 * d),
    legendary: Math.min(18, 1 + 0.45 * d),
  };
}

export function getDifficulty(floor: number): Difficulty {
  const f = Math.max(1, Math.floor(floor));
  const loop = loopForFloor(f);
  const d = f - 1;
  return {
    floor: f,
    biome: biomeForFloor(f),
    loop,
    isBoss: isBossFloor(f),
    hpMult: Math.pow(1.12, d) * Math.pow(1.5, loop),
    dmgMult: Math.pow(1.08, d) * Math.pow(1.25, loop),
    enemiesPerRoom: Math.min(8, Math.round(2 + d * 0.22)),
    eliteChance: Math.min(0.5, 0.05 + 0.02 * d),
    itemLevel: f,
    rarityWeights: rarityWeightsForFloor(f),
  };
}

/** Room-grid size for a floor (normal floors). Grows from 4x3 to 6x4. */
export function gridSizeForFloor(floor: number): { w: number; h: number } {
  const f = Math.max(1, floor);
  return {
    w: Math.min(6, 4 + Math.floor((f - 1) / 6)),
    h: Math.min(4, 3 + Math.floor((f - 1) / 8)),
  };
}
