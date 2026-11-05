import { audio } from '../../core/audio';
import type { Enemy } from '../Enemy';
import { PhaseBrain } from './util';

type Phase = 'idle' | 'hover' | 'windup' | 'dive' | 'stuck' | 'recover';

/**
 * Gargoyle Imp: hovers high above the player, shudders (telegraph), then
 * dive-bombs diagonally to where the player stood. Crashing into terrain
 * leaves it briefly stuck and punishable.
 * params: hoverHeight, diveSpeed, attackRange, windupMs, cooldownMs
 */
export class DiverBrain extends PhaseBrain<Phase> {
  phase: Phase = 'idle';
  private homeX = 0;
  private homeY = 0;
  private side = 1;
  private tx = 0;
  private ty = 0;
  private vx = 0;
  private vy = 0;

  init(e: Enemy): void {
    e.contactDamage = false;
    this.homeX = e.x;
    this.homeY = e.y - 16;
    this.side = Math.random() < 0.5 ? -1 : 1;
  }

  onAggro(e: Enemy): void {
    audio.sfx('enemyAlert', { volume: 0.3, pitch: 1.4 });
    this.set(e, 'hover');
    this.nextAttack = e.now + 800;
  }

  update(e: Enemy): void {
    const p = e.def.params;
    const t = e.now / 1000;
    switch (this.phase) {
      case 'idle':
        e.playAnim('idle');
        e.flyToward(this.homeX + Math.sin(t) * 16, this.homeY + Math.sin(t * 2) * 6, 0.35);
        if (e.isAggro) this.set(e, 'hover');
        break;
      case 'hover': {
        e.playAnim('move');
        const pl = e.player;
        if (pl.state2 === 'dead') {
          this.set(e, 'idle');
          break;
        }
        const h = p.hoverHeight ?? 70;
        let hx = pl.centerX + this.side * 44 + Math.sin(t * 1.7) * 10;
        let hy = pl.centerY - h + Math.sin(t * 2.3) * 6;
        // Don't try to hover inside the ceiling.
        if (e.world.isSolidAt(hx, hy)) {
          hy = pl.centerY - h * 0.5;
          if (e.world.isSolidAt(hx, hy)) hx = pl.centerX - this.side * 44;
        }
        e.flyToward(hx, hy, 1);
        const dist = e.distToPlayer();
        if (this.ready(e) && dist < (p.attackRange ?? 140) && e.centerY < pl.centerY - 20 && e.seesPlayerCached()) {
          e.facePlayer();
          e.telegraph();
          this.tx = pl.centerX;
          this.ty = pl.centerY;
          this.set(e, 'windup', this.windupMs(e));
        }
        if (dist > (p.aggroRange ?? 220) * 3) this.set(e, 'idle');
        break;
      }
      case 'windup': {
        // Rear back slightly and track the target until committing.
        e.body.velocity.set(0, -18);
        e.x += Math.sin(e.now / 16) * 0.7;
        if (this.progress(e) < 0.7) {
          this.tx = e.player.centerX;
          this.ty = e.player.centerY;
        }
        e.facing = this.tx > e.centerX ? 1 : -1;
        if (this.done(e)) {
          const dx = this.tx - e.centerX;
          const dy = this.ty - e.centerY;
          const len = Math.hypot(dx, dy) || 1;
          const sp = (p.diveSpeed ?? 280) * e.slowMult;
          this.vx = (dx / len) * sp;
          this.vy = (dy / len) * sp;
          this.hitDone = false;
          e.playAnim('attack', true);
          audio.sfx('swingHeavy', { volume: 0.35, pitch: 1.4 });
          this.set(e, 'dive', 1000);
        }
        break;
      }
      case 'dive': {
        e.body.velocity.set(this.vx, this.vy);
        if (!this.hitDone && e.touchingPlayer(2)) {
          this.hitDone = true;
          e.hitPlayer(1.1, 200);
        }
        const b = e.body.blocked;
        if (b.down || b.left || b.right || b.up) {
          e.world.juice.fx(e.centerX, e.body.bottom, 'fx-dust');
          e.world.juice.shake(0.002, 80);
          audio.sfx('land', { volume: 0.4 });
          e.body.velocity.set(0, 0);
          this.set(e, 'stuck', 650);
        } else if (this.done(e) || e.centerY > this.ty + 50) {
          this.cooldown(e);
          this.set(e, 'recover', 700);
        }
        break;
      }
      case 'stuck':
        e.playAnim('idle');
        e.body.velocity.scale(0.5);
        if (this.done(e)) {
          this.cooldown(e);
          this.set(e, 'recover', 700);
        }
        break;
      case 'recover':
        e.playAnim('move');
        e.flyToward(e.centerX + this.side * 30, e.player.centerY - (p.hoverHeight ?? 70), 1.2);
        if (this.done(e)) {
          this.side = Math.random() < 0.5 ? -1 : 1;
          this.set(e, 'hover');
        }
        break;
    }
  }

  protected override onInterrupt(e: Enemy): void {
    this.set(e, 'recover', 500);
  }
}
