/**
 * Typed global event bus shared by the GameScene and the HUD/UI scenes.
 * Lives outside Phaser so it survives scene restarts; call `bus.clear()` only
 * when tearing down a run.
 */
import type { ItemInstance, StatTrack } from '../data/types';

export interface GameEvents {
  'player:hp': { hp: number; max: number };
  'player:potions': { charges: number; max: number };
  'player:died': { cause: string };
  'player:revived': {};
  'run:coins': { coins: number; delta: number };
  'run:embers': { unbanked: number; banked: number; delta: number };
  'run:kills': { kills: number };
  'run:floor': { floor: number; biome: string; biomeName: string; tagline: string; isBoss: boolean };
  'run:loadout': {
    weapons: (ItemInstance | null)[];
    skills: (ItemInstance | null)[];
    relics: ItemInstance[];
  };
  'run:scrolls': Record<StatTrack, number>;
  'run:ended': { depth: number };
  'skill:cooldown': { slot: number; remaining: number; total: number };
  'boss:show': { name: string; title: string; hp: number; max: number };
  'boss:hp': { hp: number; max: number };
  'boss:hide': {};
  /** Short message shown on screen (pickups, warnings). */
  toast: { text: string; color?: number };
  /** Interaction prompt near an interactable; null hides it. */
  prompt: { text: string | null };
  /** Ask the UI to open a modal: item swap, merchant, altar. Payload is UI-specific. */
  'ui:open': { kind: 'swap' | 'merchant' | 'altar'; data: unknown };
  'ui:closed': { kind: string };
  'game:pause': { paused: boolean };
}

type Handler<T> = (payload: T) => void;

class EventBus {
  private handlers = new Map<keyof GameEvents, Set<Handler<any>>>();

  on<K extends keyof GameEvents>(ev: K, fn: Handler<GameEvents[K]>): () => void {
    let set = this.handlers.get(ev);
    if (!set) this.handlers.set(ev, (set = new Set()));
    set.add(fn);
    return () => this.off(ev, fn);
  }

  off<K extends keyof GameEvents>(ev: K, fn: Handler<GameEvents[K]>): void {
    this.handlers.get(ev)?.delete(fn);
  }

  emit<K extends keyof GameEvents>(ev: K, payload: GameEvents[K]): void {
    const set = this.handlers.get(ev);
    if (!set) return;
    for (const fn of [...set]) fn(payload);
  }

  clear(): void {
    this.handlers.clear();
  }
}

export const bus = new EventBus();
