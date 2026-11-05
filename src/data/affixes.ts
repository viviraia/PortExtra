import type { AffixDef } from './types';

/**
 * Item affixes. Semantics of a rolled value v:
 *  - `stat`: v is added to that PlayerStats key while the item is equipped.
 *  - `status`: hits with this item apply the status with chance v.
 *  - `itemDamage`: this item's damage is multiplied by (1 + v).
 * Ranges with max <= 1 are fractions shown as percentages; otherwise whole numbers.
 * Relics do not roll affixes (their rarity is fixed by their def).
 */
export const AFFIXES: Record<string, AffixDef> = {
  // ---- prefixes ----
  sharp: { id: 'sharp', label: 'Sharp', position: 'prefix', appliesTo: ['weapon', 'skill'], minRarity: 'rare', desc: '+{v}% item damage', range: [0.1, 0.2], itemDamage: true },
  brutal: { id: 'brutal', label: 'Brutal', position: 'prefix', appliesTo: ['weapon', 'skill'], minRarity: 'epic', desc: '+{v}% item damage', range: [0.22, 0.35], itemDamage: true },
  burning: { id: 'burning', label: 'Burning', position: 'prefix', appliesTo: ['weapon'], minRarity: 'rare', desc: '{v}% chance to burn', range: [0.15, 0.3], status: 'burn' },
  glacial: { id: 'glacial', label: 'Glacial', position: 'prefix', appliesTo: ['weapon'], minRarity: 'rare', desc: '{v}% chance to freeze', range: [0.08, 0.18], status: 'freeze' },
  venomous: { id: 'venomous', label: 'Venomous', position: 'prefix', appliesTo: ['weapon', 'skill'], minRarity: 'rare', desc: '{v}% chance to poison', range: [0.2, 0.35], status: 'poison' },
  serrated: { id: 'serrated', label: 'Serrated', position: 'prefix', appliesTo: ['weapon'], minRarity: 'rare', desc: '{v}% chance to bleed', range: [0.2, 0.35], status: 'bleed' },
  concussive: { id: 'concussive', label: 'Concussive', position: 'prefix', appliesTo: ['weapon', 'skill'], minRarity: 'epic', desc: '{v}% chance to stun', range: [0.08, 0.15], status: 'stun' },
  precise: { id: 'precise', label: 'Precise', position: 'prefix', appliesTo: ['weapon'], minRarity: 'rare', desc: '+{v}% crit chance', range: [0.05, 0.12], stat: 'critChance' },
  vampiric: { id: 'vampiric', label: 'Vampiric', position: 'prefix', appliesTo: ['weapon'], minRarity: 'epic', desc: '+{v}% lifesteal', range: [0.02, 0.05], stat: 'lifesteal' },
  nimble: { id: 'nimble', label: 'Nimble', position: 'prefix', appliesTo: ['weapon', 'skill'], minRarity: 'rare', desc: '+{v}% move speed', range: [0.05, 0.12], stat: 'moveSpeedPct' },
  // ---- suffixes ----
  of_the_bear: { id: 'of_the_bear', label: 'of the Bear', position: 'suffix', appliesTo: ['weapon', 'skill'], minRarity: 'rare', desc: '+{v} max HP', range: [10, 30], stat: 'maxHp' },
  of_fortune: { id: 'of_fortune', label: 'of Fortune', position: 'suffix', appliesTo: ['weapon', 'skill'], minRarity: 'rare', desc: '+{v}% coins', range: [0.1, 0.25], stat: 'coinPct' },
  of_haste: { id: 'of_haste', label: 'of Haste', position: 'suffix', appliesTo: ['weapon', 'skill'], minRarity: 'rare', desc: '-{v}% skill cooldowns', range: [0.08, 0.15], stat: 'skillCooldownPct' },
  of_the_fox: { id: 'of_the_fox', label: 'of the Fox', position: 'suffix', appliesTo: ['weapon', 'skill'], minRarity: 'rare', desc: '-{v}% dodge cooldown', range: [0.1, 0.2], stat: 'dodgeCooldownPct' },
  of_ruin: { id: 'of_ruin', label: 'of Ruin', position: 'suffix', appliesTo: ['weapon'], minRarity: 'epic', desc: '+{v}% crit damage', range: [0.2, 0.5], stat: 'critDamage' },
  of_the_turtle: { id: 'of_the_turtle', label: 'of the Turtle', position: 'suffix', appliesTo: ['weapon', 'skill'], minRarity: 'rare', desc: '+{v}% damage reduction', range: [0.04, 0.1], stat: 'armor' },
  of_embers: { id: 'of_embers', label: 'of Embers', position: 'suffix', appliesTo: ['weapon', 'skill'], minRarity: 'epic', desc: '+{v}% embers', range: [0.1, 0.25], stat: 'emberPct' },
  of_wrath: { id: 'of_wrath', label: 'of Wrath', position: 'suffix', appliesTo: ['weapon', 'skill'], minRarity: 'rare', desc: '+{v}% damage below 35% HP', range: [0.15, 0.3], stat: 'lowHpDamagePct' },
  of_the_reaper: { id: 'of_the_reaper', label: 'of the Reaper', position: 'suffix', appliesTo: ['weapon', 'skill'], minRarity: 'epic', desc: 'Heal {v} HP per kill', range: [2, 5], stat: 'healOnKill' },
  of_might: { id: 'of_might', label: 'of Might', position: 'suffix', appliesTo: ['weapon', 'skill'], minRarity: 'legendary', desc: '+{v}% damage', range: [0.1, 0.2], stat: 'damagePct' },
};

/** Whether a range is displayed/rolled as a fraction (percent) or a whole number. */
export function isPercentRange(range: [number, number]): boolean {
  return range[1] <= 1;
}

export function formatAffixValue(def: AffixDef, value: number): string {
  return isPercentRange(def.range) ? String(Math.round(value * 100)) : String(Math.round(value));
}

export function affixDescription(def: AffixDef, value: number): string {
  return def.desc.replace('{v}', formatAffixValue(def, value));
}
