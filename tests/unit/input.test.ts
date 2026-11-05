import { describe, expect, it } from 'vitest';
import { ActionState, RepeatTimer, buildKeyMap, keyNameFromEvent, resolveAxis } from '../../src/core/input/ActionState';
import { KEY_BINDINGS } from '../../src/core/input/types';

describe('keyNameFromEvent', () => {
  it('maps codes to binding names', () => {
    expect(keyNameFromEvent('KeyA')).toBe('A');
    expect(keyNameFromEvent('ArrowLeft')).toBe('LEFT');
    expect(keyNameFromEvent('Space')).toBe('SPACE');
    expect(keyNameFromEvent('ShiftRight')).toBe('SHIFT');
    expect(keyNameFromEvent('Escape')).toBe('ESC');
    expect(keyNameFromEvent('NumpadEnter')).toBe('ENTER');
    expect(keyNameFromEvent('', 'q')).toBe('Q');
    expect(keyNameFromEvent('', ' ')).toBe('SPACE');
    expect(keyNameFromEvent('F13')).toBeNull();
  });
  it('every binding name is reachable from some code', () => {
    const codes = ['KeyA', 'ArrowLeft', 'KeyD', 'ArrowRight', 'KeyW', 'ArrowUp', 'KeyS', 'ArrowDown', 'Space', 'KeyZ', 'KeyJ',
      'KeyX', 'KeyK', 'KeyC', 'ShiftLeft', 'KeyL', 'KeyQ', 'KeyU', 'KeyE', 'KeyI', 'KeyF', 'Enter', 'KeyR', 'KeyH', 'Escape', 'KeyP'];
    const names = new Set(codes.map((c) => keyNameFromEvent(c)));
    for (const list of Object.values(KEY_BINDINGS)) for (const k of list) expect(names.has(k)).toBe(true);
  });
  it('buildKeyMap reverses bindings', () => {
    const m = buildKeyMap();
    expect(m.get('SPACE')).toEqual(['jump']);
    expect(m.get('LEFT')).toEqual(['left']);
    expect(m.get('SHIFT')).toEqual(['dodge']);
  });
});

describe('ActionState', () => {
  it('press/hold/release edges', () => {
    const s = new ActionState();
    s.press('jump', 'key:SPACE');
    s.update();
    expect(s.pressed('jump')).toBe(true);
    expect(s.down('jump')).toBe(true);
    s.update();
    expect(s.pressed('jump')).toBe(false);
    expect(s.down('jump')).toBe(true);
    s.release('jump', 'key:SPACE');
    s.update();
    expect(s.released('jump')).toBe(true);
    expect(s.down('jump')).toBe(false);
    s.update();
    expect(s.released('jump')).toBe(false);
  });

  it('short tap within one frame still registers for exactly one frame', () => {
    const s = new ActionState();
    s.update();
    s.press('attack1', 'mouse:0');
    s.release('attack1', 'mouse:0');
    s.update();
    expect(s.pressed('attack1')).toBe(true);
    expect(s.down('attack1')).toBe(true);
    expect(s.released('attack1')).toBe(true);
    s.update();
    expect(s.pressed('attack1')).toBe(false);
    expect(s.down('attack1')).toBe(false);
    expect(s.released('attack1')).toBe(false);
  });

  it('multiple sources: released only when all let go', () => {
    const s = new ActionState();
    s.press('left', 'key:A');
    s.press('left', 'key:LEFT');
    s.update();
    s.release('left', 'key:A');
    s.update();
    expect(s.down('left')).toBe(true);
    expect(s.released('left')).toBe(false);
    s.release('left', 'key:LEFT');
    s.update();
    expect(s.released('left')).toBe(true);
  });

  it('repeated press from the same source is ignored', () => {
    const s = new ActionState();
    s.press('jump', 'k');
    s.update();
    s.press('jump', 'k');
    s.update();
    expect(s.pressed('jump')).toBe(false);
  });

  it('consume clears the pressed edge', () => {
    const s = new ActionState();
    s.press('interact', 'k');
    s.update();
    s.consume('interact');
    expect(s.pressed('interact')).toBe(false);
    expect(s.down('interact')).toBe(true); // still physically held
    const t = new ActionState();
    t.press('interact', 'k');
    t.release('interact', 'k');
    t.update();
    t.consume('interact');
    expect(t.down('interact')).toBe(false); // tap fully consumed
  });

  it('releaseAll releases everything with edges', () => {
    const s = new ActionState();
    s.press('left', 'a');
    s.press('dodge', 'b');
    s.update();
    s.releaseAll();
    s.update();
    expect(s.down('left')).toBe(false);
    expect(s.released('left')).toBe(true);
    expect(s.released('dodge')).toBe(true);
    s.update();
    expect(s.released('left')).toBe(false);
  });

  it('releaseSources by prefix', () => {
    const s = new ActionState();
    s.press('jump', 'touch:jump');
    s.press('left', 'key:A');
    s.update();
    s.releaseSources('touch:');
    s.update();
    expect(s.down('jump')).toBe(false);
    expect(s.down('left')).toBe(true);
  });

  it('heldFor tracks duration', () => {
    const s = new ActionState();
    s.press('attack2', 'k');
    s.update(100);
    expect(s.heldFor('attack2', 400)).toBe(300);
    s.release('attack2', 'k');
    s.update(500);
    expect(s.heldFor('attack2', 600)).toBe(0);
  });
});

describe('resolveAxis', () => {
  it('opposite keys cancel', () => {
    expect(resolveAxis(true, true, 0, false)).toBe(0);
    expect(resolveAxis(true, false, 0, false)).toBe(-1);
    expect(resolveAxis(false, true, 0, false)).toBe(1);
  });
  it('active touch axis overrides keys and clamps', () => {
    expect(resolveAxis(true, false, 0.5, true)).toBe(0.5);
    expect(resolveAxis(false, false, -2, true)).toBe(-1);
    expect(resolveAxis(false, true, 0.5, false)).toBe(1);
  });
});

describe('RepeatTimer', () => {
  it('fires on press, then after delay at interval', () => {
    const r = new RepeatTimer(300, 100);
    expect(r.tick('d', true, true, 0)).toBe(true);
    expect(r.tick('d', false, true, 200)).toBe(false);
    expect(r.tick('d', false, true, 300)).toBe(true);
    expect(r.tick('d', false, true, 350)).toBe(false);
    expect(r.tick('d', false, true, 400)).toBe(true);
    expect(r.tick('d', false, false, 500)).toBe(false);
    expect(r.tick('d', false, true, 600)).toBe(false);
  });
});
