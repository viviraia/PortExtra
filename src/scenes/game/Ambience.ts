/**
 * Per-biome ambient particles (drips & dust, wind motes, arcane glyph motes,
 * embers). Emitters stay at the world origin and spawn inside a rectangle that
 * tracks the camera view, so particles live in world space and parallax
 * naturally with the level.
 */
import Phaser from 'phaser';
import { FX } from '../../art/keys';
import { DEPTH, GAME_H, GAME_W } from '../../config';
import type { BiomeId } from '../../data/types';

type Cfg = Phaser.Types.GameObjects.Particles.ParticleEmitterConfig;

const MARGIN = 40;

function configs(biome: BiomeId): { cfg: Cfg; depth: number; key: string }[] {
  switch (biome) {
    case 'cells':
      return [
        // Water drips falling from the ceiling.
        { key: FX.spark, depth: 650, cfg: { speedY: { min: 0, max: 10 }, gravityY: 420, lifespan: 1600, frequency: 260, quantity: 1, scaleX: 0.5, scaleY: 1, tint: 0x9cc4d6, alpha: { start: 0.8, end: 0.2 } } },
        // Slow dust motes.
        { key: FX.spark, depth: DEPTH.aboveDark, cfg: { speedX: { min: -6, max: 6 }, speedY: { min: -4, max: 6 }, lifespan: 4000, frequency: 180, quantity: 1, scale: 0.5, tint: 0xb8a890, alpha: { onEmit: () => 0, onUpdate: (_p: unknown, _k: string, t: number) => Math.sin(t * Math.PI) * 0.35 } as never, gravityY: 0 } },
      ];
    case 'ramparts':
      return [
        // Wind-blown motes / snow.
        { key: FX.spark, depth: DEPTH.aboveDark, cfg: { speedX: { min: -170, max: -90 }, speedY: { min: 10, max: 45 }, lifespan: 3200, frequency: 45, quantity: 1, scale: { min: 0.5, max: 1 }, tint: 0xd6e2ff, alpha: { start: 0.55, end: 0 }, gravityY: 0 } },
      ];
    case 'library':
      return [
        // Floating arcane glyph motes.
        { key: FX.particle, depth: DEPTH.aboveDark, cfg: { speedX: { min: -6, max: 6 }, speedY: { min: -22, max: -8 }, lifespan: 3600, frequency: 160, quantity: 1, scale: { start: 0.5, end: 0.1 }, tint: [0xb07aff, 0x7ad0ff, 0xe0c0ff], alpha: { start: 0.7, end: 0 }, blendMode: Phaser.BlendModes.ADD, gravityY: 0, rotate: { min: 0, max: 360 } } },
      ];
    case 'throne':
      return [
        // Rising embers.
        { key: FX.spark, depth: DEPTH.aboveDark, cfg: { speedX: { min: -12, max: 12 }, speedY: { min: -55, max: -20 }, lifespan: 3000, frequency: 110, quantity: 1, scale: { min: 0.5, max: 1 }, tint: [0xffb04a, 0xff6a2a, 0xffe08a], alpha: { start: 0.9, end: 0 }, blendMode: Phaser.BlendModes.ADD, gravityY: -6 } },
      ];
  }
}

export class Ambience {
  private emitters: Phaser.GameObjects.Particles.ParticleEmitter[] = [];
  private zone = new Phaser.Geom.Rectangle(0, 0, GAME_W + MARGIN * 2, GAME_H + MARGIN * 2);

  constructor(private scene: Phaser.Scene, biome: BiomeId) {
    for (const c of configs(biome)) {
      if (!scene.textures.exists(c.key)) continue;
      const em = scene.add.particles(0, 0, c.key, {
        ...c.cfg,
        emitZone: { type: 'random', source: this.zone as unknown as Phaser.Types.GameObjects.Particles.RandomZoneSource },
      });
      em.setDepth(c.depth);
      this.emitters.push(em);
    }
  }

  update(): void {
    const v = this.scene.cameras.main.worldView;
    this.zone.setTo(v.x - MARGIN, v.y - MARGIN, v.width + MARGIN * 2, v.height + MARGIN * 2);
  }
}
