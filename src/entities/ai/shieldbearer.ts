import { audio } from '../../core/audio';
import type { Enemy } from '../Enemy';
import type { PlayerHit } from '../World';
import { PhaseBrain } from './util';

type Phase = 'patrol' | 'advance' | 'windup' | 'strike' | 'recover';

/**
 * Shield Knight: advances behind a raised shield that blocks frontal hits.
 * It turns slowly, so rolling behind it works; parries/stuns break the
 * guard. It lowers the shield to wind up a shove + strike, opening a window.
 * params: attackRange, windupMs, cooldownMs, blockFrac
 */
export class ShieldbearerBrain extends PhaseBrain<Phase> {
  phase: Phase = 'patrol';
  private turnAt = 0;

  onAggro(e: Enemy): void {
    audio.sfx('enemyAlert', { volume: 0.35, pitch: 0.8 });
    this.set(e, 'advance');
  }

  /** Shield up while patrolling/advancing; frontal hits are blocked. */
  blocks(e: Enemy, hit: PlayerHit): boolean {
    if (e.stunned || (this.phase !== 'advance' && this.phase !== 'patrol')) return false;
    if (hit.pierceArmor) return false;
    const fromFront = Math.sign(hit.kbX) === -e.facing || hit.kbX === 0 && Math.sign(e.dxToPlayer()) === e.facing;
    if (fromFront) {
      // Riposte sooner after a block.
      this.nextAttack = Math.min(this.nextAttack, e.now + 250);
      e.body.velocity.x = -e.facing * 30;
    }
    return fromFront;
  }

  update(e: Enemy): void {
    const p = e.def.params;
    const range = p.attackRange ?? 26;
    if (e.player.state2 === 'dead') {
      e.halt();
      e.playAnim('idle');
      return;
    }
    switch (this.phase) {
      case 'patrol':
        this.patrol(e, 0.35);
        if (e.isAggro) this.set(e, 'advance');
        break;
      case 'advance': {
        const dx = e.dxToPlayer();
        const want = (Math.sign(dx) || e.facing) as 1 | -1;
        // Slow turn: player behind the knight has a window.
        if (want !== e.facing) {
          if (!this.turnAt) this.turnAt = e.now + 450;
          if (e.now >= this.turnAt) {
            e.facing = want;
            this.turnAt = 0;
          }
          e.halt();
          e.playAnim('idle');
          break;
        }
        this.turnAt = 0;
        if (Math.abs(dx) < range + 6 && Math.abs(e.dyToPlayer()) < 26 && this.ready(e)) {
          e.halt();
          e.telegraph();
          this.set(e, 'windup', this.windupMs(e));
          break;
        }
        if (Math.abs(dx) > range * 0.8) {
          if (e.walk(e.facing, 0.85)) e.playAnim('move');
          else e.playAnim('idle');
        } else {
          e.halt();
          e.playAnim('idle');
        }
        if (e.distToPlayer() > (p.aggroRange ?? 170) * 2.5) this.set(e, 'patrol');
        break;
      }
      case 'windup':
        e.halt();
        if (this.done(e)) {
          e.body.velocity.x = e.facing * 120 * e.slowMult; // shove step
          e.meleeAttack({ reach: 18, height: e.def.h + 4, kb: 280 });
          audio.sfx('swingHeavy', { volume: 0.5, pitch: 0.9 });
          this.cooldown(e);
          this.set(e, 'recover', 650);
        }
        break;
      case 'recover':
        e.halt();
        if (this.done(e)) this.set(e, 'advance');
        break;
      default:
        this.set(e, 'advance');
    }
  }

  protected override onInterrupt(e: Enemy): void {
    this.set(e, 'recover', 500);
  }
}
