/**
 * Phaser glue: turn procedural draw functions into canvas textures with
 * numbered frames and registered animations.
 */
import Phaser from 'phaser';
import { outlineRegion, Px, type Color } from './canvas';

export interface AnimSpec {
  /** Global animation key (also used as the anim name passed to draw). */
  key: string;
  frames: number;
  rate: number;
  /** -1 loops forever. Default 0 (play once). */
  repeat?: number;
}

export interface SheetOpts {
  key: string;
  fw: number;
  fh: number;
  anims: AnimSpec[];
  /** Draw frame `i` of `n` of animation `anim` with origin at the frame's top-left. */
  draw: (p: Px, anim: string, i: number, n: number) => void;
  /** Post-process a frame region (after outlining). */
  post?: (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, anim: string, i: number, n: number) => void;
  /** Post-process a frame region before outlining (rim light, grain). */
  pre?: (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, anim: string, i: number, n: number) => void;
  /** Outline color; null disables. */
  outline?: Color | null;
  /** Columns per row (default: fit in 2048 px). */
  cols?: number;
}

export interface SheetResult {
  /** anim key -> [first frame index, frame count] */
  ranges: Record<string, [number, number]>;
  total: number;
}

const MAX_W = 2048;

function getOrCreateCanvasTexture(scene: Phaser.Scene, key: string, w: number, h: number): Phaser.Textures.CanvasTexture {
  const tm = scene.textures;
  if (tm.exists(key)) {
    const t = tm.get(key);
    if (t instanceof Phaser.Textures.CanvasTexture && t.width === w && t.height === h) {
      t.context.clearRect(0, 0, w, h);
      return t;
    }
    tm.remove(key);
  }
  const t = tm.createCanvas(key, w, h)!;
  t.context.imageSmoothingEnabled = false;
  return t;
}

export function buildSheet(scene: Phaser.Scene, o: SheetOpts): SheetResult {
  const total = o.anims.reduce((s, a) => s + a.frames, 0);
  const cols = Math.max(1, Math.min(total, o.cols ?? Math.floor(MAX_W / o.fw)));
  const rows = Math.ceil(total / cols);
  const W = cols * o.fw, H = rows * o.fh;
  const tex = getOrCreateCanvasTexture(scene, o.key, W, H);
  const ctx = tex.context;
  const ranges: Record<string, [number, number]> = {};
  let idx = 0;
  for (const a of o.anims) {
    ranges[a.key] = [idx, a.frames];
    for (let i = 0; i < a.frames; i++, idx++) {
      const fx = (idx % cols) * o.fw, fy = Math.floor(idx / cols) * o.fh;
      ctx.save();
      ctx.beginPath();
      ctx.rect(fx, fy, o.fw, o.fh);
      ctx.clip();
      o.draw(new Px(ctx, fx, fy, o.fw, o.fh), a.key, i, a.frames);
      ctx.restore();
      o.pre?.(ctx, fx, fy, o.fw, o.fh, a.key, i, a.frames);
      if (o.outline !== null) outlineRegion(ctx, fx, fy, o.fw, o.fh, o.outline ?? 0x0a0810);
      o.post?.(ctx, fx, fy, o.fw, o.fh, a.key, i, a.frames);
    }
  }
  // frames (only add once; on rebuild the frame objects stay valid)
  for (let i = 0; i < total; i++) {
    if (!tex.has(String(i))) tex.add(i, 0, (i % cols) * o.fw, Math.floor(i / cols) * o.fh, o.fw, o.fh);
  }
  tex.refresh();
  for (const a of o.anims) {
    if (scene.anims.exists(a.key)) continue;
    const [s, n] = ranges[a.key];
    scene.anims.create({
      key: a.key,
      frames: Array.from({ length: n }, (_, k) => ({ key: o.key, frame: s + k })),
      frameRate: a.rate,
      repeat: a.repeat ?? 0,
    });
  }
  return { ranges, total };
}

/** Simple sheet of `count` frames with a single optional animation. */
export function buildFrames(
  scene: Phaser.Scene,
  key: string,
  fw: number,
  fh: number,
  count: number,
  draw: (p: Px, i: number, n: number) => void,
  anim?: { key: string; rate: number; repeat?: number },
  outline: Color | null = null,
): void {
  if (scene.textures.exists(key)) return;
  buildSheet(scene, {
    key,
    fw,
    fh,
    outline,
    anims: [{ key: anim?.key ?? `__${key}`, frames: count, rate: anim?.rate ?? 1, repeat: anim?.repeat }],
    draw: (p, _a, i, n) => draw(p, i, n),
  });
  if (!anim && scene.anims.exists(`__${key}`)) scene.anims.remove(`__${key}`);
}

/** Single-image texture. */
export function buildImage(scene: Phaser.Scene, key: string, w: number, h: number, draw: (p: Px, ctx: CanvasRenderingContext2D) => void, outline: Color | null = null): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w, h)!;
  const ctx = tex.context;
  ctx.imageSmoothingEnabled = false;
  draw(new Px(ctx, 0, 0, w, h), ctx);
  if (outline !== null) outlineRegion(ctx, 0, 0, w, h, outline);
  tex.refresh();
}
