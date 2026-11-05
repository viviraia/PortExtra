/** 16x16 item icons for every weapon, skill and relic id. */
import Phaser from 'phaser';
import { Px, shade } from '../canvas';
import { iconTex } from '../keys';
import { OUTLINE } from '../palette';
import { buildImage } from '../sheet';
import { RELIC_IDS, SKILL_IDS, WEAPON_IDS } from '../../data/ids';

type Icon = (p: Px) => void;

const STEEL = 0xc8ccd8, STEEL_D = 0x7a8090, WOOD = 0x8a5a32, WOOD_D = 0x5a3a20, GOLD = 0xffd24a, GOLD_D = 0xc08a20;

/** Diagonal blade from (x0,y0) hilt end toward the top-right. */
function blade(p: Px, len: number, c: number, edge: number, x0 = 3, y0 = 13, th = 2) {
  p.line(x0, y0, x0 + 2, y0 - 2, WOOD_D, 2); // grip
  p.line(x0 + 1, y0 - 4, x0 + 5, y0, GOLD_D, 1); // guard
  p.line(x0 + 3, y0 - 3, x0 + 3 + len, y0 - 3 - len, c, th);
  p.line(x0 + 4, y0 - 3, x0 + 3 + len, y0 - 2 - len, edge, 1);
  p.p(x0 - 1, y0 + 1, GOLD);
}

function shaft(p: Px, x0: number, y0: number, x1: number, y1: number, c = WOOD) {
  p.line(x0, y0, x1, y1, c, 1);
  p.line(x0 + 1, y0, x1 + 1, y1, shade(c, -0.3), 1);
}

const WEAPONS: Record<keyof typeof WEAPON_IDS, Icon> = {
  rusty_sword: (p) => { blade(p, 8, 0x9a7a6a, 0xc8a890); p.p(9, 7, 0x7a4a2a); p.p(11, 4, 0x7a4a2a); },
  twin_daggers: (p) => {
    p.line(3, 12, 10, 5, STEEL, 2); p.line(2, 13, 4, 11, WOOD_D, 2); p.p(11, 4, 0xffffff);
    p.line(13, 12, 6, 5, STEEL_D, 2); p.line(14, 13, 12, 11, WOOD_D, 2); p.p(5, 4, 0xffffff);
  },
  war_hammer: (p) => { shaft(p, 3, 14, 10, 6); p.rect(7, 1, 8, 6, STEEL_D); p.rect(7, 1, 8, 2, STEEL); p.rect(10, 3, 2, 2, GOLD_D); },
  spear: (p) => { shaft(p, 1, 15, 11, 5); p.poly([[10, 6], [15, 1], [12, 8]], STEEL); p.poly([[10, 6], [15, 1], [8, 4]], shade(STEEL, 0.2)); p.rect(9, 6, 2, 2, 0x9a3030); },
  flame_blade: (p) => { blade(p, 8, 0xd84a1a, 0xffb050); p.p(13, 1, 0xfff0a0); p.p(9, 3, 0xff9a3a); p.p(12, 6, 0xff9a3a); p.p(7, 7, 0xffd080); },
  frost_axe: (p) => { shaft(p, 3, 15, 10, 4, 0x6a5a6a); p.poly([[9, 2], [15, 1], [15, 9], [10, 7]], 0x7ad8ff); p.line(15, 1, 15, 9, 0xe0f8ff); p.p(12, 4, 0xffffff); },
  blood_scythe: (p) => { shaft(p, 4, 15, 9, 2, 0x3a2a2a); p.poly([[8, 2], [2, 3], [0, 7], [4, 4]], 0xc81e32); p.line(8, 2, 1, 5, 0xff6070); p.p(1, 8, 0xc81e32); },
  rapier: (p) => { p.line(5, 10, 14, 1, STEEL, 1); p.p(14, 1, 0xffffff); p.circle(4, 11, 2, GOLD); p.p(4, 11, GOLD_D); p.line(2, 14, 4, 12, WOOD_D, 2); },
  hunter_bow: (p) => {
    p.line(5, 1, 9, 4, WOOD, 2); p.line(9, 4, 9, 11, WOOD, 2); p.line(9, 11, 5, 14, WOOD, 2);
    p.line(5, 1, 5, 14, 0xe8e0d0, 1); p.line(2, 8, 13, 8, WOOD_D, 1); p.p(14, 8, STEEL);
  },
  repeater_crossbow: (p) => {
    p.rect(2, 8, 12, 2, WOOD); p.rect(1, 9, 3, 4, WOOD_D);
    p.line(10, 3, 12, 8, STEEL_D, 2); p.line(12, 9, 10, 14, STEEL_D, 2);
    p.line(10, 3, 7, 9, 0xe8e0d0); p.line(7, 9, 10, 14, 0xe8e0d0); p.rect(5, 6, 5, 2, 0x5a4a3a);
  },
  throwing_knives: (p) => {
    for (const [x, y, dx] of [[2, 12, 3], [6, 13, 4], [10, 12, 5]] as const) { p.line(x, y, x + dx - 3, y - 9, STEEL, 1); p.p(x + dx - 3, y - 10, 0xffffff); p.rect(x, y, 2, 2, 0x8a2a2a); }
  },
  ember_staff: (p) => { shaft(p, 3, 15, 11, 5, 0x5a3a2a); p.circle(12, 4, 3, 0xd84a1a); p.circle(12, 4, 2, 0xff9a3a); p.p(11, 3, 0xfff0a0); p.ring(12, 4, 3, GOLD_D, 1); },
  storm_rod: (p) => { shaft(p, 3, 15, 10, 6, 0x4a4a5a); p.rect(9, 4, 3, 3, STEEL_D); p.line(12, 4, 14, 1, 0x9ad8ff); p.line(12, 5, 15, 6, 0x9ad8ff); p.p(11, 5, 0xffffff); p.p(14, 1, 0xffffff); },
  oak_buckler: (p) => { p.circle(8, 8, 6.5, WOOD); p.ring(8, 8, 6.5, STEEL_D, 1); p.circle(8, 8, 2, STEEL); p.p(7, 7, 0xffffff); p.line(3, 6, 13, 6, WOOD_D); p.line(3, 10, 13, 10, WOOD_D); },
  bastion_shield: (p) => { p.poly([[2, 1], [14, 1], [14, 9], [8, 15], [2, 9]], STEEL_D); p.poly([[3, 2], [13, 2], [13, 9], [8, 14], [3, 9]], STEEL); p.poly([[5, 11], [11, 11], [8, 3]], GOLD_D); p.poly([[6, 10], [10, 10], [8, 5]], GOLD); p.rect(4, 12, 8, 1, GOLD_D); },
};

const SKILLS: Record<keyof typeof SKILL_IDS, Icon> = {
  fire_grenade: (p) => { p.circle(7, 9, 5, 0x4a2a1a); p.circle(6, 8, 3, 0x6a3a1a); p.p(5, 7, 0xa06a3a); p.rect(9, 3, 2, 2, STEEL_D); p.p(11, 2, 0xffe060); p.p(12, 1, 0xff7a3a); p.p(12, 3, 0xff7a3a); },
  frost_nova: (p) => {
    for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI; p.line(8 - Math.cos(a) * 7, 8 - Math.sin(a) * 7, 8 + Math.cos(a) * 7, 8 + Math.sin(a) * 7, 0x7ad8ff); }
    p.circle(8, 8, 2, 0xe0f8ff); p.ring(8, 8, 5, 0xc0f0ff, 1, 0.7);
  },
  spike_trap: (p) => { p.rect(1, 12, 14, 3, 0x4a4e5a); p.rect(1, 12, 14, 1, 0x6a6e7a); for (let x = 1; x < 15; x += 4) { p.poly([[x, 12], [x + 4, 12], [x + 2, 4]], STEEL); p.p(x + 2, 4, 0xffffff); } },
  bolt_turret: (p) => { p.line(4, 15, 7, 10, WOOD_D, 1); p.line(12, 15, 9, 10, WOOD_D, 1); p.line(8, 15, 8, 10, WOOD_D, 1); p.rect(4, 6, 8, 5, STEEL_D); p.rect(4, 6, 8, 1, STEEL); p.rect(11, 7, 4, 2, 0x5a4a3a); p.p(15, 8, 0xffffff); p.p(6, 8, 0xff6040); },
  phantom_dash: (p) => { for (let k = 0; k < 4; k++) p.line(1, 4 + k * 3, 6 - k, 4 + k * 3, 0xb070ff, 1, 0.6 + k * 0.1); p.ellipse(10, 9, 3, 5, 0x6a2aa8); p.rect(8, 4, 5, 4, 0x8a4ac8); p.p(12, 6, 0xffffff); },
  war_cry: (p) => { p.poly([[2, 11], [9, 7], [12, 3], [13, 6], [10, 10], [3, 13]], 0xc8a878); p.line(12, 3, 13, 6, GOLD_D); p.ring(13, 4, 3, 0xffe080, 1, 0.8); p.ring(13, 4, 6, 0xffe080, 1, 0.4); },
  chain_lightning: (p) => { const pts = [[2, 2], [7, 6], [5, 8], [11, 11], [9, 12], [14, 15]]; for (let k = 0; k + 1 < pts.length; k++) { p.line(pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1], 0xffe45a, 2); p.line(pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1], 0xffffff, 1); } },
  poison_cloud: (p) => { p.circle(5, 9, 4, 0x4a8a2a); p.circle(10, 8, 5, 0x5aa83a); p.circle(8, 6, 3, 0x7ad63a); p.rect(8, 8, 4, 3, 0xe0e8c8); p.p(9, 9, 0x203010); p.p(11, 9, 0x203010); },
  orbiting_blades: (p) => { p.ring(8, 8, 5, 0x8a8ea0, 1, 0.5); for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2; const x = 8 + Math.cos(a) * 5, y = 8 + Math.sin(a) * 5; p.line(x - Math.sin(a) * 3, y + Math.cos(a) * 3, x + Math.sin(a) * 3, y - Math.cos(a) * 3, STEEL, 1); } p.circle(8, 8, 1, 0xb070ff); },
  meteor: (p) => { for (let k = 0; k < 5; k++) p.line(1 + k, 1, 8 + k, 8, k % 2 ? 0xff9a3a : 0xd84a1a, 1, 0.5 + k * 0.1); p.circle(10, 10, 4, 0x5a3a2a); p.circle(11, 9, 2, 0x8a5a3a); p.p(12, 8, 0xffb050); },
};

const RELICS: Record<keyof typeof RELIC_IDS, Icon> = {
  iron_heart: (p) => { p.circle(5, 6, 3, STEEL_D); p.circle(11, 6, 3, STEEL_D); p.poly([[2, 7], [14, 7], [8, 14]], STEEL_D); p.circle(5, 6, 2, STEEL); p.p(4, 5, 0xffffff); p.p(8, 9, 0xc81e32); p.p(11, 8, 0x5a5e6a); p.p(6, 10, 0x5a5e6a); },
  vampire_fang: (p) => { p.poly([[4, 2], [12, 2], [9, 12], [8, 14]], 0xf0ece0); p.line(9, 3, 9, 12, 0xc8c0b0); p.circle(11, 13, 1.5, 0xc81e32); },
  lucky_coin: (p) => { p.circle(8, 8, 6, GOLD_D); p.circle(8, 8, 5, GOLD); p.rect(7, 4, 2, 8, GOLD_D); p.rect(4, 7, 8, 2, GOLD_D); p.p(6, 5, 0xfff0a0); },
  feather_charm: (p) => { p.poly([[3, 14], [6, 7], [12, 1], [11, 7]], 0xe8e8f0); p.line(3, 14, 12, 1, 0xa8a8b8); p.p(5, 10, 0xc8c8d8); p.circle(4, 13, 1.5, 0x4fa3ff); },
  swift_boots: (p) => { p.rect(4, 4, 5, 8, 0x6a4a2a); p.rect(4, 11, 9, 3, 0x6a4a2a); p.rect(4, 13, 9, 1, 0x3a2414); p.poly([[8, 4], [15, 2], [13, 6], [9, 7]], 0xe8e8f0); p.line(9, 5, 14, 3, 0xa8a8b8); },
  whetstone: (p) => { p.poly([[2, 10], [11, 5], [14, 8], [5, 13]], 0x7a7a86); p.poly([[2, 10], [11, 5], [12, 6], [3, 11]], 0x9a9aa6); p.p(12, 3, 0xffe060); p.p(14, 4, 0xfff0a0); p.p(13, 2, 0xffffff); },
  keen_eye: (p) => { p.ellipse(8, 8, 7, 4, 0xe8e0d0); p.circle(8, 8, 3, 0x4fa3ff); p.circle(8, 8, 1.5, 0x101018); p.p(7, 7, 0xffffff); p.line(1, 8, 4, 5, 0x5a4a3a); p.line(15, 8, 12, 5, 0x5a4a3a); },
  heavy_plate: (p) => { p.poly([[2, 3], [14, 3], [13, 13], [8, 15], [3, 13]], STEEL_D); p.poly([[3, 4], [13, 4], [12, 12], [8, 14], [4, 12]], STEEL); p.rect(7, 4, 2, 10, STEEL_D); p.rect(2, 3, 12, 1, GOLD_D); },
  hourglass: (p) => { p.rect(3, 1, 10, 2, WOOD); p.rect(3, 13, 10, 2, WOOD); p.poly([[4, 3], [12, 3], [8, 8]], 0xa0d0ff); p.poly([[4, 13], [12, 13], [8, 8]], 0xa0d0ff); p.poly([[6, 13], [10, 13], [8, 10]], 0xffd080); p.line(10, 4, 8, 7, 0x203040); },
  ember_core: (p) => { p.circle(8, 8, 5, 0xd84a1a); p.circle(8, 8, 3, 0xff9a3a); p.circle(8, 8, 1.5, 0xfff0a0); p.ring(8, 8, 6, 0x5a4a4a, 1); p.line(8, 2, 8, 14, 0x5a4a4a); },
  frozen_tear: (p) => { p.poly([[8, 1], [12, 9], [8, 14], [4, 9]], 0x4ab0e0); p.circle(8, 10, 4, 0x4ab0e0); p.circle(8, 10, 2.5, 0x7ad8ff); p.p(6, 8, 0xffffff); p.p(7, 6, 0xe0f8ff); },
  viper_tooth: (p) => { p.poly([[3, 2], [13, 2], [9, 13], [8, 14]], 0xd8e8c0); p.line(9, 3, 9, 12, 0x7ad63a); p.circle(10, 13, 1.5, 0x7ad63a); p.rect(3, 2, 10, 1, 0x4a8a2a); },
  thorn_mail: (p) => { p.poly([[3, 3], [13, 3], [12, 14], [4, 14]], 0x7a8090); for (let y = 4; y < 14; y += 2) for (let x = 4 + (y % 4 === 0 ? 1 : 0); x < 13; x += 2) p.p(x, y, 0xa8acb8); for (const [x, y] of [[2, 5], [14, 7], [2, 11], [14, 12], [8, 1]]) p.p(x, y, 0x5a8a3a); },
  berserker_mask: (p) => { p.ellipse(8, 9, 5, 5, 0x9a2a2a); p.line(3, 6, 1, 1, 0xe8e0d0, 2); p.line(13, 6, 15, 1, 0xe8e0d0, 2); p.rect(5, 8, 2, 2, 0x101010); p.rect(9, 8, 2, 2, 0x101010); p.p(5, 8, 0xffe060); p.p(10, 8, 0xffe060); p.rect(6, 12, 4, 1, 0x101010); },
  phoenix_feather: (p) => { p.poly([[3, 14], [5, 7], [11, 1], [11, 8]], 0xff7a2a); p.poly([[5, 11], [7, 7], [10, 4], [10, 8]], 0xffd060); p.line(3, 14, 11, 1, 0xc8301a); p.p(12, 2, 0xfff0a0); p.p(13, 5, 0xff9a3a); },
  soul_lantern: (p) => { p.rect(7, 0, 2, 2, STEEL_D); p.rect(4, 2, 8, 2, STEEL_D); p.rect(4, 4, 8, 9, 0x203028); p.rect(4, 13, 8, 2, STEEL_D); p.rect(4, 4, 1, 9, STEEL_D); p.rect(11, 4, 1, 9, STEEL_D); p.ellipse(8, 9, 2, 3, 0x50ff90); p.p(8, 8, 0xe0fff0); },
  magnet_stone: (p) => { p.ring(8, 7, 5, 0xc81e32, 3); p.ctx.clearRect(p.ox + 2, p.oy + 8, 12, 8); p.rect(3, 7, 3, 5, 0xc81e32); p.rect(10, 7, 3, 5, 0xc81e32); p.rect(3, 12, 3, 2, STEEL); p.rect(10, 12, 3, 2, STEEL); },
  merchant_seal: (p) => { p.circle(8, 8, 6, 0x9a1a2a); p.circle(8, 8, 4, 0xc8303a); p.circle(8, 8, 2, GOLD); p.p(7, 7, 0xfff0a0); p.p(2, 12, 0x9a1a2a); p.p(14, 4, 0x9a1a2a); },
  shadow_cloak: (p) => { p.poly([[6, 1], [10, 1], [14, 14], [8, 12], [2, 14]], 0x3a2050); p.poly([[6, 1], [8, 1], [8, 12], [2, 14]], 0x2a1640); p.rect(6, 2, 4, 3, 0x101018); p.p(8, 3, 0xb070ff); },
  glass_cannon: (p) => { p.rect(2, 7, 10, 5, 0x9ae0e8); p.rect(2, 7, 10, 1, 0xe0ffff); p.rect(12, 6, 3, 7, 0x7ac8d8); p.circle(5, 13, 2, WOOD_D); p.line(6, 7, 8, 11, 0x4a8a9a); p.line(8, 11, 7, 12, 0x4a8a9a); p.p(9, 9, 0xffffff); },
};

export function buildIcons(scene: Phaser.Scene): void {
  const all: Record<string, Icon> = { ...WEAPONS, ...SKILLS, ...RELICS };
  for (const [id, fn] of Object.entries(all)) {
    buildImage(scene, iconTex(id), 16, 16, (p) => fn(p), OUTLINE);
  }
}

export const ICON_IDS = [...Object.keys(WEAPONS), ...Object.keys(SKILLS), ...Object.keys(RELICS)];
