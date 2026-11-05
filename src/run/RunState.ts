/** In-run state (pure; no Phaser). Coins themselves live in the save wallet. */
import { RELICS } from '../data/relics';
import { SKILLS } from '../data/skills';
import { WEAPONS } from '../data/weapons';
import type { ItemInstance, PlayerStats, RunRecord, SaveData, StatTrack } from '../data/types';
import { bankEmbers } from './Economy';
import { makeItem } from './Loot';
import { computeStats, emptyScrolls } from './stats';

export type Slots = [ItemInstance | null, ItemInstance | null];

export interface EquipResult {
  /** Item that was in the slot and got replaced (caller drops it on the ground). */
  replaced: ItemInstance | null;
  /** Slot index the item went to (relics: index in relics). -1 = no free slot; nothing changed. */
  slot: number;
}

export class RunState {
  readonly seed: number;
  floor = 1;
  deepest = 1;
  hp: number;
  potions: number;
  weapons: Slots = [null, null];
  skills: Slots = [null, null];
  relics: ItemInstance[] = [];
  scrolls: Record<StatTrack, number> = emptyScrolls();
  kills = 0;
  bossesKilled = 0;
  timeMs = 0;
  emberUnbanked = 0;
  embersBanked = 0;
  /** Coins picked up this run (for the run record); the wallet is the save. */
  coinsGained = 0;
  /** Coins granted by the 'purse' meta upgrade at run start; caller adds to the wallet. */
  startingCoins = 0;
  revivesUsed = 0;
  stats: PlayerStats;
  private upgrades: Record<string, number>;

  constructor(seed: number, upgrades: Record<string, number> = {}) {
    this.seed = seed;
    this.upgrades = { ...upgrades };
    this.stats = this.calc();
    this.hp = this.stats.maxHp;
    this.potions = this.stats.potionCharges;
  }

  /** New run from the save: meta upgrades + loadout (common, level 1). */
  static create(seed: number, save: SaveData): RunState {
    const run = new RunState(seed, save.upgrades);
    const w = save.loadout.weapon;
    if (w && WEAPONS[w]) run.weapons[0] = makeItem('weapon', w, 1, 'common');
    const s = save.loadout.skill;
    if (s && SKILLS[s]) run.skills[0] = makeItem('skill', s, 1, 'common');
    run.recompute();
    run.hp = run.stats.maxHp;
    run.potions = run.stats.potionCharges;
    run.startingCoins = run.stats.startingCoins;
    return run;
  }

  private calc(): PlayerStats {
    return computeStats({
      upgrades: this.upgrades,
      relics: this.relics,
      equipped: [...this.weapons, ...this.skills],
      scrolls: this.scrolls,
    });
  }

  /**
   * Recompute cached stats. Max HP gains are added to current HP; losses clamp it.
   * Potion charges are clamped to the new maximum.
   */
  recompute(upgrades?: Record<string, number>): PlayerStats {
    if (upgrades) this.upgrades = { ...upgrades };
    const oldMax = this.stats.maxHp;
    this.stats = this.calc();
    const delta = this.stats.maxHp - oldMax;
    if (delta > 0) this.hp += delta;
    this.hp = Math.min(this.hp, this.stats.maxHp);
    this.potions = Math.min(this.potions, this.stats.potionCharges);
    return this.stats;
  }

  get maxPotions(): number {
    return this.stats.potionCharges;
  }

  get isDead(): boolean {
    return this.hp <= 0;
  }

  get hpFrac(): number {
    return this.stats.maxHp > 0 ? this.hp / this.stats.maxHp : 0;
  }

  get revivesLeft(): number {
    return Math.max(0, this.stats.revives - this.revivesUsed);
  }

  /**
   * Equip a weapon/skill (relics are added to the relic list).
   * Without `slot`, uses the first empty slot; if both are full returns slot -1
   * and changes nothing (caller asks the player which to replace).
   */
  equip(item: ItemInstance, slot?: number): EquipResult {
    if (item.kind === 'relic') return { replaced: null, slot: this.addRelic(item) };
    const slots = item.kind === 'weapon' ? this.weapons : this.skills;
    let idx = slot ?? slots.findIndex((s) => s === null);
    if (idx < 0 || idx > 1) return { replaced: null, slot: -1 };
    const replaced = slots[idx];
    slots[idx] = item;
    this.recompute();
    return { replaced, slot: idx };
  }

  /** Remove an equipped weapon/skill from a slot (returns it). */
  unequip(kind: 'weapon' | 'skill', slot: number): ItemInstance | null {
    const slots = kind === 'weapon' ? this.weapons : this.skills;
    const it = slots[slot] ?? null;
    slots[slot] = null;
    this.recompute();
    return it;
  }

  /** Add a relic; returns its index. */
  addRelic(item: ItemInstance): number {
    if (!RELICS[item.defId]) throw new Error(`Unknown relic ${item.defId}`);
    this.relics.push(item);
    this.recompute();
    return this.relics.length - 1;
  }

  hasRelic(id: string): boolean {
    return this.relics.some((r) => r.defId === id);
  }

  /** +1 scroll level in a track; returns the new level. HP rises with max HP. */
  addScroll(track: StatTrack): number {
    this.scrolls[track] += 1;
    this.recompute();
    return this.scrolls[track];
  }

  /** Heal (clamped); returns HP actually restored. */
  heal(amount: number): number {
    if (this.hp <= 0 || amount <= 0) return 0;
    const before = this.hp;
    this.hp = Math.min(this.stats.maxHp, this.hp + amount);
    return this.hp - before;
  }

  /** Apply final (post-armor) damage; returns remaining HP. */
  damage(amount: number): number {
    this.hp = Math.max(0, this.hp - Math.max(0, amount));
    return this.hp;
  }

  /** Consume a revive if available: restores healFrac of max HP. */
  tryRevive(healFrac = 0.5): boolean {
    if (this.revivesLeft <= 0) return false;
    this.revivesUsed += 1;
    this.hp = Math.max(1, Math.round(this.stats.maxHp * healFrac));
    return true;
  }

  /** Drink a potion; returns HP restored, or 0 if none left / already full. */
  usePotion(): number {
    if (this.potions <= 0 || this.hp >= this.stats.maxHp || this.hp <= 0) return 0;
    this.potions -= 1;
    return this.heal(Math.round(this.stats.maxHp * this.stats.potionHeal));
  }

  refillPotions(): void {
    this.potions = this.stats.potionCharges;
  }

  addKill(): void {
    this.kills += 1;
  }

  /** Adds embers to the unbanked pool (bonus already applied by caller). */
  addEmbers(n: number): void {
    this.emberUnbanked += Math.max(0, Math.floor(n));
  }

  /** Bank at a floor exit; returns the amount to add to save.embers. */
  bankEmbers(): number {
    return bankEmbers(this);
  }

  /** Record a coin pickup for stats (wallet is updated by the caller). */
  addCoins(n: number): void {
    this.coinsGained += Math.max(0, n);
  }

  enterFloor(floor: number): void {
    this.floor = floor;
    this.deepest = Math.max(this.deepest, floor);
  }

  toRecord(cause: string, date = new Date()): RunRecord {
    return {
      depth: this.deepest,
      kills: this.kills,
      timeMs: Math.round(this.timeMs),
      coins: this.coinsGained,
      date: date.toISOString(),
      seed: this.seed,
      cause,
      weapon: this.weapons[0]?.defId ?? this.weapons[1]?.defId ?? '',
    };
  }
}
