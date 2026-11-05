/**
 * The Warden (cells): a hulking jailer with a chain flail.
 * Moves: Flail Slam (shockwaves both ways — jump them), Bull Charge (telegraph
 * line, stuns itself on the wall and shakes debris loose), Sweep (close
 * range, both sides), Cave-in (falling rocks). Phase 2: faster, summons rats,
 * more debris, faster shockwaves.
 */
import Phaser from 'phaser';
import { audio } from '../../core/audio';
import { Boss, BossBrain, choose, FallingRock, seq, TelegraphLine, type Action } from './Boss';
import type { World } from '../World';

class WardenBrain extends BossBrain {
  idle(b: Boss): void {
    const dx = b.dxToPlayer();
    if (Math.abs(dx) > 56) {
      b.stride(Math.sign(dx), b.phase2 ? 1.35 : 1);
      b.playBoss('move');
    } else {
      b.halt();
      b.facePlayer();
      b.playBoss('idle');
    }
  }

  rest(b: Boss): number {
    return b.ms(900, 0.6);
  }

  pick(b: Boss): Action {
    const d = Math.abs(b.dxToPlayer());
    b.minions = b.minions.filter((m) => m.active && m.alive);
    return choose(b, this.lastPick, [
      ['sweep', d < 64 ? 4 : 0, () => this.sweep(b)],
      ['slam', 3, () => this.slam(b)],
      ['charge', d > 80 ? 2.5 : 0.8, () => this.charge(b)],
      ['debris', b.phase2 ? 1.6 : 0.8, () => this.debris(b)],
      ['summon', b.phase2 && b.minions.length < 2 ? 1.5 : 0, () => this.summon(b)],
    ]);
  }

  private slam(b: Boss): Action {
    const W = b.ms(720);
    return seq(
      'slam',
      [
        { at: 0, fn: () => { b.facePlayer(); b.windup(); } },
        { at: W, fn: () => b.playBoss('attack1', true) },
        {
          at: W + 160,
          fn: () => {
            audio.sfx('bossSlam');
            b.world.juice.shake(0.01, 260);
            const fx = b.centerX + b.facing * 34;
            b.world.juice.fx(fx, b.floorY, 'fx-dust', { scale: 2 });
            b.world.juice.fx(fx, b.floorY, 'fx-dust', { scale: 2, flipX: true });
            b.frontHit(46, 54, 1.2, 280);
            b.shockwaves(fx, [-1, 1], b.phase2 ? 230 : 175, 0.75);
          },
        },
      ],
      W + 160 + b.ms(650, 0.7),
      () => b.halt(),
    );
  }

  private sweep(b: Boss): Action {
    const W = b.ms(520);
    return seq(
      'sweep',
      [
        { at: 0, fn: () => { b.facePlayer(); b.windup(); } },
        { at: W, fn: () => b.playBoss('attack3', true) },
        {
          at: W + 150,
          fn: () => {
            audio.sfx('swingHeavy');
            const bb = b.body;
            b.world.juice.ring(b.centerX, b.centerY, 56, 0xffc080, 220);
            b.hitRect(bb.left - 40, bb.bottom - 40, bb.width + 80, 40, 1.0, 260);
          },
        },
      ],
      W + 150 + b.ms(600, 0.7),
      () => b.halt(),
    );
  }

  private charge(b: Boss): Action {
    const W = b.ms(780);
    let dir = 1;
    let charging = false;
    let hitPlayer = false;
    let impactAt = -1;
    let line: TelegraphLine | null = null;
    return seq(
      'charge',
      [
        {
          at: 0,
          fn: () => {
            b.facePlayer();
            dir = b.facing;
            b.windup();
            const tx = dir > 0 ? b.arenaRight : b.arenaLeft;
            line = new TelegraphLine(b.world, () => ({ x: b.centerX, y: b.floorY - 10 }), { x: tx, y: b.floorY - 10 }, W, 0xff6040);
            b.addHazard(line);
          },
        },
        { at: W, fn: () => { charging = true; b.playBoss('attack2', true); audio.sfx('enemyAlert', { pitch: 0.6 }); } },
      ],
      W + 3000,
      (_b, t) => {
        if (!charging) {
          b.halt();
          if (Math.random() < 0.4) b.world.juice.burst(b.centerX - dir * 12, b.floorY - 2, { count: 1, tint: 0x8a7a6a, speed: [20, 60], angle: dir > 0 ? [190, 230] : [310, 350], gravity: 300 });
          return false;
        }
        if (impactAt < 0) {
          b.facing = dir as 1 | -1;
          b.body.velocity.x = dir * (b.phase2 ? 340 : 290) * b.slowMult;
          if (Math.random() < 0.6) b.world.juice.burst(b.centerX - dir * 14, b.floorY - 2, { count: 2, tint: 0x8a7a6a, speed: [30, 80], angle: [200, 340], gravity: 400 });
          if (!hitPlayer && b.frontHit(8, b.def.h, 1.3, 340)) hitPlayer = true;
          const atWall = b.wallAhead(dir) || (dir > 0 ? b.centerX >= b.arenaRight - 1 : b.centerX <= b.arenaLeft + 1);
          if (atWall || t > W + 1800) {
            impactAt = t;
            b.body.velocity.x = -dir * 60;
            b.body.velocity.y = -120;
            audio.sfx('bossSlam');
            b.world.juice.shake(0.014, 400);
            b.playBoss('hurt', true);
            const n = b.phase2 ? 5 : 3;
            for (let i = 0; i < n; i++) {
              const x = b.clampX(Phaser.Math.Between(b.arena.left + 24, b.arena.right - 24));
              b.addHazard(new FallingRock(b.world, x, b.arena.top + 8, b.floorY, 650 + i * 160, b.dmg * 0.7, 'Falling debris'));
            }
          }
          return false;
        }
        // Dazed against the wall: vulnerable window.
        b.halt();
        return t - impactAt > b.ms(1100, 0.8);
      },
      () => { line = null; },
    );
  }

  private debris(b: Boss): Action {
    const W = b.ms(650);
    return seq(
      'debris',
      [
        { at: 0, fn: () => { b.windup('bossRoar'); } },
        {
          at: W,
          fn: () => {
            b.playBoss('attack1', true);
            audio.sfx('bossSlam');
            b.world.juice.shake(0.012, 500);
            const n = b.phase2 ? 7 : 5;
            const px = b.world.player.centerX;
            for (let i = 0; i < n; i++) {
              const x = i === 0 ? b.clampX(px) : Phaser.Math.Between(b.arena.left + 20, b.arena.right - 20);
              b.addHazard(new FallingRock(b.world, x, b.arena.top + 8, b.floorY, 700 + i * 170, b.dmg * 0.7, 'Falling debris'));
            }
          },
        },
      ],
      W + 900,
      () => b.halt(),
    );
  }

  private summon(b: Boss): Action {
    const W = b.ms(600);
    return seq(
      'summon',
      [
        { at: 0, fn: () => b.windup('bossRoar') },
        { at: W, fn: () => { b.playBoss('attack3', true); b.summon('rat', 2, 4); } },
      ],
      W + 700,
      () => b.halt(),
    );
  }
}

export function createWarden(world: World, x: number, y: number): Boss {
  return new Boss(world, 'warden', x, y, { speed: 48, brain: new WardenBrain(), contactDamage: true });
}
