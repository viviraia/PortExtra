/** The player: a hooded wanderer with ember eyes and a smouldering hood tip. */
import { PLAYER_ANIMS, PLAYER_FRAME } from '../keys';
import { dissolveRegion, fadeRegion, Px, rimRegion, shade, tintRegion } from '../canvas';
import { drawHumanoid, walkPose, type HumSpec, type Pose } from './rig';
import type { AnimSpec } from '../sheet';

export interface PlayerPalette {
  cloak: number;
  trim: number;
  skin: number;
  eyes: number;
}

export const PLAYER_ANIM_SPECS: AnimSpec[] = [
  { key: PLAYER_ANIMS.idle, frames: 4, rate: 6, repeat: -1 },
  { key: PLAYER_ANIMS.run, frames: 8, rate: 14, repeat: -1 },
  { key: PLAYER_ANIMS.jump, frames: 2, rate: 10 },
  { key: PLAYER_ANIMS.fall, frames: 2, rate: 8 },
  { key: PLAYER_ANIMS.roll, frames: 6, rate: 20 },
  { key: PLAYER_ANIMS.attackA, frames: 5, rate: 18 },
  { key: PLAYER_ANIMS.attackB, frames: 5, rate: 18 },
  { key: PLAYER_ANIMS.stab, frames: 4, rate: 18 },
  { key: PLAYER_ANIMS.shoot, frames: 4, rate: 14 },
  { key: PLAYER_ANIMS.block, frames: 2, rate: 10 },
  { key: PLAYER_ANIMS.cast, frames: 4, rate: 12 },
  { key: PLAYER_ANIMS.hurt, frames: 2, rate: 10 },
  { key: PLAYER_ANIMS.death, frames: 8, rate: 10 },
  { key: PLAYER_ANIMS.wallslide, frames: 2, rate: 6, repeat: -1 },
  { key: PLAYER_ANIMS.climb, frames: 4, rate: 8, repeat: -1 },
];

function spec(pal: PlayerPalette): HumSpec {
  return {
    cx: 16,
    ground: 31,
    legLen: 6,
    torsoLen: 8,
    torsoW: 7,
    headW: 8,
    headH: 7,
    armLen: 6,
    limb: 2,
    head: 'hood',
    body: 'tunic',
    cape: true,
    colors: {
      skin: pal.skin,
      body: 0x4c4048,
      trim: pal.trim,
      legs: 0x2a2630,
      boots: 0x3a2a22,
      eye: pal.eyes,
      head: pal.cloak,
      cape: shade(pal.cloak, -0.3),
    },
  };
}

function ember(p: Px, x: number, y: number, i: number, eye: number) {
  const f = i % 3;
  p.p(x, y, shade(eye, -0.2));
  p.p(x + 1, y, eye);
  p.p(x, y - 1, eye);
  p.p(x - (f === 1 ? 0 : 1), y - 2, shade(eye, 0.4), 0.9);
  if (f !== 1) p.p(x - (f === 2 ? 2 : 1), y - 3, shade(eye, 0.7), 0.6);
}

function sword(p: Px, hand: { x: number; y: number }, ang: number, trim: number) {
  // a short, generic blade so swings read even before the slash fx
  const a = (ang - 75) * (Math.PI / 180);
  const dx = Math.cos(a), dy = Math.sin(a);
  p.line(hand.x - dx, hand.y - dy, hand.x + dx, hand.y + dy, trim, 1);
  p.line(hand.x + dx * 2, hand.y + dy * 2, hand.x + dx * 8, hand.y + dy * 8, 0xc8ccd8, 1);
  p.p(hand.x + dx * 8, hand.y + dy * 8, 0xffffff);
}

export function drawPlayerFrame(p: Px, anim: string, i: number, n: number, pal: PlayerPalette): void {
  const s = spec(pal);
  const A = PLAYER_ANIMS;
  let pose: Pose = {};
  let weapon: 'none' | 'sword' | 'bow' | 'shield' | 'magic' = 'none';
  switch (anim) {
    case A.idle:
      pose = { bob: i >= 2 ? 1 : 0, cape: i % 2, armF: 85, armB: 95 };
      break;
    case A.run: {
      pose = { ...walkPose(i / n, 4, 3, 40), lean: 1, cape: 2 + (i % 2) };
      break;
    }
    case A.jump:
      pose = { footF: [2, 4], footB: [-2, 2], armF: -50 + i * 10, armB: 200, cape: 0, bob: -1 };
      break;
    case A.fall:
      pose = { footF: [1, 1], footB: [-2, 3], armF: -30, armB: 210, cape: 4 + i, bob: 0 };
      break;
    case A.roll: {
      drawRoll(p, i, n, pal);
      return;
    }
    case A.attackA: {
      const arms = [-130, -20, 40, 60, 75];
      pose = { armF: arms[i], armB: 120, lean: i === 1 ? 2 : i === 0 ? -1 : 1, footF: [2, 0], footB: [-3, 0], cape: i === 1 ? 3 : 1, bob: i === 1 ? 1 : 0 };
      weapon = 'sword';
      break;
    }
    case A.attackB: {
      const arms = [70, 20, -60, -100, -90];
      pose = { armF: arms[i], armB: 110, lean: i === 1 ? 2 : 0, footF: [3, 0], footB: [-2, 0], cape: 2, bob: i <= 1 ? 1 : 0 };
      weapon = 'sword';
      break;
    }
    case A.stab: {
      const ext = [-1, 3, 2, 0];
      pose = { armF: i === 0 ? 150 : 0, armB: 160, lean: ext[i], footF: [3 + Math.max(0, ext[i]), 0], footB: [-3, 0], cape: 2 + Math.max(0, ext[i]), bob: 1 };
      weapon = 'sword';
      break;
    }
    case A.shoot:
      pose = { armF: -5, armB: 0, lean: i === 1 ? -1 : 0, footF: [2, 0], footB: [-3, 0], cape: 1 };
      weapon = 'bow';
      break;
    case A.block:
      pose = { armF: -10, armB: 60, lean: -1, footF: [3, 0], footB: [-3, 0], bob: 1 + i, cape: 1 };
      weapon = 'shield';
      break;
    case A.cast:
      pose = { armF: i < 2 ? -80 - i * 10 : -20, armB: 140, glow: 1, cape: 2, bob: i === 3 ? 1 : 0 };
      weapon = 'magic';
      break;
    case A.hurt:
      pose = { armF: 140, armB: 200, lean: -2, footF: [2, 0], footB: [-1, 1], cape: 3, bob: 1 };
      break;
    case A.death: {
      if (i < 2) pose = { kneel: i === 1, lean: i === 1 ? 2 : -2, armF: 120, armB: 130, cape: 2, bob: i === 1 ? 0 : 1 };
      else {
        drawCollapsed(p, pal, i);
        return;
      }
      break;
    }
    case A.wallslide:
      pose = { armF: -60, armB: 100, lean: -1, footF: [3, 2], footB: [1, 5], cape: -1 + i, bob: 0, x: 2 };
      break;
    case A.climb: {
      const up = i % 2 === 0;
      pose = { armF: up ? -100 : -60, armB: up ? -60 : -100, footF: [0, up ? 3 : 0], footB: [0, up ? 0 : 3], cape: 0, bob: 0 };
      break;
    }
  }
  const out = drawHumanoid(
    p,
    s,
    pose,
    (pp, hand, ang) => {
      if (weapon === 'sword') sword(pp, hand, ang, pal.trim);
      else if (weapon === 'bow') {
        pp.line(hand.x + 1, hand.y - 6, hand.x + 3, hand.y - 2, 0x7a5432);
        pp.line(hand.x + 3, hand.y - 2, hand.x + 3, hand.y + 2, 0x7a5432);
        pp.line(hand.x + 3, hand.y + 2, hand.x + 1, hand.y + 6, 0x7a5432);
        pp.line(hand.x + 1, hand.y - 6, hand.x + 1 - (i === 1 ? 2 : 0), hand.y, 0xd8d0c0);
        pp.line(hand.x + 1 - (i === 1 ? 2 : 0), hand.y, hand.x + 1, hand.y + 6, 0xd8d0c0);
      } else if (weapon === 'shield') {
        pp.rect(hand.x, hand.y - 5, 3, 10, 0x6a4a2a);
        pp.rect(hand.x + 1, hand.y - 4, 1, 8, pal.trim);
      } else if (weapon === 'magic') {
        pp.circle(hand.x, hand.y - 1, 2, pal.eyes, 0.6);
        pp.p(hand.x, hand.y - 1, 0xffffff);
      }
    },
  );
  // collar / scarf
  p.rect(out.shoulder.x - 3, out.shoulder.y, 7, 1, pal.trim);
  p.p(out.shoulder.x - 4, out.shoulder.y + 1, shade(pal.trim, -0.3));
  // ember flame flickering off the hood tip
  ember(p, out.head.x - 7, out.head.y - 5, i, pal.eyes);
}

function drawRoll(p: Px, i: number, n: number, pal: PlayerPalette) {
  const cx = 16, cy = 25;
  const ang = (i / n) * Math.PI * 2;
  p.circle(cx, cy, 6, shade(pal.cloak, -0.15));
  p.circle(cx + 1, cy - 1, 4, pal.cloak);
  // trim band rotates
  for (let t = -4; t <= 4; t++) {
    const x = cx + Math.cos(ang) * t, y = cy + Math.sin(ang) * t;
    p.p(x, y, pal.trim);
  }
  // ember eye streak
  const ex = cx + Math.cos(ang + Math.PI / 2) * 4, ey = cy + Math.sin(ang + Math.PI / 2) * 4;
  p.p(ex, ey, pal.eyes);
  p.p(ex - Math.cos(ang) * 1, ey - Math.sin(ang) * 1, pal.eyes, 0.6);
  // dust trail
  p.p(cx - 8, cy + 5, 0x8a8478, 0.5);
  if (i % 2) p.p(cx - 10, cy + 4, 0x8a8478, 0.4);
}

function drawCollapsed(p: Px, pal: PlayerPalette, i: number) {
  // lying face down, cloak spread
  const g = 31;
  p.rect(7, g - 3, 16, 3, shade(pal.cloak, -0.3));
  p.rect(9, g - 4, 10, 2, pal.cloak);
  p.rect(19, g - 4, 5, 4, pal.cloak);
  p.rect(22, g - 3, 2, 2, 0x050308);
  if (i < 5) p.p(23, g - 2, pal.eyes, 1 - (i - 2) * 0.3);
  p.rect(9, g - 3, 6, 1, pal.trim);
  p.rect(5, g - 1, 3, 1, 0x3a2a22);
  if (i < 6) {
    // last ember rising
    p.p(14, g - 6 - (i - 2) * 3, pal.eyes, 1 - (i - 2) * 0.2);
  }
}

/** Post-process for hurt flash and death fade. */
export function playerPre(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  rimRegion(ctx, x, y, w, h, 1, -1, 0xfff0d0, 0.2);
}

export function playerPost(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, anim: string, i: number): void {
  if (anim === PLAYER_ANIMS.hurt && i === 0) tintRegion(ctx, x, y, w, h, 0xffffff, 0.65);
  if (anim === PLAYER_ANIMS.death && i >= 5) {
    dissolveRegion(ctx, x, y, w, h, (i - 4) * 0.25, 7);
    fadeRegion(ctx, x, y, w, h, 1 - (i - 4) * 0.22);
  }
}

export const PLAYER_SIZE = PLAYER_FRAME;
