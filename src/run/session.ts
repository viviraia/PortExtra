/** Holds the in-progress run across GameScene restarts (one per floor). */
import type { RunState } from './RunState';

export const session: { run: RunState | null; godMode: boolean } = {
  run: null,
  godMode: false,
};
