/**
 * Gargoyle Matriarch (ramparts): a stone mother that hunts from the air.
 * Moves: Dive Bomb (telegraph line + floor marker, then she slams into the
 * ground and is briefly vulnerable), Feather Volley (fan of stone feathers),
 * Screech (radius shown before a knockback blast). Phase 2: double volleys,
 * dive landings send shockwaves, summons imps.
 */
import Phaser from 'phaser';
import { audio } from '../../core/audio';
import { Boss, BossBrain, choose, FloorMarker, RadiusWarning, seq, TelegraphLine, type Action } from './Boss';
import type { World } from '../World';
import { TILE } from '../../config';

class MatriarchBrain extends BossBrain {
  private side = 1;

  idle(b: Boss): void {
    const p = b.world.player;
    if (Math.random() < 0.004) this.side *= -1;
    const hx = b.clampX(p.centerX + this.side * 90);
    const hy = b.arena.top + 4 * TILE + Math.sin(b.now / 400) * 10;
    b.flyToward(hx, hy, b.phase2 ? 1.3 : 1);
    b.facePlayer();
    b.playBoss('move');
  }

  rest(b: Boss): number {
    return b.ms(850, 0.65);
  }

  pick(b: Boss): Action {
    const d = b.distToPlayer();
    b.minions = b.minions.filter((m) => m.active && m.alive);
    return choose(b, this.lastPick, [
      ['dive', 3, () => this.dive(b)],
      ['volley', 3, () => this.volley(b)],
      ['screech', d < 120 ? 3 : 0.4, () => this.screech(b)],
      ['imps', b.phase2 && b.minions.length < 2 ? 1.6 : 0, () => this.imps(b)],
    ]);
  }

  private dive(b: Boss): Action {
    const RISE = 450;
    const W = b.ms(700);
    let target = { x: 0, y: 0 };
    let diving = false;
    let landedAt = -1;
    let hit = false;
    return seq(
      'dive',
      [
        {
          at: RISE,
          fn: () => {
            const p = b.world.player;
            const tx = b.clampX(p.centerX);
            target = { x: tx, y: b.groundBelow(tx, p.body.bottom - 4) };
            b.windup();
            b.addHazard(new TelegraphLine(b.world, () => ({ x: b.centerX, y: b.centerY }), { x: tx, y: target.y - 6 }, W, 0xff4040));
            b.addHazard(new FloorMarker(b.world, tx, target.y, W + 300, 0xff4040, 50));
          },
        },
        { at: RISE + W, fn: () => { diving = true; b.playBoss('attack1', true); audio.sfx('enemyAlert', { pitch: 0.7 }); } },
      ],
      RISE + W + 4000,
      (_b, t) => {
        if (t < RISE) {
          b.flyToward(b.centerX, b.arena.top + 2 * TILE, 1.6);
          return false;
        }
        if (!diving) {
          b.body.velocity.scale(0.85);
          return false;
        }
        if (landedAt < 0) {
          const dx = target.x - b.centerX;
          const dy = target.y - b.body.bottom;
          const len = Math.hypot(dx, dy) || 1;
          const sp = (b.phase2 ? 470 : 410) * b.slowMult;
          b.body.velocity.set((dx / len) * sp, (dy / len) * sp);
          if (!hit && b.hitRect(b.body.left, b.body.top, b.body.width, b.body.height, 1.25, 300)) hit = true;
          if (dy <= 2 || b.body.blocked.down || t > RISE + W + 1500) {
            landedAt = t;
            b.body.velocity.set(0, 0);
            audio.sfx('bossSlam');
            b.world.juice.shake(0.012, 350);
            b.world.juice.fx(b.centerX, b.body.bottom, 'fx-dust', { scale: 2.2 });
            b.world.juice.fx(b.centerX, b.body.bottom, 'fx-dust', { scale: 2.2, flipX: true });
            b.world.juice.burst(b.centerX, b.body.bottom, { count: 14, tint: [0x9aa0b0, 0x5a6070], speed: [60, 160], angle: [200, 340], gravity: 500 });
            if (!hit) b.hitRect(b.body.left - 18, b.body.bottom - 24, b.body.width + 36, 24, 1.0, 260);
            if (b.phase2 && Math.abs(b.body.bottom - b.floorY) < 6) b.shockwaves(b.centerX, [-1, 1], 200, 0.6, 0x9ad0ff);
            b.playBoss('hurt', true);
          }
          return false;
        }
        // Stuck in the stones for a moment: punish window.
        b.body.velocity.set(0, 0);
        return t - landedAt > b.ms(1000, 0.75);
      },
    );
  }

  private volley(b: Boss): Action {
    const W = b.ms(620);
    const fire = () => {
      b.playBoss('attack2', true);
      audio.sfx('throw', { pitch: 0.8 });
      const p = b.world.player;
      const n = b.phase2 ? 7 : 5;
      const spread = Phaser.Math.DegToRad(b.phase2 ? 70 : 55);
      const base = Math.atan2(p.centerY - b.centerY, p.centerX - b.centerX);
      for (let i = 0; i < n; i++) {
        const a = base - spread / 2 + (spread * i) / (n - 1);
        b.shoot('feather', 190, { dirX: Math.cos(a), dirY: Math.sin(a), mult: 0.7, lifeMs: 2600 });
      }
    };
    const steps = [
      { at: 0, fn: () => { b.facePlayer(); b.windup(); } },
      { at: W, fn: fire },
    ];
    if (b.phase2) steps.push({ at: W + 450, fn: fire });
    return seq('volley', steps, W + (b.phase2 ? 1000 : 650), () => { b.body.velocity.scale(0.9); });
  }

  private screech(b: Boss): Action {
    const W = b.ms(780);
    const R = 104;
    return seq(
      'screech',
      [
        {
          at: 0,
          fn: () => {
            b.windup();
            b.addHazard(new RadiusWarning(b.world, () => ({ x: b.centerX, y: b.centerY }), R, W, 0xff5050));
          },
        },
        {
          at: W,
          fn: () => {
            b.playBoss('attack3', true);
            audio.sfx('bossRoar', { pitch: 1.4 });
            b.world.juice.ring(b.centerX, b.centerY, R, 0xffd0d0, 350);
            b.world.juice.ring(b.centerX, b.centerY, R * 0.6, 0xffffff, 250);
            b.world.juice.shake(0.008, 300);
            if (b.distToPlayer() < R) b.world.damagePlayer(b.dmg * 0.6, { x: b.centerX, y: b.centerY }, 'Screech', { kb: 380, unblockable: true });
          },
        },
      ],
      W + 650,
      () => { b.body.velocity.scale(0.85); },
    );
  }

  private imps(b: Boss): Action {
    const W = b.ms(600);
    return seq(
      'imps',
      [
        { at: 0, fn: () => b.windup('bossRoar') },
        { at: W, fn: () => { b.playBoss('attack3', true); b.summon('imp', 2, 3); } },
      ],
      W + 700,
      () => { b.body.velocity.scale(0.85); },
    );
  }
}

export function createMatriarch(world: World, x: number, y: number): Boss {
  const b = new Boss(world, 'gargoyle_matriarch', x, y - 3 * TILE, { speed: 95, flying: true, brain: new MatriarchBrain(), contactDamage: false });
  return b;
}
