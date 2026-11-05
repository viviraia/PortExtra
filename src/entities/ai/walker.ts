import { audio } from '../../core/audio';
import type { Enemy } from '../Enemy';
import { PhaseBrain } from './util';

type Phase = 'patrol' | 'chase' | 'windup' | 'recover';

/**
 * Shambler: patrols, chases when aggro, telegraphs then swings with a small
 * forward lurch. params: aggroRange, attackRange, windupMs, cooldownMs, reach
 */
export class WalkerBrain extends PhaseBrain<Phase> {
  phase: Phase = 'patrol';

  onAggro(e: Enemy): void {
    audio.sfx('enemyAlert', { volume: 0.35 });
    this.set(e, 'chase');
  }

  update(e: Enemy): void {
    const p = e.def.params;
    const range = p.attackRange ?? 22;
    if (e.player.state2 === 'dead') {
      e.halt();
      e.playAnim('idle');
      return;
    }
    switch (this.phase) {
      case 'patrol':
        this.patrol(e);
        if (e.isAggro) this.set(e, 'chase');
        break;
      case 'chase': {
        const dx = e.dxToPlayer();
        const dy = e.dyToPlayer();
        if (Math.abs(dx) < range + 4 && Math.abs(dy) < 26 && this.ready(e)) {
          e.facePlayer();
          e.halt();
          e.telegraph();
          this.set(e, 'windup', this.windupMs(e));
          break;
        }
        if (Math.abs(dx) > range * 0.75) {
          if (e.walk(Math.sign(dx))) e.playAnim('move');
          else e.playAnim('idle');
        } else {
          e.halt();
          e.facePlayer();
          e.playAnim('idle');
        }
        if (e.distToPlayer() > (p.aggroRange ?? 140) * 2.5) this.set(e, 'patrol');
        break;
      }
      case 'windup':
        e.halt();
        if (this.done(e)) {
          e.body.velocity.x = e.facing * 70 * e.slowMult; // lurch
          e.meleeAttack({ reach: p.reach ?? 16, height: e.def.h + 6 });
          this.cooldown(e);
          this.set(e, 'recover', 420);
        }
        break;
      case 'recover':
        e.halt();
        if (this.done(e)) this.set(e, 'chase');
        break;
    }
  }

  protected override onInterrupt(e: Enemy): void {
    this.set(e, 'recover', 300);
  }
}
