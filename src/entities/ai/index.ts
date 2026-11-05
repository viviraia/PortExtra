import type { AiKind } from '../../data/types';
import type { AiBrain, BrainFactory } from './types';
import { WalkerBrain } from './walker';

export type { AiBrain } from './types';

/** Registry of brains by AiKind. Unimplemented kinds fall back to the walker. */
const BRAINS: Partial<Record<AiKind, BrainFactory>> = {
  walker: () => new WalkerBrain(),
};

export function registerBrain(kind: AiKind, f: BrainFactory): void {
  BRAINS[kind] = f;
}

export function createBrain(kind: AiKind): AiBrain {
  return (BRAINS[kind] ?? BRAINS.walker!)();
}
