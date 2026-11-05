import Phaser from 'phaser';
import { buildAllTextures, rebuildPlayerTexture } from '../art/TextureFactory';
import { audio } from '../core/audio';
import { input } from '../core/input/InputManager';
import { saves } from '../core/save';
import { COSMETICS } from '../data';
import { IS_DEBUG } from '../config';

/** Generates all art from code, applies settings, then hands off to Title. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    buildAllTextures(this);
    const cos = COSMETICS[saves.data.cosmetics.equipped];
    if (cos && cos.id !== 'default') rebuildPlayerTexture(this, cos.palette);
    const s = saves.data.settings;
    audio.setVolumes(s.master, s.music, s.sfx);
    audio.autoUnlock();
    input.attach(this.game);
    const params = new URLSearchParams(location.search);
    const start = IS_DEBUG ? params.get('start') : null;
    if (start === 'game') this.scene.start('Game');
    else if (start === 'sanctum') this.scene.start('Sanctum');
    else this.scene.start('Title');
  }
}
