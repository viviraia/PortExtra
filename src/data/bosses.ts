import type { BossDef } from './types';

/**
 * Bosses (floor-1 reference values; runtime multiplies by the boss floor's
 * Difficulty.hpMult/dmgMult). Floor 5 hpMult ≈ 1.57, so the Warden has ~1100 HP there.
 */
export const BOSSES: Record<string, BossDef> = {
  warden: { id: 'warden', name: 'The Warden', title: 'Jailer of the Deep Cells', biome: 'cells', hp: 700, damage: 14, w: 30, h: 40, coins: 120, embers: 5 },
  gargoyle_matriarch: { id: 'gargoyle_matriarch', name: 'Gargoyle Matriarch', title: 'Mother of the Ramparts', biome: 'ramparts', hp: 650, damage: 14, w: 40, h: 32, coins: 180, embers: 6 },
  archivist: { id: 'archivist', name: 'The Archivist', title: 'Keeper of Forbidden Pages', biome: 'library', hp: 600, damage: 15, w: 24, h: 40, coins: 240, embers: 8 },
  hollow_king: { id: 'hollow_king', name: 'The Hollow King', title: 'Crown of the Sunken Spire', biome: 'throne', hp: 800, damage: 16, w: 30, h: 44, coins: 320, embers: 10 },
};
