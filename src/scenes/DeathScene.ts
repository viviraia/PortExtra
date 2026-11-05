/** Results screen: depth reached (the score), run stats and the hall of descents. */
import Phaser from 'phaser';
import { FX, iconTex } from '../art/keys';
import { UI_COLORS } from '../art/palette';
import { GAME_H, GAME_W } from '../config';
import { audio } from '../core/audio';
import { input } from '../core/input/InputManager';
import { recordRun, saves } from '../core/save';
import { WEAPONS } from '../data';
import type { RunRecord } from '../data/types';
import { Button, drawPanel, fmtTime, Menu, txt } from '../ui/widgets';

export class DeathScene extends Phaser.Scene {
  private menu: Menu | null = null;
  private leaving = false;

  constructor() {
    super('Death');
  }

  create(data: { record: RunRecord; embersLost?: number }): void {
    this.leaving = false;
    this.menu = null;
    const rec = data.record;
    const prevBest = saves.data.history.reduce((m, r) => Math.max(m, r.depth), 0);
    const rank = recordRun(saves.data, rec);
    saves.save();
    const newBest = rec.depth > prevBest && saves.data.history.length > 1;
    audio.music('death');

    this.cameras.main.setBackgroundColor(0x07050a);
    // Falling ash.
    if (this.textures.exists(FX.particle)) {
      this.add.particles(0, -4, FX.particle, {
        x: { min: 0, max: GAME_W },
        speedY: { min: 8, max: 22 },
        speedX: { min: -6, max: 6 },
        lifespan: 14000,
        scale: { min: 0.3, max: 0.7 },
        alpha: { start: 0.5, end: 0 },
        tint: [0x5a4a5a, 0x8a3a2a, 0x3a3040],
        frequency: 120,
      });
    }
    const red = this.add.image(GAME_W / 2, 30, FX.glow).setTint(0xa01020).setBlendMode(Phaser.BlendModes.ADD).setScale(6, 1.4).setAlpha(0);
    this.tweens.add({ targets: red, alpha: 0.35, duration: 1500 });

    const title = txt(this, GAME_W / 2, 18, 'YOU FELL', { origin: 0.5, big: true, tint: 0xe04040 }).setAlpha(0).setScale(1.6);
    this.tweens.add({ targets: title, alpha: 1, scale: 1, duration: 700, ease: 'Cubic.easeOut' });
    txt(this, GAME_W / 2, 36, rec.cause && rec.cause !== 'Debug' ? `Slain by ${rec.cause}` : 'Your light went out', { origin: 0.5, tint: UI_COLORS.dim });

    // ---- left: the score ----
    const lx = 14, ly = 50, lw = 186, lh = 176;
    drawPanel(this.add.graphics(), lx, ly, lw, lh, { edge: newBest ? UI_COLORS.gold : UI_COLORS.panelEdge });
    txt(this, lx + lw / 2, ly + 8, 'DEPTH REACHED', { origin: [0.5, 0], tint: UI_COLORS.dim });
    const depthText = txt(this, lx + lw / 2, ly + 40, '0', { origin: 0.5, big: true, tint: 0xffffff }).setScale(2);
    const counter = { v: 0 };
    this.tweens.add({
      targets: counter,
      v: rec.depth,
      duration: Math.min(1500, 200 + rec.depth * 80),
      delay: 400,
      ease: 'Cubic.easeOut',
      onUpdate: () => depthText.setText(String(Math.round(counter.v))),
      onComplete: () => {
        audio.sfx(newBest ? 'unlock' : 'uiSelect');
        this.tweens.add({ targets: depthText, scale: 2.4, duration: 90, yoyo: true });
      },
    });
    if (newBest) {
      const nb = txt(this, lx + lw / 2, ly + 60, 'NEW PERSONAL BEST!', { origin: [0.5, 0], tint: UI_COLORS.gold });
      this.tweens.add({ targets: nb, alpha: 0.35, duration: 400, yoyo: true, repeat: -1 });
    }
    const rows: [string, string, number][] = [
      ['Kills', String(rec.kills), 0xffffff],
      ['Time', fmtTime(rec.timeMs), 0xffffff],
      ['Coins earned', String(rec.coins), UI_COLORS.gold],
      ['Embers lost', String(data.embersLost ?? 0), (data.embersLost ?? 0) > 0 ? UI_COLORS.bad : UI_COLORS.dim],
      ['Coins in purse', String(saves.data.coins), UI_COLORS.gold],
      ['Embers banked', String(saves.data.embers), UI_COLORS.ember],
    ];
    rows.forEach(([k, v, c], i) => {
      const y = ly + 74 + i * 13;
      txt(this, lx + 10, y, k, { tint: UI_COLORS.dim });
      txt(this, lx + lw - 10, y, v, { origin: [1, 0], tint: c });
    });
    if (rec.weapon && WEAPONS[rec.weapon]) {
      this.add.image(lx + 18, ly + lh - 14, iconTex(rec.weapon));
      txt(this, lx + 30, ly + lh - 18, `Wielding ${WEAPONS[rec.weapon].name}`, { tint: UI_COLORS.dim });
    }

    // ---- right: hall of descents ----
    const rx = 208, ry = 50, rw = GAME_W - rx - 14, rh = 176;
    drawPanel(this.add.graphics(), rx, ry, rw, rh);
    txt(this, rx + rw / 2, ry + 8, 'HALL OF DESCENTS', { origin: [0.5, 0], tint: UI_COLORS.gold });
    const cols = [rx + 10, rx + 30, rx + 72, rx + 112, rx + 158];
    ['#', 'DEPTH', 'KILLS', 'TIME', 'DATE'].forEach((h, i) => txt(this, cols[i], ry + 22, h, { tint: UI_COLORS.dim }));
    const g = this.add.graphics();
    saves.data.history.forEach((r, i) => {
      const y = ry + 34 + i * 13;
      const mine = i === rank;
      if (mine) {
        g.fillStyle(UI_COLORS.gold, 0.18).fillRect(rx + 4, y - 2, rw - 8, 12);
        const hl = this.add.rectangle(rx + 4, y - 2, rw - 8, 12, UI_COLORS.gold, 0.15).setOrigin(0);
        this.tweens.add({ targets: hl, alpha: 0, duration: 500, yoyo: true, repeat: -1 });
      }
      const tint = mine ? 0xffffff : i === 0 ? UI_COLORS.gold : UI_COLORS.text;
      const d = new Date(r.date);
      const date = isNaN(d.getTime()) ? '' : `${d.getMonth() + 1}/${d.getDate()}`;
      [String(i + 1), String(r.depth), String(r.kills), fmtTime(r.timeMs), date].forEach((s, k) => txt(this, cols[k], y, s, { tint: k === 1 ? (mine ? UI_COLORS.gold : tint) : tint }));
    });
    if (rank < 0) txt(this, rx + rw / 2, ry + rh - 14, 'This run did not make the top 10', { origin: [0.5, 0], tint: UI_COLORS.dim });

    // Continue (after a short beat so mashing doesn't skip the screen).
    this.time.delayedCall(900, () => {
      const b = new Button(this, GAME_W / 2, GAME_H - 22, 'Return to the Sanctum', () => this.leave(), { w: 170, h: 18, edge: UI_COLORS.ember });
      b.container.setAlpha(0);
      this.tweens.add({ targets: b.container, alpha: 1, duration: 300 });
      this.menu = new Menu([b], { onBack: () => this.leave() });
      input.releaseAll();
    });
    this.cameras.main.fadeIn(600, 0, 0, 0);
  }

  private leave(): void {
    if (this.leaving) return;
    this.leaving = true;
    this.cameras.main.fadeOut(400, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('Sanctum'));
  }

  override update(): void {
    input.update();
    this.menu?.update();
  }
}
