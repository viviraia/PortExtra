/** First-run controls overlay (keyboard/mouse or touch variant). */
import Phaser from 'phaser';
import { UI_COLORS } from '../art/palette';
import { GAME_W } from '../config';
import { saves } from '../core/save';
import { drawPanel, txt } from './widgets';

const KEYBOARD: [string, string][] = [
  ['A / D', 'Move'],
  ['SPACE', 'Jump (twice to double jump)'],
  ['SHIFT', 'Dodge roll - dodge through attacks'],
  ['J / K  or  LMB / RMB', 'Weapons'],
  ['Q / E', 'Skills'],
  ['F', 'Interact     R  Drink potion'],
  ['S + SPACE', 'Drop through platforms'],
];

const TOUCH: [string, string][] = [
  ['Left stick', 'Move / climb'],
  ['^', 'Jump (twice to double jump)'],
  ['>>', 'Dodge roll - dodge through attacks'],
  ['A / B', 'Weapons'],
  ['Q / E', 'Skills'],
  ['F  /  +', 'Interact  /  Drink potion'],
];

export function showTutorial(scene: Phaser.Scene, touch: boolean): Phaser.GameObjects.Container | null {
  if (saves.data.seenTutorial) return null;
  saves.data.seenTutorial = true;
  saves.save();
  const rows = touch ? TOUCH : KEYBOARD;
  const w = 330;
  const h = 34 + rows.length * 12;
  const x = GAME_W / 2 - w / 2;
  const y = touch ? 70 : 56;
  const root = scene.add.container(0, 0).setDepth(60).setAlpha(0);
  root.add(drawPanel(scene.add.graphics(), x, y, w, h, { edge: UI_COLORS.gold, alpha: 0.9 }));
  root.add(txt(scene, GAME_W / 2, y + 6, 'HOW TO SURVIVE THE SPIRE', { origin: [0.5, 0], tint: UI_COLORS.gold }));
  rows.forEach(([k, d], i) => {
    root.add(txt(scene, x + 116, y + 22 + i * 12, k, { origin: [1, 0], tint: 0xffffff }));
    root.add(txt(scene, x + 126, y + 22 + i * 12, d, { tint: UI_COLORS.dim }));
  });
  scene.tweens.add({ targets: root, alpha: 1, duration: 400 });
  scene.time.delayedCall(9000, () => scene.tweens.add({ targets: root, alpha: 0, duration: 600, onComplete: () => root.destroy() }));
  return root;
}
