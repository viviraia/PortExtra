/**
 * Shared boss machinery: the Boss enemy subclass (arena detection, gate
 * locking, phase 2 trigger, hazards), a small action/timeline runner for
 * brains, and reusable hazards (ground shockwaves, falling rocks, floor
 * eruptions, telegraph lines, orb drops).
 */
import Phaser from 'phaser';
import { bossAnim, bossTex, FX, OBJ, TILE_FRAMES, type BossAnim, type ProjectileKey } from '../../art/keys';
import { audio } from '../../core/audio';
import { bus } from '../../core/events';
import { BOSSES } from '../../data';
import type { BossDef, EnemyDef } from '../../data/types';
import { Tile } from '../../data/types';
import { ROOM_H, ROOM_W, TILE, DOOR_SIDE_Y0, DOOR_SIDE_Y1 } from '../../config';
import { Enemy } from '../Enemy';
import type { AiBrain } from '../ai';
import type { World } from '../World';

// ---------------------------------------------------------------------------
// Hazards
// ---------------------------------------------------------------------------

export interface Hazard {
  /** Return false when finished (it will be destroyed). */
  update(dt: number, now: number): boolean;
  destroy(): void;
}

function playerRectOverlap(world: World, x: number, y: number, w: number, h: number): boolean {
  const pb = world.player.body;
  return !(x + w < pb.left || x > pb.right || y + h < pb.top || y > pb.bottom);
}

/** Travels along the ground; jump over it. */
export class Shockwave implements Hazard {
  private glow: Phaser.GameObjects.Image;
  private x: number;
  private hit = false;
  private dieAt: number;
  private nextDust = 0;
  constructor(private world: World, x: number, private floorY: number, private dir: number, private speed: number, private dmg: number, private cause: string, private h = 18, private tint = 0xffa04a) {
    this.x = x;
    this.glow = world.stage.add
      .image(x, floorY, FX.glow)
      .setOrigin(0.5, 0.75)
      .setTint(tint)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(0.3, (h * 1.6) / 64)
      .setDepth(806);
    this.dieAt = world.now + 4000;
  }
  update(dt: number, now: number): boolean {
    this.x += this.dir * this.speed * dt;
    this.glow.setPosition(this.x, this.floorY);
    if (now >= this.nextDust) {
      this.nextDust = now + 45;
      this.world.juice.burst(this.x, this.floorY - 2, { count: 3, tint: [this.tint, 0x8a7a6a, 0xffffff], speed: [40, 110], angle: [235, 305], gravity: 500, life: [180, 380] });
    }
    if (!this.hit && playerRectOverlap(this.world, this.x - 6, this.floorY - this.h, 12, this.h)) {
      this.hit = true;
      this.world.damagePlayer(this.dmg, { x: this.x - this.dir * 10, y: this.floorY }, this.cause, { kb: 220 });
    }
    // Stop at walls or when the ground ends.
    if (this.world.isSolidAt(this.x + this.dir * 6, this.floorY - 6) || !this.world.isSolidAt(this.x, this.floorY + 4) || now > this.dieAt) return false;
    return true;
  }
  destroy(): void {
    this.glow.destroy();
  }
}

/** Shadow telegraph, then a rock falls from the ceiling. */
export class FallingRock implements Hazard {
  private shadow: Phaser.GameObjects.Image;
  private rock: Phaser.GameObjects.Image | null = null;
  private vy = 0;
  private t0: number;
  constructor(private world: World, private x: number, private topY: number, private floorY: number, private delayMs: number, private dmg: number, private cause: string, private tex = 'boss-rock') {
    this.t0 = world.now;
    this.shadow = world.stage.add.image(x, floorY - 1, FX.glow).setDepth(805).setTint(0xff7a3a).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.2).setScale(0.2, 0.08);
  }
  update(dt: number, now: number): boolean {
    const t = now - this.t0;
    if (!this.rock) {
      const k = Math.min(1, t / this.delayMs);
      this.shadow.setAlpha(0.3 + 0.6 * k * (0.75 + 0.25 * Math.sin(t / 50))).setScale(0.2 + k * 0.35, 0.08 + k * 0.06);
      if (Math.random() < 0.25) this.world.juice.burst(this.x + Phaser.Math.Between(-6, 6), this.topY + 4, { count: 1, tint: 0x8a7a6a, speed: [0, 10], gravity: 400, life: [300, 500] });
      if (t >= this.delayMs) {
        this.rock = this.world.stage.add.image(this.x, this.topY, this.tex).setDepth(806);
      }
      return true;
    }
    this.vy = Math.min(600, this.vy + 1300 * dt);
    this.rock.y += this.vy * dt;
    this.rock.angle += 360 * dt;
    const r = this.rock;
    if (playerRectOverlap(this.world, r.x - 5, r.y - 5, 10, 10)) {
      this.world.damagePlayer(this.dmg, { x: r.x, y: r.y - 10 }, this.cause, { kb: 120 });
      this.impact();
      return false;
    }
    if (r.y >= this.floorY - 4) {
      this.impact();
      return false;
    }
    return true;
  }
  private impact(): void {
    const x = this.rock?.x ?? this.x;
    const y = this.rock?.y ?? this.floorY;
    this.world.juice.burst(x, y, { count: 10, tint: [0x8a7a6a, 0x5a4e44, 0xcfc2b0], speed: [40, 140], angle: [200, 340], gravity: 500, life: [200, 450] });
    audio.sfx('land', { volume: 0.35 });
  }
  destroy(): void {
    this.shadow.destroy();
    this.rock?.destroy();
  }
}

/** Pulsing ring on the floor, then a damaging pillar erupts. */
export class Eruption implements Hazard {
  private g: Phaser.GameObjects.Graphics;
  private t0: number;
  private fired = false;
  private hitDone = false;
  constructor(private world: World, private x: number, private floorY: number, private delayMs: number, private dmg: number, private cause: string, private color = 0xb070ff, private w = 34, private h = 60) {
    this.t0 = world.now;
    this.g = world.stage.add.graphics().setDepth(805).setBlendMode(Phaser.BlendModes.ADD);
  }
  update(_dt: number, now: number): boolean {
    const t = now - this.t0;
    this.g.clear();
    if (!this.fired) {
      const k = Math.min(1, t / this.delayMs);
      const pulse = 0.5 + 0.5 * Math.sin(t / 60);
      this.g.lineStyle(2, this.color, 0.4 + 0.5 * k * pulse);
      this.g.strokeEllipse(this.x, this.floorY - 2, this.w * (0.6 + 0.4 * k), 8);
      this.g.fillStyle(this.color, 0.12 + 0.25 * k);
      this.g.fillEllipse(this.x, this.floorY - 2, this.w * k, 6 * k);
      if (Math.random() < 0.3) this.world.juice.burst(this.x + Phaser.Math.Between(-this.w / 2, this.w / 2), this.floorY - 2, { count: 1, tint: this.color, speed: [10, 40], angle: [260, 280], gravity: -30, life: [200, 400], blendAdd: true });
      if (t >= this.delayMs) {
        this.fired = true;
        audio.sfx('magic', { volume: 0.6, pitch: 0.7 });
        this.world.juice.fx(this.x, this.floorY - 32, 'fx-lightning', { tint: this.color, add: true, scale: 1.2 });
        this.world.juice.burst(this.x, this.floorY - 4, { count: 18, tint: [this.color, 0xffffff], speed: [80, 220], angle: [250, 290], gravity: 100, life: [250, 500], blendAdd: true });
        this.world.juice.shake(0.003, 90);
      }
      return true;
    }
    // Pillar active for 260ms.
    const a = 1 - (t - this.delayMs) / 260;
    this.g.fillStyle(this.color, 0.35 * Math.max(0, a));
    this.g.fillRect(this.x - this.w / 2 + 4, this.floorY - this.h, this.w - 8, this.h);
    if (!this.hitDone && playerRectOverlap(this.world, this.x - this.w / 2 + 4, this.floorY - this.h, this.w - 8, this.h)) {
      this.hitDone = true;
      this.world.damagePlayer(this.dmg, { x: this.x, y: this.floorY }, this.cause, { kb: 160 });
    }
    return t < this.delayMs + 260;
  }
  destroy(): void {
    this.g.destroy();
  }
}

/** A flashing telegraph line (e.g. dive path). */
export class TelegraphLine implements Hazard {
  private g: Phaser.GameObjects.Graphics;
  private t0: number;
  constructor(world: World, private from: () => { x: number; y: number }, private to: { x: number; y: number }, private ms: number, private color = 0xff4040) {
    this.t0 = world.now;
    this.g = world.stage.add.graphics().setDepth(805).setBlendMode(Phaser.BlendModes.ADD);
  }
  update(_dt: number, now: number): boolean {
    const t = now - this.t0;
    const f = this.from();
    const blink = Math.floor(t / 80) % 2 ? 0.9 : 0.45;
    this.g.clear();
    this.g.lineStyle(1, this.color, blink);
    this.g.lineBetween(f.x, f.y, this.to.x, this.to.y);
    this.g.lineStyle(2, this.color, blink);
    this.g.strokeCircle(this.to.x, this.to.y, 6 + 3 * Math.sin(t / 50));
    return t < this.ms;
  }
  destroy(): void {
    this.g.destroy();
  }
}

/** A glowing marker at the ceiling, then an orb falls. */
export class OrbDrop implements Hazard {
  private glow: Phaser.GameObjects.Image;
  private t0: number;
  constructor(private world: World, private x: number, private y: number, private delayMs: number, private dmg: number, private cause: string, private key: ProjectileKey = 'darkorb', private color = 0xd84060) {
    this.t0 = world.now;
    this.glow = world.stage.add.image(x, y, FX.glow).setTint(color).setBlendMode(Phaser.BlendModes.ADD).setScale(0.15).setAlpha(0.8).setDepth(806);
  }
  update(_dt: number, now: number): boolean {
    const t = now - this.t0;
    this.glow.setScale(0.15 + 0.25 * Math.min(1, t / this.delayMs)).setAlpha(0.5 + 0.4 * Math.sin(t / 40));
    if (t >= this.delayMs) {
      this.world.projectiles.fire({ owner: 'enemy', key: this.key, x: this.x, y: this.y, vx: 0, vy: 90, gravity: 260, lifeMs: 4000, damage: this.dmg, cause: this.cause, glow: this.color, radius: 5 });
      return false;
    }
    return true;
  }
  destroy(): void {
    this.glow.destroy();
  }
}

// ---------------------------------------------------------------------------
// Actions (brain timelines)
// ---------------------------------------------------------------------------

export interface Action {
  name: string;
  /** t = ms since the action started. Return true when finished. */
  update(b: Boss, t: number, dt: number): boolean;
  cancel?(b: Boss): void;
}

export interface SeqStep {
  at: number;
  fn: (b: Boss) => void;
}

/** Fire callbacks at fixed times; optional per-frame tick (return true to end early). */
export function seq(name: string, steps: SeqStep[], end: number, tick?: (b: Boss, t: number, dt: number) => boolean | void, cancel?: (b: Boss) => void): Action {
  let i = 0;
  const sorted = [...steps].sort((a, b) => a.at - b.at);
  return {
    name,
    update(b, t, dt) {
      while (i < sorted.length && t >= sorted[i].at) sorted[i++].fn(b);
      if (tick?.(b, t, dt)) return true;
      return t >= end;
    },
    cancel,
  };
}

/**
 * Base boss brain: dormant until the fight starts, then loops
 * pick -> run action -> rest. Phase 2 interrupts with a roar action.
 */
export abstract class BossBrain implements AiBrain {
  current: Action | null = null;
  started = 0;
  restUntil = 0;
  protected lastPick = '';

  update(e: Enemy, dt: number): void {
    const b = e as Boss;
    if (!b.engaged) {
      b.halt();
      b.playBoss('idle');
      return;
    }
    const now = b.now;
    if (b.phaseQueued) {
      b.phaseQueued = false;
      this.current?.cancel?.(b);
      this.current = this.phaseTwo(b);
      this.started = now;
    }
    if (!this.current) {
      if (now < this.restUntil) {
        this.idle(b, dt);
        return;
      }
      this.current = this.pick(b);
      this.lastPick = this.current.name;
      this.started = now;
    }
    const done = this.current.update(b, now - this.started, dt);
    if (done) {
      this.current = null;
      this.restUntil = now + this.rest(b);
    }
  }

  interrupt(e: Enemy): void {
    const b = e as Boss;
    if (!b.engaged || !this.current) return;
    this.current.cancel?.(b);
    this.current = null;
    this.restUntil = b.now + 500;
  }

  /** Roar into phase 2 (default: flash, shake, invuln-free roar). */
  phaseTwo(_b: Boss): Action {
    return seq(
      'phase2',
      [
        { at: 0, fn: (bb) => bb.roar(true) },
      ],
      1100,
      (bb) => {
        bb.halt();
      },
    );
  }

  /** Called between actions. */
  abstract idle(b: Boss, dt: number): void;
  abstract pick(b: Boss): Action;
  /** Rest between actions in ms. */
  abstract rest(b: Boss): number;
}

// ---------------------------------------------------------------------------
// Boss entity
// ---------------------------------------------------------------------------

export interface BossOptions {
  flying?: boolean;
  speed: number;
  contactDamage?: boolean;
  brain: BossBrain;
}

let texturesReady = false;
function ensureTextures(scene: Phaser.Scene): void {
  if (texturesReady && scene.textures.exists('boss-rock')) return;
  texturesReady = true;
  if (!scene.textures.exists('boss-rock')) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0x2a2420, 1).fillRect(1, 2, 8, 7).fillRect(2, 1, 6, 9);
    g.fillStyle(0x6a5e52, 1).fillRect(2, 2, 6, 6);
    g.fillStyle(0x9a8c7c, 1).fillRect(3, 2, 3, 2);
    g.generateTexture('boss-rock', 10, 10);
    g.destroy();
  }
}

export class Boss extends Enemy {
  readonly bossDef: BossDef;
  readonly roomIndex: number;
  readonly arena: Phaser.Geom.Rectangle;
  /** World y of the arena floor surface. */
  readonly floorY: number;
  engaged = false;
  phase2 = false;
  phaseQueued = false;
  hazards: Hazard[] = [];
  minions: Enemy[] = [];
  private gates: { tx: number; ty: number; prev: number }[] = [];
  private gateSprites: Phaser.GameObjects.Image[] = [];
  /** Difficulty-tier timing multiplier (later loops are a bit faster). */
  readonly tempo: number;

  constructor(world: World, bossId: string, x: number, y: number, opts: BossOptions) {
    const bd = BOSSES[bossId];
    const def: EnemyDef = {
      id: bd.id,
      name: bd.name,
      biomes: [bd.biome],
      minFloor: 1,
      weight: 0,
      ai: 'brute',
      hp: bd.hp,
      damage: bd.damage,
      speed: opts.speed,
      w: bd.w,
      h: bd.h,
      flying: !!opts.flying,
      coins: [0, 0],
      emberChance: 0,
      params: { aggroRange: 9999 },
    };
    ensureTextures(world.stage);
    super(world, def, x, y, { elite: null, texture: bossTex(bossId) });
    this.bossDef = bd;
    this.heavy = true;
    this.contactDamage = opts.contactDamage ?? true;
    this.brain = opts.brain;
    this.setDepth(405);
    this.facing = -1;
    this.tempo = Math.max(0.75, 1 - 0.08 * world.difficulty.loop);
    // Find the arena (the boss room containing the spawn).
    let ri = world.floor.roomAt(x, y - 4);
    if (ri < 0 || world.layout.rooms[ri]?.type !== 'boss') ri = world.layout.rooms.findIndex((r) => r.type === 'boss');
    this.roomIndex = ri;
    const rb = world.floor.roomBounds(Math.max(0, ri));
    this.arena = new Phaser.Geom.Rectangle(rb.x + TILE, rb.y + TILE, rb.width - TILE * 2, rb.height - TILE * 2);
    this.floorY = rb.y + (ROOM_H - 2) * TILE;
    this.playBoss('idle');
  }

  // ---- helpers ---------------------------------------------------------------

  get loop(): number {
    return this.world.difficulty.loop;
  }

  /** Scale a windup/recover duration by phase and loop tempo. */
  ms(base: number, phase2Mult = 0.8): number {
    return base * this.tempo * (this.phase2 ? phase2Mult : 1);
  }

  playBoss(a: BossAnim, force = false): void {
    const key = bossAnim(this.bossDef.id, a);
    if (!this.scene.anims.exists(key)) return;
    if (!force && this.anims.currentAnim?.key === key && this.anims.isPlaying) return;
    this.play(key, !force);
  }

  /** Boss telegraph: windup anim, red flash, sound, warning ring. */
  windup(sound: 'enemyWindup' | 'bossRoar' = 'enemyWindup'): void {
    this.playBoss('windup', true);
    this.setTint(0xff7070);
    this.world.stage.time.delayedCall(120, () => {
      if (this.alive && !this.frozen) this.clearTint();
    });
    this.world.juice.ring(this.centerX, this.centerY, Math.max(this.def.w, this.def.h), 0xff5050, 300);
    audio.sfx(sound, { volume: sound === 'bossRoar' ? 0.6 : 0.6 });
  }

  roar(enraged = false): void {
    this.windup('bossRoar');
    this.world.juice.flash(160, 255, 80, 60);
    this.world.juice.shake(0.01, 600);
    this.world.juice.ring(this.centerX, this.centerY, 120, 0xff3030, 600);
    if (enraged) bus.emit('toast', { text: `${this.bossDef.name} is enraged!`, color: 0xff5050 });
  }

  get arenaLeft(): number {
    return this.arena.left + this.def.w / 2 + 4;
  }
  get arenaRight(): number {
    return this.arena.right - this.def.w / 2 - 4;
  }

  clampX(x: number): number {
    return Phaser.Math.Clamp(x, this.arenaLeft, this.arenaRight);
  }

  /** Ground surface y under world x near y (scans downward from y). */
  groundBelow(x: number, y: number): number {
    const tx = Math.floor(x / TILE);
    for (let ty = Math.floor(y / TILE); ty < Math.floor(y / TILE) + 24; ty++) {
      const t = this.world.floor.tileAt(tx, ty);
      if (t === Tile.Solid || t === Tile.Platform) return ty * TILE;
    }
    return this.floorY;
  }

  /** Walk horizontally; hops small steps (thrones dais). */
  stride(dir: number, mult = 1): void {
    this.facing = dir > 0 ? 1 : -1;
    const sp = this.speed * mult * this.slowMult;
    const atBound = (dir > 0 && this.centerX >= this.arenaRight) || (dir < 0 && this.centerX <= this.arenaLeft);
    this.body.velocity.x = atBound ? 0 : dir * sp;
    if (!this.flying && this.grounded && this.wallAhead(dir) && !atBound) this.body.velocity.y = -230;
  }

  playerInArena(): boolean {
    const p = this.world.player;
    return this.world.floor.roomAt(p.centerX, p.centerY) === this.roomIndex;
  }

  /** Damage the player if overlapping a rect. Returns true on hit. */
  hitRect(x: number, y: number, w: number, h: number, mult: number, kb = 220, cause = this.bossDef.name): boolean {
    if (!playerRectOverlap(this.world, x, y, w, h)) return false;
    this.world.damagePlayer(this.dmg * mult, { x: this.centerX, y: this.centerY }, cause, { kb });
    return true;
  }

  /** Hit area in front of the boss body. */
  frontHit(reach: number, height: number, mult: number, kb = 240): boolean {
    const b = this.body;
    const x = this.facing > 0 ? b.center.x : b.center.x - b.width / 2 - reach;
    return this.hitRect(x, b.bottom - height, b.width / 2 + reach, height, mult, kb);
  }

  addHazard(h: Hazard): void {
    this.hazards.push(h);
  }

  shockwaves(x: number, dirs: number[], speed: number, mult: number, tint?: number): void {
    for (const d of dirs) this.addHazard(new Shockwave(this.world, x + d * 8, this.floorY, d, speed, this.dmg * mult, `${this.bossDef.name}'s shockwave`, 18, tint));
  }

  summon(id: string, count: number, max: number): void {
    this.minions = this.minions.filter((m) => m.active && m.alive);
    const n = Math.min(count, max - this.minions.length);
    for (let i = 0; i < n; i++) {
      const x = this.clampX(this.centerX + (i % 2 ? 1 : -1) * Phaser.Math.Between(30, 70));
      const y = this.def.flying || id === 'imp' ? this.arena.top + 5 * TILE : this.floorY - 2;
      this.world.juice.fx(x, y - 8, 'fx-smoke', { scale: 1.5 });
      const m = this.world.spawnEnemy(id, x, y, { summoned: true });
      if (m) this.minions.push(m);
    }
  }

  // ---- lifecycle -------------------------------------------------------------

  override tick(dt: number): void {
    if (!this.alive) return;
    if (!this.engaged && this.roomIndex >= 0 && this.playerInArena()) {
      const px = this.world.player.centerX;
      if (px > this.arena.left + TILE * 2 && px < this.arena.right - TILE * 2) this.startFight();
    }
    super.tick(dt);
    if (!this.alive) return;
    // Hide the small enemy HP bar; the HUD shows a boss bar.
    (this as any).hpBar?.setVisible(false);
    if (this.engaged && !this.phase2 && this.hp <= this.maxHp * 0.5) {
      this.phase2 = true;
      this.phaseQueued = true;
    }
    const now = this.now;
    this.hazards = this.hazards.filter((h) => {
      const keep = h.update(dt, now);
      if (!keep) h.destroy();
      return keep;
    });
    // Keep inside the arena.
    if (this.engaged) {
      const b = this.body;
      if (b.center.x < this.arena.left + b.width / 2) b.x = this.arena.left;
      if (b.center.x > this.arena.right - b.width / 2) b.x = this.arena.right - b.width;
      if (this.flying && b.top < this.arena.top) {
        b.y = this.arena.top;
        b.velocity.y = Math.max(0, b.velocity.y);
      }
    }
  }

  startFight(): void {
    if (this.engaged) return;
    this.engaged = true;
    this.lockGates();
    this.facePlayer();
    // A dim light so the boss reads in dark arenas (GameScene exposes its lighting).
    const lighting = (this.world as unknown as { lighting?: { add(fn: () => unknown): () => void } }).lighting;
    lighting?.add(() => (this.active && this.alive ? { x: this.centerX, y: this.centerY, radius: 80, intensity: 0.7 } : null));
    const b = this.brain as BossBrain;
    b.current = seq('intro', [{ at: 0, fn: (bb) => bb.roar() }], 1200, (bb) => bb.halt());
    b.started = this.now;
    // GameScene shows the bar on room entry; re-send in case the player arrived another way.
    bus.emit('boss:show', { name: this.bossDef.name, title: this.bossDef.title, hp: this.hp, max: this.maxHp });
  }

  private lockGates(): void {
    const room = this.world.layout.rooms[this.roomIndex];
    if (!room) return;
    const L = this.world.layout;
    const layer = this.world.floor.layer;
    for (const d of room.doors) {
      if (d !== 'L' && d !== 'R') continue;
      const tx = room.gx * ROOM_W + (d === 'L' ? 0 : ROOM_W - 1);
      for (let ry = DOOR_SIDE_Y0; ry <= DOOR_SIDE_Y1; ry++) {
        const ty = room.gy * ROOM_H + ry;
        const idx = ty * L.width + tx;
        if (L.tiles[idx] === Tile.Solid) continue;
        this.gates.push({ tx, ty, prev: L.tiles[idx] });
        L.tiles[idx] = Tile.Solid;
        const t = layer.putTileAt(TILE_FRAMES.solidVariants[0], tx, ty);
        t.setCollision(true, true, true, true);
        t.setAlpha(0);
      }
      const gx = tx * TILE + TILE / 2;
      const gy = (room.gy * ROOM_H + DOOR_SIDE_Y1 + 1) * TILE;
      const h = (DOOR_SIDE_Y1 - DOOR_SIDE_Y0 + 1) * TILE;
      if (this.scene.textures.exists(OBJ.door)) {
        const s = this.world.stage.add.image(gx, gy - h - 8, OBJ.door).setOrigin(0.5, 1).setDepth(-4).setDisplaySize(TILE, h);
        this.world.stage.tweens.add({ targets: s, y: gy, duration: 260, ease: 'Bounce.easeOut' });
        this.gateSprites.push(s);
      }
      this.world.juice.burst(gx, gy - 4, { count: 10, tint: 0x8a7a6a, speed: [40, 120], angle: [200, 340] });
    }
    audio.sfx('door');
    this.world.juice.shake(0.006, 250);
  }

  private unlockGates(): void {
    const L = this.world.layout;
    const layer = this.world.floor.layer;
    for (const g of this.gates) {
      L.tiles[g.ty * L.width + g.tx] = g.prev as typeof L.tiles[number];
      layer.removeTileAt(g.tx, g.ty);
    }
    this.gates = [];
    for (const s of this.gateSprites) {
      this.world.stage.tweens.add({ targets: s, y: s.y - s.displayHeight, alpha: 0, duration: 500, onComplete: () => s.destroy() });
    }
    this.gateSprites = [];
    audio.sfx('door');
  }

  private clearHazards(): void {
    this.hazards.forEach((h) => h.destroy());
    this.hazards = [];
  }

  override kill(reason: string): void {
    if (!this.alive) return;
    (this.brain as BossBrain).current?.cancel?.(this);
    this.clearHazards();
    this.unlockGates();
    for (const m of this.minions) if (m.active && m.alive) m.takeDamage(1e9, false);
    this.minions = [];
    this.clearTint();
    this.setAlpha(1);
    super.kill(reason);
  }

  override destroy(fromScene?: boolean): void {
    this.clearHazards();
    for (const s of this.gateSprites) s.destroy();
    super.destroy(fromScene);
  }
}

// ---------------------------------------------------------------------------
// Extra telegraph hazards & helpers
// ---------------------------------------------------------------------------

/** Non-damaging pulsing ring on the floor (landing / target marker). */
export class FloorMarker implements Hazard {
  private g: Phaser.GameObjects.Graphics;
  private t0: number;
  constructor(world: World, public x: number, private y: number, private ms: number, private color = 0xff4040, private w = 40) {
    this.t0 = world.now;
    this.g = world.stage.add.graphics().setDepth(805).setBlendMode(Phaser.BlendModes.ADD);
  }
  update(_dt: number, now: number): boolean {
    const t = now - this.t0;
    const k = Math.min(1, t / this.ms);
    this.g.clear();
    this.g.lineStyle(2, this.color, Math.floor(t / 90) % 2 ? 0.9 : 0.5);
    this.g.strokeEllipse(this.x, this.y - 2, this.w * (1.4 - 0.6 * k), 8);
    this.g.fillStyle(this.color, 0.15 + 0.2 * k);
    this.g.fillEllipse(this.x, this.y - 2, this.w * 0.8, 5);
    return t < this.ms;
  }
  destroy(): void {
    this.g.destroy();
  }
}

/** Circle outline around a moving source showing an attack radius. */
export class RadiusWarning implements Hazard {
  private g: Phaser.GameObjects.Graphics;
  private t0: number;
  constructor(world: World, private src: () => { x: number; y: number }, private r: number, private ms: number, private color = 0xff5050) {
    this.t0 = world.now;
    this.g = world.stage.add.graphics().setDepth(805).setBlendMode(Phaser.BlendModes.ADD);
  }
  update(_dt: number, now: number): boolean {
    const t = now - this.t0;
    const k = Math.min(1, t / this.ms);
    const c = this.src();
    this.g.clear();
    this.g.lineStyle(1, this.color, 0.35 + 0.5 * k);
    this.g.strokeCircle(c.x, c.y, this.r);
    this.g.fillStyle(this.color, 0.06 + 0.1 * k);
    this.g.fillCircle(c.x, c.y, this.r * k);
    return t < this.ms;
  }
  destroy(): void {
    this.g.destroy();
  }
}

export type Choice = [name: string, weight: number, make: () => Action];

/** Weighted pick that discourages repeating the previous action. */
export function choose(b: Boss, last: string, choices: Choice[]): Action {
  const valid = choices.filter((c) => c[1] > 0);
  const pick = b.world.rng.weighted(valid, (c) => (c[0] === last ? c[1] * 0.3 : c[1]));
  return pick[2]();
}
