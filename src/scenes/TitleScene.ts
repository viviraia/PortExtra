import Phaser from 'phaser';
import { GAME_W } from '../config';
import { UI } from '../art/keys';
import { audio } from '../core/audio';
import { input } from '../core/input/InputManager';

/** Minimal title (replaced by the UI milestone). */
export class TitleScene extends Phaser.Scene {
  constructor() {
    super('Title');
  }

  create(): void {
    audio.music('title');
    if (this.textures.exists(UI.title)) this.add.image(GAME_W / 2, 90, UI.title);
    this.add.bitmapText(GAME_W / 2, 170, UI.font, 'PRESS ANY KEY').setOrigin(0.5);
    const go = () => this.scene.start('Sanctum');
    this.input.once('pointerdown', go);
    this.input.keyboard?.once('keydown', go);
  }

  override update(): void {
    input.update();
  }
}
