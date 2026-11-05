import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    this.add.text(10, 10, 'Hollow Spire — booting', { color: '#ffffff', fontSize: '10px' });
  }
}
