/**
 * Shared, engine-agnostic type contracts for Hollow Spire.
 * Everything in src/data, src/world (generation), src/run and src/core/save
 * is written against these types. Keep this file free of Phaser imports so it
 * can be used from unit tests running in plain Node.
 */

import type { ProjectileKey } from '../art/keys';

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export const RARITIES: readonly Rarity[] = ['common', 'rare', 'epic', 'legendary'];

/** The three stat tracks raised by scrolls. Weapons/skills scale with one. */
export type StatTrack = 'might' | 'cunning' | 'vigor';
export const STAT_TRACKS: readonly StatTrack[] = ['might', 'cunning', 'vigor'];

export type StatusId = 'burn' | 'bleed' | 'poison' | 'freeze' | 'stun';

export type BiomeId = 'cells' | 'ramparts' | 'library' | 'throne';
export const BIOME_ORDER: readonly BiomeId[] = ['cells', 'ramparts', 'library', 'throne'];

export type ItemKind = 'weapon' | 'skill' | 'relic';

// ---------------------------------------------------------------------------
// Player stats & modifiers
// ---------------------------------------------------------------------------

/**
 * Derived player stats. Percent-like values are fractions (0.1 = 10%).
 * Base values live in src/run/stats.ts; modifiers from meta upgrades, relics,
 * affixes and scrolls are summed additively on top.
 */
export interface PlayerStats {
  maxHp: number;
  /** Additive damage bonus; final damage multiplier = 1 + damagePct. */
  damagePct: number;
  critChance: number;
  /** Extra crit damage; crit multiplier = 1.5 + critDamage. */
  critDamage: number;
  /** Additive move speed bonus fraction. */
  moveSpeedPct: number;
  /** Number of mid-air jumps (1 = double jump). */
  extraJumps: number;
  /** Fraction of damage dealt returned as HP. */
  lifesteal: number;
  /** Damage reduction fraction, clamped to [0, 0.75]. */
  armor: number;
  /** Fraction reduction of skill cooldowns, clamped to [0, 0.6]. */
  skillCooldownPct: number;
  /** Fraction reduction of dodge cooldown, clamped to [0, 0.6]. */
  dodgeCooldownPct: number;
  /** Bonus fraction of coins gained. */
  coinPct: number;
  /** Bonus fraction of embers gained. */
  emberPct: number;
  potionCharges: number;
  /** Fraction of max HP healed by one potion. */
  potionHeal: number;
  /** Additive bonus to all status-on-hit chances. */
  statusChance: number;
  /** HP healed per enemy killed. */
  healOnKill: number;
  /** Fraction of contact/melee damage reflected to attackers. */
  thorns: number;
  /** Merchant price reduction fraction, clamped to [0, 0.5]. */
  shopDiscount: number;
  /** Extra damage fraction while below 35% HP. */
  lowHpDamagePct: number;
  /** Number of one-time revives available this run. */
  revives: number;
  /** Starting coins granted at the start of each run (meta upgrade). */
  startingCoins: number;
}

export type StatKey = keyof PlayerStats;
export type StatMods = Partial<Record<StatKey, number>>;

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

export interface OnHitStatus {
  status: StatusId;
  /** 0..1 chance per hit. */
  chance: number;
  /** Duration in ms (default per-status). */
  durationMs?: number;
  /** Damage per tick multiplier for DoTs (default 1). */
  potency?: number;
}

/** One swing of a melee combo. Times in ms, distances in px. */
export interface MeleeStep {
  /** Damage multiplier applied to the weapon's baseDamage. */
  dmg: number;
  windupMs: number;
  activeMs: number;
  recoverMs: number;
  /** Hitbox extends this far in front of the player's center. */
  reach: number;
  /** Hitbox height, centered on the player's center + offsetY. */
  height: number;
  offsetY?: number;
  /** Knockback speed applied to targets, px/s. */
  knockback: number;
  /** Forward velocity applied to the player during the swing, px/s. */
  lunge?: number;
  /** Hit-stop in ms on connect (juice). */
  hitstopMs?: number;
  /** Visual: which slash effect animation to play. */
  fx: SlashFx;
}

export type SlashFx = 'slash' | 'slash-wide' | 'stab' | 'smash' | 'spin';

export interface RangedSpec {
  /** Projectile visual key, see src/art/keys.ts PROJECTILES. */
  projectile: ProjectileKey;
  cooldownMs: number;
  /** Damage multiplier on baseDamage per projectile. */
  dmg: number;
  speed: number;
  count?: number;
  /** Total spread angle in degrees across `count` projectiles. */
  spreadDeg?: number;
  /** Projectiles pierce through this many enemies. */
  pierce?: number;
  /** Gravity applied to projectile (arcing), px/s^2. */
  gravity?: number;
  /** Max lifetime in ms. */
  lifeMs?: number;
  /** If set, the weapon must be held this long for a charged shot (2x dmg). */
  chargeMs?: number;
}

export interface ShieldSpec {
  /** Fraction of frontal damage blocked while holding. */
  block: number;
  /** Window at the start of raising the shield where hits are parried. */
  parryWindowMs: number;
  /** Damage multiplier of the parry riposte on baseDamage. */
  parryDmg: number;
  /** Shield bash when tapped. */
  bash: MeleeStep;
}

export interface WeaponDef {
  id: string;
  name: string;
  desc: string;
  kind: 'melee' | 'ranged' | 'shield';
  track: StatTrack;
  baseDamage: number;
  /** Additive crit chance for this weapon. */
  critChance?: number;
  melee?: { combo: MeleeStep[]; /** ms after a step during which the next step can chain. */ comboWindowMs: number };
  ranged?: RangedSpec;
  shield?: ShieldSpec;
  onHit?: OnHitStatus;
  /** Optional named special rule implemented in combat code, e.g. 'crit-vs-burning'. */
  special?: WeaponSpecial;
  /** Embers to unlock in the Sanctum Armory. 0 = unlocked by default. */
  unlockCost: number;
  /** Can be chosen as a starting weapon once unlocked. */
  starter?: boolean;
}

export type WeaponSpecial =
  | 'crit-vs-burning'
  | 'crit-vs-frozen'
  | 'crit-final-hit'
  | 'crit-from-behind'
  | 'lifesteal-on-bleed'
  | 'chain-lightning';

export type SkillBehavior =
  | 'grenade'
  | 'nova'
  | 'trap'
  | 'turret'
  | 'dash'
  | 'buff'
  | 'chain'
  | 'cloud'
  | 'orbit'
  | 'meteor';

export interface SkillDef {
  id: string;
  name: string;
  desc: string;
  track: StatTrack;
  behavior: SkillBehavior;
  cooldownMs: number;
  damage: number;
  status?: OnHitStatus;
  /** Behavior-specific numeric parameters (radius, durationMs, count, ...). */
  params: Record<string, number>;
  unlockCost: number;
  starter?: boolean;
}

export type RelicHook =
  | 'revive'
  | 'dodge-nova'
  | 'kill-explode'
  | 'first-hit-shield'
  | 'crit-heal'
  | 'coin-magnet';

export interface RelicDef {
  id: string;
  name: string;
  desc: string;
  rarity: Rarity;
  mods?: StatMods;
  onHit?: OnHitStatus;
  hook?: RelicHook;
  hookParams?: Record<string, number>;
  unlockCost: number;
}

export interface AffixDef {
  id: string;
  /** Label shown in the item name, e.g. "Burning" (prefix) or "of the Fox" (suffix). */
  label: string;
  position: 'prefix' | 'suffix';
  appliesTo: ItemKind[];
  minRarity: Rarity;
  /** Description with {v} substituted by the rolled value (formatted). */
  desc: string;
  /** Inclusive range of the rolled value. */
  range: [number, number];
  /** Stat that the rolled value is added to (if a stat affix). */
  stat?: StatKey;
  /** Status applied on hit with `chance = value` (if a status affix). */
  status?: StatusId;
  /** For damage-on-item affixes: multiplies the item's own damage by (1 + value). */
  itemDamage?: boolean;
}

export interface AffixRoll {
  id: string;
  value: number;
}

/** A concrete item rolled in a run. */
export interface ItemInstance {
  uid: string;
  kind: ItemKind;
  defId: string;
  rarity: Rarity;
  affixes: AffixRoll[];
  /** Quality level, derived from the floor it dropped on; scales item damage. */
  level: number;
}

// ---------------------------------------------------------------------------
// Enemies & bosses
// ---------------------------------------------------------------------------

export type AiKind =
  | 'walker'
  | 'jumper'
  | 'archer'
  | 'flyer'
  | 'shieldbearer'
  | 'diver'
  | 'bomber'
  | 'charger'
  | 'caster'
  | 'ghost'
  | 'ambusher'
  | 'brute'
  | 'summoner';

export interface EnemyDef {
  id: string;
  name: string;
  biomes: BiomeId[];
  minFloor: number;
  /** Spawn weight within its biomes. */
  weight: number;
  ai: AiKind;
  hp: number;
  /** Contact / attack damage at floor 1. */
  damage: number;
  /** Move speed px/s. */
  speed: number;
  /** Physics body size in px. */
  w: number;
  h: number;
  flying?: boolean;
  coins: [number, number];
  /** Chance to drop an ember (elites always drop). */
  emberChance: number;
  /** AI-specific parameters (aggroRange, attackRange, cooldownMs, ...). */
  params: Record<string, number>;
}

export interface BossDef {
  id: string;
  name: string;
  title: string;
  biome: BiomeId;
  hp: number;
  damage: number;
  w: number;
  h: number;
  coins: number;
  embers: number;
}

export type EliteAffix = 'swift' | 'armored' | 'vampiric' | 'explosive' | 'frenzied';

// ---------------------------------------------------------------------------
// Biomes & difficulty
// ---------------------------------------------------------------------------

export interface BiomeDef {
  id: BiomeId;
  name: string;
  /** Short flavor line shown on floor entry. */
  tagline: string;
  bossId: string;
}

export interface Difficulty {
  floor: number;
  biome: BiomeId;
  /** 0 for floors 1-20, 1 for 21-40, ... */
  loop: number;
  isBoss: boolean;
  hpMult: number;
  dmgMult: number;
  /** Target enemies per combat room. */
  enemiesPerRoom: number;
  eliteChance: number;
  /** Item level for drops on this floor. */
  itemLevel: number;
  /** Rarity weights for drops on this floor. */
  rarityWeights: Record<Rarity, number>;
}

// ---------------------------------------------------------------------------
// Floors (procedural generation output)
// ---------------------------------------------------------------------------

/** Numeric tile ids in FloorLayout.tiles. */
export const Tile = {
  Empty: 0,
  Solid: 1,
  Platform: 2,
  Spikes: 3,
  Ladder: 4,
} as const;
export type TileId = (typeof Tile)[keyof typeof Tile];

export type RoomType =
  | 'start'
  | 'combat'
  | 'treasure'
  | 'merchant'
  | 'altar'
  | 'exit'
  | 'boss'
  | 'corridor';

export type Door = 'L' | 'R' | 'T' | 'B';

/**
 * Room templates are ASCII grids exactly ROOM_W x ROOM_H characters.
 * Legend (see src/world/rooms/README in templates file):
 *   '#' solid        '.' empty        '-' one-way platform
 *   '^' spikes       'H' ladder
 *   'P' player start 'X' exit portal  'B' boss spawn
 *   'E' ground enemy 'F' flying enemy 'C' chest
 *   'M' merchant     'A' scroll altar 'o' coin
 *   't' torch decor  'w' banner/window decor
 * Door openings are carved by the generator, not drawn in templates.
 */
export interface RoomTemplate {
  id: string;
  type: RoomType;
  /** Which doors this template can support. */
  doors: Door[];
  /** Biomes it may appear in; omit for all. */
  biomes?: BiomeId[];
  rows: string[];
}

export interface PlacedRoom {
  /** Grid coordinates (room cells). */
  gx: number;
  gy: number;
  type: RoomType;
  templateId: string;
  /** Doors actually connected to neighbors. */
  doors: Door[];
  /** Distance (in rooms) from the start room along the graph. */
  depth: number;
}

export type SpawnKind =
  | 'enemy'
  | 'flyer'
  | 'chest'
  | 'merchant'
  | 'altar'
  | 'coin'
  | 'boss'
  | 'torch'
  | 'banner';

export interface Spawn {
  kind: SpawnKind;
  /** Tile coordinates in the whole-floor grid. */
  tx: number;
  ty: number;
  /** Index into FloorLayout.rooms. */
  room: number;
}

export interface FloorLayout {
  seed: number;
  floor: number;
  biome: BiomeId;
  isBoss: boolean;
  /** Size in rooms. */
  gridW: number;
  gridH: number;
  /** Size in tiles. */
  width: number;
  height: number;
  /** Row-major tile ids, length width*height. */
  tiles: TileId[];
  rooms: PlacedRoom[];
  spawns: Spawn[];
  playerStart: { tx: number; ty: number };
  exit: { tx: number; ty: number };
}

// ---------------------------------------------------------------------------
// Meta progression & persistence
// ---------------------------------------------------------------------------

export interface MetaUpgradeDef {
  id: string;
  name: string;
  desc: string;
  maxLevel: number;
  /** Coin cost of buying level `level+1` when currently at `level`. */
  costs: number[];
  /** Mods applied per level owned. */
  perLevel: StatMods;
}

export interface CosmeticDef {
  id: string;
  name: string;
  cost: number;
  /** Colors replacing the player's palette slots (hex 0xRRGGBB). */
  palette: { cloak: number; trim: number; skin: number; eyes: number };
}

export interface RunRecord {
  depth: number;
  kills: number;
  timeMs: number;
  coins: number;
  /** ISO date string. */
  date: string;
  seed: number;
  cause: string;
  weapon: string;
}

export interface Settings {
  master: number;
  music: number;
  sfx: number;
  screenShake: boolean;
  damageNumbers: boolean;
  touchControls: 'auto' | 'on' | 'off';
}

export interface SaveData {
  version: number;
  coins: number;
  embers: number;
  upgrades: Record<string, number>;
  /** Def ids (weapons/skills/relics) unlocked into the drop pool. */
  unlocked: string[];
  loadout: { weapon: string; skill: string | null };
  cosmetics: { owned: string[]; equipped: string };
  history: RunRecord[];
  stats: {
    runs: number;
    deaths: number;
    totalKills: number;
    totalCoins: number;
    bossesKilled: number;
    deepest: number;
  };
  settings: Settings;
  /** Whether the controls tutorial has been shown. */
  seenTutorial: boolean;
}
