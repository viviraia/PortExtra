import { itemDamageMult } from '../combat/damage';
import { AFFIXES, affixDescription } from './affixes';
import { RARITY_INFO } from './rarity';
import { RELICS } from './relics';
import { SKILLS } from './skills';
import type { ItemInstance, ItemKind, RelicDef, SkillDef, WeaponDef } from './types';
import { WEAPONS } from './weapons';

export * from './affixes';
export * from './biomes';
export * from './bosses';
export * from './enemies';
export * from './meta';
export * from './rarity';
export * from './relics';
export * from './skills';
export * from './weapons';

export type ItemDefOf<K extends ItemKind> = K extends 'weapon' ? WeaponDef : K extends 'skill' ? SkillDef : RelicDef;

export function getItemDef<K extends ItemKind>(kind: K, id: string): ItemDefOf<K> {
  const table = (kind === 'weapon' ? WEAPONS : kind === 'skill' ? SKILLS : RELICS) as Record<string, ItemDefOf<K>>;
  const def = table[id];
  if (!def) throw new Error(`Unknown ${kind} id: ${id}`);
  return def;
}

/** Kind of an item id, or null if unknown. */
export function kindOfId(id: string): ItemKind | null {
  if (WEAPONS[id]) return 'weapon';
  if (SKILLS[id]) return 'skill';
  if (RELICS[id]) return 'relic';
  return null;
}

export function allIds(kind: ItemKind): string[] {
  return Object.keys(kind === 'weapon' ? WEAPONS : kind === 'skill' ? SKILLS : RELICS);
}

/** Unlock cost in embers for any item id (0 = unlocked by default). */
export function unlockCostOf(id: string): number {
  return (WEAPONS[id] ?? SKILLS[id] ?? RELICS[id])?.unlockCost ?? 0;
}

/** e.g. "Burning Rusty Sword of Haste". Rarity is conveyed by color (RARITY_INFO[r].color). */
export function itemDisplayName(inst: ItemInstance): string {
  const base = getItemDef(inst.kind, inst.defId).name;
  const pre: string[] = [];
  const suf: string[] = [];
  for (const a of inst.affixes) {
    const def = AFFIXES[a.id];
    if (!def) continue;
    (def.position === 'prefix' ? pre : suf).push(def.label);
  }
  return [...pre.slice(0, 1), base, ...suf.slice(0, 1)].join(' ');
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const secs = (ms: number) => `${(ms / 1000).toFixed(ms % 1000 === 0 ? 0 : 1)}s`;

/** Tooltip lines: rarity/level, damage numbers at this item level (no scrolls), description, affixes. */
export function itemDescription(inst: ItemInstance): string[] {
  const lines: string[] = [];
  const m = itemDamageMult(inst);
  const d = (base: number, mult = 1) => Math.max(1, Math.round(base * mult * m));
  lines.push(`${RARITY_INFO[inst.rarity].label} ${inst.kind} - Lv ${inst.level}`);
  if (inst.kind === 'weapon') {
    const w = WEAPONS[inst.defId];
    lines.push(`Scales with ${w.track.toUpperCase()}`);
    if (w.melee) lines.push(`Damage: ${w.melee.combo.map((s) => d(w.baseDamage, s.dmg)).join(' / ')}`);
    if (w.ranged) {
      const n = w.ranged.count ?? 1;
      lines.push(`Damage: ${d(w.baseDamage, w.ranged.dmg)}${n > 1 ? ` x${n}` : ''} per shot`);
      if (w.ranged.chargeMs) lines.push(`Charged: ${d(w.baseDamage, w.ranged.dmg * 2)}`);
    }
    if (w.shield) {
      lines.push(`Blocks ${pct(w.shield.block)} - Bash ${d(w.baseDamage, w.shield.bash.dmg)}`);
      lines.push(`Parry riposte: ${d(w.baseDamage, w.shield.parryDmg)}`);
    }
    lines.push(w.desc);
    if (w.onHit) lines.push(`${pct(w.onHit.chance)} chance to ${w.onHit.status}`);
  } else if (inst.kind === 'skill') {
    const s = SKILLS[inst.defId];
    lines.push(`Scales with ${s.track.toUpperCase()} - Cooldown ${secs(s.cooldownMs)}`);
    if (s.damage > 0) lines.push(`Damage: ${d(s.damage)}`);
    lines.push(s.desc);
  } else {
    const r = RELICS[inst.defId];
    lines.push(r.desc);
  }
  for (const a of inst.affixes) {
    const def = AFFIXES[a.id];
    if (def) lines.push(`* ${affixDescription(def, a.value)}`);
  }
  return lines;
}
