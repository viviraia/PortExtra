import Phaser from 'phaser';
import { audio } from '../../core/audio';
import type { Enemy } from '../Enemy';
import { PhaseBrain, findSpotNearPlayer, rotate, teleportTo } from './util';

type Phase = 'patrol' | 'position' | 'windup' | 'recover' | 'blinkOut' | 'blinkIn';

/**
 * Ink Cultist: hangs back casting slow homing ink orbs (dodge-roll through
 * them), and blinks away when the player gets too close.
 * params: attackRange, projectileSpeed, homing, teleportCooldownMs, windupMs, cooldownMs
 */
export class CasterBrain extends PhaseBrain<Phase> {
  phase: Phase = 'patrol';
  private nextBlink = 0;
  private dest: { x: number; y: number } | null = null;

  onAggro(e: Enemy): void {
    audio.sfx('enemyAlert', { volume: 0.3, pitch: 0.7 });
    this.set(e, 'position');
    this.nextAttack = e.now + 600;
    this.nextBlink = e.now + 1500;
  }

  update(e: Enemy): void {
    const p = e.def.params;
    if (e.player.state2 === 'dead' && this.phase !== 'blinkOut' && this.phase !== 'blinkIn') {
      e.halt();
      e.playAnim('idle');
      return;
    }
    switch (this.phase) {
      case 'patrol':
        this.patrol(e, 0.35);
        if (e.isAggro) this.set(e, 'position');
        break;
      case 'position': {
        const dist = e.distToPlayer();
        const dx = e.dxToPlayer();
        const sees = e.seesPlayerCached();
        if (dist < 64 && e.now >= this.nextBlink) {
          this.dest = findSpotNearPlayer(e, 100, 170);
          if (this.dest) {
            this.startBlink(e);
            break;
          }
        }
        if (!sees || dist > (p.attackRange ?? 200)) {
          if (e.walk(Math.sign(dx) || 1, 0.8)) e.playAnim('move');
          else e.playAnim('idle');
        } else {
          e.halt();
          e.facePlayer();
          e.playAnim('idle');
          if (this.ready(e)) {
            e.telegraph();
            this.set(e, 'windup', this.windupMs(e));
          }
        }
        if (dist > (p.aggroRange ?? 240) * 2.5) this.set(e, 'patrol');
        break;
      }
      case 'windup':
        e.halt();
        e.facePlayer();
        if (Math.random() < 0.5) e.world.juice.burst(e.centerX + e.facing * 6, e.centerY - 6, { count: 1, tint: 0x7a4aff, speed: [5, 25], gravity: -40, life: [150, 300], blendAdd: true });
        if (this.done(e)) {
          this.cast(e);
          this.cooldown(e);
          this.set(e, 'recover', 450);
        }
        break;
      case 'recover':
        e.halt();
        if (this.done(e)) this.set(e, 'position');
        break;
      case 'blinkOut':
        e.halt();
        if (this.done(e)) {
          if (this.dest) teleportTo(e, this.dest.x, this.dest.y);
          e.world.juice.burst(e.centerX, e.centerY, { count: 10, tint: [0x7a4aff, 0x1a1030], speed: [30, 90], gravity: 0, blendAdd: true });
          audio.sfx('magic', { volume: 0.3, pitch: 1.3 });
          e.scene.tweens.add({ targets: e, alpha: 1, duration: 200 });
          e.facePlayer();
          this.set(e, 'blinkIn', 260);
        }
        break;
      case 'blinkIn':
        e.halt();
        if (this.done(e)) {
          e.intangible = false;
          // Reward the blink with a quick follow-up cast.
          this.nextAttack = Math.min(this.nextAttack, e.now + 300);
          this.set(e, 'position');
        }
        break;
    }
  }

  private startBlink(e: Enemy): void {
    this.nextBlink = e.now + (e.def.params.teleportCooldownMs ?? 5000) * e.cooldownMult;
    e.intangible = true;
    e.playAnim('windup', true);
    e.world.juice.burst(e.centerX, e.centerY, { count: 10, tint: [0x7a4aff, 0x1a1030], speed: [30, 90], gravity: 0, blendAdd: true });
    audio.sfx('magic', { volume: 0.3, pitch: 0.8 });
    e.scene.tweens.add({ targets: e, alpha: 0, duration: 220 });
    this.set(e, 'blinkOut', 260);
  }

  private cast(e: Enemy): void {
    const p = e.def.params;
    e.playAnim('attack', true);
    audio.sfx('magic', { volume: 0.4 });
    const dx = e.player.centerX - e.centerX;
    const dy = e.player.centerY - e.centerY;
    const len = Math.hypot(dx, dy) || 1;
    const count = e.world.difficulty.floor >= 14 || e.elite ? 3 : 2;
    const spread = 0.45;
    for (let i = 0; i < count; i++) {
      const a = -spread / 2 + (spread * i) / (count - 1);
      const d = rotate(dx / len, dy / len, a + Phaser.Math.FloatBetween(-0.05, 0.05));
      e.shoot('ink', p.projectileSpeed ?? 120, { dirX: d.x, dirY: d.y, homing: p.homing ?? 2.2, lifeMs: 3200, glow: 0x7a4aff, radius: 5, mult: 0.8 });
    }
  }

  protected override onInterrupt(e: Enemy): void {
    e.intangible = false;
    e.setAlpha(1);
    this.set(e, 'recover', 300);
  }
}
