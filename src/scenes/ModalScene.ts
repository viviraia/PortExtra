/**
 * In-run modal dialogs requested through bus 'ui:open':
 *   swap     — choose which slot a newly picked-up weapon/skill replaces
 *   merchant — buy items / refill potions
 *   altar    — pick one of two stat scrolls
 * Requests opened while another is showing (e.g. a swap triggered by a
 * merchant purchase) are stacked and return to the previous view.
 * Emits 'ui:closed' once the whole modal closes.
 */
import Phaser from 'phaser';
import { OBJ, iconTex } from '../art/keys';
import { RARITY_COLORS, TRACK_COLORS, UI_COLORS } from '../art/palette';
import { GAME_H, GAME_W } from '../config';
import { audio } from '../core/audio';
import { bus, type GameEvents } from '../core/events';
import { input } from '../core/input/InputManager';
import { itemDescription, itemDisplayName, RARITY_INFO } from '../data';
import type { ItemInstance, StatTrack } from '../data/types';
import type { World } from '../entities/World';
import type { Merchant } from '../entities/interactables/Interactable';
import { potionRefillPrice } from '../run/Economy';
import { SCROLL_HP, SCROLL_HP_VIGOR, SCROLL_TRACK_DAMAGE } from '../run/stats';
import { Button, dimmer, drawPanel, keyLabel, Menu, txt, wrap } from '../ui/widgets';

type Req = GameEvents['ui:open'];

interface SwapData {
  item: ItemInstance;
  current: (ItemInstance | null)[];
  resolve: (slot: number | null) => void;
}
interface MerchantData {
  merchant: Merchant;
  world: World;
}
interface AltarData {
  choices: StatTrack[];
  resolve: (t: StatTrack | null) => void;
}

const TRACK_INFO: Record<StatTrack, { name: string; blurb: string }> = {
  might: { name: 'Might', blurb: 'Brutal strength. Empowers heavy blades, hammers and fire.' },
  cunning: { name: 'Cunning', blurb: 'Precision and guile. Empowers daggers, bows and storms.' },
  vigor: { name: 'Vigor', blurb: 'Endurance. Empowers shields, frost and blood.' },
};

export class ModalScene extends Phaser.Scene {
  private stack: Req[] = [];
  private current: Req | null = null;
  private root: Phaser.GameObjects.Container | null = null;
  private menu: Menu | null = null;
  private viewUpdate: (() => void) | null = null;
  private resolved = false;
  private closing = false;

  constructor() {
    super('Modal');
  }

  create(data: Req): void {
    this.stack = [];
    this.current = null;
    this.closing = false;
    const dim = dimmer(this, 0.72).setAlpha(0);
    this.tweens.add({ targets: dim, alpha: 1, duration: 150 });
    input.releaseAll();
    this.show(data);
  }

  /** Called by the HUD when a new request arrives while open. */
  openRequest(e: Req): void {
    if (this.current) this.stack.push(this.current);
    this.show(e);
  }

  private show(e: Req): void {
    this.root?.destroy();
    this.menu = null;
    this.viewUpdate = null;
    this.resolved = false;
    this.current = e;
    this.root = this.add.container(0, 0);
    switch (e.kind) {
      case 'swap':
        this.buildSwap(e.data as SwapData);
        break;
      case 'merchant':
        this.buildMerchant(e.data as MerchantData);
        break;
      case 'altar':
        this.buildAltar(e.data as AltarData);
        break;
    }
    this.root.setAlpha(0).setY(6);
    this.tweens.add({ targets: this.root, alpha: 1, y: 0, duration: 160, ease: 'Cubic.easeOut' });
  }

  /** Current view finished: return to the previous one or close. */
  private finishView(): void {
    const prev = this.stack.pop();
    if (prev) this.show(prev);
    else this.close();
  }

  private close(): void {
    if (this.closing) return;
    this.closing = true;
    const kind = this.current?.kind ?? 'modal';
    input.releaseAll();
    bus.emit('ui:closed', { kind });
    this.scene.stop();
  }

  override update(): void {
    input.update();
    this.menu?.update();
    this.viewUpdate?.();
  }

  // ---------------------------------------------------------------- shared

  private add2<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.root!.add(o);
    return o;
  }

  private header(title: string, y: number, color: number = UI_COLORS.gold): void {
    this.add2(txt(this, GAME_W / 2, y, title, { origin: [0.5, 0], big: true, tint: color }));
  }

  private footer(s: string): void {
    this.add2(txt(this, GAME_W / 2, GAME_H - 14, s, { origin: [0.5, 0], tint: UI_COLORS.dim }));
  }

  /** Item card: icon, name, description. Returns its graphics for highlight redraws. */
  private itemCard(x: number, y: number, w: number, h: number, item: ItemInstance | null, label: string, labelColor: number): { redraw: (sel: boolean) => void } {
    const g = this.add2(this.add.graphics());
    const edge = item ? RARITY_COLORS[item.rarity] : UI_COLORS.panelEdge;
    const redraw = (sel: boolean) => {
      g.clear();
      drawPanel(g, x, y, w, h, { edge: sel ? 0xffffff : edge, fill: sel ? 0x241e34 : UI_COLORS.panel, glow: sel });
      if (item) g.fillStyle(edge, 0.12).fillRect(x + 1, y + 1, w - 2, 30);
    };
    redraw(false);
    this.add2(txt(this, x + w / 2, y + 4, label, { origin: [0.5, 0], tint: labelColor }));
    if (!item) {
      this.add2(txt(this, x + w / 2, y + h / 2, '- empty -', { origin: 0.5, tint: UI_COLORS.dim }));
      return { redraw };
    }
    this.add2(this.add.image(x + 18, y + 30, iconTex(item.defId)).setScale(2));
    const nameLines = wrap(itemDisplayName(item), w - 40);
    nameLines.slice(0, 2).forEach((l, i) => this.add2(txt(this, x + 36, y + 20 + i * 10, l, { tint: RARITY_COLORS[item.rarity] })));
    const desc = itemDescription(item);
    let ly = y + 46;
    for (let i = 0; i < desc.length; i++) {
      const lines = wrap(desc[i], w - 12);
      for (const l of lines) {
        if (ly > y + h - 12) break;
        const tint = i === 0 ? RARITY_COLORS[item.rarity] : desc[i].startsWith('*') ? 0x9adfff : desc[i].startsWith('Damage') || desc[i].startsWith('Charged') ? 0xffffff : UI_COLORS.dim;
        this.add2(txt(this, x + 6, ly, l, { tint }));
        ly += 10;
      }
    }
    return { redraw };
  }

  // ---------------------------------------------------------------- swap

  private buildSwap(d: SwapData): void {
    this.add2(dimmer(this, 0.25));
    const kindName = d.item.kind === 'weapon' ? 'WEAPON' : 'SKILL';
    this.header(`NEW ${kindName}`, 10);
    const w = 142, h = 176, y = 36, gap = 8;
    const x0 = (GAME_W - (w * 3 + gap * 2 + 14)) / 2;
    this.itemCard(x0, y, w, h, d.item, 'FOUND', UI_COLORS.gold).redraw(false);
    const arrow = this.add2(txt(this, x0 + w + 4, y + h / 2 - 4, '>', { tint: UI_COLORS.gold }));
    this.tweens.add({ targets: arrow, x: arrow.x + 3, duration: 400, yoyo: true, repeat: -1 });
    const acts = d.item.kind === 'weapon' ? (['attack1', 'attack2'] as const) : (['skill1', 'skill2'] as const);
    const cards = [0, 1].map((i) => {
      const cx = x0 + w + 14 + gap + i * (w + gap) - gap;
      const card = this.itemCard(cx, y, w, h, d.current[i] ?? null, `REPLACE SLOT ${i + 1}  [${keyLabel(acts[i])}]`, 0xffffff);
      const z = this.add2(this.add.zone(cx, y, w, h).setOrigin(0).setInteractive({ useHandCursor: true }));
      z.on('pointerover', () => select(i));
      z.on('pointerdown', () => choose(i));
      return card;
    });
    let sel = 0;
    const select = (i: number) => {
      if (i !== sel) audio.sfx('uiMove', { volume: 0.5 });
      sel = i;
      cards.forEach((c, k) => c.redraw(k === sel));
    };
    const choose = (slot: number | null) => {
      if (this.resolved) return;
      this.resolved = true;
      audio.sfx(slot === null ? 'uiBack' : 'pickup');
      // Close first so the swap callback's follow-ups (toasts, drops) happen with gameplay resumed.
      const r = d.resolve;
      this.finishView();
      r(slot);
    };
    cards.forEach((c, k) => c.redraw(k === sel));
    const leave = new Button(this, GAME_W / 2, y + h + 14, 'Leave it on the ground', () => choose(null), { w: 150, h: 14 });
    this.add2(leave.container);
    this.footer(input.lastDevice === 'touch' ? 'Tap a slot to swap' : `LEFT/RIGHT + F to swap   ${keyLabel(acts[0])}/${keyLabel(acts[1])} pick slot   ESC leave`);
    this.viewUpdate = () => {
      const nav = input.menuNav();
      if (nav.dx !== 0) select(Phaser.Math.Wrap(sel + nav.dx, 0, 2));
      if (input.pressed(acts[0]) || input.pressed('attack1')) return choose(0);
      if (input.pressed(acts[1]) || input.pressed('attack2')) return choose(1);
      if (nav.confirm) {
        input.consume('interact');
        input.consume('jump');
        return choose(sel);
      }
      if (nav.back) {
        input.consume('pause');
        return choose(null);
      }
    };
  }

  // ---------------------------------------------------------------- merchant

  private merchantSel = 0;

  private buildMerchant(d: MerchantData): void {
    const { merchant, world } = d;
    const px = 16, py = 14, pw = GAME_W - 32, ph = GAME_H - 28;
    this.add2(drawPanel(this.add.graphics(), px, py, pw, ph, { edge: UI_COLORS.gold }));
    this.add2(txt(this, px + 10, py + 6, 'THE WANDERING MERCHANT', { tint: UI_COLORS.gold }));
    this.add2(txt(this, px + 10, py + 16, '"Coins spent here are coins not saved, friend..."', { tint: UI_COLORS.dim }));
    const wallet = this.add2(txt(this, px + pw - 10, py + 6, '', { origin: [1, 0], tint: UI_COLORS.gold }));
    const coinIcon = this.add2(this.add.sprite(0, py + 10, OBJ.coin, 0));
    const updWallet = () => {
      wallet.setText(`${world.coins}`);
      coinIcon.setX(wallet.x - wallet.width - 7);
    };
    updWallet();

    // Detail pane on the right.
    const dx = px + 214, dy = py + 30, dw = pw - 222, dh = ph - 38;
    this.add2(drawPanel(this.add.graphics(), dx, dy, dw, dh, { fill: 0x0e0c16 }));
    const detail = this.add2(this.add.container(0, 0));

    const rowsY = py + 32;
    const rowH = 23;
    const buttons: Button[] = [];
    const entries = merchant.stock;
    const refillPrice = potionRefillPrice(world.run.floor, world.run.stats);

    const showDetail = (i: number) => {
      detail.removeAll(true);
      if (i < entries.length) {
        const e = entries[i];
        const it = e.item;
        detail.add(this.add.image(dx + 18, dy + 18, iconTex(it.defId)).setScale(2));
        wrap(itemDisplayName(it), dw - 44)
          .slice(0, 2)
          .forEach((l, k) => detail.add(txt(this, dx + 36, dy + 8 + k * 10, l, { tint: RARITY_COLORS[it.rarity] })));
        let ly = dy + 36;
        itemDescription(it).forEach((line, k) => {
          for (const l of wrap(line, dw - 12)) {
            if (ly > dy + dh - 24) return;
            detail.add(txt(this, dx + 6, ly, l, { tint: k === 0 ? RARITY_COLORS[it.rarity] : line.startsWith('*') ? 0x9adfff : line.startsWith('Damage') ? 0xffffff : UI_COLORS.dim }));
            ly += 10;
          }
        });
        const replaces = it.kind === 'relic' ? 'Relics stack - no slot needed' : (it.kind === 'weapon' ? world.run.weapons : world.run.skills).some((s) => !s) ? 'Goes into an empty slot' : 'Slots full - you will choose one to replace';
        detail.add(txt(this, dx + 6, dy + dh - 14, replaces, { tint: UI_COLORS.dim }));
      } else if (i === entries.length) {
        detail.add(this.add.image(dx + 18, dy + 18, OBJ.potion).setScale(2));
        detail.add(txt(this, dx + 36, dy + 13, 'Refill potions', { tint: UI_COLORS.good }));
        const lines = [`Restore all flasks to ${world.run.stats.potionCharges} charges.`, `Current: ${world.run.potions}/${world.run.stats.potionCharges}`, 'Once per merchant.'];
        lines.forEach((l, k) => detail.add(txt(this, dx + 6, dy + 36 + k * 10, l, { tint: UI_COLORS.dim })));
      } else {
        detail.add(txt(this, dx + dw / 2, dy + dh / 2, 'Farewell, wanderer.', { origin: 0.5, tint: UI_COLORS.dim }));
      }
    };

    const buy = (i: number) => {
      const e = entries[i];
      if (e.sold) {
        audio.sfx('denied');
        return;
      }
      if (!world.spendCoins(e.price)) {
        this.denied(buttons[i]);
        return;
      }
      e.sold = true;
      audio.sfx('buy');
      updWallet();
      this.merchantSel = i;
      // takeItem may request a swap: that arrives as a stacked view via the HUD.
      world.takeItem(e.item, merchant.x, merchant.y);
      if (this.current?.kind === 'merchant') this.show(this.current);
    };

    const refill = () => {
      if (merchant.refillUsed || world.run.potions >= world.run.stats.potionCharges) {
        audio.sfx('denied');
        return;
      }
      if (!world.spendCoins(refillPrice)) {
        this.denied(buttons[entries.length]);
        return;
      }
      merchant.refillUsed = true;
      world.run.refillPotions();
      bus.emit('player:potions', { charges: world.run.potions, max: world.run.stats.potionCharges });
      audio.sfx('potion');
      this.merchantSel = entries.length;
      this.show(this.current!);
    };

    entries.forEach((e, i) => {
      const y = rowsY + i * rowH + rowH / 2;
      const afford = world.coins >= e.price;
      const b = new Button(this, px + 106, y, '', () => buy(i), { w: 188, h: rowH - 3 });
      this.add2(b.container);
      b.container.add(this.add.image(-82, 0, iconTex(e.item.defId)));
      const name = itemDisplayName(e.item);
      b.container.add(txt(this, -70, -8, name.length > 29 ? name.slice(0, 28) + '.' : name, { tint: e.sold ? UI_COLORS.dim : RARITY_COLORS[e.item.rarity] }));
      b.container.add(txt(this, -70, 1, `${RARITY_INFO[e.item.rarity].label} ${e.item.kind}`, { tint: UI_COLORS.dim }));
      b.container.add(txt(this, 88, -4, e.sold ? 'SOLD' : `${e.price}`, { origin: [1, 0], tint: e.sold ? UI_COLORS.dim : afford ? UI_COLORS.gold : UI_COLORS.bad }));
      if (e.sold) b.setDisabled(true);
      buttons.push(b);
    });
    // Refill + leave.
    {
      const i = entries.length;
      const y = rowsY + i * rowH + rowH / 2;
      const used = merchant.refillUsed;
      const b = new Button(this, px + 106, y, '', refill, { w: 188, h: rowH - 3 });
      this.add2(b.container);
      b.container.add(this.add.image(-82, 0, OBJ.potion));
      b.container.add(txt(this, -70, -4, 'Refill potions', { tint: used ? UI_COLORS.dim : UI_COLORS.good }));
      b.container.add(txt(this, 88, -4, used ? 'DONE' : `${refillPrice}`, { origin: [1, 0], tint: used ? UI_COLORS.dim : world.coins >= refillPrice ? UI_COLORS.gold : UI_COLORS.bad }));
      if (used) b.setDisabled(true);
      buttons.push(b);
    }
    const leave = new Button(this, px + 106, rowsY + (entries.length + 1) * rowH + rowH / 2, 'Leave', () => this.finishView(), { w: 188, h: rowH - 3 });
    this.add2(leave.container);
    buttons.push(leave);

    this.menu = new Menu(buttons, { onBack: () => this.finishView() });
    const origSelect = this.menu.select.bind(this.menu);
    this.menu.select = (i: number) => {
      origSelect(i);
      showDetail(this.menu!.index);
    };
    this.menu.select(Math.min(this.merchantSel, buttons.length - 1));
    this.footer(input.lastDevice === 'touch' ? 'Tap to buy' : 'UP/DOWN choose   F buy   ESC leave');
  }

  private denied(b?: Button): void {
    audio.sfx('denied');
    bus.emit('toast', { text: 'Not enough coins', color: UI_COLORS.bad });
    if (b) this.tweens.add({ targets: b.container, x: b.container.x + 3, duration: 40, yoyo: true, repeat: 2 });
  }

  // ---------------------------------------------------------------- altar

  private buildAltar(d: AltarData): void {
    this.header('THE ALTAR OFFERS', 16, 0xffe6a0);
    this.add2(txt(this, GAME_W / 2, 38, 'Choose one scroll. The other crumbles to dust.', { origin: [0.5, 0], tint: UI_COLORS.dim }));
    const w = 172, h = 160, gap = 16, y = 54;
    const x0 = (GAME_W - (w * 2 + gap)) / 2;
    let sel = 0;
    const redraws: ((s: boolean) => void)[] = [];
    const choose = (i: number | null) => {
      if (this.resolved) return;
      this.resolved = true;
      const r = d.resolve;
      const t = i === null ? null : d.choices[i];
      if (i === null) audio.sfx('uiBack');
      this.finishView();
      r(t);
    };
    d.choices.forEach((t, i) => {
      const x = x0 + i * (w + gap);
      const col = TRACK_COLORS[t];
      const g = this.add2(this.add.graphics());
      const glow = this.add2(this.add.image(x + w / 2, y + 40, 'fx-glow').setTint(col).setBlendMode(Phaser.BlendModes.ADD).setScale(1.2).setAlpha(0.35));
      const redraw = (s: boolean) => {
        g.clear();
        drawPanel(g, x, y, w, h, { edge: s ? 0xffffff : col, fill: s ? 0x221c30 : UI_COLORS.panel, glow: s });
        g.fillStyle(col, s ? 0.2 : 0.1).fillRect(x + 1, y + 1, w - 2, 72);
        glow.setAlpha(s ? 0.6 : 0.25);
      };
      redraws.push(redraw);
      const key = t === 'might' ? OBJ.scrollMight : t === 'cunning' ? OBJ.scrollCunning : OBJ.scrollVigor;
      const img = this.add2(this.add.image(x + w / 2, y + 40, key).setScale(3));
      this.tweens.add({ targets: img, y: img.y - 3, duration: 900 + i * 120, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      const info = TRACK_INFO[t];
      this.add2(txt(this, x + w / 2, y + 78, `SCROLL OF ${info.name.toUpperCase()}`, { origin: [0.5, 0], tint: col }));
      const hp = t === 'vigor' ? SCROLL_HP_VIGOR : SCROLL_HP;
      const lines = [`+${Math.round(SCROLL_TRACK_DAMAGE * 100)}% ${info.name} damage`, `+${hp} max HP`, 'Heals a little'];
      lines.forEach((l, k) => this.add2(txt(this, x + w / 2, y + 94 + k * 10, l, { origin: [0.5, 0], tint: k === 0 ? 0xffffff : UI_COLORS.good })));
      wrap(info.blurb, w - 14).forEach((l, k) => this.add2(txt(this, x + w / 2, y + 128 + k * 10, l, { origin: [0.5, 0], tint: UI_COLORS.dim })));
      const z = this.add2(this.add.zone(x, y, w, h).setOrigin(0).setInteractive({ useHandCursor: true }));
      z.on('pointerover', () => select(i));
      z.on('pointerdown', () => choose(i));
    });
    const select = (i: number) => {
      if (i !== sel) audio.sfx('uiMove', { volume: 0.5 });
      sel = i;
      redraws.forEach((r, k) => r(k === sel));
    };
    redraws.forEach((r, k) => r(k === sel));
    const later = new Button(this, GAME_W / 2, y + h + 16, 'Not now', () => choose(null), { w: 90, h: 14 });
    this.add2(later.container);
    this.footer(input.lastDevice === 'touch' ? 'Tap a scroll' : 'LEFT/RIGHT choose   F accept   ESC not now');
    this.viewUpdate = () => {
      const nav = input.menuNav();
      if (nav.dx !== 0) select(Phaser.Math.Wrap(sel + nav.dx, 0, d.choices.length));
      if (nav.confirm) {
        input.consume('interact');
        input.consume('jump');
        return choose(sel);
      }
      if (nav.back) {
        input.consume('pause');
        return choose(null);
      }
    };
  }
}
