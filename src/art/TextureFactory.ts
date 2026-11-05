import Phaser from 'phaser';
import type { CosmeticDef } from '../data/types';
import { bgFarTex, bgMidTex, bossTex, enemyTex, PLAYER_FRAME, PLAYER_TEX, tilesTex, TILE, type BossAnim, type EnemyAnim } from './keys';
import { BIOME_ORDER } from '../data/types';
import { buildFrames, buildImage } from './sheet';
import { drawTileFrame, TILESET_FRAMES } from './tiles/tilesets';
import { BG_H, BG_W, drawBgFar, drawBgMid } from './tiles/backgrounds';
import { buildObjects } from './sprites/objects';
import { buildFx } from './sprites/fx';
import { buildIcons } from './sprites/icons';
import { buildUi } from './sprites/ui';
import { buildFonts } from './font';
import { DEFAULT_PLAYER_PALETTE, OUTLINE } from './palette';
import { buildSheet } from './sheet';
import { drawPlayerFrame, PLAYER_ANIM_SPECS, playerPost, playerPre } from './sprites/player';
import { ENEMY_ANIM_FRAMES, ENEMY_ART, enemyAnimSpecs, enemyPost, enemyPre } from './sprites/enemies';
import { BOSS_ANIM_FRAMES, BOSS_ART, bossAnimSpecs, bossPost, bossPre } from './sprites/bosses';

export { ENEMY_FRAMES, ENEMY_ANIM_FRAMES, ENEMY_ATTACK_HIT_FRAME } from './sprites/enemies';
export { BOSS_FRAMES, BOSS_ANIM_FRAMES, BOSS_ATTACK_HIT_FRAME } from './sprites/bosses';

export function rebuildPlayerTexture(scene: Phaser.Scene, palette: CosmeticDef['palette']): void {
  buildSheet(scene, {
    key: PLAYER_TEX,
    fw: PLAYER_FRAME,
    fh: PLAYER_FRAME,
    anims: PLAYER_ANIM_SPECS,
    draw: (p, a, i, n) => drawPlayerFrame(p, a, i, n, palette),
    pre: playerPre,
    post: playerPost,
  });
}

const animSuffix = (key: string) => key.slice(key.lastIndexOf('-') + 1);

function buildEnemies(scene: Phaser.Scene) {
  for (const [id, art] of Object.entries(ENEMY_ART)) {
    if (scene.textures.exists(enemyTex(id))) continue;
    buildSheet(scene, {
      key: enemyTex(id),
      fw: art.fw,
      fh: art.fh,
      anims: enemyAnimSpecs(id),
      outline: OUTLINE,
      draw: (p, a, i, n) => art.draw(p, animSuffix(a) as EnemyAnim, i, n),
      pre: enemyPre,
      post: (ctx, x, y, w, h, a, i) => enemyPost(ctx, x, y, w, h, animSuffix(a) as EnemyAnim, i, art.alpha ?? 1),
    });
  }
  void ENEMY_ANIM_FRAMES;
}

function buildBosses(scene: Phaser.Scene) {
  for (const [id, art] of Object.entries(BOSS_ART)) {
    if (scene.textures.exists(bossTex(id))) continue;
    const post = bossPost(id);
    buildSheet(scene, {
      key: bossTex(id),
      fw: art.fw,
      fh: art.fh,
      anims: bossAnimSpecs(id),
      outline: OUTLINE,
      draw: (p, a, i, n) => art.draw(p, animSuffix(a) as BossAnim, i, n),
      pre: bossPre,
      post: (ctx, x, y, w, h, a, i) => post(ctx, x, y, w, h, animSuffix(a) as BossAnim, i),
    });
  }
  void BOSS_ANIM_FRAMES;
}

function buildWorld(scene: Phaser.Scene) {
  for (const b of BIOME_ORDER) {
    if (!scene.textures.exists(tilesTex(b))) buildFrames(scene, tilesTex(b), TILE, TILE, TILESET_FRAMES, (p, i) => drawTileFrame(p, b, i));
    buildImage(scene, bgFarTex(b), BG_W, BG_H, (p) => drawBgFar(p, b));
    buildImage(scene, bgMidTex(b), BG_W, BG_H, (p) => drawBgMid(p, b));
  }
}

let built = false;
/**
 * Create every texture, animation and bitmap font in keys.ts. Idempotent:
 * safe to call from multiple scenes; existing textures are kept.
 */
export function buildAllTextures(scene: Phaser.Scene): void {
  if (!scene.textures.exists(PLAYER_TEX)) rebuildPlayerTexture(scene, DEFAULT_PLAYER_PALETTE);
  buildEnemies(scene);
  buildBosses(scene);
  buildWorld(scene);
  buildObjects(scene);
  buildFx(scene);
  buildIcons(scene);
  buildUi(scene);
  buildFonts(scene);
  built = true;
}

export function texturesBuilt(): boolean {
  return built;
}
