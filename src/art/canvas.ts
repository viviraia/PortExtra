/**
 * Low-level pixel drawing helpers used by the code-generated art pipeline.
 * Everything draws on a 2D canvas context with integer coordinates, no smoothing.
 */

export type Color = number;

const cssCache = new Map<number, string>();
export function css(c: Color, a = 1): string {
  if (a >= 1) {
    let s = cssCache.get(c);
    if (!s) {
      s = '#' + (c & 0xffffff).toString(16).padStart(6, '0');
      cssCache.set(c, s);
    }
    return s;
  }
  return `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${Math.max(0, a).toFixed(3)})`;
}

export function rgb(c: Color): [number, number, number] {
  return [(c >> 16) & 255, (c >> 8) & 255, c & 255];
}

export function fromRgb(r: number, g: number, b: number): Color {
  const cl = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return (cl(r) << 16) | (cl(g) << 8) | cl(b);
}

/** Mix two colors; t=0 -> a, t=1 -> b. */
export function mix(a: Color, b: Color, t: number): Color {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  return fromRgb(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

/** f > 0 lightens toward white, f < 0 darkens toward black. */
export function shade(c: Color, f: number): Color {
  return f >= 0 ? mix(c, 0xffffff, f) : mix(c, 0x000000, -f);
}

/** Deterministic tiny hash -> [0,1) for per-pixel noise. */
export function noise2(x: number, y: number, seed = 0): number {
  let h = (x * 374761393 + y * 668265263 + seed * 982451653) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return c;
}

/**
 * A "pen" that draws into a context relative to an origin (frame top-left).
 * Global alpha can be set with `alpha`.
 */
export class Px {
  alpha = 1;
  constructor(public ctx: CanvasRenderingContext2D, public ox = 0, public oy = 0, public w = 9999, public h = 9999) {}

  at(ox: number, oy: number, w = this.w, h = this.h): Px {
    const p = new Px(this.ctx, ox, oy, w, h);
    p.alpha = this.alpha;
    return p;
  }

  private inside(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  p(x: number, y: number, c: Color, a = 1): void {
    x = Math.round(x);
    y = Math.round(y);
    if (!this.inside(x, y)) return;
    this.ctx.fillStyle = css(c, a * this.alpha);
    this.ctx.fillRect(this.ox + x, this.oy + y, 1, 1);
  }

  rect(x: number, y: number, w: number, h: number, c: Color, a = 1): void {
    x = Math.round(x);
    y = Math.round(y);
    w = Math.round(w);
    h = Math.round(h);
    const x0 = Math.max(0, x), y0 = Math.max(0, y);
    const x1 = Math.min(this.w, x + w), y1 = Math.min(this.h, y + h);
    if (x1 <= x0 || y1 <= y0) return;
    this.ctx.fillStyle = css(c, a * this.alpha);
    this.ctx.fillRect(this.ox + x0, this.oy + y0, x1 - x0, y1 - y0);
  }

  /** Thick line via stamping squares along Bresenham. */
  line(x0: number, y0: number, x1: number, y1: number, c: Color, th = 1, a = 1): void {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    const off = Math.floor((th - 1) / 2);
    for (let guard = 0; guard < 2000; guard++) {
      this.rect(x0 - off, y0 - off, th, th, c, a);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  circle(cx: number, cy: number, r: number, c: Color, a = 1): void {
    const ri = Math.ceil(r);
    for (let y = -ri; y <= ri; y++) {
      // row span
      let span = -1;
      for (let x = 0; x <= ri; x++) if (x * x + y * y <= r * r + r * 0.6) span = x;
      if (span >= 0) this.rect(Math.round(cx) - span, Math.round(cy) + y, span * 2 + 1, 1, c, a);
    }
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, c: Color, a = 1): void {
    const ryi = Math.ceil(ry);
    for (let y = -ryi; y <= ryi; y++) {
      const t = 1 - (y * y) / ((ry + 0.3) * (ry + 0.3));
      if (t < 0) continue;
      const span = Math.round(rx * Math.sqrt(t));
      this.rect(Math.round(cx) - span, Math.round(cy) + y, span * 2 + 1, 1, c, a);
    }
  }

  ring(cx: number, cy: number, r: number, c: Color, th = 1, a = 1): void {
    const ri = Math.ceil(r + 1);
    for (let y = -ri; y <= ri; y++)
      for (let x = -ri; x <= ri; x++) {
        const d = Math.sqrt(x * x + y * y);
        if (d <= r + 0.5 && d > r - th + 0.5) this.p(cx + x, cy + y, c, a);
      }
  }

  /** Filled polygon (even-odd scanline at pixel centers). */
  poly(pts: [number, number][], c: Color, a = 1): void {
    if (pts.length < 3) return;
    let minY = Infinity, maxY = -Infinity;
    for (const [, y] of pts) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      const yc = y + 0.5;
      const xs: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const [x1, y1] = pts[i];
        const [x2, y2] = pts[(i + 1) % pts.length];
        if ((y1 <= yc && y2 > yc) || (y2 <= yc && y1 > yc)) xs.push(x1 + ((yc - y1) / (y2 - y1)) * (x2 - x1));
      }
      xs.sort((p, q) => p - q);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        const xa = Math.round(xs[i]), xb = Math.round(xs[i + 1]);
        if (xb > xa) this.rect(xa, y, xb - xa, 1, c, a);
      }
    }
  }

  /** Draw an ASCII grid: chars map to colors, '.' / ' ' transparent. */
  grid(x: number, y: number, rows: string[], map: Record<string, Color>, a = 1): void {
    for (let j = 0; j < rows.length; j++) {
      const row = rows[j];
      for (let i = 0; i < row.length; i++) {
        const ch = row[i];
        if (ch === '.' || ch === ' ') continue;
        const col = map[ch];
        if (col === undefined) continue;
        this.p(x + i, y + j, col, a);
      }
    }
  }

  /** Same as grid but mirrored horizontally. */
  gridFlip(x: number, y: number, rows: string[], map: Record<string, Color>, a = 1): void {
    this.grid(x, y, rows.map((r) => [...r].reverse().join('')), map, a);
  }
}

/**
 * Adds a 1px outline (4-neighbourhood) around opaque pixels within a region.
 * Pixels that are already opaque are untouched.
 */
export function outlineRegion(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: Color, alpha = 1): void {
  const img = ctx.getImageData(x, y, w, h);
  const d = img.data;
  const [r, g, b] = rgb(color);
  const opaque = (i: number, j: number) => i >= 0 && j >= 0 && i < w && j < h && d[(j * w + i) * 4 + 3] > 100;
  const mark: number[] = [];
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      if (d[(j * w + i) * 4 + 3] > 100) continue;
      if (opaque(i - 1, j) || opaque(i + 1, j) || opaque(i, j - 1) || opaque(i, j + 1)) mark.push(j * w + i);
    }
  for (const k of mark) {
    d[k * 4] = r; d[k * 4 + 1] = g; d[k * 4 + 2] = b; d[k * 4 + 3] = Math.round(255 * alpha);
  }
  ctx.putImageData(img, x, y);
}

/** Multiply alpha of a region (used for fading death frames / ghosts). */
export function fadeRegion(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, alpha: number): void {
  const img = ctx.getImageData(x, y, w, h);
  const d = img.data;
  for (let i = 3; i < d.length; i += 4) d[i] = Math.round(d[i] * alpha);
  ctx.putImageData(img, x, y);
}

/** Tint opaque pixels of a region toward a color (used for hurt flashes / windup glow). */
export function tintRegion(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: Color, t: number): void {
  const img = ctx.getImageData(x, y, w, h);
  const d = img.data;
  const [r, g, b] = rgb(color);
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    d[i] = d[i] + (r - d[i]) * t;
    d[i + 1] = d[i + 1] + (g - d[i + 1]) * t;
    d[i + 2] = d[i + 2] + (b - d[i + 2]) * t;
  }
  ctx.putImageData(img, x, y);
}

/**
 * Pixel dissolve: removes pixels whose hash is below `amount` (0..1), for
 * disintegrating death frames.
 */
export function dissolveRegion(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, amount: number, seed = 1): void {
  const img = ctx.getImageData(x, y, w, h);
  const d = img.data;
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      if (noise2(i, j, seed) < amount) d[(j * w + i) * 4 + 3] = 0;
    }
  ctx.putImageData(img, x, y);
}

/**
 * Rim light: lightens opaque pixels whose neighbour in direction (dx,dy) is transparent.
 */
export function rimRegion(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, dx: number, dy: number, color: Color, t: number): void {
  const img = ctx.getImageData(x, y, w, h);
  const d = img.data;
  const src = new Uint8ClampedArray(d);
  const [r, g, b] = rgb(color);
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const k = (j * w + i) * 4;
      if (src[k + 3] < 100) continue;
      const ni = i + dx, nj = j + dy;
      const nOpaque = ni >= 0 && nj >= 0 && ni < w && nj < h && src[(nj * w + ni) * 4 + 3] > 100;
      if (nOpaque) continue;
      d[k] = src[k] + (r - src[k]) * t;
      d[k + 1] = src[k + 1] + (g - src[k + 1]) * t;
      d[k + 2] = src[k + 2] + (b - src[k + 2]) * t;
    }
  ctx.putImageData(img, x, y);
}

/** Subtle per-pixel value noise on opaque pixels (texture for large flat areas). */
export function grainRegion(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, amount: number, seed = 3): void {
  const img = ctx.getImageData(x, y, w, h);
  const d = img.data;
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const k = (j * w + i) * 4;
      if (d[k + 3] < 100) continue;
      const n = noise2(i, j, seed);
      const f = n < 0.18 ? 1 - amount : n > 0.9 ? 1 + amount * 0.6 : 1;
      if (f === 1) continue;
      d[k] = Math.min(255, d[k] * f); d[k + 1] = Math.min(255, d[k + 1] * f); d[k + 2] = Math.min(255, d[k + 2] * f);
    }
  ctx.putImageData(img, x, y);
}
