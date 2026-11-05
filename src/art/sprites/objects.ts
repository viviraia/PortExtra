/** World objects (pickups, interactables, decor) and projectiles. */
import Phaser from 'phaser';
import { Px, shade } from '../canvas';
import { ANIMS, OBJ, projTex, type ProjectileKey } from '../keys';
import { OUTLINE, TRACK_COLORS } from '../palette';
import { buildFrames, buildImage } from '../sheet';
import { drawHumanoid } from './rig';

const GOLD = 0xffd24a, GOLD_D = 0xc08a20, GOLD_L = 0xfff0a0;

export function buildObjects(scene: Phaser.Scene): void {
  // coin
  buildFrames(scene, OBJ.coin, 8, 8, 6, (p, i) => {
    const w = [3, 2, 1, 0, 1, 2][i];
    p.ellipse(4, 4, w, 3, GOLD_D);
    if (w >= 1) p.ellipse(4, 4, Math.max(0, w - 1), 2, GOLD);
    else p.rect(4, 1, 1, 7, GOLD);
    if (w >= 2) p.p(3, 2, GOLD_L);
  }, { key: ANIMS.coinSpin, rate: 10, repeat: -1 }, OUTLINE);

  // ember
  buildFrames(scene, OBJ.ember, 8, 8, 4, (p, i) => {
    const sway = [0, 1, 0, -1][i];
    p.poly([[1, 7], [7, 7], [6, 4], [4 + sway, 0], [2, 4]], 0xc8301a);
    p.poly([[2, 7], [6, 7], [5, 4], [4 + sway, 2], [3, 4]], 0xff7a3a);
    p.rect(3, 5, 2, 2, 0xffd080);
    p.p(4, 6, 0xffffff);
  }, { key: ANIMS.emberFlicker, rate: 8, repeat: -1 }, OUTLINE);

  // chest
  buildFrames(scene, OBJ.chest, 24, 16, 2, (p, i) => {
    const wood = 0x7a4a2a, dark = 0x4a2a16, band = 0xa8a8b0;
    p.rect(2, 7, 20, 9, wood);
    p.rect(2, 15, 20, 1, dark);
    p.rect(4, 7, 2, 9, band);
    p.rect(18, 7, 2, 9, band);
    if (i === 0) {
      p.rect(2, 2, 20, 6, shade(wood, 0.1));
      p.rect(3, 1, 18, 1, shade(wood, 0.25));
      p.rect(4, 1, 2, 7, band);
      p.rect(18, 1, 2, 7, band);
      p.rect(10, 6, 4, 4, GOLD);
      p.p(11, 8, dark);
    } else {
      p.rect(3, 6, 18, 2, 0x200c06);
      p.rect(2, 0, 20, 3, shade(wood, 0.1));
      p.rect(4, 0, 2, 3, band);
      p.rect(18, 0, 2, 3, band);
      p.rect(6, 5, 12, 2, GOLD, 0.6);
    }
  }, undefined, OUTLINE);

  // merchant: hunched trader with a huge pack and lantern
  buildFrames(scene, OBJ.merchant, 32, 32, 4, (p, i) => {
    // pack
    p.rect(5, 10 + (i >= 2 ? 1 : 0), 10, 14, 0x6a4a2a);
    p.rect(5, 10 + (i >= 2 ? 1 : 0), 10, 2, 0x8a6a3a);
    p.rect(6, 15, 8, 1, 0x3a2414);
    p.rect(7, 6 + (i >= 2 ? 1 : 0), 6, 4, 0x4a5a3a);
    p.rect(13, 13, 3, 3, 0x9a7a40);
    drawHumanoid(
      p,
      {
        cx: 17, ground: 31, legLen: 5, torsoLen: 8, torsoW: 8, headW: 8, headH: 7, armLen: 6, limb: 2,
        head: 'hood', body: 'robe', hunch: 2,
        colors: { skin: 0xc8a080, body: 0x4a5a3a, trim: GOLD_D, legs: 0x2a2018, boots: 0x2a2018, eye: 0xfff0a0, head: 0x3e4a30 },
      },
      { bob: i >= 2 ? 1 : 0, armF: 30, armB: 100, sway: i % 2 },
      (pp, hand) => {
        pp.line(hand.x, hand.y, hand.x + 2, hand.y + 3, 0x3a3030);
        pp.rect(hand.x + 1, hand.y + 3, 4, 5, 0x3a3030);
        pp.rect(hand.x + 2, hand.y + 4, 2, 3, i % 2 ? 0xffd080 : 0xffb050);
        pp.circle(hand.x + 3, hand.y + 5, 5, 0xffb050, 0.12);
      },
    );
  }, { key: ANIMS.merchantIdle, rate: 5, repeat: -1 }, OUTLINE);

  // altar: frame 0 lit with a floating scroll, frame 1 spent
  buildFrames(scene, OBJ.altar, 24, 32, 2, (p, i) => {
    const st = 0x6a6470, dk = 0x403c48;
    p.rect(4, 26, 16, 6, dk);
    p.rect(6, 16, 12, 10, st);
    p.rect(6, 16, 12, 1, shade(st, 0.3));
    p.rect(4, 14, 16, 3, st);
    p.rect(4, 14, 16, 1, shade(st, 0.35));
    p.rect(10, 19, 4, 4, dk);
    // candles
    for (const cx of [5, 18]) {
      p.rect(cx, 10, 2, 4, 0xe8dcc0);
      if (i === 0) { p.p(cx, 9, 0xffd060); p.p(cx, 8, 0xff8030, 0.8); p.circle(cx, 8, 3, 0xffb050, 0.15); }
    }
    if (i === 0) {
      p.circle(12, 7, 6, 0xfff0c0, 0.15);
      p.rect(9, 4, 6, 5, 0xe8dcc0);
      p.rect(8, 4, 1, 5, 0xc8b898);
      p.rect(15, 4, 1, 5, 0xc8b898);
      p.p(12, 6, 0xc83040);
      p.p(10, 5, 0x8a7a60); p.p(13, 7, 0x8a7a60);
    } else {
      p.rect(9, 12, 6, 2, 0x3a3640);
    }
    p.rect(10, 20, 4, 1, i === 0 ? 0xa45cff : dk);
  }, undefined, OUTLINE);

  // exit portal: stone arch with a swirling vortex
  buildFrames(scene, OBJ.exitPortal, 32, 48, 6, (p, i) => {
    const st = 0x5a5464, lt = 0x8a8494;
    p.ellipse(16, 20, 13, 14, st);
    p.rect(3, 20, 26, 28, st);
    p.ellipse(16, 20, 10, 11, 0x0a0614);
    p.rect(6, 20, 20, 28, 0x0a0614);
    // vortex
    for (let k = 0; k < 40; k++) {
      const t = k / 40;
      const ang = t * Math.PI * 6 + (i / 6) * Math.PI * 2;
      const r = 1 + t * 9;
      const x = 16 + Math.cos(ang) * r, y = 28 + Math.sin(ang) * r * 1.4;
      p.p(x, y, k % 3 === 0 ? 0xffd090 : 0xff7a3a, 0.5 + t * 0.5);
    }
    p.circle(16, 28, 3, 0xfff0c0, 0.6);
    p.p(16, 28, 0xffffff);
    // keystone & rim highlights
    p.rect(14, 4, 4, 4, lt);
    p.rect(3, 20, 1, 28, lt);
    p.rect(2, 44, 28, 4, shade(st, -0.2));
    p.rect(2, 44, 28, 1, lt);
    // runes
    for (let k = 0; k < 4; k++) p.p(4 + (k % 2) * 24, 24 + k * 5, (k + i) % 2 ? 0xff9a3c : 0x804020);
  }, { key: ANIMS.exitSwirl, rate: 10, repeat: -1 }, OUTLINE);

  // torch
  buildFrames(scene, OBJ.torch, 8, 16, 4, (p, i) => {
    p.rect(3, 9, 2, 6, 0x4a3420);
    p.rect(2, 8, 4, 2, 0x5a5050);
    const s = [0, 1, 0, -1][i];
    p.poly([[2, 8], [6, 8], [5 + (s > 0 ? 1 : 0), 4], [4 + s, 0], [2 + (s < 0 ? -1 : 0), 4]], 0xd84a1a);
    p.poly([[3, 8], [5, 8], [5, 5], [4 + s, 2], [3, 5]], 0xffa040);
    p.rect(3, 6, 2, 2, 0xfff0a0);
  }, { key: ANIMS.torchBurn, rate: 10, repeat: -1 }, OUTLINE);

  // banner (light neutral cloth so it can be tinted per biome)
  buildImage(scene, OBJ.banner, 16, 32, (p) => {
    p.rect(1, 0, 14, 2, 0x8a8478);
    p.rect(2, 2, 12, 24, 0xe8e0d8);
    p.rect(2, 2, 2, 24, 0xc0b8b0);
    p.poly([[2, 26], [14, 26], [14, 31], [8, 27], [2, 31]], 0xe8e0d8);
    p.rect(6, 8, 4, 6, 0x9a9088);
    p.rect(5, 9, 6, 1, 0x9a9088);
    p.rect(7, 15, 2, 5, 0x9a9088);
    p.rect(2, 3, 12, 1, 0xa8a098);
  }, OUTLINE);

  buildImage(scene, OBJ.potion, 8, 8, (p) => {
    p.rect(3, 0, 2, 2, 0x8a6a4a);
    p.rect(2, 2, 4, 1, 0xc8c8d8);
    p.circle(4, 5, 2.4, 0xc81e32);
    p.p(3, 4, 0xff8080);
  }, OUTLINE);

  buildImage(scene, OBJ.heart, 8, 8, (p) => {
    p.circle(4, 4, 3, 0xc81e32);
    p.circle(4, 4, 2, 0xff4050);
    p.p(3, 3, 0xffc0c0);
  }, OUTLINE);

  const scroll = (key: string, c: number) =>
    buildImage(scene, key, 12, 12, (p) => {
      p.rect(2, 3, 8, 7, 0xe8dcc0);
      p.rect(1, 2, 10, 2, 0xc8b898);
      p.rect(1, 9, 10, 2, 0xc8b898);
      p.rect(3, 5, 6, 1, 0x8a7a60);
      p.rect(3, 7, 4, 1, 0x8a7a60);
      p.circle(8, 8, 2, c);
      p.p(8, 8, shade(c, 0.5));
    }, OUTLINE);
  scroll(OBJ.scrollMight, TRACK_COLORS.might);
  scroll(OBJ.scrollCunning, TRACK_COLORS.cunning);
  scroll(OBJ.scrollVigor, TRACK_COLORS.vigor);

  buildImage(scene, OBJ.itemDrop, 16, 16, (p) => {
    p.ellipse(8, 13, 7, 2, 0xffffff, 0.25);
    p.rect(3, 11, 10, 3, 0x5a5464);
    p.rect(3, 11, 10, 1, 0x8a8494);
    p.rect(5, 14, 6, 2, 0x403c48);
    for (let y = 0; y < 10; y++) p.rect(4, y, 8, 1, 0xffffff, 0.02 + (y / 10) * 0.12);
  });

  buildImage(scene, OBJ.door, 16, 48, (p) => {
    p.rect(0, 0, 16, 48, 0x1a1418, 0.6);
    for (let x = 1; x < 16; x += 4) {
      p.rect(x, 0, 2, 46, 0x5a5660);
      p.rect(x, 0, 1, 46, 0x8a8690);
      p.poly([[x - 1, 44], [x + 3, 44], [x + 1, 48]], 0x8a8690);
    }
    for (const y of [6, 20, 34]) p.rect(0, y, 16, 2, 0x4a4650);
  }, OUTLINE);

  buildProjectiles(scene);
}

function buildProjectiles(scene: Phaser.Scene) {
  const P: Record<ProjectileKey, [number, number, (p: Px) => void]> = {
    arrow: [12, 3, (p) => { p.rect(0, 1, 9, 1, 0x8a6a3a); p.rect(9, 0, 3, 3, 0xc0c4d0); p.p(11, 1, 0xffffff); p.p(0, 0, 0xe8e0d0); p.p(0, 2, 0xe8e0d0); p.p(1, 0, 0xe8e0d0); p.p(1, 2, 0xe8e0d0); }],
    bolt: [10, 3, (p) => { p.rect(0, 1, 7, 1, 0x5a4a3a); p.rect(7, 0, 3, 3, 0x9aa0b0); p.p(9, 1, 0xffffff); p.p(0, 0, 0xc83040); p.p(0, 2, 0xc83040); }],
    knife: [8, 4, (p) => { p.rect(0, 1, 2, 2, 0x5a3a2a); p.rect(2, 1, 5, 2, 0xc8ccd8); p.p(7, 1, 0xffffff); p.rect(2, 1, 5, 1, 0xe8ecf8); }],
    fireball: [10, 10, (p) => { p.circle(4, 5, 3.5, 0xd84a1a); p.circle(5, 5, 2.5, 0xff9a3a); p.circle(6, 5, 1.4, 0xfff0a0); p.p(1, 3, 0xff7a3a, 0.7); p.p(0, 6, 0xff7a3a, 0.5); }],
    spark: [6, 6, (p) => { p.rect(2, 0, 2, 6, 0xa0e0ff); p.rect(0, 2, 6, 2, 0xa0e0ff); p.rect(2, 2, 2, 2, 0xffffff); }],
    orb: [8, 8, (p) => { p.circle(4, 4, 3.5, 0x6a2aa8); p.circle(4, 4, 2.4, 0xb070ff); p.p(3, 3, 0xffffff); }],
    bomb: [8, 8, (p) => { p.circle(4, 5, 3, 0x202024); p.p(3, 4, 0x6a6a76); p.rect(4, 0, 1, 2, 0xa08060); p.p(5, 0, 0xffe060); }],
    feather: [10, 4, (p) => { p.poly([[0, 2], [6, 0], [10, 2], [6, 4]], 0x9aa2b2); p.line(0, 2, 10, 2, 0x5a6274); p.p(9, 2, 0xffffff); }],
    bone: [8, 8, (p) => { p.line(1, 6, 6, 1, 0xd8cfb0, 2); p.rect(0, 5, 2, 3, 0xe8e0c8); p.rect(6, 0, 2, 3, 0xe8e0c8); }],
    grenade: [7, 7, (p) => { p.circle(3, 4, 2.6, 0x6a3a1a); p.p(2, 3, 0xff9a3a); p.rect(3, 0, 1, 2, 0x8a8a8a); p.p(4, 0, 0xffe060); }],
    icicle: [10, 4, (p) => { p.poly([[0, 0], [10, 2], [0, 4]], 0x7ad8ff); p.line(0, 1, 8, 2, 0xe0f8ff); }],
    ink: [8, 8, (p) => { p.circle(4, 4, 3, 0x1a0a2a); p.ring(4, 4, 3, 0xa45cff, 1, 0.9); p.p(3, 3, 0xe8c0ff); p.p(0, 5, 0x1a0a2a); }],
    darkorb: [12, 12, (p) => { p.circle(6, 6, 5, 0x1a0820); p.ring(6, 6, 5, 0xd84060, 1); p.circle(6, 6, 2, 0xff6a8a, 0.8); p.p(5, 5, 0xffffff); }],
  };
  for (const [k, [w, h, fn]] of Object.entries(P) as [ProjectileKey, [number, number, (p: Px) => void]][]) {
    buildImage(scene, projTex(k), w, h, (p) => fn(p), OUTLINE);
  }
}
