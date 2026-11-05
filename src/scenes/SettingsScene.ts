/**
 * Settings overlay (from Title or Pause). Changes apply live and persist.
 * Launch with data { from: callerSceneKey }.
 */
import Phaser from 'phaser';
import { UI_COLORS } from '../art/palette';
import { GAME_H, GAME_W } from '../config';
import { audio } from '../core/audio';
import { input } from '../core/input/InputManager';
import { saves } from '../core/save';
import type { Settings } from '../data/types';
import { Button, dimmer, drawPanel, Menu, txt } from '../ui/widgets';

type Row =
  | { kind: 'slider'; key: 'master' | 'music' | 'sfx'; label: string }
  | { kind: 'toggle'; key: 'screenShake' | 'damageNumbers'; label: string }
  | { kind: 'choice'; key: 'touchControls'; label: string; options: Settings['touchControls'][] };

const ROWS: Row[] = [
  { kind: 'slider', key: 'master', label: 'Master volume' },
  { kind: 'slider', key: 'music', label: 'Music' },
  { kind: 'slider', key: 'sfx', label: 'Sound effects' },
  { kind: 'toggle', key: 'screenShake', label: 'Screen shake' },
  { kind: 'toggle', key: 'damageNumbers', label: 'Damage numbers' },
  { kind: 'choice', key: 'touchControls', label: 'Touch controls', options: ['auto', 'on', 'off'] },
];

const W = 280;
const ROW_H = 20;

export class SettingsScene extends Phaser.Scene {
  private menu!: Menu;
  private from = '';
  private valueDraw: (() => void)[] = [];

  constructor() {
    super('Settings');
  }

  create(data: { from?: string }): void {
    this.from = data?.from ?? '';
    this.valueDraw = [];
    dimmer(this, 0.6);
    const h = 44 + ROWS.length * ROW_H + 30;
    const x = (GAME_W - W) / 2;
    const y = (GAME_H - h) / 2;
    drawPanel(this.add.graphics(), x, y, W, h, { edge: UI_COLORS.gold });
    txt(this, GAME_W / 2, y + 8, 'SETTINGS', { origin: [0.5, 0], big: true, tint: UI_COLORS.gold });

    const buttons: Button[] = [];
    ROWS.forEach((row, i) => {
      const ry = y + 44 + i * ROW_H;
      const b = new Button(this, GAME_W / 2, ry, '', () => this.adjust(row, 1, true), { w: W - 20, h: ROW_H - 4 });
      b.container.add(txt(this, -(W - 20) / 2 + 8, -4, row.label));
      const g = this.add.graphics();
      const val = txt(this, (W - 20) / 2 - 8, -4, '', { origin: [1, 0], tint: UI_COLORS.gold });
      b.container.add([g, val]);
      const sx = 10, sw = 90;
      const draw = () => {
        const s = saves.data.settings;
        g.clear();
        if (row.kind === 'slider') {
          const v = s[row.key];
          g.fillStyle(0x000000, 0.6).fillRect(sx, -2, sw, 4);
          g.fillStyle(UI_COLORS.gold, 1).fillRect(sx, -2, Math.round(sw * v), 4);
          g.fillStyle(0xffffff, 1).fillRect(sx + Math.round(sw * v) - 1, -4, 3, 8);
          val.setText(`${Math.round(v * 100)}%`);
        } else if (row.kind === 'toggle') {
          val.setText(s[row.key] ? 'ON' : 'OFF').setTint(s[row.key] ? UI_COLORS.good : UI_COLORS.dim);
        } else {
          val.setText(`< ${s[row.key].toUpperCase()} >`);
        }
      };
      this.valueDraw.push(draw);
      draw();
      if (row.kind === 'slider') {
        const z = this.add.zone(sx - 4, -6, sw + 8, 12).setOrigin(0).setInteractive({ useHandCursor: true });
        b.container.add(z);
        const setFrom = (p: Phaser.Input.Pointer) => {
          const local = p.x - (b.container.x + sx);
          saves.data.settings[row.key] = Phaser.Math.Clamp(Math.round((local / sw) * 20) / 20, 0, 1);
          this.apply();
          draw();
        };
        z.on('pointerdown', setFrom);
        z.on('pointermove', (p: Phaser.Input.Pointer) => p.isDown && setFrom(p));
      }
      buttons.push(b);
    });
    const back = new Button(this, GAME_W / 2, y + h - 16, 'Back', () => this.close(), { w: 90, h: 14 });
    buttons.push(back);
    this.menu = new Menu(buttons, { onBack: () => this.close() });
  }

  private apply(): void {
    const s = saves.data.settings;
    audio.setVolumes(s.master, s.music, s.sfx);
  }

  private adjust(row: Row, dir: number, fromConfirm = false): void {
    const s = saves.data.settings;
    if (row.kind === 'slider') {
      if (fromConfirm) return;
      s[row.key] = Phaser.Math.Clamp(Math.round((s[row.key] + dir * 0.1) * 10) / 10, 0, 1);
      this.apply();
      audio.sfx('uiMove');
    } else if (row.kind === 'toggle') {
      s[row.key] = !s[row.key];
    } else {
      const i = row.options.indexOf(s[row.key]);
      s[row.key] = row.options[Phaser.Math.Wrap(i + dir, 0, row.options.length)];
    }
    this.valueDraw.forEach((d) => d());
  }

  private close(): void {
    saves.save();
    audio.sfx('uiBack');
    input.releaseAll();
    this.scene.stop();
    if (this.from && this.scene.get(this.from)) this.scene.resume(this.from);
  }

  override update(): void {
    input.update();
    const nav = input.menuNav();
    const row = ROWS[this.menu.index];
    if (row && nav.dx !== 0) this.adjust(row, nav.dx);
    this.menu.update();
  }
}
