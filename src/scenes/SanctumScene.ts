/**
 * The Sanctum: the hub between runs. Spend coins on permanent upgrades and
 * cosmetics, embers on blueprint unlocks, pick a starting loadout, review
 * past climbs, then DESCEND.
 *
 * Input: keyboard (arrows/WASD, Enter/Space/F/J confirm, Esc/K back,
 * Q/E/Tab switch tabs), mouse (hover, click, wheel), touch (tap, drag-scroll).
 */
import Phaser from 'phaser';
import { FX, OBJ, UI } from '../art/keys';
import { UI_COLORS } from '../art/palette';
import { rebuildPlayerTexture } from '../art/TextureFactory';
import { audio } from '../core/audio';
import { input } from '../core/input/InputManager';
import { saves } from '../core/save';
import { COSMETICS } from '../data';
import { GAME_H, GAME_W } from '../config';
import { Juice } from '../combat/juice';
import { RunState } from '../run/RunState';
import { session } from '../run/session';
import { buildBackdrop, BRAZIER_X, FLOOR_Y, type Backdrop } from '../ui/sanctum/backdrop';
import {
  bestDepth, buyCosmetic, buyUpgrade, equipCosmetic, failureText, setLoadoutSkill, setLoadoutWeapon, unlockItem, validateLoadout, type MetaResult,
} from '../ui/sanctum/model';
import { rowsFor, TABS, type Detail, type Row, type TabId } from '../ui/sanctum/tabs';

const C = UI_COLORS;

// Layout (game pixels)
const PANEL = { x: 170, y: 22, w: 304, h: 224 };
const TAB_Y = PANEL.y + 3;
const TAB_H = 15;
const LIST = { x: PANEL.x + 4, y: PANEL.y + 22, w: 152, h: PANEL.h - 26 };
const ROW_H = 18;
const DETAIL = { x: LIST.x + LIST.w + 6, y: LIST.y, w: PANEL.x + PANEL.w - (LIST.x + LIST.w + 6) - 4, h: LIST.h };
const DESCEND = { x: 14, y: 240, w: 140, h: 24 };
const BTN = { h: 18 };

type Focus = 'list' | 'descend';

export class SanctumScene extends Phaser.Scene {
  private tab: TabId = 'upgrades';
  private rows: Row[] = [];
  private sel = -1;
  private scrollY = 0;
  private scrollTarget = 0;
  private focus: Focus = 'descend';
  private leaving = false;

  private juice!: Juice;
  private backdrop!: Backdrop;
  private listC!: Phaser.GameObjects.Container;
  private listMaskG!: Phaser.GameObjects.Graphics;
  private selG!: Phaser.GameObjects.Graphics;
  private scrollG!: Phaser.GameObjects.Graphics;
  private detailC!: Phaser.GameObjects.Container;
  private tabObjs: { bg: Phaser.GameObjects.Rectangle; text: Phaser.GameObjects.BitmapText; id: TabId; x: number; w: number }[] = [];
  private coinText!: Phaser.GameObjects.BitmapText;
  private emberText!: Phaser.GameObjects.BitmapText;
  private bestText!: Phaser.GameObjects.BitmapText;
  private coinIcon!: Phaser.GameObjects.Image;
  private emberIcon!: Phaser.GameObjects.Image;
  private hint!: Phaser.GameObjects.BitmapText;
  private descendG!: Phaser.GameObjects.Graphics;
  private descendText!: Phaser.GameObjects.BitmapText;
  private descendGlow: Phaser.GameObjects.Image | null = null;
  private detailBtn: { x: number; y: number; w: number; h: number; enabled: boolean } | null = null;
  private previewId: string | null = null;

  // pointer state
  private drag: { startY: number; startScroll: number; moved: boolean; inList: boolean } | null = null;
  private lastPointer = { x: -1, y: -1 };

  constructor() {
    super('Sanctum');
  }

  create(): void {
    this.leaving = false;
    this.tab = 'upgrades';
    this.focus = 'descend';
    this.sel = -1;
    this.scrollY = this.scrollTarget = 0;
    this.previewId = null;
    this.tabObjs = [];
    input.attach(this.game);
    input.releaseAll();

    if (validateLoadout(saves.data)) saves.save();
    this.applyPalette(saves.data.cosmetics.equipped);

    audio.music('sanctum');
    this.juice = new Juice(this);
    this.backdrop = buildBackdrop(this);
    this.buildHeader();
    this.buildPanel();
    this.buildDescend();
    this.hint = this.add.bitmapText(PANEL.x + PANEL.w / 2, GAME_H - 13, UI.font, '').setOrigin(0.5, 0).setTint(C.dim).setDepth(20);

    this.setTab('upgrades', false);
    this.setupPointer();
    this.input.keyboard?.on('keydown-TAB', (e: KeyboardEvent) => {
      e.preventDefault?.();
      this.cycleTab(e.shiftKey ? -1 : 1);
    });
    this.cameras.main.fadeIn(400, 0, 0, 0);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input.keyboard?.off('keydown-TAB'));
  }

  // ---------------------------------------------------------------------------
  // Construction
  // ---------------------------------------------------------------------------

  private buildHeader(): void {
    const g = this.add.graphics().setDepth(10);
    g.fillStyle(0x07060c, 0.85).fillRect(0, 0, GAME_W, 18);
    g.fillStyle(C.panelEdge, 1).fillRect(0, 18, GAME_W, 1);
    g.fillStyle(0x000000, 0.5).fillRect(0, 19, GAME_W, 1);
    this.add.bitmapText(8, 5, UI.font, 'THE SANCTUM').setTint(C.gold).setDepth(11);

    this.bestText = this.add.bitmapText(GAME_W - 8, 5, UI.font, '').setOrigin(1, 0).setTint(C.text).setDepth(11);
    this.emberText = this.add.bitmapText(0, 5, UI.font, '').setOrigin(1, 0).setTint(C.ember).setDepth(11);
    this.emberIcon = this.add.image(0, 9, OBJ.ember, 0).setDepth(11);
    this.coinText = this.add.bitmapText(0, 5, UI.font, '').setOrigin(1, 0).setTint(C.gold).setDepth(11);
    this.coinIcon = this.add.image(0, 9, OBJ.coin, 0).setDepth(11);
    this.refreshWallet();
  }

  private refreshWallet(): void {
    const d = saves.data;
    this.coinText.setText(String(d.coins));
    this.emberText.setText(String(d.embers));
    const best = bestDepth(d);
    this.bestText.setText(best > 0 ? `BEST F${best}` : `BEST -`);
    // Lay out right-to-left: [coin] 123   [ember] 45   BEST F12
    let x = this.bestText.x - this.bestText.width - 14;
    this.emberText.setX(x);
    this.emberIcon.setX(x - this.emberText.width - 7);
    x = this.emberIcon.x - 14;
    this.coinText.setX(x);
    this.coinIcon.setX(x - this.coinText.width - 7);
  }

  private buildPanel(): void {
    const g = this.add.graphics().setDepth(5);
    // Drop shadow, body, 1px edge with inner highlight
    g.fillStyle(0x000000, 0.45).fillRect(PANEL.x + 2, PANEL.y + 2, PANEL.w, PANEL.h);
    g.fillStyle(C.panel, 0.94).fillRect(PANEL.x, PANEL.y, PANEL.w, PANEL.h);
    g.lineStyle(1, C.panelEdge, 1).strokeRect(PANEL.x + 0.5, PANEL.y + 0.5, PANEL.w - 1, PANEL.h - 1);
    g.lineStyle(1, 0x2a2438, 1).strokeRect(PANEL.x + 1.5, PANEL.y + 1.5, PANEL.w - 3, PANEL.h - 3);
    // Tab underline
    g.fillStyle(C.panelEdge, 1).fillRect(PANEL.x + 2, TAB_Y + TAB_H + 1, PANEL.w - 4, 1);
    // List / detail wells
    g.fillStyle(0x0c0a14, 1).fillRect(LIST.x, LIST.y, LIST.w, LIST.h);
    g.fillStyle(0x0c0a14, 1).fillRect(DETAIL.x, DETAIL.y, DETAIL.w, DETAIL.h);
    g.lineStyle(1, 0x2a2438, 1).strokeRect(LIST.x - 0.5, LIST.y - 0.5, LIST.w + 1, LIST.h + 1);
    g.lineStyle(1, 0x2a2438, 1).strokeRect(DETAIL.x - 0.5, DETAIL.y - 0.5, DETAIL.w + 1, DETAIL.h + 1);
    // Corner studs
    g.fillStyle(C.gold, 1);
    for (const [cx, cy] of [[PANEL.x, PANEL.y], [PANEL.x + PANEL.w - 2, PANEL.y], [PANEL.x, PANEL.y + PANEL.h - 2], [PANEL.x + PANEL.w - 2, PANEL.y + PANEL.h - 2]]) g.fillRect(cx, cy, 2, 2);

    // Tabs
    const tw = Math.floor((PANEL.w - 6) / TABS.length);
    TABS.forEach((t, i) => {
      const x = PANEL.x + 3 + i * tw;
      const bg = this.add.rectangle(x, TAB_Y, tw - 2, TAB_H, 0x000000, 0).setOrigin(0).setDepth(6);
      const text = this.add.bitmapText(x + (tw - 2) / 2, TAB_Y + 4, UI.font, t.label).setOrigin(0.5, 0).setDepth(7);
      this.tabObjs.push({ bg, text, id: t.id, x, w: tw - 2 });
    });

    this.selG = this.add.graphics().setDepth(7);
    this.listC = this.add.container(LIST.x, LIST.y).setDepth(8);
    this.listMaskG = this.make.graphics({}, false);
    this.listMaskG.fillStyle(0xffffff).fillRect(LIST.x, LIST.y, LIST.w, LIST.h);
    const mask = this.listMaskG.createGeometryMask();
    this.listC.setMask(mask);
    this.selG.setMask(mask);
    this.scrollG = this.add.graphics().setDepth(9);
    this.detailC = this.add.container(DETAIL.x, DETAIL.y).setDepth(8);
  }

  private buildDescend(): void {
    if (this.textures.exists(FX.glow)) {
      this.descendGlow = this.add.image(DESCEND.x + DESCEND.w / 2, DESCEND.y + DESCEND.h / 2, FX.glow).setBlendMode(Phaser.BlendModes.ADD).setTint(0xff7a2a).setScale(2.6, 0.7).setAlpha(0.3).setDepth(11);
    }
    this.descendG = this.add.graphics().setDepth(12);
    this.descendText = this.add.bitmapText(DESCEND.x + DESCEND.w / 2, DESCEND.y + 8, UI.font, 'DESCEND').setOrigin(0.5, 0).setDepth(13);
    this.drawDescend();
  }

  private drawDescend(): void {
    const f = this.focus === 'descend';
    const g = this.descendG.clear();
    const { x, y, w, h } = DESCEND;
    g.fillStyle(0x000000, 0.5).fillRect(x + 2, y + 2, w, h);
    g.fillStyle(f ? 0x3a1a10 : 0x1a1210, 1).fillRect(x, y, w, h);
    g.lineStyle(1, f ? C.ember : 0x6a4030, 1).strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    g.lineStyle(1, f ? 0xffb070 : 0x3a2820, 1).strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
    // arrow glyphs
    g.fillStyle(f ? C.gold : C.dim, 1);
    for (const ax of [x + 14, x + w - 18]) {
      g.fillTriangle(ax, y + 9, ax + 5, y + 9, ax + 2.5, y + 15);
    }
    this.descendText.setTint(f ? C.gold : C.text);
  }

  // ---------------------------------------------------------------------------
  // Tabs & rows
  // ---------------------------------------------------------------------------

  private setTab(id: TabId, sfx = true): void {
    if (sfx && id !== this.tab) audio.sfx('uiMove');
    this.tab = id;
    this.tabObjs.forEach((t) => {
      const active = t.id === id;
      t.bg.setFillStyle(active ? 0x2a2040 : 0x000000, active ? 1 : 0);
      t.text.setTint(active ? C.gold : C.dim);
    });
    this.rows = rowsFor(id, saves.data);
    this.sel = this.firstSelectable();
    this.scrollY = this.scrollTarget = 0;
    this.renderRows();
    this.onSelectionChanged(false);
  }

  private cycleTab(dir: number): void {
    const i = TABS.findIndex((t) => t.id === this.tab);
    this.setTab(TABS[(i + dir + TABS.length) % TABS.length].id);
  }

  private firstSelectable(): number {
    return this.rows.findIndex((r) => r.selectable);
  }

  /** Rebuild row contents (after data changes) keeping selection. */
  private refreshRows(): void {
    const key = this.rows[this.sel]?.key;
    this.rows = rowsFor(this.tab, saves.data);
    const idx = this.rows.findIndex((r) => r.key === key);
    this.sel = idx >= 0 ? idx : this.firstSelectable();
    this.renderRows();
    this.renderDetail();
    this.refreshWallet();
  }

  private renderRows(): void {
    this.listC.removeAll(true);
    this.rows.forEach((r, i) => {
      const y = i * ROW_H;
      if (r.header !== undefined) {
        if (r.header) {
          this.listC.add(this.add.bitmapText(4, y + 6, UI.font, r.header).setTint(C.dim));
          const line = this.add.rectangle(4, y + 16, LIST.w - 8, 1, C.panelEdge, 0.6).setOrigin(0);
          this.listC.add(line);
        }
        if (r.columns) this.addColumns(r, y);
        return;
      }
      let x = 4;
      if (r.icon && this.textures.exists(r.icon)) {
        const icon = this.add.image(x + 8, y + ROW_H / 2, r.icon).setAlpha(r.iconDim ? 0.35 : 1);
        if (r.iconDim) icon.setTint(0x6a6478);
        this.listC.add(icon);
        x += 20;
      }
      if (r.swatch) {
        const p = r.swatch;
        [p.cloak, p.trim, p.skin, p.eyes].forEach((c, k) => {
          this.listC.add(this.add.rectangle(x + k * 4, y + 5, 4, 8, c).setOrigin(0));
        });
        this.listC.add(this.add.rectangle(x - 1, y + 4, 18, 10).setOrigin(0).setStrokeStyle(1, 0x000000));
        x += 22;
      }
      if (r.columns) {
        this.addColumns(r, y);
      } else {
        const rightW = r.right ? measure(this, r.right.text) + (r.right.currency ? 10 : 0) + 6 : 0;
        const maxW = LIST.w - x - rightW - 4;
        const ty = r.pips ? y + 2 : y + 5;
        const label = this.add.bitmapText(x, ty, UI.font, r.label).setTint(r.labelTint);
        fitText(label, r.label, maxW);
        this.listC.add(label);
      }
      if (r.pips) {
        for (let k = 0; k < r.pips.max; k++) {
          const filled = k < r.pips.level;
          this.listC.add(this.add.rectangle(x + k * 6, y + 12, 4, 3, filled ? C.gold : 0x2a2438).setOrigin(0));
        }
      }
      if (r.right) {
        const rx = LIST.w - 4;
        const t = this.add.bitmapText(rx, y + 5, UI.font, r.right.text).setOrigin(1, 0).setTint(r.right.tint);
        this.listC.add(t);
        if (r.right.currency) {
          const key = r.right.currency === 'coins' ? OBJ.coin : OBJ.ember;
          this.listC.add(this.add.image(rx - t.width - 6, y + ROW_H / 2, key, 0));
        }
      }
    });
    this.drawSelection();
  }

  private addColumns(r: Row, y: number): void {
    for (const c of r.columns ?? []) {
      const t = this.add.bitmapText(c.x, y + 5, UI.font, c.text).setTint(c.tint);
      if (c.align === 'right') t.setOrigin(1, 0);
      this.listC.add(t);
    }
    if (!r.columns?.length && r.label) this.listC.add(this.add.bitmapText(4, y + 5, UI.font, r.label).setTint(r.labelTint));
  }

  private get contentH(): number {
    return this.rows.length * ROW_H;
  }

  private get maxScroll(): number {
    return Math.max(0, this.contentH - LIST.h);
  }

  private drawSelection(): void {
    const g = this.selG.clear();
    if (this.sel >= 0 && this.rows[this.sel]) {
      const y = LIST.y + this.sel * ROW_H - Math.round(this.scrollY);
      const active = this.focus === 'list';
      g.fillStyle(active ? 0x2c2244 : 0x1c1828, 1).fillRect(LIST.x, y, LIST.w, ROW_H);
      g.fillStyle(active ? C.gold : C.panelEdge, 1).fillRect(LIST.x, y, 2, ROW_H);
      if (active) {
        g.lineStyle(1, 0x5a4a80, 1).strokeRect(LIST.x + 0.5, y + 0.5, LIST.w - 1, ROW_H - 1);
      }
    }
    // Scrollbar
    const s = this.scrollG.clear();
    if (this.maxScroll > 0) {
      const trackX = LIST.x + LIST.w - 2;
      s.fillStyle(0x1a1626, 1).fillRect(trackX, LIST.y, 2, LIST.h);
      const thumbH = Math.max(12, (LIST.h * LIST.h) / this.contentH);
      const ty = LIST.y + ((LIST.h - thumbH) * this.scrollY) / this.maxScroll;
      s.fillStyle(C.panelEdge, 1).fillRect(trackX, Math.round(ty), 2, Math.round(thumbH));
    }
  }

  private select(i: number, sfx = true): void {
    if (i === this.sel || !this.rows[i]?.selectable) return;
    this.sel = i;
    if (sfx) audio.sfx('uiMove', { volume: 0.5 });
    this.ensureVisible();
    this.onSelectionChanged(true);
  }

  private moveSel(dir: number): void {
    let i = this.sel;
    for (let n = 0; n < this.rows.length; n++) {
      i += dir;
      if (i < 0 || i >= this.rows.length) {
        if (dir > 0) this.setFocus('descend');
        return;
      }
      if (this.rows[i].selectable) {
        this.select(i);
        return;
      }
    }
  }

  private ensureVisible(): void {
    const top = this.sel * ROW_H;
    // Include a preceding header in view when scrolling up.
    const headerAbove = this.sel > 0 && !this.rows[this.sel - 1].selectable ? ROW_H : 0;
    if (top - headerAbove < this.scrollTarget) this.scrollTarget = top - headerAbove;
    if (top + ROW_H > this.scrollTarget + LIST.h) this.scrollTarget = top + ROW_H - LIST.h;
    this.scrollTarget = Phaser.Math.Clamp(this.scrollTarget, 0, this.maxScroll);
  }

  private onSelectionChanged(_userAction: boolean): void {
    this.drawSelection();
    this.renderDetail();
    // Wardrobe live preview
    const row = this.rows[this.sel];
    if (this.tab === 'wardrobe' && row?.action.kind === 'cosmetic') this.applyPalette(row.action.id);
    else this.applyPalette(saves.data.cosmetics.equipped);
    this.updateHint();
  }

  private applyPalette(id: string): void {
    if (this.previewId === id) return;
    const c = COSMETICS[id] ?? COSMETICS.default;
    this.previewId = id;
    rebuildPlayerTexture(this, c.palette);
  }

  // ---------------------------------------------------------------------------
  // Detail pane
  // ---------------------------------------------------------------------------

  private renderDetail(): void {
    this.detailC.removeAll(true);
    this.detailBtn = null;
    const row = this.rows[this.sel];
    if (!row) return;
    const d: Detail = row.detail();
    const pad = 5;
    let y = pad;
    const W = DETAIL.w - pad * 2;
    if (d.icon && this.textures.exists(d.icon)) {
      this.detailC.add(this.add.rectangle(pad, y, 36, 36, 0x16121f).setOrigin(0).setStrokeStyle(1, 0x3a3048));
      this.detailC.add(this.add.image(pad + 18, y + 18, d.icon).setScale(2));
      const t = this.add.bitmapText(pad + 42, y + 4, UI.font, d.title).setTint(d.titleTint ?? C.text).setMaxWidth(W - 42);
      this.detailC.add(t);
      y += 42;
    } else if (d.palette) {
      const p = d.palette;
      this.detailC.add(this.add.bitmapText(pad, y, UI.font, d.title).setTint(d.titleTint ?? C.text).setMaxWidth(W));
      y += 13;
      [p.cloak, p.trim, p.skin, p.eyes].forEach((c, k) => {
        this.detailC.add(this.add.rectangle(pad + k * 14, y, 12, 12, c).setOrigin(0).setStrokeStyle(1, 0x000000));
      });
      y += 18;
    } else {
      const t = this.add.bitmapText(pad, y, UI.font, d.title).setTint(d.titleTint ?? C.text).setMaxWidth(W);
      this.detailC.add(t);
      y += t.height + 5;
    }
    this.detailC.add(this.add.rectangle(pad, y - 2, W, 1, C.panelEdge, 0.6).setOrigin(0));
    y += 2;
    const bottomReserve = d.button || d.status ? BTN.h + 8 : 0;
    for (const line of d.lines) {
      if (y > DETAIL.h - bottomReserve - 10) break;
      if (!line.text) {
        y += 5;
        continue;
      }
      const t = this.add.bitmapText(pad, y, UI.font, line.text).setTint(line.tint ?? C.text).setMaxWidth(W);
      this.detailC.add(t);
      y += t.height + 3;
    }
    const by = DETAIL.h - BTN.h - pad;
    if (d.button) {
      const b = d.button;
      const bw = W;
      const g = this.add.graphics();
      const col = b.enabled ? (b.currency === 'embers' ? 0x4a2010 : 0x3a3010) : 0x1c1820;
      g.fillStyle(col, 1).fillRect(pad, by, bw, BTN.h);
      g.lineStyle(1, b.enabled ? (b.currency === 'embers' ? C.ember : C.gold) : 0x3a3048, 1).strokeRect(pad + 0.5, by + 0.5, bw - 1, BTN.h - 1);
      this.detailC.add(g);
      const label = b.price !== undefined ? `${b.label}  ${b.price}` : b.label;
      const t = this.add.bitmapText(pad + bw / 2, by + 5, UI.font, label).setOrigin(0.5, 0).setTint(b.enabled ? C.text : C.dim);
      this.detailC.add(t);
      if (b.price !== undefined && b.currency) {
        this.detailC.add(this.add.image(t.x + t.width / 2 + 7, by + BTN.h / 2, b.currency === 'coins' ? OBJ.coin : OBJ.ember, 0));
      }
      this.detailBtn = { x: DETAIL.x + pad, y: DETAIL.y + by, w: bw, h: BTN.h, enabled: b.enabled };
    } else if (d.status) {
      const t = this.add.bitmapText(pad + W / 2, by + 5, UI.font, d.status.text).setOrigin(0.5, 0).setTint(d.status.tint);
      this.detailC.add(t);
    }
  }

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  private activate(): void {
    const row = this.rows[this.sel];
    if (!row) return;
    const a = row.action;
    const save = saves.data;
    let res: MetaResult | null = null;
    let currency: 'coins' | 'embers' = 'coins';
    let kind: 'buy' | 'unlock' | 'equip' = 'buy';
    switch (a.kind) {
      case 'upgrade':
        res = buyUpgrade(save, a.id);
        break;
      case 'unlock':
        currency = 'embers';
        kind = 'unlock';
        res = unlockItem(save, a.id);
        if (!res.ok && res.reason === 'owned') return;
        break;
      case 'weapon':
        kind = 'equip';
        if (save.loadout.weapon === a.id) return;
        res = setLoadoutWeapon(save, a.id);
        break;
      case 'skill':
        kind = 'equip';
        if (save.loadout.skill === a.id) return;
        res = setLoadoutSkill(save, a.id);
        break;
      case 'cosmetic': {
        if (save.cosmetics.equipped === a.id) return;
        const owned = save.cosmetics.owned.includes(a.id) || a.id === 'default';
        if (owned) {
          kind = 'equip';
          res = equipCosmetic(save, a.id);
        } else {
          res = buyCosmetic(save, a.id);
          if (res.ok) equipCosmetic(save, a.id);
        }
        break;
      }
      default:
        return;
    }
    if (!res) return;
    const rowY = LIST.y + this.sel * ROW_H - this.scrollY + ROW_H / 2;
    if (res.ok) {
      saves.save();
      audio.sfx(kind === 'unlock' ? 'unlock' : kind === 'equip' ? 'uiSelect' : 'buy');
      if (kind !== 'equip') {
        const tint = currency === 'embers' ? [0xff7a2a, 0xffd080] : [0xffd24a, 0xfff0b0];
        this.juice.burst(LIST.x + LIST.w / 2, rowY, { count: 22, tint, speed: [40, 140], gravity: 120, blendAdd: true, depth: 30, life: [300, 700] });
        this.juice.burst(BRAZIER_X, FLOOR_Y - 30, { count: 14, tint: [0xffb050, 0xff7a2a], speed: [30, 90], angle: [240, 300], gravity: -40, blendAdd: true, depth: 30, life: [400, 900] });
        this.punch(currency === 'coins' ? this.coinText : this.emberText);
      }
      this.flashRow(rowY, kind === 'equip' ? C.good : currency === 'embers' ? C.ember : C.gold);
      this.refreshRows();
      if (this.tab === 'wardrobe') {
        this.previewId = null;
        this.onSelectionChanged(true);
      }
    } else {
      audio.sfx('denied');
      this.flashRow(rowY, C.bad);
      this.toast(failureText(res.reason, currency));
      this.cameras.main.shake(80, 0.002);
    }
  }

  private flashRow(cy: number, color: number): void {
    const r = this.add.rectangle(LIST.x, cy - ROW_H / 2, LIST.w, ROW_H, color, 0.45).setOrigin(0).setDepth(9).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: r, alpha: 0, duration: 350, onComplete: () => r.destroy() });
  }

  private punch(t: Phaser.GameObjects.BitmapText): void {
    this.tweens.killTweensOf(t);
    t.setScale(1.4);
    this.tweens.add({ targets: t, scale: 1, duration: 220, ease: 'Back.easeOut' });
  }

  private toastObj: Phaser.GameObjects.BitmapText | null = null;
  private toast(text: string): void {
    this.toastObj?.destroy();
    const t = this.add.bitmapText(DETAIL.x + DETAIL.w / 2, DETAIL.y + DETAIL.h - BTN.h - 18, UI.font, text).setOrigin(0.5, 0).setTint(C.bad).setDepth(30);
    this.toastObj = t;
    this.tweens.add({ targets: t, alpha: 0, delay: 900, duration: 300, onComplete: () => t.destroy() });
  }

  private descend(): void {
    if (this.leaving) return;
    this.leaving = true;
    const save = saves.data;
    validateLoadout(save);
    this.applyPalette(save.cosmetics.equipped);
    const run = RunState.create((Math.random() * 2 ** 32) >>> 0, save);
    save.coins += run.startingCoins;
    session.run = run;
    saves.save();
    audio.sfx('portal');
    this.juice.burst(DESCEND.x + DESCEND.w / 2, DESCEND.y + DESCEND.h / 2, { count: 30, tint: [0xff7a2a, 0xffd080, 0x9a6aff], speed: [40, 160], gravity: -30, blendAdd: true, depth: 30 });
    this.tweens.add({ targets: this.backdrop.player, alpha: 0, y: FLOOR_Y + 6, duration: 500 });
    this.cameras.main.fadeOut(600, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('Game'));
  }

  private setFocus(f: Focus): void {
    if (this.focus === f) return;
    this.focus = f;
    audio.sfx('uiMove', { volume: 0.5 });
    if (f === 'list' && this.sel < 0) this.sel = this.firstSelectable();
    this.drawSelection();
    this.drawDescend();
    this.updateHint();
  }

  private updateHint(): void {
    if (!this.hint) return;
    const touch = input.lastDevice === 'touch';
    const mouse = input.lastDevice === 'mouse';
    let act = 'Select';
    const a = this.rows[this.sel]?.action;
    if (a?.kind === 'upgrade') act = 'Buy';
    else if (a?.kind === 'unlock') act = 'Unlock';
    else if (a?.kind === 'weapon' || a?.kind === 'skill') act = 'Equip';
    else if (a?.kind === 'cosmetic') act = 'Buy/Wear';
    if (touch) this.hint.setText(`Tap to select - tap again to ${act.toLowerCase()}`);
    else if (mouse) this.hint.setText(`Click to ${act.toLowerCase()}   Wheel to scroll`);
    else if (this.focus === 'descend') this.hint.setText('[Enter] Descend   [Up] Shop   [Q/E] Tabs');
    else this.hint.setText(`[Enter] ${act}   [Q/E] Tabs   [Esc] Descend`);
  }

  // ---------------------------------------------------------------------------
  // Pointer
  // ---------------------------------------------------------------------------

  /**
   * Pointer handling uses DOM pointer events on the canvas directly (mouse,
   * pen and touch alike) so it is independent of Phaser's mouse/touch
   * managers and of other listeners that preventDefault mouse input.
   */
  private setupPointer(): void {
    const inRect = (x: number, y: number, r: { x: number; y: number; w: number; h: number }) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
    const rowAt = (y: number) => Math.floor((y - LIST.y + this.scrollY) / ROW_H);
    const canvas = this.game.canvas;
    const toGame = (e: PointerEvent | WheelEvent) => ({ x: this.scale.transformX(e.pageX), y: this.scale.transformY(e.pageY) });

    const onDown = (e: PointerEvent) => {
      audio.unlock();
      const p = toGame(e);
      this.drag = { startY: p.y, startScroll: this.scrollTarget, moved: false, inList: inRect(p.x, p.y, LIST) };
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };
    const onMove = (e: PointerEvent) => {
      if (this.leaving) return;
      const p = toGame(e);
      if (this.drag?.inList && e.buttons !== 0) {
        const dy = p.y - this.drag.startY;
        if (Math.abs(dy) > 4) this.drag.moved = true;
        if (this.drag.moved) {
          this.scrollTarget = this.scrollY = Phaser.Math.Clamp(this.drag.startScroll - dy, 0, this.maxScroll);
          this.listC.y = LIST.y - Math.round(this.scrollY);
          this.drawSelection();
        }
        return;
      }
      if (e.pointerType === 'touch') return;
      const moved = Math.abs(p.x - this.lastPointer.x) + Math.abs(p.y - this.lastPointer.y) > 0.5;
      this.lastPointer = { x: p.x, y: p.y };
      if (!moved) return;
      // Mouse hover selects rows.
      if (inRect(p.x, p.y, LIST)) {
        const i = rowAt(p.y);
        if (this.rows[i]?.selectable) {
          if (this.focus !== 'list') this.setFocus('list');
          this.select(i);
        }
      } else if (inRect(p.x, p.y, DESCEND)) {
        this.setFocus('descend');
      }
    };
    const onUp = (e: PointerEvent) => {
      const drag = this.drag;
      this.drag = null;
      if (this.leaving || !drag || drag.moved) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      // The InputManager also maps LMB to attack1 (our "confirm"); swallow it so a click isn't handled twice.
      this.suppressConfirmFrames = 2;
      const p = toGame(e);
      this.updateHint();
      for (const t of this.tabObjs) {
        if (inRect(p.x, p.y, { x: t.x, y: TAB_Y, w: t.w, h: TAB_H })) {
          this.setTab(t.id);
          return;
        }
      }
      if (inRect(p.x, p.y, DESCEND)) {
        this.setFocus('descend');
        this.descend();
        return;
      }
      if (this.detailBtn && inRect(p.x, p.y, this.detailBtn)) {
        this.setFocus('list');
        this.activate();
        return;
      }
      if (inRect(p.x, p.y, LIST)) {
        const i = rowAt(p.y);
        if (!this.rows[i]?.selectable) return;
        const wasFocused = this.focus === 'list';
        this.setFocus('list');
        // Mouse: hover already selected it, so a click acts. Touch: first tap selects, second acts.
        if (i === this.sel && (wasFocused || e.pointerType !== 'touch')) this.activate();
        else this.select(i);
      }
    };
    const onWheel = (e: WheelEvent) => {
      const p = toGame(e);
      if (!inRect(p.x, p.y, LIST)) return;
      e.preventDefault();
      this.scrollTarget = Phaser.Math.Clamp(this.scrollTarget + e.deltaY * 0.5, 0, this.maxScroll);
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('wheel', onWheel);
    });
  }

  // ---------------------------------------------------------------------------
  // Frame
  // ---------------------------------------------------------------------------

  override update(time: number, delta: number): void {
    this.backdrop.update(time);
    if (this.descendGlow) this.descendGlow.setAlpha((this.focus === 'descend' ? 0.4 : 0.15) + 0.08 * Math.sin(time / 260));

    // Smooth scroll
    if (Math.abs(this.scrollTarget - this.scrollY) > 0.25) {
      this.scrollY = Phaser.Math.Linear(this.scrollY, this.scrollTarget, Math.min(1, delta / 60));
      this.listC.y = LIST.y - Math.round(this.scrollY);
      this.drawSelection();
    } else if (this.scrollY !== this.scrollTarget) {
      this.scrollY = this.scrollTarget;
      this.listC.y = LIST.y - Math.round(this.scrollY);
      this.drawSelection();
    }

    input.update();
    if (this.leaving) return;
    const nav = input.menuNav();
    // LMB is mapped to attack1 by the InputManager; pointer clicks are handled above.
    const lmb = input.lastDevice === 'mouse' || input.lastDevice === 'touch';
    const confirm = this.suppressConfirmFrames > 0 ? false : nav.confirm || (!lmb && input.rawPressed('attack1'));
    if (this.suppressConfirmFrames > 0) this.suppressConfirmFrames--;
    const back = nav.back || (!lmb && input.rawPressed('attack2'));
    const prevDevice = this.hintDevice;
    if (prevDevice !== input.lastDevice) {
      this.hintDevice = input.lastDevice;
      this.updateHint();
    }

    if (input.rawPressed('skill1')) this.cycleTab(-1);
    else if (input.rawPressed('skill2')) this.cycleTab(1);
    else if (nav.dx !== 0) this.cycleTab(nav.dx);

    if (this.focus === 'list') {
      if (nav.dy !== 0) this.moveSel(nav.dy);
      else if (confirm) this.activate();
      else if (back) {
        audio.sfx('uiBack');
        this.setFocus('descend');
      }
    } else {
      if (nav.dy < 0) {
        this.setFocus('list');
        this.ensureVisible();
      } else if (confirm) this.descend();
      else if (back) {
        audio.sfx('uiBack');
        this.leaving = true;
        this.applyPalette(saves.data.cosmetics.equipped);
        this.cameras.main.fadeOut(300, 0, 0, 0);
        this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start(this.scene.get('Title') ? 'Title' : 'Sanctum'));
      }
    }
  }

  private hintDevice = '';
  private suppressConfirmFrames = 0;
}

function measure(scene: Phaser.Scene, text: string): number {
  const t = scene.make.bitmapText({ x: 0, y: 0, font: UI.font, text }, false);
  const w = t.width;
  t.destroy();
  return w;
}

/** Shorten a bitmap text with an ellipsis until it fits maxW. */
function fitText(t: Phaser.GameObjects.BitmapText, text: string, maxW: number): void {
  if (t.width <= maxW) return;
  let n = text.length;
  while (n > 1 && t.width > maxW) {
    n--;
    t.setText(text.slice(0, n).trimEnd() + '.');
  }
}
