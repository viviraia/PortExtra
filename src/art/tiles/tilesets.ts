/**
 * Biome tilesets: 32 frames of 16x16 laid out as documented in keys.ts.
 *  0..15  solid autotile by mask (N=1,E=2,S=4,W=8 = neighbour IS solid)
 *  16..19 interior variants, 20 platform, 21 spikes, 22 ladder,
 *  23..27 back wall variants, 28..31 back decor (opaque, back layer)
 */
import { mix, noise2, Px, shade } from '../canvas';
import { BIOME_PALETTES, type BiomePalette } from '../palette';
import type { BiomeId } from '../../data/types';

const T = 16;
export const TILESET_FRAMES = 32;

interface BiomeTileStyle {
  /** Brick size (w,h) for the solid fill. */
  brick: [number, number];
  /** Paint the exposed top cap. */
  cap: (p: Px, pal: BiomePalette, seed: number) => void;
  /** Paint the exposed underside. */
  under: (p: Px, pal: BiomePalette, seed: number) => void;
  /** Extra interior detail for variant k (0..3). */
  variant: (p: Px, pal: BiomePalette, k: number) => void;
  platform: (p: Px, pal: BiomePalette) => void;
  backDecor: (p: Px, pal: BiomePalette, k: number) => void;
}

function bricks(p: Px, pal: BiomePalette, bw: number, bh: number, seed: number, base = pal.stoneMid, lit = pal.stoneLight, dk = pal.stoneDark, mortar = pal.mortar) {
  p.rect(0, 0, T, T, base);
  for (let row = 0; row * bh < T; row++) {
    const off = row % 2 ? Math.floor(bw / 2) : 0;
    const y = row * bh;
    for (let bx = -off; bx < T; bx += bw) {
      const v = noise2(bx + 50, row, seed);
      const c = v < 0.33 ? shade(base, -0.08) : v > 0.75 ? shade(base, 0.06) : base;
      p.rect(bx, y, bw, bh, c);
      // brick highlight top-left, shadow bottom
      p.rect(bx, y, bw - 1, 1, mix(c, lit, 0.45));
      p.rect(bx, y + bh - 1, bw, 1, mix(c, dk, 0.5));
      p.rect(bx + bw - 1, y, 1, bh, mortar);
    }
    p.rect(0, y + bh - 1, T, 1, mortar);
  }
  // speckle
  for (let j = 0; j < T; j++)
    for (let i = 0; i < T; i++) {
      const n = noise2(i, j, seed + 7);
      if (n < 0.05) p.p(i, j, dk);
      else if (n > 0.97) p.p(i, j, lit);
    }
}

const STYLES: Record<BiomeId, BiomeTileStyle> = {
  cells: {
    brick: [8, 4],
    cap: (p, pal, seed) => {
      p.rect(0, 0, T, 2, pal.stoneLight);
      p.rect(0, 0, T, 1, shade(pal.accent, -0.1));
      for (let i = 0; i < T; i++) {
        const n = noise2(i, 3, seed);
        if (n < 0.6) p.p(i, 1, pal.accent);
        if (n < 0.25) p.p(i, 2, shade(pal.accent, -0.25));
        if (n < 0.1) p.p(i, 3, shade(pal.accent, -0.35));
      }
    },
    under: (p, pal, seed) => {
      p.rect(0, T - 2, T, 2, pal.stoneDark);
      for (let i = 0; i < T; i += 1) if (noise2(i, 9, seed) < 0.18) p.rect(i, T - 1, 1, 1, 0x3a5a4a);
    },
    variant: (p, pal, k) => {
      if (k === 0) { p.line(3, 2, 7, 8, pal.mortar); p.line(7, 8, 6, 13, pal.mortar); }
      if (k === 1) { p.rect(5, 5, 6, 5, pal.stoneDark); p.rect(6, 6, 1, 3, 0x8a8478); p.rect(9, 6, 1, 3, 0x8a8478); }
      if (k === 2) { p.rect(2, 9, 3, 2, pal.accent); p.rect(10, 3, 2, 1, pal.accent); }
      if (k === 3) { p.rect(6, 4, 4, 4, 0xc8c0a8); p.rect(7, 5, 1, 1, pal.mortar); p.rect(9, 5, 1, 1, pal.mortar); p.rect(7, 7, 2, 1, pal.mortar); }
    },
    platform: (p, pal) => {
      p.rect(0, 0, T, 4, pal.platform);
      p.rect(0, 0, T, 1, shade(pal.platform, 0.3));
      p.rect(0, 3, T, 1, shade(pal.platform, -0.4));
      p.rect(7, 0, 1, 3, shade(pal.platform, -0.3));
      p.rect(2, 4, 1, 4, pal.accent2);
      p.rect(13, 4, 1, 4, pal.accent2);
      p.p(2, 8, shade(pal.accent2, 0.2));
      p.p(13, 8, shade(pal.accent2, 0.2));
    },
    backDecor: (p, pal, k) => {
      if (k === 0) { p.line(4, 0, 9, 7, shade(pal.back, -0.4)); p.line(9, 7, 7, 16, shade(pal.back, -0.4)); }
      if (k === 1) for (let y = 0; y < T; y += 3) { p.rect(7, y, 2, 2, 0x4a4446); p.p(7, y, 0x6a6466); }
      if (k === 2) { for (let x = 1; x < T; x += 4) p.rect(x, 2, 1, 13, 0x2a2826); p.rect(0, 2, T, 1, 0x3a3634); p.rect(0, 14, T, 1, 0x3a3634); }
      if (k === 3) { for (let i = 0; i < 9; i++) p.p(2 + ((i * 5) % 12), (i * 7) % 16, shade(pal.accent, -0.45)); p.line(3, 0, 5, 10, shade(pal.accent, -0.5)); }
    },
  },
  ramparts: {
    brick: [16, 8],
    cap: (p, pal) => {
      p.rect(0, 0, T, 3, shade(pal.stoneLight, 0.15));
      p.rect(0, 0, T, 1, pal.accent2);
      p.rect(0, 3, T, 1, pal.stoneDark);
      p.p(5, 1, pal.stoneMid);
      p.p(12, 2, pal.stoneMid);
    },
    under: (p, pal) => {
      p.rect(0, T - 2, T, 2, pal.stoneDark);
      p.rect(0, T - 1, T, 1, shade(pal.stoneDark, -0.3));
    },
    variant: (p, pal, k) => {
      if (k === 0) { p.line(2, 3, 6, 6, pal.mortar); p.line(6, 6, 12, 5, pal.mortar); }
      if (k === 1) { p.rect(4, 2, 2, 2, pal.mortar); p.rect(10, 10, 3, 2, pal.mortar); }
      if (k === 2) { p.rect(3, 9, 10, 1, shade(pal.stoneMid, 0.2)); }
      if (k === 3) { p.ellipse(8, 8, 3, 3, pal.stoneDark); p.ellipse(8, 8, 1, 1, pal.mortar); }
    },
    platform: (p, pal) => {
      p.rect(0, 0, T, 4, pal.platform);
      p.rect(0, 0, T, 1, shade(pal.platform, 0.35));
      p.rect(0, 3, T, 1, shade(pal.platform, -0.4));
      p.rect(5, 0, 1, 3, shade(pal.platform, -0.25));
      p.rect(11, 0, 1, 3, shade(pal.platform, -0.25));
      p.line(1, 4, 6, 9, shade(pal.platform, -0.2));
      p.line(14, 4, 9, 9, shade(pal.platform, -0.2));
    },
    backDecor: (p, pal, k) => {
      if (k === 0) { p.rect(5, 2, 6, 12, 0x0a1026); p.rect(6, 1, 4, 1, 0x0a1026); for (let i = 0; i < 4; i++) p.p(6 + (i * 3) % 4, 3 + i * 3, 0xd8e0f0, 0.6); }
      if (k === 1) for (let y = 0; y < T; y += 3) { p.rect(7, y, 2, 2, 0x5a5e6a); }
      if (k === 2) { p.rect(3, 0, 10, T, pal.accent); p.rect(3, 0, 1, T, shade(pal.accent, -0.4)); p.rect(5, 6, 6, 2, 0xc8a050); }
      if (k === 3) { p.rect(6, 2, 4, 10, 0x0a1026); p.rect(7, 3, 2, 8, pal.light, 0.7); }
    },
  },
  library: {
    brick: [8, 8],
    cap: (p, pal) => {
      p.rect(0, 0, T, 4, pal.platform);
      p.rect(0, 0, T, 1, shade(pal.platform, 0.35));
      p.rect(0, 4, T, 1, pal.accent);
      p.rect(0, 5, T, 1, shade(pal.accent, -0.4));
      for (let x = 2; x < T; x += 6) p.p(x, 2, pal.accent2);
    },
    under: (p, pal) => {
      p.rect(0, T - 3, T, 3, shade(pal.platform, -0.3));
      p.rect(0, T - 3, T, 1, pal.accent2);
    },
    variant: (p, pal, k) => {
      // bookshelf insets
      if (k <= 1) {
        p.rect(1, 1, 14, 14, shade(pal.platform, -0.5));
        const cols = [0x6a2a3a, 0x2a4a6a, 0x3a5a2a, 0x6a5a2a, 0x4a2a6a, 0x7a3a2a];
        for (const shelfY of [1, 8]) {
          for (let x = 2; x < 14; x += 2) {
            const c = cols[Math.floor(noise2(x, shelfY, k) * cols.length)];
            const h = 5 + Math.floor(noise2(x, shelfY + 1, k) * 2);
            p.rect(x, shelfY + 7 - h, 2, h, c);
            p.p(x, shelfY + 7 - h + 1, pal.accent2);
          }
          p.rect(1, shelfY + 6, 14, 1, pal.platform);
        }
      }
      if (k === 2) { p.ellipse(8, 8, 4, 4, shade(pal.stoneDark, -0.2)); p.ring(8, 8, 4, pal.accent, 1, 0.7); p.p(8, 8, pal.accent); }
      if (k === 3) { p.line(3, 4, 12, 4, pal.mortar); p.line(5, 11, 10, 11, pal.mortar); }
    },
    platform: (p, pal) => {
      p.rect(0, 0, T, 5, pal.platform);
      p.rect(0, 0, T, 1, shade(pal.platform, 0.4));
      p.rect(0, 4, T, 1, shade(pal.platform, -0.4));
      p.rect(0, 2, T, 1, pal.accent2);
      p.rect(3, 5, 2, 3, shade(pal.platform, -0.3));
      p.rect(11, 5, 2, 3, shade(pal.platform, -0.3));
    },
    backDecor: (p, pal, k) => {
      if (k <= 1) {
        p.rect(0, 0, T, T, shade(pal.back, -0.2));
        const cols = [0x4a1a2a, 0x1a3248, 0x2a4020, 0x4a4020, 0x341a48];
        for (const sy of [0, 8]) {
          for (let x = 1; x < 15; x += 2) {
            const c = shade(cols[Math.floor(noise2(x, sy + k * 3, 4) * cols.length)], -0.2);
            const h = 5 + Math.floor(noise2(x, sy, k + 9) * 2);
            p.rect(x, sy + 7 - h, 2, h, c);
          }
          p.rect(0, sy + 7, T, 1, shade(pal.platform, -0.45));
        }
      }
      if (k === 2) { p.rect(6, 0, 4, T, shade(pal.back, 0.12)); p.rect(6, 0, 1, T, shade(pal.back, 0.25)); }
      if (k === 3) { p.ring(8, 8, 5, pal.accent, 1, 0.35); p.ring(8, 8, 3, pal.accent, 1, 0.25); }
    },
  },
  throne: {
    brick: [16, 8],
    cap: (p, pal) => {
      p.rect(0, 0, T, 3, shade(pal.stoneLight, 0.1));
      p.rect(0, 0, T, 1, shade(pal.stoneLight, 0.4));
      p.rect(0, 3, T, 1, pal.accent);
      p.rect(0, 4, T, 1, shade(pal.accent, -0.5));
    },
    under: (p, pal) => {
      p.rect(0, T - 3, T, 1, pal.accent);
      p.rect(0, T - 2, T, 2, pal.stoneDark);
      for (let x = 1; x < T; x += 4) p.p(x, T - 1, pal.accent2);
    },
    variant: (p, pal, k) => {
      // marble veins
      const vein = mix(pal.stoneLight, 0xffffff, 0.2);
      if (k === 0) { p.line(1, 2, 7, 6, vein); p.line(7, 6, 14, 5, vein); }
      if (k === 1) { p.line(3, 14, 9, 9, vein); p.line(9, 9, 10, 2, vein); }
      if (k === 2) { p.line(2, 8, 14, 10, pal.accent, 1, 0.6); }
      if (k === 3) { p.rect(6, 6, 4, 4, pal.accent2); p.rect(7, 7, 2, 2, shade(pal.accent2, 0.3)); p.rect(5, 5, 6, 1, pal.accent); p.rect(5, 10, 6, 1, pal.accent); }
    },
    platform: (p, pal) => {
      p.rect(0, 0, T, 4, pal.platform);
      p.rect(0, 0, T, 1, pal.accent);
      p.rect(0, 3, T, 1, shade(pal.platform, -0.5));
      for (let x = 2; x < T; x += 5) p.rect(x, 4, 1, 3, shade(pal.accent, -0.3));
    },
    backDecor: (p, pal, k) => {
      if (k === 0) { p.rect(4, 0, 8, T, pal.accent2); p.rect(4, 0, 1, T, shade(pal.accent2, -0.4)); p.rect(4, 0, 8, 1, pal.accent); p.rect(7, 4, 2, 6, pal.accent); }
      if (k === 1) { p.rect(5, 0, 6, T, shade(pal.back, 0.2)); p.rect(5, 0, 1, T, shade(pal.back, 0.35)); p.rect(4, 7, 8, 2, shade(pal.accent, -0.3)); }
      if (k === 2) { p.rect(5, 2, 6, 12, 0x200810); p.rect(6, 3, 4, 10, pal.accent2, 0.7); p.rect(7, 2, 2, 12, 0x0a0408); p.rect(5, 7, 6, 1, 0x0a0408); }
      if (k === 3) { p.line(2, 1, 8, 9, shade(pal.back, -0.5)); p.line(8, 9, 13, 15, shade(pal.back, -0.5)); }
    },
  },
};

function drawSolid(p: Px, pal: BiomePalette, style: BiomeTileStyle, mask: number, seed: number) {
  bricks(p, pal, style.brick[0], style.brick[1], seed);
  const N = mask & 1, E = mask & 2, S = mask & 4, W = mask & 8;
  if (!E) { p.rect(T - 2, 0, 2, T, pal.stoneDark); p.rect(T - 1, 0, 1, T, shade(pal.stoneDark, -0.35)); }
  if (!W) { p.rect(0, 0, 1, T, pal.stoneLight); p.rect(1, 0, 1, T, mix(pal.stoneMid, pal.stoneLight, 0.4)); }
  if (!S) style.under(p, pal, seed);
  if (!N) style.cap(p, pal, seed);
  // rounded outer corners
  if (!N && !W) p.p(0, 0, 0, 0);
  if (!N && !E) p.p(T - 1, 0, 0, 0);
}

function clearPx(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.clearRect(x, y, 1, 1);
}

export function drawTileFrame(p: Px, biome: BiomeId, frame: number): void {
  const pal = BIOME_PALETTES[biome];
  const style = STYLES[biome];
  if (frame < 16) {
    drawSolid(p, pal, style, frame, frame * 13 + 1);
    if (!(frame & 1) && !(frame & 8)) clearPx(p.ctx, p.ox, p.oy);
    if (!(frame & 1) && !(frame & 2)) clearPx(p.ctx, p.ox + T - 1, p.oy);
    return;
  }
  if (frame < 20) {
    const k = frame - 16;
    bricks(p, pal, style.brick[0], style.brick[1], 100 + k);
    style.variant(p, pal, k);
    return;
  }
  if (frame === 20) {
    style.platform(p, pal);
    return;
  }
  if (frame === 21) {
    // spikes: metal with dark bases, bottom-anchored
    const metal = 0xa8acb8, dark = 0x4a4e5a;
    p.rect(0, T - 3, T, 3, dark);
    p.rect(0, T - 3, T, 1, shade(dark, 0.3));
    for (let x = 0; x < T; x += 4) {
      p.poly([[x, T - 3], [x + 4, T - 3], [x + 2, T - 11]], metal);
      p.line(x + 2, T - 10, x + 2, T - 4, 0xe0e4f0);
      p.p(x + 2, T - 11, 0xffffff);
      p.p(x + 3, T - 5, 0x8a2020); // dried blood
    }
    return;
  }
  if (frame === 22) {
    const wood = biome === 'throne' ? 0x4a3a2a : biome === 'library' ? pal.platform : 0x6a5032;
    p.rect(2, 0, 2, T, wood);
    p.rect(12, 0, 2, T, wood);
    p.rect(2, 0, 1, T, shade(wood, 0.3));
    p.rect(12, 0, 1, T, shade(wood, 0.3));
    for (const y of [3, 11]) {
      p.rect(2, y, 12, 2, shade(wood, 0.1));
      p.rect(2, y + 1, 12, 1, shade(wood, -0.3));
    }
    return;
  }
  // back layer: much darker, low contrast
  const bp: BiomePalette = {
    ...pal,
    stoneMid: pal.back,
    stoneLight: shade(pal.back, 0.12),
    stoneDark: shade(pal.back, -0.3),
    mortar: shade(pal.back, -0.5),
  };
  if (frame < 28) {
    const k = frame - 23;
    bricks(p, bp, style.brick[0], style.brick[1], 200 + k, bp.stoneMid, bp.stoneLight, bp.stoneDark, bp.mortar);
    if (k === 3) p.line(2, 3, 9, 12, bp.mortar);
    if (k === 4) { p.rect(0, 0, T, T, shade(pal.back, -0.15)); for (let i = 0; i < 6; i++) p.p((i * 7) % 16, (i * 5) % 16, bp.stoneLight); }
    return;
  }
  const k = frame - 28;
  bricks(p, bp, style.brick[0], style.brick[1], 300 + k, bp.stoneMid, bp.stoneLight, bp.stoneDark, bp.mortar);
  style.backDecor(p, bp, k);
}
