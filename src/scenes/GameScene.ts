/**
 * One floor of the spire. Restarted for every floor; the RunState persists in
 * `session`. Implements the World interface used by every entity.
 */
import Phaser from 'phaser';
import { bgFarTex, bgMidTex, FX, OBJ, ANIMS, UI } from '../art/keys';
import { BIOME_PALETTES, RARITY_COLORS } from '../art/palette';
import { audio } from '../core/audio';
import { bus } from '../core/events';
import { input, setCursorVisible } from '../core/input/InputManager';
import { floorSeed, Rng } from '../core/rng';
import { saves } from '../core/save';
import { BIOMES, ENEMIES, BOSSES, itemDisplayName, kindOfId } from '../data';
import type { Difficulty, EliteAffix, EnemyDef, FloorLayout, ItemInstance, StatTrack } from '../data/types';
import { Tile } from '../data/types';
import { GAME_H, GAME_W, IS_DEBUG, TILE } from '../config';
import { enemyDamageToPlayer } from '../combat/damage';
import { Juice } from '../combat/juice';
import { relicHooks, levelMult } from '../combat/PlayerCombat';
import { Enemy } from '../entities/Enemy';
import { createBoss } from '../entities/bosses';
import { Altar, Chest, ExitPortal, Interactable, ItemDrop, Merchant } from '../entities/interactables/Interactable';
import { PickupSystem } from '../entities/Pickup';
import { Player } from '../entities/Player';
import { ProjectileSystem } from '../entities/Projectile';
import type { PlayerHit, World } from '../entities/World';
import { makeItem, rollEnemyCoins } from '../run/Loot';
import { RunState } from '../run/RunState';
import { session } from '../run/session';
import { buildFloor, type BuiltFloor } from '../world/FloorBuilder';
import { getDifficulty } from '../world/difficulty';
import { generateFloor } from '../world/FloorGenerator';
import { Lighting } from './game/Lighting';

const BIOME_DARKNESS: Record<string, number> = { cells: 0.62, ramparts: 0.4, library: 0.55, throne: 0.5 };
const ELITE_AFFIXES: EliteAffix[] = ['swift', 'armored', 'vampiric', 'explosive', 'frenzied'];

export class GameScene extends Phaser.Scene implements World {
  juice!: Juice;
  rng!: Rng;
  run!: RunState;
  difficulty!: Difficulty;
  layout!: FloorLayout;
  floor!: BuiltFloor;
  player!: Player;
  enemies: Enemy[] = [];
  projectiles!: ProjectileSystem;
  pickups!: PickupSystem;
  interactables: Interactable[] = [];
  lighting!: Lighting;
  boss: Enemy | null = null;
  private exitPortal: ExitPortal | null = null;
  private bgFar: Phaser.GameObjects.TileSprite | null = null;
  private bgMid: Phaser.GameObjects.TileSprite | null = null;
  private cursor: Phaser.GameObjects.Image | null = null;
  private focused: Interactable | null = null;
  private lookAhead = 0;
  private ending = false;
  private paused = false;
  /** Modal UI open (merchant, swap, altar): gameplay input suspended. */
  modalOpen = false;
  private unsubs: (() => void)[] = [];
  private firstHitShieldUsed = false;
  private roomsVisited = new Set<number>();

  constructor() {
    super('Game');
  }

  get stage(): Phaser.Scene {
    return this;
  }

  get now(): number {
    return this.time.now;
  }

  get coins(): number {
    return saves.data.coins;
  }

  get unlocked(): readonly string[] {
    return saves.data.unlocked;
  }

  create(): void {
    if (!session.run) {
      session.run = RunState.create(Date.now() >>> 0, saves.data);
      const f = IS_DEBUG ? Number(new URLSearchParams(location.search).get('floor')) : 0;
      if (f > 1) session.run.enterFloor(f);
    }
    this.run = session.run!;
    this.enemies = [];
    this.interactables = [];
    this.boss = null;
    this.exitPortal = null;
    this.focused = null;
    this.ending = false;
    this.paused = false;
    this.modalOpen = false;
    this.firstHitShieldUsed = false;
    this.roomsVisited.clear();

    const floorN = this.run.floor;
    this.rng = new Rng(floorSeed(this.run.seed, floorN) ^ 0x5eed);
    this.difficulty = getDifficulty(floorN);
    this.layout = generateFloor(floorN, floorSeed(this.run.seed, floorN));
    this.juice = new Juice(this);

    const biome = this.layout.biome;
    const pal = BIOME_PALETTES[biome];
    this.cameras.main.setBackgroundColor(pal.sky ?? 0x0b0a12);
    this.createParallax();
    this.floor = buildFloor(this, this.layout);
    this.physics.world.setBounds(0, 0, this.floor.worldW, this.floor.worldH + 200);
    this.physics.world.setBoundsCollision(true, true, true, false);

    this.projectiles = new ProjectileSystem(this);
    this.pickups = new PickupSystem(this);

    const ps = this.layout.playerStart;
    this.player = new Player(this, ps.tx * TILE + TILE / 2, (ps.ty + 1) * TILE);
    this.physics.add.collider(this.player, this.floor.layer, undefined, this.oneWayProcess(() => this.player.dropThroughUntil > this.now, () => this.player.body), this);
    this.physics.add.collider(this.pickups.group, this.floor.layer, undefined, this.oneWayProcess(() => false, null), this);

    this.lighting = new Lighting(this, BIOME_DARKNESS[biome], 0x05040a);
    this.lighting.add(() => (this.player.active ? { x: this.player.centerX, y: this.player.centerY - 2, radius: 90, intensity: 0.95 } : null));

    this.spawnFromLayout();

    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.floor.worldW, this.floor.worldH);
    cam.startFollow(this.player, true, 0.12, 0.12, 0, 20);
    cam.setDeadzone(24, 28);
    cam.setRoundPixels(true);
    cam.fadeIn(350, 0, 0, 0);

    if (this.textures.exists(UI.cursor)) this.cursor = this.add.image(0, 0, UI.cursor).setDepth(1000).setScrollFactor(0).setVisible(false);

    // UI overlays.
    input.attach(this.game);
    if (!this.scene.isActive('HUD')) this.scene.launch('HUD');
    if (this.scene.get('Touch') && !this.scene.isActive('Touch')) this.scene.launch('Touch');
    this.scene.bringToTop('HUD');
    if (this.scene.get('Touch')) this.scene.bringToTop('Touch');

    this.unsubs.push(
      bus.on('ui:open', () => {
        this.modalOpen = true;
      }),
      bus.on('ui:closed', () => {
        this.modalOpen = false;
        input.releaseAll();
      }),
    );
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());

    // Announce.
    const b = BIOMES[biome];
    bus.emit('run:floor', { floor: floorN, biome, biomeName: b?.name ?? biome, tagline: b?.tagline ?? '', isBoss: this.layout.isBoss });
    this.emitAll();
    // Overlay scenes are created on the next tick; resend state once they exist.
    this.time.delayedCall(30, () => this.emitAll());
    audio.music(this.layout.isBoss ? 'boss' : biome);

    if (IS_DEBUG) this.installDebug();
  }

  private oneWayProcess(dropping: () => boolean, _b: unknown) {
    return (obj: any, tileObj: any): boolean => {
      const tile = tileObj as Phaser.Tilemaps.Tile;
      if (!tile || tile.index < 0) return false;
      const t = this.floor.tileAt(tile.x, tile.y);
      if (t !== Tile.Platform) return true;
      if (dropping()) return false;
      const body = (obj.body ?? obj) as Phaser.Physics.Arcade.Body;
      // Only collide when falling onto the top surface.
      return body.velocity.y >= 0 && body.bottom - body.deltaY() <= tile.pixelY + 4;
    };
  }

  private createParallax(): void {
    const b = this.layout.biome;
    if (this.textures.exists(bgFarTex(b))) this.bgFar = this.add.tileSprite(0, 0, GAME_W, GAME_H, bgFarTex(b)).setOrigin(0).setScrollFactor(0).setDepth(-20);
    if (this.textures.exists(bgMidTex(b))) this.bgMid = this.add.tileSprite(0, 0, GAME_W, GAME_H, bgMidTex(b)).setOrigin(0).setScrollFactor(0).setDepth(-10);
  }

  private spawnFromLayout(): void {
    const L = this.layout;
    const d = this.difficulty;
    const pool = Object.values(ENEMIES).filter((e) => e.biomes.includes(L.biome) && e.minFloor <= Math.max(1, ((L.floor - 1) % 20) + 1 + L.floor > 20 ? 99 : 0) + L.floor);
    for (const s of L.spawns) {
      const wx = s.tx * TILE + TILE / 2;
      const wy = (s.ty + 1) * TILE;
      switch (s.kind) {
        case 'enemy':
        case 'flyer': {
          const cands = pool.filter((e) => !!e.flying === (s.kind === 'flyer'));
          const list = cands.length ? cands : pool;
          if (!list.length) break;
          const def = this.rng.weighted(list, (e) => e.weight);
          const elite = this.rng.chance(d.eliteChance) ? this.rng.pick(ELITE_AFFIXES) : null;
          this.addEnemy(def, wx, s.kind === 'flyer' ? wy - 8 : wy, { elite });
          break;
        }
        case 'chest':
          this.interactables.push(new Chest(this, wx, wy));
          break;
        case 'altar':
          this.interactables.push(new Altar(this, wx, wy));
          break;
        case 'merchant':
          this.interactables.push(new Merchant(this, wx, wy));
          break;
        case 'coin':
          this.pickups.spawn('coin', wx, wy - 6, 1, { burst: false });
          break;
        case 'torch':
          this.addTorch(wx, wy - 4);
          break;
        case 'banner':
          if (this.textures.exists(OBJ.banner)) this.add.image(wx, wy - TILE * 2, OBJ.banner).setOrigin(0.5, 0).setDepth(-1).setTint((BIOME_PALETTES[L.biome] as any).banner ?? 0xffffff);
          break;
        case 'boss': {
          const bossId = BIOMES[L.biome]?.bossId ?? Object.keys(BOSSES)[0];
          this.boss = createBoss(this, bossId, wx, wy);
          if (this.boss) {
            this.enemies.push(this.boss);
            this.physics.add.collider(this.boss, this.floor.layer, undefined, this.oneWayProcess(() => false, null), this);
          }
          break;
        }
      }
    }
    const ex = L.exit;
    this.exitPortal = new ExitPortal(this, ex.tx * TILE + TILE / 2, (ex.ty + 1) * TILE, () => this.nextFloor());
    this.interactables.push(this.exitPortal);
    this.lighting.add(() => (this.exitPortal ? { x: this.exitPortal.x, y: this.exitPortal.y - 24, radius: 70, color: 0x9a6aff, intensity: 0.9 } : null));
    if (this.boss) this.exitPortal.setLocked(true);
    if (L.isBoss && !this.boss) {
      // Fallback when no boss implementation exists: an elite guardian.
      const strong = pool.sort((a, b) => b.hp - a.hp)[0];
      const bs = L.spawns.find((s) => s.kind === 'boss');
      if (strong && bs) {
        this.boss = this.addEnemy(strong, bs.tx * TILE + TILE / 2, (bs.ty + 1) * TILE, { elite: 'armored' });
        this.exitPortal.setLocked(true);
      }
    }
  }

  private addTorch(x: number, y: number): void {
    if (this.textures.exists(OBJ.torch)) {
      const t = this.add.sprite(x, y, OBJ.torch).setOrigin(0.5, 1).setDepth(-1);
      if (this.anims.exists(ANIMS.torchBurn)) t.play({ key: ANIMS.torchBurn, startFrame: Phaser.Math.Between(0, 2) });
    }
    const color = BIOME_PALETTES[this.layout.biome].light ?? 0xffa040;
    this.lighting.add(() => ({ x, y: y - 10, radius: 64, flicker: true, color, intensity: 0.9 }));
  }

  private addEnemy(def: EnemyDef, x: number, y: number, opts: { elite?: EliteAffix | null; summoned?: boolean } = {}): Enemy {
    const e = new Enemy(this, def, x, y, opts);
    this.enemies.push(e);
    if (def.ai !== 'ghost') this.physics.add.collider(e, this.floor.layer, undefined, this.oneWayProcess(() => false, null), this);
    else e.body.setAllowGravity(false);
    return e;
  }

  // ---------------------------------------------------------------------------
  // Frame loop
  // ---------------------------------------------------------------------------

  override update(_time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs, 50) / 1000;
    input.update({ camera: this.cameras.main, fromX: this.player.centerX, fromY: this.player.centerY });
    this.updateCursor();

    if (input.pressed('pause') && !this.modalOpen && !this.ending) {
      this.togglePause();
      return;
    }
    if (this.paused) return;

    const frozen = this.juice.frozen;
    if (frozen !== this.physics.world.isPaused) {
      if (frozen) this.physics.pause();
      else this.physics.resume();
    }
    if (frozen) {
      this.lighting.update(this.now);
      return;
    }

    if (!this.ending) this.run.timeMs += deltaMs;

    if (!this.modalOpen) {
      this.player.tick(dt);
      if (input.pressed('potion')) this.drinkPotion();
    } else {
      this.player.body.velocity.x *= 0.8;
    }
    for (const e of this.enemies) if (e.active) e.tick(dt);
    if (this.enemies.some((e) => !e.active)) this.enemies = this.enemies.filter((e) => e.active);
    this.projectiles.update(dt);
    this.pickups.update(dt);
    this.updateInteractables(dt);
    this.updateCamera(dt);
    this.updateParallax();
    this.lighting.update(this.now);
    this.trackRooms();

    // Fell out of the world.
    if (this.player.y > this.floor.worldH + 40 && this.player.state2 !== 'dead') {
      this.damagePlayer(this.run.stats.maxHp * 0.2, null, 'The Abyss', { unblockable: true });
      const ps = this.layout.playerStart;
      this.player.setPosition(ps.tx * TILE + TILE / 2, (ps.ty + 1) * TILE);
      this.player.body.reset(this.player.x, this.player.y);
    }
  }

  private updateCursor(): void {
    if (!this.cursor) return;
    const show = input.usingMouse && !input.usingTouch;
    setCursorVisible(this.game, !show);
    this.cursor.setVisible(show);
    if (show && input.pointer) this.cursor.setPosition(Math.round(input.pointer.x), Math.round(input.pointer.y));
  }

  private updateInteractables(dt: number): void {
    let best: Interactable | null = null;
    let bestD = Infinity;
    const px = this.player.centerX, py = this.player.body.bottom - 8;
    for (const it of this.interactables) {
      it.update(dt);
      if (!it.active) continue;
      const d = Math.hypot(it.x - px, it.y - 8 - py);
      if (d < it.range + 6 && d < bestD) {
        bestD = d;
        best = it;
      }
    }
    if (this.interactables.some((i) => !i.active && !(i instanceof ExitPortal) && !(i instanceof Chest) && !(i instanceof Altar))) {
      this.interactables = this.interactables.filter((i) => i.active || i instanceof ExitPortal || i instanceof Chest || i instanceof Altar);
    }
    if (best !== this.focused) {
      this.focused = best;
      bus.emit('prompt', { text: best ? best.prompt() : null });
    }
    if (best && !this.modalOpen && input.pressed('interact') && this.player.state2 === 'normal') {
      input.consume('interact');
      best.interact();
      this.focused = null;
      bus.emit('prompt', { text: null });
    }
  }

  private updateCamera(dt: number): void {
    const target = this.player.facing * 28 + this.player.body.velocity.x * 0.08;
    this.lookAhead = Phaser.Math.Linear(this.lookAhead, target, Math.min(1, dt * 2.5));
    this.cameras.main.setFollowOffset(-this.lookAhead, 16);
  }

  private updateParallax(): void {
    const cam = this.cameras.main;
    if (this.bgFar) this.bgFar.tilePositionX = cam.scrollX * 0.1;
    if (this.bgMid) {
      this.bgMid.tilePositionX = cam.scrollX * 0.3;
      this.bgMid.tilePositionY = Math.min(0, (cam.scrollY - (this.floor.worldH - GAME_H)) * 0.05);
    }
  }

  private trackRooms(): void {
    const r = this.floor.roomAt(this.player.centerX, this.player.centerY);
    if (r >= 0 && !this.roomsVisited.has(r)) {
      this.roomsVisited.add(r);
      const room = this.layout.rooms[r];
      if (room?.type === 'boss' && this.boss) {
        const def = BOSSES[this.boss.def.id];
        bus.emit('boss:show', { name: def?.name ?? this.boss.def.name, title: def?.title ?? '', hp: this.boss.hp, max: this.boss.maxHp });
        audio.sfx('bossRoar');
        this.juice.shake(0.008, 500);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // World API
  // ---------------------------------------------------------------------------

  hitEnemiesInRect(rect: Phaser.Geom.Rectangle, makeHit: (e: Enemy) => PlayerHit, already?: Set<Enemy>): Enemy[] {
    const out: Enemy[] = [];
    for (const e of this.enemies) {
      if (!e.alive || already?.has(e)) continue;
      const b = e.body;
      if (b.right < rect.left || b.left > rect.right || b.bottom < rect.top || b.top > rect.bottom) continue;
      const hit = makeHit(e);
      if (hit.amount <= 0) continue;
      already?.add(e);
      const dealt = e.hurt(hit);
      if (dealt > 0) this.onPlayerDealtDamage(dealt, e, hit);
      out.push(e);
    }
    return out;
  }

  enemiesInRadius(x: number, y: number, r: number): Enemy[] {
    return this.enemies.filter((e) => e.alive && Phaser.Math.Distance.Between(x, y, e.centerX, e.centerY) <= r);
  }

  nearestEnemy(x: number, y: number, maxDist: number, requireLos = false): Enemy | null {
    let best: Enemy | null = null;
    let bd = maxDist;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const d = Phaser.Math.Distance.Between(x, y, e.centerX, e.centerY);
      if (d < bd && (!requireLos || this.lineOfSight(x, y, e.centerX, e.centerY))) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  damagePlayer(raw: number, from: { x: number; y: number } | null, cause: string, opts: { unblockable?: boolean; kb?: number } = {}): void {
    const p = this.player;
    if (this.ending || p.state2 === 'dead' || p.invulnerable || session.godMode) return;
    let amount = raw;
    if (!opts.unblockable) {
      for (const w of p.combat.weapons) {
        const res = w?.blockIncoming(from);
        if (res) {
          amount *= res.mult;
          if (res.parried) return;
          break;
        }
      }
    }
    if (!this.firstHitShieldUsed && relicHooks(this, 'first-hit-shield').length) {
      this.firstHitShieldUsed = true;
      this.juice.ring(p.centerX, p.centerY, 24, 0x9be7ff);
      bus.emit('toast', { text: 'Ward absorbed the blow', color: 0x9be7ff });
      p.grantIframes(500);
      return;
    }
    amount = enemyDamageToPlayer(amount, this.run.stats);
    if (amount <= 0) return;
    if (!p.receiveDamage(amount, from, opts.kb)) return;
    this.juice.damageNumber(p.centerX, p.body.top, amount, { color: 0xff5050 });
    // Thorns.
    if (from && this.run.stats.thorns > 0) {
      const src = this.nearestEnemy(from.x, from.y, 40);
      src?.takeDamage(raw * this.run.stats.thorns, false, 0x8aff6a);
    }
    if (this.run.hp <= 0) this.onPlayerDeath(cause);
  }

  onPlayerDealtDamage(amount: number, _target: Enemy, hit: PlayerHit): void {
    const st = this.run.stats;
    if (st.lifesteal > 0) this.run.heal(amount * st.lifesteal);
    if (hit.crit) {
      for (const p of relicHooks(this, 'crit-heal')) this.run.heal(p.amount ?? 2);
    }
    if (this.boss && _target === this.boss) bus.emit('boss:hp', { hp: Math.max(0, this.boss.hp), max: this.boss.maxHp });
    bus.emit('player:hp', { hp: this.run.hp, max: st.maxHp });
  }

  onEnemyKilled(e: Enemy): void {
    const st = this.run.stats;
    if (!e.summoned) {
      this.run.addKill();
      bus.emit('run:kills', { kills: this.run.kills });
      const coins = rollEnemyCoins(this.rng, e.def, this.difficulty) * (e.elite ? 3 : 1);
      this.pickups.spawnCoins(e.centerX, e.centerY, coins);
      if (e.elite || this.rng.chance(e.def.emberChance)) this.pickups.spawn('ember', e.centerX, e.centerY, e.elite ? 2 : 1);
      if (this.rng.chance(e.elite ? 0.35 : 0.04)) this.pickups.spawn('heart', e.centerX, e.centerY, 1);
    }
    if (st.healOnKill > 0) this.run.heal(st.healOnKill);
    for (const p of relicHooks(this, 'kill-explode')) {
      const r = p.radius ?? 32;
      this.juice.fx(e.centerX, e.centerY, 'fx-explosion', { scale: r / 24 });
      audio.sfx('explosion', { volume: 0.5 });
      const dmg = (p.damage ?? 12) * levelMult(this.difficulty.itemLevel);
      this.time.delayedCall(1, () =>
        this.hitEnemiesInRect(new Phaser.Geom.Rectangle(e.centerX - r, e.centerY - r, r * 2, r * 2), () => ({ amount: dmg, crit: false, kbX: 0, kbY: -100, source: 'Relic' })),
      );
    }
    bus.emit('player:hp', { hp: this.run.hp, max: st.maxHp });
    if (e === this.boss) this.onBossDefeated();
  }

  private onBossDefeated(): void {
    const boss = this.boss!;
    const def = BOSSES[boss.def.id];
    saves.data.stats.bossesKilled++;
    bus.emit('boss:hide', {});
    audio.sfx('bossDie');
    this.juice.flash(300, 255, 230, 200);
    this.juice.shake(0.012, 700);
    this.cameras.main.zoomTo(1.15, 400, 'Cubic.easeOut', true);
    this.time.delayedCall(900, () => this.cameras.main.zoomTo(1, 600));
    this.pickups.spawnCoins(boss.centerX, boss.centerY, Math.round((def?.coins ?? 120) * (1 + this.difficulty.loop * 0.5)));
    this.pickups.spawn('ember', boss.centerX, boss.centerY, def?.embers ?? 6);
    this.pickups.spawn('heart', boss.centerX, boss.centerY, 2);
    // Guaranteed boss scroll.
    this.pickups.spawn('scroll', boss.centerX, boss.centerY - 10, 1, { track: this.rng.pick(['might', 'cunning', 'vigor'] as StatTrack[]) });
    this.exitPortal?.setLocked(false);
    bus.emit('toast', { text: 'The way down is open', color: 0xc79aff });
    audio.music(this.layout.biome);
  }

  spawnEnemy(defId: string, x: number, y: number, opts: { elite?: boolean; summoned?: boolean } = {}): Enemy | null {
    const def = ENEMIES[defId];
    if (!def) return null;
    return this.addEnemy(def, x, y, { elite: opts.elite ? this.rng.pick(ELITE_AFFIXES) : null, summoned: opts.summoned });
  }

  isSolidAt(wx: number, wy: number): boolean {
    return this.floor.isSolid(Math.floor(wx / TILE), Math.floor(wy / TILE));
  }

  lineOfSight(x0: number, y0: number, x1: number, y1: number): boolean {
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.ceil(dist / (TILE / 2));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (this.isSolidAt(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)) return false;
    }
    return true;
  }

  addCoins(n: number, x?: number, y?: number): void {
    const amt = Math.max(1, Math.round(n * (1 + this.run.stats.coinPct)));
    saves.data.coins += amt;
    saves.data.stats.totalCoins += amt;
    this.run.addCoins(amt);
    bus.emit('run:coins', { coins: saves.data.coins, delta: amt });
    if (x !== undefined && y !== undefined && amt >= 5) this.juice.damageNumber(x, y, amt, { color: 0xffd35a, text: `+${amt}` });
  }

  spendCoins(n: number): boolean {
    if (saves.data.coins < n) return false;
    saves.data.coins -= n;
    bus.emit('run:coins', { coins: saves.data.coins, delta: -n });
    return true;
  }

  addEmbers(n: number, x?: number, y?: number): void {
    const amt = Math.max(1, Math.round(n * (1 + this.run.stats.emberPct)));
    this.run.addEmbers(amt);
    bus.emit('run:embers', { unbanked: this.run.emberUnbanked, banked: saves.data.embers, delta: amt });
    if (x !== undefined && y !== undefined) this.juice.damageNumber(x, y, amt, { color: 0xff8a3a, text: `+${amt} ember` });
  }

  grantScroll(track: StatTrack): void {
    const before = this.run.stats.maxHp;
    this.run.addScroll(track);
    this.run.recompute(saves.data.upgrades);
    const gained = this.run.stats.maxHp - before;
    this.run.heal(gained + this.run.stats.maxHp * 0.15);
    audio.sfx('scroll');
    const color = track === 'might' ? 0xff5a4a : track === 'cunning' ? 0xb07aff : 0x6aff8a;
    this.juice.ring(this.player.centerX, this.player.centerY, 40, color, 400);
    this.juice.burst(this.player.centerX, this.player.centerY, { count: 24, tint: [color, 0xffffff], speed: [40, 140], gravity: -60, blendAdd: true, life: [300, 700] });
    bus.emit('toast', { text: `Scroll of ${track[0].toUpperCase() + track.slice(1)}`, color });
    this.emitAll();
  }

  dropItem(item: ItemInstance, x: number, y: number, opts: { price?: number; pop?: boolean } = {}): void {
    // Snap to the ground below.
    let gy = y;
    for (let i = 0; i < 20 && !this.isSolidAt(x, gy + 1) && this.floor.tileAt(Math.floor(x / TILE), Math.floor((gy + 1) / TILE)) !== Tile.Platform; i++) gy += TILE / 2;
    gy = Math.floor((gy + 1) / TILE) * TILE;
    this.interactables.push(new ItemDrop(this, x, gy, item, opts.price ?? 0, opts.pop ?? true));
  }

  takeItem(item: ItemInstance, x: number, y: number): void {
    const run = this.run;
    if (item.kind === 'relic') {
      run.addRelic(item);
      this.afterEquip(item);
      return;
    }
    const slots = item.kind === 'weapon' ? run.weapons : run.skills;
    const empty = slots.findIndex((s) => !s);
    if (empty >= 0) {
      slots[empty] = item;
      this.afterEquip(item);
      return;
    }
    bus.emit('ui:open', {
      kind: 'swap',
      data: {
        item,
        current: [...slots],
        resolve: (slot: number | null) => {
          if (slot === null || slot === undefined) {
            this.dropItem(item, x, y, { pop: false });
            return;
          }
          const old = slots[slot];
          slots[slot] = item;
          if (old) this.dropItem(old, x + (this.player.facing > 0 ? -14 : 14), y, { pop: false });
          this.afterEquip(item);
        },
      },
    });
  }

  private afterEquip(item: ItemInstance): void {
    this.run.recompute(saves.data.upgrades);
    audio.sfx('pickup');
    this.player.combat.sync();
    bus.emit('toast', { text: itemDisplayName(item), color: RARITY_COLORS[item.rarity] });
    this.emitAll();
  }

  private drinkPotion(): void {
    if (this.player.state2 !== 'normal') return;
    if (this.run.potions <= 0) {
      audio.sfx('denied');
      return;
    }
    if (this.run.hp >= this.run.stats.maxHp) {
      bus.emit('toast', { text: 'Already at full health' });
      return;
    }
    const healed = this.run.usePotion();
    audio.sfx('potion');
    this.juice.damageNumber(this.player.centerX, this.player.body.top, healed, { color: 0x6aff8a, text: `+${Math.round(healed)}` });
    this.juice.burst(this.player.centerX, this.player.centerY, { count: 14, tint: [0x6aff8a, 0xd0ffd8], speed: [20, 80], gravity: -80, blendAdd: true });
    this.emitAll();
  }

  /** Push the full HUD state. */
  emitAll(): void {
    const r = this.run;
    bus.emit('player:hp', { hp: r.hp, max: r.stats.maxHp });
    bus.emit('player:potions', { charges: r.potions, max: r.stats.potionCharges });
    bus.emit('run:coins', { coins: saves.data.coins, delta: 0 });
    bus.emit('run:embers', { unbanked: r.emberUnbanked, banked: saves.data.embers, delta: 0 });
    bus.emit('run:kills', { kills: r.kills });
    bus.emit('run:loadout', { weapons: [...r.weapons], skills: [...r.skills], relics: [...r.relics] });
    bus.emit('run:scrolls', { ...r.scrolls });
  }

  // ---------------------------------------------------------------------------
  // Flow
  // ---------------------------------------------------------------------------

  private togglePause(): void {
    this.paused = !this.paused;
    if (this.paused) {
      this.physics.pause();
      this.tweens.pauseAll();
      audio.setMuffle(0.8);
      bus.emit('game:pause', { paused: true });
      if (this.scene.get('Pause')) this.scene.launch('Pause');
    } else {
      this.resumeFromPause();
    }
  }

  resumeFromPause(): void {
    this.paused = false;
    this.physics.resume();
    this.tweens.resumeAll();
    audio.setMuffle(0);
    bus.emit('game:pause', { paused: false });
    if (this.scene.isActive('Pause')) this.scene.stop('Pause');
    input.releaseAll();
  }

  /** Abandon the run from the pause menu. */
  abandonRun(): void {
    this.resumeFromPause();
    this.run.hp = 0;
    this.onPlayerDeath('Abandoned the climb');
  }

  private nextFloor(): void {
    if (this.ending) return;
    this.ending = true;
    const r = this.run;
    // Bank embers.
    const banked = r.bankEmbers();
    if (banked > 0) {
      saves.data.embers += banked;
      bus.emit('toast', { text: `Banked ${banked} embers`, color: 0xff8a3a });
    }
    r.enterFloor(r.floor + 1);
    saves.data.stats.deepest = Math.max(saves.data.stats.deepest, r.floor);
    saves.save();
    this.player.body.setVelocity(0, 0);
    this.player.setVisible(false);
    this.juice.ring(this.player.centerX, this.player.centerY, 40, 0x9a6aff, 400);
    this.cameras.main.fadeOut(450, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.restart());
  }

  private onPlayerDeath(cause: string): void {
    if (this.ending) return;
    // Revive relic.
    if (this.run.tryRevive(0.5)) {
      this.player.revive(this.run.hp);
      bus.emit('toast', { text: 'The phoenix feather burns away...', color: 0xffb02e });
      bus.emit('player:revived', {});
      return;
    }
    this.ending = true;
    this.player.die();
    bus.emit('player:died', { cause });
    bus.emit('boss:hide', {});
    audio.music('death');
    this.juice.flash(200, 120, 0, 0);
    this.cameras.main.zoomTo(1.3, 1200, 'Cubic.easeOut');
    this.time.timeScale = 0.6;
    const record = this.run.toRecord(cause);
    this.run.emberUnbanked = 0; // unbanked embers are lost
    saves.save();
    this.time.delayedCall(1300, () => {
      this.time.timeScale = 1;
      this.cameras.main.fadeOut(500, 0, 0, 0);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        session.run = null;
        this.scene.stop('HUD');
        if (this.scene.isActive('Touch')) this.scene.stop('Touch');
        this.scene.start('Death', { record });
      });
    });
  }

  private cleanup(): void {
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
    this.projectiles?.clear();
    this.pickups?.clear();
    this.lighting?.destroy();
    this.floor?.destroy();
    this.interactables.forEach((i) => i.destroy());
    this.interactables = [];
    this.enemies = [];
    setCursorVisible(this.game, true);
    if (this.physics?.world?.isPaused) this.physics.resume();
  }

  private installDebug(): void {
    const w = window as any;
    w.__spire = {
      scene: this,
      warp: (n: number) => {
        this.run.enterFloor(Math.max(1, Math.floor(n)));
        this.scene.restart();
      },
      god: (on = true) => (session.godMode = on),
      killAll: () => this.enemies.forEach((e) => e.alive && e.takeDamage(1e9, false)),
      coins: (n: number) => this.addCoins(n),
      embers: (n: number) => this.addEmbers(n),
      die: () => {
        session.godMode = false;
        this.damagePlayer(1e9, null, 'Debug', { unblockable: true });
      },
      teleportExit: () => {
        const ex = this.layout.exit;
        this.player.body.reset(ex.tx * TILE + TILE / 2, (ex.ty + 1) * TILE - 2);
      },
      spawn: (id: string, elite = false, dx = 60) => this.spawnEnemy(id, this.player.x + dx * this.player.facing, this.player.y - 4, { elite }),
      give: (id: string, rarity: 'common' | 'rare' | 'epic' | 'legendary' = 'rare') => {
        const kind = kindOfId(id);
        if (!kind) return false;
        this.dropItem(makeItem(kind, id, this.difficulty.itemLevel, rarity), this.player.x + 20 * this.player.facing, this.player.y - 4);
        return true;
      },
      equip: (id: string, slot = 0, rarity: 'common' | 'rare' | 'epic' | 'legendary' = 'rare') => {
        const kind = kindOfId(id);
        if (!kind) return false;
        const item = makeItem(kind, id, this.difficulty.itemLevel, rarity);
        if (kind === 'relic') this.run.addRelic(item);
        else (kind === 'weapon' ? this.run.weapons : this.run.skills)[slot] = item;
        this.afterEquip(item);
        return true;
      },
      scroll: (t: StatTrack) => this.grantScroll(t),
      heal: () => this.run.heal(1e9),
      state: () => ({
        floor: this.run.floor,
        hp: this.run.hp,
        coins: saves.data.coins,
        embers: saves.data.embers,
        unbanked: this.run.emberUnbanked,
        enemies: this.enemies.length,
        boss: !!this.boss,
        player: { x: this.player.x, y: this.player.y },
      }),
    };
    void FX;
  }
}
