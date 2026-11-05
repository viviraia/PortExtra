/**
 * Loose pickups that fly out of chests/enemies and get vacuumed up:
 * coins, embers, health orbs and scrolls.
 */
import Phaser from 'phaser';
import { ANIMS, FX, OBJ } from '../art/keys';
import { audio } from '../core/audio';
import type { StatTrack } from '../data/types';
import { relicHooks } from '../combat/PlayerCombat';
import type { World } from './World';

export type PickupKind = 'coin' | 'ember' | 'heart' | 'scroll';

interface Loose {
  kind: PickupKind;
  value: number;
  track?: StatTrack;
  sprite: Phaser.Physics.Arcade.Sprite;
  readyAt: number;
  dead: boolean;
}

const MAGNET_RADIUS = 34;

export class PickupSystem {
  readonly group: Phaser.Physics.Arcade.Group;
  private items: Loose[] = [];
  private coinStreak = 0;
  private lastCoinAt = -9999;

  constructor(private world: World) {
    this.group = world.stage.physics.add.group({ allowGravity: true, bounceY: 0.45, dragX: 120 });
  }

  spawn(kind: PickupKind, x: number, y: number, value = 1, opts: { track?: StatTrack; burst?: boolean } = {}): void {
    const scene = this.world.stage;
    const key =
      kind === 'coin' ? OBJ.coin : kind === 'ember' ? OBJ.ember : kind === 'heart' ? OBJ.heart : opts.track === 'might' ? OBJ.scrollMight : opts.track === 'cunning' ? OBJ.scrollCunning : OBJ.scrollVigor;
    const s = this.group.create(x, y, scene.textures.exists(key) ? key : FX.particle) as Phaser.Physics.Arcade.Sprite;
    s.setDepth(450);
    const body = s.body as Phaser.Physics.Arcade.Body;
    body.setSize(Math.min(8, s.width), Math.min(8, s.height));
    body.setBounce(0.3, 0.45);
    body.setDrag(160, 0);
    body.setMaxVelocity(300, 460);
    if (kind === 'coin' && scene.anims.exists(ANIMS.coinSpin)) s.play({ key: ANIMS.coinSpin, startFrame: Phaser.Math.Between(0, 3) });
    if (kind === 'ember' && scene.anims.exists(ANIMS.emberFlicker)) s.play(ANIMS.emberFlicker);
    if (opts.burst !== false) s.setVelocity(Phaser.Math.Between(-90, 90), Phaser.Math.Between(-240, -120));
    if (kind === 'ember' || kind === 'scroll') {
      const glow = scene.add.image(x, y, FX.glow).setBlendMode(Phaser.BlendModes.ADD).setTint(kind === 'ember' ? 0xff7a2a : 0xffe08a).setAlpha(0.5).setScale(0.4).setDepth(449);
      s.setData('glow', glow);
    }
    this.items.push({ kind, value, track: opts.track, sprite: s, readyAt: this.world.now + 350, dead: false });
  }

  /** Spawn `total` coins split into a handful of coin sprites. */
  spawnCoins(x: number, y: number, total: number): void {
    if (total <= 0) return;
    const n = Math.min(12, Math.max(1, Math.round(total / 4)));
    let left = total;
    for (let i = 0; i < n; i++) {
      const v = i === n - 1 ? left : Math.max(1, Math.round(total / n));
      left -= v;
      if (v > 0) this.spawn('coin', x, y, v);
    }
  }

  update(dt: number): void {
    const p = this.world.player;
    if (p.state2 === 'dead') return;
    const magnet = relicHooks(this.world, 'coin-magnet').reduce((m, h) => Math.max(m, h.radius ?? 140), MAGNET_RADIUS);
    const now = this.world.now;
    for (const it of this.items) {
      if (it.dead) continue;
      const s = it.sprite;
      const glow = s.getData('glow') as Phaser.GameObjects.Image | undefined;
      glow?.setPosition(s.x, s.y);
      if (s.y > this.world.floor.worldH + 32) {
        this.collect(it);
        continue;
      }
      if (now < it.readyAt) continue;
      const dx = p.centerX - s.x, dy = p.centerY - s.y;
      const d = Math.hypot(dx, dy);
      const r = it.kind === 'scroll' ? 14 : it.kind === 'heart' ? Math.min(magnet, 48) : magnet;
      if (d < r) {
        const body = s.body as Phaser.Physics.Arcade.Body;
        body.setAllowGravity(false);
        const sp = 260 + (r - d) * 6;
        body.velocity.x = (dx / (d || 1)) * sp;
        body.velocity.y = (dy / (d || 1)) * sp;
        if (d < 8) this.collect(it);
      }
      // Bob scrolls.
      if (it.kind === 'scroll') s.y += Math.sin(now / 200) * 0.15 * dt * 60;
    }
    if (this.items.some((i) => i.dead)) this.items = this.items.filter((i) => !i.dead);
  }

  private collect(it: Loose): void {
    it.dead = true;
    const s = it.sprite;
    const x = s.x, y = s.y;
    (s.getData('glow') as Phaser.GameObjects.Image | undefined)?.destroy();
    s.destroy();
    if (y > this.world.floor.worldH + 32) return;
    const w = this.world;
    switch (it.kind) {
      case 'coin':
        w.addCoins(it.value, x, y);
        {
          // Rapid pickups climb in pitch for a satisfying jingle.
          const t = this.world.now;
          this.coinStreak = t - this.lastCoinAt < 350 ? Math.min(this.coinStreak + 1, 14) : 0;
          this.lastCoinAt = t;
          audio.sfx('coin', { volume: 0.4, pitch: 1 + this.coinStreak * 0.045 });
        }
        break;
      case 'ember':
        w.addEmbers(it.value, x, y);
        audio.sfx('ember');
        break;
      case 'heart': {
        const amt = w.run.stats.maxHp * 0.15 * it.value;
        w.run.heal(amt);
        w.juice.damageNumber(x, y, amt, { color: 0x6aff8a, text: `+${Math.round(amt)}` });
        audio.sfx('heal');
        break;
      }
      case 'scroll':
        if (it.track) w.grantScroll(it.track);
        break;
    }
    w.juice.burst(x, y, { count: 3, tint: it.kind === 'coin' ? 0xffd35a : it.kind === 'ember' ? 0xff7a2a : 0x8aff9a, speed: [20, 60], gravity: 0, life: [100, 250], blendAdd: true });
  }

  clear(): void {
    for (const it of this.items) {
      (it.sprite.getData('glow') as Phaser.GameObjects.Image | undefined)?.destroy();
      it.sprite.destroy();
    }
    this.items = [];
  }
}
