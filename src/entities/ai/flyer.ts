import { audio } from '../../core/audio';
import type { Enemy } from '../Enemy';
import { PhaseBrain } from './util';

type Phase = 'idle' | 'hover' | 'windup' | 'swoop' | 'retreat';

/**
 * Gloom Bat: flutters erratically around the player, freezes for a beat
 * (telegraph), then swoops in a straight line through where the player was.
 * params: attackRange, swoopSpeed, windupMs, cooldownMs
 */
export class FlyerBrain extends PhaseBrain<Phase> {
  phase: Phase = 'idle';
  private homeX = 0;
  private homeY = 0;
  private side = 1;
  private seed = Math.random() * 1000;
  private vx = 0;
  private vy = 0;

  init(e: Enemy): void {
    e.contactDamage = false;
    this.homeX = e.x;
    this.homeY = e.y - 10;
    this.side = Math.random() < 0.5 ? -1 : 1;
  }

  onAggro(e: Enemy): void {
    audio.sfx('enemyAlert', { volume: 0.25, pitch: 1.8 });
    this.set(e, 'hover');
    this.nextAttack = e.now + 700 + Math.random() * 600;
  }

  update(e: Enemy): void {
    const p = e.def.params;
    const t = (e.now + this.seed) / 1000;
    e.playAnim('move');
    switch (this.phase) {
      case 'idle':
        e.flyToward(this.homeX + Math.sin(t * 1.3) * 24, this.homeY + Math.sin(t * 2.7) * 8, 0.4);
        if (e.isAggro) this.set(e, 'hover');
        break;
      case 'hover': {
        const pl = e.player;
        if (pl.state2 === 'dead') {
          this.set(e, 'idle');
          break;
        }
        if (Math.random() < 0.004) this.side = -this.side;
        const tx = pl.centerX + this.side * 48 + Math.sin(t * 2.1) * 22;
        const ty = pl.centerY - 42 + Math.sin(t * 3.3) * 14;
        e.flyToward(tx, ty, 1);
        if (this.ready(e) && e.distToPlayer() < (p.attackRange ?? 110) && e.seesPlayerCached()) {
          e.facePlayer();
          e.telegraph();
          this.set(e, 'windup', this.windupMs(e));
        }
        if (e.distToPlayer() > (p.aggroRange ?? 190) * 3) this.set(e, 'idle');
        break;
      }
      case 'windup':
        e.body.velocity.scale(0.8);
        // Visible shiver.
        e.x += Math.sin(e.now / 18) * 0.6;
        e.facePlayer();
        if (this.done(e)) {
          const dx = e.player.centerX - e.centerX;
          const dy = e.player.centerY - e.centerY;
          const len = Math.hypot(dx, dy) || 1;
          const sp = (p.swoopSpeed ?? 210) * e.slowMult;
          this.vx = (dx / len) * sp;
          this.vy = (dy / len) * sp;
          this.hitDone = false;
          e.playAnim('attack', true);
          audio.sfx('swing', { volume: 0.25, pitch: 1.9 });
          this.set(e, 'swoop', (len / sp) * 1000 + 220);
        }
        break;
      case 'swoop':
        e.body.velocity.set(this.vx, this.vy);
        if (!this.hitDone && e.touchingPlayer(1)) {
          this.hitDone = true;
          e.hitPlayer(1, 140);
        }
        if (this.done(e) || e.body.blocked.down || e.body.blocked.left || e.body.blocked.right || e.body.blocked.up) {
          this.cooldown(e);
          this.side = e.centerX < e.player.centerX ? -1 : 1;
          this.set(e, 'retreat', 550);
        }
        break;
      case 'retreat':
        e.flyToward(e.centerX + this.side * 40, e.player.centerY - 60, 1.1);
        if (this.done(e)) this.set(e, 'hover');
        break;
    }
  }

  protected override onInterrupt(e: Enemy): void {
    this.set(e, 'retreat', 400);
  }
}
