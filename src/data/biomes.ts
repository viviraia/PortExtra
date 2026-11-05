import type { BiomeDef, BiomeId } from './types';

export const BIOMES: Record<BiomeId, BiomeDef> = {
  cells: { id: 'cells', name: 'Dungeon Cells', tagline: 'The damp dark where the Spire keeps its forgotten.', bossId: 'warden' },
  ramparts: { id: 'ramparts', name: 'Ramparts', tagline: 'Wind-scoured walls where stone wings stir.', bossId: 'gargoyle_matriarch' },
  library: { id: 'library', name: 'Forbidden Library', tagline: 'Every page here remembers someone who read it.', bossId: 'archivist' },
  throne: { id: 'throne', name: 'Throne Halls', tagline: 'The hollow court still bows to an empty crown.', bossId: 'hollow_king' },
};
