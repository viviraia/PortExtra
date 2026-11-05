/**
 * Shared pixel-UI building blocks: text, panels, buttons and navigable menus
 * that work with keyboard, mouse and touch.
 */
import Phaser from 'phaser';
import { UI } from '../art/keys';
import { UI_COLORS } from '../art/palette';
import { audio } from '../core/audio';
import { input } from '../core/input/InputManager';
import type { Action } from '../core/input/types';

export interface TextOpts {
  tint?: number;
  big?: boolean;
  origin?: [number, number] | number;
  shadow?: boolean;
  depth?: number;
  maxWidth?: number;
}

/** Crisp bitmap text with a 1px drop shadow for legibility. */
export function txt(scene: Phaser.Scene, x: number, y: number, s: string, o: TextOpts = {}): Phaser.GameObjects.BitmapText {
  const t = scene.add.bitmapText(Math.round(x), Math.round(y), o.big ? UI.fontBig : UI.font, s);
  t.setTint(o.tint ?? UI_COLORS.text);
  if (o.origin !== undefined) {
    if (typeof o.origin === 'number') t.setOrigin(o.origin);
    else t.setOrigin(o.origin[0], o.origin[1]);
  }
  if (o.shadow !== false) t.setDropShadow(1, 1, 0x000000, 0.85);
  if (o.depth !== undefined) t.setDepth(o.depth);
  if (o.maxWidth) t.setMaxWidth(o.maxWidth);
  return t;
}

/** Draw a beveled dark panel into a Graphics object. */
export function drawPanel(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, opts: { edge?: number; fill?: number; alpha?: number; glow?: boolean } = {}): Phaser.GameObjects.Graphics {
  const edge = opts.edge ?? UI_COLORS.panelEdge;
  const fill = opts.fill ?? UI_COLORS.panel;
  x = Math.round(x);
  y = Math.round(y);
  w = Math.round(w);
  h = Math.round(h);
  g.fillStyle(0x000000, 0.5).fillRect(x + 2, y + 2, w, h);
  g.fillStyle(UI_COLORS.outline, 1).fillRect(x - 1, y - 1, w + 2, h + 2);
  g.fillStyle(fill, opts.alpha ?? 0.94).fillRect(x, y, w, h);
  g.fillStyle(edge, 1);
  g.fillRect(x, y, w, 1);
  g.fillRect(x, y + h - 1, w, 1);
  g.fillRect(x, y, 1, h);
  g.fillRect(x + w - 1, y, 1, h);
  // Inner highlight + corner studs.
  g.fillStyle(0xffffff, 0.06).fillRect(x + 1, y + 1, w - 2, 1);
  g.fillStyle(edge, 1);
  for (const [cx, cy] of [
    [x + 1, y + 1],
    [x + w - 3, y + 1],
    [x + 1, y + h - 3],
    [x + w - 3, y + h - 3],
  ])
    g.fillRect(cx, cy, 2, 2);
  if (opts.glow) {
    g.lineStyle(1, edge, 0.35).strokeRect(x - 3, y - 3, w + 6, h + 6);
  }
  return g;
}

export function panel(scene: Phaser.Scene, x: number, y: number, w: number, h: number, opts: Parameters<typeof drawPanel>[5] = {}): Phaser.GameObjects.Graphics {
  return drawPanel(scene.add.graphics(), x, y, w, h, opts);
}

/** Full-screen dim layer that swallows pointer input. */
export function dimmer(scene: Phaser.Scene, alpha = 0.6): Phaser.GameObjects.Rectangle {
  const r = scene.add.rectangle(0, 0, scene.scale.width, scene.scale.height, 0x05040a, alpha).setOrigin(0).setInteractive();
  return r;
}

export function fmtTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m % 60)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

/** Short label of the key/button bound to an action for the current device. */
export function keyLabel(a: Action): string {
  const dev = input.lastDevice;
  if (dev === 'touch') {
    const t: Partial<Record<Action, string>> = { attack1: 'A', attack2: 'B', skill1: 'Q', skill2: 'E', interact: 'F', potion: '+', jump: '^', dodge: '>>', pause: '||' };
    return t[a] ?? '';
  }
  const mouse = dev === 'mouse';
  const k: Record<Action, string> = {
    left: 'A',
    right: 'D',
    up: 'W',
    down: 'S',
    jump: 'SPACE',
    attack1: mouse ? 'LMB' : 'J',
    attack2: mouse ? 'RMB' : 'K',
    dodge: 'SHIFT',
    skill1: 'Q',
    skill2: 'E',
    interact: 'F',
    potion: 'R',
    pause: 'ESC',
  };
  return k[a];
}

/** Word-wrap a string to lines of at most `width` pixels for the 'pixel' font (~6px per char). */
export function wrap(s: string, width: number, charW = 5.4): string[] {
  const max = Math.max(4, Math.floor(width / charW));
  const out: string[] = [];
  for (const para of s.split('\n')) {
    let line = '';
    for (const w of para.split(' ')) {
      if (!line) line = w;
      else if ((line + ' ' + w).length <= max) line += ' ' + w;
      else {
        out.push(line);
        line = w;
      }
    }
    out.push(line);
  }
  return out;
}

// ---------------------------------------------------------------------------

export interface ButtonOpts {
  w?: number;
  h?: number;
  tint?: number;
  edge?: number;
  disabled?: boolean;
  big?: boolean;
  sub?: string;
}

/** A selectable panel button. Selection highlighting is driven by Menu. */
export class Button {
  readonly container: Phaser.GameObjects.Container;
  private g: Phaser.GameObjects.Graphics;
  private label: Phaser.GameObjects.BitmapText;
  private subLabel: Phaser.GameObjects.BitmapText | null = null;
  selected = false;
  disabled: boolean;
  readonly w: number;
  readonly h: number;

  constructor(
    private scene: Phaser.Scene,
    x: number,
    y: number,
    text: string,
    public onClick: () => void,
    private o: ButtonOpts = {},
  ) {
    this.w = o.w ?? 120;
    this.h = o.h ?? 18;
    this.disabled = !!o.disabled;
    this.container = scene.add.container(Math.round(x), Math.round(y));
    this.g = scene.add.graphics();
    this.label = txt(scene, 0, o.sub ? -4 : 0, text, { origin: 0.5, big: o.big, tint: o.tint });
    this.container.add([this.g, this.label]);
    if (o.sub) {
      this.subLabel = txt(scene, 0, 5, o.sub, { origin: 0.5, tint: UI_COLORS.dim });
      this.container.add(this.subLabel);
    }
    const hit = scene.add.zone(0, 0, this.w, this.h).setInteractive({ useHandCursor: true });
    this.container.add(hit);
    hit.on('pointerover', () => this.onHover?.());
    hit.on('pointerdown', () => {
      this.onHover?.();
      this.press();
    });
    this.redraw();
  }

  onHover?: () => void;

  setText(s: string): void {
    this.label.setText(s);
  }

  setSub(s: string): void {
    this.subLabel?.setText(s);
  }

  setDisabled(d: boolean): void {
    this.disabled = d;
    this.redraw();
  }

  setSelected(s: boolean): void {
    if (this.selected === s) return;
    this.selected = s;
    this.redraw();
  }

  press(): void {
    if (this.disabled) {
      audio.sfx('denied');
      return;
    }
    audio.sfx('uiSelect');
    this.scene.tweens.add({ targets: this.container, scale: 0.94, duration: 50, yoyo: true });
    this.onClick();
  }

  private redraw(): void {
    const g = this.g.clear();
    const w = this.w, h = this.h;
    const edge = this.selected ? (this.o.edge ?? UI_COLORS.gold) : UI_COLORS.panelEdge;
    drawPanel(g, -w / 2, -h / 2, w, h, { edge, fill: this.selected ? 0x251f36 : UI_COLORS.panel });
    if (this.selected) {
      g.fillStyle(this.o.edge ?? UI_COLORS.gold, 1);
      g.fillTriangle(-w / 2 - 7, -3, -w / 2 - 7, 3, -w / 2 - 3, 0);
      g.fillTriangle(w / 2 + 6, -3, w / 2 + 6, 3, w / 2 + 2, 0);
    }
    const base = this.o.tint ?? UI_COLORS.text;
    this.label.setTint(this.disabled ? UI_COLORS.dim : this.selected ? 0xffffff : base);
    this.container.setAlpha(this.disabled ? 0.7 : 1);
  }

  destroy(): void {
    this.container.destroy();
  }
}

/**
 * Keyboard/gamepad-style navigation over a set of buttons (vertical or grid).
 * Call update() every frame.
 */
export class Menu {
  index = 0;
  enabled = true;

  constructor(
    public buttons: Button[],
    private opts: { columns?: number; onBack?: () => void; wrap?: boolean } = {},
  ) {
    buttons.forEach((b, i) => {
      b.onHover = () => {
        if (!this.enabled) return;
        if (this.index !== i) audio.sfx('uiMove', { volume: 0.5 });
        this.select(i);
      };
    });
    this.select(0);
  }

  select(i: number): void {
    if (!this.buttons.length) return;
    this.index = Phaser.Math.Wrap(i, 0, this.buttons.length);
    this.buttons.forEach((b, k) => b.setSelected(k === this.index));
  }

  update(): void {
    if (!this.enabled || !this.buttons.length) return;
    const nav = input.menuNav();
    const cols = this.opts.columns ?? 1;
    let d = 0;
    if (cols === 1) d = nav.dy !== 0 ? nav.dy : 0;
    else d = nav.dx + nav.dy * cols;
    if (d !== 0) {
      audio.sfx('uiMove', { volume: 0.5 });
      this.select(this.index + d);
    }
    if (nav.confirm) {
      input.consume('interact');
      input.consume('jump');
      this.buttons[this.index]?.press();
    } else if (nav.back && this.opts.onBack) {
      input.consume('pause');
      audio.sfx('uiBack');
      this.opts.onBack();
    }
  }
}
