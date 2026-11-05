/**
 * The Sanctum backdrop: a candlelit chapel at the foot of the spire, drawn
 * entirely from existing generated textures + Graphics. The player idles by
 * a brazier on the left; the menu panel sits on the right.
 */
import Phaser from 'phaser';
import { FX, PLAYER_ANIMS, PLAYER_TEX, TILE_FRAMES, tilesTex } from '../../art/keys';
import { GAME_H, GAME_W } from '../../config';

export const FLOOR_Y = 228;
export const BRAZIER_X = 118;
export const PLAYER_X = 62;

export interface Backdrop {
  player: Phaser.GameObjects.Sprite;
  update(time: number): void;
}

export function buildBackdrop(scene: Phaser.Scene): Backdrop {
  const tiles = tilesTex('throne');
  const hasTiles = scene.textures.exists(tiles);

  // ---- back wall -------------------------------------------------------------
  const sky = scene.add.graphics().setDepth(-50);
  sky.fillStyle(0x0b0a12, 1).fillRect(0, 0, GAME_W, GAME_H);
  if (hasTiles) {
    const back = TILE_FRAMES.backWall;
    for (let y = 0; y < FLOOR_Y; y += 16) {
      for (let x = 0; x < GAME_W; x += 16) {
        const f = back[(((x * 7) ^ (y * 13)) >>> 2) % back.length];
        scene.add.image(x, y, tiles, f).setOrigin(0).setDepth(-49).setTint(0x8a7a90);
      }
    }
  }

  // ---- gothic window with the spire beyond ------------------------------------
  const wx = 88, wy = 26, ww = 64, wh = 120;
  const win = scene.add.graphics().setDepth(-45);
  // Frame
  win.fillStyle(0x1a1520, 1);
  archPath(win, wx - 5, wy - 5, ww + 10, wh + 8);
  win.fillPath();
  // Night sky
  win.fillStyle(0x161c34, 1);
  archPath(win, wx, wy, ww, wh);
  win.fillPath();
  win.fillStyle(0x1f2848, 1);
  win.fillRect(wx, wy + wh * 0.55, ww, wh * 0.45);
  // Moon
  win.fillStyle(0xe8e4d0, 1).fillCircle(wx + 46, wy + 30, 7);
  win.fillStyle(0x161c34, 1).fillCircle(wx + 49, wy + 28, 6);
  // Stars
  win.fillStyle(0xbfc6e0, 1);
  for (const [sx, sy] of [[8, 22], [20, 40], [52, 52], [12, 60], [40, 18], [30, 30], [56, 76]]) win.fillRect(wx + sx, wy + sy, 1, 1);
  // The spire silhouette rising out of view
  win.fillStyle(0x07060c, 1);
  win.fillRect(wx + 24, wy + 34, 14, wh - 34);
  win.fillTriangle(wx + 22, wy + 36, wx + 31, wy + 6, wx + 40, wy + 36);
  win.fillRect(wx + 18, wy + 70, 26, 4);
  win.fillRect(wx + 8, wy + 96, 48, wh - 96);
  win.fillStyle(0xff9a40, 1);
  win.fillRect(wx + 30, wy + 52, 2, 3);
  win.fillRect(wx + 30, wy + 82, 2, 3);
  // Mullions & tracery
  win.fillStyle(0x2a2230, 1);
  win.fillRect(wx + ww / 2 - 1, wy + 10, 2, wh);
  win.fillRect(wx, wy + 58, ww, 2);
  win.lineStyle(2, 0x2a2230, 1).strokeCircle(wx + ww / 2, wy + 24, 9);
  // Sill
  win.fillStyle(0x3a3040, 1).fillRect(wx - 8, wy + wh + 2, ww + 16, 4);

  // Moonlight shaft onto the floor
  const shaft = scene.add.graphics().setDepth(-40).setBlendMode(Phaser.BlendModes.ADD);
  shaft.fillStyle(0x6a7ab0, 0.06);
  shaft.fillPoints([
    new Phaser.Math.Vector2(wx, wy + wh),
    new Phaser.Math.Vector2(wx + ww, wy + wh),
    new Phaser.Math.Vector2(wx + ww + 30, FLOOR_Y),
    new Phaser.Math.Vector2(wx - 20, FLOOR_Y),
  ], true);

  // Pillars framing the scene
  const pil = scene.add.graphics().setDepth(-44);
  for (const px of [10, 160]) {
    pil.fillStyle(0x15121c, 1).fillRect(px - 8, 18, 16, FLOOR_Y - 18);
    pil.fillStyle(0x221c2a, 1).fillRect(px - 6, 18, 3, FLOOR_Y - 18);
    pil.fillStyle(0x0c0a12, 1).fillRect(px + 4, 18, 2, FLOOR_Y - 18);
    pil.fillStyle(0x2a2232, 1).fillRect(px - 10, FLOOR_Y - 8, 20, 8);
    pil.fillStyle(0x2a2232, 1).fillRect(px - 10, 18, 20, 6);
  }
  // Hanging banners
  const ban = scene.add.graphics().setDepth(-43);
  for (const bx of [36, 140]) {
    ban.fillStyle(0x5a1420, 1).fillRect(bx - 6, 24, 12, 44);
    ban.fillTriangle(bx - 6, 68, bx, 62, bx + 6, 68);
    ban.fillStyle(0xc9a227, 1).fillRect(bx - 6, 24, 12, 2);
    ban.fillStyle(0xc9a227, 1).fillRect(bx - 1, 36, 2, 14);
    ban.fillRect(bx - 4, 40, 8, 2);
  }

  // ---- floor -------------------------------------------------------------------
  if (hasTiles) {
    for (let x = 0; x < GAME_W; x += 16) {
      scene.add.image(x, FLOOR_Y, tiles, 14).setOrigin(0).setDepth(-30);
      for (let y = FLOOR_Y + 16; y < GAME_H; y += 16) scene.add.image(x, y, tiles, TILE_FRAMES.solidVariants[(x / 16 + y) % 4]).setOrigin(0).setDepth(-30);
    }
  } else {
    scene.add.rectangle(0, FLOOR_Y, GAME_W, GAME_H - FLOOR_Y, 0x2a2232).setOrigin(0).setDepth(-30);
  }

  // Ambient darkening + vignette
  scene.add.rectangle(0, 0, GAME_W, GAME_H, 0x05040a, 0.35).setOrigin(0).setDepth(-25);
  const vig = scene.add.graphics().setDepth(-24);
  for (let i = 0; i < 6; i++) {
    vig.fillStyle(0x000000, 0.08);
    vig.fillRect(0, 0, GAME_W, 6 + i * 4);
    vig.fillRect(0, GAME_H - 6 - i * 4, GAME_W, 6 + i * 4);
  }

  // ---- candles -----------------------------------------------------------------
  const lights: { img: Phaser.GameObjects.Image; base: number; phase: number }[] = [];
  const addGlow = (x: number, y: number, scale: number, tint: number, alpha: number, depth = -20) => {
    if (!scene.textures.exists(FX.glow)) return;
    const img = scene.add.image(x, y, FX.glow).setBlendMode(Phaser.BlendModes.ADD).setTint(tint).setScale(scale).setAlpha(alpha).setDepth(depth);
    lights.push({ img, base: alpha, phase: Math.random() * 10 });
  };
  const candles = scene.add.graphics().setDepth(-21);
  for (const [cx, h] of [[24, 10], [30, 6], [148, 8], [154, 12]] as const) {
    candles.fillStyle(0xd8d0b8, 1).fillRect(cx - 1, FLOOR_Y - h, 3, h);
    candles.fillStyle(0xffd27a, 1).fillRect(cx, FLOOR_Y - h - 3, 1, 2);
    addGlow(cx + 0.5, FLOOR_Y - h - 3, 0.5, 0xffb060, 0.5);
  }

  // ---- brazier -------------------------------------------------------------------
  const bz = scene.add.graphics().setDepth(-15);
  bz.fillStyle(0x1a1620, 1);
  bz.fillRect(BRAZIER_X - 2, FLOOR_Y - 18, 4, 18);
  bz.fillRect(BRAZIER_X - 8, FLOOR_Y - 2, 16, 2);
  bz.fillStyle(0x2c2632, 1);
  bz.fillRect(BRAZIER_X - 11, FLOOR_Y - 24, 22, 6);
  bz.fillRect(BRAZIER_X - 9, FLOOR_Y - 18, 18, 2);
  bz.fillStyle(0x4a4050, 1).fillRect(BRAZIER_X - 11, FLOOR_Y - 24, 22, 1);
  bz.fillStyle(0xff7a2a, 1).fillRect(BRAZIER_X - 8, FLOOR_Y - 26, 16, 2);
  addGlow(BRAZIER_X, FLOOR_Y - 30, 2.6, 0xff8a30, 0.55, -26);
  addGlow(BRAZIER_X, FLOOR_Y - 30, 1.0, 0xffc060, 0.6, -14);
  if (scene.textures.exists(FX.particle)) {
    scene.add
      .particles(BRAZIER_X, FLOOR_Y - 26, FX.particle, {
        x: { min: -7, max: 7 },
        speedY: { min: -60, max: -25 },
        speedX: { min: -6, max: 6 },
        lifespan: { min: 300, max: 650 },
        scale: { start: 1, end: 0 },
        tint: [0xffe08a, 0xff9a3a, 0xff5a1a],
        blendMode: Phaser.BlendModes.ADD,
        frequency: 22,
        gravityY: -30,
      })
      .setDepth(-13);
    // Drifting embers
    scene.add
      .particles(BRAZIER_X, FLOOR_Y - 30, FX.particle, {
        x: { min: -6, max: 6 },
        speedY: { min: -40, max: -15 },
        speedX: { min: -14, max: 14 },
        lifespan: { min: 1200, max: 2600 },
        scale: { start: 0.5, end: 0 },
        tint: [0xffb050, 0xff7a2a],
        blendMode: Phaser.BlendModes.ADD,
        frequency: 260,
      })
      .setDepth(-13);
  }

  // ---- the wanderer --------------------------------------------------------------
  const player = scene.add.sprite(PLAYER_X, FLOOR_Y, PLAYER_TEX, 0).setOrigin(0.5, 1).setScale(2).setDepth(-16);
  if (scene.anims.exists(PLAYER_ANIMS.idle)) player.play(PLAYER_ANIMS.idle);
  // Warm rim light from the brazier
  addGlow(PLAYER_X + 8, FLOOR_Y - 24, 1.4, 0xff9040, 0.18, -15);
  // Ground shadow
  scene.add.ellipse(PLAYER_X, FLOOR_Y, 26, 4, 0x000000, 0.45).setDepth(-17);

  return {
    player,
    update(time: number) {
      for (const l of lights) {
        const f = 0.85 + 0.1 * Math.sin(time / 90 + l.phase) + 0.05 * Math.sin(time / 33 + l.phase * 3);
        l.img.setAlpha(l.base * f);
      }
    },
  };
}

/** Pointed gothic arch path (rect with an ogival top). */
function archPath(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
  const archH = w * 0.55;
  g.beginPath();
  g.moveTo(x, y + h);
  g.lineTo(x, y + archH);
  const steps = 10;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = (Math.PI / 2) * t;
    g.lineTo(x + w / 2 - (w / 2) * Math.cos(a) * (1 - t * 0.0), y + archH - archH * Math.sin(a));
  }
  for (let i = steps; i >= 0; i--) {
    const t = i / steps;
    const a = (Math.PI / 2) * t;
    g.lineTo(x + w / 2 + (w / 2) * Math.cos(a), y + archH - archH * Math.sin(a));
  }
  g.lineTo(x + w, y + h);
  g.closePath();
}
