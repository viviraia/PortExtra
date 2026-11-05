import { audio } from '../../core/audio';
import type { Enemy } from '../Enemy';
import { PhaseBrain } from './util';

type Phase = 'idle' | 'drift' | 'windup' | 'lunge' | 'phase';

/**
 * Hollow Shade: drifts through walls toward the player, telegraphs, lunges
 * with a chilling touch, then fades out (intangible) and repositions.
 * params: attackRange, phaseMs, windupMs, cooldownMs
 */
export class GhostBrain extends PhaseBrain<Phase> {
  phase: Phase = 'idle';
  private vx = 0;
  private vy = 0;
  private side = 1;
  private homeX = 0;
  private homeY = 0;

  init(e: Enemy): void {
    e.contactDamage = false;
    e.body.setAllowGravity(false);
    e.setAlpha(0.8);
    this.homeX = e.x;
    this.homeY = e.y - 10;
  }

  onAggro(e: Enemy): void {
    audio.sfx('enemyAlert', { volume: 0.3, pitch: 0.6 });
    this.set(e, 'drift');
    this.nextAttack = e.now + 900;
  }

  update(e: Enemy): void {
    const p = e.def.params;
    const t = e.now / 1000;
    switch (this.phase) {
      case 'idle':
        e.playAnim('idle');
        e.flyToward(this.homeX + Math.sin(t * 0.8) * 20, this.homeY + Math.sin(t * 1.9) * 8, 0.3);
        if (e.isAggro) this.set(e, 'drift');
        break;
      case 'drift': {
        e.playAnim('move');
        if (e.player.state2 === 'dead') {
          this.set(e, 'idle');
          break;
        }
        // Approach to just beside the player, with a ghostly bob.
        const tx = e.player.centerX + this.side * 18;
        const ty = e.player.centerY - 4 + Math.sin(t * 2.4) * 8;
        e.flyToward(tx, ty, 0.75);
        e.setAlpha(0.7 + 0.15 * Math.sin(t * 3));
        if (this.ready(e) && e.distToPlayer() < (p.attackRange ?? 24) + 26) {
          e.facePlayer();
          e.telegraph();
          e.setAlpha(1);
          this.set(e, 'windup', this.windupMs(e));
        }
        if (e.distToPlayer() > (p.aggroRange ?? 260) * 3) this.set(e, 'idle');
        break;
      }
      case 'windup':
        e.body.velocity.scale(0.85);
        e.facePlayer();
        if (this.done(e)) {
          const dx = e.player.centerX - e.centerX;
          const dy = e.player.centerY - e.centerY;
          const len = Math.hypot(dx, dy) || 1;
          const sp = 220 * e.slowMult;
          this.vx = (dx / len) * sp;
          this.vy = (dy / len) * sp;
          this.hitDone = false;
          e.playAnim('attack', true);
          audio.sfx('freeze', { volume: 0.25, pitch: 0.6 });
          this.set(e, 'lunge', 280);
        }
        break;
      case 'lunge':
        e.body.velocity.set(this.vx, this.vy);
        if (!this.hitDone && e.touchingPlayer(3)) {
          this.hitDone = true;
          e.hitPlayer(1, 120);
        }
        if (this.done(e)) {
          this.cooldown(e);
          e.intangible = true;
          this.side = Math.random() < 0.5 ? -1 : 1;
          e.scene.tweens.add({ targets: e, alpha: 0.22, duration: 200 });
          this.set(e, 'phase', p.phaseMs ?? 1500);
        }
        break;
      case 'phase':
        e.playAnim('move');
        e.flyToward(e.player.centerX + this.side * 70, e.player.centerY - 30, 0.9);
        if (this.done(e)) {
          e.intangible = false;
          e.scene.tweens.add({ targets: e, alpha: 0.8, duration: 250 });
          this.set(e, 'drift');
        }
        break;
    }
  }

  protected override onInterrupt(e: Enemy): void {
    e.intangible = false;
    e.setAlpha(0.8);
    this.set(e, 'drift');
    this.nextAttack = e.now + 600;
  }
}
