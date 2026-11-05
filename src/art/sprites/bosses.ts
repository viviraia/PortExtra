/**
 * Bosses. Animations (all bosses):
 *   idle(4, loop) move(6, loop) windup(4) attack1/2/3(5 each, HIT FRAME = 2) hurt(2) death(8)
 * Warden:  attack1 = overhead ball slam, attack2 = shoulder charge, attack3 = ball sweep
 * Matriarch: attack1 = dive, attack2 = feather volley (wings thrust), attack3 = screech
 * Archivist: attack1 = book barrage, attack2 = summoning circle (arms up), attack3 = teleport (fades out)
 * Hollow King: attack1 = overhead greatsword slam, attack2 = horizontal sweep, attack3 = sword raised (dark orbs)
 */
import { dissolveRegion, fadeRegion, grainRegion, Px, rimRegion, shade, tintRegion } from '../canvas';
import { BOSS_ANIM_SUFFIXES, bossAnim, type BossAnim } from '../keys';
import type { AnimSpec } from '../sheet';
import { drawHumanoid, holdBlade, walkPose, type HumSpec, type Pose, type RigOut } from './rig';

export interface BossArt {
  fw: number;
  fh: number;
  draw: (p: Px, a: BossAnim, i: number, n: number) => void;
}

export const BOSS_ANIM_FRAMES: Record<BossAnim, { frames: number; rate: number; repeat: number }> = {
  idle: { frames: 4, rate: 6, repeat: -1 },
  move: { frames: 6, rate: 8, repeat: -1 },
  windup: { frames: 4, rate: 8, repeat: 0 },
  attack1: { frames: 5, rate: 12, repeat: 0 },
  attack2: { frames: 5, rate: 12, repeat: 0 },
  attack3: { frames: 5, rate: 12, repeat: 0 },
  hurt: { frames: 2, rate: 12, repeat: 0 },
  death: { frames: 8, rate: 8, repeat: 0 },
};
export const BOSS_ATTACK_HIT_FRAME = 2;

export function bossAnimSpecs(id: string): AnimSpec[] {
  return BOSS_ANIM_SUFFIXES.map((a) => ({ key: bossAnim(id, a), ...BOSS_ANIM_FRAMES[a] }));
}

export function bossPre(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  grainRegion(ctx, x, y, w, h, 0.12, 5);
  rimRegion(ctx, x, y, w, h, 1, -1, 0xfff0d0, 0.28);
}

export function bossPost(id: string) {
  return (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, a: BossAnim, i: number) => {
    if (a === 'windup') tintRegion(ctx, x, y, w, h, i === 3 ? 0xffffff : 0xff4020, i === 3 ? 0.45 : 0.08 + i * 0.08);
    if (a === 'hurt' && i === 0) tintRegion(ctx, x, y, w, h, 0xffffff, 0.7);
    if (a === 'death') {
      if (i % 2 === 0 && i < 4) tintRegion(ctx, x, y, w, h, 0xffffff, 0.4);
      if (i >= 3) {
        dissolveRegion(ctx, x, y, w, h, (i - 2) * 0.15, 23 + i);
        fadeRegion(ctx, x, y, w, h, 1 - (i - 2) * 0.15);
      }
    }
    if (id === 'archivist' && a === 'attack3') {
      if (i >= 1 && i <= 3) {
        dissolveRegion(ctx, x, y, w, h, [0, 0.45, 0.85, 0.45][i], 99);
        tintRegion(ctx, x, y, w, h, 0xa45cff, 0.5);
      }
    }
  };
}

type PoseTable = Partial<Record<BossAnim, Pose[]>>;

function humanBoss(fw: number, fh: number, s: HumSpec, poses: PoseTable, extra?: (p: Px, a: BossAnim, i: number, out: RigOut, n: number) => void, hold?: (a: BossAnim, i: number) => ((p: Px, hand: { x: number; y: number }, ang: number, out: RigOut) => void) | undefined): BossArt {
  return {
    fw,
    fh,
    draw(p, a, i, n) {
      let pose: Pose;
      if (a === 'move') {
        const w = walkPose(i / n, 6, 4, 20);
        const base = poses.idle?.[0] ?? {};
        pose = { ...base, ...w, armF: (base.armF ?? 80) + (w.armF! - 90), armB: (base.armB ?? 100) + (w.armB! - 90), lean: 2, cape: 3 + (i % 2) * 2, sway: (i % 3) - 1 };
      } else if (a === 'hurt') {
        pose = { ...(poses.idle?.[0] ?? {}), lean: -4, bob: 2, armF: 150, armB: 200, cape: 4 };
      } else if (a === 'death') {
        pose = i < 2 ? { lean: -4, bob: 2, armF: 160, armB: 200, cape: 4 } : { kneel: true, lean: 5, bob: 4, armF: 100, armB: 110, cape: 2 };
      } else {
        const list = poses[a] ?? poses.idle ?? [{}];
        pose = list[Math.min(i, list.length - 1)];
      }
      const out = drawHumanoid(p, s, pose, hold?.(a, i));
      extra?.(p, a, i, out, n);
    },
  };
}

// ---------------------------------------------------------------------------
// The Warden — hulking jailer with a chained iron ball
// ---------------------------------------------------------------------------

function ironBall(p: Px, x: number, y: number, r: number) {
  p.circle(x, y, r, 0x2e2a2c);
  p.circle(x - 1, y - 1, r - 2, 0x4a4446);
  p.p(x - Math.floor(r / 2), y - Math.floor(r / 2), 0x8a8486);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    p.line(x + Math.cos(a) * r, y + Math.sin(a) * r, x + Math.cos(a) * (r + 3), y + Math.sin(a) * (r + 3), 0x5a5456, 2);
  }
}

function chain(p: Px, x0: number, y0: number, x1: number, y1: number, sag = 4) {
  const steps = 10;
  for (let k = 0; k <= steps; k++) {
    const t = k / steps;
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * sag;
    p.rect(x - 1, y - 1, 2, 2, k % 2 ? 0x6a6466 : 0x8a8486);
  }
}

const warden = humanBoss(
  88,
  80,
  {
    cx: 40, ground: 79, legLen: 16, torsoLen: 22, torsoW: 22, headW: 14, headH: 14, armLen: 16, limb: 5,
    head: 'helm', body: 'armor', hunch: 3,
    colors: { skin: 0x8a7060, body: 0x5c4c40, trim: 0x8a6a3a, legs: 0x3a3028, boots: 0x262018, eye: 0xff8020, head: 0x6a5a4e },
  },
  {
    idle: [0, 0, 1, 1].map((b) => ({ bob: b, armF: 60, armB: 100, footF: [3, 0], footB: [-4, 0] }) as Pose),
    windup: [
      { armF: -40, armB: 120, lean: -2, bob: 1, footF: [4, 0], footB: [-5, 0] },
      { armF: -90, armB: 140, lean: -4, bob: 2, footF: [4, 0], footB: [-5, 0] },
      { armF: -120, armB: 150, lean: -5, bob: 2, footF: [4, 0], footB: [-5, 0] },
      { armF: -130, armB: 150, lean: -5, bob: 2, footF: [4, 0], footB: [-5, 0], glow: 1 },
    ],
    attack1: [
      { armF: -100, armB: 130, lean: -2, footF: [5, 0], footB: [-5, 0] },
      { armF: -30, armB: 100, lean: 3, footF: [6, 0], footB: [-5, 0] },
      { armF: 40, armB: 80, lean: 6, bob: 3, footF: [7, 0], footB: [-6, 0] },
      { armF: 50, armB: 80, lean: 5, bob: 3, footF: [7, 0], footB: [-6, 0] },
      { armF: 60, armB: 90, lean: 2, bob: 1 },
    ],
    attack2: [
      { armF: 120, armB: 140, lean: 4, bob: 2, footF: [6, 0], footB: [-7, 2] },
      { armF: 130, armB: 150, lean: 6, bob: 2, footF: [8, 2], footB: [-8, 0] },
      { armF: 130, armB: 150, lean: 7, bob: 3, footF: [9, 0], footB: [-8, 3] },
      { armF: 120, armB: 140, lean: 5, bob: 2, footF: [7, 1], footB: [-7, 0] },
      { armF: 90, armB: 120, lean: 2, bob: 1 },
    ],
    attack3: [
      { armF: 170, armB: 150, lean: -3, footF: [4, 0], footB: [-5, 0] },
      { armF: 90, armB: 120, lean: 0, footF: [5, 0], footB: [-5, 0] },
      { armF: 0, armB: 100, lean: 4, footF: [6, 0], footB: [-5, 0] },
      { armF: -20, armB: 100, lean: 3, footF: [6, 0], footB: [-5, 0] },
      { armF: 40, armB: 100, lean: 1 },
    ],
  },
  (p, a, i, out) => {
    const h = out.handF;
    let bx = h.x + 12, by = 72, sag = 6;
    if (a === 'idle' || a === 'hurt' || a === 'death') { bx = h.x + 10; by = 72; }
    if (a === 'move') { bx = h.x - 22 - (i % 2); by = 72; sag = 3; }
    if (a === 'windup') { bx = h.x - 10 - i * 4; by = h.y - 10 - i * 3; sag = 2; }
    if (a === 'attack1') { const pos = [[-16, -14], [10, -16], [16, 6], [14, 0], [12, 0]][i]; bx = h.x + pos[0]; by = i >= 2 ? 72 : h.y + pos[1]; sag = 1; }
    if (a === 'attack2') { bx = h.x - 24; by = 72; sag = 2; }
    if (a === 'attack3') { const pos = [[-24, 0], [-6, 18], [22, 4], [24, -6], [14, 10]][i]; bx = h.x + pos[0]; by = Math.min(72, h.y + pos[1]); sag = 1; }
    bx = Math.max(8, Math.min(80, bx));
    chain(p, h.x, h.y, bx, by, sag);
    ironBall(p, bx, by, 6);
    // pauldrons, rivets and a grilled bucket helm
    const sx = out.shoulder.x, sy = out.shoulder.y;
    p.ellipse(sx + 9, sy + 1, 6, 4, 0x6e5e50);
    p.ellipse(sx + 9, sy, 5, 2, 0x8a7a6a);
    p.ellipse(sx - 9, sy + 1, 5, 4, 0x4a3e34);
    for (let k = -8; k <= 8; k += 4) p.p(sx + k, sy + 8, 0xa09080);
    p.rect(sx - 10, sy + 12, 20, 2, 0x3a2e26);
    const hx = out.head.x, hy = out.head.y;
    for (let k = 0; k < 3; k++) p.rect(hx + 1 + k * 2, hy - 1, 1, 5, 0x1a1410);
    p.rect(hx - 7, hy - 7, 14, 1, 0x8a7a6a);
    p.p(hx - 5, hy + 4, 0xa09080); p.p(hx + 5, hy + 4, 0xa09080);
    // keys on the belt & shackle collar
    p.rect(out.hip.x - 6, out.hip.y - 2, 3, 5, 0xc0a040);
    p.rect(out.hip.x - 3, out.hip.y, 2, 4, 0xa08030);
    p.rect(out.shoulder.x - 8, out.shoulder.y - 1, 16, 3, 0x4a4446);
    if (a === 'attack1' && i === 2) {
      // impact dust
      for (let k = 0; k < 8; k++) p.p(bx - 10 + k * 3, 77 - (k % 3), 0xa09080, 0.8);
    }
  },
);

// ---------------------------------------------------------------------------
// The Hollow King — empty crowned armor with a greatsword
// ---------------------------------------------------------------------------

const hollowKing = humanBoss(
  96,
  88,
  {
    cx: 44, ground: 87, legLen: 18, torsoLen: 24, torsoW: 20, headW: 13, headH: 13, armLen: 17, limb: 5,
    head: 'crown', body: 'armor', cape: true,
    colors: { skin: 0x3a3240, body: 0x2c2632, trim: 0xd8a83a, legs: 0x1e1a22, boots: 0x141016, eye: 0xff6a3a, head: 0x3a3240, cape: 0x7a1226 },
  },
  {
    idle: [0, 0, 1, 1].map((b, k) => ({ bob: b, armF: 70, armB: 100, footF: [4, 0], footB: [-4, 0], cape: k % 2 }) as Pose),
    windup: [
      { armF: -40, armB: -20, lean: -2, footF: [5, 0], footB: [-5, 0], cape: 2 },
      { armF: -90, armB: -70, lean: -3, footF: [5, 0], footB: [-5, 0], cape: 3 },
      { armF: -120, armB: -100, lean: -4, footF: [5, 0], footB: [-5, 0], cape: 3 },
      { armF: -130, armB: -110, lean: -4, footF: [5, 0], footB: [-5, 0], cape: 4, glow: 1 },
    ],
    attack1: [
      { armF: -110, armB: -90, lean: -2, footF: [6, 0], footB: [-6, 0], cape: 3 },
      { armF: -40, armB: -30, lean: 3, footF: [8, 0], footB: [-6, 0], cape: 5 },
      { armF: 40, armB: 50, lean: 7, bob: 3, footF: [9, 0], footB: [-6, 0], cape: 6 },
      { armF: 55, armB: 65, lean: 6, bob: 3, footF: [9, 0], footB: [-6, 0], cape: 5 },
      { armF: 60, armB: 80, lean: 3, bob: 1, cape: 3 },
    ],
    attack2: [
      { armF: 170, armB: 160, lean: -3, footF: [5, 0], footB: [-6, 0], cape: 2 },
      { armF: 100, armB: 130, lean: 0, footF: [7, 0], footB: [-6, 0], cape: 4 },
      { armF: 0, armB: 90, lean: 5, footF: [9, 0], footB: [-6, 0], cape: 6, bob: 1 },
      { armF: -30, armB: 80, lean: 4, footF: [8, 0], footB: [-6, 0], cape: 5 },
      { armF: 30, armB: 90, lean: 1, cape: 3 },
    ],
    attack3: [
      { armF: -60, armB: 110, lean: -1, cape: 3 },
      { armF: -90, armB: 120, lean: -2, cape: 5, glow: 1 },
      { armF: -95, armB: 130, lean: -2, cape: 6, glow: 1 },
      { armF: -95, armB: 130, lean: -2, cape: 6, glow: 1 },
      { armF: -40, armB: 110, lean: 0, cape: 3 },
    ],
  },
  (p, a, i, out) => {
    // cracked chest revealing the hollow ember within
    p.rect(out.shoulder.x - 2, out.shoulder.y + 6, 4, 6, 0x08040a);
    p.p(out.shoulder.x - 1, out.shoulder.y + 8, 0xff6a3a);
    p.p(out.shoulder.x, out.shoulder.y + 9, 0xffa060, 0.8);
    p.rect(out.hip.x - 9, out.hip.y - 2, 18, 2, 0xd8a83a);
    if (a === 'attack3' && i >= 1 && i <= 3) {
      for (let k = 0; k < 5; k++) {
        const ang = (k / 5) * Math.PI * 2 + i * 0.6;
        const x = out.handF.x + Math.cos(ang) * 18, y = out.handF.y - 22 + Math.sin(ang) * 10;
        p.circle(x, y, 3, 0x1a0820);
        p.ring(x, y, 3, 0xd84060, 1, 0.9);
      }
    }
  },
  () => (p, hand, ang, _out) => holdBlade(36, 0x9aa0b4, 0xd8a83a, 3)(p, hand, ang, _out),
);

// ---------------------------------------------------------------------------
// The Archivist — floating scholar wreathed in orbiting tomes
// ---------------------------------------------------------------------------

function tome(p: Px, x: number, y: number, c: number, open: boolean) {
  if (open) {
    p.rect(x - 4, y - 1, 4, 3, 0xe8dcc0);
    p.rect(x, y - 1, 4, 3, 0xd8ccb0);
    p.rect(x - 4, y + 2, 8, 1, c);
    p.p(x, y, 0x6a5a4a);
  } else {
    p.rect(x - 3, y - 2, 6, 5, c);
    p.rect(x - 2, y - 2, 5, 4, shade(c, 0.2));
    p.rect(x + 2, y - 1, 1, 3, 0xe8dcc0);
    p.p(x - 1, y, 0xc4a060);
  }
}

const archivistSpec: HumSpec = {
  cx: 32, ground: 70, legLen: 10, torsoLen: 24, torsoW: 15, headW: 12, headH: 12, armLen: 14, limb: 4,
  head: 'cowl', body: 'robe',
  colors: { skin: 0xb8a0c8, body: 0x3a2050, trim: 0xc4a060, legs: 0x1a1020, boots: 0x1a1020, eye: 0xe0a0ff, head: 0x4a2a64 },
};

const archivist: BossArt = {
  fw: 72,
  fh: 84,
  draw(p, a, i, n) {
    const fl = [0, -1, -2, -1, 0, 1][i % 6];
    let pose: Pose = { bob: fl, armF: 70, armB: 110, sway: (i % 3) - 1 };
    if (a === 'windup') pose = { bob: fl, armF: -40 - i * 15, armB: -140 + i * 10, glow: i / 3 };
    if (a === 'attack1') pose = { bob: fl, armF: [-30, -10, 0, 10, 40][i], armB: [140, 120, 100, 100, 110][i], lean: [0, 2, 3, 2, 1][i] };
    if (a === 'attack2') pose = { bob: fl, armF: [-60, -90, -100, -100, -60][i], armB: [-120, -95, -85, -85, -120][i], glow: 1 };
    if (a === 'attack3') pose = { bob: fl, armF: 40, armB: 140, glow: 1 };
    if (a === 'hurt') pose = { bob: 2, lean: -3, armF: 150, armB: 200 };
    if (a === 'death') pose = i < 2 ? { bob: 2, lean: -3, armF: 160, armB: 200 } : { bob: 4 + i, lean: 3, armF: 100, armB: 110 };
    // wispy tail below the robe (floating)
    const g = archivistSpec.ground + (pose.bob ?? 0);
    const sx = archivistSpec.cx;
    p.poly([[sx - 9, g], [sx + 9, g], [sx + 3, g + 6], [sx - 1 + ((i % 3) - 1), g + 10], [sx - 4, g + 5]], 0x2a1640);
    // magic circle for attack2
    if (a === 'attack2' && i >= 1) {
      const r = 14 + i * 3;
      p.ellipse(sx, 81, r, 2, 0xa45cff, 0.35);
      p.ring(sx, 81, 1, 0xa45cff);
      for (let k = 0; k < 6; k++) p.p(sx - r + k * ((r * 2) / 5), 81, 0xe0c0ff);
    }
    const out = drawHumanoid(p, { ...archivistSpec, ground: g }, pose, (pp, hand) => {
      if (a !== 'attack1' || i < 2) tome(pp, hand.x + 3, hand.y - 2, 0x6a2a3a, a === 'attack1' || a === 'windup');
    });
    // tall hat
    const hx = out.head.x, hy = out.head.y - 6;
    p.poly([[hx - 7, hy + 1], [hx + 7, hy + 1], [hx + 1, hy - 14], [hx - 3, hy - 16]], 0x3a2050);
    p.rect(hx - 8, hy, 16, 2, 0x2a1640);
    p.rect(hx - 6, hy - 2, 12, 1, 0xc4a060);
    p.p(hx - 2, hy - 15, 0xe0a0ff);
    // orbiting tomes
    const orbit = a === 'attack1' ? 3 : 5;
    for (let k = 0; k < orbit; k++) {
      const ang = (k / orbit) * Math.PI * 2 + (i / n) * Math.PI * 2 * (a === 'idle' || a === 'move' ? 0.5 : 1);
      const rx = a === 'attack2' ? 28 : 24, ry = 8;
      const tx = sx + Math.cos(ang) * rx, ty = 40 + Math.sin(ang) * ry + (pose.bob ?? 0);
      tome(p, tx, ty, [0x6a2a3a, 0x2a4a6a, 0x3a5a2a, 0x6a5a2a, 0x4a2a6a][k], false);
    }
    if (a === 'attack1' && i >= 2) {
      // launched pages
      for (let k = 0; k < 3; k++) p.rect(out.handF.x + 8 + k * 6 + i * 2, out.handF.y - 4 + k * 3 - 3, 3, 2, 0xe8dcc0);
    }
  },
};

// ---------------------------------------------------------------------------
// Gargoyle Matriarch — winged stone horror
// ---------------------------------------------------------------------------

const matriarch: BossArt = {
  fw: 96,
  fh: 80,
  draw(p, a, i) {
    const stone = 0x7a8296, dark = 0x4a5064, deep = 0x30343e, light = 0xa8b0c4, eye = 0xff4a20, moss = 0x5a7a4a;
    let flap = [0, 2, 4, 2][i % 4];
    let tilt = 0, mouth = 0, hov = [0, -1, -2, -1][i % 4];
    let cx = 48, cy = 42;
    if (a === 'move') { flap = [0, 2, 4, 3, 2, 1][i]; hov = [0, -2, -3, -2, 0, 1][i]; }
    if (a === 'windup') { flap = 5; hov = -2 - i; mouth = i >= 2 ? 1 : 0; }
    if (a === 'attack1') { flap = [-2, -3, -3, -2, 0][i]; tilt = [2, 5, 7, 5, 2][i]; cy += [0, 6, 12, 10, 4][i]; cx += [0, 4, 8, 6, 2][i]; }
    if (a === 'attack2') { flap = [5, 2, -3, -2, 1][i]; hov = -1; }
    if (a === 'attack3') { mouth = [1, 3, 4, 4, 2][i]; flap = [3, 5, 5, 5, 3][i]; tilt = -2; }
    if (a === 'hurt') { tilt = -3; flap = 1; }
    if (a === 'death') { flap = Math.max(-3, 2 - i); cy += Math.min(i * 3, 18); tilt = Math.min(i, 5); }
    cy += hov;
    const wy = cy - 10 - flap * 3;
    // back wing
    p.poly([[cx - 4, cy - 10], [cx - 26, wy - 14], [cx - 44, wy - 4], [cx - 38, wy + 4], [cx - 30, wy + 2], [cx - 24, wy + 10], [cx - 16, wy + 8], [cx - 8, cy]], deep);
    for (let k = 0; k < 3; k++) p.line(cx - 6, cy - 8, cx - 30 - k * 6, wy - 8 + k * 6, dark, 1);
    // tail
    p.line(cx - 10, cy + 12, cx - 22, cy + 20, dark, 3);
    p.line(cx - 22, cy + 20, cx - 30, cy + 16 + (i % 2), dark, 2);
    p.poly([[cx - 32, cy + 13], [cx - 28, cy + 16], [cx - 34, cy + 19]], light);
    // body
    p.ellipse(cx + tilt, cy + 4, 13, 14, stone);
    p.ellipse(cx - 3 + tilt, cy + 6, 9, 11, dark);
    p.ellipse(cx + 2 + tilt, cy, 9, 9, stone);
    p.p(cx + 6 + tilt, cy - 4, light);
    p.p(cx + 7 + tilt, cy - 2, light);
    // moss patches
    p.rect(cx - 4, cy + 10, 4, 2, moss);
    p.rect(cx + 3, cy + 14, 3, 1, moss);
    // legs & talons
    const ly = cy + 16;
    p.line(cx - 4 + tilt, ly - 2, cx - 6 + tilt, ly + 8, dark, 3);
    p.line(cx + 6 + tilt, ly - 2, cx + 8 + tilt + (a === 'attack1' ? 4 : 0), ly + 8, dark, 3);
    for (const fx of [cx - 6 + tilt, cx + 8 + tilt + (a === 'attack1' ? 4 : 0)]) {
      p.line(fx, ly + 8, fx + 3, ly + 10, light);
      p.line(fx, ly + 8, fx - 2, ly + 10, light);
    }
    // arms
    p.line(cx + 8 + tilt, cy + 2, cx + 16 + tilt, cy + 10 - (a === 'attack2' ? 6 : 0), stone, 3);
    // head
    const hx = cx + 12 + tilt, hy = cy - 12 + (a === 'attack3' ? -3 : 0);
    p.rect(hx - 6, hy - 5, 12, 10, stone);
    p.rect(hx - 6, hy - 5, 12, 2, light);
    p.rect(hx - 6, hy - 3, 2, 8, dark);
    // horns
    p.line(hx - 4, hy - 5, hx - 10, hy - 14, light, 2);
    p.line(hx + 2, hy - 5, hx + 4, hy - 13, light, 2);
    // eyes
    p.rect(hx + 1, hy - 1, 2, 2, eye);
    p.rect(hx + 4, hy - 1, 2, 2, eye);
    p.p(hx + 1, hy - 2, eye, 0.5);
    // jaw
    p.rect(hx - 2, hy + 4, 9, 2 + mouth, dark);
    if (mouth) {
      p.rect(hx, hy + 4, 7, mouth, 0x200810);
      p.p(hx + 1, hy + 4, 0xffffff);
      p.p(hx + 4, hy + 4, 0xffffff);
      p.p(hx + 2, hy + 4 + mouth, 0xffffff);
    }
    // front wing
    const fwy = cy - 12 - flap * 3;
    p.poly([[cx + 2, cy - 8], [cx + 14, fwy - 16], [cx + 34, fwy - 10], [cx + 40, fwy - 2], [cx + 30, fwy + 2], [cx + 26, fwy + 8], [cx + 18, fwy + 6], [cx + 8, cy - 2]], stone);
    for (let k = 0; k < 3; k++) p.line(cx + 6, cy - 6, cx + 26 + k * 5, fwy - 8 + k * 5, dark, 1);
    p.line(cx + 2, cy - 8, cx + 34, fwy - 10, light, 1);
    // feather volley visual
    if (a === 'attack2' && i >= 2 && i <= 3) {
      for (let k = 0; k < 4; k++) p.line(cx + 40 + k * 4, fwy - 6 + k * 4, cx + 46 + k * 4, fwy - 5 + k * 4, light, 1);
    }
    if (a === 'attack3' && i >= 1 && i <= 3) {
      // screech rings
      p.ring(hx + 10, hy + 3, 5 + i * 3, 0xe0e8ff, 1, 0.6);
    }
  },
};

export const BOSS_ART: Record<string, BossArt> = {
  warden,
  gargoyle_matriarch: matriarch,
  archivist,
  hollow_king: hollowKing,
};

/** Frame size of each boss spritesheet (faces right, feet at the bottom row; matriarch & archivist hover). */
export const BOSS_FRAMES: Record<string, { w: number; h: number }> = Object.fromEntries(
  Object.entries(BOSS_ART).map(([id, a]) => [id, { w: a.fw, h: a.fh }]),
);
