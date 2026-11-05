/**
 * Base enemy: physics body, HP, statuses, elite affixes, hit reactions and a
 * toolbox of helpers that AI brains (src/entities/ai) use. Behaviour lives in
 * the brain; this class never decides *what* to do.
 */
import Phaser from 'phaser';
import { enemyAnim, enemyTex, FX, type EnemyAnim } from '../art/keys';
import { STATUS_COLORS } from '../art/palette';
import { audio } from '../core/audio';
import { statusDefaults } from '../combat/damage';
import type { EliteAffix, EnemyDef, StatusId } from '../data/types';
import { TILE } from '../config';
import { Tile } from '../data/types';
import { createBrain, type AiBrain } from './ai';
import type { PlayerHit, World } from './World';
import type { ProjectileKey } from '../art/keys';

interface ActiveStatus {
  until: number;
  nextTick: number;
  /** Damage per tick (DoTs). */
  tickDmg: number;
}

export interface MeleeAttackOpts {
  /** Hitbox reach in front of the body edge. */
  reach: number;
  height: number;
  offsetY?: number;
  /** Damage multiplier on the enemy's damage. */
  mult?: number;
  kb?: number;
  cause?: string;
  /** Hit both sides. */
  around?: boolean;
}

export class Enemy extends Phaser.Physics.Arcade.Sprite {
  declare body: Phaser.Physics.Arcade.Body;
  readonly def: EnemyDef;
  hp: number;
  maxHp: number;
  dmg: number;
  speed: number;
  elite: EliteAffix | null;
  alive = true;
  facing: 1 | -1 = 1;
  summoned = false;
  brain: AiBrain;
  /** Free-form per-brain memory. */
  mem: Record<string, any> = {};
  /** Contact damage enabled (brains may toggle). */
  contactDamage = true;
  /** Brain-controlled: while true, knockback doesn't move it (heavy). */
  heavy = false;
  /** Multiplier on incoming damage (armored elites, shields...). */
  damageTakenMult = 1;
  /** While true, player hits pass through (ghost phasing, mimic burrow...). */
  intangible = false;
  /** Brains may set this to ignore the normal aggro trigger (e.g. dormant mimics). */
  dormant = false;
  private losCheckedAt = -9999;
  private losCached = false;
  private statuses = new Map<StatusId, ActiveStatus>();
  private contactReadyAt = 0;
  private stunUntil = 0;
  private hurtAnimUntil = 0;
  private aggro = false;
  private eliteGlow: Phaser.GameObjects.Image | null = null;
  private hpBar: Phaser.GameObjects.Graphics | null = null;
  private lastHurtAt = -9999;
  readonly flying: boolean;

  constructor(readonly world: World, def: EnemyDef, x: number, y: number, opts: { elite?: EliteAffix | null; summoned?: boolean; texture?: string } = {}) {
    super(world.stage, x, y, opts.texture ?? enemyTex(def.id), 0);
    this.def = def;
    world.stage.add.existing(this);
    world.stage.physics.add.existing(this);
    this.setOrigin(0.5, 1);
    this.setDepth(400);
    this.flying = !!def.flying;
    const d = world.difficulty;
    this.elite = opts.elite ?? null;
    this.summoned = !!opts.summoned;
    this.maxHp = Math.round(def.hp * d.hpMult * (this.elite ? 2.6 : 1) * (this.summoned ? 0.6 : 1));
    this.hp = this.maxHp;
    this.dmg = def.damage * d.dmgMult * (this.elite ? 1.3 : 1);
    this.speed = def.speed * (this.elite === 'swift' ? 1.45 : 1);
    if (this.elite === 'armored') this.damageTakenMult = 0.6;
    this.body.setSize(def.w, def.h);
    this.body.setOffset((this.width - def.w) / 2, this.height - def.h);
    if (this.flying) this.body.setAllowGravity(false);
    this.body.setMaxVelocity(400, 460);
    this.facing = Math.random() < 0.5 ? 1 : -1;
    if (this.elite) {
      this.setScale(1.2);
      this.eliteGlow = world.stage.add
        .image(x, y, FX.glow)
        .setTint(eliteColor(this.elite))
        .setBlendMode(Phaser.BlendModes.ADD)
        .setAlpha(0.45)
        .setDepth(399)
        .setScale(Math.max(def.w, def.h) / 26);
    }
    this.brain = createBrain(def.ai);
    this.brain.init?.(this);
    this.playAnim('idle');
  }

  get centerX(): number {
    return this.body.center.x;
  }
  get centerY(): number {
    return this.body.center.y;
  }
  get now(): number {
    return this.world.now;
  }
  get player() {
    return this.world.player;
  }
  get stunned(): boolean {
    return this.now < this.stunUntil || this.hasStatus('stun');
  }
  get frozen(): boolean {
    return this.hasStatus('freeze');
  }
  /** Speed multiplier from statuses. */
  get slowMult(): number {
    return this.frozen ? 0.3 : 1;
  }
  get isAggro(): boolean {
    return this.aggro;
  }
  get cooldownMult(): number {
    return this.elite === 'frenzied' ? 0.6 : 1;
  }

  // ---- per-frame ---------------------------------------------------------------

  tick(dt: number): void {
    if (!this.alive) return;
    this.updateStatuses();
    if (!this.alive) return;
    if (!this.aggro && !this.dormant && this.distToPlayer() < (this.def.params.aggroRange ?? 140) && this.seesPlayerCached()) {
      this.aggro = true;
      this.brain.onAggro?.(this);
    }
    if (!this.stunned) this.brain.update(this, dt);
    else if (!this.flying) this.body.velocity.x *= 0.9;
    else this.body.velocity.scale(0.9);
    if (this.contactDamage && this.now >= this.contactReadyAt && !this.stunned) this.checkContact();
    this.setFlipX(this.facing < 0);
    if (this.eliteGlow) this.eliteGlow.setPosition(this.centerX, this.centerY).setAlpha(0.35 + 0.15 * Math.sin(this.now / 150));
    this.drawHpBar();
    if (this.y > this.world.floor.worldH + 64) this.kill('fell');
  }

  private checkContact(): void {
    const p = this.player;
    if (p.state2 === 'dead' || p.invulnerable) return;
    const a = this.body, b = p.body;
    if (a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom) return;
    this.contactReadyAt = this.now + 900;
    this.world.damagePlayer(this.dmg * 0.5, { x: this.centerX, y: this.centerY }, this.def.name, { kb: 140 });
  }

  private drawHpBar(): void {
    if (this.hp >= this.maxHp || this.now - this.lastHurtAt > 3000) {
      this.hpBar?.setVisible(false);
      return;
    }
    if (!this.hpBar) this.hpBar = this.world.stage.add.graphics().setDepth(890);
    const g = this.hpBar.setVisible(true).clear();
    const w = Math.max(14, this.def.w + 4);
    const x = Math.round(this.centerX - w / 2);
    const y = Math.round(this.body.top - 6);
    g.fillStyle(0x000000, 0.7).fillRect(x - 1, y - 1, w + 2, 4);
    g.fillStyle(this.elite ? 0xffb02e : 0xd8383a, 1).fillRect(x, y, Math.max(0, Math.round((w * this.hp) / this.maxHp)), 2);
  }

  // ---- statuses ------------------------------------------------------------------

  hasStatus(s: StatusId): boolean {
    const st = this.statuses.get(s);
    return !!st && st.until > this.now;
  }

  applyStatus(s: StatusId, sourceDamage: number, durationMs?: number, potency = 1): void {
    const def = statusDefaults[s];
    const until = this.now + (durationMs ?? def.durationMs) * (this.heavy && (s === 'stun' || s === 'freeze') ? 0.5 : 1);
    // dpsFrac is damage per second as a fraction of the applying hit; convert to per-tick.
    const tickDmg = def.dpsFrac ? Math.max(1, sourceDamage * def.dpsFrac * potency * ((def.tickMs ?? 500) / 1000)) : 0;
    const prev = this.statuses.get(s);
    this.statuses.set(s, {
      until: Math.max(prev?.until ?? 0, until),
      nextTick: prev?.nextTick ?? this.now + (def.tickMs ?? 500),
      tickDmg: Math.max(prev?.tickDmg ?? 0, tickDmg),
    });
    if (s === 'freeze') {
      this.setTint(STATUS_COLORS.freeze);
      audio.sfx('freeze', { volume: 0.4 });
    }
    if (s === 'stun') this.brain.interrupt?.(this);
  }

  private updateStatuses(): void {
    const now = this.now;
    for (const [id, st] of this.statuses) {
      if (st.until <= now) {
        this.statuses.delete(id);
        if (id === 'freeze') this.clearTint();
        continue;
      }
      const def = statusDefaults[id];
      if (st.tickDmg > 0 && now >= st.nextTick) {
        st.nextTick = now + (def.tickMs ?? 500);
        this.takeDamage(st.tickDmg, false, STATUS_COLORS[id]);
        this.world.juice.burst(this.centerX, this.centerY, { count: 2, tint: STATUS_COLORS[id], speed: [10, 30], gravity: id === 'burn' ? -80 : 60, life: [200, 400] });
        if (!this.alive) return;
      }
    }
  }

  // ---- damage --------------------------------------------------------------------

  /** Apply a player hit. Returns the damage actually dealt. */
  hurt(hit: PlayerHit): number {
    if (!this.alive) return 0;
    if (this.intangible) return 0;
    if (hit.amount <= 0) return 0;
    const blocked = this.brain.blocks?.(this, hit) ?? false;
    let amount = hit.amount * (hit.pierceArmor ? 1 : this.damageTakenMult);
    if (blocked) {
      amount *= 0.15;
      audio.sfx('block', { volume: 0.5 });
      this.world.juice.burst(this.centerX - this.facing * -6, this.centerY, { count: 4, tint: 0xd0d0d0, speed: [30, 90] });
    }
    // Frozen enemies shatter: bonus damage and the freeze ends.
    if (this.frozen && hit.crit) {
      amount *= 1.5;
      this.statuses.delete('freeze');
      this.clearTint();
    }
    this.lastHurtAt = this.now;
    this.takeDamage(amount, hit.crit, hit.crit ? 0xffd04a : undefined);
    if (!blocked) {
      if (!this.heavy && !this.elite) {
        this.body.velocity.x = hit.kbX;
        if (!this.flying || Math.abs(hit.kbY) > 0) this.body.velocity.y = Math.min(this.body.velocity.y, hit.kbY);
      } else {
        this.body.velocity.x = hit.kbX * 0.25;
      }
      if (hit.status) this.applyStatus(hit.status.status, amount, hit.status.durationMs, hit.status.potency);
      if (hit.hitstopMs) this.stunUntil = Math.max(this.stunUntil, this.now + Math.min(200, hit.hitstopMs * 3));
      this.brain.onHurt?.(this, hit);
    }
    if (!this.aggro) {
      this.aggro = true;
      this.brain.onAggro?.(this);
    }
    // Feedback
    this.world.juice.hitFlash(this, 60, 0xffffff, () => {
      if (this.frozen) this.setTint(STATUS_COLORS.freeze);
    });
    this.world.juice.fx(this.centerX - Math.sign(hit.kbX) * 2, this.centerY, 'fx-hit-spark', { tint: hit.color, add: true });
    this.world.juice.burst(this.centerX, this.centerY, { count: hit.crit ? 10 : 5, tint: [0xffffff, hit.color ?? 0xffe0a0], speed: [60, 160], life: [120, 300], gravity: 200, angle: hit.kbX >= 0 ? [-60, 60] : [120, 240] });
    if (hit.hitstopMs) this.world.juice.hitstop(hit.hitstopMs * (hit.crit ? 1.5 : 1));
    if (hit.crit) this.world.juice.shake(0.003, 80);
    audio.sfx(hit.crit ? 'crit' : 'hit', { volume: 0.7 });
    if (this.alive && this.now > this.hurtAnimUntil && !this.heavy) {
      this.hurtAnimUntil = this.now + 250;
      this.playAnim('hurt', true);
    }
    return amount;
  }

  /** Raw damage without reactions (DoTs, environment). */
  takeDamage(amount: number, crit: boolean, color?: number): void {
    if (!this.alive) return;
    this.hp -= amount;
    this.world.juice.damageNumber(this.centerX, this.body.top, amount, { crit, color });
    if (this.hp <= 0) this.kill('killed');
  }

  kill(_reason: string): void {
    if (!this.alive) return;
    this.alive = false;
    this.hp = 0;
    this.body.setVelocity(0, 0);
    this.body.setEnable(false);
    this.eliteGlow?.destroy();
    this.hpBar?.destroy();
    this.brain.onDeath?.(this);
    audio.sfx('enemyDie', { volume: 0.7 });
    this.world.juice.burst(this.centerX, this.centerY, { count: 14, tint: [0x2a2030, 0x7a5f8a, 0xffffff], speed: [40, 160], life: [250, 600] });
    this.world.juice.fx(this.centerX, this.centerY, 'fx-death-burst', { add: true });
    if (this.elite === 'explosive') {
      const r = 40;
      this.world.stage.time.delayedCall(350, () => {
        this.world.juice.fx(this.centerX, this.centerY, 'fx-explosion', { scale: r / 24 });
        audio.sfx('explosion');
        if (Phaser.Math.Distance.Between(this.centerX, this.centerY, this.player.centerX, this.player.centerY) < r) {
          this.world.damagePlayer(this.dmg, { x: this.centerX, y: this.centerY }, `Exploding ${this.def.name}`, { kb: 220 });
        }
      });
    }
    this.world.onEnemyKilled(this);
    const key = enemyAnim(this.def.id, 'death');
    if (this.scene.anims.exists(key)) {
      this.play(key);
      this.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => this.fadeOut());
    } else this.fadeOut();
  }

  private fadeOut(): void {
    this.world.stage.tweens.add({ targets: this, alpha: 0, duration: 300, onComplete: () => this.destroy() });
  }

  // ---- helpers for brains -------------------------------------------------------

  playAnim(a: EnemyAnim, force = false): void {
    const key = enemyAnim(this.def.id, a);
    if (!this.scene.anims.exists(key)) return;
    if (!force && this.anims.currentAnim?.key === key && this.anims.isPlaying) return;
    if (!force && (a === 'idle' || a === 'move') && this.anims.isPlaying) {
      const cur = this.anims.currentAnim?.key;
      if (cur === enemyAnim(this.def.id, 'attack') || cur === enemyAnim(this.def.id, 'hurt')) return;
    }
    this.play(key, !force);
  }

  distToPlayer(): number {
    return Phaser.Math.Distance.Between(this.centerX, this.centerY, this.player.centerX, this.player.centerY);
  }

  dxToPlayer(): number {
    return this.player.centerX - this.centerX;
  }

  dyToPlayer(): number {
    return this.player.centerY - this.centerY;
  }

  seesPlayer(): boolean {
    if (this.player.state2 === 'dead') return false;
    return this.world.lineOfSight(this.centerX, this.centerY - 4, this.player.centerX, this.player.centerY - 4);
  }

  facePlayer(): void {
    const dx = this.dxToPlayer();
    if (Math.abs(dx) > 2) this.facing = dx > 0 ? 1 : -1;
  }

  get grounded(): boolean {
    return this.body.blocked.down;
  }

  /** True if there's no floor ahead (would walk off a ledge). */
  atEdge(dir: number = this.facing): boolean {
    if (this.flying) return false;
    const fx = dir > 0 ? this.body.right + 2 : this.body.left - 2;
    const ty = Math.floor((this.body.bottom + 4) / TILE);
    const t = this.world.floor.tileAt(Math.floor(fx / TILE), ty);
    return t !== Tile.Solid && t !== Tile.Platform;
  }

  wallAhead(dir: number = this.facing): boolean {
    return dir > 0 ? this.body.blocked.right : this.body.blocked.left;
  }

  /** Spikes ahead at foot level. */
  hazardAhead(dir: number = this.facing): boolean {
    const fx = dir > 0 ? this.body.right + 4 : this.body.left - 4;
    const t1 = this.world.floor.tileAt(Math.floor(fx / TILE), Math.floor((this.body.bottom - 2) / TILE));
    const t2 = this.world.floor.tileAt(Math.floor(fx / TILE), Math.floor((this.body.bottom + 4) / TILE));
    return t1 === Tile.Spikes || t2 === Tile.Spikes;
  }

  /** Walk horizontally at `speed` toward dir, stopping at ledges/walls. Returns false if blocked. */
  walk(dir: number, speedMult = 1, avoidLedges = true): boolean {
    this.facing = dir > 0 ? 1 : -1;
    if ((avoidLedges && this.grounded && this.atEdge(dir)) || this.hazardAhead(dir)) {
      this.body.velocity.x = 0;
      return false;
    }
    this.body.velocity.x = dir * this.speed * speedMult * this.slowMult;
    return !this.wallAhead(dir);
  }

  halt(): void {
    if (this.flying) this.body.velocity.scale(0.85);
    else this.body.velocity.x *= 0.7;
  }

  /** Fly toward a point (flying enemies). */
  flyToward(x: number, y: number, speedMult = 1): void {
    const dx = x - this.centerX, dy = y - this.centerY;
    const len = Math.hypot(dx, dy) || 1;
    const sp = this.speed * speedMult * this.slowMult;
    this.body.velocity.x = Phaser.Math.Linear(this.body.velocity.x, (dx / len) * sp, 0.08);
    this.body.velocity.y = Phaser.Math.Linear(this.body.velocity.y, (dy / len) * sp, 0.08);
    if (Math.abs(dx) > 2) this.facing = dx > 0 ? 1 : -1;
  }

  /** Visual telegraph: windup anim + tint pulse. */
  telegraph(): void {
    this.playAnim('windup', true);
    this.setTint(0xff6a6a);
    this.world.stage.time.delayedCall(90, () => {
      if (this.alive && !this.frozen) this.clearTint();
    });
    audio.sfx('enemyWindup', { volume: 0.35 });
  }

  /** Melee hitbox in front of the enemy; damages the player if overlapping. Returns true on hit. */
  meleeAttack(o: MeleeAttackOpts): boolean {
    this.playAnim('attack', true);
    const b = this.body;
    const y = b.center.y + (o.offsetY ?? 0) - o.height / 2;
    const rect = o.around
      ? new Phaser.Geom.Rectangle(b.left - o.reach, y, b.width + o.reach * 2, o.height)
      : this.facing > 0
        ? new Phaser.Geom.Rectangle(b.center.x, y, b.width / 2 + o.reach, o.height)
        : new Phaser.Geom.Rectangle(b.center.x - b.width / 2 - o.reach, y, b.width / 2 + o.reach, o.height);
    const pb = this.player.body;
    const hit = Phaser.Geom.Rectangle.Overlaps(rect, new Phaser.Geom.Rectangle(pb.left, pb.top, pb.width, pb.height));
    if (hit) {
      this.world.damagePlayer(this.dmg * (o.mult ?? 1), { x: this.centerX, y: this.centerY }, o.cause ?? this.def.name, { kb: o.kb ?? 180 });
      if (this.elite === 'vampiric') this.hp = Math.min(this.maxHp, this.hp + this.dmg);
    }
    return hit;
  }

  /** Fire a projectile at the player (or along `dir`). */
  shoot(key: ProjectileKey, speed: number, opts: { mult?: number; gravity?: number; dirX?: number; dirY?: number; homing?: number; lifeMs?: number; explodeRadius?: number; offsetY?: number; tint?: number; glow?: number; phasing?: boolean; spin?: number; radius?: number } = {}): void {
    const sx = this.centerX + this.facing * (this.def.w / 2);
    const sy = this.centerY + (opts.offsetY ?? -2);
    let dx = opts.dirX ?? this.player.centerX - sx;
    let dy = opts.dirY ?? this.player.centerY - sy;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    audio.sfx('enemyShoot', { volume: 0.4 });
    this.world.projectiles.fire({
      owner: 'enemy',
      key,
      x: sx,
      y: sy,
      vx: dx * speed,
      vy: dy * speed,
      gravity: opts.gravity,
      damage: this.dmg * (opts.mult ?? 1),
      cause: this.def.name,
      homing: opts.homing,
      lifeMs: opts.lifeMs ?? 2500,
      explodeRadius: opts.explodeRadius,
      explodeOnExpire: !!opts.explodeRadius,
      tint: opts.tint,
      glow: opts.glow,
      phasing: opts.phasing,
      spin: opts.spin,
      radius: opts.radius,
    });
  }

  // ---- additive helpers (M3 AI) -------------------------------------------------

  /** Line of sight to the player, re-evaluated at most every `ms`. */
  seesPlayerCached(ms = 160): boolean {
    if (this.now - this.losCheckedAt >= ms) {
      this.losCheckedAt = this.now + Math.random() * 40; // stagger raycasts across enemies
      this.losCached = this.seesPlayer();
    }
    return this.losCached;
  }

  /** Stun for `ms` (e.g. a charger slamming into a wall). */
  stun(ms: number): void {
    this.stunUntil = Math.max(this.stunUntil, this.now + ms);
    this.brain.interrupt?.(this);
  }

  /** Become aggressive immediately (summons, ambush reveals). */
  forceAggro(): void {
    if (this.aggro) return;
    this.aggro = true;
    this.brain.onAggro?.(this);
  }

  /** Body overlaps the player (optionally padded). */
  touchingPlayer(pad = 0): boolean {
    const a = this.body, b = this.player.body;
    return !(a.right + pad < b.left || a.left - pad > b.right || a.bottom + pad < b.top || a.top - pad > b.bottom);
  }

  /** Deal this enemy's damage to the player directly (lunges, dives, charges). */
  hitPlayer(mult = 1, kb = 180, cause?: string): void {
    this.world.damagePlayer(this.dmg * mult, { x: this.centerX, y: this.centerY }, cause ?? this.def.name, { kb });
    if (this.elite === 'vampiric') this.hp = Math.min(this.maxHp, this.hp + this.dmg * mult);
  }

  /** Can this ground enemy stand at tile (tx, ty)? (feet cell empty, solid/platform below, headroom) */
  canStandAt(tx: number, ty: number): boolean {
    const f = this.world.floor;
    const below = f.tileAt(tx, ty + 1);
    if (below !== Tile.Solid && below !== Tile.Platform) return false;
    const hTiles = Math.ceil(this.def.h / TILE);
    for (let i = 0; i < hTiles; i++) {
      const t = f.tileAt(tx, ty - i);
      if (t === Tile.Solid || t === Tile.Spikes) return false;
    }
    return true;
  }

  override destroy(fromScene?: boolean): void {
    this.eliteGlow?.destroy();
    this.hpBar?.destroy();
    super.destroy(fromScene);
  }
}

export function eliteColor(a: EliteAffix): number {
  switch (a) {
    case 'swift':
      return 0x6affd0;
    case 'armored':
      return 0xb0c4de;
    case 'vampiric':
      return 0xff3050;
    case 'explosive':
      return 0xff9a2a;
    case 'frenzied':
      return 0xd06aff;
  }
}
