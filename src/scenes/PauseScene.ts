/**
 * Pause overlay launched by GameScene. ESC resumes (handled by GameScene while
 * this main menu is showing); sub-screens set GameScene.modalOpen so ESC goes
 * back to this menu instead.
 */
import Phaser from 'phaser';
import { UI_COLORS, TRACK_COLORS } from '../art/palette';
import { GAME_H, GAME_W } from '../config';
import { audio } from '../core/audio';
import { input } from '../core/input/InputManager';
import { session } from '../run/session';
import { Button, dimmer, drawPanel, fmtTime, keyLabel, Menu, txt } from '../ui/widgets';

interface GameLike {
  modalOpen: boolean;
  resumeFromPause(): void;
  abandonRun(): void;
}

export class PauseScene extends Phaser.Scene {
  private menu: Menu | null = null;
  private view: Phaser.GameObjects.Container | null = null;

  constructor() {
    super('Pause');
  }

  private get game2(): GameLike | null {
    return (this.scene.get('Game') as unknown as GameLike) ?? null;
  }

  create(): void {
    dimmer(this, 0.6);
    this.events.on(Phaser.Scenes.Events.RESUME, () => this.showMain());
    this.showMain();
    audio.sfx('uiBack');
  }

  private setSub(open: boolean): void {
    const g = this.game2;
    if (g) g.modalOpen = open;
  }

  private reset(): Phaser.GameObjects.Container {
    this.view?.destroy();
    this.menu = null;
    this.view = this.add.container(0, 0);
    return this.view;
  }

  private showMain(): void {
    this.setSub(false);
    const v = this.reset();
    const w = 200, h = 168;
    const x = (GAME_W - w) / 2, y = (GAME_H - h) / 2;
    v.add(drawPanel(this.add.graphics(), x, y, w, h, { edge: UI_COLORS.gold }));
    v.add(txt(this, GAME_W / 2, y + 8, 'PAUSED', { origin: [0.5, 0], big: true, tint: UI_COLORS.gold }));
    const run = session.run;
    if (run) {
      v.add(txt(this, GAME_W / 2, y + 30, `Depth ${run.floor}   ${fmtTime(run.timeMs)}   ${run.kills} kills`, { origin: [0.5, 0], tint: UI_COLORS.dim }));
      const sc = run.scrolls;
      const parts: [string, number][] = [
        [`Might ${sc.might}`, TRACK_COLORS.might],
        [`Cunning ${sc.cunning}`, TRACK_COLORS.cunning],
        [`Vigor ${sc.vigor}`, TRACK_COLORS.vigor],
      ];
      let tx = GAME_W / 2 - 66;
      parts.forEach(([s, c]) => {
        const t = txt(this, tx, y + 41, s, { tint: c });
        v.add(t);
        tx += t.width + 10;
      });
    }
    const items: [string, () => void][] = [
      ['Resume', () => this.game2?.resumeFromPause()],
      ['Settings', () => this.openSettings()],
      ['Controls', () => this.showControls()],
      ['Abandon run', () => this.showConfirm()],
    ];
    const buttons = items.map(([label, fn], i) => {
      const b = new Button(this, GAME_W / 2, y + 66 + i * 23, label, fn, { w: 140, h: 18, tint: label === 'Abandon run' ? 0xff9a8a : undefined });
      v.add(b.container);
      return b;
    });
    this.menu = new Menu(buttons);
  }

  private openSettings(): void {
    this.setSub(true);
    this.scene.pause();
    this.scene.launch('Settings', { from: 'Pause' });
    this.scene.bringToTop('Settings');
  }

  private showControls(): void {
    this.setSub(true);
    const v = this.reset();
    const w = 300, h = 196;
    const x = (GAME_W - w) / 2, y = (GAME_H - h) / 2;
    v.add(drawPanel(this.add.graphics(), x, y, w, h, { edge: UI_COLORS.gold }));
    v.add(txt(this, GAME_W / 2, y + 8, 'CONTROLS', { origin: [0.5, 0], big: true, tint: UI_COLORS.gold }));
    const touch = input.lastDevice === 'touch';
    const rows: [string, string][] = touch
      ? [
          ['Left stick', 'Move / climb ladders'],
          ['^', 'Jump, double jump, wall jump'],
          ['>>', 'Dodge roll (invulnerable)'],
          ['A / B', 'Weapon slots 1 / 2'],
          ['Q / E', 'Skill slots 1 / 2'],
          ['F', 'Interact'],
          ['+', 'Drink potion'],
          ['||', 'Pause'],
        ]
      : [
          ['A D / Arrows', 'Move     W/S climb ladders'],
          ['SPACE / Z', 'Jump, double jump, wall jump'],
          ['SHIFT / L', 'Dodge roll (invulnerable)'],
          ['J / LMB', 'Weapon slot 1'],
          ['K / RMB', 'Weapon slot 2 (hold to block)'],
          ['Q  E', 'Skill slots 1 / 2'],
          ['F / ENTER', 'Interact'],
          ['R', 'Drink potion'],
          ['S + SPACE', 'Drop through platforms'],
          ['Mouse', 'Aim ranged weapons & skills'],
        ];
    rows.forEach(([k, d], i) => {
      v.add(txt(this, x + 110, y + 34 + i * 13, k, { origin: [1, 0], tint: 0xffffff }));
      v.add(txt(this, x + 120, y + 34 + i * 13, d, { tint: UI_COLORS.dim }));
    });
    const back = new Button(this, GAME_W / 2, y + h - 14, 'Back', () => this.showMain(), { w: 80, h: 14 });
    v.add(back.container);
    this.menu = new Menu([back], { onBack: () => this.showMain() });
    void keyLabel;
  }

  private showConfirm(): void {
    this.setSub(true);
    const v = this.reset();
    const w = 240, h = 92;
    const x = (GAME_W - w) / 2, y = (GAME_H - h) / 2;
    v.add(drawPanel(this.add.graphics(), x, y, w, h, { edge: UI_COLORS.bad }));
    v.add(txt(this, GAME_W / 2, y + 10, 'Abandon this run?', { origin: [0.5, 0], tint: 0xffffff }));
    v.add(txt(this, GAME_W / 2, y + 24, 'Your depth is recorded. Unbanked', { origin: [0.5, 0], tint: UI_COLORS.dim }));
    v.add(txt(this, GAME_W / 2, y + 34, 'embers will be lost.', { origin: [0.5, 0], tint: UI_COLORS.ember }));
    const no = new Button(this, GAME_W / 2 - 50, y + 66, 'Keep going', () => this.showMain(), { w: 90, h: 16 });
    const yes = new Button(this, GAME_W / 2 + 50, y + 66, 'Abandon', () => this.game2?.abandonRun(), { w: 90, h: 16, tint: 0xff9a8a, edge: UI_COLORS.bad });
    v.add([no.container, yes.container]);
    this.menu = new Menu([no, yes], { columns: 2, onBack: () => this.showMain() });
  }

  override update(): void {
    input.update();
    this.menu?.update();
  }
}
