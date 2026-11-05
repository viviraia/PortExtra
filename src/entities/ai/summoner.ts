import { audio } from '../../core/audio';
import { SUMMON_ID } from '../../data/enemies';
import type { Enemy } from '../Enemy';
import { PhaseBrain } from './util';

type Phase = 'patrol' | 'position' | 'ritual' | 'toss' | 'recover';

/**
 * Bone Priest: keeps its distance, performs a visible ritual to raise
 * shamblers (capped), and lobs bones in between. Kill it first.
 * params: keepDistance, summonCount, maxMinions, attackRange, windupMs, cooldownMs
 */
export class SummonerBrain extends PhaseBrain<Phase> {
  phase: Phase = 'patrol';
  private minions: Enemy[] = [];
  private nextToss = 0;

  onAggro(e: Enemy): void {
    audio.sfx('enemyAlert', { volume: 0.35, pitch: 0.6 });
    this.set(e, 'position');
    this.nextAttack = e.now + 800;
    this.nextToss = e.now + 1600;
  }

  update(e: Enemy): void {
    const p = e.def.params;
    if (e.player.state2 === 'dead') {
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
        const dx = e.dxToPlayer();
        const dist = e.distToPlayer();
        const keep = p.keepDistance ?? 110;
        const sees = e.seesPlayerCached();
        if (dist < keep) {
          const away = -Math.sign(dx) || 1;
          if (!e.atEdge(away) && !e.wallAhead(away) && !e.hazardAhead(away)) {
            e.body.velocity.x = away * e.speed * 1.1 * e.slowMult;
            e.facing = away as 1 | -1;
            e.playAnim('move');
          } else {
            e.halt();
            e.facePlayer();
            e.playAnim('idle');
          }
        } else if (!sees && dist > keep * 1.6) {
          if (e.walk(Math.sign(dx) || 1, 0.7)) e.playAnim('move');
          else e.playAnim('idle');
        } else {
          e.halt();
          e.facePlayer();
          e.playAnim('idle');
        }
        if (!e.grounded) break;
        this.minions = this.minions.filter((m) => m.alive);
        if (this.ready(e) && this.minions.length < (p.maxMinions ?? 4) && dist < (p.attackRange ?? 200) * 1.2) {
          e.halt();
          e.telegraph();
          audio.sfx('magic', { volume: 0.35, pitch: 0.5 });
          e.world.juice.ring(e.centerX, e.body.bottom - 2, 30, 0x9a4aff, this.windupMs(e));
          this.set(e, 'ritual', this.windupMs(e));
        } else if (e.now >= this.nextToss && sees && dist < (p.attackRange ?? 200)) {
          e.halt();
          e.facePlayer();
          e.telegraph();
          this.set(e, 'toss', 500);
        }
        if (dist > (p.aggroRange ?? 240) * 2.5) this.set(e, 'patrol');
        break;
      }
      case 'ritual':
        e.halt();
        if (Math.random() < 0.6) {
          const ox = (Math.random() * 2 - 1) * 26;
          e.world.juice.burst(e.centerX + ox, e.body.bottom - 2, { count: 1, tint: [0x9a4aff, 0x3a1a50], speed: [10, 40], angle: [250, 290], gravity: -60, life: [200, 450], blendAdd: true });
        }
        if (this.done(e)) {
          this.summon(e);
          this.cooldown(e);
          this.set(e, 'recover', 600);
        }
        break;
      case 'toss':
        e.halt();
        e.facePlayer();
        if (this.done(e)) {
          e.playAnim('attack', true);
          const dx = e.player.centerX - e.centerX;
          const dy = e.player.centerY - e.centerY;
          const len = Math.hypot(dx, dy) || 1;
          e.shoot('bone', 190, { dirX: dx / len, dirY: dy / len - 0.45, gravity: 380, spin: 720, lifeMs: 2200, mult: 0.8 });
          this.nextToss = e.now + 2400 * e.cooldownMult;
          this.set(e, 'recover', 400);
        }
        break;
      case 'recover':
        e.halt();
        if (this.done(e)) this.set(e, 'position');
        break;
    }
  }

  private summon(e: Enemy): void {
    const p = e.def.params;
    e.playAnim('attack', true);
    audio.sfx('magic', { volume: 0.45, pitch: 0.6 });
    const n = Math.min(p.summonCount ?? 2, (p.maxMinions ?? 4) - this.minions.length);
    for (let i = 0; i < n; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      let x = e.centerX + side * (18 + 10 * Math.floor(i / 2));
      // Keep minions on solid footing.
      if (e.world.isSolidAt(x, e.body.bottom - 8) || !e.world.isSolidAt(x, e.body.bottom + 4)) x = e.centerX;
      const m = e.world.spawnEnemy(SUMMON_ID, x, e.body.bottom, { summoned: true });
      if (!m) continue;
      this.minions.push(m);
      m.forceAggro();
      m.setAlpha(0);
      e.scene.tweens.add({ targets: m, alpha: 1, duration: 350 });
      e.world.juice.burst(x, e.body.bottom - 6, { count: 10, tint: [0x9a4aff, 0xd8c8a0], speed: [30, 100], angle: [220, 320], blendAdd: true });
    }
  }

  onDeath(): void {
    // Minions crumble when their priest dies.
    for (const m of this.minions) if (m.alive) m.takeDamage(m.hp + 1, false);
    this.minions = [];
  }

  protected override onInterrupt(e: Enemy): void {
    this.set(e, 'recover', 400);
  }
}
