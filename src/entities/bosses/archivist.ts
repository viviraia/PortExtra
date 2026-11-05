/**
 * The Archivist (library): a floating scholar-lich.
 * Moves: Book Barrage (slow homing ink orbs), Summoning Circles (glyphs
 * appear under you, then erupt), Page Step (teleport between lecterns).
 * Phase 2: faster/larger barrages, three circles, and mirror-image clones
 * that cast alongside it.
 */
import Phaser from 'phaser';
import { bossAnim, bossTex } from '../../art/keys';
import { audio } from '../../core/audio';
import { TILE } from '../../config';
import { Boss, BossBrain, choose, Eruption, seq, type Action, type Hazard } from './Boss';
import type { World } from '../World';

/** Mirror image that casts a couple of orbs, then fades. Not hittable. */
class Clone implements Hazard {
  private s: Phaser.GameObjects.Sprite;
  private t0: number;
  private fired = 0;
  constructor(private b: Boss, x: number, y: number) {
    this.t0 = b.now;
    this.s = b.world.stage.add.sprite(x, y, bossTex(b.bossDef.id)).setOrigin(0.5, 1).setDepth(404).setAlpha(0).setTint(0xc8a0ff);
    const idle = bossAnim(b.bossDef.id, 'idle');
    if (b.scene.anims.exists(idle)) this.s.play(idle);
    b.world.stage.tweens.add({ targets: this.s, alpha: 0.6, duration: 300 });
    b.world.juice.fx(x, y - 30, 'fx-smoke', { scale: 2, tint: 0xb070ff });
  }
  update(_dt: number, now: number): boolean {
    const t = now - this.t0;
    const p = this.b.world.player;
    this.s.setFlipX(p.centerX < this.s.x);
    const times = [700, 1200];
    if (this.fired < times.length && t >= times[this.fired]) {
      this.fired++;
      const a1 = bossAnim(this.b.bossDef.id, 'attack1');
      if (this.b.scene.anims.exists(a1)) this.s.play(a1);
      const sx = this.s.x, sy = this.s.y - 40;
      const dx = p.centerX - sx, dy = p.centerY - sy;
      const len = Math.hypot(dx, dy) || 1;
      audio.sfx('magic', { volume: 0.4, pitch: 1.2 });
      this.b.world.projectiles.fire({ owner: 'enemy', key: 'orb', x: sx, y: sy, vx: (dx / len) * 120, vy: (dy / len) * 120, damage: this.b.dmg * 0.5, cause: 'Mirror image', lifeMs: 3000, glow: 0xb070ff, radius: 4 });
    }
    if (t > 1700) {
      this.s.setAlpha(Math.max(0, 0.6 - (t - 1700) / 400));
      return t < 2100;
    }
    return true;
  }
  destroy(): void {
    this.s.destroy();
  }
}

class ArchivistBrain extends BossBrain {
  private home = 0;
  points: { x: number; y: number }[] = [];

  private ensurePoints(b: Boss): void {
    if (this.points.length) return;
    const room = b.world.floor.roomBounds(b.roomIndex);
    const pt = (tx: number, ty: number) => ({ x: room.x + tx * TILE + TILE / 2, y: room.y + ty * TILE });
    // Feet positions (sprite origin is bottom-center) hovering in open air,
    // all within jump reach of the floor or the side platforms so melee builds can hit it.
    this.points = [pt(11, 16), pt(28, 16), pt(15, 19), pt(24, 19), pt(19, 19)];
    this.home = 4;
  }

  idle(b: Boss): void {
    this.ensurePoints(b);
    const h = this.points[this.home];
    b.flyToward(h.x, h.y - b.def.h / 2 + Math.sin(b.now / 350) * 6, 0.8);
    b.facePlayer();
    b.playBoss('idle');
  }

  rest(b: Boss): number {
    return b.ms(950, 0.65);
  }

  pick(b: Boss): Action {
    this.ensurePoints(b);
    return choose(b, this.lastPick, [
      ['barrage', 3, () => this.barrage(b)],
      ['circles', 3, () => this.circles(b)],
      ['teleport', b.distToPlayer() < 70 ? 4 : 1.5, () => this.teleport(b)],
      ['clones', b.phase2 ? 2.2 : 0, () => this.clones(b)],
    ]);
  }

  private teleport(b: Boss): Action {
    const p = b.world.player;
    // Prefer a point far from the player.
    const options = this.points.map((pt, i) => ({ i, d: Math.hypot(pt.x - p.centerX, pt.y - p.centerY) })).filter((o) => o.i !== this.home);
    options.sort((a, c) => c.d - a.d);
    const next = b.world.rng.pick(options.slice(0, 2)).i;
    return seq(
      'teleport',
      [
        {
          at: 0,
          fn: () => {
            b.playBoss('attack3', true);
            audio.sfx('portal', { volume: 0.5, pitch: 1.3 });
            b.world.juice.burst(b.centerX, b.centerY, { count: 16, tint: [0xb070ff, 0xffffff], speed: [30, 120], gravity: -40, blendAdd: true });
            b.world.stage.tweens.add({ targets: b, alpha: 0.1, duration: 260 });
          },
        },
        {
          at: 340,
          fn: () => {
            this.home = next;
            const pt = this.points[next];
            b.body.reset(pt.x, pt.y);
            b.world.juice.burst(b.centerX, b.centerY, { count: 16, tint: [0xb070ff, 0xffffff], speed: [30, 120], gravity: -40, blendAdd: true });
            b.world.stage.tweens.add({ targets: b, alpha: 1, duration: 260 });
          },
        },
      ],
      700,
      () => { b.body.velocity.set(0, 0); },
      () => b.setAlpha(1),
    );
  }

  private barrage(b: Boss): Action {
    const W = b.ms(580);
    const n = b.phase2 ? 5 : 3;
    const gap = b.phase2 ? 140 : 190;
    const steps = [{ at: 0, fn: () => { b.facePlayer(); b.windup(); } }, { at: W, fn: () => b.playBoss('attack1', true) }];
    for (let i = 0; i < n; i++) {
      steps.push({
        at: W + 80 + i * gap,
        fn: () => {
          audio.sfx('magic', { volume: 0.5 });
          // Launch upward in a fan, then the orbs curve toward the player.
          const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.45 + (b.facing > 0 ? 0.25 : -0.25);
          b.shoot('ink', b.phase2 ? 125 : 110, { dirX: Math.cos(a), dirY: Math.sin(a), homing: b.phase2 ? 1.9 : 1.5, lifeMs: 3400, mult: 0.55, glow: 0xb070ff, offsetY: -10 });
        },
      });
    }
    return seq('barrage', steps, W + 80 + n * gap + 450, () => { b.body.velocity.scale(0.85); });
  }

  private circles(b: Boss): Action {
    const W = b.ms(520);
    const delay = b.ms(950, 0.85);
    return seq(
      'circles',
      [
        { at: 0, fn: () => b.windup() },
        {
          at: W,
          fn: () => {
            b.playBoss('attack2', true);
            audio.sfx('magic', { pitch: 0.6 });
            const p = b.world.player;
            const xs = b.phase2 ? [p.centerX, p.centerX - 56, p.centerX + 56] : [p.centerX];
            for (const x of xs) {
              const cx = Phaser.Math.Clamp(x, b.arena.left + 18, b.arena.right - 18);
              b.addHazard(new Eruption(b.world, cx, b.groundBelow(cx, p.body.bottom - 4), delay, b.dmg * 0.8, 'Summoning circle'));
            }
          },
        },
        {
          // A follow-up circle where the player went.
          at: W + 650,
          fn: () => {
            const p = b.world.player;
            const cx = Phaser.Math.Clamp(p.centerX, b.arena.left + 18, b.arena.right - 18);
            b.addHazard(new Eruption(b.world, cx, b.groundBelow(cx, p.body.bottom - 4), delay, b.dmg * 0.8, 'Summoning circle'));
          },
        },
      ],
      W + 650 + 400,
      () => { b.body.velocity.scale(0.85); },
    );
  }

  private clones(b: Boss): Action {
    const W = b.ms(550);
    return seq(
      'clones',
      [
        { at: 0, fn: () => b.windup('bossRoar') },
        {
          at: W,
          fn: () => {
            b.playBoss('attack3', true);
            const others = this.points.filter((_p, i) => i !== this.home);
            b.world.rng.shuffle(others);
            for (const pt of others.slice(0, 2)) b.addHazard(new Clone(b, pt.x, pt.y));
          },
        },
      ],
      W + 900,
      () => { b.body.velocity.scale(0.85); },
    );
  }
}

export function createArchivist(world: World, x: number, y: number): Boss {
  return new Boss(world, 'archivist', x, y - 3 * TILE, { speed: 70, flying: true, brain: new ArchivistBrain(), contactDamage: false });
}
