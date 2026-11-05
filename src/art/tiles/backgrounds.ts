/**
 * Parallax backgrounds per biome: far (opaque) and mid (transparent top),
 * both 480x270 and horizontally tileable (everything is drawn wrapped).
 */
import { mix, noise2, Px, shade } from '../canvas';
import { BIOME_PALETTES, type BiomePalette } from '../palette';
import type { BiomeId } from '../../data/types';

export const BG_W = 480;
export const BG_H = 270;

function gradient(p: Px, top: number, bottom: number, y0 = 0, y1 = BG_H) {
  const bands = 18;
  for (let b = 0; b < bands; b++) {
    const ya = Math.round(y0 + ((y1 - y0) * b) / bands), yb = Math.round(y0 + ((y1 - y0) * (b + 1)) / bands);
    p.rect(0, ya, BG_W, yb - ya, mix(top, bottom, b / (bands - 1)));
  }
}

/** Draw `fn` at x and wrapped copies so the layer tiles seamlessly. */
function wrap(fn: (dx: number) => void) {
  fn(0);
  fn(-BG_W);
  fn(BG_W);
}

function stars(p: Px, seed: number, count: number, maxY: number, c = 0xd8e0ff) {
  for (let k = 0; k < count; k++) {
    const x = Math.floor(noise2(k, 1, seed) * BG_W), y = Math.floor(noise2(k, 2, seed) * maxY);
    const b = noise2(k, 3, seed);
    p.p(x, y, c, 0.3 + b * 0.7);
    if (b > 0.93) { p.p(x + 1, y, c, 0.4); p.p(x - 1, y, c, 0.4); p.p(x, y + 1, c, 0.4); p.p(x, y - 1, c, 0.4); }
  }
}

function fogBand(p: Px, y: number, h: number, c: number, a: number) {
  for (let k = 0; k < h; k++) p.rect(0, y + k, BG_W, 1, c, a * Math.sin((k / h) * Math.PI));
}

function tower(p: Px, x: number, base: number, w: number, h: number, c: number, roof: 'spire' | 'crenel' | 'dome', windows: number, light: number, seed: number) {
  p.rect(x, base - h, w, h, c);
  if (roof === 'spire') p.poly([[x - 2, base - h], [x + w + 2, base - h], [x + w / 2, base - h - w * 1.6]], c);
  if (roof === 'crenel') for (let k = 0; k < w; k += 4) p.rect(x + k, base - h - 3, 2, 3, c);
  if (roof === 'dome') p.ellipse(x + w / 2, base - h, w / 2, w / 3, c);
  for (let k = 0; k < windows; k++) {
    const wx = x + 2 + Math.floor(noise2(k, x, seed) * Math.max(1, w - 5));
    const wy = base - h + 6 + Math.floor(noise2(x, k, seed) * Math.max(1, h - 14));
    const lit = noise2(k, k + x, seed) > 0.4;
    p.rect(wx, wy, 2, 3, lit ? light : shade(c, -0.4), lit ? 0.85 : 1);
  }
}

// ---------------------------------------------------------------------------

function cellsFar(p: Px, pal: BiomePalette) {
  gradient(p, pal.sky, pal.skyLow);
  // distant arcade of arches
  wrap((dx) => {
    for (let x = 0; x < BG_W; x += 60) {
      const ax = x + dx;
      p.rect(ax, 60, 10, 210, pal.far);
      p.ellipse(ax + 35, 110, 25, 40, pal.far);
      p.rect(ax + 10, 110, 50, 160, pal.far);
      p.ellipse(ax + 35, 112, 20, 36, pal.sky);
      p.rect(ax + 15, 112, 40, 158, pal.sky);
      // dim grate glow at the back of each arch
      p.rect(ax + 30, 150, 10, 14, pal.light, 0.08);
      for (let k = 0; k < 3; k++) p.rect(ax + 31 + k * 3, 150, 1, 14, pal.far);
    }
  });
  fogBand(p, 170, 60, pal.fog, 0.25);
  p.rect(0, 230, BG_W, 40, shade(pal.far, -0.2));
}

function cellsMid(p: Px, pal: BiomePalette) {
  wrap((dx) => {
    for (let x = 20; x < BG_W; x += 160) {
      const px = x + dx;
      // pillar
      p.rect(px, 0, 22, BG_H, pal.mid);
      p.rect(px, 0, 3, BG_H, shade(pal.mid, 0.15));
      p.rect(px - 3, 200, 28, 8, shade(pal.mid, 0.1));
      // hanging chains + cage
      const cx = px + 80;
      for (let y = 0; y < 90; y += 4) p.rect(cx, y, 2, 3, shade(pal.mid, 0.25));
      p.rect(cx - 9, 90, 20, 2, shade(pal.mid, 0.25));
      for (let k = 0; k < 6; k++) p.rect(cx - 9 + k * 4, 92, 1, 26, shade(pal.mid, 0.2));
      p.rect(cx - 9, 118, 20, 2, shade(pal.mid, 0.25));
      p.ellipse(cx + 1, 89, 10, 4, shade(pal.mid, 0.25));
      // a skull in the cage
      p.rect(cx - 2, 113, 5, 4, shade(pal.mid, 0.45));
    }
  });
  // floor rubble silhouette
  for (let x = 0; x < BG_W; x++) {
    const h = 30 + Math.floor(noise2(Math.floor(x / 6), 0, 3) * 12);
    p.rect(x, BG_H - h, 1, h, pal.mid);
  }
}

function rampartsFar(p: Px, pal: BiomePalette) {
  gradient(p, pal.sky, pal.skyLow, 0, 200);
  p.rect(0, 200, BG_W, 70, pal.skyLow);
  stars(p, 4, 160, 170);
  // moon
  p.circle(360, 60, 26, 0xe8ecf8);
  p.circle(352, 54, 4, 0xc8d0e8);
  p.circle(372, 70, 6, 0xc8d0e8);
  p.circle(364, 46, 3, 0xd0d8ec);
  for (let r = 27; r < 44; r += 3) p.ring(360, 60, r, 0xd8e0ff, 1, 0.06);
  // distant castle silhouette
  wrap((dx) => {
    const base = 215;
    for (let k = 0; k < 9; k++) {
      const x = dx + k * 55 + Math.floor(noise2(k, 0, 9) * 20);
      const h = 50 + Math.floor(noise2(k, 1, 9) * 70);
      tower(p, x, base, 14 + (k % 3) * 4, h, pal.far, k % 3 === 0 ? 'spire' : 'crenel', 3, pal.light, 17);
    }
  });
  p.rect(0, 205, BG_W, 65, pal.far);
  fogBand(p, 190, 40, pal.fog, 0.3);
}

function rampartsMid(p: Px, pal: BiomePalette) {
  wrap((dx) => {
    // wall with battlements across the bottom
    p.rect(dx, 205, BG_W, 65, pal.mid);
    for (let x = 0; x < BG_W; x += 12) p.rect(dx + x, 198, 7, 7, pal.mid);
    // two big towers
    for (const tx of [70, 300]) {
      tower(p, dx + tx, 210, 40, 150, pal.mid, 'crenel', 5, pal.light, 31);
      p.rect(dx + tx - 3, 60, 46, 4, shade(pal.mid, 0.12));
      // banner
      p.rect(dx + tx + 16, 70, 8, 40, pal.accent);
      p.poly([[dx + tx + 16, 110], [dx + tx + 24, 110], [dx + tx + 20, 104]], pal.mid);
      p.rect(dx + tx + 16, 70, 2, 34, shade(pal.accent, -0.35));
    }
    p.rect(dx, 205, BG_W, 1, shade(pal.mid, 0.3));
  });
}

function libraryFar(p: Px, pal: BiomePalette) {
  gradient(p, pal.sky, pal.skyLow);
  wrap((dx) => {
    // towering shelves
    for (let x = 0; x < BG_W; x += 80) {
      const sx = x + dx;
      p.rect(sx, 20, 64, 250, pal.far);
      for (let y = 30; y < 260; y += 18) {
        p.rect(sx + 2, y + 15, 60, 2, shade(pal.far, 0.15));
        for (let b = 0; b < 30; b++) {
          const h = 9 + Math.floor(noise2(b, y + x, 2) * 5);
          const col = mix(pal.far, [0x4a1a2a, 0x1a3248, 0x2a4020, 0x4a4020][b % 4], 0.35);
          p.rect(sx + 2 + b * 2, y + 15 - h, 2, h, col);
        }
      }
    }
    // tall arched window between shelves (warm)
    for (let x = 64; x < BG_W; x += 160) {
      const wx = x + dx;
      p.ellipse(wx + 8, 50, 8, 10, pal.light, 0.25);
      p.rect(wx, 50, 16, 80, pal.light, 0.25);
      p.rect(wx + 7, 40, 2, 90, pal.far);
    }
  });
  fogBand(p, 120, 120, pal.fog, 0.18);
  // floating arcane motes
  for (let k = 0; k < 40; k++) p.p(Math.floor(noise2(k, 5, 6) * BG_W), Math.floor(noise2(k, 6, 6) * BG_H), pal.accent, 0.5);
}

function libraryMid(p: Px, pal: BiomePalette) {
  wrap((dx) => {
    for (let x = 0; x < BG_W; x += 240) {
      const ax = x + dx;
      // gothic arch frame
      p.rect(ax, 0, 18, BG_H, pal.mid);
      p.rect(ax + 2, 0, 2, BG_H, shade(pal.mid, 0.2));
      p.poly([[ax + 18, 0], [ax + 120, 0], [ax + 18, 70]], pal.mid);
      // reading lectern + candle
      const lx = ax + 130;
      p.rect(lx, 228, 4, 42, pal.mid);
      p.poly([[lx - 10, 228], [lx + 14, 222], [lx + 14, 226], [lx - 10, 232]], pal.mid);
      p.rect(lx + 2, 214, 2, 8, shade(pal.mid, 0.4));
      p.p(lx + 2, 212, pal.light);
      p.circle(lx + 2, 212, 4, pal.light, 0.15);
      // rolling ladder
      p.line(ax + 190, 40, ax + 205, 270, pal.mid, 2);
      p.line(ax + 202, 40, ax + 217, 270, pal.mid, 2);
      for (let y = 50; y < 270; y += 14) p.line(ax + 190 + ((y - 40) * 15) / 230, y, ax + 202 + ((y - 40) * 15) / 230, y, pal.mid, 1);
    }
  });
  p.rect(0, 258, BG_W, 12, pal.mid);
}

function throneFar(p: Px, pal: BiomePalette) {
  gradient(p, pal.sky, pal.skyLow);
  wrap((dx) => {
    for (let x = 0; x < BG_W; x += 120) {
      const wx = x + dx + 40;
      // huge stained-glass window with crimson glow
      p.ellipse(wx + 20, 70, 20, 26, shade(pal.accent2, -0.45));
      p.rect(wx, 70, 40, 140, shade(pal.accent2, -0.45));
      p.ellipse(wx + 20, 72, 16, 22, shade(pal.accent2, -0.2), 0.8);
      p.rect(wx + 4, 72, 32, 136, shade(pal.accent2, -0.2), 0.8);
      for (let k = 0; k < 4; k++) p.rect(wx + 4 + k * 10, 60, 2, 150, pal.far);
      for (let y = 90; y < 210; y += 24) p.rect(wx + 4, y, 32, 2, pal.far);
      p.circle(wx + 20, 60, 6, pal.accent, 0.4);
      // pillars between windows
      p.rect(x + dx, 0, 24, BG_H, pal.far);
      p.rect(x + dx + 2, 0, 2, BG_H, shade(pal.far, 0.2));
    }
  });
  fogBand(p, 180, 70, pal.fog, 0.25);
  p.rect(0, 240, BG_W, 30, shade(pal.far, -0.2));
}

function throneMid(p: Px, pal: BiomePalette) {
  wrap((dx) => {
    for (let x = 0; x < BG_W; x += 160) {
      const px = x + dx + 30;
      p.rect(px, 0, 28, BG_H, pal.mid);
      p.rect(px - 4, 0, 36, 10, shade(pal.mid, 0.1));
      p.rect(px - 4, 220, 36, 10, shade(pal.mid, 0.1));
      p.rect(px + 3, 0, 2, BG_H, shade(pal.mid, 0.25));
      // crimson banner with gold crown sigil
      p.rect(px + 6, 20, 16, 70, shade(pal.accent2, -0.25));
      p.poly([[px + 6, 90], [px + 22, 90], [px + 14, 100]], shade(pal.accent2, -0.25));
      p.rect(px + 10, 40, 8, 2, shade(pal.accent, -0.2));
      for (let k = 0; k < 3; k++) p.rect(px + 10 + k * 3, 36, 2, 4, shade(pal.accent, -0.2));
      // chandelier
      const cx = px + 95;
      p.rect(cx, 0, 1, 40, pal.mid);
      p.ellipse(cx, 42, 16, 3, pal.mid);
      for (let k = -2; k <= 2; k++) {
        p.rect(cx + k * 7, 36, 1, 4, pal.mid);
        p.p(cx + k * 7, 34, pal.light);
        p.circle(cx + k * 7, 34, 3, pal.light, 0.14);
      }
    }
  });
  p.rect(0, 250, BG_W, 20, pal.mid);
}

const FAR: Record<BiomeId, (p: Px, pal: BiomePalette) => void> = {
  cells: cellsFar,
  ramparts: rampartsFar,
  library: libraryFar,
  throne: throneFar,
};
const MID: Record<BiomeId, (p: Px, pal: BiomePalette) => void> = {
  cells: cellsMid,
  ramparts: rampartsMid,
  library: libraryMid,
  throne: throneMid,
};

export function drawBgFar(p: Px, biome: BiomeId): void {
  FAR[biome](p, BIOME_PALETTES[biome]);
}

export function drawBgMid(p: Px, biome: BiomeId): void {
  MID[biome](p, BIOME_PALETTES[biome]);
}
