/**
 * View models for each Sanctum tab: a list of rows + a detail description for
 * the selected row. Phaser-free; SanctumScene renders these.
 */
import { RARITY_COLORS, TRACK_COLORS, UI_COLORS } from '../../art/palette';
import { iconTex } from '../../art/keys';
import { COSMETICS, META_UPGRADES, RELICS, SKILLS, WEAPONS, getItemDef, itemDescription, unlockCostOf } from '../../data';
import type { CosmeticDef, ItemKind, SaveData } from '../../data/types';
import { makeItem } from '../../run/Loot';
import {
  armoryIds, formatDate, formatTime, isUnlocked, isUpgradeMaxed, ownsCosmetic, starterSkillIds, starterWeaponIds, upgradeCost, upgradeLevel,
} from './model';

export type TabId = 'upgrades' | 'armory' | 'loadout' | 'wardrobe' | 'records';
export const TABS: { id: TabId; label: string }[] = [
  { id: 'upgrades', label: 'UPGRADES' },
  { id: 'armory', label: 'ARMORY' },
  { id: 'loadout', label: 'LOADOUT' },
  { id: 'wardrobe', label: 'WARDROBE' },
  { id: 'records', label: 'RECORDS' },
];

export type Currency = 'coins' | 'embers';

export type RowAction =
  | { kind: 'upgrade'; id: string }
  | { kind: 'unlock'; id: string }
  | { kind: 'weapon'; id: string }
  | { kind: 'skill'; id: string | null }
  | { kind: 'cosmetic'; id: string }
  | { kind: 'none' };

export interface DetailButton {
  label: string;
  enabled: boolean;
  /** Price shown inside the button, if any. */
  price?: number;
  currency?: Currency;
}

export interface Detail {
  title: string;
  titleTint?: number;
  icon?: string;
  palette?: CosmeticDef['palette'];
  lines: { text: string; tint?: number }[];
  status?: { text: string; tint: number };
  button?: DetailButton;
}

export interface Row {
  key: string;
  /** Section header (not selectable). */
  header?: string;
  label: string;
  labelTint: number;
  icon?: string;
  /** Dim the icon (locked). */
  iconDim?: boolean;
  swatch?: CosmeticDef['palette'];
  pips?: { level: number; max: number };
  right?: { text: string; tint: number; currency?: Currency };
  /** Records table columns. */
  columns?: { text: string; x: number; tint: number; align?: 'left' | 'right' }[];
  selectable: boolean;
  action: RowAction;
  detail: () => Detail;
}

const T = UI_COLORS;
const KIND_LABEL: Record<ItemKind, string> = { weapon: 'WEAPONS', skill: 'SKILLS', relic: 'RELICS' };

function header(key: string, text: string): Row {
  return { key, header: text, label: text, labelTint: T.dim, selectable: false, action: { kind: 'none' }, detail: () => ({ title: text, lines: [] }) };
}

function itemLines(kind: ItemKind, id: string): { text: string; tint?: number }[] {
  const lines = itemDescription(makeItem(kind, id, 1, 'common')).slice(1);
  return lines.map((t) => ({ text: t }));
}

function itemName(kind: ItemKind, id: string): string {
  return getItemDef(kind, id).name;
}

function itemTint(kind: ItemKind, id: string): number {
  if (kind === 'weapon') return TRACK_COLORS[WEAPONS[id].track];
  if (kind === 'skill') return TRACK_COLORS[SKILLS[id].track];
  return RARITY_COLORS[RELICS[id].rarity];
}

// ---- upgrades -------------------------------------------------------------------

export function upgradeRows(save: SaveData): Row[] {
  return Object.values(META_UPGRADES).map((def) => {
    const lvl = upgradeLevel(save, def.id);
    const maxed = isUpgradeMaxed(save, def.id);
    const cost = upgradeCost(save, def.id);
    const afford = save.coins >= cost;
    return {
      key: `up-${def.id}`,
      label: def.name,
      labelTint: maxed ? T.gold : T.text,
      pips: { level: lvl, max: def.maxLevel },
      right: maxed ? { text: 'MAX', tint: T.gold } : { text: String(cost), tint: afford ? T.gold : T.bad, currency: 'coins' },
      selectable: true,
      action: { kind: 'upgrade', id: def.id },
      detail: () => ({
        title: def.name,
        titleTint: T.gold,
        lines: [
          { text: def.desc },
          { text: `Level ${lvl} / ${def.maxLevel}`, tint: lvl > 0 ? T.good : T.dim },
          ...(maxed ? [] : [{ text: `Next level: ${cost} coins`, tint: afford ? T.text : T.bad }]),
        ],
        status: maxed ? { text: 'MASTERED', tint: T.gold } : undefined,
        button: maxed ? undefined : { label: 'BUY', enabled: afford, price: cost, currency: 'coins' },
      }),
    };
  });
}

// ---- armory ---------------------------------------------------------------------

export function armoryRows(save: SaveData): Row[] {
  const rows: Row[] = [];
  for (const kind of ['weapon', 'skill', 'relic'] as ItemKind[]) {
    const ids = armoryIds(kind);
    const owned = ids.filter((id) => isUnlocked(save, id)).length;
    rows.push(header(`h-${kind}`, `${KIND_LABEL[kind]}  ${owned}/${ids.length}`));
    for (const id of ids) {
      const unlocked = isUnlocked(save, id);
      const cost = unlockCostOf(id);
      const afford = save.embers >= cost;
      rows.push({
        key: `ar-${id}`,
        label: itemName(kind, id),
        labelTint: unlocked ? T.text : T.dim,
        icon: iconTex(id),
        iconDim: !unlocked,
        right: unlocked ? { text: 'OWNED', tint: T.good } : { text: String(cost), tint: afford ? T.ember : T.bad, currency: 'embers' },
        selectable: true,
        action: { kind: 'unlock', id },
        detail: () => {
          const starter = kind === 'weapon' ? WEAPONS[id].starter : kind === 'skill' ? SKILLS[id].starter : false;
          const lines = itemLines(kind, id);
          if (starter) lines.push({ text: 'Can be chosen as a starting ' + kind + '.', tint: T.good });
          return {
            title: itemName(kind, id),
            titleTint: itemTint(kind, id),
            icon: iconTex(id),
            lines,
            status: unlocked ? { text: cost > 0 ? 'BLUEPRINT LEARNED' : 'ALWAYS AVAILABLE', tint: T.good } : undefined,
            button: unlocked ? undefined : { label: 'UNLOCK', enabled: afford, price: cost, currency: 'embers' },
          };
        },
      });
    }
  }
  return rows;
}

// ---- loadout --------------------------------------------------------------------

export function loadoutRows(save: SaveData): Row[] {
  const rows: Row[] = [header('h-w', 'STARTING WEAPON')];
  for (const id of starterWeaponIds()) {
    const unlocked = isUnlocked(save, id);
    const equipped = save.loadout.weapon === id;
    rows.push({
      key: `lw-${id}`,
      label: WEAPONS[id].name,
      labelTint: equipped ? T.gold : unlocked ? T.text : T.dim,
      icon: iconTex(id),
      iconDim: !unlocked,
      right: equipped ? { text: 'EQUIPPED', tint: T.gold } : unlocked ? undefined : { text: 'LOCKED', tint: T.dim },
      selectable: true,
      action: { kind: 'weapon', id },
      detail: () => ({
        title: WEAPONS[id].name,
        titleTint: TRACK_COLORS[WEAPONS[id].track],
        icon: iconTex(id),
        lines: itemLines('weapon', id),
        status: equipped ? { text: 'EQUIPPED', tint: T.gold } : !unlocked ? { text: 'UNLOCK IN THE ARMORY', tint: T.bad } : undefined,
        button: equipped || !unlocked ? undefined : { label: 'EQUIP', enabled: true },
      }),
    });
  }
  rows.push(header('h-s', 'STARTING SKILL'));
  const noneEquipped = save.loadout.skill === null;
  rows.push({
    key: 'ls-none',
    label: 'None',
    labelTint: noneEquipped ? T.gold : T.text,
    right: noneEquipped ? { text: 'EQUIPPED', tint: T.gold } : undefined,
    selectable: true,
    action: { kind: 'skill', id: null },
    detail: () => ({
      title: 'No skill',
      lines: [{ text: 'Start empty-handed and trust the spire to provide.' }],
      status: noneEquipped ? { text: 'EQUIPPED', tint: T.gold } : undefined,
      button: noneEquipped ? undefined : { label: 'EQUIP', enabled: true },
    }),
  });
  for (const id of starterSkillIds()) {
    const unlocked = isUnlocked(save, id);
    const equipped = save.loadout.skill === id;
    rows.push({
      key: `ls-${id}`,
      label: SKILLS[id].name,
      labelTint: equipped ? T.gold : unlocked ? T.text : T.dim,
      icon: iconTex(id),
      iconDim: !unlocked,
      right: equipped ? { text: 'EQUIPPED', tint: T.gold } : unlocked ? undefined : { text: 'LOCKED', tint: T.dim },
      selectable: true,
      action: { kind: 'skill', id },
      detail: () => ({
        title: SKILLS[id].name,
        titleTint: TRACK_COLORS[SKILLS[id].track],
        icon: iconTex(id),
        lines: itemLines('skill', id),
        status: equipped ? { text: 'EQUIPPED', tint: T.gold } : !unlocked ? { text: 'UNLOCK IN THE ARMORY', tint: T.bad } : undefined,
        button: equipped || !unlocked ? undefined : { label: 'EQUIP', enabled: true },
      }),
    });
  }
  return rows;
}

// ---- wardrobe -------------------------------------------------------------------

export function wardrobeRows(save: SaveData): Row[] {
  return Object.values(COSMETICS).map((c) => {
    const owned = ownsCosmetic(save, c.id);
    const worn = save.cosmetics.equipped === c.id;
    const afford = save.coins >= c.cost;
    return {
      key: `wd-${c.id}`,
      label: c.name,
      labelTint: worn ? T.gold : T.text,
      swatch: c.palette,
      right: worn ? { text: 'WORN', tint: T.gold } : owned ? { text: 'OWNED', tint: T.good } : { text: String(c.cost), tint: afford ? T.gold : T.bad, currency: 'coins' },
      selectable: true,
      action: { kind: 'cosmetic', id: c.id },
      detail: () => ({
        title: c.name,
        titleTint: c.palette.trim,
        palette: c.palette,
        lines: [{ text: owned ? 'A garment for the climb. Preview shown on the wanderer.' : 'Preview shown on the wanderer.' }],
        status: worn ? { text: 'WORN', tint: T.gold } : undefined,
        button: worn ? undefined : owned ? { label: 'WEAR', enabled: true } : { label: 'BUY', enabled: afford, price: c.cost, currency: 'coins' },
      }),
    };
  });
}

// ---- records --------------------------------------------------------------------

export const RECORD_COLS = { rank: 4, depth: 24, kills: 66, time: 146 };

export function recordRows(save: SaveData): Row[] {
  const s = save.stats;
  const lifetime = (): { text: string; tint?: number }[] => [
    { text: 'LIFETIME', tint: T.dim },
    { text: `Runs ${s.runs}   Deaths ${s.deaths}` },
    { text: `Deepest floor ${s.deepest}`, tint: T.gold },
    { text: `Kills ${s.totalKills}` },
    { text: `Coins found ${s.totalCoins}` },
    { text: `Guardians slain ${s.bossesKilled}` },
  ];
  const rows: Row[] = [
    {
      ...header('h-r', ''),
      columns: [
        { text: '#', x: RECORD_COLS.rank, tint: T.dim },
        { text: 'DEPTH', x: RECORD_COLS.depth, tint: T.dim },
        { text: 'KILLS', x: RECORD_COLS.kills, tint: T.dim },
        { text: 'TIME', x: RECORD_COLS.time, tint: T.dim, align: 'right' },
      ],
    },
  ];
  if (!save.history.length) {
    rows.push({
      key: 'r-empty',
      label: 'No climbs recorded yet.',
      labelTint: T.dim,
      selectable: true,
      action: { kind: 'none' },
      detail: () => ({ title: 'Records', titleTint: T.gold, lines: [{ text: 'Your deepest descents will be carved here.' }, { text: '' }, ...lifetime()] }),
    });
    return rows;
  }
  save.history.forEach((r, i) => {
    const tint = i === 0 ? T.gold : T.text;
    const weapon = WEAPONS[r.weapon]?.name ?? r.weapon ?? '-';
    rows.push({
      key: `r-${i}`,
      label: '',
      labelTint: tint,
      columns: [
        { text: `${i + 1}`, x: RECORD_COLS.rank, tint: i === 0 ? T.gold : T.dim },
        { text: `F${r.depth}`, x: RECORD_COLS.depth, tint },
        { text: `${r.kills}`, x: RECORD_COLS.kills, tint },
        { text: formatTime(r.timeMs), x: RECORD_COLS.time, tint: T.dim, align: 'right' },
      ],
      selectable: true,
      action: { kind: 'none' },
      detail: () => ({
        title: `Rank #${i + 1}`,
        titleTint: tint,
        lines: [
          { text: `Reached floor ${r.depth}`, tint: T.gold },
          { text: `${r.kills} kills in ${formatTime(r.timeMs)}` },
          { text: `Wielding ${weapon}` },
          { text: `Fell to ${r.cause || 'unknown'}`, tint: T.bad },
          { text: formatDate(r.date), tint: T.dim },
          { text: '' },
          ...lifetime(),
        ],
      }),
    });
  });
  return rows;
}

export function rowsFor(tab: TabId, save: SaveData): Row[] {
  switch (tab) {
    case 'upgrades':
      return upgradeRows(save);
    case 'armory':
      return armoryRows(save);
    case 'loadout':
      return loadoutRows(save);
    case 'wardrobe':
      return wardrobeRows(save);
    case 'records':
      return recordRows(save);
  }
}
