/** Global constants. Pure (no Phaser import) so tests can use them. */
export const GAME_W = 480;
export const GAME_H = 270;
export const TILE = 16;

/** Room cell size in tiles. Every room template is exactly ROOM_W x ROOM_H. */
export const ROOM_W = 40;
export const ROOM_H = 23;

/**
 * Door openings carved between adjacent rooms (tile coords inside a room).
 * L/R doors: a gap in the side wall spanning rows [DOOR_SIDE_Y0, DOOR_SIDE_Y1]
 *   (the floor row below the gap, ROOM_H-2, stays solid so you walk through).
 * T/B doors: a gap in the ceiling/floor spanning cols [DOOR_VERT_X0, DOOR_VERT_X1].
 * Templates must keep these cells (and a 1-tile margin inside) free of solids
 * when they list the door in `doors`, and must make T reachable from the floor.
 */
export const DOOR_SIDE_Y0 = ROOM_H - 6; // 17
export const DOOR_SIDE_Y1 = ROOM_H - 3; // 20 (floor is rows 21..22)
export const DOOR_VERT_X0 = 18;
export const DOOR_VERT_X1 = 21;

/** Physics. */
export const GRAVITY = 980;
export const MAX_FALL = 460;

/** Floors per biome and the boss cadence. */
export const FLOORS_PER_BIOME = 5;
export const BIOME_COUNT = 4;

export const SAVE_KEY = 'hollow-spire-save';
export const SAVE_VERSION = 1;

export const IS_DEBUG =
  typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug');

/**
 * Render depths relative to the lighting darkness overlay. Anything that must
 * stay readable in unlit areas (enemy telegraphs, enemy projectiles, ambient
 * motes) is drawn above DEPTH.darkness.
 */
export const DEPTH = {
  darkness: 800,
  lightGlow: 801,
  aboveDark: 802,
  aboveDarkProjectile: 803,
  telegraph: 805,
  telegraphTop: 806,
} as const;
