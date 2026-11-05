import { audio } from '../../core/audio';
import type { Enemy } from '../Enemy';
import { PhaseBrain } from './util';

type Phase = 'patrol' | 'advance' | 'windup' | 'recover';

/**
 * Royal Guard: heavy (no knockback, half CC), slow advance, a long two-stage
 * overhead windup, then a slam whose shockwave rolls along the ground —
 * jump or roll to avoid it. Long recovery is the punish window.
 * params: attackRange, slamRadius, windupMs, cooldownMs
 */
export class BruteBrain extends PhaseBrain<Phase> {
  phase: Phase = 'patrol';
  private flashed = false;

  init(e: Enemy): void {
    e.heavy = true;
  }

  onAggro(e: Enemy): void {
    audio.sfx('enemyAlert', { volume: 0.45, pitch: 0.55 });
    this.set(e, 'advance');
  }

  update(e: Enemy): void {
    const p = e.def.params;
    const range = p.attackRange ?? 40;
    if (e.player.state2 === 'dead') {
      e.halt();
      e.playAnim('idle');
      return;
    }
    switch (this.phase) {
      case 'patrol':
        this.patrol(e, 0.4);
        if (e.isAggro) this.set(e, 'advance');
        break;
      case 'advance': {
        const dx = e.dxToPlayer();
        if (Math.abs(dx) < range && Math.abs(e.dyToPlayer()) < 32 && this.ready(e)) {
          e.facePlayer();
          e.halt();
          e.telegraph();
          this.flashed = false;
          this.set(e, 'windup', this.windupMs(e));
          break;
        }
        if (Math.abs(dx) > range * 0.6) {
          if (e.walk(Math.sign(dx))) e.playAnim('move');
          else e.playAnim('idle');
        } else {
          e.halt();
          e.facePlayer();
          e.playAnim('idle');
        }
        if (e.distToPlayer() > (p.aggroRange ?? 180) * 2.5) this.set(e, 'patrol');
        break;
      }
      case 'windup':
        e.halt();
        // Second flash right before impact so the timing is readable.
        if (!this.flashed && this.progress(e) > 0.65) {
          this.flashed = true;
          e.setTintFill(0xffffff);
          e.scene.time.delayedCall(70, () => e.active && !e.frozen && e.clearTint());
        }
        if (this.done(e)) this.slam(e);
        break;
      case 'recover':
        e.halt();
        if (this.done(e)) this.set(e, 'advance');
        break;
      default:
        this.set(e, 'advance');
    }
  }

  private slam(e: Enemy): void {
    const p = e.def.params;
    const direct = e.meleeAttack({ reach: 24, height: e.def.h + 18, offsetY: -6, mult: 1, kb: 280 });
    const r = p.slamRadius ?? 56;
    const fx = e.centerX + e.facing * 18;
    const fy = e.body.bottom;
    e.world.juice.shake(0.007, 220);
    e.world.juice.ring(fx, fy - 2, r, 0xffd9a0, 300);
    e.world.juice.fx(fx - 10, fy, 'fx-dust');
    e.world.juice.fx(fx + 10, fy, 'fx-dust', { flipX: true });
    e.world.juice.burst(fx, fy - 2, { count: 14, tint: [0x9a8f86, 0xd8c8a0], speed: [60, 160], angle: [200, 340], life: [200, 450] });
    audio.sfx('bossSlam', { volume: 0.55, pitch: 1.3 });
    // Ground shockwave: hits grounded players near the impact, not airborne ones.
    const pl = e.player;
    if (!direct && pl.grounded && Math.abs(pl.body.bottom - fy) < 14 && Math.abs(pl.centerX - fx) < r && !pl.invulnerable) {
      e.hitPlayer(0.6, 220, `${e.def.name}'s shockwave`);
    }
    this.cooldown(e);
    this.set(e, 'recover', 950);
  }

  protected override onInterrupt(e: Enemy): void {
    this.set(e, 'recover', 600);
  }
}
