import type { AiBrain } from './types';
import type { Enemy } from '../Enemy';

type Phase = 'patrol' | 'chase' | 'windup' | 'strike' | 'recover';

/**
 * Reference brain: patrols, chases when aggro, telegraphs then swings.
 * params: aggroRange, attackRange, windupMs, cooldownMs, reach
 */
export class WalkerBrain implements AiBrain {
  phase: Phase = 'patrol';
  until = 0;
  nextAttack = 0;
  patrolFlip = 0;

  update(e: Enemy): void {
    const p = e.def.params;
    const now = e.now;
    const range = p.attackRange ?? 22;
    switch (this.phase) {
      case 'patrol': {
        e.playAnim('move');
        if (!e.walk(e.facing, 0.5) || now > this.patrolFlip) {
          e.facing = (e.facing * -1) as 1 | -1;
          this.patrolFlip = now + 2000 + Math.random() * 2500;
        }
        if (e.isAggro) this.phase = 'chase';
        break;
      }
      case 'chase': {
        const dx = e.dxToPlayer();
        const dy = e.dyToPlayer();
        if (Math.abs(dx) < range && Math.abs(dy) < 28 && now >= this.nextAttack) {
          e.facePlayer();
          e.halt();
          e.telegraph();
          this.phase = 'windup';
          this.until = now + (p.windupMs ?? 450);
          break;
        }
        if (Math.abs(dx) > range * 0.7) {
          if (!e.walk(Math.sign(dx))) e.playAnim('idle');
          else e.playAnim('move');
        } else {
          e.halt();
          e.facePlayer();
          e.playAnim('idle');
        }
        if (e.distToPlayer() > (p.aggroRange ?? 140) * 2.2) this.phase = 'patrol';
        break;
      }
      case 'windup':
        e.halt();
        if (now >= this.until) {
          e.meleeAttack({ reach: p.reach ?? 16, height: e.def.h + 4 });
          this.phase = 'recover';
          this.until = now + 380;
          this.nextAttack = now + (p.cooldownMs ?? 1100) * e.cooldownMult;
        }
        break;
      case 'recover':
        e.halt();
        if (now >= this.until) this.phase = 'chase';
        break;
      default:
        this.phase = 'chase';
    }
  }

  interrupt(): void {
    this.phase = 'recover';
    this.until = 0;
  }
}
