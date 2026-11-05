/**
 * Pure (DOM/Phaser-free) input logic: key-name mapping, multi-source action
 * holds and frame-correct edge detection. Unit-tested in tests/unit/input.test.ts.
 */
import { ACTIONS, KEY_BINDINGS, type Action } from './types';

/** Map KeyboardEvent.code (preferred) / .key to Phaser-style key names used in KEY_BINDINGS. */
export function keyNameFromEvent(code: string, key?: string): string | null {
  if (code) {
    if (code.startsWith('Key') && code.length === 4) return code.slice(3).toUpperCase();
    if (code.startsWith('Digit') && code.length === 6) return code.slice(5);
    switch (code) {
      case 'ArrowLeft': return 'LEFT';
      case 'ArrowRight': return 'RIGHT';
      case 'ArrowUp': return 'UP';
      case 'ArrowDown': return 'DOWN';
      case 'Space': return 'SPACE';
      case 'ShiftLeft':
      case 'ShiftRight': return 'SHIFT';
      case 'ControlLeft':
      case 'ControlRight': return 'CTRL';
      case 'AltLeft':
      case 'AltRight': return 'ALT';
      case 'Escape': return 'ESC';
      case 'Enter':
      case 'NumpadEnter': return 'ENTER';
      case 'Tab': return 'TAB';
      case 'Backspace': return 'BACKSPACE';
    }
  }
  if (key) {
    switch (key) {
      case 'ArrowLeft': case 'Left': return 'LEFT';
      case 'ArrowRight': case 'Right': return 'RIGHT';
      case 'ArrowUp': case 'Up': return 'UP';
      case 'ArrowDown': case 'Down': return 'DOWN';
      case ' ': case 'Spacebar': return 'SPACE';
      case 'Shift': return 'SHIFT';
      case 'Escape': case 'Esc': return 'ESC';
      case 'Enter': return 'ENTER';
    }
    if (key.length === 1) return key.toUpperCase();
  }
  return null;
}

/** Reverse map: key name -> actions bound to it. */
export function buildKeyMap(bindings: Record<Action, string[]> = KEY_BINDINGS): Map<string, Action[]> {
  const m = new Map<string, Action[]>();
  for (const a of ACTIONS) {
    for (const k of bindings[a] ?? []) {
      const list = m.get(k);
      if (list) list.push(a);
      else m.set(k, [a]);
    }
  }
  return m;
}

/**
 * Digital axis from two held flags, unless an analog (touch) axis is active,
 * in which case the analog value wins.
 */
export function resolveAxis(neg: boolean, pos: boolean, analog: number, analogActive: boolean): number {
  if (analogActive) return Math.max(-1, Math.min(1, analog));
  return (pos ? 1 : 0) - (neg ? 1 : 0);
}

/**
 * Tracks which sources hold each action and derives per-frame
 * down/pressed/released sets in `update()`. A press + release that both
 * happen between two updates still yields pressed() and down() for one frame.
 */
export class ActionState {
  private holds = new Map<Action, Set<string>>();
  private pendingPress = new Set<Action>();
  private pendingRelease = new Set<Action>();
  private prevHeld = new Set<Action>();
  private curDown = new Set<Action>();
  private curPressed = new Set<Action>();
  private curReleased = new Set<Action>();
  private heldSince = new Map<Action, number>();

  /** Register `source` holding `a`. Returns true if the action became held. */
  press(a: Action, source: string): boolean {
    let s = this.holds.get(a);
    if (!s) this.holds.set(a, (s = new Set()));
    if (s.has(source)) return false;
    const was = s.size > 0;
    s.add(source);
    if (!was) {
      this.pendingPress.add(a);
      return true;
    }
    return false;
  }

  /** Remove `source` from `a`. Returns true if the action became released. */
  release(a: Action, source: string): boolean {
    const s = this.holds.get(a);
    if (!s || !s.has(source)) return false;
    s.delete(source);
    if (s.size === 0) {
      this.pendingRelease.add(a);
      return true;
    }
    return false;
  }

  /** Release every action held by sources starting with `prefix`. */
  releaseSources(prefix: string): void {
    for (const [a, s] of this.holds) {
      for (const src of [...s]) if (src.startsWith(prefix)) this.release(a, src);
    }
  }

  releaseAll(): void {
    for (const [a, s] of this.holds) if (s.size > 0) this.pendingRelease.add(a);
    this.holds.clear();
  }

  isHeld(a: Action): boolean {
    const s = this.holds.get(a);
    return !!s && s.size > 0;
  }

  /** Advance one frame. `now` (ms) is used for hold durations. */
  update(now = 0): void {
    this.curDown.clear();
    this.curPressed.clear();
    this.curReleased.clear();
    const held = new Set<Action>();
    for (const a of ACTIONS) {
      const h = this.isHeld(a);
      if (h) held.add(a);
      const pressed = this.pendingPress.has(a) || (h && !this.prevHeld.has(a));
      const released = this.pendingRelease.has(a) || (!h && this.prevHeld.has(a));
      if (pressed) {
        this.curPressed.add(a);
        this.heldSince.set(a, now);
      }
      if (released) this.curReleased.add(a);
      if (h || pressed) this.curDown.add(a);
    }
    this.prevHeld = held;
    this.pendingPress.clear();
    this.pendingRelease.clear();
  }

  down(a: Action): boolean {
    return this.curDown.has(a);
  }

  pressed(a: Action): boolean {
    return this.curPressed.has(a);
  }

  released(a: Action): boolean {
    return this.curReleased.has(a);
  }

  /** Clear the pressed edge for this frame (and the tap-down if not actually held). */
  consume(a: Action): void {
    this.curPressed.delete(a);
    if (!this.isHeld(a)) this.curDown.delete(a);
  }

  /** ms the action has been held as of `now`, or 0 if not held. */
  heldFor(a: Action, now: number): number {
    if (!this.isHeld(a)) return 0;
    return now - (this.heldSince.get(a) ?? now);
  }
}

/** Auto-repeat helper for menu navigation (initial delay then steady repeat). */
export class RepeatTimer {
  private next = new Map<string, number>();
  constructor(private delayMs = 350, private intervalMs = 110) {}

  /** Returns true when the direction should fire this frame. */
  tick(id: string, pressed: boolean, held: boolean, now: number): boolean {
    if (pressed) {
      this.next.set(id, now + this.delayMs);
      return true;
    }
    if (!held) {
      this.next.delete(id);
      return false;
    }
    const t = this.next.get(id);
    if (t !== undefined && now >= t) {
      this.next.set(id, t + this.intervalMs < now ? now + this.intervalMs : t + this.intervalMs);
      return true;
    }
    return false;
  }
}
