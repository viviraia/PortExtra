/**
 * Boss registry. A boss is an Enemy (so all player combat works on it) with a
 * custom brain and texture. GameScene calls createBoss on boss floors and
 * listens for its death to unlock the exit.
 */
import type { Enemy } from '../Enemy';
import type { World } from '../World';

export type BossFactory = (world: World, x: number, y: number) => Enemy;

const BOSSES: Record<string, BossFactory> = {};

export function registerBoss(id: string, f: BossFactory): void {
  BOSSES[id] = f;
}

export function createBoss(world: World, bossId: string, x: number, y: number): Enemy | null {
  const f = BOSSES[bossId];
  return f ? f(world, x, y) : null;
}
