import { audio } from '../../core/audio';
import type { Enemy } from '../Enemy';
import { PhaseBrain } from './util';

type Phase = 'patrol' | 'chase' | 'windup' | 'leap' | 'recover';

/**
 * Plague Rat: scurries fast, crouches briefly, then leaps at the player.
 * params: attackRange (leap trigger distance), jumpVx, jumpVy, windupMs, cooldownMs
 */
export class JumperBrain extends PhaseBrain<Phase> {
  phase: Phase = 'patrol';

  onAggro(e: Enemy): void {
    audio.sfx('enemyAlert', { volume: 0.25, pitch: 1.6 });
    this.set(e, 'chase');
  }

  update(e: Enemy): void {
    const p = e.def.params;
    if (e.player.state2 === 'dead' && this.phase !== 'leap') {
      e.halt();
      e.playAnim('idle');
      return;
    }
    switch (this.phase) {
      case 'patrol':
        this.patrol(e, 0.35);
        if (e.isAggro) this.set(e, 'chase');
        break;
      case 'chase': {
        const dx = e.dxToPlayer();
        const dy = e.dyToPlayer();
        const range = p.attackRange ?? 70;
        if (this.ready(e) && e.grounded && Math.abs(dx) < range && Math.abs(dx) > 10 && dy > -50 && dy < 30 && e.seesPlayerCached()) {
          e.facePlayer();
          e.halt();
          e.telegraph();
          this.set(e, 'windup', this.windupMs(e));
          break;
        }
        if (Math.abs(dx) > 14) {
          if (e.walk(Math.sign(dx))) e.playAnim('move');
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
          const dx = e.dxToPlayer();
          const dist = Math.min(Math.abs(dx), p.attackRange ?? 70);
          // Scale horizontal speed so the rat lands near the player instead of overshooting.
          const vx = (p.jumpVx ?? 170) * Math.max(0.55, dist / (p.attackRange ?? 70));
          e.body.setVelocity(e.facing * vx * e.slowMult, (p.jumpVy ?? -200) * (e.slowMult < 1 ? 0.6 : 1));
          e.playAnim('attack', true);
          audio.sfx('swing', { volume: 0.3, pitch: 1.7 });
          this.hitDone = false;
          this.set(e, 'leap', 1200);
        }
        break;
      case 'leap':
        if (!this.hitDone && e.touchingPlayer(2)) {
          this.hitDone = true;
          e.hitPlayer(1, 150);
        }
        if ((e.grounded && e.now - this.started > 120) || this.done(e)) {
          e.body.velocity.x = 0;
          this.cooldown(e);
          this.set(e, 'recover', 380);
        }
        break;
      case 'recover':
        e.halt();
        e.playAnim('idle');
        if (this.done(e)) this.set(e, 'chase');
        break;
    }
  }

  protected override onInterrupt(e: Enemy): void {
    this.set(e, 'recover', 300);
  }
}
