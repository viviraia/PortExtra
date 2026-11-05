/**
 * Skill behaviors. castSkill dispatches on SkillDef.behavior.
 * Each behavior reads its numbers from SkillDef.params (see src/data/skills.ts).
 * Return false from a behavior to refuse the cast (no cooldown consumed).
 */
import Phaser from 'phaser';
import { FX, iconTex, PLAYER_TEX, projTex } from '../art/keys';
import { audio } from '../core/audio';
import { bus } from '../core/events';
import { input } from '../core/input/InputManager';
import { TILE } from '../config';
import { Tile, type SkillBehavior } from '../data/types';
import type { Enemy } from '../entities/Enemy';
import type { PlayerHit, World } from '../entities/World';
import type { PlayerCombat, SkillController } from './PlayerCombat';
import type { SkillEntity } from './skillEntities';

export type SkillCast = (c: PlayerCombat, s: SkillController) => boolean | void;

const behaviors: Partial<Record<SkillBehavior, SkillCast>> = {};

/** Register/override a behavior implementation. */
export function registerSkill(b: SkillBehavior, fn: SkillCast): void {
  behaviors[b] = fn;
}

export function castSkill(c: PlayerCombat, s: SkillController): boolean | void {
  const fn = behaviors[s.def.behavior] ?? behaviors.nova;
  return fn?.(c, s);
}

// ---- helpers ------------------------------------------------------------------------

/** Build a hit for this skill against an enemy. */
export function skillHit(c: PlayerCombat, s: SkillController, e: Enemy, mult = 1, dirX = 1, kb = 120, kbY = -80): PlayerHit {
  return c.makeHit(e, {
    item: s.item,
    def: { baseDamage: s.def.damage, track: s.def.track },
    mult,
    kb,
    kbY,
    dirX: dirX || 1,
    onHit: s.def.status,
    source: s.def.name,
  });
}

/** Hit every enemy whose body is within radius r of (x, y). Returns enemies hit. */
export function skillAoe(c: PlayerCombat, s: SkillController, x: number, y: number, r: number, mult = 1, kb = 120, already?: Set<Enemy>): Enemy[] {
  const rect = new Phaser.Geom.Rectangle(x - r - 16, y - r - 16, r * 2 + 32, r * 2 + 32);
  return c.world.hitEnemiesInRect(
    rect,
    (e) => {
      const b = e.body;
      // Closest point of the body to the centre.
      const cx = Phaser.Math.Clamp(x, b.left, b.right);
      const cy = Phaser.Math.Clamp(y, b.top, b.bottom);
      if (Math.hypot(cx - x, cy - y) > r) return { amount: 0, crit: false, kbX: 0, kbY: 0, source: s.def.name };
      return skillHit(c, s, e, mult, b.center.x - x, kb, -120);
    },
    already,
  );
}

/** World y of the walkable surface at or below (x, y), or null if none within maxDist. */
export function groundBelow(world: World, x: number, y: number, maxDist = 320): number | null {
  const tx = Math.floor(x / TILE);
  let ty = Math.floor(y / TILE);
  const limit = ty + Math.ceil(maxDist / TILE);
  // If we start inside a solid tile, walk up out of it.
  for (let i = 0; i < 4 && world.floor.isSolid(tx, ty); i++) ty--;
  for (; ty <= limit; ty++) {
    const t = world.floor.tileAt(tx, ty + 1);
    if (t === Tile.Solid || t === Tile.Platform) return (ty + 1) * TILE;
  }
  return null;
}

function ownerTarget(c: PlayerCombat, range: number): { x: number; y: number } | null {
  const p = c.player;
  if (input.aim && input.usingMouse) {
    const pw = input.pointerWorld;
    const d = Math.hypot(pw.x - p.centerX, pw.y - p.centerY);
    if (d <= range) return { x: pw.x, y: pw.y };
    return { x: p.centerX + ((pw.x - p.centerX) / d) * range, y: p.centerY + ((pw.y - p.centerY) / d) * range };
  }
  // Nearest enemy in front, then any, then straight ahead.
  let best: Enemy | null = null;
  let bd = range;
  for (const e of c.world.enemies) {
    if (!e.alive) continue;
    const dx = e.centerX - p.centerX;
    const d = Math.hypot(dx, e.centerY - p.centerY) + (Math.sign(dx) === p.facing ? 0 : 80);
    if (d < bd && c.world.lineOfSight(p.centerX, p.centerY - 6, e.centerX, e.centerY)) {
      bd = d;
      best = e;
    }
  }
  if (best) return { x: best.centerX, y: best.centerY };
  return null;
}

// ---- grenade --------------------------------------------------------------------------

registerSkill('grenade', (c, s) => {
  const p = c.player;
  const aim = c.aim(false);
  const radius = s.def.params.radius ?? 36;
  const speed = s.def.params.throwSpeed ?? 220;
  audio.sfx('grenadeThrow');
  const dirX = aim.manual ? aim.x : p.facing;
  const vy = aim.manual ? Math.min(-100, aim.y * speed - 140) : -200;
  c.world.projectiles.fire({
    owner: 'player',
    key: 'grenade',
    x: p.centerX + p.facing * 6,
    y: p.centerY - 6,
    vx: dirX * speed * 0.8,
    vy,
    gravity: 700,
    lifeMs: s.def.params.fuseMs ?? 900,
    pierce: 0,
    explodeOnExpire: true,
    explodeRadius: radius,
    bounce: 0.4,
    hitEnemies: true,
    rotate: false,
    spin: 540 * Math.sign(dirX || 1),
    glow: 0xff8a3a,
    makeHit: (e) => skillHit(c, s, e),
    onExplode: (x, y) => {
      audio.sfx('explosion');
      c.world.juice.fx(x, y, 'fx-explosion', { scale: (radius / 24) * 0.8, add: true });
      c.world.juice.shake(0.006, 160);
      c.world.juice.burst(x, y, { count: 18, tint: [0xffb347, 0xff5a2a, 0xffe08a], speed: [60, 200], gravity: 200, blendAdd: true, life: [200, 500] });
      skillAoe(c, s, x, y, radius, 1, 200);
    },
  });
});

// ---- nova -----------------------------------------------------------------------------

registerSkill('nova', (c, s) => {
  const p = c.player;
  const r = s.def.params.radius ?? 56;
  const frost = s.def.status?.status === 'freeze';
  const color = frost ? 0x9be7ff : 0xffffff;
  audio.sfx(frost ? 'freeze' : 'magic');
  c.world.juice.ring(p.centerX, p.centerY, r, color, 320);
  c.world.juice.ring(p.centerX, p.centerY, r * 0.6, 0xffffff, 220);
  c.world.juice.burst(p.centerX, p.centerY, { count: 28, tint: [color, 0xffffff], speed: [80, r * 4], gravity: 0, life: [200, 420], blendAdd: true });
  c.player.grantIframes(150);
  skillAoe(c, s, p.centerX, p.centerY, r, 1, 160);
});

// ---- trap -----------------------------------------------------------------------------

class SpikeTrap implements SkillEntity {
  private g: Phaser.GameObjects.Graphics;
  private glow: Phaser.GameObjects.Image | null;
  private endAt: number;
  private nextTick = 0;
  private hits = 0;
  private extend = 0;
  private readonly w: number;

  constructor(private c: PlayerCombat, private s: SkillController, private x: number, private y: number) {
    const scene = c.world.stage;
    const p = s.def.params;
    this.w = p.width ?? 32;
    this.endAt = c.world.now + (p.durationMs ?? 8000);
    this.g = scene.add.graphics().setDepth(445);
    this.glow = scene.textures.exists(FX.glow)
      ? scene.add.image(x, y - 2, FX.glow).setTint(0xd02a3a).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.25).setScale(this.w / 48, 0.25).setDepth(444)
      : null;
    this.draw();
    c.world.juice.burst(x, y - 2, { count: 8, tint: 0xb0a8a0, speed: [20, 60], angle: [200, 340], gravity: 200 });
  }

  private draw(): void {
    const g = this.g.clear();
    const n = Math.max(3, Math.round(this.w / 6));
    const step = this.w / n;
    const h = 3 + this.extend * 9;
    g.fillStyle(0x2a2430, 1).fillRect(this.x - this.w / 2 - 1, this.y - 3, this.w + 2, 3);
    g.fillStyle(0x6a5f68, 1).fillRect(this.x - this.w / 2, this.y - 2, this.w, 1);
    for (let i = 0; i < n; i++) {
      const bx = this.x - this.w / 2 + i * step;
      g.fillStyle(this.extend > 0.3 ? 0xe8e0d8 : 0xa89c94, 1);
      g.fillTriangle(bx + 1, this.y - 2, bx + step - 1, this.y - 2, bx + step / 2, this.y - 2 - h);
      if (this.extend > 0.3) {
        g.fillStyle(0xd02a3a, 1).fillRect(Math.round(bx + step / 2) - 0, this.y - 2 - h + 2, 1, 2);
      }
    }
  }

  update(dt: number, now: number): boolean {
    const p = this.s.def.params;
    if (this.extend > 0) {
      this.extend = Math.max(0, this.extend - dt * 4);
      this.draw();
    }
    if (now >= this.nextTick) {
      const rect = new Phaser.Geom.Rectangle(this.x - this.w / 2, this.y - 14, this.w, 14);
      const hit = this.c.world.hitEnemiesInRect(rect, (e) => skillHit(this.c, this.s, e, 1, e.centerX - this.x, 30, -160));
      if (hit.length) {
        this.hits += hit.length;
        this.nextTick = now + (p.tickMs ?? 500);
        this.extend = 1;
        this.draw();
        audio.sfx('trap', { volume: 0.5 });
      }
    }
    const remaining = this.endAt - now;
    if (remaining < 600) {
      const a = Math.floor(now / 80) % 2 ? 0.3 : 1;
      this.g.setAlpha(a);
    }
    this.glow?.setAlpha(0.18 + 0.08 * Math.sin(now / 200));
    return now < this.endAt && this.hits < (p.maxHits ?? 30);
  }

  destroy(): void {
    this.g.destroy();
    this.glow?.destroy();
  }
}

registerSkill('trap', (c, s) => {
  const p = c.player;
  const x = p.centerX + p.facing * 14;
  const gy = groundBelow(c.world, x, p.body.bottom - 4, 48);
  if (gy === null) {
    audio.sfx('denied', { volume: 0.4 });
    bus.emit('toast', { text: 'Needs solid ground', color: 0xff8a8a });
    return false;
  }
  audio.sfx('trap');
  c.effects.add(new SpikeTrap(c, s, x, gy));
});

// ---- turret ---------------------------------------------------------------------------

class BoltTurret implements SkillEntity {
  private sprite: Phaser.GameObjects.Image;
  private base: Phaser.GameObjects.Graphics;
  private glow: Phaser.GameObjects.Image | null;
  private endAt: number;
  private nextShot: number;
  private facing = 1;

  constructor(private c: PlayerCombat, private s: SkillController, private x: number, private y: number) {
    const scene = c.world.stage;
    this.endAt = c.world.now + (s.def.params.durationMs ?? 12000);
    this.nextShot = c.world.now + 300;
    this.facing = c.player.facing;
    this.base = scene.add.graphics().setDepth(446);
    this.base.fillStyle(0x2a2030, 1).fillRect(x - 6, y - 4, 12, 4);
    this.base.fillStyle(0x6a5a48, 1).fillRect(x - 5, y - 3, 10, 1);
    this.base.lineStyle(1, 0x4a3a30, 1).lineBetween(x - 5, y, x, y - 7).lineBetween(x + 5, y, x, y - 7);
    const key = scene.textures.exists(iconTex(s.def.id)) ? iconTex(s.def.id) : FX.particle;
    this.sprite = scene.add.image(x, y - 12, key).setDepth(447);
    this.sprite.setScale(0.2);
    scene.tweens.add({ targets: this.sprite, scale: 1, duration: 220, ease: 'Back.easeOut' });
    this.glow = scene.textures.exists(FX.glow)
      ? scene.add.image(x, y - 12, FX.glow).setTint(0x9ad0ff).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.35).setScale(0.4).setDepth(446)
      : null;
    c.world.juice.burst(x, y - 4, { count: 8, tint: 0xb0a8a0, speed: [20, 70], angle: [200, 340], gravity: 200 });
  }

  update(_dt: number, now: number): boolean {
    const p = this.s.def.params;
    const range = p.range ?? 180;
    const sx = this.x, sy = this.y - 12;
    const target = this.c.world.nearestEnemy(sx, sy, range, true);
    if (target) {
      this.facing = target.centerX >= sx ? 1 : -1;
      if (now >= this.nextShot) {
        this.nextShot = now + (p.fireRateMs ?? 550);
        const dx = target.centerX - sx, dy = target.centerY - sy;
        const len = Math.hypot(dx, dy) || 1;
        const speed = p.projectileSpeed ?? 420;
        audio.sfx('turret', { volume: 0.35 });
        this.c.world.projectiles.fire({
          owner: 'player',
          key: 'bolt',
          x: sx + (dx / len) * 6,
          y: sy + (dy / len) * 6,
          vx: (dx / len) * speed,
          vy: (dy / len) * speed,
          lifeMs: 900,
          tint: 0xbfe6ff,
          makeHit: (e) => skillHit(this.c, this.s, e, 1, dx, 60, -30),
        });
        this.sprite.setX(sx - this.facing * 2);
        this.c.world.stage.tweens.add({ targets: this.sprite, x: sx, duration: 90 });
      }
    }
    this.sprite.setFlipX(this.facing < 0);
    const remaining = this.endAt - now;
    const blink = remaining < 1000 && Math.floor(now / 90) % 2 === 0;
    this.sprite.setAlpha(blink ? 0.35 : 1);
    this.glow?.setAlpha(0.25 + 0.1 * Math.sin(now / 150));
    return remaining > 0;
  }

  destroy(): void {
    this.c.world.juice.burst(this.x, this.y - 10, { count: 10, tint: [0x9ad0ff, 0xffffff], speed: [30, 90], blendAdd: true });
    this.sprite.destroy();
    this.base.destroy();
    this.glow?.destroy();
  }
}

registerSkill('turret', (c, s) => {
  const p = c.player;
  const x = p.centerX + p.facing * 10;
  const gy = groundBelow(c.world, x, p.body.bottom - 4, 64);
  if (gy === null) {
    audio.sfx('denied', { volume: 0.4 });
    bus.emit('toast', { text: 'Needs solid ground', color: 0xff8a8a });
    return false;
  }
  audio.sfx('turret');
  c.effects.add(new BoltTurret(c, s, x, gy));
});

// ---- dash -----------------------------------------------------------------------------

class PhantomDash implements SkillEntity {
  private endAt: number;
  private hitSet = new Set<Enemy>();
  private lastX: number;
  private nextGhost = 0;
  private readonly dir: number;
  private readonly speed: number;

  constructor(private c: PlayerCombat, private s: SkillController) {
    const p = c.player;
    const dist = s.def.params.distance ?? 110;
    const dur = 170;
    this.dir = input.moveX !== 0 ? Math.sign(input.moveX) : p.facing;
    p.facing = this.dir as 1 | -1;
    this.speed = dist / (dur / 1000);
    this.endAt = c.world.now + dur;
    this.lastX = p.centerX;
    p.grantIframes(s.def.params.iframesMs ?? 350);
    p.body.setAllowGravity(false);
    p.body.velocity.y = 0;
    c.dashing = true;
    c.cancel();
    c.world.juice.burst(p.centerX, p.centerY, { count: 10, tint: [0x9a7cff, 0xd0c0ff], speed: [40, 120], gravity: 0, blendAdd: true });
  }

  update(_dt: number, now: number): boolean {
    const p = this.c.player;
    if (p.state2 === 'dead') return false;
    p.body.velocity.x = this.dir * this.speed;
    p.body.velocity.y = 0;
    // Sweep from the last x to the current x.
    const x0 = Math.min(this.lastX, p.centerX) - 8, x1 = Math.max(this.lastX, p.centerX) + 8;
    const rect = new Phaser.Geom.Rectangle(x0, p.centerY - 14, x1 - x0, 28);
    const hit = this.c.world.hitEnemiesInRect(rect, (e) => ({ ...skillHit(this.c, this.s, e, 1, this.dir, 60, -60), hitstopMs: 30 }), this.hitSet);
    if (hit.length) audio.sfx('hit', { volume: 0.5, pitch: 1.3 });
    this.lastX = p.centerX;
    if (now >= this.nextGhost) {
      this.nextGhost = now + 25;
      this.afterimage();
    }
    return now < this.endAt && !(this.dir > 0 ? p.body.blocked.right : p.body.blocked.left);
  }

  private afterimage(): void {
    const p = this.c.player;
    const scene = this.c.world.stage;
    const frame = p.frame?.name;
    const img = scene.add.image(p.x, p.y, PLAYER_TEX, frame).setOrigin(0.5, 1).setFlipX(p.flipX).setDepth(499).setTintFill(0x9a7cff).setAlpha(0.6).setBlendMode(Phaser.BlendModes.ADD);
    scene.tweens.add({ targets: img, alpha: 0, duration: 260, onComplete: () => img.destroy() });
  }

  destroy(): void {
    const p = this.c.player;
    this.c.dashing = false;
    p.body.setAllowGravity(true);
    p.body.velocity.x = this.dir * 120;
  }
}

registerSkill('dash', (c, s) => {
  if (c.dashing) return false;
  audio.sfx('dodge', { pitch: 0.7 });
  audio.sfx('magic', { volume: 0.4, pitch: 1.4 });
  c.effects.add(new PhantomDash(c, s));
});

// ---- buff -----------------------------------------------------------------------------

class WarCryBuff implements SkillEntity {
  private aura: Phaser.GameObjects.Image | null;
  private nextPuff = 0;

  constructor(private c: PlayerCombat, private endAt: number, private speed: number) {
    const scene = c.world.stage;
    this.aura = scene.textures.exists(FX.glow)
      ? scene.add.image(0, 0, FX.glow).setTint(0xff4a2a).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.4).setScale(0.75).setDepth(498)
      : null;
  }

  update(_dt: number, now: number): boolean {
    const p = this.c.player;
    const active = now < this.endAt && this.c.buffUntil > now;
    if (!active) return false;
    p.speedBuff = this.speed;
    this.aura?.setPosition(p.centerX, p.centerY).setAlpha(0.3 + 0.12 * Math.sin(now / 90));
    if (now >= this.nextPuff) {
      this.nextPuff = now + 90;
      this.c.world.juice.burst(p.centerX + Phaser.Math.Between(-5, 5), p.body.bottom - 2, { count: 1, tint: [0xff6a3a, 0xffb347], speed: [10, 30], angle: [250, 290], gravity: -80, life: [250, 450], blendAdd: true });
    }
    return true;
  }

  destroy(): void {
    this.c.player.speedBuff = 1;
    this.aura?.destroy();
  }
}

registerSkill('buff', (c, s) => {
  const p = c.player;
  const pr = s.def.params;
  const now = c.world.now;
  const dur = pr.durationMs ?? 8000;
  c.buffDamagePct = pr.damagePct ?? 0.4;
  c.buffUntil = now + dur;
  audio.sfx('enemyAlert', { pitch: 0.6 });
  audio.sfx('magic', { pitch: 0.5, volume: 0.5 });
  c.world.juice.ring(p.centerX, p.centerY, 70, 0xff5a3a, 380);
  c.world.juice.ring(p.centerX, p.centerY, 40, 0xffd08a, 260);
  c.world.juice.shake(0.006, 220);
  bus.emit('toast', { text: 'War Cry!', color: 0xff6a4a });
  // Brief stagger on nearby enemies (no damage).
  for (const e of c.world.enemiesInRadius(p.centerX, p.centerY, 70)) e.applyStatus('stun', 0, 400);
  c.effects.add(new WarCryBuff(c, now + dur, 1 + (pr.moveSpeedPct ?? 0.2)));
});

// ---- chain ----------------------------------------------------------------------------

registerSkill('chain', (c, s) => {
  const p = c.player;
  const pr = s.def.params;
  const range = pr.range ?? 110;
  const first = c.world.nearestEnemy(p.centerX, p.centerY - 4, range * 1.6, true);
  if (!first) {
    audio.sfx('denied', { volume: 0.4 });
    bus.emit('toast', { text: 'No target in range', color: 0xff8a8a });
    return false;
  }
  audio.sfx('zap');
  const done = new Set<Enemy>();
  let fromX = p.centerX + p.facing * 6, fromY = p.centerY - 4;
  let cur: Enemy | null = first;
  let mult = 1;
  const jumps = pr.jumps ?? 4;
  for (let i = 0; i <= jumps && cur; i++) {
    const target: Enemy = cur;
    c.world.projectiles.drawBolt(fromX, fromY, target.centerX, target.centerY, 0xbfe6ff);
    c.world.projectiles.drawBolt(fromX, fromY, target.centerX, target.centerY, 0xffffff);
    c.world.juice.fx(target.centerX, target.centerY, 'fx-hit-spark', { tint: 0xbfe6ff, add: true });
    const b = target.body;
    const others = new Set(c.world.enemies.filter((o) => o !== target));
    const m = mult;
    c.world.hitEnemiesInRect(new Phaser.Geom.Rectangle(b.left, b.top, b.width, b.height), (e) => skillHit(c, s, e, m, e.centerX - fromX, 40, -40), others);
    done.add(target);
    fromX = target.centerX;
    fromY = target.centerY;
    mult *= 0.85;
    cur = null;
    let bd = range;
    for (const e of c.world.enemies) {
      if (!e.alive || done.has(e)) continue;
      const d = Phaser.Math.Distance.Between(fromX, fromY, e.centerX, e.centerY);
      if (d < bd && c.world.lineOfSight(fromX, fromY, e.centerX, e.centerY)) {
        bd = d;
        cur = e;
      }
    }
  }
});

// ---- cloud ----------------------------------------------------------------------------

class PoisonCloud implements SkillEntity {
  private endAt: number;
  private nextTick = 0;
  private nextPuff = 0;
  private puffs: Phaser.GameObjects.Image[] = [];

  constructor(private c: PlayerCombat, private s: SkillController, private x: number, private y: number) {
    this.endAt = c.world.now + (s.def.params.durationMs ?? 6000);
    const r = this.radius;
    const scene = c.world.stage;
    if (scene.textures.exists(FX.glow)) {
      for (let i = 0; i < 5; i++) {
        const img = scene.add
          .image(x + Phaser.Math.Between(-r / 2, r / 2), y - Phaser.Math.Between(4, r / 2), FX.glow)
          .setTint(i % 2 ? 0x6aa03a : 0x9ad04a)
          .setAlpha(0)
          .setScale((r / 32) * Phaser.Math.FloatBetween(0.6, 1))
          .setDepth(560);
        scene.tweens.add({ targets: img, alpha: 0.35, duration: 300 });
        this.puffs.push(img);
      }
    }
    c.world.juice.ring(x, y - 4, r, 0x8ad04a, 300);
  }

  get radius(): number {
    return this.s.def.params.radius ?? 48;
  }

  update(_dt: number, now: number): boolean {
    const r = this.radius;
    this.puffs.forEach((pf, i) => {
      pf.x += Math.sin(now / 700 + i * 1.7) * 0.15;
      pf.y += Math.cos(now / 900 + i) * 0.1;
    });
    if (now >= this.nextPuff) {
      this.nextPuff = now + 70;
      this.c.world.juice.burst(this.x + Phaser.Math.Between(-r, r) * 0.8, this.y - Phaser.Math.Between(2, r * 0.7), { count: 1, tint: [0x8ad04a, 0x5a8a2a, 0xb8f06a], speed: [4, 16], gravity: -15, life: [400, 800], scale: [1.4, 0] });
    }
    if (now >= this.nextTick) {
      this.nextTick = now + (this.s.def.params.tickMs ?? 400);
      skillAoe(this.c, this.s, this.x, this.y - r * 0.4, r, 1, 0);
    }
    const remaining = this.endAt - now;
    if (remaining < 500) this.puffs.forEach((pf) => pf.setAlpha(Math.max(0, (remaining / 500) * 0.35)));
    return remaining > 0;
  }

  destroy(): void {
    this.puffs.forEach((p) => p.destroy());
  }
}

registerSkill('cloud', (c, s) => {
  const p = c.player;
  const aim = c.aim(false);
  const speed = s.def.params.throwSpeed ?? 220;
  const dirX = aim.manual ? aim.x : p.facing;
  audio.sfx('grenadeThrow', { pitch: 1.2 });
  const spawnCloud = (x: number, y: number) => {
    const gy = groundBelow(c.world, x, y - 2, 96) ?? y;
    audio.sfx('poison');
    audio.sfx('explosion', { volume: 0.3, pitch: 1.6 });
    c.world.juice.burst(x, gy - 6, { count: 16, tint: [0x8ad04a, 0xd0ff8a], speed: [40, 120], gravity: 150 });
    c.effects.add(new PoisonCloud(c, s, x, gy));
  };
  c.world.projectiles.fire({
    owner: 'player',
    key: 'bomb',
    x: p.centerX + p.facing * 6,
    y: p.centerY - 6,
    vx: dirX * speed * 0.55,
    vy: aim.manual ? Math.min(-80, aim.y * speed - 110) : -150,
    gravity: 650,
    lifeMs: 1600,
    tint: 0x9ad04a,
    rotate: false,
    spin: 420 * Math.sign(dirX || 1),
    explodeRadius: 1,
    explodeOnExpire: true,
    hitEnemies: true,
    makeHit: (e) => skillHit(c, s, e, 0.5),
    onExplode: (x, y) => spawnCloud(x, y),
  });
});

// ---- orbit ----------------------------------------------------------------------------

class OrbitBlades implements SkillEntity {
  private blades: Phaser.GameObjects.Image[] = [];
  private glows: Phaser.GameObjects.Image[] = [];
  private endAt: number;
  private angle = 0;
  private lastHit = new Map<Enemy, number>();

  constructor(private c: PlayerCombat, private s: SkillController) {
    const scene = c.world.stage;
    const n = s.def.params.count ?? 3;
    this.endAt = c.world.now + (s.def.params.durationMs ?? 8000);
    const key = scene.textures.exists(projTex('knife')) ? projTex('knife') : FX.particle;
    for (let i = 0; i < n; i++) {
      this.blades.push(scene.add.image(0, 0, key).setDepth(530).setTint(0xd8f4ff).setScale(1.3));
      if (scene.textures.exists(FX.glow)) this.glows.push(scene.add.image(0, 0, FX.glow).setTint(0x8ad8ff).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.45).setScale(0.3).setDepth(529));
    }
  }

  update(dt: number, now: number): boolean {
    const p = this.c.player;
    const r = this.s.def.params.radius ?? 30;
    const tick = this.s.def.params.tickMs ?? 300;
    this.angle += dt * 6.5;
    const n = this.blades.length;
    const remaining = this.endAt - now;
    const blink = remaining < 900 && Math.floor(now / 80) % 2 === 0;
    for (let i = 0; i < n; i++) {
      const a = this.angle + (i * Math.PI * 2) / n;
      const bx = p.centerX + Math.cos(a) * r;
      const by = p.centerY + Math.sin(a) * r * 0.8;
      const blade = this.blades[i];
      blade.setPosition(bx, by).setRotation(a + Math.PI / 2).setAlpha(blink ? 0.3 : 1);
      this.glows[i]?.setPosition(bx, by);
      const rect = new Phaser.Geom.Rectangle(bx - 6, by - 6, 12, 12);
      const skip = new Set<Enemy>();
      for (const [e, t] of this.lastHit) if (now - t < tick) skip.add(e);
      const hit = this.c.world.hitEnemiesInRect(rect, (e) => skillHit(this.c, this.s, e, 1, e.centerX - p.centerX, 80, -40), skip);
      for (const e of hit) {
        this.lastHit.set(e, now);
        audio.sfx('hit', { volume: 0.35, pitch: 1.5 });
      }
    }
    return remaining > 0 && p.state2 !== 'dead';
  }

  destroy(): void {
    for (const b of this.blades) {
      this.c.world.juice.burst(b.x, b.y, { count: 4, tint: 0xd8f4ff, speed: [20, 60], blendAdd: true });
      b.destroy();
    }
    this.glows.forEach((g) => g.destroy());
  }
}

registerSkill('orbit', (c, s) => {
  audio.sfx('magic', { pitch: 1.2 });
  c.world.juice.ring(c.player.centerX, c.player.centerY, s.def.params.radius ?? 30, 0x8ad8ff, 260);
  c.effects.add(new OrbitBlades(c, s));
});

// ---- meteor ---------------------------------------------------------------------------

class Meteor implements SkillEntity {
  private warn: Phaser.GameObjects.Graphics;
  private rock: Phaser.GameObjects.Image;
  private glow: Phaser.GameObjects.Image | null;
  private startAt: number;
  private impactAt: number;
  private done = false;
  private readonly sx: number;
  private readonly sy: number;

  constructor(private c: PlayerCombat, private s: SkillController, private x: number, private y: number) {
    const scene = c.world.stage;
    this.startAt = c.world.now;
    this.impactAt = this.startAt + (s.def.params.delayMs ?? 900);
    this.warn = scene.add.graphics().setDepth(446);
    this.sx = x - 90 * c.player.facing;
    this.sy = y - 240;
    const key = scene.textures.exists(projTex('fireball')) ? projTex('fireball') : FX.particle;
    this.rock = scene.add.image(this.sx, this.sy, key).setScale(2.4).setDepth(560);
    this.glow = scene.textures.exists(FX.glow)
      ? scene.add.image(this.sx, this.sy, FX.glow).setTint(0xff7a2a).setBlendMode(Phaser.BlendModes.ADD).setScale(0.9).setAlpha(0.7).setDepth(559)
      : null;
  }

  update(_dt: number, now: number): boolean {
    if (this.done) return false;
    const r = this.s.def.params.radius ?? 56;
    const t = Phaser.Math.Clamp((now - this.startAt) / (this.impactAt - this.startAt), 0, 1);
    // Warning marker on the ground.
    const g = this.warn.clear();
    const pulse = 0.4 + 0.3 * Math.sin(now / 60);
    g.lineStyle(1, 0xff4a2a, pulse).strokeEllipse(this.x, this.y - 1, r * 2 * (0.4 + 0.6 * t), 10);
    g.fillStyle(0xff4a2a, 0.15 * t).fillEllipse(this.x, this.y - 1, r * 2 * t, 8);
    // Falling rock (accelerating).
    const e = t * t;
    const rx = Phaser.Math.Linear(this.sx, this.x, e);
    const ry = Phaser.Math.Linear(this.sy, this.y - 6, e);
    this.rock.setPosition(rx, ry).setRotation(Math.atan2(this.y - this.sy, this.x - this.sx));
    this.glow?.setPosition(rx, ry);
    if (Math.random() < 0.8) this.c.world.juice.burst(rx, ry, { count: 1, tint: [0xff7a2a, 0xffd08a, 0x5a4040], speed: [10, 40], gravity: -30, life: [200, 500], scale: [1.5, 0] });
    if (now >= this.impactAt) {
      this.impact(r);
      this.done = true;
      return false;
    }
    return true;
  }

  private impact(r: number): void {
    const w = this.c.world;
    audio.sfx('explosion');
    audio.sfx('bossSlam', { volume: 0.6 });
    w.juice.fx(this.x, this.y - r * 0.35, 'fx-explosion', { scale: (r / 24) * 0.75, add: true });
    w.juice.fx(this.x - r * 0.4, this.y - 8, 'fx-explosion', { scale: 0.8, add: true });
    w.juice.fx(this.x + r * 0.4, this.y - 8, 'fx-explosion', { scale: 0.8, add: true });
    w.juice.ring(this.x, this.y - 4, r, 0xff7a2a, 360);
    w.juice.burst(this.x, this.y - 4, { count: 36, tint: [0xff7a2a, 0xffd08a, 0x3a2a2a], speed: [80, 260], angle: [190, 350], gravity: 400, life: [300, 800] });
    w.juice.shake(0.014, 300);
    skillAoe(this.c, this.s, this.x, this.y - r * 0.3, r, 1, 260);
  }

  destroy(): void {
    this.warn.destroy();
    this.rock.destroy();
    this.glow?.destroy();
  }
}

registerSkill('meteor', (c, s) => {
  const p = c.player;
  const target = ownerTarget(c, 260) ?? { x: p.centerX + p.facing * 90, y: p.centerY };
  const gy = groundBelow(c.world, target.x, target.y, 320) ?? groundBelow(c.world, p.centerX + p.facing * 60, p.centerY, 200);
  if (gy === null) {
    audio.sfx('denied', { volume: 0.4 });
    return false;
  }
  audio.sfx('magic', { pitch: 0.6 });
  c.effects.add(new Meteor(c, s, target.x, gy));
});

/** Exposed for tests/debug: every behavior is implemented. */
export const IMPLEMENTED_BEHAVIORS = (): SkillBehavior[] => Object.keys(behaviors) as SkillBehavior[];

