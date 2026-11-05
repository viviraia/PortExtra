/**
 * Projectiles for both the player and enemies. Pooled sprites, manual tile
 * collision against the floor grid, overlap checks against enemies/player.
 */
import Phaser from 'phaser';
import { DEPTH } from '../config';
import { FX, projTex, type ProjectileKey } from '../art/keys';
import type { Enemy } from './Enemy';
import type { PlayerHit, World } from './World';

export interface ProjectileSpec {
  owner: 'player' | 'enemy';
  key: ProjectileKey;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** px/s^2 downward. */
  gravity?: number;
  lifeMs?: number;
  /** Extra enemies passed through. */
  pierce?: number;
  /** Chain-lightning jumps on hit. */
  chain?: number;
  /** Bounce coefficient off walls (0 = destroy on wall). */
  bounce?: number;
  /** Player-owned: builds the hit vs an enemy. */
  makeHit?: (e: Enemy) => PlayerHit;
  /** Enemy-owned: raw damage to the player. */
  damage?: number;
  cause?: string;
  /** Explode in a radius when it hits something / expires. */
  explodeRadius?: number;
  explodeOnExpire?: boolean;
  onExplode?: (x: number, y: number) => void;
  /** Player-owned projectiles hit enemies by default. */
  hitEnemies?: boolean;
  /** Radians per second of homing toward target. */
  homing?: number;
  /** Rotate sprite to face velocity (default true). */
  rotate?: boolean;
  /** Degrees per second of spin instead of facing velocity. */
  spin?: number;
  tint?: number;
  scale?: number;
  /** Hitbox radius (default 4). */
  radius?: number;
  /** Ignore tiles (ghost magic). */
  phasing?: boolean;
  /** Add a glow light behind it. */
  glow?: number;
}

interface Live {
  spec: ProjectileSpec;
  sprite: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image | null;
  vx: number;
  vy: number;
  /** Simulated age in ms (advanced by the same dt as movement, so range is frame-rate independent). */
  age: number;
  lifeMs: number;
  pierceLeft: number;
  hit: Set<Enemy>;
  dead: boolean;
}

export class ProjectileSystem {
  private live: Live[] = [];
  private pool: Phaser.GameObjects.Image[] = [];

  constructor(private world: World) {}

  get count(): number {
    return this.live.length;
  }

  fire(spec: ProjectileSpec): void {
    const scene = this.world.stage;
    const key = projTex(spec.key);
    let sprite = this.pool.pop();
    if (!sprite) sprite = scene.add.image(0, 0, key);
    sprite.setTexture(scene.textures.exists(key) ? key : FX.particle);
    // Enemy projectiles render above the darkness layer so threats are always readable.
    // Enemy shots draw above the darkness so they stay dodgeable in unlit areas.
    const aboveDark = spec.owner === 'enemy';
    sprite.setActive(true).setVisible(true).setPosition(spec.x, spec.y).setDepth(aboveDark ? DEPTH.aboveDarkProjectile : 550).setAlpha(1);
    sprite.setScale(spec.scale ?? 1);
    sprite.setAngle(0);
    if (spec.tint !== undefined) sprite.setTint(spec.tint);
    else sprite.clearTint();
    let glow: Phaser.GameObjects.Image | null = null;
    if (spec.glow !== undefined && scene.textures.exists(FX.glow)) {
      glow = scene.add.image(spec.x, spec.y, FX.glow).setTint(spec.glow).setBlendMode(Phaser.BlendModes.ADD).setScale(0.35).setAlpha(0.6).setDepth(aboveDark ? DEPTH.aboveDark : 549);
    }
    this.live.push({
      spec,
      sprite,
      glow,
      vx: spec.vx,
      vy: spec.vy,
      age: 0,
      lifeMs: spec.lifeMs ?? 1500,
      pierceLeft: spec.pierce ?? 0,
      hit: new Set(),
      dead: false,
    });
  }

  update(dt: number): void {
    for (const p of this.live) {
      if (p.dead) continue;
      const s = p.spec;
      p.age += dt * 1000;
      if (s.homing) this.home(p, dt);
      p.vy += (s.gravity ?? 0) * dt;
      const nx = p.sprite.x + p.vx * dt;
      const ny = p.sprite.y + p.vy * dt;
      // Tile collision (check axis separately to allow bouncing).
      if (!s.phasing && this.world.isSolidAt(nx, ny)) {
        if (s.bounce) {
          const hitX = this.world.isSolidAt(nx, p.sprite.y);
          const hitY = this.world.isSolidAt(p.sprite.x, ny);
          if (hitX) p.vx = -p.vx * s.bounce;
          if (hitY) p.vy = -p.vy * s.bounce;
          if (!hitX && !hitY) {
            p.vx = -p.vx * s.bounce;
            p.vy = -p.vy * s.bounce;
          }
          p.vx *= 0.9;
        } else {
          this.kill(p, true);
          continue;
        }
      } else {
        p.sprite.setPosition(nx, ny);
      }
      if (s.spin) p.sprite.angle += s.spin * dt;
      else if (s.rotate !== false) p.sprite.setRotation(Math.atan2(p.vy, p.vx));
      p.glow?.setPosition(p.sprite.x, p.sprite.y);

      if (p.age >= p.lifeMs) {
        this.kill(p, !!s.explodeOnExpire);
        continue;
      }
      if (s.owner === 'player' && s.hitEnemies !== false) this.checkEnemies(p);
      else if (s.owner === 'enemy') this.checkPlayer(p);
    }
    if (this.live.some((p) => p.dead)) this.live = this.live.filter((p) => !p.dead);
  }

  private home(p: Live, dt: number): void {
    const s = p.spec;
    let tx: number, ty: number;
    if (s.owner === 'enemy') {
      tx = this.world.player.centerX;
      ty = this.world.player.centerY;
    } else {
      const e = this.world.nearestEnemy(p.sprite.x, p.sprite.y, 200);
      if (!e) return;
      tx = e.body.center.x;
      ty = e.body.center.y;
    }
    const speed = Math.hypot(p.vx, p.vy);
    const cur = Math.atan2(p.vy, p.vx);
    const want = Math.atan2(ty - p.sprite.y, tx - p.sprite.x);
    const diff = Phaser.Math.Angle.Wrap(want - cur);
    const turn = Phaser.Math.Clamp(diff, -s.homing! * dt, s.homing! * dt);
    p.vx = Math.cos(cur + turn) * speed;
    p.vy = Math.sin(cur + turn) * speed;
  }

  private checkEnemies(p: Live): void {
    const r = p.spec.radius ?? 4;
    const x = p.sprite.x, y = p.sprite.y;
    for (const e of this.world.enemies) {
      if (!e.alive || p.hit.has(e)) continue;
      const b = e.body;
      if (x + r < b.left || x - r > b.right || y + r < b.top || y - r > b.bottom) continue;
      p.hit.add(e);
      if (p.spec.explodeRadius) {
        this.kill(p, true);
        return;
      }
      const hit = p.spec.makeHit?.(e);
      if (hit) {
        this.world.hitEnemiesInRect(new Phaser.Geom.Rectangle(b.left, b.top, b.width, b.height), (t) => (t === e ? hit : { ...hit, amount: 0 }), new Set(this.world.enemies.filter((o) => o !== e)));
        if (p.spec.chain) this.chain(p, e, hit, p.spec.chain);
      }
      if (p.pierceLeft-- <= 0) {
        this.kill(p, false);
        return;
      }
    }
  }

  private chain(p: Live, from: Enemy, hit: PlayerHit, jumps: number): void {
    let cur = from;
    const done = new Set<Enemy>([from]);
    for (let i = 0; i < jumps; i++) {
      let best: Enemy | null = null;
      let bestD = 90;
      for (const e of this.world.enemies) {
        if (!e.alive || done.has(e)) continue;
        const d = Phaser.Math.Distance.Between(cur.body.center.x, cur.body.center.y, e.body.center.x, e.body.center.y);
        if (d < bestD) {
          bestD = d;
          best = e;
        }
      }
      if (!best) return;
      done.add(best);
      this.drawBolt(cur.body.center.x, cur.body.center.y, best.body.center.x, best.body.center.y);
      const target = best;
      const b = target.body;
      const chained = { ...hit, amount: hit.amount * 0.7, crit: false, kbX: 0, kbY: -30 };
      this.world.hitEnemiesInRect(new Phaser.Geom.Rectangle(b.left, b.top, b.width, b.height), () => chained, new Set(this.world.enemies.filter((o) => o !== target)));
      p.hit.add(target);
      cur = target;
    }
  }

  drawBolt(x0: number, y0: number, x1: number, y1: number, color = 0xbfe6ff): void {
    const g = this.world.stage.add.graphics().setDepth(620).setBlendMode(Phaser.BlendModes.ADD);
    g.lineStyle(2, color, 1);
    g.beginPath();
    g.moveTo(x0, y0);
    const steps = 6;
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      g.lineTo(x0 + (x1 - x0) * t + Phaser.Math.Between(-5, 5), y0 + (y1 - y0) * t + Phaser.Math.Between(-5, 5));
    }
    g.lineTo(x1, y1);
    g.strokePath();
    this.world.stage.tweens.add({ targets: g, alpha: 0, duration: 160, onComplete: () => g.destroy() });
  }

  private checkPlayer(p: Live): void {
    const pl = this.world.player;
    if (pl.state2 === 'dead') return;
    const r = p.spec.radius ?? 4;
    const b = pl.body;
    const x = p.sprite.x, y = p.sprite.y;
    if (x + r < b.left || x - r > b.right || y + r < b.top || y - r > b.bottom) return;
    if (pl.rolling) return; // dodge through projectiles
    if (p.spec.explodeRadius) {
      this.kill(p, true);
      return;
    }
    this.world.damagePlayer(p.spec.damage ?? 10, { x: x - p.vx * 0.05, y }, p.spec.cause ?? 'Projectile', { kb: 120 });
    this.kill(p, false);
  }

  private kill(p: Live, explode: boolean): void {
    if (p.dead) return;
    p.dead = true;
    const x = p.sprite.x, y = p.sprite.y;
    if (explode && p.spec.explodeRadius) {
      if (p.spec.onExplode) p.spec.onExplode(x, y);
      else this.defaultExplode(p, x, y);
    } else {
      this.world.juice.burst(x, y, { count: 4, tint: p.spec.tint ?? 0xffffff, speed: [20, 80], life: [100, 250], gravity: 100 });
    }
    p.sprite.setActive(false).setVisible(false);
    this.pool.push(p.sprite);
    p.glow?.destroy();
  }

  private defaultExplode(p: Live, x: number, y: number): void {
    const r = p.spec.explodeRadius!;
    this.world.juice.fx(x, y, 'fx-explosion', { scale: r / 24 });
    this.world.juice.shake(0.004, 120);
    if (p.spec.owner === 'player' && p.spec.makeHit) {
      this.world.hitEnemiesInRect(new Phaser.Geom.Rectangle(x - r, y - r, r * 2, r * 2), (e) => p.spec.makeHit!(e));
    } else if (p.spec.owner === 'enemy') {
      const pl = this.world.player;
      if (Phaser.Math.Distance.Between(x, y, pl.centerX, pl.centerY) < r + 6) {
        this.world.damagePlayer(p.spec.damage ?? 10, { x, y }, p.spec.cause ?? 'Explosion', { kb: 200 });
      }
    }
  }

  clear(): void {
    for (const p of this.live) {
      p.sprite.destroy();
      p.glow?.destroy();
    }
    for (const s of this.pool) s.destroy();
    this.live = [];
    this.pool = [];
  }
}
