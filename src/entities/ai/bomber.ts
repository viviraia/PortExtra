import { audio } from '../../core/audio';
import type { Enemy } from '../Enemy';
import { PhaseBrain, predictPlayer } from './util';

type Phase = 'patrol' | 'position' | 'windup' | 'recover';

const BOMB_GRAVITY = 560;

/**
 * Powder Monk: keeps distance and lobs arcing bombs that bounce and explode
 * after a short fuse (or on contact). Roll through or out of the radius.
 * params: attackRange, keepDistance?, bombRadius, fuseMs, windupMs, cooldownMs
 */
export class BomberBrain extends PhaseBrain<Phase> {
  phase: Phase = 'patrol';

  onAggro(e: Enemy): void {
    audio.sfx('enemyAlert', { volume: 0.3 });
    this.set(e, 'position');
    this.nextAttack = e.now + 500;
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
        const keep = p.keepDistance ?? 90;
        const range = p.attackRange ?? 180;
        if (dist < keep) {
          const away = -Math.sign(dx) || 1;
          if (!e.atEdge(away) && !e.wallAhead(away) && !e.hazardAhead(away)) {
            e.body.velocity.x = away * e.speed * e.slowMult;
            e.facing = (Math.sign(dx) || 1) as 1 | -1;
            e.playAnim('move');
          } else {
            e.halt();
            e.facePlayer();
            e.playAnim('idle');
          }
        } else if (dist > range) {
          if (e.walk(Math.sign(dx) || 1, 0.8)) e.playAnim('move');
          else e.playAnim('idle');
        } else {
          e.halt();
          e.facePlayer();
          e.playAnim('idle');
        }
        // Bombs arc over low cover, so only rough visibility is needed.
        if (dist <= range && this.ready(e) && e.grounded && (e.seesPlayerCached() || Math.abs(e.dyToPlayer()) < 60)) {
          e.halt();
          e.facePlayer();
          e.telegraph();
          this.set(e, 'windup', this.windupMs(e));
        }
        if (dist > (p.aggroRange ?? 220) * 2.5) this.set(e, 'patrol');
        break;
      }
      case 'windup':
        e.halt();
        e.facePlayer();
        if (this.done(e)) {
          this.lob(e);
          this.cooldown(e);
          this.set(e, 'recover', 450);
        }
        break;
      case 'recover':
        e.halt();
        if (this.done(e)) this.set(e, 'position');
        break;
    }
  }

  private lob(e: Enemy): void {
    const p = e.def.params;
    e.playAnim('attack', true);
    const sx = e.centerX + e.facing * 6;
    const sy = e.body.top + 2;
    const flight = Math.min(1.15, Math.max(0.55, e.distToPlayer() / (p.projectileSpeed ?? 220)));
    const tgt = predictPlayer(e, flight);
    const dx = tgt.x - sx;
    const dy = e.player.body.bottom - 6 - sy;
    const vx = dx / flight;
    const vy = (dy - 0.5 * BOMB_GRAVITY * flight * flight) / flight;
    audio.sfx('grenadeThrow', { volume: 0.4, pitch: 0.9 });
    e.world.projectiles.fire({
      owner: 'enemy',
      key: 'bomb',
      x: sx,
      y: sy,
      vx,
      vy,
      gravity: BOMB_GRAVITY,
      bounce: 0.3,
      lifeMs: flight * 1000 + (p.fuseMs ?? 900) * 0.6,
      explodeRadius: p.bombRadius ?? 32,
      explodeOnExpire: true,
      damage: e.dmg,
      cause: e.def.name,
      spin: 540 * Math.sign(vx || 1),
      radius: 4,
      glow: 0xff7a2a,
    });
  }

  protected override onInterrupt(e: Enemy): void {
    this.set(e, 'recover', 300);
  }
}
