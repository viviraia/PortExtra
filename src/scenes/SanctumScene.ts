import Phaser from 'phaser';
import { GAME_H, GAME_W } from '../config';
import { UI } from '../art/keys';
import { audio } from '../core/audio';
import { saves } from '../core/save';
import { RunState } from '../run/RunState';
import { session } from '../run/session';

/** Minimal Sanctum (replaced by the Meta milestone): start a run. */
export class SanctumScene extends Phaser.Scene {
  constructor() {
    super('Sanctum');
  }

  create(): void {
    audio.music('sanctum');
    this.add.bitmapText(GAME_W / 2, 60, UI.font, 'THE SANCTUM').setOrigin(0.5);
    this.add.bitmapText(GAME_W / 2, 90, UI.font, `Coins ${saves.data.coins}   Embers ${saves.data.embers}`).setOrigin(0.5);
    this.add.bitmapText(GAME_W / 2, GAME_H - 60, UI.font, 'PRESS ENTER TO DESCEND').setOrigin(0.5);
    const go = () => {
      const run = RunState.create((Math.random() * 2 ** 32) >>> 0, saves.data);
      saves.data.coins += run.startingCoins;
      session.run = run;
      this.scene.start('Game');
    };
    this.input.keyboard?.once('keydown-ENTER', go);
    this.input.once('pointerdown', go);
  }
}
