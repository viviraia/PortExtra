/**
 * Turns a pure FloorLayout into Phaser tilemap layers. Thin by design: frame
 * selection lives in ./autotile.ts, generation in ./FloorGenerator.ts.
 */
import Phaser from 'phaser';
import { TILE_FRAMES, tilesTex } from '../art/keys';
import { ROOM_H, ROOM_W, TILE } from '../config';
import { Tile, type FloorLayout, type TileId } from '../data/types';
import { backFrames, frontFrames, tileAt as layoutTileAt } from './autotile';

/** Default depths; GameScene may override. Entities are expected around depth 0..100. */
export const DEPTH_BACK = -20;
export const DEPTH_FRONT = -5;

export interface BuiltFloor {
  layout: FloorLayout;
  map: Phaser.Tilemaps.Tilemap;
  /** Collision layer: solid (all faces), one-way platforms (top face, properties.oneWay), spikes, ladders (no collision). */
  layer: Phaser.Tilemaps.TilemapLayer;
  /** Decorative back wall layer (no collision). */
  back: Phaser.Tilemaps.TilemapLayer;
  tileAt(tx: number, ty: number): TileId;
  isSolid(tx: number, ty: number): boolean;
  worldW: number;
  worldH: number;
  /** World-space rectangle (px) of room `i`. */
  roomBounds(i: number): Phaser.Geom.Rectangle;
  /** Index of the room under a world point (px), or -1 for no room. */
  roomAt(x: number, y: number): number;
  destroy(): void;
}

/** Frames 0..19 are solid tiles (autotile + variants). */
export const SOLID_FRAME_INDEXES: number[] = [
  ...Array.from({ length: 16 }, (_, i) => TILE_FRAMES.solidBase + i),
  ...TILE_FRAMES.solidVariants,
];

export function buildFloor(scene: Phaser.Scene, layout: FloorLayout): BuiltFloor {
  const key = tilesTex(layout.biome);
  const map = scene.make.tilemap({
    tileWidth: TILE,
    tileHeight: TILE,
    width: layout.width,
    height: layout.height,
  });
  const tileset = map.addTilesetImage(key, key, TILE, TILE, 0, 0, 0);
  if (!tileset) throw new Error(`buildFloor: missing tileset texture "${key}"`);

  const back = map.createBlankLayer('back', tileset, 0, 0)!;
  const layer = map.createBlankLayer('front', tileset, 0, 0)!;
  back.putTilesAt(backFrames(layout), 0, 0, false);
  layer.putTilesAt(frontFrames(layout), 0, 0, false);
  back.setDepth(DEPTH_BACK);
  layer.setDepth(DEPTH_FRONT);

  map.setCollision(SOLID_FRAME_INDEXES, true, true, layer);
  layer.forEachTile((t) => {
    if (t.index === TILE_FRAMES.platform) {
      t.setCollision(false, false, true, false, false);
      t.properties = { ...(t.properties ?? {}), oneWay: true };
    } else if (t.index === TILE_FRAMES.spikes) {
      t.properties = { ...(t.properties ?? {}), spikes: true };
    } else if (t.index === TILE_FRAMES.ladder) {
      t.properties = { ...(t.properties ?? {}), ladder: true };
    }
  });

  const roomIndex = new Map<number, number>();
  layout.rooms.forEach((r, i) => roomIndex.set(r.gy * layout.gridW + r.gx, i));
  const roomPx = { w: ROOM_W * TILE, h: ROOM_H * TILE };

  return {
    layout,
    map,
    layer,
    back,
    tileAt: (tx, ty) => layoutTileAt(layout, tx, ty),
    isSolid: (tx, ty) => layoutTileAt(layout, tx, ty) === Tile.Solid,
    worldW: layout.width * TILE,
    worldH: layout.height * TILE,
    roomBounds(i) {
      const r = layout.rooms[i];
      return new Phaser.Geom.Rectangle(r.gx * roomPx.w, r.gy * roomPx.h, roomPx.w, roomPx.h);
    },
    roomAt(x, y) {
      if (x < 0 || y < 0) return -1;
      const gx = Math.floor(x / roomPx.w);
      const gy = Math.floor(y / roomPx.h);
      if (gx >= layout.gridW || gy >= layout.gridH) return -1;
      return roomIndex.get(gy * layout.gridW + gx) ?? -1;
    },
    destroy() {
      map.destroy();
    },
  };
}

/** World-space position (px) of a spawn/marker: bottom-center of its tile (feet position). */
export function markerWorldPos(tx: number, ty: number): { x: number; y: number } {
  return { x: tx * TILE + TILE / 2, y: (ty + 1) * TILE };
}
