import { audio } from '../../core/audio';
import type { Enemy } from '../Enemy';
import type { PlayerHit } from '../World';
import { PhaseBrain } from './util';

type Phase = 'dormant' | 'reveal' | 'hunt' | 'windup' | 'lunge' | 'recover';

/**
 * Tome Mimic: lies still as an innocent book until the player is close, then
 * springs awake and chains up to three snapping lunges before resting.
 * params: wakeRange, attackRange, jumpVx, jumpVy, windupMs, cooldownMs
 */
export class AmbusherBrain extends PhaseBrain<Phase> {
  phase: Phase = 'dormant';
  private chain = 0;

  init(e: Enemy): void {
    e.dormant = true;
    e.contactDamage = false;
    e.playAnim('idle', true);
    e.anims.pause();
  }

  onHurt(e: Enemy, _hit: PlayerHit): void {
    if (this.phase === 'dormant') this.reveal(e);
  }

  update(e: Enemy): void {
    const p = e.def.params;
    switch (this.phase) {
      case 'dormant':
        e.halt();
        if (e.distToPlayer() < (p.wakeRange ?? 60) && e.player.state2 !== 'dead' && e.seesPlayerCached()) this.reveal(e);
        break;
      case 'reveal':
        e.halt();
        if (this.done(e)) {
          this.chain = 0;
          this.set(e, 'hunt');
        }
        break;
      case 'hunt': {
        if (e.player.state2 === 'dead') {
          e.halt();
          e.playAnim('idle');
          break;
        }
        const dx = e.dxToPlayer();
        const dy = e.dyToPlayer();
        if (this.ready(e) && e.grounded && Math.abs(dx) < (p.attackRange ?? 80) && dy > -60 && dy < 30) {
          e.facePlayer();
          e.halt();
          e.telegraph();
          this.set(e, 'windup', this.windupMs(e, this.chain === 0 ? 1.6 : 1));
          break;
        }
        if (Math.abs(dx) > 12) {
          if (e.walk(Math.sign(dx))) e.playAnim('move');
          else e.playAnim('idle');
        } else e.halt();
        break;
      }
      case 'windup':
        e.halt();
        if (this.done(e)) {
          const dist = Math.min(Math.abs(e.dxToPlayer()), p.attackRange ?? 80);
          const vx = (p.jumpVx ?? 200) * Math.max(0.5, dist / (p.attackRange ?? 80));
          e.body.setVelocity(e.facing * vx * e.slowMult, (p.jumpVy ?? -220) * 0.8);
          e.playAnim('attack', true);
          audio.sfx('stab', { volume: 0.4, pitch: 0.7 });
          this.hitDone = false;
          this.set(e, 'lunge', 1000);
        }
        break;
      case 'lunge':
        if (!this.hitDone && e.touchingPlayer(2)) {
          this.hitDone = true;
          e.hitPlayer(1, 180);
        }
        if ((e.grounded && e.now - this.started > 120) || this.done(e)) {
          e.body.velocity.x = 0;
          this.chain++;
          if (this.chain < 3 && e.distToPlayer() < (p.attackRange ?? 80) * 1.3) {
            // Snap again quickly.
            e.facePlayer();
            e.telegraph();
            this.set(e, 'windup', this.windupMs(e));
          } else {
            this.chain = 0;
            this.cooldown(e, 1.3);
            this.set(e, 'recover', 700);
          }
        }
        break;
      case 'recover':
        e.halt();
        e.playAnim('idle');
        if (this.done(e)) this.set(e, 'hunt');
        break;
    }
  }

  private reveal(e: Enemy): void {
    e.dormant = false;
    e.anims.resume();
    e.forceAggro();
    e.contactDamage = true;
    e.playAnim('windup', true);
    e.body.velocity.y = -140;
    audio.sfx('enemyAlert', { volume: 0.5, pitch: 0.7 });
    e.world.juice.burst(e.centerX, e.centerY, { count: 8, tint: [0xd8c8a0, 0x6a4a8a], speed: [30, 90] });
    this.nextAttack = e.now + 450;
    this.set(e, 'reveal', 450);
  }

  protected override onInterrupt(e: Enemy): void {
    if (this.phase === 'dormant') {
      e.dormant = false;
      e.anims.resume();
      e.forceAggro();
    }
    this.chain = 0;
    this.set(e, 'recover', 400);
  }
}
