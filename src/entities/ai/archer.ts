import { audio } from '../../core/audio';
import type { Enemy } from '../Enemy';
import { PhaseBrain, predictPlayer } from './util';

type Phase = 'patrol' | 'position' | 'draw' | 'recover';

/**
 * Bone Archer: keeps its distance, backs off when crowded, draws (visible
 * windup) then looses an arrow with a slight lead.
 * params: attackRange, keepDistance, projectileSpeed, windupMs, cooldownMs
 */
export class ArcherBrain extends PhaseBrain<Phase> {
  phase: Phase = 'patrol';
  private aimX = 0;
  private aimY = 0;

  onAggro(e: Enemy): void {
    audio.sfx('enemyAlert', { volume: 0.3, pitch: 1.2 });
    this.set(e, 'position');
    this.nextAttack = e.now + 400;
  }

  update(e: Enemy): void {
    const p = e.def.params;
    if (e.player.state2 === 'dead') {
      e.halt();
      e.playAnim('idle');
      return;
    }
    switch (this.phase) {
      case 'patrol':
        this.patrol(e, 0.4);
        if (e.isAggro) this.set(e, 'position');
        break;
      case 'position': {
        const dx = e.dxToPlayer();
        const dist = e.distToPlayer();
        const keep = p.keepDistance ?? 70;
        const range = p.attackRange ?? 220;
        const sees = e.seesPlayerCached();
        if (dist < keep && Math.abs(e.dyToPlayer()) < 40) {
          // Back away while facing the player; hold ground at ledges/walls.
          const away = -Math.sign(dx) || 1;
          if (!e.atEdge(away) && !e.wallAhead(away) && !e.hazardAhead(away)) {
            e.body.velocity.x = away * e.speed * 0.9 * e.slowMult;
            e.facing = (Math.sign(dx) || 1) as 1 | -1;
            e.playAnim('move');
          } else {
            e.halt();
            e.facePlayer();
          }
        } else if (!sees || dist > range) {
          if (e.walk(Math.sign(dx) || 1, 0.8)) e.playAnim('move');
          else e.playAnim('idle');
        } else {
          e.halt();
          e.facePlayer();
          e.playAnim('idle');
        }
        if (sees && dist <= range && this.ready(e) && e.grounded) {
          e.halt();
          e.facePlayer();
          e.telegraph();
          this.set(e, 'draw', this.windupMs(e));
        }
        if (dist > (p.aggroRange ?? 240) * 2.5) this.set(e, 'patrol');
        break;
      }
      case 'draw':
        e.halt();
        e.facePlayer();
        // Keep tracking during the draw, then commit.
        {
          const t = e.distToPlayer() / (p.projectileSpeed ?? 220);
          const tgt = predictPlayer(e, t);
          this.aimX = tgt.x;
          this.aimY = tgt.y;
        }
        if (this.done(e)) {
          e.playAnim('attack', true);
          const sx = e.centerX + e.facing * (e.def.w / 2);
          const sy = e.centerY - 2;
          e.shoot('arrow', p.projectileSpeed ?? 220, { dirX: this.aimX - sx, dirY: this.aimY - sy, lifeMs: 1800, radius: 3 });
          audio.sfx('bow', { volume: 0.4, pitch: 0.85 });
          this.cooldown(e);
          this.set(e, 'recover', 350);
        }
        break;
      case 'recover':
        e.halt();
        if (this.done(e)) this.set(e, 'position');
        break;
    }
  }

  protected override onInterrupt(e: Enemy): void {
    this.set(e, 'recover', 300);
  }
}
