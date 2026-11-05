import Phaser from 'phaser';
import { GAME_W } from '../config';
import { UI } from '../art/keys';
import { recordRun, saves } from '../core/save';
import type { RunRecord } from '../data/types';

/** Minimal results screen (replaced by the UI milestone). */
export class DeathScene extends Phaser.Scene {
  constructor() {
    super('Death');
  }

  create(data: { record: RunRecord }): void {
    const rank = recordRun(saves.data, data.record);
    saves.save();
    this.add.bitmapText(GAME_W / 2, 60, UI.font, 'YOU FELL').setOrigin(0.5);
    this.add.bitmapText(GAME_W / 2, 90, UI.font, `Depth ${data.record.depth}  Kills ${data.record.kills}`).setOrigin(0.5);
    this.add.bitmapText(GAME_W / 2, 110, UI.font, rank >= 0 ? `Rank #${rank + 1}` : '').setOrigin(0.5);
    this.time.delayedCall(800, () => {
      const go = () => this.scene.start('Sanctum');
      this.input.keyboard?.once('keydown', go);
      this.input.once('pointerdown', go);
    });
  }
}
