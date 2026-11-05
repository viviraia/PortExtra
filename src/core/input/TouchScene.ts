/**
 * On-screen touch controls overlay (scene key 'Touch').
 * GameScene: `this.scene.launch('Touch')` once; it brings itself to the top.
 * Left half: floating virtual joystick. Right side: action buttons.
 * All state is injected into the `input` singleton.
 */
import Phaser from 'phaser';
import { GAME_H, GAME_W } from '../../config';
import { UI } from '../../art/keys';
import type { Settings } from '../../data/types';
import { saves } from '../save';
import { input } from './InputManager';
import type { Action } from './types';

type GlyphName = Parameters<typeof UI.btnGlyph>[0];

interface ButtonSpec {
  action: Action;
  glyph: GlyphName;
  label: string;
  x: number;
  y: number;
  r: number;
}

const BUTTONS: ButtonSpec[] = [
  { action: 'jump', glyph: 'jump', label: '^', x: 444, y: 228, r: 20 },
  { action: 'attack1', glyph: 'attack1', label: 'A', x: 400, y: 238, r: 16 },
  { action: 'attack2', glyph: 'attack2', label: 'B', x: 412, y: 192, r: 16 },
  { action: 'dodge', glyph: 'dodge', label: '>>', x: 456, y: 182, r: 15 },
  { action: 'skill1', glyph: 'skill1', label: 'Q', x: 358, y: 246, r: 14 },
  { action: 'skill2', glyph: 'skill2', label: 'E', x: 370, y: 206, r: 14 },
  { action: 'interact', glyph: 'interact', label: 'F', x: 420, y: 150, r: 11 },
  { action: 'potion', glyph: 'potion', label: '+', x: 456, y: 140, r: 11 },
  { action: 'pause', glyph: 'pause', label: '||', x: 462, y: 16, r: 10 },
];

const STICK_RADIUS = 32;
const STICK_TRAVEL = 26;
const STICK_DEADZONE = 0.15;
const STICK_IDLE = { x: 64, y: 206 };
const HIT_SLOP = 6;
const ALPHA_IDLE = 0.42;
const ALPHA_DOWN = 0.85;

interface Button extends ButtonSpec {
  container: Phaser.GameObjects.Container;
  pointerId: number | null;
  cooldown?: Phaser.GameObjects.Graphics;
}

export class TouchScene extends Phaser.Scene {
  private buttons: Button[] = [];
  private stickBase!: Phaser.GameObjects.Image | Phaser.GameObjects.Arc;
  private stickKnob!: Phaser.GameObjects.Image | Phaser.GameObjects.Arc;
  private stickPointer: number | null = null;
  private stickOrigin = { x: STICK_IDLE.x, y: STICK_IDLE.y };
  private root!: Phaser.GameObjects.Container;
  private shown = false;
  private cooldowns: [number, number] = [0, 0];

  constructor() {
    super('Touch');
  }

  /** Whether touch controls should be visible for the given setting. */
  static shouldShow(setting: Settings['touchControls']): boolean {
    if (setting === 'on') return true;
    if (setting === 'off') return false;
    return input.touchSeen || input.touchHint;
  }

  create(): void {
    this.scene.bringToTop();
    const mgr = this.input.manager;
    if (mgr.pointersTotal < 5) this.input.addPointer(5 - mgr.pointersTotal);

    this.root = this.add.container(0, 0).setDepth(1000);
    this.buildStick();
    for (const spec of BUTTONS) this.buttons.push(this.buildButton(spec));

    this.input.on('pointerdown', this.onDown, this);
    this.input.on('pointermove', this.onMove, this);
    this.input.on('pointerup', this.onUp, this);
    this.input.on('pointerupoutside', this.onUp, this);
    this.input.on('gameout', () => this.releaseEverything());
    this.events.on(Phaser.Scenes.Events.SLEEP, () => this.releaseEverything());
    this.events.on(Phaser.Scenes.Events.SHUTDOWN, () => this.releaseEverything());

    this.setShown(TouchScene.shouldShow(this.setting()));
  }

  override update(): void {
    const want = TouchScene.shouldShow(this.setting());
    if (want !== this.shown) this.setShown(want);
  }

  /** Cooldown overlay on a skill button: frac 1 = just used, 0 = ready. */
  setCooldown(slot: 0 | 1, frac: number): void {
    const f = Phaser.Math.Clamp(frac, 0, 1);
    if (Math.abs(this.cooldowns[slot] - f) < 0.005) return;
    this.cooldowns[slot] = f;
    const b = this.buttons.find((x) => x.action === (slot === 0 ? 'skill1' : 'skill2'));
    const g = b?.cooldown;
    if (!b || !g) return;
    g.clear();
    if (f <= 0) return;
    g.fillStyle(0x000000, 0.6);
    g.slice(0, 0, b.r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * f, false);
    g.fillPath();
  }

  // ------------------------------------------------------------------ build
  private setting(): Settings['touchControls'] {
    return saves.data.settings.touchControls;
  }

  private setShown(v: boolean): void {
    this.shown = v;
    this.root.setVisible(v);
    if (!v) this.releaseEverything();
  }

  private buildStick(): void {
    const { x, y } = STICK_IDLE;
    if (this.textures.exists(UI.stickBase)) {
      this.stickBase = this.add.image(x, y, UI.stickBase).setDisplaySize(STICK_RADIUS * 2, STICK_RADIUS * 2);
    } else {
      this.stickBase = this.add.circle(x, y, STICK_RADIUS, 0xffffff, 0.12).setStrokeStyle(2, 0xffffff, 0.5);
    }
    if (this.textures.exists(UI.stickKnob)) {
      this.stickKnob = this.add.image(x, y, UI.stickKnob).setDisplaySize(28, 28);
    } else {
      this.stickKnob = this.add.circle(x, y, 14, 0xffffff, 0.45);
    }
    this.stickBase.setAlpha(ALPHA_IDLE * 0.7);
    this.stickKnob.setAlpha(ALPHA_IDLE * 0.7);
    this.root.add([this.stickBase, this.stickKnob]);
  }

  private buildButton(spec: ButtonSpec): Button {
    const c = this.add.container(spec.x, spec.y);
    if (this.textures.exists(UI.button)) {
      c.add(this.add.image(0, 0, UI.button).setDisplaySize(spec.r * 2, spec.r * 2));
    } else {
      c.add(this.add.circle(0, 0, spec.r, 0x1a1826, 0.7).setStrokeStyle(1.5, 0xe8e0d0, 0.8));
    }
    let cooldown: Phaser.GameObjects.Graphics | undefined;
    if (spec.action === 'skill1' || spec.action === 'skill2') {
      cooldown = this.add.graphics();
      c.add(cooldown);
    }
    const glyphKey = UI.btnGlyph(spec.glyph);
    if (this.textures.exists(glyphKey)) {
      const img = this.add.image(0, 0, glyphKey);
      const max = spec.r * 1.2;
      if (img.width > max || img.height > max) img.setScale(max / Math.max(img.width, img.height));
      c.add(img);
    } else if (this.cache.bitmapFont.exists(UI.font)) {
      c.add(this.add.bitmapText(0, 0, UI.font, spec.label).setOrigin(0.5));
    } else {
      c.add(
        this.add
          .text(0, 0, spec.label, { fontFamily: 'monospace', fontSize: `${Math.round(spec.r * 0.8)}px`, color: '#e8e0d0' })
          .setOrigin(0.5)
          .setResolution(2),
      );
    }
    c.setAlpha(ALPHA_IDLE);
    this.root.add(c);
    return { ...spec, container: c, pointerId: null, cooldown };
  }

  // ------------------------------------------------------------------ pointers
  private accepts(p: Phaser.Input.Pointer): boolean {
    return this.shown && (p.wasTouch || this.setting() === 'on');
  }

  private hitButton(x: number, y: number): Button | null {
    let best: Button | null = null;
    let bestD = Infinity;
    for (const b of this.buttons) {
      if (b.pointerId !== null) continue;
      const d = Math.hypot(x - b.x, y - b.y);
      if (d <= b.r + HIT_SLOP && d < bestD) {
        best = b;
        bestD = d;
      }
    }
    return best;
  }

  private onDown(p: Phaser.Input.Pointer): void {
    if (!this.accepts(p)) return;
    const b = this.hitButton(p.x, p.y);
    if (b) {
      b.pointerId = p.id;
      b.container.setAlpha(ALPHA_DOWN).setScale(0.92);
      input.setTouchButton(b.action, true);
      return;
    }
    if (p.x < GAME_W / 2 && this.stickPointer === null) {
      this.stickPointer = p.id;
      const ox = Phaser.Math.Clamp(p.x, STICK_RADIUS + 2, GAME_W / 2 - STICK_RADIUS);
      const oy = Phaser.Math.Clamp(p.y, STICK_RADIUS + 2, GAME_H - STICK_RADIUS - 2);
      this.stickOrigin = { x: ox, y: oy };
      this.stickBase.setPosition(ox, oy).setAlpha(ALPHA_DOWN * 0.8);
      this.stickKnob.setAlpha(ALPHA_DOWN);
      this.moveStick(p.x, p.y);
    }
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (p.id === this.stickPointer) this.moveStick(p.x, p.y);
  }

  private onUp(p: Phaser.Input.Pointer): void {
    if (p.id === this.stickPointer) this.releaseStick();
    for (const b of this.buttons) if (b.pointerId === p.id) this.releaseButton(b);
  }

  private moveStick(px: number, py: number): void {
    let dx = px - this.stickOrigin.x;
    let dy = py - this.stickOrigin.y;
    const len = Math.hypot(dx, dy);
    if (len > STICK_TRAVEL) {
      dx = (dx / len) * STICK_TRAVEL;
      dy = (dy / len) * STICK_TRAVEL;
    }
    this.stickKnob.setPosition(this.stickOrigin.x + dx, this.stickOrigin.y + dy);
    let ax = dx / STICK_TRAVEL;
    let ay = dy / STICK_TRAVEL;
    if (Math.hypot(ax, ay) < STICK_DEADZONE) ax = ay = 0;
    input.setTouchAxis(ax, ay, true);
  }

  private releaseStick(): void {
    this.stickPointer = null;
    this.stickOrigin = { ...STICK_IDLE };
    this.stickBase.setPosition(STICK_IDLE.x, STICK_IDLE.y).setAlpha(ALPHA_IDLE * 0.7);
    this.stickKnob.setPosition(STICK_IDLE.x, STICK_IDLE.y).setAlpha(ALPHA_IDLE * 0.7);
    input.setTouchAxis(0, 0, false);
  }

  private releaseButton(b: Button): void {
    b.pointerId = null;
    b.container.setAlpha(ALPHA_IDLE).setScale(1);
    input.setTouchButton(b.action, false);
  }

  private releaseEverything(): void {
    if (this.stickPointer !== null) this.releaseStick();
    for (const b of this.buttons) if (b.pointerId !== null) this.releaseButton(b);
  }
}
