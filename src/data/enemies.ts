import type { EnemyDef } from './types';

/**
 * Enemy definitions. hp/damage are floor-1 values; the runtime multiplies by
 * Difficulty.hpMult / dmgMult. Sizes are physics body px.
 *
 * Common params (all AIs): aggroRange (px, line-of-sight distance to notice
 *   the player), attackRange (px, start an attack when closer), windupMs
 *   (telegraph before the hit), cooldownMs (between attacks).
 * AI-specific params:
 *  walker:       contact damage + short swipe in attackRange.
 *  jumper:       jumpVx, jumpVy — leaps at the player.
 *  archer:       projectileSpeed, keepDistance (backs off if closer).
 *  flyer:        swoopSpeed — hovers then swoops in a line at the player.
 *  shieldbearer: blockFrac (frontal damage blocked), attack is a shove + strike.
 *  diver:        diveSpeed, hoverHeight — hovers above, dives straight down/diagonal.
 *  bomber:       projectileSpeed, bombRadius, fuseMs — lobs arcing bombs.
 *  charger:      chargeSpeed, chargeMs — telegraphs then rushes, stunned on wall hit (stunMs).
 *  caster:       projectileSpeed, homing (turn rate rad/s), teleportCooldownMs.
 *  ghost:        phaseMs — passes through walls, becomes intangible periodically.
 *  ambusher:     wakeRange — dormant until the player is within wakeRange, then lunges (jumpVx, jumpVy).
 *  brute:        slamRadius — slow, huge overhead slam with shockwave.
 *  summoner:     summonId, summonCount, maxMinions — summons minions, keeps distance.
 */
export const ENEMIES: Record<string, EnemyDef> = {
  zombie: {
    id: 'zombie', name: 'Shambler', biomes: ['cells', 'ramparts'], minFloor: 1, weight: 10, ai: 'walker',
    hp: 40, damage: 10, speed: 38, w: 12, h: 22, coins: [2, 4], emberChance: 0.02,
    params: { aggroRange: 160, attackRange: 22, windupMs: 450, cooldownMs: 1100 },
  },
  rat: {
    id: 'rat', name: 'Plague Rat', biomes: ['cells'], minFloor: 1, weight: 8, ai: 'jumper',
    hp: 20, damage: 8, speed: 85, w: 12, h: 8, coins: [1, 2], emberChance: 0.01,
    params: { aggroRange: 170, attackRange: 70, windupMs: 300, cooldownMs: 1300, jumpVx: 170, jumpVy: -200 },
  },
  skeleton_archer: {
    id: 'skeleton_archer', name: 'Bone Archer', biomes: ['cells', 'ramparts'], minFloor: 2, weight: 6, ai: 'archer',
    hp: 30, damage: 12, speed: 40, w: 12, h: 22, coins: [2, 5], emberChance: 0.03,
    params: { aggroRange: 240, attackRange: 220, windupMs: 650, cooldownMs: 1800, projectileSpeed: 220, keepDistance: 70 },
  },
  bat: {
    id: 'bat', name: 'Gloom Bat', biomes: ['cells', 'ramparts'], minFloor: 1, weight: 6, ai: 'flyer', flying: true,
    hp: 22, damage: 9, speed: 60, w: 12, h: 10, coins: [1, 3], emberChance: 0.02,
    params: { aggroRange: 190, attackRange: 110, windupMs: 400, cooldownMs: 1600, swoopSpeed: 210 },
  },
  shield_knight: {
    id: 'shield_knight', name: 'Shield Knight', biomes: ['ramparts', 'throne'], minFloor: 6, weight: 7, ai: 'shieldbearer',
    hp: 60, damage: 13, speed: 34, w: 14, h: 24, coins: [3, 6], emberChance: 0.05,
    params: { aggroRange: 170, attackRange: 26, windupMs: 550, cooldownMs: 1300, blockFrac: 0.85 },
  },
  imp: {
    id: 'imp', name: 'Gargoyle Imp', biomes: ['ramparts'], minFloor: 6, weight: 7, ai: 'diver', flying: true,
    hp: 30, damage: 12, speed: 70, w: 14, h: 12, coins: [2, 4], emberChance: 0.03,
    params: { aggroRange: 220, attackRange: 140, windupMs: 500, cooldownMs: 1700, diveSpeed: 280, hoverHeight: 70 },
  },
  bomber: {
    id: 'bomber', name: 'Powder Monk', biomes: ['ramparts', 'library'], minFloor: 7, weight: 5, ai: 'bomber',
    hp: 36, damage: 16, speed: 35, w: 12, h: 22, coins: [3, 5], emberChance: 0.04,
    params: { aggroRange: 220, attackRange: 180, windupMs: 600, cooldownMs: 2200, projectileSpeed: 220, bombRadius: 32, fuseMs: 900 },
  },
  lancer: {
    id: 'lancer', name: 'Lancer', biomes: ['ramparts', 'throne'], minFloor: 8, weight: 5, ai: 'charger',
    hp: 50, damage: 15, speed: 40, w: 14, h: 24, coins: [3, 6], emberChance: 0.05,
    params: { aggroRange: 220, attackRange: 160, windupMs: 700, cooldownMs: 2000, chargeSpeed: 300, chargeMs: 800, stunMs: 1200 },
  },
  cultist: {
    id: 'cultist', name: 'Ink Cultist', biomes: ['library', 'throne'], minFloor: 11, weight: 7, ai: 'caster',
    hp: 38, damage: 14, speed: 30, w: 12, h: 22, coins: [3, 6], emberChance: 0.05,
    params: { aggroRange: 240, attackRange: 200, windupMs: 700, cooldownMs: 2200, projectileSpeed: 120, homing: 2.2, teleportCooldownMs: 5000 },
  },
  ghost: {
    id: 'ghost', name: 'Hollow Shade', biomes: ['library'], minFloor: 11, weight: 6, ai: 'ghost', flying: true,
    hp: 34, damage: 13, speed: 45, w: 14, h: 18, coins: [2, 5], emberChance: 0.04,
    params: { aggroRange: 260, attackRange: 24, windupMs: 450, cooldownMs: 1400, phaseMs: 1500 },
  },
  book_mimic: {
    id: 'book_mimic', name: 'Tome Mimic', biomes: ['library'], minFloor: 11, weight: 5, ai: 'ambusher',
    hp: 45, damage: 16, speed: 70, w: 14, h: 12, coins: [5, 9], emberChance: 0.06,
    params: { aggroRange: 200, attackRange: 80, windupMs: 250, cooldownMs: 1100, wakeRange: 60, jumpVx: 200, jumpVy: -220 },
  },
  royal_guard: {
    id: 'royal_guard', name: 'Royal Guard', biomes: ['throne'], minFloor: 16, weight: 7, ai: 'brute',
    hp: 90, damage: 20, speed: 30, w: 18, h: 28, coins: [5, 9], emberChance: 0.07,
    params: { aggroRange: 180, attackRange: 40, windupMs: 900, cooldownMs: 1800, slamRadius: 56 },
  },
  necromancer: {
    id: 'necromancer', name: 'Bone Priest', biomes: ['library', 'throne'], minFloor: 12, weight: 4, ai: 'summoner',
    hp: 44, damage: 10, speed: 30, w: 12, h: 24, coins: [5, 8], emberChance: 0.08,
    params: { aggroRange: 240, attackRange: 200, windupMs: 900, cooldownMs: 4500, summonCount: 2, maxMinions: 4, keepDistance: 110 },
  },
};

/** The minion spawned by the necromancer (summoner AI). */
export const SUMMON_ID = 'zombie';
