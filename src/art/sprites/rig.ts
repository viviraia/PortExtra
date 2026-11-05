/**
 * Parametric humanoid rig used to draw the player, most enemies and the
 * humanoid bosses. All figures face RIGHT (+x); gameplay flips sprites.
 */
import { Px, shade, type Color } from '../canvas';

export interface HumColors {
  skin: Color;
  body: Color;
  trim: Color;
  legs: Color;
  boots: Color;
  eye: Color;
  head: Color;
  /** Cape / cloak color (defaults to body darkened). */
  cape?: Color;
}

export type HeadStyle = 'hood' | 'helm' | 'skull' | 'zombie' | 'crown' | 'cowl' | 'bald' | 'plume' | 'none';
export type BodyStyle = 'tunic' | 'robe' | 'armor' | 'rags';

export interface HumSpec {
  cx: number;
  ground: number;
  legLen: number;
  torsoLen: number;
  torsoW: number;
  headW: number;
  headH: number;
  armLen: number;
  limb: number;
  head: HeadStyle;
  body: BodyStyle;
  cape?: boolean;
  /** Forward shift of the head relative to shoulders. */
  hunch?: number;
  colors: HumColors;
}

export interface Pose {
  x?: number;
  bob?: number;
  lean?: number;
  footF?: [number, number];
  footB?: [number, number];
  /** Degrees: 0 = forward, 90 = down, -90 = up, 180 = back. */
  armF?: number;
  armB?: number;
  /** Cape flutter offset (px, positive = further back/up). */
  cape?: number;
  /** 0..1 extra eye glow. */
  glow?: number;
  /** Robe hem sway. */
  sway?: number;
  /** If true, draw kneeling (legs folded). */
  kneel?: boolean;
}

export interface RigOut {
  handF: { x: number; y: number };
  handB: { x: number; y: number };
  head: { x: number; y: number };
  shoulder: { x: number; y: number };
  hip: { x: number; y: number };
}

export type HoldFn = (p: Px, hand: { x: number; y: number }, angleDeg: number, out: RigOut) => void;

const DEG = Math.PI / 180;

function limb(p: Px, x0: number, y0: number, x1: number, y1: number, bend: number, c: Color, th: number) {
  const mx = (x0 + x1) / 2 + bend, my = (y0 + y1) / 2;
  p.line(x0, y0, mx, my, c, th);
  p.line(mx, my, x1, y1, c, th);
}

export function drawHumanoid(p: Px, s: HumSpec, pose: Pose = {}, holdF?: HoldFn, holdB?: HoldFn): RigOut {
  const c = s.colors;
  const bob = pose.bob ?? 0;
  const bx = s.cx + (pose.x ?? 0);
  const kneel = !!pose.kneel;
  const legLen = kneel ? Math.ceil(s.legLen * 0.5) : s.legLen;
  const hipY = s.ground - legLen + bob + 1;
  const hipX = bx;
  const lean = pose.lean ?? 0;
  const shY = hipY - s.torsoLen;
  const shX = hipX + lean;
  const tw = s.torsoW;
  const th = s.limb;
  const fF = pose.footF ?? [1, 0];
  const fB = pose.footB ?? [-1, 0];
  const armF = pose.armF ?? 80;
  const armB = pose.armB ?? 100;
  const backShade = -0.35;

  const shF = { x: shX + Math.floor(tw / 2) - 1, y: shY + 1 };
  const shB = { x: shX - Math.floor(tw / 2) + 1, y: shY + 1 };
  const handF = { x: shF.x + Math.cos(armF * DEG) * s.armLen, y: shF.y + Math.sin(armF * DEG) * s.armLen };
  const handB = { x: shB.x + Math.cos(armB * DEG) * s.armLen, y: shB.y + Math.sin(armB * DEG) * s.armLen };
  const headX = shX + (s.hunch ?? 0);
  const headY = shY - Math.floor(s.headH / 2);
  const out: RigOut = { handF, handB, head: { x: headX, y: headY }, shoulder: { x: shX, y: shY }, hip: { x: hipX, y: hipY } };

  // --- back arm
  holdB?.(p, handB, armB, out);
  limb(p, shB.x, shB.y, handB.x, handB.y, 0, shade(s.colors.body, backShade), th);
  p.rect(handB.x - 1, handB.y - 1, th, th, shade(c.skin, backShade));

  // --- back leg
  const footBx = hipX - 1 + fB[0], footBy = s.ground - fB[1];
  if (s.body !== 'robe') {
    if (kneel) {
      limb(p, hipX - 1, hipY, hipX - 4, s.ground, 0, shade(c.legs, backShade), th);
    } else {
      limb(p, hipX - 1, hipY, footBx, footBy, 1, shade(c.legs, backShade), th);
      p.rect(footBx - 1, footBy - 1, th + 1, 2, shade(c.boots, backShade));
    }
  }

  // --- cape
  if (s.cape) {
    const fl = pose.cape ?? 0;
    const capeC = c.cape ?? shade(c.body, -0.25);
    const bottom = Math.min(s.ground - 1, hipY + Math.ceil(legLen * 0.6));
    p.poly(
      [
        [shB.x - 1, shY],
        [shF.x - 1, shY],
        [hipX - 1, bottom],
        [hipX - 4 - fl, bottom - Math.floor(fl / 2)],
        [shB.x - 3 - fl, Math.floor((shY + bottom) / 2)],
      ],
      capeC,
    );
    p.line(hipX - 1, bottom, hipX - 4 - fl, bottom - Math.floor(fl / 2), shade(capeC, -0.3));
  }

  // --- torso
  const tl = shX - Math.floor(tw / 2), tr = shX + Math.ceil(tw / 2);
  const bl = hipX - Math.floor(tw / 2), br = hipX + Math.ceil(tw / 2);
  if (s.body === 'robe') {
    const sway = pose.sway ?? 0;
    const hemY = s.ground + (kneel ? 0 : 0);
    p.poly(
      [
        [tl, shY],
        [tr, shY],
        [br + 2 + sway, hemY + 1],
        [bl - 2 + sway, hemY + 1],
      ],
      s.colors.body,
    );
    // fold shading on the back half
    p.poly(
      [
        [tl, shY],
        [shX - 1, shY],
        [hipX - 2 + sway, hemY + 1],
        [bl - 2 + sway, hemY + 1],
      ],
      shade(s.colors.body, -0.22),
    );
    p.rect(bl - 2 + sway, hemY, br - bl + 4, 1, c.trim);
    p.rect(tl + 1, shY + Math.floor(s.torsoLen * 0.55), tw - 1, 1, c.trim);
  } else {
    p.poly(
      [
        [tl, shY],
        [tr, shY],
        [br, hipY + 1],
        [bl, hipY + 1],
      ],
      s.colors.body,
    );
    p.poly(
      [
        [tl, shY],
        [shX - 1, shY],
        [hipX - 1, hipY + 1],
        [bl, hipY + 1],
      ],
      shade(s.colors.body, -0.2),
    );
    if (s.body === 'armor') {
      p.rect(tl + 1, shY + 1, tw - 2, 1, shade(s.colors.body, 0.35));
      p.rect(shX + 1, shY + 2, 1, s.torsoLen - 3, shade(s.colors.body, 0.2));
      p.rect(bl, hipY - 1, br - bl, 1, c.trim);
      // pauldron
      p.rect(shF.x - 1, shY - 1, 3, 3, shade(s.colors.body, 0.15));
    } else if (s.body === 'rags') {
      for (let i = bl; i < br; i += 2) p.p(i, hipY + 2, shade(s.colors.body, -0.2));
      p.p(shX, shY + 3, shade(s.colors.body, -0.4));
      p.p(shX + 2, shY + 5, shade(s.colors.body, -0.4));
    } else {
      p.rect(bl, hipY - 2, br - bl, 1, c.trim);
      p.p(shX + 1, hipY - 2, shade(c.trim, 0.4));
    }
  }

  // --- front leg
  const footFx = hipX + 1 + fF[0], footFy = s.ground - fF[1];
  if (s.body !== 'robe') {
    if (kneel) {
      limb(p, hipX + 1, hipY, hipX + 4, hipY + 1, 0, c.legs, th);
      limb(p, hipX + 4, hipY + 1, hipX + 4, s.ground, 0, c.legs, th);
      p.rect(hipX + 3, s.ground - 1, th + 1, 2, c.boots);
    } else {
      limb(p, hipX + 1, hipY, footFx, footFy, 1, c.legs, th);
      p.rect(footFx - 1, footFy - 1, th + 1, 2, c.boots);
    }
  }

  // --- head
  drawHead(p, s, headX, headY, pose.glow ?? 0);

  // --- front arm (+ held item)
  limb(p, shF.x, shF.y, handF.x, handF.y, 0, s.body === 'armor' ? shade(s.colors.body, 0.1) : s.colors.body, th);
  p.rect(handF.x - 1, handF.y - 1, th, th, c.skin);
  holdF?.(p, handF, armF, out);
  return out;
}

export function drawHead(p: Px, s: HumSpec, hx: number, hy: number, glow: number): void {
  const c = s.colors;
  const w = s.headW, h = s.headH;
  const x0 = hx - Math.floor(w / 2), y0 = hy - Math.floor(h / 2);
  const eye = c.eye;
  const eyeY = y0 + Math.floor(h * 0.5);
  const glowA = 0.35 + glow * 0.5;
  switch (s.head) {
    case 'hood':
    case 'cowl': {
      const hc = c.head;
      p.rect(x0, y0 + 1, w, h - 1, hc);
      p.rect(x0 + 1, y0, w - 2, 1, hc);
      // hood tip
      if (s.head === 'hood') {
        p.rect(x0 - 1, y0, 3, 3, hc);
        p.rect(x0 - 2, y0 - 1, 2, 2, hc);
        p.p(x0 - 3, y0 - 2, hc);
      } else {
        p.rect(x0 + 2, y0 - 2, 2, 2, hc);
        p.p(x0 + 2, y0 - 3, hc);
      }
      p.rect(x0, y0 + 1, 2, h - 1, shade(hc, -0.25));
      p.rect(x0 + 2, y0, w - 3, 1, shade(hc, 0.25));
      // face hole
      p.rect(x0 + Math.floor(w / 2) - 1, y0 + 2, Math.ceil(w / 2) + 1, h - 3, 0x050308);
      p.p(x0 + w - 2, eyeY, eye);
      p.p(x0 + w - 4, eyeY, eye);
      p.p(x0 + w - 2, eyeY - 1, eye, glowA * 0.6);
      p.p(x0 + w - 4, eyeY - 1, eye, glowA * 0.6);
      break;
    }
    case 'helm':
    case 'plume':
    case 'crown': {
      const hc = c.head;
      p.rect(x0, y0, w, h, hc);
      p.rect(x0, y0, w, 1, shade(hc, 0.35));
      p.rect(x0, y0, 1, h, shade(hc, -0.25));
      p.rect(x0 + 1, y0 + h - 1, w - 1, 1, shade(hc, -0.3));
      // visor slit
      p.rect(x0 + Math.floor(w / 2), eyeY, Math.ceil(w / 2), 1, 0x050308);
      p.p(x0 + w - 2, eyeY, eye);
      p.p(x0 + w - 3, eyeY, eye, glowA);
      if (s.head === 'plume') {
        p.rect(x0 - 1, y0 - 2, 3, 2, c.trim);
        p.rect(x0 - 3, y0 - 1, 2, 3, c.trim);
        p.p(x0 - 4, y0 + 1, shade(c.trim, -0.3));
      }
      if (s.head === 'crown') {
        p.rect(x0, y0 - 1, w, 1, c.trim);
        for (let i = 0; i < w; i += 2) p.rect(x0 + i, y0 - 3, 1, 2, c.trim);
        p.p(x0 + Math.floor(w / 2), y0 - 1, 0xff3040);
        // hollow eyes: dark inside visor with bright eye
        p.rect(x0 + 1, eyeY - 1, w - 1, 3, 0x050308);
        p.p(x0 + w - 2, eyeY, eye);
        p.p(x0 + w - 4, eyeY, eye);
      }
      break;
    }
    case 'skull': {
      const bone = c.head;
      p.rect(x0, y0, w, h - 1, bone);
      p.rect(x0 + 1, y0 + h - 1, w - 2, 1, shade(bone, -0.2));
      p.rect(x0, y0, 1, h - 1, shade(bone, -0.25));
      p.rect(x0 + w - 3, eyeY - 1, 2, 2, 0x050308);
      p.p(x0 + w - 2, eyeY, eye);
      p.rect(x0 + w - 2, y0 + h - 2, 2, 1, 0x050308);
      p.p(x0 + w - 3, y0 + h - 1, 0x050308);
      break;
    }
    case 'zombie': {
      const sk = c.head;
      p.rect(x0, y0 + 1, w, h - 1, sk);
      p.rect(x0 + 1, y0, w - 2, 1, sk);
      p.rect(x0, y0 + 1, 1, h - 1, shade(sk, -0.3));
      p.p(x0 + 1, y0, shade(sk, -0.4));
      p.p(x0 + 3, y0, shade(sk, -0.4));
      p.rect(x0 + w - 3, eyeY - 1, 2, 2, 0x10140a);
      p.p(x0 + w - 2, eyeY - 1, eye);
      p.rect(x0 + w - 3, y0 + h - 2, 3, 1, 0x2a0a0a);
      break;
    }
    case 'bald': {
      const sk = c.head;
      p.rect(x0, y0 + 1, w, h - 1, sk);
      p.rect(x0 + 1, y0, w - 2, 1, shade(sk, 0.2));
      p.rect(x0, y0 + 1, 1, h - 1, shade(sk, -0.3));
      p.p(x0 + w - 2, eyeY, 0x101010);
      p.p(x0 + w - 4, eyeY, 0x101010);
      p.p(x0 + w - 1, eyeY + 1, shade(sk, -0.2));
      break;
    }
    case 'none':
      break;
  }
}

/** Walk-cycle pose helper: phase in [0,1). */
export function walkPose(phase: number, stride = 3, lift = 2, armSwing = 30): Pose {
  const a = phase * Math.PI * 2;
  const s = Math.sin(a), cs = Math.cos(a);
  return {
    footF: [Math.round(s * stride), Math.max(0, Math.round(cs * lift))],
    footB: [Math.round(-s * stride), Math.max(0, Math.round(-cs * lift))],
    armF: 90 - s * armSwing,
    armB: 90 + s * armSwing,
    bob: Math.abs(cs) > 0.7 ? 0 : 1,
  };
}

// ---------------------------------------------------------------------------
// Common held props
// ---------------------------------------------------------------------------

export function holdBlade(len: number, blade: Color, hilt: Color, th = 1): HoldFn {
  return (p, hand, ang) => {
    const a = ang * DEG;
    // blade points along the arm direction, rotated so it extends forward/up
    const dx = Math.cos(a - Math.PI / 2.2), dy = Math.sin(a - Math.PI / 2.2);
    p.line(hand.x - dx * 1, hand.y - dy * 1, hand.x + dx * 1, hand.y + dy * 1, hilt, 1);
    p.line(hand.x + dx * 1, hand.y + dy * 1, hand.x + dx * len, hand.y + dy * len, blade, th);
    p.p(hand.x + dx * len, hand.y + dy * len, shade(blade, 0.5));
  };
}

export function holdPole(len: number, shaft: Color, head: Color, headKind: 'spear' | 'axe' | 'skull' | 'orb' | 'none', angOffset = 0): HoldFn {
  return (p, hand, ang) => {
    const a = (ang + angOffset) * DEG;
    const dx = Math.cos(a), dy = Math.sin(a);
    const back = len * 0.4;
    const x0 = hand.x - dx * back, y0 = hand.y - dy * back;
    const x1 = hand.x + dx * (len - back), y1 = hand.y + dy * (len - back);
    p.line(x0, y0, x1, y1, shaft, 1);
    if (headKind === 'spear') {
      p.line(x1, y1, x1 + dx * 4, y1 + dy * 4, head, 1);
      p.p(x1 - dy, y1 + dx, head);
      p.p(x1 + dy, y1 - dx, head);
    } else if (headKind === 'axe') {
      p.rect(x1 - 2, y1 - 2, 4, 5, head);
      p.p(x1 + 2, y1 - 2, shade(head, 0.5));
    } else if (headKind === 'skull') {
      p.rect(x1 - 1, y1 - 2, 4, 3, 0xd8d0b8);
      p.p(x1 + 1, y1 - 1, 0x40ff80);
    } else if (headKind === 'orb') {
      p.circle(x1, y1, 2, head);
      p.p(x1 - 1, y1 - 1, shade(head, 0.6));
    }
  };
}
