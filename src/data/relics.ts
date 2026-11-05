import type { RelicDef } from './types';

/**
 * Passive relics. `mods` add to PlayerStats; `hook` is a named rule implemented
 * by the runtime (params in hookParams):
 *  revive:           { healFrac }            — on lethal damage, revive with healFrac max HP (uses stats.revives)
 *  dodge-nova:       { damage, radius }      — dodging releases a damaging ring (damage scales with item level)
 *  kill-explode:     { chance, damage, radius } — killed enemies may explode
 *  first-hit-shield: { cooldownMs }          — negates one hit, recharges after cooldownMs
 *  crit-heal:        { heal }                — crits heal this many HP
 *  coin-magnet:      { radius }              — pickups are attracted from this distance (px)
 */
export const RELICS: Record<string, RelicDef> = {
  iron_heart: { id: 'iron_heart', name: 'Iron Heart', desc: '+30 max HP.', rarity: 'common', mods: { maxHp: 30 }, unlockCost: 0 },
  vampire_fang: { id: 'vampire_fang', name: 'Vampire Fang', desc: 'Heal 3% of damage dealt.', rarity: 'rare', mods: { lifesteal: 0.03 }, unlockCost: 0 },
  lucky_coin: { id: 'lucky_coin', name: 'Lucky Coin', desc: '+25% coins and +5% crit chance.', rarity: 'common', mods: { coinPct: 0.25, critChance: 0.05 }, unlockCost: 0 },
  feather_charm: { id: 'feather_charm', name: 'Feather Charm', desc: 'Gain an extra mid-air jump.', rarity: 'rare', mods: { extraJumps: 1 }, unlockCost: 0 },
  swift_boots: { id: 'swift_boots', name: 'Swift Boots', desc: '+15% move speed, -15% dodge cooldown.', rarity: 'common', mods: { moveSpeedPct: 0.15, dodgeCooldownPct: 0.15 }, unlockCost: 0 },
  whetstone: { id: 'whetstone', name: 'Whetstone', desc: '+15% damage.', rarity: 'common', mods: { damagePct: 0.15 }, unlockCost: 0 },
  keen_eye: { id: 'keen_eye', name: 'Keen Eye', desc: '+10% crit chance, +25% crit damage.', rarity: 'common', mods: { critChance: 0.1, critDamage: 0.25 }, unlockCost: 0 },
  heavy_plate: { id: 'heavy_plate', name: 'Heavy Plate', desc: '+15% damage reduction, -5% move speed.', rarity: 'common', mods: { armor: 0.15, moveSpeedPct: -0.05 }, unlockCost: 0 },
  hourglass: { id: 'hourglass', name: 'Cracked Hourglass', desc: '-25% skill cooldowns.', rarity: 'rare', mods: { skillCooldownPct: 0.25 }, unlockCost: 6 },
  ember_core: { id: 'ember_core', name: 'Ember Core', desc: 'Hits have a 15% chance to burn.', rarity: 'rare', onHit: { status: 'burn', chance: 0.15, durationMs: 3000 }, unlockCost: 5 },
  frozen_tear: { id: 'frozen_tear', name: 'Frozen Tear', desc: 'Hits have a 10% chance to freeze.', rarity: 'rare', onHit: { status: 'freeze', chance: 0.1, durationMs: 1500 }, unlockCost: 6 },
  viper_tooth: { id: 'viper_tooth', name: 'Viper Tooth', desc: 'Hits have a 20% chance to poison.', rarity: 'rare', onHit: { status: 'poison', chance: 0.2, durationMs: 4000 }, unlockCost: 5 },
  thorn_mail: { id: 'thorn_mail', name: 'Thorn Mail', desc: 'Reflect 40% of melee damage taken. +10 max HP.', rarity: 'rare', mods: { thorns: 0.4, maxHp: 10 }, unlockCost: 7 },
  berserker_mask: { id: 'berserker_mask', name: 'Berserker Mask', desc: '+50% damage while below 35% HP.', rarity: 'epic', mods: { lowHpDamagePct: 0.5 }, unlockCost: 10 },
  phoenix_feather: { id: 'phoenix_feather', name: 'Phoenix Feather', desc: 'Once per run, revive with 50% HP.', rarity: 'legendary', mods: { revives: 1 }, hook: 'revive', hookParams: { healFrac: 0.5 }, unlockCost: 25 },
  soul_lantern: { id: 'soul_lantern', name: 'Soul Lantern', desc: 'Heal 4 HP per kill.', rarity: 'rare', mods: { healOnKill: 4 }, unlockCost: 8 },
  magnet_stone: { id: 'magnet_stone', name: 'Magnet Stone', desc: 'Pull coins from afar. +10% coins.', rarity: 'common', mods: { coinPct: 0.1 }, hook: 'coin-magnet', hookParams: { radius: 140 }, unlockCost: 3 },
  merchant_seal: { id: 'merchant_seal', name: 'Merchant Seal', desc: 'Merchants offer 25% discounts.', rarity: 'rare', mods: { shopDiscount: 0.25 }, unlockCost: 6 },
  shadow_cloak: { id: 'shadow_cloak', name: 'Shadow Cloak', desc: 'Dodging releases a shadow burst. -20% dodge cooldown.', rarity: 'epic', mods: { dodgeCooldownPct: 0.2 }, hook: 'dodge-nova', hookParams: { damage: 15, radius: 40 }, unlockCost: 12 },
  glass_cannon: { id: 'glass_cannon', name: 'Glass Cannon', desc: '+45% damage, -30 max HP.', rarity: 'epic', mods: { damagePct: 0.45, maxHp: -30 }, unlockCost: 14 },
};
