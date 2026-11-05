/**
 * All regular enemies. Each has the six standard animations:
 *   idle(4, loop) move(6, loop) windup(3) attack(4, HIT FRAME = 1) hurt(2) death(6)
 * Windup frames progressively flash (the last windup frame is a bright telegraph).
 */
import { dissolveRegion, fadeRegion, Px, rimRegion, shade, tintRegion, type Color } from '../canvas';
import { ENEMY_ANIM_SUFFIXES, enemyAnim, type EnemyAnim } from '../keys';
import type { AnimSpec } from '../sheet';
import { drawHumanoid, holdBlade, holdPole, walkPose, type HoldFn, type HumSpec, type Pose, type RigOut } from './rig';

export interface EnemyArt {
  fw: number;
  fh: number;
  draw: (p: Px, anim: EnemyAnim, i: number, n: number) => void;
  /** Translucent creatures (ghost) get a global fade. */
  alpha?: number;
}

export const ENEMY_ANIM_FRAMES: Record<EnemyAnim, { frames: number; rate: number; repeat: number }> = {
  idle: { frames: 4, rate: 6, repeat: -1 },
  move: { frames: 6, rate: 10, repeat: -1 },
  windup: { frames: 3, rate: 8, repeat: 0 },
  attack: { frames: 4, rate: 14, repeat: 0 },
  hurt: { frames: 2, rate: 12, repeat: 0 },
  death: { frames: 6, rate: 12, repeat: 0 },
};
/** Index of the attack animation frame where the blow lands. */
export const ENEMY_ATTACK_HIT_FRAME = 1;

export function enemyAnimSpecs(id: string): AnimSpec[] {
  return ENEMY_ANIM_SUFFIXES.map((a) => ({ key: enemyAnim(id, a), ...ENEMY_ANIM_FRAMES[a] }));
}

export function enemyPre(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  rimRegion(ctx, x, y, w, h, 1, -1, 0xfff0d0, 0.22);
}

export function enemyPost(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, a: EnemyAnim, i: number, alpha = 1): void {
  if (a === 'windup') tintRegion(ctx, x, y, w, h, i === 2 ? 0xffffff : 0xff5030, i === 2 ? 0.55 : 0.15 + i * 0.12);
  if (a === 'hurt' && i === 0) tintRegion(ctx, x, y, w, h, 0xffffff, 0.75);
  if (a === 'death' && i >= 2) {
    dissolveRegion(ctx, x, y, w, h, (i - 1) * 0.18, 11 + i);
    fadeRegion(ctx, x, y, w, h, 1 - (i - 1) * 0.17);
  }
  if (alpha < 1) fadeRegion(ctx, x, y, w, h, alpha);
}

// ---------------------------------------------------------------------------
// Humanoid factory
// ---------------------------------------------------------------------------

interface HumCfg {
  stride?: number;
  armSwing?: number;
  idle?: (i: number) => Pose;
  windup: Pose[];
  attack: Pose[];
  hold?: (a: EnemyAnim, i: number) => HoldFn | undefined;
  holdB?: (a: EnemyAnim, i: number) => HoldFn | undefined;
  extra?: (p: Px, a: EnemyAnim, i: number, out: RigOut) => void;
  baseArmF?: number;
  baseArmB?: number;
}

function humanoid(fw: number, fh: number, s: HumSpec, cfg: HumCfg): EnemyArt {
  return {
    fw,
    fh,
    draw(p, a, i, n) {
      let pose: Pose;
      switch (a) {
        case 'idle':
          pose = cfg.idle?.(i) ?? { bob: i >= 2 ? 1 : 0, armF: cfg.baseArmF ?? 80, armB: cfg.baseArmB ?? 100 };
          break;
        case 'move': {
          const w = walkPose(i / n, cfg.stride ?? 3, 2, cfg.armSwing ?? 25);
          pose = { ...w, armF: (cfg.baseArmF ?? 80) + (w.armF! - 90), armB: (cfg.baseArmB ?? 100) + (w.armB! - 90), lean: 1, sway: i % 2 };
          break;
        }
        case 'windup':
          pose = cfg.windup[Math.min(i, cfg.windup.length - 1)];
          break;
        case 'attack':
          pose = cfg.attack[Math.min(i, cfg.attack.length - 1)];
          break;
        case 'hurt':
          pose = { lean: -2, armF: 150, armB: 200, bob: 1, footF: [2, 0], footB: [-1, 1] };
          break;
        case 'death':
          pose = i === 0 ? { lean: -2, armF: 160, armB: 200, bob: 1 } : { kneel: true, lean: 2 + Math.min(i, 3), armF: 110, armB: 120, bob: Math.min(i, 3) };
          break;
      }
      const hf = cfg.hold?.(a, i);
      const hb = cfg.holdB?.(a, i);
      const out = drawHumanoid(p, s, pose, hf, hb);
      cfg.extra?.(p, a, i, out);
    },
  };
}

const H = (f: (p: Px, hand: { x: number; y: number }, ang: number) => void): HoldFn => (p, hand, ang, _out) => f(p, hand, ang);

// ---------------------------------------------------------------------------
// Individual enemies
// ---------------------------------------------------------------------------

const zombie = humanoid(
  24,
  32,
  {
    cx: 11, ground: 31, legLen: 6, torsoLen: 8, torsoW: 7, headW: 6, headH: 6, armLen: 6, limb: 2,
    head: 'zombie', body: 'rags', hunch: 2,
    colors: { skin: 0x7f9868, body: 0x4a4436, trim: 0x2a2a20, legs: 0x3a3428, boots: 0x262018, eye: 0xd8ff60, head: 0x7f9868 },
  },
  {
    stride: 2,
    armSwing: 10,
    baseArmF: 15,
    baseArmB: 25,
    idle: (i) => ({ bob: i >= 2 ? 1 : 0, armF: 15 + (i % 2) * 5, armB: 25, lean: 1 }),
    windup: [
      { armF: -40, armB: -30, lean: -1, footF: [2, 0], footB: [-2, 0] },
      { armF: -70, armB: -60, lean: -2, footF: [2, 0], footB: [-2, 0] },
      { armF: -80, armB: -70, lean: -2, footF: [2, 0], footB: [-2, 0], glow: 1 },
    ],
    attack: [
      { armF: 0, armB: 10, lean: 2, footF: [3, 0], footB: [-3, 0] },
      { armF: 40, armB: 50, lean: 3, footF: [4, 0], footB: [-3, 0], bob: 1 },
      { armF: 60, armB: 70, lean: 2, footF: [3, 0], footB: [-2, 0], bob: 1 },
      { armF: 30, armB: 40, lean: 1 },
    ],
  },
);

const skeletonArcher = humanoid(
  24,
  32,
  {
    cx: 12, ground: 31, legLen: 7, torsoLen: 8, torsoW: 6, headW: 6, headH: 6, armLen: 6, limb: 1,
    head: 'skull', body: 'rags',
    colors: { skin: 0xd8cfb0, body: 0x40303a, trim: 0x6a2a2a, legs: 0xcfc6a8, boots: 0xa89e80, eye: 0xff4a3a, head: 0xddd4b6 },
  },
  {
    baseArmF: 70,
    windup: [
      { armF: -5, armB: 0, lean: -1, footF: [3, 0], footB: [-3, 0] },
      { armF: -8, armB: 170, lean: -1, footF: [3, 0], footB: [-3, 0] },
      { armF: -10, armB: 175, lean: -2, footF: [3, 0], footB: [-3, 0], glow: 1 },
    ],
    attack: [
      { armF: -10, armB: 120, lean: 0, footF: [3, 0], footB: [-3, 0] },
      { armF: -8, armB: 100, lean: 1, footF: [3, 0], footB: [-3, 0] },
      { armF: 10, armB: 100, lean: 0, footF: [3, 0], footB: [-3, 0] },
      { armF: 40, armB: 100, lean: 0 },
    ],
    hold: (a, i) => {
      const drawn = a === 'windup' && i >= 1;
      return H((p, hand) => {
        const wood = 0x8a6a3a;
        p.line(hand.x, hand.y - 7, hand.x + 3, hand.y - 3, wood);
        p.line(hand.x + 3, hand.y - 3, hand.x + 3, hand.y + 3, wood);
        p.line(hand.x + 3, hand.y + 3, hand.x, hand.y + 7, wood);
        const sx = drawn ? hand.x - 4 : hand.x;
        p.line(hand.x, hand.y - 7, sx, hand.y, 0xe0e0d0);
        p.line(sx, hand.y, hand.x, hand.y + 7, 0xe0e0d0);
        if (drawn) p.line(sx, hand.y, hand.x + 5, hand.y, 0xc8b890);
      });
    },
    extra: (p, _a, _i, out) => {
      // ribs
      const x = out.shoulder.x - 2, y = out.shoulder.y + 2;
      for (let k = 0; k < 3; k++) p.rect(x, y + k * 2, 4, 1, 0xcfc6a8);
    },
  },
);

const shieldKnight = humanoid(
  28,
  32,
  {
    cx: 12, ground: 31, legLen: 7, torsoLen: 8, torsoW: 8, headW: 7, headH: 7, armLen: 6, limb: 2,
    head: 'helm', body: 'armor',
    colors: { skin: 0x8a90a0, body: 0x66708a, trim: 0xa08040, legs: 0x4a5064, boots: 0x30343e, eye: 0xffd060, head: 0x7a849c },
  },
  {
    stride: 2,
    baseArmF: 20,
    baseArmB: 110,
    windup: [
      { armF: 40, armB: 150, lean: -1, footF: [2, 0], footB: [-3, 0], bob: 1 },
      { armF: 60, armB: 190, lean: -2, footF: [2, 0], footB: [-3, 0], bob: 1 },
      { armF: 70, armB: 200, lean: -2, footF: [2, 0], footB: [-3, 0], bob: 1, glow: 1 },
    ],
    attack: [
      { armF: 0, armB: 60, lean: 2, footF: [4, 0], footB: [-3, 0] },
      { armF: -10, armB: 10, lean: 3, footF: [5, 0], footB: [-3, 0] },
      { armF: 0, armB: 40, lean: 2, footF: [4, 0], footB: [-3, 0] },
      { armF: 10, armB: 80, lean: 1 },
    ],
    holdB: () => H((p, hand, ang) => holdBlade(8, 0xc0c8d8, 0x6a4a2a)(p, hand, ang, null as any)),
    hold: () => H((p, hand) => {
      const x = hand.x - 1, y = hand.y - 9;
      p.rect(x, y, 5, 16, 0x5a6278);
      p.rect(x + 1, y + 1, 3, 14, 0x7a849c);
      p.rect(x + 2, y + 3, 1, 10, 0xa08040);
      p.rect(x + 1, y + 7, 3, 1, 0xa08040);
      p.rect(x + 4, y, 1, 16, 0x40465a);
    }),
  },
);

const bomber = humanoid(
  24,
  30,
  {
    cx: 12, ground: 29, legLen: 5, torsoLen: 8, torsoW: 8, headW: 6, headH: 6, armLen: 6, limb: 2,
    head: 'bald', body: 'robe',
    colors: { skin: 0xc89870, body: 0x8a4a22, trim: 0xd8a040, legs: 0x3a2a1a, boots: 0x2a1a10, eye: 0xffffff, head: 0xc89870 },
  },
  {
    baseArmF: 70,
    windup: [
      { armF: -60, armB: 120, lean: -1 },
      { armF: -110, armB: 140, lean: -2 },
      { armF: -130, armB: 150, lean: -2, glow: 1 },
    ],
    attack: [
      { armF: -40, armB: 120, lean: 1 },
      { armF: 10, armB: 110, lean: 2, bob: 1 },
      { armF: 40, armB: 100, lean: 1 },
      { armF: 60, armB: 100 },
    ],
    hold: (a, i) =>
      a === 'attack' && i >= 1
        ? undefined
        : H((p, hand) => {
            p.circle(hand.x + 1, hand.y - 2, 3, 0x202024);
            p.p(hand.x, hand.y - 4, 0x5a5a66);
            p.line(hand.x + 2, hand.y - 5, hand.x + 3, hand.y - 7, 0xa08060);
            const lit = a === 'windup' || i % 2 === 0;
            if (lit) {
              p.p(hand.x + 3, hand.y - 8, 0xffe060);
              p.p(hand.x + 4, hand.y - 9, 0xff8030, 0.8);
            }
          }),
    extra: (p, _a, _i, out) => {
      // bandolier of powder kegs
      p.line(out.shoulder.x - 3, out.shoulder.y + 1, out.shoulder.x + 3, out.hip.y - 2, 0x5a3418);
      p.rect(out.shoulder.x - 1, out.shoulder.y + 3, 2, 2, 0x202024);
    },
  },
);

const lancer = humanoid(
  36,
  32,
  {
    cx: 14, ground: 31, legLen: 7, torsoLen: 8, torsoW: 8, headW: 7, headH: 7, armLen: 6, limb: 2,
    head: 'plume', body: 'armor', cape: true,
    colors: { skin: 0x8a90a0, body: 0x5a6276, trim: 0xb83040, legs: 0x3e4456, boots: 0x2a2e3a, eye: 0xff6040, head: 0x6e7890, cape: 0x6a1a24 },
  },
  {
    stride: 3,
    baseArmF: 10,
    windup: [
      { armF: 20, armB: 100, lean: -2, footF: [3, 0], footB: [-4, 0], bob: 1, cape: 1 },
      { armF: 25, armB: 100, lean: -3, footF: [3, 0], footB: [-5, 0], bob: 2, cape: 1 },
      { armF: 25, armB: 100, lean: -3, footF: [3, 0], footB: [-5, 0], bob: 2, cape: 1, glow: 1 },
    ],
    attack: [
      { armF: 0, armB: 80, lean: 3, footF: [5, 0], footB: [-4, 1], cape: 4 },
      { armF: -2, armB: 70, lean: 4, footF: [6, 0], footB: [-5, 2], cape: 5 },
      { armF: 0, armB: 80, lean: 3, footF: [5, 0], footB: [-4, 0], cape: 3 },
      { armF: 10, armB: 90, lean: 1, cape: 1 },
    ],
    hold: (a, i) => {
      const off = a === 'windup' ? -6 : a === 'attack' && i <= 1 ? 5 : 0;
      return H((p, hand) => {
        const y = hand.y;
        const x0 = hand.x - 8 + off, x1 = hand.x + 13 + off;
        p.rect(x0, y, x1 - x0, 1, 0x7a5a3a);
        p.rect(hand.x - 2 + off, y - 2, 3, 5, 0x9aa2b8); // guard
        p.line(x1, y - 1, x1 + 4, y, 0xd8dce8);
        p.line(x1, y + 1, x1 + 4, y, 0xd8dce8);
        p.p(x1 + 4, y, 0xffffff);
      });
    },
  },
);

const cultist = humanoid(
  24,
  32,
  {
    cx: 12, ground: 31, legLen: 6, torsoLen: 9, torsoW: 7, headW: 7, headH: 7, armLen: 6, limb: 2,
    head: 'cowl', body: 'robe',
    colors: { skin: 0x9a88a8, body: 0x2e1e3a, trim: 0xa45cff, legs: 0x1a1020, boots: 0x1a1020, eye: 0xd890ff, head: 0x3a2648 },
  },
  {
    baseArmF: 60,
    baseArmB: 110,
    idle: (i) => ({ armF: 50 + (i % 2) * 6, armB: 110, sway: i % 2, bob: i >= 2 ? 1 : 0 }),
    windup: [
      { armF: -40, armB: -140, glow: 0.5 },
      { armF: -70, armB: -110, glow: 0.8 },
      { armF: -85, armB: -95, glow: 1 },
    ],
    attack: [
      { armF: -20, armB: 120, lean: 1 },
      { armF: 0, armB: 110, lean: 2 },
      { armF: 10, armB: 100, lean: 1 },
      { armF: 40, armB: 100 },
    ],
    hold: (a, i) =>
      H((p, hand) => {
        const r = a === 'windup' ? 1 + i : a === 'attack' && i === 0 ? 3 : 1;
        p.circle(hand.x + 1, hand.y - 2, r, 0x1a0a2a);
        p.ring(hand.x + 1, hand.y - 2, r + 1, 0xa45cff, 1, 0.9);
        p.p(hand.x + 1, hand.y - 2, 0xe8c0ff);
      }),
    extra: (p, _a, i, out) => {
      // runes on the robe
      p.p(out.hip.x + 1, out.hip.y + 2 + (i % 2), 0xa45cff);
      p.p(out.hip.x - 1, out.hip.y + 4, 0xa45cff, 0.7);
    },
  },
);

const royalGuard = humanoid(
  36,
  40,
  {
    cx: 15, ground: 39, legLen: 9, torsoLen: 11, torsoW: 11, headW: 8, headH: 8, armLen: 8, limb: 3,
    head: 'helm', body: 'armor', cape: true,
    colors: { skin: 0x6a5a5a, body: 0x3a2e38, trim: 0xd8a83a, legs: 0x2a2028, boots: 0x1a1418, eye: 0xff5a3a, head: 0x4a3e48, cape: 0x7a1424 },
  },
  {
    stride: 2,
    baseArmF: 60,
    windup: [
      { armF: -60, armB: -40, lean: -1, footF: [3, 0], footB: [-3, 0], cape: 1 },
      { armF: -110, armB: -90, lean: -2, footF: [3, 0], footB: [-3, 0], cape: 2 },
      { armF: -130, armB: -110, lean: -3, footF: [3, 0], footB: [-3, 0], cape: 2, glow: 1 },
    ],
    attack: [
      { armF: -30, armB: -20, lean: 2, footF: [5, 0], footB: [-3, 0], cape: 3 },
      { armF: 40, armB: 50, lean: 4, footF: [6, 0], footB: [-3, 0], bob: 2, cape: 4 },
      { armF: 60, armB: 70, lean: 3, footF: [5, 0], footB: [-3, 0], bob: 2, cape: 3 },
      { armF: 50, armB: 60, lean: 1, bob: 1 },
    ],
    hold: () => H((p, hand, ang) => holdBlade(17, 0xb8bcc8, 0xd8a83a, 2)(p, hand, ang, null as any)),
    extra: (p, _a, _i, out) => {
      p.rect(out.shoulder.x - 2, out.shoulder.y + 3, 3, 3, 0xd8a83a);
      p.p(out.shoulder.x - 1, out.shoulder.y + 4, 0x7a1424);
    },
  },
);

const necromancer = humanoid(
  26,
  34,
  {
    cx: 12, ground: 33, legLen: 6, torsoLen: 10, torsoW: 7, headW: 6, headH: 6, armLen: 6, limb: 2,
    head: 'skull', body: 'robe', hunch: 1,
    colors: { skin: 0xcfc6a8, body: 0x1e2a22, trim: 0x50e080, legs: 0x101410, boots: 0x101410, eye: 0x50ff90, head: 0xd8cfb0 },
  },
  {
    baseArmF: 70,
    idle: (i) => ({ armF: 70, armB: 100, sway: i % 2, bob: i >= 2 ? 1 : 0 }),
    windup: [
      { armF: -60, armB: 140, glow: 0.4 },
      { armF: -90, armB: 160, glow: 0.8 },
      { armF: -100, armB: 170, glow: 1 },
    ],
    attack: [
      { armF: -30, armB: 120, lean: 1 },
      { armF: 10, armB: 110, lean: 2, bob: 1 },
      { armF: 20, armB: 100, lean: 1 },
      { armF: 60, armB: 100 },
    ],
    hold: () => H((p, hand, ang) => holdPole(18, 0x5a4a3a, 0, 'skull', -90 - ang)(p, hand, ang, null as any)),
    extra: (p, a, i, out) => {
      if (a === 'windup' || (a === 'attack' && i < 2)) {
        // green soul fire around the staff hand
        p.p(out.handF.x + 2, out.handF.y - 10 - (i % 2), 0x50ff90, 0.9);
        p.p(out.handF.x - 1, out.handF.y - 12, 0x90ffb8, 0.7);
      }
      // hooded mantle over skull
      p.rect(out.head.x - 4, out.head.y - 4, 7, 2, 0x1e2a22);
      p.rect(out.head.x - 4, out.head.y - 3, 2, 6, 0x1e2a22);
    },
  },
);

// ---------------------------------------------------------------------------
// Non-humanoids
// ---------------------------------------------------------------------------

const rat: EnemyArt = {
  fw: 20,
  fh: 14,
  draw(p, a, i, n) {
    const fur = 0x6a5a52, dark = 0x3e322e, pink = 0xc88a8a, eye = 0xff3030, sick = 0x9ad04a;
    let bx = 10, by = 9, stretch = 0, lift = 0, mouth = false;
    const cyc = a === 'move' ? i / n : 0;
    if (a === 'idle') by += i >= 2 ? 0 : 0;
    if (a === 'move') lift = Math.round(Math.abs(Math.sin(cyc * Math.PI * 2)) * 1);
    if (a === 'windup') { by += 1; stretch = -1; }
    if (a === 'attack') { stretch = i <= 1 ? 3 : 1; lift = i === 0 ? 3 : i === 1 ? 2 : 0; mouth = i <= 1; bx += i <= 1 ? 1 : 0; }
    if (a === 'hurt') { bx -= 1; }
    if (a === 'death') { by += Math.min(i, 2); }
    by -= lift;
    // tail
    const tw = a === 'idle' ? (i % 2) : (i % 3) - 1;
    p.line(bx - 6 - stretch, by + 1, bx - 9 - stretch, by - 1 + tw, pink);
    // body
    p.ellipse(bx - 1, by, 6 + stretch, 3, fur);
    p.ellipse(bx - 2, by + 1, 5 + stretch, 2, dark);
    p.ellipse(bx - 1, by - 1, 5 + stretch, 2, fur);
    // pustules
    p.p(bx - 3, by - 2, sick);
    p.p(bx + 1, by - 3, sick);
    // head
    const hx = bx + 5 + stretch;
    p.rect(hx - 1, by - 2, 4, 3, fur);
    p.rect(hx + 3, by - 1, 1, 2, pink);
    p.p(hx - 1, by - 3, pink); // ear
    p.p(hx + 1, by - 2, eye);
    if (mouth) { p.p(hx + 3, by + 1, 0xffffff); p.p(hx + 2, by + 1, 0x200808); }
    // legs
    const ph = a === 'move' ? i % 2 : 0;
    const ground = 13 - (a === 'attack' ? lift : 0);
    if (a !== 'death' || i < 2) {
      p.rect(bx - 4 + ph, by + 2, 1, ground - by - 2, dark);
      p.rect(bx + 2 - ph, by + 2, 1, ground - by - 2, dark);
    }
  },
};

const bat: EnemyArt = {
  fw: 24,
  fh: 16,
  draw(p, a, i, n) {
    const body = 0x3a2e42, wing = 0x2a2030, mem = 0x4e3a52, eye = 0xffe040;
    let flap = 0;
    if (a === 'idle' || a === 'move') flap = [0, 1, 2, 1, 0, -1][(i * (a === 'move' ? 1 : 2)) % 6] ?? 0;
    if (a === 'windup') flap = 2;
    if (a === 'attack') flap = -1;
    if (a === 'death') flap = -2;
    const cx = 12, cy = 7 + (a === 'death' ? Math.min(i * 2, 6) : a === 'attack' ? 1 : 0);
    const wy = cy - flap * 2;
    // wings
    for (const s of [-1, 1]) {
      const tip = cx + s * 11;
      p.poly([[cx + s * 2, cy - 1], [tip, wy - 2], [tip - s * 1, wy + 2], [cx + s * 7, wy + 2], [cx + s * 5, cy + 3], [cx + s * 2, cy + 2]], wing);
      p.line(cx + s * 2, cy, tip, wy - 2, mem);
      p.line(cx + s * 6, cy, cx + s * 7, wy + 2, mem);
    }
    p.ellipse(cx, cy + 1, 3, 3, body);
    p.p(cx - 2, cy - 3, body); p.p(cx + 2, cy - 3, body); // ears
    p.p(cx - 1, cy, eye); p.p(cx + 1, cy, eye);
    if (a === 'attack' || a === 'windup') { p.p(cx, cy + 2, 0xffffff); p.p(cx - 1, cy + 3, 0xffffff); }
    void n;
  },
};

const imp: EnemyArt = {
  fw: 24,
  fh: 24,
  draw(p, a, i) {
    const stone = 0x707888, dark = 0x484e5e, light = 0x9aa2b2, eye = 0xff5020;
    let flap = [0, 1, 2, 1][i % 4];
    let tilt = 0;
    if (a === 'windup') { flap = 2; }
    if (a === 'attack') { flap = -1; tilt = 2; }
    if (a === 'death') flap = -1;
    const cx = 12, cy = 12 + (a === 'death' ? Math.min(i * 2, 6) : 0) + (a === 'idle' ? (i >= 2 ? 1 : 0) : 0);
    // wings behind
    const wy = cy - 4 - flap * 2;
    p.poly([[cx - 2, cy - 3], [cx - 10, wy - 2], [cx - 9, wy + 3], [cx - 6, wy + 2], [cx - 4, cy + 1]], dark);
    p.poly([[cx + 1, cy - 3], [cx + 8, wy - 3], [cx + 8, wy + 2], [cx + 4, cy]], shade(dark, -0.2));
    // body (hunched)
    p.ellipse(cx + tilt, cy, 4, 5, stone);
    p.rect(cx - 3 + tilt, cy - 1, 2, 4, dark);
    p.p(cx + 2 + tilt, cy - 2, light);
    // head
    const hx = cx + 3 + tilt, hy = cy - 5 + (tilt ? 1 : 0);
    p.rect(hx - 2, hy - 2, 5, 4, stone);
    p.p(hx - 2, hy - 3, light); p.p(hx - 3, hy - 4, light); // horn
    p.p(hx + 1, hy - 3, light);
    p.p(hx + 1, hy - 1, eye); p.p(hx + 2, hy - 1, eye, 0.6);
    p.rect(hx + 1, hy + 1, 2, 1, 0x20181c);
    // claws / legs
    if (a === 'attack') {
      p.line(cx + 2, cy + 4, cx + 7, cy + 8, dark);
      p.line(cx, cy + 4, cx + 4, cy + 9, dark);
    } else {
      p.line(cx - 1, cy + 4, cx - 2, cy + 7, dark);
      p.line(cx + 2, cy + 4, cx + 3, cy + 7, dark);
    }
    // tail
    p.line(cx - 4, cy + 3, cx - 7, cy + 6, dark);
    p.p(cx - 8, cy + 6, light);
  },
};

const ghost: EnemyArt = {
  fw: 24,
  fh: 28,
  alpha: 0.85,
  draw(p, a, i) {
    const body = 0x9ab8d8, dark = 0x5a7898, core = 0xe0f0ff, eye = 0x203048;
    const cx = 12;
    const bob = a === 'idle' || a === 'move' ? [0, -1, -1, 0, 1, 1][i % 6] : 0;
    const cy = 11 + bob;
    let stretch = 0;
    if (a === 'windup') stretch = -i;
    if (a === 'attack') stretch = i <= 1 ? 3 : 1;
    // trailing wisp
    const wave = (i % 3) - 1;
    p.poly([[cx - 6, cy], [cx + 6 + stretch, cy], [cx + 4 + stretch, cy + 8], [cx + 1 + wave, cy + 12], [cx - 1 + wave, cy + 15], [cx - 3, cy + 10], [cx - 6, cy + 6]], dark);
    p.poly([[cx - 5, cy], [cx + 5 + stretch, cy], [cx + 3 + stretch, cy + 7], [cx + wave, cy + 11], [cx - 4, cy + 6]], body);
    p.ellipse(cx + Math.floor(stretch / 2), cy - 1, 6 + Math.floor(stretch / 2), 6, body);
    p.ellipse(cx - 1, cy - 2, 3, 3, core, 0.6);
    // hollow eyes & mouth
    const ex = cx + 1 + stretch;
    p.rect(ex, cy - 3, 2, 3, eye);
    p.rect(ex + 3, cy - 3, 1, 3, eye);
    if (a === 'attack' || a === 'windup') p.ellipse(ex + 2, cy + 2, 1, 2, eye);
    else p.rect(ex + 1, cy + 2, 2, 1, eye);
    // arms
    if (a === 'attack') {
      p.line(cx + 4, cy + 2, cx + 10, cy + 1, body);
      p.p(cx + 11, cy + 1, core);
    } else if (a === 'windup') {
      p.line(cx - 4, cy + 1, cx - 8, cy - 4 - i, body);
      p.line(cx + 5, cy + 1, cx + 8, cy - 4 - i, body);
    }
  },
};

const bookMimic: EnemyArt = {
  fw: 24,
  fh: 20,
  draw(p, a, i) {
    const cover = 0x6a2a3a, cdark = 0x4a1a26, gold = 0xc4a060, page = 0xe8dcc0, tooth = 0xffffff, eye = 0xffd040;
    let open = 0, hop = 0, dx = 0;
    if (a === 'idle') open = 0;
    if (a === 'move') { open = [1, 3, 4, 3, 1, 0][i]; hop = [0, 2, 3, 2, 0, 0][i]; }
    if (a === 'windup') open = 3 + i * 2;
    if (a === 'attack') { open = [9, 8, 4, 2][i]; dx = [3, 4, 2, 0][i]; hop = [3, 2, 1, 0][i]; }
    if (a === 'hurt') open = 2;
    if (a === 'death') open = Math.max(0, 6 - i);
    const x0 = 4 + dx, base = 18 - hop;
    // bottom cover + pages
    p.rect(x0, base - 3, 16, 3, cover);
    p.rect(x0 + 1, base - 5, 14, 2, page);
    p.rect(x0, base - 1, 16, 1, cdark);
    p.rect(x0 + 2, base - 3, 12, 1, gold);
    // spine at back (left)
    p.rect(x0 - 1, base - 6 - open, 2, 6 + open, cdark);
    // top cover rotated open (hinged at the left/back)
    const ty = base - 6 - open;
    p.poly([[x0, base - 6], [x0 + 16, ty], [x0 + 16, ty - 3], [x0, base - 9 - Math.floor(open / 3)]], cover);
    p.line(x0 + 2, base - 7 - Math.floor(open / 4), x0 + 14, ty - 1, gold);
    // top-cover jewel / eye
    p.p(x0 + 9, base - 7 - Math.floor(open * 0.6), open >= 3 ? eye : gold);
    if (open >= 2) {
      // mouth interior + teeth
      p.poly([[x0 + 2, base - 6], [x0 + 15, ty + 1], [x0 + 15, base - 6]], 0x200810);
      for (let t = x0 + 4; t < x0 + 15; t += 3) {
        p.p(t, base - 6, tooth);
        const ty2 = Math.round(base - 6 - ((t - x0) / 16) * open) + 1;
        p.p(t + 1, ty2, tooth);
      }
      // tongue / page
      if (open >= 5) p.rect(x0 + 6, base - 7, 5, 1, 0xc04060);
    }
    if (a === 'idle') {
      // dormant: faint glint only
      if (i === 3) p.p(x0 + 9, base - 7, eye);
    }
  },
};

export const ENEMY_ART: Record<string, EnemyArt> = {
  zombie,
  rat,
  skeleton_archer: skeletonArcher,
  bat,
  shield_knight: shieldKnight,
  imp,
  bomber,
  lancer,
  cultist,
  ghost,
  book_mimic: bookMimic,
  royal_guard: royalGuard,
  necromancer,
};

/** Frame size of each enemy spritesheet. Sprites face right; feet at the bottom row (flyers centered). */
export const ENEMY_FRAMES: Record<string, { w: number; h: number }> = Object.fromEntries(
  Object.entries(ENEMY_ART).map(([id, a]) => [id, { w: a.fw, h: a.fh }]),
);

export type { Color };
