/** Input contract. Implemented by InputManager.ts (+ TouchControls.ts). */
export type Action =
  | 'left' | 'right' | 'up' | 'down'
  | 'jump' | 'attack1' | 'attack2' | 'dodge'
  | 'skill1' | 'skill2' | 'interact' | 'potion' | 'pause';

export const ACTIONS: readonly Action[] = [
  'left', 'right', 'up', 'down', 'jump', 'attack1', 'attack2', 'dodge',
  'skill1', 'skill2', 'interact', 'potion', 'pause',
];

/**
 * Default keyboard bindings (Phaser key names). Mouse: LMB = attack1, RMB = attack2.
 */
export const KEY_BINDINGS: Record<Action, string[]> = {
  left: ['A', 'LEFT'],
  right: ['D', 'RIGHT'],
  up: ['W', 'UP'],
  down: ['S', 'DOWN'],
  jump: ['SPACE', 'Z'],
  attack1: ['J', 'X'],
  attack2: ['K', 'C'],
  dodge: ['SHIFT', 'L'],
  skill1: ['Q', 'U'],
  skill2: ['E', 'I'],
  interact: ['F', 'ENTER'],
  potion: ['R', 'H'],
  pause: ['ESC', 'P'],
};

export interface Vec2 { x: number; y: number }

/** Read once per frame by gameplay code after InputManager.update(). */
export interface InputState {
  /** -1..1 horizontal movement (keyboard gives -1/0/1, touch stick is analog). */
  readonly moveX: number;
  /** -1..1 vertical (negative = up). */
  readonly moveY: number;
  /** Held this frame. */
  down(a: Action): boolean;
  /** Went down this frame (edge). */
  pressed(a: Action): boolean;
  /** Went up this frame (edge). */
  released(a: Action): boolean;
  /**
   * Normalized world-space aim direction from the player toward the mouse
   * cursor, or null when the mouse has not been used recently / on touch
   * (gameplay then aims along the facing direction, auto-targeting allowed).
   */
  readonly aim: Vec2 | null;
  readonly usingTouch: boolean;
  readonly usingMouse: boolean;
}
