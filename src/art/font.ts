/**
 * Code-generated variable-width pixel font (5x7 glyphs on a 6x8 grid, with
 * 1-row descenders for lowercase g j p q y). Registered as Phaser bitmap fonts
 * 'pixel' (1x) and 'pixel-big' (2x). Glyphs are white; use setTint for color.
 */
import Phaser from 'phaser';
import { UI } from './keys';

// Each glyph: rows separated by spaces, '#' = pixel. 7 or 8 rows.
const G: Record<string, string> = {
  '!': '..#.. ..#.. ..#.. ..#.. ..#.. ..... ..#..',
  '"': '.#.#. .#.#. ..... ..... ..... ..... .....',
  '#': '.#.#. ##### .#.#. .#.#. ##### .#.#. .....',
  $: '..#.. .#### #.#.. .###. ..#.# ####. ..#..',
  '%': '##..# ##..# ...#. ..#.. .#... #..## #..##',
  '&': '.##.. #..#. .##.. .#... #.#.# #..#. .##.#',
  "'": '..#.. ..#.. ..... ..... ..... ..... .....',
  '(': '...#. ..#.. .#... .#... .#... ..#.. ...#.',
  ')': '.#... ..#.. ...#. ...#. ...#. ..#.. .#...',
  '*': '..... ..#.. #.#.# .###. #.#.# ..#.. .....',
  '+': '..... ..#.. ..#.. ##### ..#.. ..#.. .....',
  ',': '..... ..... ..... ..... ..... ..#.. .#...',
  '-': '..... ..... ..... .###. ..... ..... .....',
  '.': '..... ..... ..... ..... ..... ..... ..#..',
  '/': '....# ....# ...#. ..#.. .#... #.... #....',
  '0': '.###. #...# #..## #.#.# ##..# #...# .###.',
  '1': '..#.. .##.. ..#.. ..#.. ..#.. ..#.. .###.',
  '2': '.###. #...# ....# ...#. ..#.. .#... #####',
  '3': '##### ...#. ..#.. ...#. ....# #...# .###.',
  '4': '...#. ..##. .#.#. #..#. ##### ...#. ...#.',
  '5': '##### #.... ####. ....# ....# #...# .###.',
  '6': '..##. .#... #.... ####. #...# #...# .###.',
  '7': '##### ....# ...#. ..#.. .#... .#... .#...',
  '8': '.###. #...# #...# .###. #...# #...# .###.',
  '9': '.###. #...# #...# .#### ....# ...#. .##..',
  ':': '..... ..... ..#.. ..... ..... ..#.. .....',
  ';': '..... ..... ..#.. ..... ..... ..#.. .#...',
  '<': '...#. ..#.. .#... #.... .#... ..#.. ...#.',
  '=': '..... ..... ##### ..... ##### ..... .....',
  '>': '.#... ..#.. ...#. ....# ...#. ..#.. .#...',
  '?': '.###. #...# ....# ...#. ..#.. ..... ..#..',
  '@': '.###. #...# #.### #.#.# #.### #.... .###.',
  A: '.###. #...# #...# ##### #...# #...# #...#',
  B: '####. #...# #...# ####. #...# #...# ####.',
  C: '.###. #...# #.... #.... #.... #...# .###.',
  D: '###.. #..#. #...# #...# #...# #..#. ###..',
  E: '##### #.... #.... ####. #.... #.... #####',
  F: '##### #.... #.... ####. #.... #.... #....',
  G: '.###. #...# #.... #.### #...# #...# .####',
  H: '#...# #...# #...# ##### #...# #...# #...#',
  I: '.###. ..#.. ..#.. ..#.. ..#.. ..#.. .###.',
  J: '..### ...#. ...#. ...#. ...#. #..#. .##..',
  K: '#...# #..#. #.#.. ##... #.#.. #..#. #...#',
  L: '#.... #.... #.... #.... #.... #.... #####',
  M: '#...# ##.## #.#.# #.#.# #...# #...# #...#',
  N: '#...# #...# ##..# #.#.# #..## #...# #...#',
  O: '.###. #...# #...# #...# #...# #...# .###.',
  P: '####. #...# #...# ####. #.... #.... #....',
  Q: '.###. #...# #...# #...# #.#.# #..#. .##.#',
  R: '####. #...# #...# ####. #.#.. #..#. #...#',
  S: '.#### #.... #.... .###. ....# ....# ####.',
  T: '##### ..#.. ..#.. ..#.. ..#.. ..#.. ..#..',
  U: '#...# #...# #...# #...# #...# #...# .###.',
  V: '#...# #...# #...# #...# #...# .#.#. ..#..',
  W: '#...# #...# #...# #.#.# #.#.# #.#.# .#.#.',
  X: '#...# #...# .#.#. ..#.. .#.#. #...# #...#',
  Y: '#...# #...# .#.#. ..#.. ..#.. ..#.. ..#..',
  Z: '##### ....# ...#. ..#.. .#... #.... #####',
  '[': '.###. .#... .#... .#... .#... .#... .###.',
  '\\': '#.... #.... .#... ..#.. ...#. ....# ....#',
  ']': '.###. ...#. ...#. ...#. ...#. ...#. .###.',
  '^': '..#.. .#.#. #...# ..... ..... ..... .....',
  _: '..... ..... ..... ..... ..... ..... #####',
  '`': '.#... ..#.. ..... ..... ..... ..... .....',
  a: '..... ..... .###. ....# .#### #...# .####',
  b: '#.... #.... ####. #...# #...# #...# ####.',
  c: '..... ..... .###. #.... #.... #.... .###.',
  d: '....# ....# .#### #...# #...# #...# .####',
  e: '..... ..... .###. #...# ##### #.... .###.',
  f: '..##. .#... ####. .#... .#... .#... .#...',
  g: '..... ..... .#### #...# #...# .#### ....# .###.',
  h: '#.... #.... ####. #...# #...# #...# #...#',
  i: '..#.. ..... .##.. ..#.. ..#.. ..#.. .###.',
  j: '...#. ..... ..##. ...#. ...#. ...#. #..#. .##..',
  k: '#.... #.... #..#. #.#.. ##... #.#.. #..#.',
  l: '.##.. ..#.. ..#.. ..#.. ..#.. ..#.. .###.',
  m: '..... ..... ##.#. #.#.# #.#.# #.#.# #...#',
  n: '..... ..... ####. #...# #...# #...# #...#',
  o: '..... ..... .###. #...# #...# #...# .###.',
  p: '..... ..... ####. #...# #...# ####. #.... #....',
  q: '..... ..... .#### #...# #...# .#### ....# ....#',
  r: '..... ..... #.##. ##..# #.... #.... #....',
  s: '..... ..... .#### #.... .###. ....# ####.',
  t: '.#... .#... ####. .#... .#... .#..# ..##.',
  u: '..... ..... #...# #...# #...# #..## .##.#',
  v: '..... ..... #...# #...# #...# .#.#. ..#..',
  w: '..... ..... #...# #...# #.#.# #.#.# .#.#.',
  x: '..... ..... #...# .#.#. ..#.. .#.#. #...#',
  y: '..... ..... #...# #...# #...# .#### ....# .###.',
  z: '..... ..... ##### ...#. ..#.. .#... #####',
  '{': '...#. ..#.. ..#.. .#... ..#.. ..#.. ...#.',
  '|': '..#.. ..#.. ..#.. ..#.. ..#.. ..#.. ..#..',
  '}': '.#... ..#.. ..#.. ...#. ..#.. ..#.. .#...',
  '~': '..... ..... .#... #.#.# ...#. ..... .....',
};

const CELL_W = 6, CELL_H = 8, COLS = 16;

function buildFont(scene: Phaser.Scene, key: string, scale: number): void {
  if (scene.cache.bitmapFont.exists(key)) return;
  const codes: number[] = [];
  for (let c = 32; c <= 126; c++) codes.push(c);
  const rows = Math.ceil(codes.length / COLS);
  const W = COLS * CELL_W * scale, H = rows * CELL_H * scale;
  const tex = scene.textures.createCanvas(key, W, H)!;
  const ctx = tex.context;
  ctx.fillStyle = '#ffffff';
  const chars: Record<number, any> = {};
  codes.forEach((code, idx) => {
    const ch = String.fromCharCode(code);
    const cx = (idx % COLS) * CELL_W * scale, cy = Math.floor(idx / COLS) * CELL_H * scale;
    const rowsS = (G[ch] ?? '').split(' ').filter(Boolean);
    let minX = 99, maxX = -1;
    rowsS.forEach((r, y) => {
      for (let x = 0; x < r.length; x++) {
        if (r[x] !== '#') continue;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        ctx.fillRect(cx + x * scale, cy + y * scale, scale, scale);
      }
    });
    let gx = 0, gw = 3;
    if (maxX >= 0) {
      gx = minX;
      gw = maxX - minX + 1;
    }
    const x = cx + gx * scale, y = cy, w = gw * scale, h = CELL_H * scale;
    chars[code] = {
      x, y, width: w, height: h,
      centerX: Math.floor(w / 2), centerY: Math.floor(h / 2),
      xOffset: 0, yOffset: 0,
      xAdvance: (gw + 1) * scale,
      data: {}, kerning: {},
      u0: x / W, v0: y / H, u1: (x + w) / W, v1: (y + h) / H,
    };
  });
  tex.refresh();
  scene.cache.bitmapFont.add(key, {
    data: { retroFont: true, font: key, size: CELL_H * scale, lineHeight: (CELL_H + 2) * scale, chars },
    texture: key,
    frame: null,
  });
}

export function buildFonts(scene: Phaser.Scene): void {
  buildFont(scene, UI.font, 1);
  buildFont(scene, UI.fontBig, 2);
}

/** Draw a string with the glyph table directly onto a canvas (used for the title logo). */
export function drawGlyphText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, scale: number, color: string | ((row: number) => string)): number {
  let cx = x;
  for (const ch of text) {
    if (ch === ' ') { cx += 4 * scale; continue; }
    const rowsS = (G[ch] ?? '').split(' ').filter(Boolean);
    let minX = 99, maxX = -1;
    rowsS.forEach((r) => { for (let i = 0; i < r.length; i++) if (r[i] === '#') { minX = Math.min(minX, i); maxX = Math.max(maxX, i); } });
    if (maxX < 0) { cx += 4 * scale; continue; }
    rowsS.forEach((r, ry) => {
      ctx.fillStyle = typeof color === 'function' ? color(ry) : color;
      for (let i = minX; i <= maxX; i++) if (r[i] === '#') ctx.fillRect(cx + (i - minX) * scale, y + ry * scale, scale, scale);
    });
    cx += (maxX - minX + 2) * scale;
  }
  return cx - x;
}

export function measureGlyphText(text: string, scale: number): number {
  let w = 0;
  for (const ch of text) {
    if (ch === ' ') { w += 4 * scale; continue; }
    const rowsS = (G[ch] ?? '').split(' ').filter(Boolean);
    let minX = 99, maxX = -1;
    rowsS.forEach((r) => { for (let i = 0; i < r.length; i++) if (r[i] === '#') { minX = Math.min(minX, i); maxX = Math.max(maxX, i); } });
    w += maxX < 0 ? 4 * scale : (maxX - minX + 2) * scale;
  }
  return w - scale;
}
