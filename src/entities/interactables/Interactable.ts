/**
 * Things the player walks up to and presses Interact on.
 * GameScene keeps a list, picks the closest one in range each frame, shows its
 * prompt, and calls interact() on the Interact action.
 */
import Phaser from 'phaser';
import { ANIMS, FX, iconTex, OBJ } from '../../art/keys';
import { RARITY_COLORS } from '../../art/palette';
import { audio } from '../../core/audio';
import { bus } from '../../core/events';
import { itemDisplayName } from '../../data';
import type { ItemInstance, StatTrack } from '../../data/types';
import { chestContents, rollItem } from '../../run/Loot';
import { itemPrice } from '../../run/Economy';
import type { World } from '../World';

export abstract class Interactable {
  active = true;
  range = 20;
  constructor(protected world: World, public x: number, public y: number) {}
  abstract prompt(): string;
  abstract interact(): void;
  update(_dt: number): void {}
  destroy(): void {
    this.active = false;
  }
}

// ---------------------------------------------------------------------------

export class ItemDrop extends Interactable {
  private sprite: Phaser.GameObjects.Image;
  private glow: Phaser.GameObjects.Image;
  private base: Phaser.GameObjects.Image | null;
  private label: Phaser.GameObjects.BitmapText | null = null;
  private t0: number;

  constructor(world: World, x: number, y: number, public item: ItemInstance, public price = 0, pop = true) {
    super(world, x, y);
    const scene = world.stage;
    const color = RARITY_COLORS[item.rarity];
    this.base = scene.textures.exists(OBJ.itemDrop) ? scene.add.image(x, y, OBJ.itemDrop).setOrigin(0.5, 1).setDepth(440) : null;
    this.glow = scene.add.image(x, y - 14, FX.glow).setTint(color).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.55).setScale(0.5).setDepth(441);
    this.sprite = scene.add.image(x, y - 14, iconTex(item.defId)).setDepth(442);
    this.t0 = world.now + Math.random() * 1000;
    if (pop) {
      this.sprite.setScale(0.2);
      scene.tweens.add({ targets: this.sprite, scale: 1, duration: 300, ease: 'Back.easeOut' });
    }
    if (item.rarity === 'legendary') audio.sfx('itemLegendary');
    else if (item.rarity !== 'common' && pop) audio.sfx('itemRare');
  }

  prompt(): string {
    const name = itemDisplayName(this.item);
    return this.price > 0 ? `Buy ${name} - ${this.price}c` : `Take ${name}`;
  }

  override update(): void {
    const bob = Math.sin((this.world.now - this.t0) / 300) * 2;
    this.sprite.y = this.y - 14 + bob;
    this.glow.y = this.sprite.y;
    this.glow.setAlpha(0.45 + 0.15 * Math.sin((this.world.now - this.t0) / 200));
    const near = Phaser.Math.Distance.Between(this.world.player.centerX, this.world.player.centerY, this.x, this.y - 10) < 48;
    if (near && !this.label) {
      this.label = this.world.stage.add
        .bitmapText(this.x, this.y - 28, 'pixel', this.price > 0 ? `${this.price}c` : '')
        .setOrigin(0.5, 1)
        .setTint(0xffd35a)
        .setDepth(900);
    } else if (!near && this.label) {
      this.label.destroy();
      this.label = null;
    }
  }

  interact(): void {
    const w = this.world;
    if (this.price > 0) {
      if (!w.spendCoins(this.price)) {
        audio.sfx('denied');
        bus.emit('toast', { text: 'Not enough coins', color: 0xff6a6a });
        return;
      }
      audio.sfx('buy');
      this.price = 0;
    }
    this.destroy();
    w.takeItem(this.item, this.x, this.y);
  }

  override destroy(): void {
    super.destroy();
    this.sprite.destroy();
    this.glow.destroy();
    this.base?.destroy();
    this.label?.destroy();
  }
}

// ---------------------------------------------------------------------------

export class Chest extends Interactable {
  private sprite: Phaser.GameObjects.Sprite;
  private opened = false;

  constructor(world: World, x: number, y: number) {
    super(world, x, y);
    this.sprite = world.stage.add.sprite(x, y, OBJ.chest, 0).setOrigin(0.5, 1).setDepth(430);
  }

  prompt(): string {
    return 'Open chest';
  }

  interact(): void {
    if (this.opened) return;
    this.opened = true;
    this.active = false;
    const w = this.world;
    this.sprite.setFrame(1);
    audio.sfx('chest');
    w.juice.burst(this.x, this.y - 8, { count: 16, tint: [0xffd35a, 0xffffff], speed: [60, 160], blendAdd: true });
    const contents = chestContents(w.rng, w.difficulty, w.unlocked);
    w.pickups.spawnCoins(this.x, this.y - 10, Math.round(contents.coins));
    if (contents.item) {
      const item = contents.item;
      w.stage.time.delayedCall(250, () => w.dropItem(item, this.x, this.y, { pop: true }));
    }
    if (contents.heal) w.pickups.spawn('heart', this.x, this.y - 10, 1);
  }
}

// ---------------------------------------------------------------------------

export class Altar extends Interactable {
  private sprite: Phaser.GameObjects.Sprite;
  private glow: Phaser.GameObjects.Image;
  private used = false;
  readonly choices: StatTrack[];

  constructor(world: World, x: number, y: number) {
    super(world, x, y);
    this.sprite = world.stage.add.sprite(x, y, OBJ.altar, 0).setOrigin(0.5, 1).setDepth(430);
    this.glow = world.stage.add.image(x, y - 22, FX.glow).setBlendMode(Phaser.BlendModes.ADD).setTint(0xffe08a).setAlpha(0.6).setDepth(429);
    const tracks: StatTrack[] = ['might', 'cunning', 'vigor'];
    world.rng.shuffle(tracks);
    this.choices = tracks.slice(0, 2);
  }

  prompt(): string {
    return 'Pray at the altar (choose a scroll)';
  }

  override update(): void {
    if (!this.used) this.glow.setAlpha(0.45 + 0.2 * Math.sin(this.world.now / 250));
  }

  interact(): void {
    if (this.used) return;
    bus.emit('ui:open', {
      kind: 'altar',
      data: {
        choices: this.choices,
        resolve: (t: StatTrack | null) => {
          if (!t || this.used) return;
          this.used = true;
          this.active = false;
          this.sprite.setFrame(1);
          this.glow.destroy();
          this.world.grantScroll(t);
        },
      },
    });
  }
}

// ---------------------------------------------------------------------------

export interface MerchantStockEntry {
  item: ItemInstance;
  price: number;
  sold: boolean;
}

export class Merchant extends Interactable {
  private sprite: Phaser.GameObjects.Sprite;
  stock: MerchantStockEntry[] = [];
  refillUsed = false;

  constructor(world: World, x: number, y: number) {
    super(world, x, y);
    this.range = 28;
    this.sprite = world.stage.add.sprite(x, y, OBJ.merchant, 0).setOrigin(0.5, 1).setDepth(430);
    if (world.stage.anims.exists(ANIMS.merchantIdle)) this.sprite.play(ANIMS.merchantIdle);
    const kinds = ['weapon', 'skill', 'relic', world.rng.pick(['weapon', 'relic'] as const)] as const;
    const seen: string[] = [];
    for (const kind of kinds) {
      const item = rollItem(world.rng, { kind, difficulty: world.difficulty, unlocked: world.unlocked, exclude: seen, minRarity: 'rare' });
      seen.push(item.defId);
      this.stock.push({ item, price: itemPrice(item, world.run.stats), sold: false });
    }
  }

  prompt(): string {
    return 'Trade with the merchant';
  }

  override update(): void {
    this.sprite.setFlipX(this.world.player.centerX < this.x);
  }

  interact(): void {
    audio.sfx('uiSelect');
    bus.emit('ui:open', { kind: 'merchant', data: { merchant: this, world: this.world } });
  }
}

// ---------------------------------------------------------------------------

export class ExitPortal extends Interactable {
  private sprite: Phaser.GameObjects.Sprite;
  private glow: Phaser.GameObjects.Image;
  locked = false;

  constructor(world: World, x: number, y: number, private onUse: () => void) {
    super(world, x, y);
    this.range = 22;
    this.sprite = world.stage.add.sprite(x, y, OBJ.exitPortal, 0).setOrigin(0.5, 1).setDepth(420);
    if (world.stage.anims.exists(ANIMS.exitSwirl)) this.sprite.play(ANIMS.exitSwirl);
    this.glow = world.stage.add.image(x, y - 24, FX.glow).setBlendMode(Phaser.BlendModes.ADD).setTint(0x9a6aff).setScale(1.2).setAlpha(0.5).setDepth(419);
  }

  setLocked(l: boolean): void {
    this.locked = l;
    this.sprite.setAlpha(l ? 0.25 : 1);
    this.glow.setVisible(!l);
  }

  prompt(): string {
    return this.locked ? 'Sealed - defeat the guardian' : 'Descend deeper';
  }

  override update(): void {
    this.glow.setAlpha(0.4 + 0.15 * Math.sin(this.world.now / 300));
  }

  interact(): void {
    if (this.locked) {
      audio.sfx('denied');
      return;
    }
    audio.sfx('portal');
    this.active = false;
    this.onUse();
  }
}
