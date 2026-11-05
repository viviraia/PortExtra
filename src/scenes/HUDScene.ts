/**
 * In-run heads-up display. Purely event-driven from the bus (plus the run
 * timer read from the session). Also routes 'ui:open' requests to ModalScene
 * and shows the floor intro banner and first-run tutorial.
 */
import Phaser from 'phaser';
import { FX, OBJ, UI, iconTex } from '../art/keys';
import { RARITY_COLORS, TRACK_COLORS, UI_COLORS } from '../art/palette';
import { GAME_H, GAME_W } from '../config';
import { audio } from '../core/audio';
import { bus, type GameEvents } from '../core/events';
import { input } from '../core/input/InputManager';
import { TouchScene } from '../core/input/TouchScene';
import type { Action } from '../core/input/types';
import { saves } from '../core/save';
import type { ItemInstance, StatTrack } from '../data/types';
import { session } from '../run/session';
import { BIOMES } from '../data';
import { biomeForFloor, isBossFloor } from '../world/difficulty';
import { drawPanel, fmtTime, keyLabel, panel, txt } from '../ui/widgets';
import { showTutorial } from '../ui/tutorial';

const HP_W = 112;

interface SlotView {
  root: Phaser.GameObjects.Container;
  frame: Phaser.GameObjects.Graphics;
  icon: Phaser.GameObjects.Image;
  cd: Phaser.GameObjects.Graphics;
  key: Phaser.GameObjects.BitmapText;
  action: Action;
  item: ItemInstance | null;
}

export class HUDScene extends Phaser.Scene {
  private offs: (() => void)[] = [];
  private touch = false;

  // HP
  private hpG!: Phaser.GameObjects.Graphics;
  private hpText!: Phaser.GameObjects.BitmapText;
  private hp = 100;
  private hpMax = 100;
  private hpShown = 100;
  private hpTrail = 100;
  private trailDelayUntil = 0;
  private hpFlashUntil = 0;

  private potions: Phaser.GameObjects.Image[] = [];
  private scrollTexts: Partial<Record<StatTrack, Phaser.GameObjects.BitmapText>> = {};
  private coinText!: Phaser.GameObjects.BitmapText;
  private emberText!: Phaser.GameObjects.BitmapText;
  private emberIcon!: Phaser.GameObjects.Image;
  private emberUnbanked = 0;
  private coinShown = 0;
  private coinTarget = 0;

  private depthText!: Phaser.GameObjects.BitmapText;
  private biomeText!: Phaser.GameObjects.BitmapText;
  private statText!: Phaser.GameObjects.BitmapText;
  private kills = 0;

  private slots: SlotView[] = [];
  private relicIcons: Phaser.GameObjects.Image[] = [];
  private relicRoot!: Phaser.GameObjects.Container;

  private bossRoot!: Phaser.GameObjects.Container;
  private bossG!: Phaser.GameObjects.Graphics;
  private bossName!: Phaser.GameObjects.BitmapText;
  private bossTitle!: Phaser.GameObjects.BitmapText;
  private bossHp = 1;
  private bossMax = 1;
  private bossShown = 1;

  private toasts: Phaser.GameObjects.Container[] = [];
  private promptRoot!: Phaser.GameObjects.Container;
  private promptG!: Phaser.GameObjects.Graphics;
  private promptText!: Phaser.GameObjects.BitmapText;
  private promptRaw: string | null = null;
  private promptDevice = '';

  private vignette!: Phaser.GameObjects.Image;
  private skillCd: [number, number] = [0, 0];
  private lowMuffled = false;
  private blocked = false;
  private tutorialRoot: Phaser.GameObjects.Container | null = null;

  constructor() {
    super('HUD');
  }

  create(): void {
    this.offs = [];
    this.blocked = false;
    this.tutorialRoot = null;
    this.slots = [];
    this.potions = [];
    this.relicIcons = [];
    this.toasts = [];
    this.touch = TouchScene.shouldShow(saves.data.settings.touchControls);

    this.makeVignette();
    this.buildTopLeft();
    this.buildTopRight();
    this.buildSlots();
    this.buildBoss();
    this.buildPrompt();

    const on = <K extends keyof GameEvents>(ev: K, fn: (p: GameEvents[K]) => void) => this.offs.push(bus.on(ev, fn));
    on('player:hp', (e) => this.setHp(e.hp, e.max));
    on('player:potions', (e) => this.setPotions(e.charges, e.max));
    on('run:coins', (e) => {
      this.coinTarget = e.coins;
      if (e.delta === 0) this.coinShown = e.coins;
      if (e.delta > 0) this.bump(this.coinText);
    });
    on('run:embers', (e) => {
      this.emberUnbanked = e.unbanked;
      this.emberText.setText(String(e.unbanked));
      if (e.delta > 0) this.bump(this.emberText);
    });
    on('run:kills', (e) => (this.kills = e.kills));
    on('run:floor', (e) => this.onFloor(e));
    on('run:loadout', (e) => this.setLoadout(e.weapons, e.skills, e.relics));
    on('run:scrolls', (e) => this.setScrolls(e));
    on('skill:cooldown', (e) => this.setCooldown(e.slot, e.remaining, e.total));
    on('boss:show', (e) => this.showBoss(e.name, e.title, e.hp, e.max));
    on('boss:hp', (e) => {
      this.bossHp = e.hp;
      this.bossMax = e.max;
    });
    on('boss:hide', () => this.hideBoss());
    on('toast', (e) => this.toast(e.text, e.color));
    on('prompt', (e) => this.setPrompt(e.text));
    on('ui:open', (e) => {
      this.setBlocked(true);
      this.openModal(e);
    });
    on('ui:closed', () => this.setBlocked(false));
    on('game:pause', (e) => this.setBlocked(e.paused));
    on('player:died', () => this.onDied());
    on('player:revived', () => this.toast('Reborn from the ashes', 0xffb02e));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.offs.forEach((o) => o());
      this.offs = [];
    });

    // The first floor's 'run:floor' fires before this scene exists: replay it.
    const run = session.run;
    if (run) {
      const biome = biomeForFloor(run.floor);
      const b = BIOMES[biome];
      this.onFloor({ floor: run.floor, biome, biomeName: b?.name ?? biome, tagline: b?.tagline ?? '', isBoss: isBossFloor(run.floor) });
    }
  }

  // ---------------------------------------------------------------- building

  private makeVignette(): void {
    const key = 'hud-vignette';
    if (!this.textures.exists(key)) {
      const c = this.textures.createCanvas(key, GAME_W, GAME_H)!;
      const ctx = c.getContext();
      const grd = ctx.createRadialGradient(GAME_W / 2, GAME_H / 2, GAME_H * 0.35, GAME_W / 2, GAME_H / 2, GAME_W * 0.62);
      grd.addColorStop(0, 'rgba(160,0,0,0)');
      grd.addColorStop(1, 'rgba(170,10,20,0.85)');
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, GAME_W, GAME_H);
      c.refresh();
    }
    this.vignette = this.add.image(0, 0, key).setOrigin(0).setAlpha(0).setDepth(-5);
  }

  private buildTopLeft(): void {
    panel(this, 4, 4, HP_W + 8, 39, { alpha: 0.72 });
    this.hpG = this.add.graphics();
    this.hpText = txt(this, 8 + HP_W / 2, 9, '', { origin: [0.5, 0], tint: 0xffffff });
    // Potions
    for (let i = 0; i < 6; i++) {
      const p = this.add.image(10 + i * 10, 26, OBJ.potion).setOrigin(0.5).setVisible(false);
      this.potions.push(p);
    }
    // Scrolls (right side of the HP panel row 2)
    const tracks: StatTrack[] = ['might', 'cunning', 'vigor'];
    tracks.forEach((t, i) => {
      const x = 74 + i * 16;
      const g = this.add.graphics();
      g.fillStyle(0x000000, 0.6).fillRect(x - 1, 21, 7, 9);
      g.fillStyle(TRACK_COLORS[t], 1).fillRect(x, 22, 5, 7);
      g.fillStyle(0xffffff, 0.35).fillRect(x, 22, 5, 1);
      this.scrollTexts[t] = txt(this, x + 7, 22, '0', { tint: TRACK_COLORS[t] });
    });
    // Coins & embers
    const coin = this.add.sprite(10, 37, OBJ.coin, 0).setOrigin(0.5);
    if (this.anims.exists('coin-spin')) coin.play('coin-spin');
    this.coinText = txt(this, 17, 33, '0', { tint: UI_COLORS.gold });
    this.emberIcon = this.add.image(72, 37, OBJ.ember).setOrigin(0.5);
    this.emberText = txt(this, 79, 33, '0', { tint: UI_COLORS.ember });
    const glow = this.add.image(72, 37, FX.glow).setTint(UI_COLORS.ember).setBlendMode(Phaser.BlendModes.ADD).setScale(0.25).setAlpha(0.5);
    this.tweens.add({ targets: glow, alpha: 0.15, duration: 700, yoyo: true, repeat: -1 });
    // Ember tooltip on hover.
    const zone = this.add.zone(68, 31, 52, 12).setOrigin(0).setInteractive();
    let tip: Phaser.GameObjects.Container | null = null;
    zone.on('pointerover', () => {
      tip?.destroy();
      tip = this.add.container(0, 0);
      const lines = ['Unbanked embers', 'Bank them at a floor exit.', 'Lost if you die!'];
      tip.add(drawPanel(this.add.graphics(), 70, 46, 128, 34, { edge: UI_COLORS.ember }));
      lines.forEach((l, i) => tip!.add(txt(this, 76, 49 + i * 10, l, { tint: i === 2 ? UI_COLORS.bad : i === 0 ? UI_COLORS.ember : UI_COLORS.text })));
    });
    zone.on('pointerout', () => {
      tip?.destroy();
      tip = null;
    });
  }

  private buildTopRight(): void {
    const right = this.touch ? 446 : GAME_W - 6;
    this.depthText = txt(this, right, 5, 'DEPTH 1', { origin: [1, 0], tint: 0xffffff });
    this.biomeText = txt(this, right, 15, '', { origin: [1, 0], tint: UI_COLORS.dim });
    this.statText = txt(this, right, 25, '', { origin: [1, 0], tint: UI_COLORS.dim });
  }

  private buildSlots(): void {
    const actions: Action[] = ['attack1', 'attack2', 'skill1', 'skill2'];
    // Keyboard: bottom-left. Touch: compact row under the top-left panel.
    const baseY = this.touch ? 58 : GAME_H - 16;
    const xs = this.touch ? [14, 36, 62, 84] : [16, 40, 70, 94];
    actions.forEach((a, i) => {
      const root = this.add.container(xs[i], baseY);
      const bg = this.add.image(0, 0, UI.slot).setOrigin(0.5);
      const frame = this.add.graphics();
      const icon = this.add.image(0, 0, iconTex('rusty_sword')).setVisible(false);
      const cd = this.add.graphics();
      const key = txt(this, 0, -19, '', { origin: [0.5, 0], tint: UI_COLORS.dim });
      root.add([bg, frame, icon, cd, key]);
      if (this.touch) {
        root.setScale(0.9);
        key.setVisible(false);
      }
      this.slots.push({ root, frame, icon, cd, key, action: a, item: null });
    });
    // Divider between weapons and skills.
    if (!this.touch) {
      const g = this.add.graphics();
      g.fillStyle(UI_COLORS.panelEdge, 0.6).fillRect(54, baseY - 8, 1, 16);
    }
    const relX = this.touch ? 100 : 112;
    const relY = this.touch ? 58 : GAME_H - 16;
    this.relicRoot = this.add.container(relX, relY);
  }

  private buildBoss(): void {
    this.bossRoot = this.add.container(GAME_W / 2, this.touch ? 40 : 28).setVisible(false).setAlpha(0);
    this.bossG = this.add.graphics();
    this.bossName = txt(this, 0, -16, '', { origin: [0.5, 0], tint: 0xffe6c0 });
    this.bossTitle = txt(this, 0, 9, '', { origin: [0.5, 0], tint: UI_COLORS.dim });
    this.bossRoot.add([this.bossG, this.bossName, this.bossTitle]);
  }

  private buildPrompt(): void {
    this.promptRoot = this.add.container(GAME_W / 2, this.touch ? GAME_H - 22 : GAME_H - 44).setVisible(false);
    this.promptG = this.add.graphics();
    this.promptText = txt(this, 0, 0, '', { origin: 0.5, tint: 0xffffff });
    this.promptRoot.add([this.promptG, this.promptText]);
  }

  // ---------------------------------------------------------------- updates

  private setHp(hp: number, max: number): void {
    const prev = this.hp;
    this.hp = Math.max(0, hp);
    this.hpMax = Math.max(1, max);
    if (this.hp < prev - 0.5) {
      this.trailDelayUntil = this.time.now + 350;
      this.hpFlashUntil = this.time.now + 120;
    }
    if (this.hp > this.hpTrail) this.hpTrail = this.hp;
    this.hpText.setText(`${Math.ceil(this.hp)}/${Math.round(this.hpMax)}`);
  }

  private setPotions(charges: number, max: number): void {
    this.potions.forEach((p, i) => {
      p.setVisible(i < max);
      p.setAlpha(i < charges ? 1 : 0.25);
      p.setTint(i < charges ? 0xffffff : 0x606060);
    });
  }

  private setScrolls(s: Record<StatTrack, number>): void {
    for (const t of Object.keys(s) as StatTrack[]) {
      const tx = this.scrollTexts[t];
      if (!tx) continue;
      const v = String(s[t]);
      if (tx.text !== v) {
        tx.setText(v);
        this.bump(tx);
      }
    }
  }

  private setLoadout(weapons: (ItemInstance | null)[], skills: (ItemInstance | null)[], relics: ItemInstance[]): void {
    const items = [weapons[0] ?? null, weapons[1] ?? null, skills[0] ?? null, skills[1] ?? null];
    this.slots.forEach((s, i) => {
      const it = items[i];
      s.item = it;
      s.frame.clear();
      if (it) {
        const c = RARITY_COLORS[it.rarity];
        s.frame.lineStyle(1, c, 1).strokeRect(-9.5, -9.5, 19, 19);
        if (it.rarity !== 'common') s.frame.fillStyle(c, 0.18).fillRect(-9, -9, 18, 18);
        s.icon.setTexture(iconTex(it.defId)).setVisible(true);
      } else {
        s.icon.setVisible(false);
      }
    });
    this.relicIcons.forEach((r) => r.destroy());
    this.relicIcons = [];
    const perRow = this.touch ? 12 : 16;
    relics.forEach((r, i) => {
      const x = (i % perRow) * 12;
      const y = Math.floor(i / perRow) * -12;
      const img = this.add.image(x, y, iconTex(r.defId)).setScale(0.7);
      this.relicRoot.add(img);
      this.relicIcons.push(img);
    });
  }

  private setCooldown(slot: number, remaining: number, total: number): void {
    const frac = total > 0 ? Phaser.Math.Clamp(remaining / total, 0, 1) : 0;
    const s = this.slots[2 + slot];
    if (s && Math.abs(this.skillCd[slot] - frac) > 0.004) {
      const was = this.skillCd[slot];
      this.skillCd[slot] = frac;
      s.cd.clear();
      if (frac > 0) {
        const h = Math.ceil(18 * frac);
        s.cd.fillStyle(0x000000, 0.68).fillRect(-9, 9 - h, 18, h);
        s.cd.fillStyle(0xffffff, 0.5).fillRect(-9, 9 - h, 18, 1);
      } else if (was > 0) {
        // Ready flash.
        const f = this.add.rectangle(s.root.x, s.root.y, 18, 18, 0xffffff, 0.8).setBlendMode(Phaser.BlendModes.ADD);
        this.tweens.add({ targets: f, alpha: 0, scale: 1.4, duration: 260, onComplete: () => f.destroy() });
      }
    }
    const touch = this.scene.get('Touch') as TouchScene | null;
    if (touch && this.scene.isActive('Touch') && (slot === 0 || slot === 1)) touch.setCooldown(slot, frac);
  }

  private onFloor(e: GameEvents['run:floor']): void {
    this.depthText.setText(`DEPTH ${e.floor}`);
    this.biomeText.setText(e.biomeName);
    this.showBanner(e);
    if (e.floor === 1 && !saves.data.seenTutorial) {
      this.time.delayedCall(3400, () => this.tryTutorial());
    }
  }

  private showBanner(e: GameEvents['run:floor']): void {
    const root = this.add.container(GAME_W / 2, 92).setAlpha(0).setDepth(50);
    const g = this.add.graphics();
    const w = 260;
    g.fillStyle(0x000000, 0.55).fillRect(-w / 2, -26, w, 58);
    g.fillStyle(e.isBoss ? UI_COLORS.bad : UI_COLORS.gold, 0.9).fillRect(-w / 2 + 20, -26, w - 40, 1).fillRect(-w / 2 + 20, 31, w - 40, 1);
    const depth = txt(this, 0, -22, `DEPTH ${e.floor}`, { origin: [0.5, 0], tint: e.isBoss ? UI_COLORS.bad : UI_COLORS.gold });
    const name = txt(this, 0, -10, e.biomeName.toUpperCase(), { origin: [0.5, 0], big: true, tint: 0xffffff });
    const tag = txt(this, 0, 14, e.isBoss ? 'A guardian bars the way down' : e.tagline, { origin: [0.5, 0], tint: e.isBoss ? 0xff9a8a : UI_COLORS.dim });
    root.add([g, depth, name, tag]);
    if (name.width > w - 20) name.setScale((w - 20) / name.width);
    this.tweens.add({ targets: root, alpha: 1, y: 86, duration: 500, ease: 'Cubic.easeOut' });
    this.tweens.add({ targets: root, alpha: 0, delay: 2600, duration: 700, onComplete: () => root.destroy() });
  }

  private showBoss(name: string, title: string, hp: number, max: number): void {
    this.bossName.setText(name.toUpperCase());
    this.bossTitle.setText(title);
    this.bossHp = hp;
    this.bossMax = max;
    this.bossShown = hp;
    this.bossRoot.setVisible(true);
    this.tweens.add({ targets: this.bossRoot, alpha: 1, duration: 600 });
  }

  private hideBoss(): void {
    this.tweens.add({ targets: this.bossRoot, alpha: 0, duration: 600, onComplete: () => this.bossRoot.setVisible(false) });
  }

  toast(text: string, color: number = UI_COLORS.text): void {
    const c = this.add.container(GAME_W / 2, 0).setDepth(40);
    const t = txt(this, 0, 0, text, { origin: 0.5, tint: color });
    const w = Math.max(60, t.width + 16);
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.6).fillRect(-w / 2, -6, w, 12);
    g.fillStyle(color, 0.8).fillRect(-w / 2, -6, 1, 12).fillRect(w / 2 - 1, -6, 1, 12);
    c.add([g, t]);
    this.toasts.unshift(c);
    while (this.toasts.length > 4) this.toasts.pop()!.destroy();
    this.layoutToasts();
    c.setAlpha(0).setScale(0.9);
    this.tweens.add({ targets: c, alpha: 1, scale: 1, duration: 140 });
    this.time.delayedCall(2000, () => {
      this.tweens.add({
        targets: c,
        alpha: 0,
        duration: 300,
        onComplete: () => {
          this.toasts = this.toasts.filter((x) => x !== c);
          c.destroy();
        },
      });
    });
  }

  private layoutToasts(): void {
    const base = this.bossRoot.visible ? 62 : 48;
    this.toasts.forEach((c, i) => this.tweens.add({ targets: c, y: base + i * 14, duration: 120 }));
  }

  private setPrompt(text: string | null): void {
    this.promptRaw = text;
    this.promptDevice = '';
    this.renderPrompt();
  }

  private renderPrompt(): void {
    const text = this.promptRaw;
    this.promptDevice = input.lastDevice;
    if (!text) {
      this.promptRoot.setVisible(false);
      return;
    }
    const key = keyLabel('interact');
    this.promptText.setText(`${key}  ${text}`);
    const w = this.promptText.width + 18;
    const g = this.promptG.clear();
    drawPanel(g, -w / 2, -8, w, 16, { edge: UI_COLORS.gold, alpha: 0.85 });
    // Key cap behind the key label.
    const kw = key.length * 5 + 6;
    const kx = -this.promptText.width / 2 - 3;
    g.fillStyle(UI_COLORS.gold, 1).fillRect(kx, -5, kw, 10);
    g.fillStyle(0x2a2010, 1).fillRect(kx + 1, -4, kw - 2, 8);
    this.promptRoot.setVisible(true);
    this.promptRoot.setScale(0.9);
    this.tweens.add({ targets: this.promptRoot, scale: 1, duration: 100 });
  }

  /** A menu/modal covers gameplay: hide world prompts, the tutorial and touch controls. */
  private setBlocked(b: boolean): void {
    this.blocked = b;
    this.tutorialRoot?.setVisible(!b);
    if (b) {
      this.promptRoot.setVisible(false);
      if (this.scene.isActive('Touch')) this.scene.sleep('Touch');
    } else {
      this.renderPrompt();
      if (this.scene.isSleeping('Touch')) this.scene.wake('Touch');
    }
  }

  private tryTutorial(): void {
    if (saves.data.seenTutorial) return;
    if (this.blocked) {
      this.time.delayedCall(1000, () => this.tryTutorial());
      return;
    }
    this.tutorialRoot = showTutorial(this, this.touch);
  }

  private bump(t: Phaser.GameObjects.BitmapText): void {
    this.tweens.killTweensOf(t);
    t.setScale(1.35);
    this.tweens.add({ targets: t, scale: 1, duration: 180, ease: 'Back.easeOut' });
  }

  private onDied(): void {
    this.setPrompt(null);
    this.tweens.add({ targets: this.vignette, alpha: 0.9, duration: 400 });
  }

  private openModal(e: GameEvents['ui:open']): void {
    if (this.scene.isActive('Modal')) {
      (this.scene.get('Modal') as any).openRequest?.(e);
    } else {
      this.scene.launch('Modal', e);
      this.scene.bringToTop('Modal');
    }
  }

  // ---------------------------------------------------------------- frame

  override update(_t: number, dtMs: number): void {
    const dt = dtMs / 1000;
    const now = this.time.now;

    // HP bar animation.
    this.hpShown = Phaser.Math.Linear(this.hpShown, this.hp, Math.min(1, dt * 14));
    if (now > this.trailDelayUntil) this.hpTrail = Math.max(this.hpShown, this.hpTrail - this.hpMax * dt * 0.6);
    const g = this.hpG.clear();
    const x = 8, y = 8, h = 10;
    g.fillStyle(UI_COLORS.outline, 1).fillRect(x - 1, y - 1, HP_W + 2, h + 2);
    g.fillStyle(UI_COLORS.hpBack, 1).fillRect(x, y, HP_W, h);
    const tw = Math.round((HP_W * this.hpTrail) / this.hpMax);
    const sw = Math.round((HP_W * this.hpShown) / this.hpMax);
    g.fillStyle(0xf0d0a0, 0.9).fillRect(x, y, tw, h);
    const low = this.hp / this.hpMax < 0.3;
    const col = now < this.hpFlashUntil ? 0xffffff : low ? (Math.floor(now / 200) % 2 ? 0xff4048 : UI_COLORS.hp) : UI_COLORS.hp;
    g.fillStyle(col, 1).fillRect(x, y, sw, h);
    g.fillStyle(0xffffff, 0.25).fillRect(x, y, sw, 2);
    g.fillStyle(0x000000, 0.25).fillRect(x, y + h - 2, sw, 2);
    // Tick marks every 25 HP.
    g.fillStyle(0x000000, 0.35);
    for (let v = 25; v < this.hpMax; v += 25) g.fillRect(x + Math.round((HP_W * v) / this.hpMax), y, 1, h);

    // Low HP vignette.
    const frac = this.hp / this.hpMax;
    if (this.hp > 0) {
      const target = frac < 0.3 ? 0.35 + 0.25 * (0.5 + 0.5 * Math.sin(now / 180)) : 0;
      this.vignette.setAlpha(Phaser.Math.Linear(this.vignette.alpha, target, Math.min(1, dt * 6)));
      const lowNow = frac < 0.3;
      if (lowNow !== this.lowMuffled) {
        this.lowMuffled = lowNow;
        audio.setMuffle(lowNow ? 0.35 : 0);
      }
    }

    // Coins roll-up.
    if (this.coinShown !== this.coinTarget) {
      const d = this.coinTarget - this.coinShown;
      this.coinShown += Math.sign(d) * Math.max(1, Math.ceil(Math.abs(d) * Math.min(1, dt * 10)));
      if (Math.sign(this.coinTarget - this.coinShown) !== Math.sign(d)) this.coinShown = this.coinTarget;
    }
    this.coinText.setText(String(this.coinShown));
    if (this.emberUnbanked > 0) this.emberIcon.setScale(1 + 0.15 * Math.sin(now / 160));

    // Stats line.
    const run = session.run;
    this.statText.setText(`${fmtTime(run?.timeMs ?? 0)}  ${this.kills} kills`);

    // Key hints follow the device.
    this.slots.forEach((s) => {
      if (!this.touch) s.key.setText(s.item ? keyLabel(s.action) : '');
    });
    if (this.promptRaw && this.promptDevice !== input.lastDevice) this.renderPrompt();

    // Boss bar.
    if (this.bossRoot.visible) {
      this.bossShown = Phaser.Math.Linear(this.bossShown, this.bossHp, Math.min(1, dt * 8));
      const bw = 220, bh = 6;
      const bg = this.bossG.clear();
      drawPanel(bg, -bw / 2 - 4, -5, bw + 8, bh + 8, { edge: 0x8a2a2a, alpha: 0.85 });
      bg.fillStyle(0x2a0a10, 1).fillRect(-bw / 2, -1, bw, bh);
      bg.fillStyle(0xf0d0a0, 0.8).fillRect(-bw / 2, -1, Math.round((bw * this.bossShown) / this.bossMax), bh);
      bg.fillStyle(0xc02838, 1).fillRect(-bw / 2, -1, Math.round((bw * this.bossHp) / this.bossMax), bh);
      bg.fillStyle(0xffffff, 0.2).fillRect(-bw / 2, -1, Math.round((bw * this.bossHp) / this.bossMax), 1);
      // Phase notches at 66% / 33%.
      bg.fillStyle(0x000000, 0.6).fillRect(-bw / 2 + bw * 0.66, -1, 1, bh).fillRect(-bw / 2 + bw * 0.33, -1, 1, bh);
    }
  }
}
