/**
 * The interface entities, AI brains, weapons and skills use to talk to the
 * running game. Implemented by GameScene. Entities must only depend on this
 * (type-only import), never on GameScene directly.
 */
import type Phaser from 'phaser';
import type { Juice } from '../combat/juice';
import type { Rng } from '../core/rng';
import type { Difficulty, FloorLayout, ItemInstance, OnHitStatus, StatTrack } from '../data/types';
import type { RunState } from '../run/RunState';
import type { BuiltFloor } from '../world/FloorBuilder';
import type { Enemy } from './Enemy';
import type { Player } from './Player';
import type { ProjectileSystem } from './Projectile';
import type { PickupSystem } from './Pickup';

export interface PlayerHit {
  amount: number;
  crit: boolean;
  /** Knockback velocity applied to the target. */
  kbX: number;
  kbY: number;
  status?: OnHitStatus;
  /** Effect color for sparks. */
  color?: number;
  /** Hit-stop ms (melee). */
  hitstopMs?: number;
  /** Source tag for special rules / death cause. */
  source: string;
  /** If true, the hit ignores shields/armor of the enemy. */
  pierceArmor?: boolean;
}

export interface World {
  readonly stage: Phaser.Scene;
  readonly juice: Juice;
  readonly rng: Rng;
  readonly run: RunState;
  readonly difficulty: Difficulty;
  readonly layout: FloorLayout;
  readonly floor: BuiltFloor;
  readonly player: Player;
  readonly enemies: Enemy[];
  readonly projectiles: ProjectileSystem;
  readonly pickups: PickupSystem;
  /** Scene time in ms (paused during hit-stop/pause). */
  readonly now: number;

  /** Apply `hit` to every living enemy overlapping rect not already in `already`. Returns enemies hit. */
  hitEnemiesInRect(rect: Phaser.Geom.Rectangle, makeHit: (e: Enemy) => PlayerHit, already?: Set<Enemy>): Enemy[];
  enemiesInRadius(x: number, y: number, r: number): Enemy[];
  nearestEnemy(x: number, y: number, maxDist: number, requireLos?: boolean): Enemy | null;
  /** Damage the player (armor/iframes/shield handled by the player). */
  damagePlayer(raw: number, from: { x: number; y: number } | null, cause: string, opts?: { unblockable?: boolean; kb?: number }): void;
  /** Called by combat when the player deals damage (lifesteal etc.). */
  onPlayerDealtDamage(amount: number, target: Enemy, hit: PlayerHit): void;
  onEnemyKilled(e: Enemy): void;
  spawnEnemy(defId: string, x: number, y: number, opts?: { elite?: boolean; summoned?: boolean }): Enemy | null;
  isSolidAt(wx: number, wy: number): boolean;
  lineOfSight(x0: number, y0: number, x1: number, y1: number): boolean;
  /** Add coins to the wallet (applies coin bonus), with a floating text at x,y. */
  addCoins(n: number, x?: number, y?: number): void;
  addEmbers(n: number, x?: number, y?: number): void;
  /** Current wallet coins. */
  readonly coins: number;
  /** Spend coins from the wallet; false if not enough. */
  spendCoins(n: number): boolean;
  /** Item ids unlocked into the drop pool. */
  readonly unlocked: readonly string[];
  /** Apply a stat scroll (heals a bit, recomputes stats, shows feedback). */
  grantScroll(track: StatTrack): void;
  /** Place an item on the ground as a pick-up-able drop. */
  dropItem(item: ItemInstance, x: number, y: number, opts?: { price?: number; pop?: boolean }): void;
  /** Equip or pick up an item (opens the swap prompt when slots are full). */
  takeItem(item: ItemInstance, x: number, y: number): void;
}
