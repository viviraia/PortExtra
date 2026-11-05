import type { BossDef } from './types';

/**
 * Bosses (floor-1 reference values; runtime multiplies by the boss floor's
 * Difficulty.hpMult/dmgMult). Floor 5 hpMult ≈ 1.63, so the Warden has ~1900 HP there;
 * a fresh save kills it in roughly 45–75 s (see src/run/balanceModel.ts).
 */
export const BOSSES: Record<string, BossDef> = {
  warden: { id: 'warden', name: 'The Warden', title: 'Jailer of the Deep Cells', biome: 'cells', hp: 1150, damage: 13, w: 30, h: 40, coins: 120, embers: 5 },
  gargoyle_matriarch: { id: 'gargoyle_matriarch', name: 'Gargoyle Matriarch', title: 'Mother of the Ramparts', biome: 'ramparts', hp: 1100, damage: 14, w: 40, h: 32, coins: 180, embers: 6 },
  archivist: { id: 'archivist', name: 'The Archivist', title: 'Keeper of Forbidden Pages', biome: 'library', hp: 1000, damage: 14, w: 24, h: 40, coins: 240, embers: 8 },
  hollow_king: { id: 'hollow_king', name: 'The Hollow King', title: 'Crown of the Sunken Spire', biome: 'throne', hp: 950, damage: 16, w: 30, h: 44, coins: 320, embers: 10 },
};
