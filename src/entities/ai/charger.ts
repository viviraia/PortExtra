import { audio } from '../../core/audio';
import type { Enemy } from '../Enemy';
import { PhaseBrain } from './util';

type Phase = 'patrol' | 'approach' | 'windup' | 'charge' | 'recover';

/**
 * Lancer: lines up on the player, paws the ground (long telegraph), then
 * charges in a straight line. Stops at ledges; slamming into a wall stuns it.
 * params: attackRange, chargeSpeed, chargeMs, stunMs, windupMs, cooldownMs
 */
export class ChargerBrain extends PhaseBrain<Phase> {
  phase: Phase = 'patrol';
  private dir: 1 | -1 = 1;

  onAggro(e: Enemy): void {
    audio.sfx('enemyAlert', { volume: 0.35, pitch: 0.9 });
    this.set(e, 'approach');
    this.nextAttack = e.now + 600;
  }

  update(e: Enemy): void {
    const p = e.def.params;
    if (e.player.state2 === 'dead' && this.phase !== 'charge') {
      e.halt();
      e.playAnim('idle');
      return;
    }
    switch (this.phase) {
      case 'patrol':
        this.patrol(e, 0.4);
        if (e.isAggro) this.set(e, 'approach');
        break;
      case 'approach': {
        const dx = e.dxToPlayer();
        const dy = e.dyToPlayer();
        if (this.ready(e) && Math.abs(dx) < (p.attackRange ?? 160) && Math.abs(dx) > 20 && Math.abs(dy) < 26 && e.grounded && e.seesPlayerCached()) {
          e.facePlayer();
          e.halt();
          e.telegraph();
          this.dir = e.facing;
          this.set(e, 'windup', this.windupMs(e));
          break;
        }
        if (Math.abs(dx) > 40) {
          if (e.walk(Math.sign(dx), 0.8)) e.playAnim('move');
          else e.playAnim('idle');
        } else {
          // Too close to charge: back up a little to make room.
          const away = -Math.sign(dx) || 1;
          if (!e.atEdge(away) && !e.wallAhead(away)) {
            e.body.velocity.x = away * e.speed * 0.6 * e.slowMult;
            e.facing = (Math.sign(dx) || 1) as 1 | -1;
            e.playAnim('move');
          } else {
            e.halt();
            e.facePlayer();
          }
        }
        if (e.distToPlayer() > (p.aggroRange ?? 220) * 2.5) this.set(e, 'patrol');
        break;
      }
      case 'windup':
        e.halt();
        e.facing = this.dir;
        if (Math.random() < 0.25) e.world.juice.burst(e.centerX - this.dir * 8, e.body.bottom - 2, { count: 1, tint: 0x9a8f86, speed: [20, 50], angle: this.dir > 0 ? [180, 230] : [-50, 0], life: [150, 300] });
        if (this.done(e)) {
          this.hitDone = false;
          e.playAnim('attack', true);
          audio.sfx('swingHeavy', { volume: 0.5, pitch: 0.8 });
          this.set(e, 'charge', p.chargeMs ?? 800);
        }
        break;
      case 'charge': {
        e.facing = this.dir;
        if (e.grounded && e.atEdge(this.dir)) {
          e.body.velocity.x = 0;
          this.cooldown(e);
          this.set(e, 'recover', 500);
          break;
        }
        e.body.velocity.x = this.dir * (p.chargeSpeed ?? 300) * e.slowMult;
        if (Math.random() < 0.4) e.world.juice.burst(e.centerX - this.dir * 6, e.body.bottom - 2, { count: 1, tint: 0x9a8f86, speed: [10, 40], life: [120, 260], gravity: -20 });
        if (!this.hitDone && e.touchingPlayer(2)) {
          this.hitDone = true;
          e.hitPlayer(1.25, 320);
        }
        if (e.wallAhead(this.dir) && e.now - this.started > 80) {
          e.body.velocity.x = -this.dir * 60;
          e.world.juice.shake(0.004, 120);
          e.world.juice.fx(e.centerX + this.dir * 8, e.centerY, 'fx-hit-spark');
          audio.sfx('block', { volume: 0.6, pitch: 0.7 });
          this.cooldown(e);
          this.set(e, 'recover', 200);
          e.stun(p.stunMs ?? 1200);
          break;
        }
        if (this.done(e)) {
          this.cooldown(e);
          this.set(e, 'recover', 600);
        }
        break;
      }
      case 'recover':
        e.body.velocity.x *= 0.85;
        e.playAnim('idle');
        if (this.done(e)) this.set(e, 'approach');
        break;
    }
  }

  protected override onInterrupt(e: Enemy): void {
    this.set(e, 'recover', 300);
  }
}
