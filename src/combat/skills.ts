/**
 * Skill behaviors. castSkill dispatches on SkillDef.behavior.
 * Each behavior reads its numbers from SkillDef.params (see src/data/skills.ts).
 * Return false from a behavior to refuse the cast (no cooldown consumed).
 */
import Phaser from 'phaser';
import { audio } from '../core/audio';
import type { SkillBehavior } from '../data/types';
import type { PlayerCombat, SkillController } from './PlayerCombat';

export type SkillCast = (c: PlayerCombat, s: SkillController) => boolean | void;

const behaviors: Partial<Record<SkillBehavior, SkillCast>> = {};

/** Register/override a behavior implementation. */
export function registerSkill(b: SkillBehavior, fn: SkillCast): void {
  behaviors[b] = fn;
}

export function castSkill(c: PlayerCombat, s: SkillController): boolean | void {
  const fn = behaviors[s.def.behavior] ?? behaviors.nova;
  return fn?.(c, s);
}

/** Helper: hit everything in a circle with this skill's damage. */
export function skillAoe(c: PlayerCombat, s: SkillController, x: number, y: number, r: number, mult = 1, kb = 120): number {
  const rect = new Phaser.Geom.Rectangle(x - r, y - r, r * 2, r * 2);
  const hits = c.world.hitEnemiesInRect(rect, (e) => {
    const dx = e.body.center.x - x;
    return c.makeHit(e, {
      item: s.item,
      def: { baseDamage: s.def.damage, track: s.def.track },
      mult,
      kb,
      kbY: -120,
      dirX: dx || 1,
      onHit: s.def.status,
      source: s.def.name,
    });
  });
  // Filter to actual circle (rect query is a superset) is skipped for feel; radius is generous.
  return hits.length;
}

// ---- default implementations ------------------------------------------------

registerSkill('grenade', (c, s) => {
  const p = c.player;
  const aim = c.aim(false);
  const radius = s.def.params.radius ?? 36;
  audio.sfx('grenadeThrow');
  c.world.projectiles.fire({
    owner: 'player',
    key: 'grenade',
    x: p.centerX + p.facing * 6,
    y: p.centerY - 6,
    vx: (aim.manual ? aim.x : p.facing) * 190,
    vy: aim.manual ? Math.min(-120, aim.y * 220 - 120) : -200,
    gravity: 700,
    lifeMs: s.def.params.fuseMs ?? 900,
    pierce: 0,
    explodeOnExpire: true,
    explodeRadius: radius,
    bounce: 0.4,
    hitEnemies: false,
    onExplode: (x, y) => {
      audio.sfx('explosion');
      c.world.juice.fx(x, y, 'fx-explosion', { scale: radius / 24 });
      c.world.juice.shake(0.006, 160);
      skillAoe(c, s, x, y, radius, 1, 180);
    },
  });
});

registerSkill('nova', (c, s) => {
  const p = c.player;
  const r = s.def.params.radius ?? 56;
  audio.sfx(s.def.status?.status === 'freeze' ? 'freeze' : 'magic');
  c.world.juice.ring(p.centerX, p.centerY, r, s.def.status?.status === 'freeze' ? 0x9be7ff : 0xffffff, 300);
  c.world.juice.burst(p.centerX, p.centerY, { count: 20, tint: [0x9be7ff, 0xffffff], speed: [80, 200], gravity: 0, life: [200, 400], blendAdd: true });
  skillAoe(c, s, p.centerX, p.centerY, r, 1, 160);
});
