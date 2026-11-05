/**
 * Pure tile-frame selection for FloorBuilder (testable without Phaser).
 * Frame layout is defined by TILE_FRAMES in src/art/keys.ts.
 */
import { TILE_FRAMES } from '../art/keys';
import { hash32 } from '../core/rng';
import { Tile, type FloorLayout, type TileId } from '../data/types';

export function tileAt(l: FloorLayout, x: number, y: number): TileId {
  return x < 0 || y < 0 || x >= l.width || y >= l.height ? Tile.Solid : l.tiles[y * l.width + x];
}

/** 4-bit mask of solid neighbours: N=1, E=2, S=4, W=8. Out of bounds counts as solid. */
export function solidMask(l: FloorLayout, x: number, y: number): number {
  const s = (dx: number, dy: number) => (tileAt(l, x + dx, y + dy) === Tile.Solid ? 1 : 0);
  return s(0, -1) | (s(1, 0) << 1) | (s(0, 1) << 2) | (s(-1, 0) << 3);
}

const cellHash = (l: FloorLayout, x: number, y: number) => hash32(l.seed ^ Math.imul(x + 1, 73856093) ^ Math.imul(y + 1, 19349663));

/** Front (collision) layer frames; -1 = no tile. Indexed [y][x]. */
export function frontFrames(l: FloorLayout): number[][] {
  const out: number[][] = [];
  for (let y = 0; y < l.height; y++) {
    const row: number[] = new Array(l.width);
    for (let x = 0; x < l.width; x++) {
      const t = l.tiles[y * l.width + x];
      switch (t) {
        case Tile.Solid: {
          const m = solidMask(l, x, y);
          if (m === 15) {
            const h = cellHash(l, x, y) % 100;
            // Mostly the base interior tile; sprinkle the variants.
            row[x] = h < 70 ? TILE_FRAMES.solidBase + 15 : TILE_FRAMES.solidVariants[h % TILE_FRAMES.solidVariants.length];
          } else row[x] = TILE_FRAMES.solidBase + m;
          break;
        }
        case Tile.Platform:
          row[x] = TILE_FRAMES.platform;
          break;
        case Tile.Spikes:
          row[x] = TILE_FRAMES.spikes;
          break;
        case Tile.Ladder:
          row[x] = TILE_FRAMES.ladder;
          break;
        default:
          row[x] = -1;
      }
    }
    out.push(row);
  }
  return out;
}

/** Back wall layer frames behind every non-solid cell; -1 = none. Indexed [y][x]. */
export function backFrames(l: FloorLayout): number[][] {
  const out: number[][] = [];
  const walls = TILE_FRAMES.backWall;
  const decor = TILE_FRAMES.backDecor;
  for (let y = 0; y < l.height; y++) {
    const row: number[] = new Array(l.width);
    for (let x = 0; x < l.width; x++) {
      if (l.tiles[y * l.width + x] === Tile.Solid) {
        row[x] = -1;
        continue;
      }
      const h = cellHash(l, x, y);
      const r = h % 1000;
      if (r < 25) row[x] = decor[(h >>> 10) % decor.length];
      else if (r < 600) row[x] = walls[0];
      else row[x] = walls[1 + ((h >>> 10) % (walls.length - 1))];
    }
    out.push(row);
  }
  return out;
}
