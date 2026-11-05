/**
 * Dev-only contact sheet for all generated art: /art-preview.html?page=N
 *  0 player, 1 enemies (&o=offset), 2 bosses (&b=index), 3..6 biome mock scenes, 7 objects/fx/icons/ui
 */
import Phaser from 'phaser';
import { buildAllTextures, rebuildPlayerTexture } from './TextureFactory';
import { ANIMS, BOSS_ANIM_SUFFIXES, bossAnim, ENEMY_ANIM_SUFFIXES, bgFarTex, bgMidTex, bossTex, enemyAnim, enemyTex, FX, iconTex, OBJ, PLAYER_ANIMS, projTex, slashTex, TILE_FRAMES, tilesTex, UI, type ProjectileKey } from './keys';
import { ENEMY_ART } from './sprites/enemies';
import { BOSS_ART } from './sprites/bosses';
import { ICON_IDS } from './sprites/icons';
import { BIOME_ORDER, type BiomeId } from '../data/types';
import { ALL_ITEM_IDS, BOSS_IDS, ENEMY_IDS } from '../data/ids';
import { BIOME_PALETTES, RARITY_COLORS } from './palette';

const q = new URLSearchParams(location.search);
const page = Number(q.get('page') ?? '0');

const ROOM = [
  '##############################',
  '#............................#',
  '#...t..........w.........t...#',
  '#............................#',
  '#.......----.........#####...#',
  '#....................#####...#',
  '#..............H.....##......#',
  '#..####........H.............#',
  '#..####......-----.......#####',
  '#..............H.........#####',
  '#..............H.............#',
  '#..............H.............#',
  '####....^^^^...H......########',
  '#####################^^#######',
  '##############################',
  '##############################',
  '##############################',
];

class Preview extends Phaser.Scene {
  constructor() { super('preview'); }
  create() {
    const t0 = performance.now();
    buildAllTextures(this);
    (window as any).__buildMs = performance.now() - t0;
    if (page === 0) {
      const sp = this.add.sprite(460, 250, 'player').play(PLAYER_ANIMS.run);
      if (q.has('alt')) rebuildPlayerTexture(this, { cloak: 0x8a1a2a, trim: 0xe8e8f0, skin: 0x8a6a50, eyes: 0x60d0ff });
      this.sheet('player', 32, 32);
      void sp;
    }
    else if (page === 1) this.enemies(Number(q.get('o') ?? '0'));
    else if (page === 2) { const id = Object.keys(BOSS_ART)[Number(q.get('b') ?? '0')]; this.sheet(bossTex(id), BOSS_ART[id].fw, BOSS_ART[id].fh); }
    else if (page >= 3 && page <= 6) this.biome(BIOME_ORDER[page - 3]);
    else if (page === 7) this.misc();
    else this.misc2();
    (window as any).__missing = this.verify();
    (window as any).__ready = true;
  }
  verify(): string[] {
    const miss: string[] = [];
    const tex = (k: string) => { if (!this.textures.exists(k)) miss.push('tex:' + k); };
    const anim = (k: string) => { if (!this.anims.exists(k)) miss.push('anim:' + k); };
    tex('player'); Object.values(PLAYER_ANIMS).forEach(anim);
    for (const id of Object.keys(ENEMY_IDS)) { tex(enemyTex(id)); ENEMY_ANIM_SUFFIXES.forEach((a) => anim(enemyAnim(id, a))); }
    for (const id of Object.keys(BOSS_IDS)) { tex(bossTex(id)); BOSS_ANIM_SUFFIXES.forEach((a) => anim(bossAnim(id, a))); }
    for (const b of BIOME_ORDER) { tex(tilesTex(b)); tex(bgFarTex(b)); tex(bgMidTex(b)); if (this.textures.get(tilesTex(b)).frameTotal - 1 < 32) miss.push('frames:' + b); }
    ALL_ITEM_IDS.forEach((id) => tex(iconTex(id)));
    Object.values(OBJ).forEach(tex); Object.values(ANIMS).forEach(anim); Object.values(FX).forEach(tex);
    for (const k of ['slash', 'slash-wide', 'stab', 'smash', 'spin'] as const) { tex(slashTex(k)); anim(slashTex(k)); }
    for (const p of ['arrow', 'bolt', 'knife', 'fireball', 'spark', 'orb', 'bomb', 'feather', 'bone', 'grenade', 'icicle', 'ink', 'darkorb'] as ProjectileKey[]) tex(projTex(p));
    for (const k of [UI.stickBase, UI.stickKnob, UI.button, UI.slot, UI.title, UI.cursor]) tex(k);
    for (const g of ['jump', 'attack1', 'attack2', 'dodge', 'skill1', 'skill2', 'potion', 'interact', 'pause'] as const) tex(UI.btnGlyph(g));
    for (const f of [UI.font, UI.fontBig]) if (!this.cache.bitmapFont.exists(f)) miss.push('font:' + f);
    return miss;
  }
  frames(key: string) {
    return this.textures.get(key).getFrameNames().filter((f) => f !== '__BASE').sort((a, b) => Number(a) - Number(b));
  }
  sheet(key: string, fw: number, fh: number, x0 = 4, y0 = 4, maxW = 476) {
    let x = x0, y = y0;
    for (const f of this.frames(key)) {
      this.add.image(x, y, key, f).setOrigin(0);
      x += fw + 2;
      if (x + fw > maxW) { x = x0; y += fh + 2; }
    }
    return y + fh + 2;
  }
  enemies(offset: number) {
    let y = 2;
    for (const [id, a] of Object.entries(ENEMY_ART).slice(offset)) {
      let x = 2;
      for (const f of this.frames(enemyTex(id))) { this.add.image(x, y, enemyTex(id), f).setOrigin(0); x += a.fw + 1; }
      y += a.fh + 1;
      if (y > 250) break;
    }
  }
  biome(b: BiomeId) {
    this.cameras.main.setBackgroundColor(BIOME_PALETTES[b].sky);
    this.add.image(0, 0, bgFarTex(b)).setOrigin(0);
    this.add.image(0, 0, bgMidTex(b)).setOrigin(0).setAlpha(0.95);
    const solid = (x: number, y: number) => y < 0 || y >= ROOM.length || x < 0 || x >= ROOM[0].length || ROOM[y][x] === '#' || ROOM[y][x] === '^' && false;
    const isS = (x: number, y: number) => y < 0 || y >= ROOM.length || x < 0 || x >= ROOM[0].length || ROOM[y][x] === '#';
    const ox = -8, oy = 0;
    for (let y = 0; y < ROOM.length; y++)
      for (let x = 0; x < ROOM[0].length; x++) {
        const ch = ROOM[y][x];
        const X = ox + x * 16, Y = oy + y * 16;
        if (ch !== '#') {
          const v = (x * 7 + y * 3) % 11;
          const back = v === 0 ? TILE_FRAMES.backDecor[(x + y) % 4] : TILE_FRAMES.backWall[(x * 3 + y) % 5];
          if (y > 0 && y < 13) this.add.image(X, Y, tilesTex(b), back).setOrigin(0);
        }
        if (ch === '#') {
          const m = (isS(x, y - 1) ? 1 : 0) | (isS(x + 1, y) ? 2 : 0) | (isS(x, y + 1) ? 4 : 0) | (isS(x - 1, y) ? 8 : 0);
          const f = m === 15 && (x * 13 + y * 7) % 9 === 0 ? TILE_FRAMES.solidVariants[(x + y) % 4] : m;
          this.add.image(X, Y, tilesTex(b), f).setOrigin(0);
        } else if (ch === '-') this.add.image(X, Y, tilesTex(b), TILE_FRAMES.platform).setOrigin(0);
        else if (ch === '^') this.add.image(X, Y, tilesTex(b), TILE_FRAMES.spikes).setOrigin(0);
        else if (ch === 'H') this.add.image(X, Y, tilesTex(b), TILE_FRAMES.ladder).setOrigin(0);
        else if (ch === 't') {
          this.add.image(X + 8, Y + 8, FX.glow).setTint(BIOME_PALETTES[b].light).setBlendMode(Phaser.BlendModes.ADD).setScale(1.5).setAlpha(0.8);
          this.add.sprite(X + 4, Y, OBJ.torch).play(ANIMS.torchBurn);
        } else if (ch === 'w') this.add.image(X, Y, OBJ.banner).setOrigin(0).setTint(BIOME_PALETTES[b].accent);
      }
    void solid;
    const g = oy + 12 * 16;
    this.add.sprite(ox + 6 * 16, g, 'player').setOrigin(0.5, 1).play(PLAYER_ANIMS.run);
    this.add.sprite(ox + 9 * 16, g, 'player').setOrigin(0.5, 1).play(PLAYER_ANIMS.attackA);
    const ids = Object.keys(ENEMY_ART);
    const pick = ids.slice(((page - 3) * 3) % ids.length, ((page - 3) * 3) % ids.length + 4);
    pick.forEach((id, k) => this.add.sprite(ox + (19 + k * 2) * 16, oy + 8 * 16 + (k > 1 ? 4 * 16 : 0), enemyTex(id)).setOrigin(0.5, 1).play(enemyAnim(id, k % 2 ? 'move' : 'idle')).setFlipX(true));
    this.add.sprite(ox + 3 * 16, oy + 7 * 16, OBJ.chest, 0).setOrigin(0, 1);
    this.add.sprite(ox + 26 * 16, oy + 12 * 16, OBJ.exitPortal).setOrigin(0.5, 1).play(ANIMS.exitSwirl);
    this.add.sprite(ox + 11 * 16, oy + 12 * 16 - 4, OBJ.coin).play(ANIMS.coinSpin);
    this.add.bitmapText(4, 236, UI.font, `${b.toUpperCase()} - Floor 3  The quick brown fox jumps! 0123456789`).setTint(0xe8e2d0);
    this.add.bitmapText(4, 248, UI.fontBig, 'Hollow Spire').setTint(0xffd24a);
  }
  misc() {
    let x = 2, y = 2;
    const place = (key: string, frame?: number | string, anim?: string) => {
      const tex = this.textures.get(key);
      const fr = tex.get(frame ?? (tex.frameTotal > 1 ? 0 : '__BASE'));
      if (x + fr.width > 478) { x = 2; y += 50; }
      const s = this.add.sprite(x, y, key, frame).setOrigin(0);
      if (anim) s.play(anim);
      x += fr.width + 3;
    };
    for (const k of Object.values(OBJ)) place(k, undefined, k === OBJ.coin ? ANIMS.coinSpin : k === OBJ.ember ? ANIMS.emberFlicker : k === OBJ.merchant ? ANIMS.merchantIdle : k === OBJ.torch ? ANIMS.torchBurn : k === OBJ.exitPortal ? ANIMS.exitSwirl : undefined);
    place(OBJ.chest, 1); place(OBJ.altar, 1);
    x = 2; y += 50;
    for (const k of ['slash', 'slash-wide', 'stab', 'smash', 'spin'] as const) for (let f = 0; f < 5; f++) place(slashTex(k), f);
    x = 2; y += 50;
    for (const [k, n] of [[FX.hitSpark, 4], [FX.explosion, 7], [FX.dust, 5], [FX.smoke, 6], [FX.deathBurst, 6], [FX.lightning, 4]] as const) for (let f = 0; f < n; f++) place(k, f);
    for (const k of [FX.particle, FX.spark, FX.glow, FX.ring, FX.shadow]) place(k);
  }
  misc2() {
    let x = 2, y = 2;
    const place = (key: string) => {
      const fr = this.textures.get(key).get();
      if (x + fr.width > 478) { x = 2; y += 20; }
      this.add.image(x, y, key).setOrigin(0);
      x += fr.width + 3;
    };
    for (const p of ['arrow', 'bolt', 'knife', 'fireball', 'spark', 'orb', 'bomb', 'feather', 'bone', 'grenade', 'icicle', 'ink', 'darkorb'] as ProjectileKey[]) place(projTex(p));
    for (const id of ICON_IDS) place(iconTex(id));
    x = 2; y += 18;
    for (const k of [UI.stickBase, UI.stickKnob, UI.button, UI.slot, UI.cursor]) place(k);
    for (const g of ['jump', 'attack1', 'attack2', 'dodge', 'skill1', 'skill2', 'potion', 'interact', 'pause'] as const) place(UI.btnGlyph(g));
    x = 2; y += 70;
    place(UI.title);
    this.add.bitmapText(300, 200, UI.font, 'Rare item').setTint(RARITY_COLORS.rare);
    this.add.bitmapText(300, 212, UI.font, `built in ${Math.round((window as any).__buildMs)} ms`);
  }
}

new Phaser.Game({
  type: Phaser.WEBGL,
  parent: 'game',
  width: 480,
  height: 270,
  zoom: 3,
  pixelArt: true,
  backgroundColor: '#3a3a4a',
  scene: [Preview],
});
