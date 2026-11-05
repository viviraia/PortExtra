/** Combat effects. Mostly white so gameplay can tint them per weapon / status. */
import Phaser from 'phaser';
import { noise2 } from '../canvas';
import { ANIMS, FX, SLASH_FRAME, slashTex } from '../keys';
import type { SlashFx } from '../../data/types';
import { buildFrames, buildImage } from '../sheet';

const W = 0xffffff;

function arc(p: import('../canvas').Px, cx: number, cy: number, r: number, a0: number, a1: number, th: number, alpha: number) {
  if (alpha <= 0) return;
  const steps = Math.max(10, Math.ceil(Math.abs(a1 - a0) * r * 0.5));
  const outer: [number, number][] = [], inner: [number, number][] = [], edge: [number, number][] = [];
  for (let s2 = 0; s2 <= steps; s2++) {
    const t = s2 / steps;
    const a = a0 + (a1 - a0) * t;
    // crescent: thin tail -> thick near the leading edge -> sharp tip
    const thick = th * Math.pow(Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.92 + 0.08), 1.2);
    outer.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    inner.push([cx + Math.cos(a) * (r - thick), cy + Math.sin(a) * (r - thick)]);
    edge.push([cx + Math.cos(a) * (r - thick * 0.4), cy + Math.sin(a) * (r - thick * 0.4)]);
  }
  p.poly([...outer, ...inner.reverse()], W, alpha * 0.55);
  p.poly([...outer, ...edge.reverse()], W, alpha);
}

export function buildFx(scene: Phaser.Scene): void {
  const { w: SW, h: SH } = SLASH_FRAME;
  const D = Math.PI / 180;
  const slashes: Record<SlashFx, (p: import('../canvas').Px, i: number, n: number) => void> = {
    slash: (p, i, n) => {
      const t = (i + 1) / n;
      const a0 = -70 * D, a1 = a0 + 140 * D * Math.min(1, t * 1.4);
      arc(p, 16, 24, 20, a0 + Math.max(0, t - 0.5) * 100 * D, a1, 7, 1 - Math.max(0, t - 0.6) * 1.8);
    },
    'slash-wide': (p, i, n) => {
      const t = (i + 1) / n;
      const a0 = -110 * D, a1 = a0 + 220 * D * Math.min(1, t * 1.4);
      arc(p, 20, 24, 22, a0 + Math.max(0, t - 0.5) * 160 * D, a1, 8, 1 - Math.max(0, t - 0.6) * 1.8);
    },
    stab: (p, i, n) => {
      const t = (i + 1) / n;
      const len = Math.round(36 * Math.min(1, t * 1.6));
      const x0 = 8 + Math.round(Math.max(0, t - 0.5) * 30);
      const a = 1 - Math.max(0, t - 0.6) * 2;
      p.rect(x0, 23, Math.max(1, len - (x0 - 8)), 2, W, a);
      p.rect(x0 + 4, 22, Math.max(1, len - (x0 - 8) - 8), 1, W, a * 0.5);
      p.rect(x0 + 4, 25, Math.max(1, len - (x0 - 8) - 8), 1, W, a * 0.5);
      p.poly([[8 + len, 21], [12 + len, 24], [8 + len, 27]], W, a);
    },
    smash: (p, i, n) => {
      const t = (i + 1) / n;
      if (i < 2) arc(p, 16, 30, 20, -100 * D, (-100 + 130 * t * 1.6) * D, 7, 1);
      else {
        const k = i - 1;
        p.rect(14, 44, 30, 2, W, 1 - k * 0.25);
        for (let s = 0; s < 6; s++) {
          const x = 14 + s * 6;
          p.line(x, 43, x + (s - 2) * k, 43 - 4 * k - (s % 2) * 3, W, 1, 1 - k * 0.3);
        }
      }
    },
    spin: (p, i, n) => {
      const t = (i + 1) / n;
      const a0 = t * Math.PI * 2;
      arc(p, 24, 24, 21, a0, a0 + Math.PI * 1.4, 6, 1 - Math.max(0, t - 0.6) * 1.5);
    },
  };
  for (const [k, fn] of Object.entries(slashes) as [SlashFx, (p: import('../canvas').Px, i: number, n: number) => void][]) {
    buildFrames(scene, slashTex(k), SW, SH, 5, fn, { key: slashTex(k), rate: 24 });
  }

  // hit spark
  buildFrames(scene, FX.hitSpark, 16, 16, 4, (p, i) => {
    const r = [3, 6, 7, 7][i];
    const a = [1, 1, 0.7, 0.35][i];
    for (let k = 0; k < 8; k++) {
      const ang = (k / 8) * Math.PI * 2 + (k % 2) * 0.2;
      const r0 = i === 0 ? 0 : r - 3;
      p.line(8 + Math.cos(ang) * r0, 8 + Math.sin(ang) * r0, 8 + Math.cos(ang) * (k % 2 ? r - 2 : r), 8 + Math.sin(ang) * (k % 2 ? r - 2 : r), W, 1, a);
    }
    if (i < 2) p.circle(8, 8, 2 - i, W);
  }, { key: ANIMS.hitSpark, rate: 24 });

  // explosion
  buildFrames(scene, FX.explosion, 48, 48, 7, (p, i) => {
    const r = [6, 12, 17, 20, 21, 21, 20][i];
    if (i < 4) p.circle(24, 24, r, 0xd84a1a);
    if (i < 3) p.circle(24, 24, r * 0.75, 0xff9a3a);
    if (i < 2) p.circle(24, 24, r * 0.45, 0xfff0c0);
    if (i >= 2) {
      for (let k = 0; k < 9; k++) {
        const ang = (k / 9) * Math.PI * 2;
        const rr = r * 0.6;
        p.circle(24 + Math.cos(ang) * rr, 24 + Math.sin(ang) * rr - (i - 2), 5 - (i - 2) * 0.6, i < 4 ? 0x6a4a40 : 0x4a3a38, 1 - (i - 2) * 0.17);
      }
    }
    if (i >= 1 && i <= 3) for (let k = 0; k < 10; k++) p.p(24 + Math.cos(k * 2.4) * (r + 3), 24 + Math.sin(k * 2.4) * (r + 3), 0xffd080);
  }, { key: ANIMS.explosion, rate: 18 });

  buildFrames(scene, FX.dust, 16, 16, 5, (p, i) => {
    const a = 0.7 - i * 0.13;
    p.circle(5 - i * 0.5, 12 - i * 0.5, 2 + i * 0.6, 0xc8c0b0, a);
    p.circle(11 + i * 0.5, 12 - i * 0.5, 2 + i * 0.6, 0xc8c0b0, a);
    p.circle(8, 11 - i, 2 + i * 0.5, 0xe0d8c8, a);
  }, { key: ANIMS.dust, rate: 16 });

  buildFrames(scene, FX.smoke, 16, 16, 6, (p, i) => {
    const a = 0.65 - i * 0.1;
    p.circle(8, 12 - i * 1.5, 3 + i * 0.7, W, a);
    p.circle(6, 10 - i * 1.5, 2 + i * 0.5, W, a * 0.8);
  }, { key: ANIMS.smoke, rate: 12 });

  buildFrames(scene, FX.deathBurst, 32, 32, 6, (p, i) => {
    const r = 3 + i * 2.6;
    const a = 1 - i * 0.16;
    if (i < 2) p.circle(16, 16, 4 - i, W);
    p.ring(16, 16, r, W, i < 3 ? 2 : 1, a * 0.8);
    for (let k = 0; k < 12; k++) {
      const ang = (k / 12) * Math.PI * 2 + noise2(k, 1, 4);
      const rr = r + noise2(k, 2, 4) * 4;
      p.rect(16 + Math.cos(ang) * rr, 16 + Math.sin(ang) * rr - i, 1 + (k % 2), 1 + (k % 2), W, a);
    }
  }, { key: ANIMS.death, rate: 16 });

  buildFrames(scene, FX.lightning, 16, 64, 4, (p, i) => {
    let x = 8;
    const a = i === 3 ? 0.5 : 1;
    for (let y = 0; y < 64; y += 4) {
      const nx = 8 + Math.round((noise2(y, i, 31) - 0.5) * 10);
      p.line(x, y, nx, y + 4, W, 2, a);
      p.line(x, y, nx, y + 4, 0x9ad8ff, 1, a * 0.6);
      if (noise2(y, i, 32) > 0.8) p.line(nx, y + 4, nx + (noise2(y, i, 33) > 0.5 ? 5 : -5), y + 8, W, 1, a * 0.7);
      x = nx;
    }
  }, { key: ANIMS.lightning, rate: 20 });

  buildImage(scene, FX.particle, 4, 4, (p) => p.rect(0, 0, 4, 4, W));
  buildImage(scene, FX.spark, 2, 2, (p) => p.rect(0, 0, 2, 2, W));
  buildImage(scene, FX.glow, 64, 64, (_p, ctx) => {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.15)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  });
  buildImage(scene, FX.ring, 64, 64, (p) => {
    p.ring(32, 32, 30, W, 3);
    p.ring(32, 32, 27, W, 1, 0.4);
  });
  buildImage(scene, FX.shadow, 16, 4, (p) => {
    p.ellipse(8, 2, 7, 1.4, 0x000000, 0.45);
    p.ellipse(8, 2, 4, 1, 0x000000, 0.25);
  });
}
