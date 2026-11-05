/** Color palettes for all generated art and UI. Colors are 0xRRGGBB. */
import type { BiomeId, Rarity, StatTrack, StatusId } from '../data/types';

export interface BiomePalette {
  /** Clear color / darkest sky. */
  sky: number;
  /** Second sky band (toward horizon). */
  skyLow: number;
  /** Distant silhouettes in the far parallax layer. */
  far: number;
  /** Mid parallax silhouettes. */
  mid: number;
  /** Fog / haze tint. */
  fog: number;
  stoneLight: number;
  stoneMid: number;
  stoneDark: number;
  /** Mortar / crack color. */
  mortar: number;
  /** Biome flavor accent (moss, banners, gold, arcana). */
  accent: number;
  /** Secondary accent. */
  accent2: number;
  /** Torch / window light color. */
  light: number;
  /** Background wall base color (back layer, darker than stone). */
  back: number;
  /** Suggested camera ambient tint (multiply-like overlay). */
  ambient: number;
  /** Platform wood/metal. */
  platform: number;
  /** Suggested tint for OBJ.banner in this biome. */
  banner: number;
}

export const BIOME_PALETTES: Record<BiomeId, BiomePalette> = {
  cells: {
    sky: 0x07080b,
    skyLow: 0x0f1414,
    far: 0x121a19,
    mid: 0x18221f,
    fog: 0x2b3a33,
    stoneLight: 0x5d6b63,
    stoneMid: 0x3d4842,
    stoneDark: 0x252d2a,
    mortar: 0x151a18,
    accent: 0x5f8a3a, // moss
    accent2: 0x7a6a4a, // rusted iron
    light: 0xff9a3c,
    back: 0x161c1a,
    ambient: 0x8fa89a,
    platform: 0x5a4632,
    banner: 0x7a3030,
  },
  ramparts: {
    sky: 0x0a1026,
    skyLow: 0x23305a,
    far: 0x1a2344,
    mid: 0x232c4c,
    fog: 0x4a5a86,
    stoneLight: 0x8a95b0,
    stoneMid: 0x5a6584,
    stoneDark: 0x363e58,
    mortar: 0x1d2236,
    accent: 0x9b2f3a, // tattered red banners
    accent2: 0xd8e0f0, // moonlight
    light: 0xffc46a,
    back: 0x1e2338,
    ambient: 0x9aa8d8,
    platform: 0x6a5a48,
    banner: 0xb83a46,
  },
  library: {
    sky: 0x120a14,
    skyLow: 0x24132a,
    far: 0x22121e,
    mid: 0x2e1a26,
    fog: 0x5a2f5e,
    stoneLight: 0x8e6448,
    stoneMid: 0x5e3c2a,
    stoneDark: 0x382216,
    mortar: 0x1e120c,
    accent: 0xa45cff, // arcana
    accent2: 0xc4a060, // gilded spines
    light: 0xffb050,
    back: 0x26160f,
    ambient: 0xd8a8c8,
    platform: 0x7a4e2c,
    banner: 0x8a50d0,
  },
  throne: {
    sky: 0x050307,
    skyLow: 0x1a0710,
    far: 0x150912,
    mid: 0x1e0c16,
    fog: 0x5a1626,
    stoneLight: 0x6e6478,
    stoneMid: 0x463e50,
    stoneDark: 0x241e2a,
    mortar: 0x0a080c,
    accent: 0xd8a83a, // gold
    accent2: 0xa01830, // crimson
    light: 0xff6a3a,
    back: 0x130f16,
    ambient: 0xc89098,
    platform: 0x2a2228,
    banner: 0xc02038,
  },
};

export const RARITY_COLORS: Record<Rarity, number> = {
  common: 0xc8c8c8,
  rare: 0x4fa3ff,
  epic: 0xb05cff,
  legendary: 0xffb23a,
};

export const TRACK_COLORS: Record<StatTrack, number> = {
  might: 0xe04848,
  cunning: 0xa860f0,
  vigor: 0x58c858,
};

export const STATUS_COLORS: Record<StatusId, number> = {
  burn: 0xff7a2a,
  bleed: 0xc81e32,
  poison: 0x7ad63a,
  freeze: 0x7ad8ff,
  stun: 0xffe45a,
};

export const UI_COLORS = {
  text: 0xe8e2d0,
  dim: 0x8a8478,
  gold: 0xffd24a,
  ember: 0xff7a3a,
  hp: 0xd8323e,
  hpBack: 0x3a1418,
  panel: 0x141220,
  panelEdge: 0x5a5070,
  good: 0x6ad86a,
  bad: 0xff5050,
  outline: 0x0a0810,
} as const;

/** Default player cosmetic palette (matches CosmeticDef['palette']). */
export const DEFAULT_PLAYER_PALETTE = {
  cloak: 0x3b4f74,
  trim: 0xc8a050,
  skin: 0xd8b088,
  eyes: 0xffa23a,
};

/** Generic outline color for all sprites. */
export const OUTLINE = 0x0a0810;
