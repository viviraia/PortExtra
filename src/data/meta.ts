import type { CosmeticDef, MetaUpgradeDef } from './types';

/**
 * Permanent Sanctum upgrades bought with coins. Tier costs grow ×2.75 per
 * level: first tiers (200–450) come within the first few runs, while maxing
 * everything (~115k coins) is a 40+ run goal. See src/run/balanceModel.ts.
 */
export const META_UPGRADES: Record<string, MetaUpgradeDef> = {
  vitality: { id: 'vitality', name: 'Vitality', desc: '+15 max HP per level.', maxLevel: 5, costs: [200, 550, 1500, 4200, 11500], perLevel: { maxHp: 15 } },
  strength: { id: 'strength', name: 'Strength', desc: '+6% damage per level.', maxLevel: 5, costs: [250, 700, 1900, 5200, 14500], perLevel: { damagePct: 0.06 } },
  flask: { id: 'flask', name: 'Deep Flask', desc: '+1 potion charge per level.', maxLevel: 2, costs: [450, 1250], perLevel: { potionCharges: 1 } },
  potency: { id: 'potency', name: 'Potency', desc: 'Potions heal +8% max HP per level.', maxLevel: 3, costs: [250, 700, 1900], perLevel: { potionHeal: 0.08 } },
  purse: { id: 'purse', name: 'Inheritance', desc: 'Start each run with +20 coins per level.', maxLevel: 3, costs: [300, 800, 2300], perLevel: { startingCoins: 20 } },
  greed: { id: 'greed', name: 'Greed', desc: '+8% coins per level.', maxLevel: 5, costs: [200, 550, 1500, 4200, 11500], perLevel: { coinPct: 0.08 } },
  toughness: { id: 'toughness', name: 'Toughness', desc: '+3% damage reduction per level.', maxLevel: 5, costs: [300, 800, 2300, 6200, 17000], perLevel: { armor: 0.03 } },
  precision: { id: 'precision', name: 'Precision', desc: '+3% crit chance per level.', maxLevel: 4, costs: [250, 700, 1900, 5200], perLevel: { critChance: 0.03 } },
  kindling: { id: 'kindling', name: 'Kindling', desc: '+10% embers per level.', maxLevel: 3, costs: [350, 950, 2600], perLevel: { emberPct: 0.1 } },
  agility: { id: 'agility', name: 'Agility', desc: '-6% dodge cooldown per level.', maxLevel: 3, costs: [200, 550, 1500], perLevel: { dodgeCooldownPct: 0.06 } },
  focus: { id: 'focus', name: 'Focus', desc: '-5% skill cooldowns per level.', maxLevel: 3, costs: [300, 800, 2300], perLevel: { skillCooldownPct: 0.05 } },
};

/** Player palette swaps bought in the Wardrobe. */
export const COSMETICS: Record<string, CosmeticDef> = {
  default: { id: 'default', name: 'Wanderer', cost: 0, palette: { cloak: 0x3b4a6b, trim: 0xc9a227, skin: 0xe0b48a, eyes: 0x9fe8ff } },
  crimson: { id: 'crimson', name: 'Crimson Oath', cost: 300, palette: { cloak: 0x8a1f2b, trim: 0xe0c060, skin: 0xe0b48a, eyes: 0xffd27a } },
  verdant: { id: 'verdant', name: 'Verdant Hood', cost: 300, palette: { cloak: 0x2f6b3a, trim: 0xb08a4a, skin: 0xd8a878, eyes: 0xb6ff8a } },
  azure: { id: 'azure', name: 'Azure Knight', cost: 400, palette: { cloak: 0x2a5fb0, trim: 0xd8e0f0, skin: 0xe8c09a, eyes: 0x7ad0ff } },
  ivory: { id: 'ivory', name: 'Ivory Pilgrim', cost: 600, palette: { cloak: 0xd8d0b8, trim: 0x8a6a3a, skin: 0xc89a70, eyes: 0x4a8aff } },
  frost: { id: 'frost', name: 'Rimeborn', cost: 700, palette: { cloak: 0x9fd8f0, trim: 0x3a6a9a, skin: 0xd8e8f0, eyes: 0xffffff } },
  shadow: { id: 'shadow', name: 'Shadow Walker', cost: 800, palette: { cloak: 0x1a1824, trim: 0x6a3aa0, skin: 0x8a7a9a, eyes: 0xff3a6a } },
  ember: { id: 'ember', name: 'Emberheart', cost: 1000, palette: { cloak: 0xc04a10, trim: 0xffd040, skin: 0xe0a070, eyes: 0xfff0a0 } },
  gilded: { id: 'gilded', name: 'Gilded Regent', cost: 1500, palette: { cloak: 0xd0a020, trim: 0xfff0b0, skin: 0xe8c09a, eyes: 0x40e0a0 } },
};
