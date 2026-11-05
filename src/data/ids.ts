/**
 * Canonical content catalog: every id + display name in the game.
 * Data files (weapons.ts, skills.ts, ...) must define exactly these ids, and
 * the art pipeline draws an icon / sprite for each. Do not rename ids.
 */

export const WEAPON_IDS = {
  rusty_sword: 'Rusty Sword', // starter melee, might
  twin_daggers: 'Twin Daggers', // fast, crit-from-behind, cunning
  war_hammer: 'War Hammer', // slow smash, stun, might
  spear: 'Pilgrim Spear', // long reach stab, cunning
  flame_blade: 'Cinder Blade', // burn, crit-vs-burning, might
  frost_axe: 'Rime Axe', // freeze, crit-vs-frozen, vigor
  blood_scythe: 'Blood Scythe', // bleed, lifesteal-on-bleed, vigor
  rapier: 'Duelist Rapier', // crit-final-hit, cunning
  hunter_bow: 'Hunter Bow', // starter ranged, cunning
  repeater_crossbow: 'Repeater', // rapid bolts, cunning
  throwing_knives: 'Throwing Knives', // bleed, cunning
  ember_staff: 'Ember Staff', // fireball arc, burn, might
  storm_rod: 'Storm Rod', // chain lightning, cunning
  oak_buckler: 'Oak Buckler', // starter shield, parry, vigor
  bastion_shield: 'Bastion Shield', // heavy block, bash stun, vigor
} as const;

export const SKILL_IDS = {
  fire_grenade: 'Fire Grenade', // starter
  frost_nova: 'Frost Nova',
  spike_trap: 'Spike Trap',
  bolt_turret: 'Bolt Turret',
  phantom_dash: 'Phantom Dash',
  war_cry: 'War Cry',
  chain_lightning: 'Chain Lightning',
  poison_cloud: 'Miasma',
  orbiting_blades: 'Orbiting Blades',
  meteor: 'Meteor',
} as const;

export const RELIC_IDS = {
  iron_heart: 'Iron Heart',
  vampire_fang: 'Vampire Fang',
  lucky_coin: 'Lucky Coin',
  feather_charm: 'Feather Charm',
  swift_boots: 'Swift Boots',
  whetstone: 'Whetstone',
  keen_eye: 'Keen Eye',
  heavy_plate: 'Heavy Plate',
  hourglass: 'Cracked Hourglass',
  ember_core: 'Ember Core',
  frozen_tear: 'Frozen Tear',
  viper_tooth: 'Viper Tooth',
  thorn_mail: 'Thorn Mail',
  berserker_mask: 'Berserker Mask',
  phoenix_feather: 'Phoenix Feather',
  soul_lantern: 'Soul Lantern',
  magnet_stone: 'Magnet Stone',
  merchant_seal: 'Merchant Seal',
  shadow_cloak: 'Shadow Cloak',
  glass_cannon: 'Glass Cannon',
} as const;

export const ENEMY_IDS = {
  zombie: 'Shambler', // walker — cells
  rat: 'Plague Rat', // jumper — cells
  skeleton_archer: 'Bone Archer', // archer — cells, ramparts
  bat: 'Gloom Bat', // flyer — cells, ramparts
  shield_knight: 'Shield Knight', // shieldbearer — ramparts, throne
  imp: 'Gargoyle Imp', // diver — ramparts
  bomber: 'Powder Monk', // bomber — ramparts, library
  lancer: 'Lancer', // charger — ramparts, throne
  cultist: 'Ink Cultist', // caster — library, throne
  ghost: 'Hollow Shade', // ghost — library
  book_mimic: 'Tome Mimic', // ambusher — library
  royal_guard: 'Royal Guard', // brute — throne
  necromancer: 'Bone Priest', // summoner — library, throne
} as const;

export const BOSS_IDS = {
  warden: 'The Warden', // cells, floor 5
  gargoyle_matriarch: 'Gargoyle Matriarch', // ramparts, floor 10
  archivist: 'The Archivist', // library, floor 15
  hollow_king: 'The Hollow King', // throne, floor 20
} as const;

export type WeaponId = keyof typeof WEAPON_IDS;
export type SkillId = keyof typeof SKILL_IDS;
export type RelicId = keyof typeof RELIC_IDS;
export type EnemyId = keyof typeof ENEMY_IDS;
export type BossId = keyof typeof BOSS_IDS;

export const ALL_ITEM_IDS: string[] = [
  ...Object.keys(WEAPON_IDS),
  ...Object.keys(SKILL_IDS),
  ...Object.keys(RELIC_IDS),
];
