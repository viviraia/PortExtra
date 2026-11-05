/**
 * Unified input: keyboard + mouse (window/canvas DOM listeners) + touch
 * (state injected by TouchScene) behind the InputState contract.
 *
 * Usage (GameScene):
 *   create():  input.attach(this.game);
 *   update():  input.update({ camera: this.cameras.main, fromX: player.x, fromY: player.y });
 *              if (input.pressed('jump')) ...
 * Menu scenes: input.update(); const nav = input.menuNav();
 * update() is idempotent per game frame, so several scenes may call it.
 */
import type Phaser from 'phaser';
import { ActionState, RepeatTimer, buildKeyMap, keyNameFromEvent, resolveAxis } from './ActionState';
import { type Action, type InputState, type Vec2 } from './types';

export type InputDevice = 'keyboard' | 'mouse' | 'touch';

export interface MenuNav {
  dx: number;
  dy: number;
  confirm: boolean;
  back: boolean;
}

export interface AimSource {
  camera: Phaser.Cameras.Scene2D.Camera;
  fromX: number;
  fromY: number;
}

/** Mouse aim is dropped after this long without mouse use if the player switched to keyboard attacks. */
const MOUSE_IDLE_MS = 3000;
const TOUCH_X_THRESHOLD = 0.4;
const TOUCH_Y_THRESHOLD = 0.6;
const AIM_ACTIONS: ReadonlySet<Action> = new Set<Action>(['attack1', 'attack2', 'skill1', 'skill2']);

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function isEditable(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el as HTMLElement).isContentEditable;
}

export class InputManager implements InputState {
  /** When false, gameplay queries return nothing (menuNav still works). */
  enabled = true;
  lastDevice: InputDevice = 'keyboard';
  /** True once any touch event has been seen on this page. */
  touchSeen = false;
  /** Initial "this device probably has touch" hint (see TouchScene.shouldShow). */
  touchHint = false;
  /** Pointer position in game (screen-space) coordinates. */
  readonly pointer: Vec2 = { x: 0, y: 0 };
  /** Pointer position in world coordinates as of the last update(aim). */
  readonly pointerWorld: Vec2 = { x: 0, y: 0 };

  private state = new ActionState();
  private keyMap = buildKeyMap();
  private game: Phaser.Game | null = null;
  private lastFrame = -1;
  private _moveX = 0;
  private _moveY = 0;
  private _aim: Vec2 | null = null;
  private lastAimDir: Vec2 = { x: 1, y: 0 };
  private mouseEngaged = false;
  private mouseActiveAt = -Infinity;
  private pointerSeen = false;
  private touchAxis = { x: 0, y: 0, active: false };
  private repeat = new RepeatTimer();
  private nav: MenuNav = { dx: 0, dy: 0, confirm: false, back: false };
  private detach: (() => void) | null = null;

  // ---------------------------------------------------------------- InputState
  get moveX(): number {
    return this.enabled ? this._moveX : 0;
  }
  get moveY(): number {
    return this.enabled ? this._moveY : 0;
  }
  get aim(): Vec2 | null {
    return this.enabled ? this._aim : null;
  }
  get usingTouch(): boolean {
    return this.lastDevice === 'touch';
  }
  get usingMouse(): boolean {
    return this.mouseEngaged && this.lastDevice !== 'touch';
  }
  down(a: Action): boolean {
    return this.enabled && this.state.down(a);
  }
  pressed(a: Action): boolean {
    return this.enabled && this.state.pressed(a);
  }
  released(a: Action): boolean {
    return this.enabled && this.state.released(a);
  }

  /** Raw queries that ignore `enabled` (for menus/pause handling). */
  rawDown(a: Action): boolean {
    return this.state.down(a);
  }
  rawPressed(a: Action): boolean {
    return this.state.pressed(a);
  }

  /** ms `a` has been held (0 if not held). Useful for charge attacks. */
  heldFor(a: Action): number {
    return this.state.heldFor(a, now());
  }

  /** Last non-zero aim direction (or facing fallback supplied by caller). */
  get lastAim(): Readonly<Vec2> {
    return this.lastAimDir;
  }

  // ---------------------------------------------------------------- lifecycle
  attach(game: Phaser.Game): void {
    if (this.game === game && this.detach) return;
    this.detachListeners();
    this.game = game;
    if (typeof window === 'undefined') return;
    if ('ontouchstart' in window || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0)) {
      // Initial hint only; TouchScene shows controls in 'auto' when touchSeen is true.
      this.touchHint = true;
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditable(document.activeElement)) return;
      const name = keyNameFromEvent(e.code, e.key);
      if (!name) return;
      const actions = this.keyMap.get(name);
      if (!actions) return;
      e.preventDefault();
      if (e.repeat) return;
      this.lastDevice = 'keyboard';
      for (const a of actions) {
        this.state.press(a, `key:${name}`);
        if (AIM_ACTIONS.has(a) && now() - this.mouseActiveAt > MOUSE_IDLE_MS) this.mouseEngaged = false;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const name = keyNameFromEvent(e.code, e.key);
      if (!name) return;
      const actions = this.keyMap.get(name);
      if (!actions) return;
      if (!isEditable(document.activeElement)) e.preventDefault();
      for (const a of actions) this.state.release(a, `key:${name}`);
    };
    const updatePointer = (e: PointerEvent | MouseEvent) => {
      const g = this.game;
      if (!g) return;
      this.pointer.x = g.scale.transformX(e.pageX);
      this.pointer.y = g.scale.transformY(e.pageY);
      this.pointerSeen = true;
    };
    const isMouse = (e: PointerEvent) => e.pointerType === 'mouse' || e.pointerType === 'pen' || e.pointerType === '';
    const onPointerMove = (e: PointerEvent) => {
      if (!isMouse(e)) return;
      const ox = this.pointer.x, oy = this.pointer.y;
      updatePointer(e);
      if (Math.abs(this.pointer.x - ox) + Math.abs(this.pointer.y - oy) > 1.5) this.markMouse();
    };
    const mouseAction = (button: number): Action | null => (button === 0 ? 'attack1' : button === 2 ? 'attack2' : null);
    const onPointerDown = (e: PointerEvent) => {
      if (!isMouse(e)) {
        this.markTouch();
        return;
      }
      updatePointer(e);
      this.markMouse();
      const a = mouseAction(e.button);
      // No preventDefault here: it would suppress the compatibility mouse
      // events Phaser's own input plugin listens to.
      if (a) this.state.press(a, `mouse:${e.button}`);
    };
    const onPointerUp = (e: PointerEvent) => {
      if (!isMouse(e)) return;
      const a = mouseAction(e.button);
      if (a) this.state.release(a, `mouse:${e.button}`);
    };
    const onContextMenu = (e: Event) => e.preventDefault();
    const onTouchStart = () => this.markTouch();
    const onBlur = () => this.releaseAll();
    const onVisibility = () => {
      if (document.hidden) this.releaseAll();
    };

    const canvas = game.canvas;
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibility);
    canvas?.addEventListener('pointerdown', onPointerDown);
    canvas?.addEventListener('contextmenu', onContextMenu);

    this.detach = () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
      canvas?.removeEventListener('pointerdown', onPointerDown);
      canvas?.removeEventListener('contextmenu', onContextMenu);
    };
  }

  detachListeners(): void {
    this.detach?.();
    this.detach = null;
  }

  /**
   * Advance one frame. Pass `aim` from gameplay to compute mouse aim.
   * Safe to call from multiple scenes per frame: edges advance only once per game frame.
   */
  update(aim?: AimSource): void {
    const frame = this.game ? this.game.loop.frame : this.lastFrame + 1;
    const t = now();
    if (frame !== this.lastFrame) {
      this.lastFrame = frame;
      this.state.update(t);
      const s = this.state;
      this._moveX = resolveAxis(s.down('left'), s.down('right'), this.touchAxis.x, this.touchAxis.active);
      this._moveY = resolveAxis(s.down('up'), s.down('down'), this.touchAxis.y, this.touchAxis.active);
      this.nav = {
        dx: (this.repeat.tick('r', s.pressed('right'), s.down('right'), t) ? 1 : 0) -
          (this.repeat.tick('l', s.pressed('left'), s.down('left'), t) ? 1 : 0),
        dy: (this.repeat.tick('d', s.pressed('down'), s.down('down'), t) ? 1 : 0) -
          (this.repeat.tick('u', s.pressed('up'), s.down('up'), t) ? 1 : 0),
        confirm: s.pressed('interact') || s.pressed('jump'),
        back: s.pressed('pause'),
      };
    }
    if (aim) this.computeAim(aim);
    else if (!this.mouseEngaged || this.lastDevice === 'touch') this._aim = null;
  }

  /** Menu navigation edges for this frame (with key auto-repeat). */
  menuNav(): MenuNav {
    return this.nav;
  }

  consume(a: Action): void {
    this.state.consume(a);
    if (a === 'interact' || a === 'jump') this.nav = { ...this.nav, confirm: false };
    if (a === 'pause') this.nav = { ...this.nav, back: false };
  }

  releaseAll(): void {
    this.state.releaseAll();
    this.touchAxis = { x: 0, y: 0, active: false };
  }

  // ---------------------------------------------------------------- touch injection
  /** Analog stick from TouchScene, -1..1 each. `active` defaults to non-zero input. */
  setTouchAxis(x: number, y: number, active = x !== 0 || y !== 0): void {
    this.touchAxis = { x, y, active };
    if (active) this.markTouch();
    const st = this.state;
    const set = (a: Action, on: boolean) => (on ? st.press(a, 'stick') : st.release(a, 'stick'));
    set('left', active && x < -TOUCH_X_THRESHOLD);
    set('right', active && x > TOUCH_X_THRESHOLD);
    set('up', active && y < -TOUCH_Y_THRESHOLD);
    set('down', active && y > TOUCH_Y_THRESHOLD);
  }

  setTouchButton(a: Action, down: boolean): void {
    if (down) {
      this.markTouch();
      this.state.press(a, `touch:${a}`);
    } else {
      this.state.release(a, `touch:${a}`);
    }
  }

  // ---------------------------------------------------------------- internals
  private markMouse(): void {
    this.lastDevice = 'mouse';
    this.mouseEngaged = true;
    this.mouseActiveAt = now();
  }

  private markTouch(): void {
    this.lastDevice = 'touch';
    this.touchSeen = true;
    this.mouseEngaged = false;
  }

  private computeAim({ camera, fromX, fromY }: AimSource): void {
    if (!this.pointerSeen) {
      this._aim = null;
      return;
    }
    const wp = camera.getWorldPoint(this.pointer.x, this.pointer.y);
    this.pointerWorld.x = wp.x;
    this.pointerWorld.y = wp.y;
    if (!this.mouseEngaged || this.lastDevice === 'touch') {
      this._aim = null;
      return;
    }
    const dx = wp.x - fromX;
    const dy = wp.y - fromY;
    const len = Math.hypot(dx, dy);
    if (len >= 1) {
      this.lastAimDir = { x: dx / len, y: dy / len };
    }
    this._aim = { x: this.lastAimDir.x, y: this.lastAimDir.y };
  }
}

/** Global singleton. */
export const input = new InputManager();

/** Hide the OS cursor over the canvas while gameplay draws UI.cursor (mouse players). */
export function setCursorVisible(game: Phaser.Game, visible: boolean): void {
  if (game.canvas) game.canvas.style.cursor = visible ? 'default' : 'none';
}
