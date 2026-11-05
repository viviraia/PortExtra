/** UI textures: touch controls, slots, cursor, title logo. */
import Phaser from 'phaser';
import { css, outlineRegion, Px } from '../canvas';
import { UI } from '../keys';
import { buildImage } from '../sheet';
import { drawGlyphText, measureGlyphText } from '../font';

const W = 0xffffff;
type Glyph = 'jump' | 'attack1' | 'attack2' | 'dodge' | 'skill1' | 'skill2' | 'potion' | 'interact' | 'pause';

const GLYPHS: Record<Glyph, (p: Px) => void> = {
  jump: (p) => { p.poly([[8, 2], [14, 9], [10, 9], [10, 14], [6, 14], [6, 9], [2, 9]], W); },
  attack1: (p) => { p.line(3, 13, 13, 3, W, 2); p.line(2, 10, 6, 14, W, 1); p.p(14, 2, W); },
  attack2: (p) => { p.line(5, 1, 9, 4, W, 1); p.line(9, 4, 9, 12, W, 1); p.line(9, 12, 5, 15, W, 1); p.line(5, 1, 5, 15, W, 1); p.line(2, 8, 14, 8, W, 1); p.p(14, 8, W); },
  dodge: (p) => { p.ring(8, 9, 5, W, 2); p.ctx.clearRect(p.ox + 8, p.oy + 2, 8, 6); p.poly([[9, 1], [14, 5], [9, 8]], W); },
  skill1: (p) => { p.poly([[8, 1], [10, 6], [15, 6], [11, 9], [13, 15], [8, 11], [3, 15], [5, 9], [1, 6], [6, 6]], W); },
  skill2: (p) => { p.poly([[8, 1], [15, 8], [8, 15], [1, 8]], W); p.poly([[8, 5], [11, 8], [8, 11], [5, 8]], 0x000000, 0); p.ctx.clearRect(p.ox + 7, p.oy + 7, 2, 2); },
  potion: (p) => { p.rect(6, 1, 4, 3, W); p.rect(5, 4, 6, 1, W); p.circle(8, 10, 4.5, W); },
  interact: (p) => { p.rect(6, 6, 6, 8, W); p.rect(6, 2, 2, 6, W); p.rect(8, 3, 2, 5, W); p.rect(10, 4, 2, 4, W); p.rect(3, 8, 3, 2, W); },
  pause: (p) => { p.rect(4, 2, 3, 12, W); p.rect(9, 2, 3, 12, W); },
};

export function buildUi(scene: Phaser.Scene): void {
  buildImage(scene, UI.stickBase, 64, 64, (p) => {
    p.circle(32, 32, 30, W, 0.12);
    p.ring(32, 32, 30, W, 2, 0.5);
    p.ring(32, 32, 20, W, 1, 0.18);
    for (const [x, y] of [[32, 6], [32, 58], [6, 32], [58, 32]]) p.circle(x, y, 1.5, W, 0.5);
  });
  buildImage(scene, UI.stickKnob, 28, 28, (p) => {
    p.circle(14, 14, 13, W, 0.35);
    p.ring(14, 14, 13, W, 2, 0.8);
    p.circle(12, 12, 5, W, 0.25);
  });
  buildImage(scene, UI.button, 40, 40, (p) => {
    p.circle(20, 20, 19, W, 0.16);
    p.ring(20, 20, 19, W, 2, 0.6);
    p.ring(20, 20, 16, W, 1, 0.15);
  });
  for (const [name, fn] of Object.entries(GLYPHS) as [Glyph, (p: Px) => void][]) {
    buildImage(scene, UI.btnGlyph(name), 16, 16, (p) => fn(p));
  }
  buildImage(scene, UI.slot, 20, 20, (p) => {
    p.rect(0, 0, 20, 20, 0x0a0810, 0.75);
    p.rect(1, 1, 18, 18, 0x1c1828, 0.85);
    p.rect(0, 0, 20, 1, 0x6a6080);
    p.rect(0, 19, 20, 1, 0x3a3448);
    p.rect(0, 0, 1, 20, 0x5a5070);
    p.rect(19, 0, 1, 20, 0x3a3448);
    for (const [x, y] of [[1, 1], [18, 1], [1, 18], [18, 18]]) p.p(x, y, 0x8a80a0);
  });
  buildImage(scene, UI.cursor, 9, 9, (p) => {
    p.rect(4, 0, 1, 3, W); p.rect(4, 6, 1, 3, W); p.rect(0, 4, 3, 1, W); p.rect(6, 4, 3, 1, W); p.p(4, 4, W);
  });

  // title logo
  buildImage(scene, UI.title, 240, 48, (p, ctx) => {
    const s1 = 'HOLLOW', s2 = 'SPIRE';
    const scale = 3;
    const grad = (row: number) => css([0xfff0c0, 0xffe0a0, 0xffc870, 0xffa848, 0xf08030, 0xd05a20, 0xa03818][Math.min(6, row)]);
    const w1 = measureGlyphText(s1, scale), w2 = measureGlyphText(s2, scale);
    const gap = 14;
    const total = w1 + gap + w2;
    const x1 = Math.floor((240 - total) / 2), y = 20;
    // spire silhouette behind the gap
    const sx = x1 + w1 + Math.floor(gap / 2);
    p.poly([[sx - 4, y + 22], [sx + 4, y + 22], [sx + 2, y - 1], [sx, y - 16], [sx - 2, y - 1]], 0x2a1420);
    p.rect(sx - 1, y + 4, 2, 3, 0xff9a3c);
    p.p(sx, y - 16, 0xffd080);
    // drop shadow
    drawGlyphText(ctx, s1, x1 + 2, y + 3, scale, css(0x200810));
    drawGlyphText(ctx, s2, x1 + w1 + gap + 2, y + 3, scale, css(0x200810));
    drawGlyphText(ctx, s1, x1, y, scale, grad);
    drawGlyphText(ctx, s2, x1 + w1 + gap, y, scale, grad);
    // embers
    for (let k = 0; k < 14; k++) {
      const ex = x1 + ((k * 37) % total), ey = y - 3 - ((k * 13) % 12);
      p.p(ex, ey, k % 2 ? 0xff9a3c : 0xffd080, 0.4 + (k % 3) * 0.2);
    }
    outlineRegion(ctx, 0, 0, 240, 48, 0x0a0408);
  });
}
