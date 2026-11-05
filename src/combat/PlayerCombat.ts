/**
 * Drives the player's two weapon slots and two skill slots.
 * attack1 -> weapon slot 0, attack2 -> weapon slot 1, skill1/2 -> skill slots.
 */
import Phaser from 'phaser';
import { PLAYER_ANIMS, slashTex } from '../art/keys';
import { audio } from '../core/audio';
import { bus } from '../core/events';
import { input } from '../core/input/InputManager';
import type { Action } from '../core/input/types';
import { RELICS, SKILLS, WEAPONS, AFFIXES } from '../data';
import type { ItemInstance, MeleeStep, OnHitStatus, RelicHook, SkillDef, WeaponDef } from '../data/types';
import { computeHit } from './damage';
import { castSkill } from './skills';
import type { Enemy } from '../entities/Enemy';
import type { Player } from '../entities/Player';
import type { PlayerHit, World } from '../entities/World';
import { TRACK_COLORS } from '../art/palette';

export interface AimInfo {
  x: number;
  y: number;
  /** true when coming from the mouse cursor. */
  manual: boolean;
}

const AUTO_AIM_RANGE = 220;

export class PlayerCombat {
  weapons: (WeaponController | null)[] = [null, null];
  skills: (SkillController | null)[] = [null, null];
  /** While true, movement input doesn't change facing (mid-swing). */
  lockFacing = false;
  /** While true, variable-jump cutting is disabled (e.g. launched by an attack). */
  airborneLocked = false;
  blocking = false;
  private equippedKey = '';

  constructor(readonly world: World, readonly player: Player) {}

  /** Rebuild controllers if the run's equipment changed. */
  sync(): void {
    const run = this.world.run;
    const key = [...run.weapons, ...run.skills].map((i) => i?.uid ?? '-').join('|');
    if (key === this.equippedKey) return;
    this.equippedKey = key;
    this.weapons = run.weapons.map((it, i) => (it ? new WeaponController(this, it, i) : null));
    this.skills = run.skills.map((it, i) => {
      const prev = this.skills[i];
      if (it && prev && prev.item.uid === it.uid) return prev;
      return it ? new SkillController(this, it, i) : null;
    });
  }

  get busy(): boolean {
    return this.weapons.some((w) => w?.busy);
  }

  update(dt: number): void {
    this.sync();
    const p = this.player;
    const canAct = p.state2 === 'normal' && !p.stunned;
    this.lockFacing = false;
    this.blocking = false;
    p.moveScale = 1;
    const actions: Action[] = ['attack1', 'attack2'];
    this.weapons.forEach((w, i) => {
      if (!w) return;
      w.update(dt, canAct, actions[i]);
    });
    const skillActions: Action[] = ['skill1', 'skill2'];
    this.skills.forEach((s, i) => {
      if (!s) return;
      s.update(dt, canAct && input.pressed(skillActions[i]));
    });
  }

  cancel(): void {
    this.weapons.forEach((w) => w?.cancel());
  }

  onDodge(): void {
    relicHooks(this.world, 'dodge-nova').forEach((params) => {
      const r = params.radius ?? 40;
      this.world.juice.ring(this.player.centerX, this.player.centerY, r, 0x9a7cff, 240);
      this.world.hitEnemiesInRect(
        new Phaser.Geom.Rectangle(this.player.centerX - r, this.player.centerY - r, r * 2, r * 2),
        () => ({ amount: (params.damage ?? 10) * levelMult(this.world.difficulty.itemLevel), crit: false, kbX: 0, kbY: -60, source: 'Shadow Cloak' }),
      );
    });
  }

  /** Current aim direction (mouse, or facing with soft auto-aim). */
  aim(autoAim = true): AimInfo {
    const p = this.player;
    if (input.aim) return { x: input.aim.x, y: input.aim.y, manual: true };
    if (autoAim) {
      const target = this.world.nearestEnemy(p.centerX + p.facing * 40, p.centerY, AUTO_AIM_RANGE, true);
      if (target && Math.sign(target.body.center.x - p.centerX) === p.facing) {
        const dx = target.body.center.x - p.centerX;
        const dy = target.body.center.y - p.centerY;
        const len = Math.hypot(dx, dy) || 1;
        return { x: dx / len, y: dy / len, manual: false };
      }
    }
    return { x: p.facing, y: 0, manual: false };
  }

  /** All on-hit statuses for a hit made with `item`. */
  statusesFor(item: ItemInstance, base?: OnHitStatus): OnHitStatus[] {
    const out: OnHitStatus[] = [];
    const bonus = this.world.run.stats.statusChance;
    if (base) out.push({ ...base, chance: base.chance + bonus });
    for (const a of item.affixes) {
      const def = AFFIXES[a.id];
      if (def?.status) out.push({ status: def.status, chance: a.value + bonus });
    }
    for (const r of this.world.run.relics) {
      const def = RELICS[r.defId];
      if (def?.onHit) out.push({ ...def.onHit, chance: def.onHit.chance + bonus });
    }
    return out;
  }

  /** Build a PlayerHit vs a specific enemy. */
  makeHit(
    target: Enemy,
    opts: {
      item: ItemInstance;
      def: { baseDamage: number; track: WeaponDef['track']; critChance?: number };
      mult: number;
      kb: number;
      kbY?: number;
      dirX: number;
      onHit?: OnHitStatus;
      forceCrit?: boolean;
      hitstopMs?: number;
      source: string;
      special?: WeaponDef['special'];
    },
  ): PlayerHit {
    const run = this.world.run;
    let forceCrit = opts.forceCrit ?? false;
    switch (opts.special) {
      case 'crit-vs-burning':
        forceCrit ||= target.hasStatus('burn');
        break;
      case 'crit-vs-frozen':
        forceCrit ||= target.hasStatus('freeze');
        break;
      case 'crit-from-behind':
        forceCrit ||= target.facing === Math.sign(opts.dirX);
        break;
    }
    const res = computeHit({
      baseDamage: opts.def.baseDamage,
      mult: opts.mult,
      item: opts.item,
      track: opts.def.track,
      stats: run.stats,
      scrolls: run.scrolls,
      rng: this.world.rng,
      forceCrit,
      extraCritChance: opts.def.critChance ?? 0,
      playerHpFrac: run.hp / run.stats.maxHp,
    });
    const statuses = this.statusesFor(opts.item, opts.onHit);
    const rolled = statuses.find((s) => this.world.rng.chance(s.chance));
    return {
      amount: res.amount,
      crit: res.crit,
      kbX: Math.sign(opts.dirX || 1) * opts.kb,
      kbY: opts.kbY ?? -40,
      status: rolled,
      color: TRACK_COLORS[opts.def.track],
      hitstopMs: opts.hitstopMs,
      source: opts.source,
    };
  }
}

// ---------------------------------------------------------------------------

type MeleePhase = 'idle' | 'windup' | 'active' | 'recover';

export class WeaponController {
  readonly def: WeaponDef;
  private phase: MeleePhase = 'idle';
  private phaseEnd = 0;
  private step = 0;
  private comboUntil = 0;
  private queued = false;
  private hitSet = new Set<Enemy>();
  private cooldownUntil = 0;
  private chargeStart = -1;
  private blockStart = -1;
  private stepDir: 1 | -1 = 1;

  constructor(private c: PlayerCombat, readonly item: ItemInstance, readonly slot: number) {
    this.def = WEAPONS[item.defId];
  }

  get busy(): boolean {
    return this.phase !== 'idle' || this.chargeStart >= 0;
  }

  get world() {
    return this.c.world;
  }

  cancel(): void {
    this.phase = 'idle';
    this.queued = false;
    this.chargeStart = -1;
    this.blockStart = -1;
  }

  update(dt: number, canAct: boolean, action: Action): void {
    switch (this.def.kind) {
      case 'melee':
        return this.updateMelee(canAct, action);
      case 'ranged':
        return this.updateRanged(canAct, action);
      case 'shield':
        return this.updateShield(dt, canAct, action);
    }
  }

  // ---- melee --------------------------------------------------------------

  private get combo(): MeleeStep[] {
    return this.def.melee?.combo ?? [];
  }

  private updateMelee(canAct: boolean, action: Action, stepsOverride?: MeleeStep[]): void {
    const now = this.world.now;
    const p = this.c.player;
    const combo = stepsOverride ?? this.combo;
    if (!canAct) {
      if (this.phase !== 'idle') this.cancel();
      return;
    }
    if (input.pressed(action)) {
      if (this.phase === 'idle' && !this.c.busy) {
        if (now > this.comboUntil) this.step = 0;
        this.begin(combo);
      } else if (this.phase !== 'idle') this.queued = true;
    }
    if (this.phase === 'idle') return;

    const st = combo[this.step];
    this.c.lockFacing = true;
    if (p.grounded) p.moveScale = this.phase === 'active' ? 0.15 : 0.35;
    if (now >= this.phaseEnd) {
      if (this.phase === 'windup') {
        this.phase = 'active';
        this.phaseEnd = now + st.activeMs;
        this.hitSet.clear();
        this.onActive(st);
      } else if (this.phase === 'active') {
        this.phase = 'recover';
        this.phaseEnd = now + st.recoverMs;
      } else {
        const last = this.step >= combo.length - 1;
        this.comboUntil = now + (this.def.melee?.comboWindowMs ?? 300);
        this.step = last ? 0 : this.step + 1;
        this.phase = 'idle';
        if (this.queued) {
          this.queued = false;
          if (last) this.comboUntil = 0;
          this.begin(combo);
        }
      }
    }
    if (this.phase === 'active') this.doHits(st, combo);
  }

  private begin(combo: MeleeStep[]): void {
    const p = this.c.player;
    const st = combo[this.step];
    if (!st) return;
    const aim = input.aim;
    if (aim && Math.abs(aim.x) > 0.2) p.facing = aim.x > 0 ? 1 : -1;
    this.stepDir = p.facing;
    this.phase = 'windup';
    this.phaseEnd = this.world.now + st.windupMs;
    this.queued = false;
    const anim = st.fx === 'stab' ? PLAYER_ANIMS.stab : this.step % 2 === 0 ? PLAYER_ANIMS.attackA : PLAYER_ANIMS.attackB;
    p.pose(anim, st.windupMs + st.activeMs + st.recoverMs * 0.6);
  }

  private onActive(st: MeleeStep): void {
    const p = this.c.player;
    if (st.lunge) p.body.velocity.x = this.stepDir * st.lunge;
    audio.sfx(st.fx === 'smash' ? 'swingHeavy' : st.fx === 'stab' ? 'stab' : 'swing', { volume: 0.7 });
    const fxKey = slashTex(st.fx);
    const reach = st.reach;
    const ox = st.fx === 'spin' ? 0 : this.stepDir * reach * 0.5;
    const s = this.world.juice.fx(p.centerX + ox, p.centerY + (st.offsetY ?? 0), fxKey, {
      flipX: this.stepDir < 0,
      depth: 520,
      tint: weaponTint(this.def),
      add: true,
      scale: Math.max(0.6, Math.min(1.6, (reach + 8) / 40)),
    });
    if (s) s.setAlpha(0.9);
  }

  private doHits(st: MeleeStep, combo: MeleeStep[]): void {
    const p = this.c.player;
    const h = st.height;
    const y = p.centerY + (st.offsetY ?? 0) - h / 2;
    const rect =
      st.fx === 'spin'
        ? new Phaser.Geom.Rectangle(p.centerX - st.reach, y, st.reach * 2, h)
        : new Phaser.Geom.Rectangle(this.stepDir > 0 ? p.centerX - 4 : p.centerX - st.reach, y, st.reach + 4, h);
    const isLast = this.step === combo.length - 1;
    const hits = this.world.hitEnemiesInRect(
      rect,
      (e) =>
        this.c.makeHit(e, {
          item: this.item,
          def: this.def,
          mult: st.dmg,
          kb: st.knockback,
          dirX: st.fx === 'spin' ? e.body.center.x - p.centerX : this.stepDir,
          onHit: this.def.onHit,
          forceCrit: this.def.special === 'crit-final-hit' && isLast,
          hitstopMs: st.hitstopMs ?? 40,
          source: this.def.name,
          special: this.def.special,
        }),
      this.hitSet,
    );
    if (hits.length && this.def.special === 'lifesteal-on-bleed') {
      const bleeding = hits.filter((e) => e.hasStatus('bleed')).length;
      if (bleeding) this.world.run.heal(bleeding * 2 + this.world.run.stats.maxHp * 0.01 * bleeding);
    }
  }

  // ---- ranged -------------------------------------------------------------

  private updateRanged(canAct: boolean, action: Action): void {
    const spec = this.def.ranged!;
    const now = this.world.now;
    const p = this.c.player;
    if (!canAct) {
      this.chargeStart = -1;
      return;
    }
    if (spec.chargeMs) {
      if (input.down(action) && now >= this.cooldownUntil && !this.c.weapons.some((w) => w !== this && w?.busy)) {
        if (this.chargeStart < 0) this.chargeStart = now;
        p.moveScale = 0.5;
        this.c.lockFacing = true;
        const aim = this.c.aim();
        if (Math.abs(aim.x) > 0.1) p.facing = aim.x > 0 ? 1 : -1;
        p.pose(PLAYER_ANIMS.shoot, 80);
        if (now - this.chargeStart >= spec.chargeMs && Math.floor(now / 80) % 2 === 0) {
          this.world.juice.burst(p.centerX + p.facing * 8, p.centerY - 2, { count: 1, tint: 0xfff0a0, speed: [5, 20], gravity: 0, life: [100, 200] });
        }
      } else if (this.chargeStart >= 0) {
        const charged = now - this.chargeStart >= spec.chargeMs;
        this.chargeStart = -1;
        this.fire(charged ? 2 : 1, charged);
      }
      return;
    }
    if (input.down(action) && now >= this.cooldownUntil && !this.c.weapons.some((w) => w !== this && w?.busy)) {
      this.fire(1, false);
    }
  }

  private fire(mult: number, charged: boolean): void {
    const spec = this.def.ranged!;
    const p = this.c.player;
    const now = this.world.now;
    this.cooldownUntil = now + spec.cooldownMs;
    const aim = this.c.aim();
    if (Math.abs(aim.x) > 0.1) p.facing = aim.x > 0 ? 1 : -1;
    p.pose(PLAYER_ANIMS.shoot, 180);
    const count = spec.count ?? 1;
    const spread = ((spec.spreadDeg ?? 0) * Math.PI) / 180;
    const baseAngle = Math.atan2(aim.y, aim.x);
    const sfx = spec.projectile === 'arrow' ? 'bow' : spec.projectile === 'bolt' ? 'crossbow' : spec.projectile === 'knife' ? 'throw' : spec.projectile === 'spark' ? 'zap' : 'magic';
    audio.sfx(sfx, { volume: 0.6, pitch: charged ? 0.8 : 1 });
    for (let i = 0; i < count; i++) {
      const a = count > 1 ? baseAngle - spread / 2 + (spread * i) / (count - 1) : baseAngle;
      this.world.projectiles.fire({
        owner: 'player',
        key: spec.projectile,
        x: p.centerX + Math.cos(a) * 8,
        y: p.centerY - 2 + Math.sin(a) * 4,
        vx: Math.cos(a) * spec.speed * (charged ? 1.3 : 1),
        vy: Math.sin(a) * spec.speed * (charged ? 1.3 : 1),
        gravity: spec.gravity ?? 0,
        lifeMs: spec.lifeMs ?? 1200,
        pierce: (spec.pierce ?? 0) + (charged ? 1 : 0),
        chain: this.def.special === 'chain-lightning' ? 2 : 0,
        makeHit: (e) =>
          this.c.makeHit(e, {
            item: this.item,
            def: this.def,
            mult: spec.dmg * mult,
            kb: charged ? 200 : 90,
            dirX: Math.cos(a),
            onHit: this.def.onHit,
            hitstopMs: charged ? 40 : 0,
            source: this.def.name,
            special: this.def.special,
          }),
        explodeRadius: spec.projectile === 'fireball' ? 22 : 0,
      });
    }
  }

  // ---- shield -------------------------------------------------------------

  private updateShield(_dt: number, canAct: boolean, action: Action): void {
    const spec = this.def.shield!;
    const now = this.world.now;
    const p = this.c.player;
    if (!canAct) {
      this.blockStart = -1;
      if (this.phase !== 'idle') this.cancel();
      return;
    }
    // Shield bash uses the melee state machine with a single step.
    if (this.phase !== 'idle') {
      this.updateMelee(true, action, [spec.bash]);
      return;
    }
    if (input.down(action) && !this.c.weapons.some((w) => w !== this && w?.busy)) {
      if (this.blockStart < 0) {
        this.blockStart = now;
        audio.sfx('block', { volume: 0.3, pitch: 1.4 });
      }
      this.c.blocking = true;
      this.c.lockFacing = true;
      p.moveScale = 0.35;
    } else if (this.blockStart >= 0) {
      const held = now - this.blockStart;
      this.blockStart = -1;
      if (held < 180) {
        this.step = 0;
        this.updateMelee(true, action, [spec.bash]);
        // Force-start the bash (the press edge already happened).
        this.forceBegin([spec.bash]);
      }
    }
  }

  private forceBegin(steps: MeleeStep[]): void {
    if (this.phase === 'idle') {
      this.step = 0;
      this.begin(steps);
    }
  }

  /**
   * Called by World.damagePlayer when this shield is raised.
   * Returns the damage multiplier to apply (0 = fully parried).
   */
  blockIncoming(from: { x: number; y: number } | null): { mult: number; parried: boolean } | null {
    if (this.def.kind !== 'shield' || this.blockStart < 0 || !from) return null;
    const p = this.c.player;
    const frontal = Math.sign(from.x - p.centerX) === p.facing || Math.abs(from.x - p.centerX) < 4;
    if (!frontal) return null;
    const spec = this.def.shield!;
    const now = this.world.now;
    if (now - this.blockStart <= spec.parryWindowMs) {
      audio.sfx('parry');
      this.world.juice.flash(60, 255, 240, 200);
      this.world.juice.hitstop(90);
      this.world.juice.ring(p.centerX + p.facing * 8, p.centerY, 26, 0xfff2b0, 220);
      // Riposte: damage everything in front.
      const r = new Phaser.Geom.Rectangle(p.facing > 0 ? p.centerX : p.centerX - 48, p.centerY - 20, 48, 40);
      this.world.hitEnemiesInRect(r, (e) =>
        this.c.makeHit(e, { item: this.item, def: this.def, mult: spec.parryDmg, kb: 240, dirX: p.facing, forceCrit: true, hitstopMs: 60, source: this.def.name, onHit: { status: 'stun', chance: 1, durationMs: 1200 } }),
      );
      return { mult: 0, parried: true };
    }
    audio.sfx('block');
    this.world.juice.burst(p.centerX + p.facing * 8, p.centerY, { count: 5, tint: 0xd0d0d0, speed: [40, 100] });
    return { mult: 1 - spec.block, parried: false };
  }
}

function weaponTint(def: WeaponDef): number {
  switch (def.onHit?.status) {
    case 'burn':
      return 0xff8a3a;
    case 'freeze':
      return 0x9be7ff;
    case 'bleed':
      return 0xff4a5a;
    case 'poison':
      return 0x9cff6a;
    default:
      return 0xfff4e0;
  }
}

// ---------------------------------------------------------------------------

export class SkillController {
  readonly def: SkillDef;
  readyAt = 0;
  totalMs = 0;

  constructor(private c: PlayerCombat, readonly item: ItemInstance, readonly slot: number) {
    this.def = SKILLS[item.defId];
  }

  update(_dt: number, trigger: boolean): void {
    const now = this.c.world.now;
    const remaining = Math.max(0, this.readyAt - now);
    bus.emit('skill:cooldown', { slot: this.slot, remaining, total: this.totalMs });
    if (!trigger) return;
    if (remaining > 0) {
      audio.sfx('denied', { volume: 0.3 });
      return;
    }
    const ok = castSkill(this.c, this);
    if (ok === false) return;
    this.totalMs = this.def.cooldownMs * (1 - this.c.world.run.stats.skillCooldownPct);
    this.readyAt = now + this.totalMs;
    this.c.player.pose(PLAYER_ANIMS.cast, 220);
  }
}

/** hookParams of every owned relic with the given hook. */
export function relicHooks(world: World, hook: RelicHook): Record<string, number>[] {
  const out: Record<string, number>[] = [];
  for (const r of world.run.relics) {
    const def = RELICS[r.defId];
    if (def?.hook === hook) out.push(def.hookParams ?? {});
  }
  return out;
}

/** Generic scaling for flat damage numbers by item/floor level. */
export function levelMult(level: number): number {
  return 1 + 0.08 * Math.max(0, level - 1);
}
