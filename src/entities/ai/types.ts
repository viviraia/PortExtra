import type { Enemy } from '../Enemy';
import type { PlayerHit } from '../World';

/**
 * An AI brain drives one enemy. Brains are created per enemy (they may keep
 * state on themselves or in enemy.mem). Use Enemy's helper methods
 * (walk, flyToward, telegraph, meleeAttack, shoot, seesPlayer, ...).
 */
export interface AiBrain {
  init?(e: Enemy): void;
  update(e: Enemy, dt: number): void;
  /** Called the first time the enemy notices the player. */
  onAggro?(e: Enemy): void;
  onHurt?(e: Enemy, hit: PlayerHit): void;
  /** Return true if this hit is blocked (shields). */
  blocks?(e: Enemy, hit: PlayerHit): boolean;
  /** Stun/parry interrupts current action. */
  interrupt?(e: Enemy): void;
  onDeath?(e: Enemy): void;
}

export type BrainFactory = () => AiBrain;
