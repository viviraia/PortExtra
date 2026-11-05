/**
 * The Hollow King (throne): the crowned husk at the top of the spire.
 * Moves: Sword Combo (2 lunging swings, 3 in phase 2), Leaping Slam
 * (landing marker, shockwaves both ways), Orb Rain (marked orbs fall from
 * the ceiling). Phase 2: dark-orb spirals and shorter recovery.
 */
import Phaser from 'phaser';
import { audio } from '../../core/audio';
import { GRAVITY } from '../../config';
import { Boss, BossBrain, choose, FloorMarker, OrbDrop, seq, type Action, type SeqStep } from './Boss';
import type { World } from '../World';

class HollowKingBrain extends BossBrain {
  idle(b: Boss): void {
    const dx = b.dxToPlayer();
    if (Math.abs(dx) > 50) {
      b.stride(Math.sign(dx), b.phase2 ? 1.3 : 1);
      b.playBoss('move');
    } else {
      b.halt();
      b.facePlayer();
      b.playBoss('idle');
    }
  }

  rest(b: Boss): number {
    return b.ms(800, 0.6);
  }

  pick(b: Boss): Action {
    const d = Math.abs(b.dxToPlayer());
    return choose(b, this.lastPick, [
      ['combo', d < 110 ? 4 : 0.5, () => this.combo(b)],
      ['leap', d > 90 ? 3 : 1.2, () => this.leap(b)],
      ['rain', 2, () => this.rain(b)],
      ['spiral', b.phase2 ? 2.5 : 0, () => this.spiral(b)],
    ]);
  }

  private combo(b: Boss): Action {
    const swings = b.phase2 ? 3 : 2;
    const steps: SeqStep[] = [];
    let t = 0;
    let lungeUntil = 0;
    for (let i = 0; i < swings; i++) {
      const wind = i === 0 ? b.ms(540) : b.ms(360, 0.9);
      steps.push({
        at: t,
        fn: () => {
          b.facePlayer();
          if (i === 0) b.windup();
          else {
            b.playBoss('windup', true);
            b.setTint(0xff7070);
            b.world.stage.time.delayedCall(90, () => b.alive && b.clearTint());
            audio.sfx('enemyWindup', { volume: 0.5, pitch: 1.2 });
          }
        },
      });
      t += wind;
      const hitT = t + 120;
      steps.push({
        at: t,
        fn: () => {
          b.playBoss(i % 2 ? 'attack2' : 'attack1', true);
          audio.sfx('swingHeavy');
          lungeUntil = b.now + 160;
        },
      });
      steps.push({ at: hitT, fn: () => { b.frontHit(46, 52, 1.0, 260); b.world.juice.shake(0.004, 100); } });
      t = hitT + 260;
    }
    return seq('combo', steps, t + b.ms(450, 0.6), () => {
      if (b.now < lungeUntil) b.stride(b.facing, 3.2);
      else b.halt();
    });
  }

  private leap(b: Boss): Action {
    const W = b.ms(620);
    let marker: FloorMarker | null = null;
    let jumped = false;
    let landedAt = -1;
    let jumpT = 0;
    return seq(
      'leap',
      [
        {
          at: 0,
          fn: () => {
            b.facePlayer();
            b.windup();
            const tx = b.clampX(b.world.player.centerX);
            marker = new FloorMarker(b.world, tx, b.floorY, W + 900, 0xff4040, 70);
            b.addHazard(marker);
          },
        },
        {
          at: W,
          fn: () => {
            const m = marker as FloorMarker | null;
            const tx = m ? m.x : b.world.player.centerX;
            const vy = -470;
            const flight = (2 * -vy) / GRAVITY;
            b.body.velocity.y = vy;
            b.body.velocity.x = Phaser.Math.Clamp((tx - b.centerX) / flight, -320, 320);
            b.facing = tx >= b.centerX ? 1 : -1;
            b.playBoss('move', true);
            audio.sfx('jump', { pitch: 0.5 });
            jumped = true;
            jumpT = b.now;
          },
        },
      ],
      W + 3500,
      (_b, t) => {
        if (!jumped) {
          b.halt();
          return false;
        }
        if (landedAt < 0) {
          if (b.now - jumpT > 250 && b.body.velocity.y > 0) b.playBoss('attack1');
          if (b.now - jumpT > 200 && b.grounded) {
            landedAt = t;
            b.body.velocity.x = 0;
            b.playBoss('attack1', true);
            audio.sfx('bossSlam');
            b.world.juice.shake(0.014, 350);
            b.world.juice.fx(b.centerX, b.body.bottom, 'fx-dust', { scale: 2.4 });
            b.world.juice.fx(b.centerX, b.body.bottom, 'fx-dust', { scale: 2.4, flipX: true });
            b.hitRect(b.body.left - 26, b.body.bottom - 30, b.body.width + 52, 30, 1.3, 300);
            if (Math.abs(b.body.bottom - b.floorY) < 20) b.shockwaves(b.centerX, [-1, 1], b.phase2 ? 250 : 200, 0.8, 0xd84060);
          }
          return t > W + 2500;
        }
        b.halt();
        return t - landedAt > b.ms(750, 0.6);
      },
    );
  }

  private rain(b: Boss): Action {
    const W = b.ms(650);
    return seq(
      'rain',
      [
        { at: 0, fn: () => b.windup() },
        {
          at: W,
          fn: () => {
            b.playBoss('attack3', true);
            audio.sfx('magic', { pitch: 0.5 });
            const n = b.phase2 ? 9 : 6;
            const span = b.arena.width - 32;
            const top = b.arena.top + 24;
            const xs: number[] = [];
            for (let i = 0; i < n; i++) xs.push(b.arena.left + 16 + (span * (i + 0.5)) / n + Phaser.Math.Between(-8, 8));
            b.world.rng.shuffle(xs);
            xs.unshift(Phaser.Math.Clamp(b.world.player.centerX, b.arena.left + 16, b.arena.right - 16));
            xs.forEach((x, i) => b.addHazard(new OrbDrop(b.world, x, top, 550 + i * 140, b.dmg * 0.7, 'Dark orb')));
          },
        },
      ],
      W + 1500,
      () => b.halt(),
    );
  }

  private spiral(b: Boss): Action {
    const W = b.ms(520);
    const wave = (k: number) => () => {
      b.playBoss('attack3', true);
      audio.sfx('magic', { volume: 0.5, pitch: 0.7 });
      const n = 10;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + k * 0.32;
        b.world.projectiles.fire({ owner: 'enemy', key: 'darkorb', x: b.centerX, y: b.centerY - 6, vx: Math.cos(a) * 95, vy: Math.sin(a) * 95, damage: b.dmg * 0.6, cause: 'Dark orb', lifeMs: 3800, glow: 0xd84060, radius: 5 });
      }
    };
    return seq(
      'spiral',
      [
        { at: 0, fn: () => b.windup('bossRoar') },
        { at: W, fn: wave(0) },
        { at: W + 380, fn: wave(1) },
        { at: W + 760, fn: wave(2) },
      ],
      W + 1200,
      () => b.halt(),
    );
  }
}

export function createHollowKing(world: World, x: number, y: number): Boss {
  return new Boss(world, 'hollow_king', x, y, { speed: 72, brain: new HollowKingBrain(), contactDamage: true });
}
