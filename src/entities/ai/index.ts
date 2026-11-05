import type { AiKind } from '../../data/types';
import type { AiBrain, BrainFactory } from './types';
import { WalkerBrain } from './walker';
import { JumperBrain } from './jumper';
import { ArcherBrain } from './archer';
import { FlyerBrain } from './flyer';
import { ShieldbearerBrain } from './shieldbearer';
import { DiverBrain } from './diver';
import { BomberBrain } from './bomber';
import { ChargerBrain } from './charger';
import { CasterBrain } from './caster';
import { GhostBrain } from './ghost';
import { AmbusherBrain } from './ambusher';
import { BruteBrain } from './brute';
import { SummonerBrain } from './summoner';

export type { AiBrain } from './types';

/** Registry of brains by AiKind. Unknown kinds fall back to the walker. */
const BRAINS: Partial<Record<AiKind, BrainFactory>> = {
  walker: () => new WalkerBrain(),
  jumper: () => new JumperBrain(),
  archer: () => new ArcherBrain(),
  flyer: () => new FlyerBrain(),
  shieldbearer: () => new ShieldbearerBrain(),
  diver: () => new DiverBrain(),
  bomber: () => new BomberBrain(),
  charger: () => new ChargerBrain(),
  caster: () => new CasterBrain(),
  ghost: () => new GhostBrain(),
  ambusher: () => new AmbusherBrain(),
  brute: () => new BruteBrain(),
  summoner: () => new SummonerBrain(),
};

export function registerBrain(kind: AiKind, f: BrainFactory): void {
  BRAINS[kind] = f;
}

export function createBrain(kind: AiKind): AiBrain {
  return (BRAINS[kind] ?? BRAINS.walker!)();
}
