/**
 * Art contract. TextureFactory (src/art/TextureFactory.ts) must create every
 * texture and animation listed here at boot, entirely from code.
 * Gameplay code only references these helpers / constants, never raw strings.
 */
import type { BiomeId, SlashFx } from '../data/types';

export const TILE = 16;

/** Player spritesheet: frames are PLAYER_FRAME x PLAYER_FRAME, feet at bottom center. */
export const PLAYER_TEX = 'player';
export const PLAYER_FRAME = 32;
export const PLAYER_ANIMS = {
  idle: 'player-idle', // loop
  run: 'player-run', // loop
  jump: 'player-jump',
  fall: 'player-fall',
  roll: 'player-roll',
  attackA: 'player-attack-a', // overhead/forward swing
  attackB: 'player-attack-b', // backswing / second combo hit
  stab: 'player-stab',
  shoot: 'player-shoot',
  block: 'player-block',
  cast: 'player-cast',
  hurt: 'player-hurt',
  death: 'player-death',
  wallslide: 'player-wallslide',
  climb: 'player-climb', // loop
} as const;
export type PlayerAnim = keyof typeof PLAYER_ANIMS;

/** Enemy spritesheet key for an enemy id. */
export const enemyTex = (id: string) => `enemy-${id}`;
/** Every enemy has all of these animations. */
export const ENEMY_ANIM_SUFFIXES = ['idle', 'move', 'windup', 'attack', 'hurt', 'death'] as const;
export type EnemyAnim = (typeof ENEMY_ANIM_SUFFIXES)[number];
export const enemyAnim = (id: string, a: EnemyAnim) => `${id}-${a}`;

export const bossTex = (id: string) => `boss-${id}`;
export const BOSS_ANIM_SUFFIXES = ['idle', 'move', 'windup', 'attack1', 'attack2', 'attack3', 'hurt', 'death'] as const;
export type BossAnim = (typeof BOSS_ANIM_SUFFIXES)[number];
export const bossAnim = (id: string, a: BossAnim) => `${id}-${a}`;

/**
 * Tileset per biome: spritesheet of 16x16 frames.
 *  0..15  solid tile, autotiled by 4-bit mask of SOLID neighbours: N=1, E=2, S=4, W=8
 *  16..19 extra fully-surrounded solid variants (mask 15) for visual variety
 *  20     one-way platform
 *  21     spikes (pointing up)
 *  22     ladder
 *  23..27 background wall variants (drawn on the back layer behind everything)
 *  28..31 background decoration (cracks, chains, bricks, pillar) for the back layer
 */
export const tilesTex = (b: BiomeId) => `tiles-${b}`;
export const TILE_FRAMES = {
  solidBase: 0,
  solidVariants: [16, 17, 18, 19],
  platform: 20,
  spikes: 21,
  ladder: 22,
  backWall: [23, 24, 25, 26, 27],
  backDecor: [28, 29, 30, 31],
} as const;

/** Parallax background layers, GAME_W x GAME_H, horizontally tileable. */
export const bgFarTex = (b: BiomeId) => `bg-${b}-far`;
export const bgMidTex = (b: BiomeId) => `bg-${b}-mid`;

/** Item icons, 16x16, one per weapon/skill/relic id. */
export const iconTex = (itemId: string) => `icon-${itemId}`;

export const OBJ = {
  coin: 'obj-coin', // spritesheet 8x8, anim 'coin-spin'
  ember: 'obj-ember', // spritesheet 8x8, anim 'ember-flicker'
  chest: 'obj-chest', // spritesheet 24x16, frame 0 closed, 1 open
  merchant: 'obj-merchant', // spritesheet 32x32, anim 'merchant-idle'
  altar: 'obj-altar', // 24x32, frame 0 lit, 1 used
  exitPortal: 'obj-exit', // spritesheet 32x48, anim 'exit-swirl'
  torch: 'obj-torch', // spritesheet 8x16, anim 'torch-burn'
  banner: 'obj-banner', // 16x32 static, tinted by biome
  potion: 'obj-potion', // 8x8 icon
  heart: 'obj-heart', // 8x8 health orb pickup
  scrollMight: 'obj-scroll-might', // 12x12
  scrollCunning: 'obj-scroll-cunning',
  scrollVigor: 'obj-scroll-vigor',
  itemDrop: 'obj-item-drop', // 16x16 glowing pedestal / sack under dropped items
  door: 'obj-door', // 16x48 boss-arena gate
} as const;

export const ANIMS = {
  coinSpin: 'coin-spin',
  emberFlicker: 'ember-flicker',
  merchantIdle: 'merchant-idle',
  exitSwirl: 'exit-swirl',
  torchBurn: 'torch-burn',
  hitSpark: 'fx-hit-spark',
  explosion: 'fx-explosion',
  dust: 'fx-dust',
  smoke: 'fx-smoke',
  death: 'fx-death-burst',
  lightning: 'fx-lightning',
} as const;

/** Slash effects: spritesheet keys and anim keys share the same name. */
export const slashTex = (fx: SlashFx) => `fx-${fx}`;
export const SLASH_FRAME = { w: 48, h: 48 };

export const FX = {
  hitSpark: 'fx-hit-spark', // 16x16 sheet
  explosion: 'fx-explosion', // 48x48 sheet
  dust: 'fx-dust', // 16x16 sheet
  smoke: 'fx-smoke', // 16x16 sheet
  deathBurst: 'fx-death-burst', // 32x32 sheet
  lightning: 'fx-lightning', // 16x64 sheet (vertical bolt)
  particle: 'fx-particle', // 4x4 white square
  spark: 'fx-spark', // 2x2 white
  glow: 'fx-glow', // 64x64 white radial gradient (use with ADD blend + tint)
  ring: 'fx-ring', // 64x64 white ring (novas)
  shadow: 'fx-shadow', // 16x4 dark ellipse
} as const;

export type ProjectileKey =
  | 'arrow'
  | 'bolt'
  | 'knife'
  | 'fireball'
  | 'spark'
  | 'orb'
  | 'bomb'
  | 'feather'
  | 'bone'
  | 'grenade'
  | 'icicle'
  | 'ink'
  | 'darkorb';
export const projTex = (p: ProjectileKey) => `proj-${p}`;

export const UI = {
  font: 'pixel', // bitmap font (5x7 glyphs on a 6x8 grid, ASCII 32..126)
  fontBig: 'pixel-big', // same glyphs at 2x for titles
  stickBase: 'ui-stick-base', // 64x64
  stickKnob: 'ui-stick-knob', // 28x28
  button: 'ui-button', // 40x40 round button
  btnGlyph: (name: 'jump' | 'attack1' | 'attack2' | 'dodge' | 'skill1' | 'skill2' | 'potion' | 'interact' | 'pause') => `ui-glyph-${name}`,
  slot: 'ui-slot', // 20x20 inventory slot frame
  title: 'ui-title', // "HOLLOW SPIRE" logo, roughly 240x48
  cursor: 'ui-cursor', // 9x9 crosshair
} as const;
