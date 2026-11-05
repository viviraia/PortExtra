/**
 * Cheap 2D lighting: a screen-sized darkness RenderTexture with light stamps
 * erased out of it each frame. Lights are registered with a world position
 * source so torches, the player, projectiles and pickups can glow.
 */
import Phaser from 'phaser';
import { FX } from '../../art/keys';
import { GAME_H, GAME_W } from '../../config';

export interface LightSource {
  x: number;
  y: number;
  radius: number;
  /** 0..1 */
  intensity?: number;
  flicker?: boolean;
  /** Optional colored additive glow drawn over the scene. */
  color?: number;
}

/** The darkness layer renders at 1/LIGHT_SCALE resolution and is upscaled with linear filtering. */
const LIGHT_SCALE = 2;

export class Lighting {
  private rt: Phaser.GameObjects.RenderTexture;
  private stamps: Phaser.GameObjects.Image[] = [];
  private batch: Phaser.GameObjects.Image[] = [];
  private glowLayer: Phaser.GameObjects.Image[] = [];
  private lights = new Set<() => LightSource | null>();
  enabled = true;

  constructor(private scene: Phaser.Scene, private darkness: number, private tint = 0x05040a) {
    this.rt = scene.add
      .renderTexture(0, 0, Math.ceil(GAME_W / LIGHT_SCALE), Math.ceil(GAME_H / LIGHT_SCALE))
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setScale(LIGHT_SCALE)
      .setDepth(800);
    // Smooth light falloff (the rest of the game stays nearest-neighbour).
    this.rt.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
  }

  /** Register a light; the callback returns null when the light should be skipped/removed. */
  add(src: () => LightSource | null): () => void {
    this.lights.add(src);
    return () => this.lights.delete(src);
  }

  update(time: number): void {
    if (!this.enabled || this.darkness <= 0) {
      this.rt.setVisible(false);
      return;
    }
    this.rt.setVisible(true);
    const cam = this.scene.cameras.main;
    this.rt.clear();
    this.rt.fill(this.tint, this.darkness);
    let gi = 0;
    let si = 0;
    const batch = this.batch;
    batch.length = 0;
    for (const fn of this.lights) {
      const l = fn();
      if (!l) continue;
      const sx = l.x - cam.worldView.x;
      const sy = l.y - cam.worldView.y;
      if (sx < -l.radius || sy < -l.radius || sx > GAME_W + l.radius || sy > GAME_H + l.radius) continue;
      const fl = l.flicker ? 0.92 + 0.08 * Math.sin(time / 90 + l.x * 0.37) + 0.04 * Math.sin(time / 37 + l.y) : 1;
      const r = l.radius * fl;
      let st = this.stamps[si];
      if (!st) {
        st = this.scene.make.image({ x: 0, y: 0, key: FX.glow, add: false });
        this.stamps[si] = st;
      }
      si++;
      st.setPosition(sx / LIGHT_SCALE, sy / LIGHT_SCALE)
        .setScale((r * 2) / 64 / LIGHT_SCALE)
        .setAlpha(l.intensity ?? 1);
      batch.push(st);
      if (l.color !== undefined) {
        let g = this.glowLayer[gi];
        if (!g) {
          g = this.scene.add.image(0, 0, FX.glow).setBlendMode(Phaser.BlendModes.ADD).setDepth(801).setScrollFactor(0);
          this.glowLayer[gi] = g;
        }
        g.setVisible(true).setPosition(sx, sy).setTint(l.color).setScale((r * 1.2) / 64).setAlpha(0.22 * (l.intensity ?? 1) * fl);
        gi++;
      }
    }
    // One batched erase for every light instead of a flush per light.
    if (batch.length) this.rt.erase(batch);
    for (let i = gi; i < this.glowLayer.length; i++) this.glowLayer[i].setVisible(false);
  }

  destroy(): void {
    this.rt.destroy();
    this.stamps.forEach((s) => s.destroy());
    this.stamps = [];
    this.glowLayer.forEach((g) => g.destroy());
    this.lights.clear();
  }
}
