/**
 * Player controller: tight platformer movement (coyote time, jump buffering,
 * variable jump, double jump, wall slide/jump, ladders, drop-through
 * platforms, dodge roll with i-frames) plus health/damage handling.
 * Weapons & skills are driven by PlayerCombat.
 */
import Phaser from 'phaser';
import { PLAYER_ANIMS, PLAYER_TEX, FX } from '../art/keys';
import { audio } from '../core/audio';
import { input } from '../core/input/InputManager';
import { MAX_FALL, TILE } from '../config';
import { Tile } from '../data/types';
import { PlayerCombat } from '../combat/PlayerCombat';
import { bus } from '../core/events';
import type { World } from './World';

export const PLAYER_BODY = { w: 10, h: 20 };

const RUN_SPEED = 140;
const GROUND_ACCEL = 1600;
const AIR_ACCEL = 1000;
const GROUND_FRICTION = 1800;
const JUMP_V = 330;
const DOUBLE_JUMP_V = 300;
const JUMP_CUT = 0.45;
const COYOTE_MS = 90;
const BUFFER_MS = 120;
const WALL_SLIDE_MAX = 70;
const WALL_JUMP_VX = 170;
const WALL_JUMP_VY = 300;
const WALL_JUMP_LOCK_MS = 140;
const ROLL_SPEED = 230;
const ROLL_MS = 300;
const ROLL_IFRAMES_MS = 300;
const ROLL_COOLDOWN_MS = 520;
const CLIMB_SPEED = 90;
const HURT_IFRAMES_MS = 700;
const HURT_STUN_MS = 160;
const DROP_THROUGH_MS = 260;

export type PlayerState = 'normal' | 'roll' | 'climb' | 'dead';

export class Player extends Phaser.Physics.Arcade.Sprite {
  declare body: Phaser.Physics.Arcade.Body;
  state2: PlayerState = 'normal';
  facing: 1 | -1 = 1;
  combat!: PlayerCombat;

  private lastGroundedAt = -9999;
  private jumpBufferedAt = -9999;
  private jumpsLeft = 1;
  private jumpHeld = false;
  private wallJumpLockUntil = 0;
  private rollUntil = 0;
  private rollReadyAt = 0;
  private iframesUntil = 0;
  private stunUntil = 0;
  dropThroughUntil = 0;
  private wasGrounded = false;
  private fallPeak = 0;
  private stepTimer = 0;
  private spikeCooldownUntil = 0;
  /** Fraction (0..1) of movement speed allowed right now (attacks slow you). */
  moveScale = 1;
  /** External speed buff multiplier (skills). */
  speedBuff = 1;
  /** Combat can lock the animation (attack/shoot/cast poses). */
  animLockUntil = 0;
  /** Set when the player stands on a one-way platform tile. */
  onPlatform = false;

  constructor(private world: World, x: number, y: number) {
    super(world.stage, x, y, PLAYER_TEX, 0);
    world.stage.add.existing(this);
    world.stage.physics.add.existing(this);
    this.setOrigin(0.5, 1);
    this.setDepth(500);
    this.body.setSize(PLAYER_BODY.w, PLAYER_BODY.h);
    this.body.setOffset((this.width - PLAYER_BODY.w) / 2, this.height - PLAYER_BODY.h);
    this.body.setMaxVelocityY(MAX_FALL);
    this.body.setCollideWorldBounds(true);
    this.combat = new PlayerCombat(world, this);
    this.play(PLAYER_ANIMS.idle);
  }

  get run() {
    return this.world.run;
  }

  get grounded(): boolean {
    return this.body.blocked.down || this.body.touching.down;
  }

  get invulnerable(): boolean {
    return this.world.now < this.iframesUntil || this.state2 === 'dead';
  }

  get rolling(): boolean {
    return this.state2 === 'roll';
  }

  get centerX(): number {
    return this.body.center.x;
  }

  get centerY(): number {
    return this.body.center.y;
  }

  get stunned(): boolean {
    return this.world.now < this.stunUntil;
  }

  grantIframes(ms: number): void {
    this.iframesUntil = Math.max(this.iframesUntil, this.world.now + ms);
  }

  /** Called every frame by GameScene (skipped during hit-stop). */
  tick(dt: number): void {
    if (this.state2 === 'dead') return;
    const now = this.world.now;
    const stats = this.run.stats;
    const grounded = this.grounded;

    if (grounded) {
      this.lastGroundedAt = now;
      this.jumpsLeft = stats.extraJumps;
      if (!this.wasGrounded) this.onLand();
      this.fallPeak = this.body.y;
    } else if (this.body.velocity.y < 0 || this.body.y < this.fallPeak) {
      this.fallPeak = Math.min(this.fallPeak, this.body.y);
    }
    this.wasGrounded = grounded;

    if (input.pressed('jump')) this.jumpBufferedAt = now;
    this.jumpHeld = input.down('jump');

    switch (this.state2) {
      case 'roll':
        this.updateRoll(now);
        break;
      case 'climb':
        this.updateClimb(now);
        break;
      default:
        this.updateNormal(now, dt, grounded);
    }

    this.checkHazards(now);
    this.combat.update(dt);
    this.updateAnimation(now, grounded);

    // Flicker while invulnerable after being hurt (not during rolls).
    if (now < this.iframesUntil && this.state2 !== 'roll') {
      this.setAlpha(Math.floor(now / 60) % 2 ? 0.35 : 1);
    } else {
      this.setAlpha(1);
    }
  }

  private updateNormal(now: number, dt: number, grounded: boolean): void {
    const body = this.body;
    const stats = this.run.stats;
    const stunned = this.stunned;
    const mx = stunned ? 0 : input.moveX;
    const speed = RUN_SPEED * (1 + stats.moveSpeedPct) * this.speedBuff * this.moveScale;

    // Horizontal movement with acceleration.
    if (now >= this.wallJumpLockUntil) {
      const target = mx * speed;
      const accel = grounded ? (mx === 0 ? GROUND_FRICTION : GROUND_ACCEL) : AIR_ACCEL;
      body.velocity.x = approach(body.velocity.x, target, accel * dt);
      if (mx !== 0 && !this.combat.lockFacing) this.facing = mx > 0 ? 1 : -1;
    }

    // Ladder grab.
    if (!stunned && (input.down('up') || (input.down('down') && !grounded)) && this.overlapsLadder()) {
      this.enterClimb();
      return;
    }
    // Climb down onto a ladder below while standing on top of it.
    if (!stunned && grounded && input.down('down') && this.ladderBelow()) {
      this.body.y += 4;
      this.enterClimb();
      return;
    }

    // Wall slide.
    const touchingWall = (body.blocked.left && mx < 0) || (body.blocked.right && mx > 0);
    const wallSliding = !grounded && touchingWall && body.velocity.y > 0;
    if (wallSliding) {
      body.velocity.y = Math.min(body.velocity.y, WALL_SLIDE_MAX);
      if (Math.random() < 0.2) this.world.juice.burst(this.x + (body.blocked.left ? -5 : 5), this.y - 12, { count: 1, tint: 0x9a8f86, speed: [5, 20], life: [150, 300], gravity: 50 });
    }

    // Jumping.
    const buffered = now - this.jumpBufferedAt <= BUFFER_MS;
    if (buffered && !stunned) {
      if (input.down('down') && grounded && this.onPlatform) {
        // Drop through one-way platform.
        this.dropThroughUntil = now + DROP_THROUGH_MS;
        this.jumpBufferedAt = -9999;
        body.velocity.y = 40;
      } else if (grounded || now - this.lastGroundedAt <= COYOTE_MS) {
        this.doJump(JUMP_V, false);
      } else if (wallSliding || ((body.blocked.left || body.blocked.right) && !grounded)) {
        const away = body.blocked.left ? 1 : -1;
        body.velocity.x = away * WALL_JUMP_VX;
        this.facing = away as 1 | -1;
        this.wallJumpLockUntil = now + WALL_JUMP_LOCK_MS;
        this.doJump(WALL_JUMP_VY, false);
      } else if (this.jumpsLeft > 0) {
        this.jumpsLeft--;
        this.doJump(DOUBLE_JUMP_V, true);
      }
    }

    // Variable jump height.
    if (!this.jumpHeld && body.velocity.y < -80 && !this.combat.airborneLocked) {
      body.velocity.y *= JUMP_CUT ** (dt * 60 * 0.25);
    }

    // Dodge roll.
    if (!stunned && input.pressed('dodge') && now >= this.rollReadyAt) {
      this.startRoll(now);
    }

    // Footsteps.
    if (grounded && Math.abs(body.velocity.x) > 40) {
      this.stepTimer -= dt;
      if (this.stepTimer <= 0) {
        this.stepTimer = 0.28;
        audio.sfx('step', { volume: 0.25 });
      }
    }
  }

  private doJump(v: number, double: boolean): void {
    this.body.velocity.y = -v;
    this.jumpBufferedAt = -9999;
    this.lastGroundedAt = -9999;
    audio.sfx(double ? 'doubleJump' : 'jump', { volume: 0.5 });
    if (double) {
      this.world.juice.ring(this.x, this.y - 2, 10, 0xffc27a, 200);
      this.world.juice.burst(this.x, this.y, { count: 6, tint: 0xffd9a0, speed: [20, 60], angle: [60, 120], gravity: 100, life: [150, 300] });
    } else {
      this.world.juice.fx(this.x, this.y, 'fx-dust', { depth: 499 });
    }
  }

  private startRoll(now: number): void {
    const stats = this.run.stats;
    this.combat.cancel();
    this.state2 = 'roll';
    const dir = input.moveX !== 0 ? (input.moveX > 0 ? 1 : -1) : this.facing;
    this.facing = dir;
    this.rollUntil = now + ROLL_MS;
    this.rollReadyAt = now + ROLL_COOLDOWN_MS * (1 - stats.dodgeCooldownPct);
    this.grantIframes(ROLL_IFRAMES_MS);
    this.body.velocity.x = dir * ROLL_SPEED;
    audio.sfx('dodge', { volume: 0.6 });
    this.world.juice.fx(this.x - dir * 6, this.y, 'fx-dust', { flipX: dir < 0, depth: 499 });
    this.combat.onDodge();
  }

  private updateRoll(now: number): void {
    this.body.velocity.x = this.facing * ROLL_SPEED;
    if (Math.random() < 0.3) this.world.juice.burst(this.x, this.y - 2, { count: 1, tint: 0x6b5f73, speed: [5, 25], gravity: -20, life: [150, 300] });
    if (now >= this.rollUntil) {
      this.state2 = 'normal';
      this.body.velocity.x *= 0.5;
    }
    // Allow jumping out of a roll.
    if (now - this.jumpBufferedAt <= BUFFER_MS && (this.grounded || now - this.lastGroundedAt <= COYOTE_MS)) {
      this.state2 = 'normal';
      this.doJump(JUMP_V, false);
    }
  }

  private enterClimb(): void {
    this.state2 = 'climb';
    this.combat.cancel();
    this.body.setAllowGravity(false);
    this.body.velocity.set(0, 0);
    // Snap to ladder column center.
    const tx = Math.floor(this.body.center.x / TILE);
    this.x = tx * TILE + TILE / 2;
    this.jumpsLeft = this.run.stats.extraJumps;
  }

  private exitClimb(): void {
    this.state2 = 'normal';
    this.body.setAllowGravity(true);
  }

  private updateClimb(now: number): void {
    const my = input.down('up') ? -1 : input.down('down') ? 1 : input.moveY;
    this.body.velocity.y = my * CLIMB_SPEED;
    this.body.velocity.x = 0;
    if (now - this.jumpBufferedAt <= BUFFER_MS) {
      this.exitClimb();
      const mx = input.moveX;
      this.body.velocity.x = mx * RUN_SPEED;
      this.doJump(JUMP_V * 0.85, false);
      return;
    }
    // Reached the top of the ladder: stand on its top rung instead of popping
    // off and falling back down (ladders often poke up through floor holes).
    const b = this.body;
    const cx = b.center.x;
    const ladderBelowFeet = this.tileUnder(cx, b.bottom + 2) === Tile.Ladder;
    if (my <= 0 && ladderBelowFeet && this.tileUnder(cx, b.bottom - 3) !== Tile.Ladder) {
      const topY = Math.floor((b.bottom + 2) / TILE) * TILE;
      b.y = topY - b.height;
      b.velocity.y = 0;
      // Step off sideways onto the adjacent floor (feet are level with it).
      if (Math.abs(input.moveX) > 0.5) {
        this.exitClimb();
        this.body.velocity.x = input.moveX * RUN_SPEED;
      }
      return;
    }
    if (!this.overlapsLadder()) {
      this.exitClimb();
      return;
    }
    if (this.grounded && my > 0) this.exitClimb();
    if (Math.abs(input.moveX) > 0.5 && my === 0) this.exitClimb();
  }

  private tileUnder(wx: number, wy: number): number {
    return this.world.floor.tileAt(Math.floor(wx / TILE), Math.floor(wy / TILE));
  }

  overlapsLadder(): boolean {
    const b = this.body;
    const cx = b.center.x;
    return this.tileUnder(cx, b.top + 4) === Tile.Ladder || this.tileUnder(cx, b.bottom - 2) === Tile.Ladder;
  }

  private ladderBelow(): boolean {
    return this.tileUnder(this.body.center.x, this.body.bottom + 4) === Tile.Ladder;
  }

  private checkHazards(now: number): void {
    const b = this.body;
    const l = this.tileUnder(b.left + 2, b.bottom - 3);
    const r = this.tileUnder(b.right - 2, b.bottom - 3);
    this.onPlatform =
      this.grounded &&
      (this.tileUnder(b.left + 1, b.bottom + 2) === Tile.Platform || this.tileUnder(b.right - 1, b.bottom + 2) === Tile.Platform) &&
      this.tileUnder(b.left + 1, b.bottom + 2) !== Tile.Solid &&
      this.tileUnder(b.right - 1, b.bottom + 2) !== Tile.Solid;
    if ((l === Tile.Spikes || r === Tile.Spikes) && now >= this.spikeCooldownUntil) {
      this.spikeCooldownUntil = now + 600;
      const dmg = 10 * this.world.difficulty.dmgMult;
      audio.sfx('spikes');
      this.world.damagePlayer(dmg, null, 'Spikes', { unblockable: true });
      if ((this.state2 as PlayerState) !== 'dead') {
        this.body.velocity.y = -260;
        this.lastGroundedAt = -9999;
      }
    }
  }

  private onLand(): void {
    const fall = this.body.y - this.fallPeak;
    if (fall > TILE * 4) {
      this.world.juice.fx(this.x, this.y, 'fx-dust', { depth: 499 });
      this.world.juice.fx(this.x, this.y, 'fx-dust', { depth: 499, flipX: true });
      audio.sfx('land', { volume: Math.min(1, fall / (TILE * 10)) });
      if (fall > TILE * 9) this.world.juice.shake(0.003, 90);
    }
  }

  private updateAnimation(now: number, grounded: boolean): void {
    this.setFlipX(this.facing < 0);
    if (now < this.animLockUntil) return;
    const b = this.body;
    let anim: string;
    if (this.state2 === 'roll') anim = PLAYER_ANIMS.roll;
    else if (this.state2 === 'climb') {
      anim = PLAYER_ANIMS.climb;
      if (b.velocity.y === 0) this.anims.pause();
      else if (this.anims.isPaused) this.anims.resume();
    } else if (this.stunned) anim = PLAYER_ANIMS.hurt;
    else if (this.combat.blocking) anim = PLAYER_ANIMS.block;
    else if (!grounded) {
      const wall = (b.blocked.left || b.blocked.right) && b.velocity.y > 0 && input.moveX !== 0;
      anim = wall ? PLAYER_ANIMS.wallslide : b.velocity.y < 0 ? PLAYER_ANIMS.jump : PLAYER_ANIMS.fall;
    } else if (Math.abs(b.velocity.x) > 20) anim = PLAYER_ANIMS.run;
    else anim = PLAYER_ANIMS.idle;
    if (this.anims.currentAnim?.key !== anim) this.play(anim, true);
  }

  /** Play a combat pose and keep it for `ms`. */
  pose(anim: string, ms: number): void {
    if (!this.scene.anims.exists(anim)) return;
    this.play(anim, true);
    this.animLockUntil = this.world.now + ms;
  }

  /**
   * Apply damage that already passed through World.damagePlayer.
   * Returns true if damage was taken.
   */
  receiveDamage(amount: number, from: { x: number; y: number } | null, kb = 160): boolean {
    if (this.invulnerable) return false;
    const now = this.world.now;
    this.run.damage(amount);
    this.grantIframes(HURT_IFRAMES_MS);
    this.stunUntil = now + HURT_STUN_MS;
    this.combat.cancel();
    if (this.state2 === 'climb') this.exitClimb();
    const dir = from ? (this.x < from.x ? -1 : 1) : -this.facing;
    this.body.velocity.x = dir * kb;
    this.body.velocity.y = Math.min(this.body.velocity.y, -140);
    this.world.juice.hitFlash(this, 90, 0xff4040);
    this.world.juice.shake(0.006, 140);
    this.world.juice.hitstop(50);
    this.world.juice.burst(this.centerX, this.centerY, { count: 8, tint: [0xd63a3a, 0x8a1c1c], speed: [40, 120] });
    audio.sfx('playerHurt');
    bus.emit('player:hp', { hp: this.run.hp, max: this.run.stats.maxHp });
    return true;
  }

  die(): void {
    if (this.state2 === 'dead') return;
    this.state2 = 'dead';
    this.combat.cancel();
    this.body.setVelocity(0, -120);
    this.body.setAccelerationX(0);
    this.play(PLAYER_ANIMS.death, true);
    this.animLockUntil = Infinity;
    audio.sfx('playerDie');
    this.world.juice.burst(this.centerX, this.centerY, { count: 24, tint: [0xffb347, 0xff5a36, 0x3a2a40], speed: [40, 200], life: [300, 900], key: FX.particle });
  }

  revive(hp: number): void {
    this.state2 = 'normal';
    this.animLockUntil = 0;
    this.run.hp = hp;
    this.grantIframes(2000);
    this.world.juice.ring(this.centerX, this.centerY, 60, 0xffc04a, 500);
    this.world.juice.flash(200, 255, 200, 120);
    bus.emit('player:hp', { hp: this.run.hp, max: this.run.stats.maxHp });
  }
}

function approach(v: number, target: number, step: number): number {
  if (v < target) return Math.min(v + step, target);
  if (v > target) return Math.max(v - step, target);
  return v;
}
