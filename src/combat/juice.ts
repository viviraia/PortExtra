/**
 * Game-feel helpers: hit-stop, screen shake, damage numbers, particle bursts,
 * flashes. One instance per GameScene.
 */
import Phaser from 'phaser';
import { FX, UI } from '../art/keys';
import { saves } from '../core/save';

export interface BurstOpts {
  count?: number;
  tint?: number | number[];
  speed?: [number, number];
  life?: [number, number];
  gravity?: number;
  scale?: [number, number];
  key?: string;
  blendAdd?: boolean;
  angle?: [number, number];
  depth?: number;
}

export class Juice {
  /** Scene time (ms) until which gameplay is frozen. */
  hitstopUntil = 0;
  private numbers: Phaser.GameObjects.BitmapText[] = [];

  constructor(private scene: Phaser.Scene) {}

  get frozen(): boolean {
    return this.scene.time.now < this.hitstopUntil;
  }

  hitstop(ms: number): void {
    if (ms <= 0) return;
    this.hitstopUntil = Math.max(this.hitstopUntil, this.scene.time.now + ms);
  }

  shake(intensity = 0.004, ms = 120): void {
    if (!saves.data.settings.screenShake) return;
    this.scene.cameras.main.shake(ms, intensity, false);
  }

  flash(ms = 80, r = 255, g = 255, b = 255): void {
    this.scene.cameras.main.flash(ms, r, g, b, false);
  }

  damageNumber(x: number, y: number, amount: number, opts: { crit?: boolean; color?: number; text?: string } = {}): void {
    if (!saves.data.settings.damageNumbers && !opts.text) return;
    const txt = opts.text ?? String(Math.max(1, Math.round(amount)));
    const t = this.scene.add
      .bitmapText(x, y - 8, opts.crit ? UI.fontBig : UI.font, txt)
      .setOrigin(0.5, 1)
      .setDepth(900)
      .setTint(opts.color ?? (opts.crit ? 0xffd04a : 0xffffff));
    if (opts.crit) t.setScale(0.6);
    this.numbers.push(t);
    const dx = Phaser.Math.Between(-10, 10);
    this.scene.tweens.add({
      targets: t,
      y: y - 26 - (opts.crit ? 8 : 0),
      x: x + dx,
      duration: 520,
      ease: 'Cubic.easeOut',
    });
    this.scene.tweens.add({
      targets: t,
      alpha: 0,
      delay: 380,
      duration: 260,
      onComplete: () => {
        t.destroy();
        this.numbers = this.numbers.filter((n) => n !== t);
      },
    });
    if (opts.crit) {
      t.setScale(0.9);
      this.scene.tweens.add({ targets: t, scale: 0.6, duration: 160, ease: 'Back.easeOut' });
    }
  }

  burst(x: number, y: number, o: BurstOpts = {}): void {
    const key = o.key ?? FX.particle;
    if (!this.scene.textures.exists(key)) return;
    const em = this.scene.add.particles(x, y, key, {
      speed: { min: o.speed?.[0] ?? 40, max: o.speed?.[1] ?? 140 },
      angle: { min: o.angle?.[0] ?? 0, max: o.angle?.[1] ?? 360 },
      lifespan: { min: o.life?.[0] ?? 200, max: o.life?.[1] ?? 500 },
      scale: { start: o.scale?.[0] ?? 1, end: o.scale?.[1] ?? 0 },
      gravityY: o.gravity ?? 300,
      tint: o.tint ?? 0xffffff,
      blendMode: o.blendAdd ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL,
      emitting: false,
    });
    em.setDepth(o.depth ?? 600);
    em.explode(o.count ?? 10);
    this.scene.time.delayedCall((o.life?.[1] ?? 500) + 50, () => em.destroy());
  }

  /** Play a one-shot animated effect sprite. */
  fx(x: number, y: number, anim: string, opts: { flipX?: boolean; tint?: number; scale?: number; depth?: number; angle?: number; add?: boolean } = {}): Phaser.GameObjects.Sprite | null {
    if (!this.scene.anims.exists(anim)) return null;
    const s = this.scene.add.sprite(x, y, anim).setDepth(opts.depth ?? 610);
    if (opts.flipX) s.setFlipX(true);
    if (opts.tint !== undefined) s.setTint(opts.tint);
    if (opts.scale) s.setScale(opts.scale);
    if (opts.angle) s.setAngle(opts.angle);
    if (opts.add) s.setBlendMode(Phaser.BlendModes.ADD);
    s.play(anim);
    s.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => s.destroy());
    return s;
  }

  /** Expanding tinted ring (novas, landings). */
  ring(x: number, y: number, radius: number, tint = 0xffffff, ms = 260): void {
    if (!this.scene.textures.exists(FX.ring)) return;
    const r = this.scene.add.image(x, y, FX.ring).setDepth(605).setTint(tint).setBlendMode(Phaser.BlendModes.ADD);
    r.setScale(0.1);
    this.scene.tweens.add({
      targets: r,
      scale: (radius * 2) / 64,
      alpha: 0,
      duration: ms,
      ease: 'Cubic.easeOut',
      onComplete: () => r.destroy(),
    });
  }

  /** Briefly flash a sprite white-ish (tintFill) for hit feedback. */
  hitFlash(target: Phaser.GameObjects.Sprite, ms = 70, color = 0xffffff): void {
    target.setTintFill(color);
    this.scene.time.delayedCall(ms, () => {
      if (target.active) target.clearTint();
    });
  }
}
