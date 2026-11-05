import Phaser from 'phaser';
import { UI } from '../art/keys';
import { bus } from '../core/events';

/** Minimal HUD (replaced by the UI milestone). */
export class HUDScene extends Phaser.Scene {
  private hp!: Phaser.GameObjects.BitmapText;
  private coins!: Phaser.GameObjects.BitmapText;
  private prompt!: Phaser.GameObjects.BitmapText;
  private offs: (() => void)[] = [];

  constructor() {
    super('HUD');
  }

  create(): void {
    this.hp = this.add.bitmapText(6, 6, UI.font, '');
    this.coins = this.add.bitmapText(6, 16, UI.font, '');
    this.prompt = this.add.bitmapText(240, 230, UI.font, '').setOrigin(0.5);
    this.offs.push(
      bus.on('player:hp', (e) => this.hp.setText(`HP ${Math.ceil(e.hp)}/${e.max}`)),
      bus.on('run:coins', (e) => this.coins.setText(`Coins ${e.coins}`)),
      bus.on('prompt', (e) => this.prompt.setText(e.text ? `[F] ${e.text}` : '')),
    );
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.offs.forEach((o) => o()));
  }
}
