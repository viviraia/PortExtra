/** Title screen: atmospheric spire backdrop, logo, main menu. */
import Phaser from 'phaser';
import { TouchScene } from '../core/input/TouchScene';
import { bgFarTex, bgMidTex, FX, UI } from '../art/keys';
import { UI_COLORS } from '../art/palette';
import { GAME_H, GAME_W } from '../config';
import { audio } from '../core/audio';
import { input } from '../core/input/InputManager';
import { saves } from '../core/save';
import type { BiomeId } from '../data/types';
import { Button, Menu, txt } from '../ui/widgets';

export class TitleScene extends Phaser.Scene {
  private menu!: Menu;
  private far: Phaser.GameObjects.TileSprite | null = null;
  private mid: Phaser.GameObjects.TileSprite | null = null;
  private fogs: Phaser.GameObjects.Image[] = [];
  private leaving = false;

  constructor() {
    super('Title');
  }

  create(): void {
    this.leaving = false;
    this.fogs = [];
    audio.music('title');
    const biome: BiomeId = 'ramparts';
    if (this.textures.exists(bgFarTex(biome))) this.far = this.add.tileSprite(0, 0, GAME_W, GAME_H, bgFarTex(biome)).setOrigin(0);
    if (this.textures.exists(bgMidTex('cells'))) this.mid = this.add.tileSprite(0, 0, GAME_W, GAME_H, bgMidTex('cells')).setOrigin(0).setAlpha(0.9);
    // Darkening gradient toward the bottom.
    const shade = this.add.graphics();
    for (let i = 0; i < 12; i++) shade.fillStyle(0x05040a, 0.05 + i * 0.045).fillRect(0, GAME_H - 120 + i * 10, GAME_W, 10);
    // Drifting fog.
    for (let i = 0; i < 6; i++) {
      const f = this.add
        .image(Phaser.Math.Between(0, GAME_W), Phaser.Math.Between(150, 260), FX.glow)
        .setTint(0x6a6a9a)
        .setAlpha(0.12)
        .setScale(Phaser.Math.FloatBetween(3, 5), Phaser.Math.FloatBetween(1, 1.6))
        .setBlendMode(Phaser.BlendModes.ADD);
      f.setData('v', Phaser.Math.FloatBetween(4, 10));
      this.fogs.push(f);
    }
    // Rising embers.
    if (this.textures.exists(FX.particle)) {
      this.add.particles(0, GAME_H + 4, FX.particle, {
        x: { min: 0, max: GAME_W },
        speedY: { min: -40, max: -15 },
        speedX: { min: -8, max: 8 },
        lifespan: { min: 4000, max: 8000 },
        scale: { start: 0.6, end: 0 },
        alpha: { start: 0.9, end: 0 },
        tint: [0xff9a3a, 0xffd06a, 0xff5a2a],
        blendMode: Phaser.BlendModes.ADD,
        frequency: 140,
      });
    }

    // Logo with glow.
    const glow = this.add.image(GAME_W / 2, 66, FX.glow).setTint(0xff7a3a).setBlendMode(Phaser.BlendModes.ADD).setScale(5, 1.6).setAlpha(0.25);
    this.tweens.add({ targets: glow, alpha: 0.4, duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    const logo = this.textures.exists(UI.title)
      ? this.add.image(GAME_W / 2, 64, UI.title)
      : txt(this, GAME_W / 2, 64, 'HOLLOW SPIRE', { big: true, origin: 0.5 });
    logo.setAlpha(0);
    this.tweens.add({ targets: logo, alpha: 1, y: 60, duration: 1200, ease: 'Cubic.easeOut' });
    this.tweens.add({ targets: logo, y: 63, duration: 2600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: 1200 });
    txt(this, GAME_W / 2, 92, 'DESCEND.   DIE.   DESCEND DEEPER.', { origin: 0.5, tint: UI_COLORS.dim });

    const go = () => this.descend();
    const buttons = [
      new Button(this, GAME_W / 2, 140, 'Descend', go, { w: 120, h: 20, edge: UI_COLORS.ember }),
      new Button(this, GAME_W / 2, 166, 'Settings', () => this.openSettings(), { w: 120, h: 18 }),
    ];
    this.menu = new Menu(buttons);

    const st = saves.data.stats;
    if (st.runs > 0) {
      txt(this, GAME_W / 2, 194, `Deepest descent: ${st.deepest}   -   Runs: ${st.runs}`, { origin: 0.5, tint: UI_COLORS.gold });
    }
    txt(this, GAME_W / 2, GAME_H - 10, 'an original roguelite  -  v0.1', { origin: 0.5, tint: 0x4a4458 });
    txt(this, 6, GAME_H - 10, input.lastDevice === 'touch' || TouchScene.shouldShow(saves.data.settings.touchControls) ? '' : 'ENTER select  ARROWS move', { tint: 0x4a4458 });

    this.cameras.main.fadeIn(800, 0, 0, 0);
    this.events.on(Phaser.Scenes.Events.RESUME, () => input.releaseAll());
  }

  private openSettings(): void {
    this.scene.pause();
    this.scene.launch('Settings', { from: 'Title' });
    this.scene.bringToTop('Settings');
  }

  private descend(): void {
    if (this.leaving) return;
    this.leaving = true;
    audio.unlock();
    audio.sfx('portal');
    this.cameras.main.fadeOut(500, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('Sanctum'));
  }

  override update(_t: number, dtMs: number): void {
    input.update();
    const dt = dtMs / 1000;
    if (this.far) this.far.tilePositionX += dt * 4;
    if (this.mid) this.mid.tilePositionX += dt * 10;
    for (const f of this.fogs) {
      f.x += f.getData('v') * dt;
      if (f.x > GAME_W + 150) f.x = -150;
    }
    if (!this.leaving) this.menu.update();
  }
}
