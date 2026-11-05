/** Audio contract. Implemented by src/core/audio/index.ts using WebAudio synthesis only. */
import type { BiomeId } from '../../data/types';

export type SfxName =
  | 'jump' | 'doubleJump' | 'land' | 'dodge' | 'step'
  | 'swing' | 'swingHeavy' | 'stab' | 'hit' | 'crit' | 'enemyHurt' | 'enemyDie'
  | 'playerHurt' | 'playerDie' | 'block' | 'parry'
  | 'bow' | 'crossbow' | 'throw' | 'magic' | 'zap' | 'fire' | 'freeze' | 'poison'
  | 'explosion' | 'grenadeThrow' | 'turret' | 'trap'
  | 'coin' | 'ember' | 'pickup' | 'itemRare' | 'itemLegendary' | 'potion' | 'heal' | 'scroll'
  | 'chest' | 'door' | 'portal' | 'spikes'
  | 'enemyAlert' | 'enemyShoot' | 'enemyWindup'
  | 'bossRoar' | 'bossSlam' | 'bossDie'
  | 'uiMove' | 'uiSelect' | 'uiBack' | 'buy' | 'denied' | 'unlock';

export type MusicTheme = BiomeId | 'title' | 'sanctum' | 'boss' | 'death';

export interface SfxOptions {
  /** 0..1 multiplier. */
  volume?: number;
  /** Pitch multiplier (1 = normal). Small random variation is applied automatically. */
  pitch?: number;
  /** -1..1 stereo pan. */
  pan?: number;
}

export interface AudioApi {
  /** Resume/create the AudioContext; call from a user gesture. Safe to call repeatedly. */
  unlock(): void;
  sfx(name: SfxName, opts?: SfxOptions): void;
  /** Crossfade to a theme; null stops music. Same theme = no-op. */
  music(theme: MusicTheme | null): void;
  setVolumes(master: number, music: number, sfx: number): void;
  /** Temporarily muffle music (pause menu, low HP). 0..1 amount. */
  setMuffle(amount: number): void;
}
