/**
 * Shared helpers for AI brains: a tiny phase state machine base, patrol
 * behaviour, spot finding (teleports/summons) and aim prediction.
 */
import { TILE } from '../../config';
import type { Enemy } from '../Enemy';
import type { AiBrain } from './types';

export abstract class PhaseBrain<P extends string> implements AiBrain {
  abstract phase: P;
  /** Time (ms) at which the current phase ends. */
  until = 0;
  /** Time the current phase started. */
  started = 0;
  /** Earliest time the next attack may begin. */
  nextAttack = 0;
  /** Has the current attack already connected? */
  hitDone = false;
  private patrolFlipAt = 0;

  abstract update(e: Enemy, dt: number): void;

  set(e: Enemy, p: P, ms = 0): void {
    this.phase = p;
    this.started = e.now;
    this.until = e.now + ms;
  }

  done(e: Enemy): boolean {
    return e.now >= this.until;
  }

  /** Fraction (0..1) of the current phase elapsed. */
  progress(e: Enemy): number {
    const len = this.until - this.started;
    return len <= 0 ? 1 : Math.min(1, (e.now - this.started) / len);
  }

  ready(e: Enemy): boolean {
    return e.now >= this.nextAttack;
  }

  /** Start the attack cooldown (with ±15% jitter so groups desync). */
  cooldown(e: Enemy, mult = 1): void {
    this.nextAttack = e.now + (e.def.params.cooldownMs ?? 1200) * e.cooldownMult * mult * (0.85 + Math.random() * 0.3);
  }

  windupMs(e: Enemy, mult = 1): number {
    return (e.def.params.windupMs ?? 450) * mult;
  }

  /** Lazy back-and-forth patrol for ground enemies that haven't noticed the player. */
  patrol(e: Enemy, speedMult = 0.45): void {
    const moved = e.walk(e.facing, speedMult);
    if (!moved || e.now > this.patrolFlipAt) {
      e.facing = (e.facing * -1) as 1 | -1;
      e.body.velocity.x = 0;
      this.patrolFlipAt = e.now + 1800 + Math.random() * 2600;
      e.playAnim('idle');
    } else e.playAnim('move');
  }

  /** Default: stun/parry cancels the current attack and grants a short reset. */
  interrupt(e: Enemy): void {
    this.hitDone = true;
    this.onInterrupt(e);
  }

  protected onInterrupt(_e: Enemy): void {}

}

/** Player position predicted `t` seconds ahead (clamped so leads stay fair). */
export function predictPlayer(e: Enemy, t: number): { x: number; y: number } {
  const p = e.player;
  const v = p.body.velocity;
  const lt = Math.min(t, 0.6) * 0.6;
  return { x: p.centerX + v.x * lt, y: p.centerY + Math.max(-80, Math.min(80, v.y * lt * 0.3)) };
}

/**
 * Find a standable tile (feet cell) between minDist and maxDist from the
 * player with line of sight to them. Returns world bottom-center or null.
 */
export function findSpotNearPlayer(e: Enemy, minDist: number, maxDist: number, tries = 24): { x: number; y: number } | null {
  const p = e.player;
  const ptx = Math.floor(p.centerX / TILE);
  const pty = Math.floor((p.body.bottom - 1) / TILE);
  const span = Math.ceil(maxDist / TILE);
  for (let i = 0; i < tries; i++) {
    const tx = ptx + Math.round((Math.random() * 2 - 1) * span);
    for (let dy = -3; dy <= 3; dy++) {
      const ty = pty + dy;
      if (!e.canStandAt(tx, ty)) continue;
      const x = tx * TILE + TILE / 2;
      const y = (ty + 1) * TILE;
      const d = Math.hypot(x - p.centerX, y - 10 - p.centerY);
      if (d < minDist || d > maxDist) continue;
      if (!e.world.lineOfSight(x, y - 10, p.centerX, p.centerY)) continue;
      return { x, y };
    }
  }
  return null;
}

/** Teleport a sprite-origin-bottom enemy to x,y (feet). */
export function teleportTo(e: Enemy, x: number, y: number): void {
  e.body.reset(x, y);
  e.body.velocity.set(0, 0);
}

/** Rotate a unit vector by `a` radians. */
export function rotate(x: number, y: number, a: number): { x: number; y: number } {
  const c = Math.cos(a), s = Math.sin(a);
  return { x: x * c - y * s, y: x * s + y * c };
}
