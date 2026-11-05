import type { SkillDef } from './types';

/**
 * Skill definitions. `damage` is the floor-1, common, no-scroll damage per hit/tick.
 *
 * Behavior params (all distances px, times ms):
 *  grenade: radius, fuseMs, throwSpeed            — thrown arcing bomb, explodes on fuse or impact
 *  nova:    radius                                 — instant ring around the player
 *  trap:    durationMs, width, tickMs, maxHits     — placed on ground, damages enemies standing on it
 *  turret:  durationMs, fireRateMs, range, projectileSpeed — auto-aims at nearest enemy
 *  dash:    distance, iframesMs                    — dash forward, damaging everything passed through
 *  buff:    durationMs, damagePct, moveSpeedPct    — self buff (stacks additively with stats)
 *  chain:   jumps, range                           — lightning to nearest enemy then chains
 *  cloud:   radius, durationMs, tickMs, throwSpeed — lingering poison area
 *  orbit:   count, radius, durationMs, tickMs      — blades circling the player, hit on contact (per tick)
 *  meteor:  radius, delayMs                        — marks the ground at the nearest enemy (or ahead), impacts after delay
 */
export const SKILLS: Record<string, SkillDef> = {
  fire_grenade: {
    id: 'fire_grenade',
    name: 'Fire Grenade',
    desc: 'Throw a grenade that explodes and sets enemies on fire.',
    track: 'might',
    behavior: 'grenade',
    cooldownMs: 9000,
    damage: 30,
    status: { status: 'burn', chance: 1, durationMs: 3000 },
    params: { radius: 40, fuseMs: 900, throwSpeed: 260 },
    unlockCost: 0,
    starter: true,
  },
  frost_nova: {
    id: 'frost_nova',
    name: 'Frost Nova',
    desc: 'Release a ring of frost that freezes nearby enemies.',
    track: 'vigor',
    behavior: 'nova',
    cooldownMs: 12000,
    damage: 12,
    status: { status: 'freeze', chance: 1, durationMs: 2500 },
    params: { radius: 64 },
    unlockCost: 0,
    starter: true,
  },
  spike_trap: {
    id: 'spike_trap',
    name: 'Spike Trap',
    desc: 'Place a trap that repeatedly impales and bleeds enemies.',
    track: 'cunning',
    behavior: 'trap',
    cooldownMs: 10000,
    damage: 8,
    status: { status: 'bleed', chance: 0.5, durationMs: 3000 },
    params: { durationMs: 8000, width: 32, tickMs: 500, maxHits: 30 },
    unlockCost: 0,
    starter: true,
  },
  bolt_turret: {
    id: 'bolt_turret',
    name: 'Bolt Turret',
    desc: 'Deploy a turret that fires at nearby enemies.',
    track: 'cunning',
    behavior: 'turret',
    cooldownMs: 16000,
    damage: 6,
    params: { durationMs: 12000, fireRateMs: 550, range: 180, projectileSpeed: 420 },
    unlockCost: 6,
  },
  phantom_dash: {
    id: 'phantom_dash',
    name: 'Phantom Dash',
    desc: 'Dash through enemies, damaging them and becoming briefly invulnerable.',
    track: 'cunning',
    behavior: 'dash',
    cooldownMs: 5000,
    damage: 18,
    params: { distance: 110, iframesMs: 350 },
    unlockCost: 8,
  },
  war_cry: {
    id: 'war_cry',
    name: 'War Cry',
    desc: 'Roar to gain bonus damage and speed for a short time.',
    track: 'might',
    behavior: 'buff',
    cooldownMs: 20000,
    damage: 0,
    params: { durationMs: 8000, damagePct: 0.4, moveSpeedPct: 0.2 },
    unlockCost: 7,
  },
  chain_lightning: {
    id: 'chain_lightning',
    name: 'Chain Lightning',
    desc: 'Lightning strikes the nearest enemy and jumps to others.',
    track: 'cunning',
    behavior: 'chain',
    cooldownMs: 7000,
    damage: 22,
    status: { status: 'stun', chance: 0.4, durationMs: 500 },
    params: { jumps: 4, range: 110 },
    unlockCost: 12,
  },
  poison_cloud: {
    id: 'poison_cloud',
    name: 'Miasma',
    desc: 'Throw a flask that leaves a lingering poison cloud.',
    track: 'vigor',
    behavior: 'cloud',
    cooldownMs: 13000,
    damage: 5,
    status: { status: 'poison', chance: 1, durationMs: 4000 },
    params: { radius: 48, durationMs: 6000, tickMs: 400, throwSpeed: 220 },
    unlockCost: 10,
  },
  orbiting_blades: {
    id: 'orbiting_blades',
    name: 'Orbiting Blades',
    desc: 'Spectral blades circle you, cutting anything they touch.',
    track: 'might',
    behavior: 'orbit',
    cooldownMs: 18000,
    damage: 7,
    params: { count: 3, radius: 30, durationMs: 8000, tickMs: 300 },
    unlockCost: 14,
  },
  meteor: {
    id: 'meteor',
    name: 'Meteor',
    desc: 'Call down a meteor that devastates an area after a short delay.',
    track: 'might',
    behavior: 'meteor',
    cooldownMs: 22000,
    damage: 80,
    status: { status: 'burn', chance: 1, durationMs: 4000 },
    params: { radius: 56, delayMs: 900 },
    unlockCost: 20,
  },
};
