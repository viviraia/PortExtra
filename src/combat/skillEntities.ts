/**
 * Persistent, per-frame things spawned by skills (turrets, traps, clouds,
 * orbiting blades, meteors, dashes, buffs) plus status-effect visuals on
 * enemies. Owned by PlayerCombat, ticked from PlayerCombat.update, and torn
 * down when the scene shuts down.
 */
import Phaser from 'phaser';
import { FX } from '../art/keys';
import { STATUS_COLORS } from '../art/palette';
import type { StatusId } from '../data/types';
import type { World } from '../entities/World';

export interface SkillEntity {
  /** Return false when finished; destroy() is then called. */
  update(dt: number, now: number): boolean;
  destroy(): void;
}

const VISUAL_STATUSES: StatusId[] = ['burn', 'poison', 'bleed', 'stun', 'freeze'];

export class SkillEntitySystem {
  private list: SkillEntity[] = [];
  private emitters = new Map<StatusId, Phaser.GameObjects.Particles.ParticleEmitter>();
  private nextStatusFx = 0;
  private destroyed = false;

  constructor(private world: World) {
    world.stage.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  add<T extends SkillEntity>(e: T): T {
    this.list.push(e);
    return e;
  }

  get count(): number {
    return this.list.length;
  }

  update(dt: number): void {
    if (this.destroyed) return;
    const now = this.world.now;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      let alive = false;
      try {
        alive = e.update(dt, now);
      } catch (err) {
        console.warn('skill entity failed', err);
      }
      if (!alive) {
        e.destroy();
        this.list.splice(i, 1);
      }
    }
    if (now >= this.nextStatusFx) {
      this.nextStatusFx = now + 110;
      this.statusVisuals();
    }
  }

  private emitter(s: StatusId): Phaser.GameObjects.Particles.ParticleEmitter | null {
    let em = this.emitters.get(s);
    if (em) return em;
    const scene = this.world.stage;
    if (!scene.textures.exists(FX.particle)) return null;
    const rising = s === 'burn';
    const cfg: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig = {
      speed: { min: 6, max: 24 },
      angle: rising ? { min: 250, max: 290 } : s === 'stun' ? { min: 0, max: 360 } : { min: 60, max: 120 },
      lifespan: { min: 250, max: 520 },
      scale: { start: s === 'stun' ? 0.6 : 0.75, end: 0 },
      gravityY: rising ? -60 : s === 'stun' ? 0 : 80,
      tint: STATUS_COLORS[s],
      blendMode: s === 'burn' || s === 'stun' || s === 'freeze' ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL,
      emitting: false,
    };
    em = scene.add.particles(0, 0, FX.particle, cfg);
    em.setDepth(610);
    this.emitters.set(s, em);
    return em;
  }

  /** Small particles drifting off enemies that carry a status. */
  private statusVisuals(): void {
    for (const e of this.world.enemies) {
      if (!e.alive || !e.visible) continue;
      const b = e.body;
      for (const s of VISUAL_STATUSES) {
        if (!e.hasStatus(s)) continue;
        if (s === 'freeze' && Math.random() < 0.6) continue;
        const em = this.emitter(s);
        if (!em) continue;
        if (s === 'stun') {
          em.emitParticleAt(b.center.x + Phaser.Math.Between(-5, 5), b.top - 3, 1);
        } else {
          em.emitParticleAt(Phaser.Math.Between(b.left, b.right), Phaser.Math.Between(b.top + 2, b.bottom - 2), s === 'burn' ? 2 : 1);
        }
      }
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const e of this.list) {
      try {
        e.destroy();
      } catch {
        /* scene already gone */
      }
    }
    this.list = [];
    for (const em of this.emitters.values()) em.destroy();
    this.emitters.clear();
  }
}
