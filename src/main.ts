import Phaser from 'phaser';
import { GAME_H, GAME_W, GRAVITY, IS_DEBUG } from './config';
import { BootScene } from './scenes/BootScene';
import { TitleScene } from './scenes/TitleScene';
import { SanctumScene } from './scenes/SanctumScene';
import { GameScene } from './scenes/GameScene';
import { HUDScene } from './scenes/HUDScene';
import { DeathScene } from './scenes/DeathScene';
import { TouchScene } from './core/input/TouchScene';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_W,
  height: GAME_H,
  backgroundColor: '#0b0a12',
  pixelArt: true,
  roundPixels: true,
  antialias: false,
  disableContextMenu: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  input: { activePointers: 4 },
  physics: {
    default: 'arcade',
    arcade: { gravity: { x: 0, y: GRAVITY }, debug: false, tileBias: 20 },
  },
  fps: { target: 60, smoothStep: true },
  scene: [BootScene, TitleScene, SanctumScene, GameScene, HUDScene, TouchScene, DeathScene],
});

if (IS_DEBUG) (window as any).__game = game;
