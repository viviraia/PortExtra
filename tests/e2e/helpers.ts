/**
 * Shared helpers for the e2e suite. Headless Chromium runs the game at a low
 * and variable frame rate, so everything here polls game state instead of
 * relying on fixed sleeps.
 */
import { expect, type Page } from '@playwright/test';

export const SAVE_KEY = 'hollow-spire-save';
export const GAME_W = 480;
export const GAME_H = 270;

/** Collect page errors and console errors for the lifetime of the page. */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  return errors;
}

/** Navigate with the debug hooks enabled. `params` is appended to ?debug=1. */
export async function open(page: Page, params = ''): Promise<void> {
  await page.goto(`/?debug=1${params ? '&' + params : ''}`);
  await page.waitForFunction(() => !!(window as any).__game, null, { timeout: 30_000 });
}

/**
 * Write a (partial) save before the game boots (call before the first goto).
 * Seeds only once per tab, so later reloads see what the game persisted.
 * The game normalizes partial saves on load.
 */
export async function seedSave(page: Page, save: Record<string, unknown>): Promise<void> {
  await page.addInitScript(
    ([k, v]) => {
      if (sessionStorage.getItem('__e2e_seeded')) return;
      sessionStorage.setItem('__e2e_seeded', '1');
      localStorage.setItem(k, v);
    },
    [SAVE_KEY, JSON.stringify({ version: 1, ...save })] as const,
  );
}

export async function readSave(page: Page): Promise<any> {
  return page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), SAVE_KEY);
}

export async function waitForScene(page: Page, key: string, timeout = 30_000): Promise<void> {
  await page.waitForFunction((k) => (window as any).__game?.scene?.isActive(k), key, { timeout });
}

export async function waitForSceneGone(page: Page, key: string, timeout = 30_000): Promise<void> {
  await page.waitForFunction((k) => !(window as any).__game?.scene?.isActive(k), key, { timeout });
}

export async function isSceneActive(page: Page, key: string): Promise<boolean> {
  return page.evaluate((k) => !!(window as any).__game?.scene?.isActive(k), key);
}

/** Wait until a GameScene with debug hooks is running and the player exists. */
export async function waitForRun(page: Page, timeout = 30_000): Promise<void> {
  await waitForScene(page, 'Game', timeout);
  await page.waitForFunction(
    () => {
      const s = (window as any).__spire;
      return !!s && s.scene?.sys?.isActive() && !!s.scene.player?.body && s.scene.layout;
    },
    null,
    { timeout },
  );
  // Let a few frames run so the HUD/Touch overlays have been created.
  await waitFrames(page, 5);
}

export async function state(page: Page): Promise<any> {
  return page.evaluate(() => (window as any).__spire.state());
}

/** Wait for `n` rendered game frames (frame rate independent). */
export async function waitFrames(page: Page, n: number): Promise<void> {
  const start = await page.evaluate(() => (window as any).__game.loop.frame as number);
  await page.waitForFunction((target) => (window as any).__game.loop.frame >= target, start + n, { timeout: 30_000 });
}

/**
 * Tap a key: a short (wall-clock) press. The InputManager registers presses
 * that start and end within one frame, and a short hold avoids triggering
 * menu auto-repeat (350ms) on slow headless frame rates. Then wait a few
 * frames so the game has consumed the edge.
 */
export async function tap(page: Page, key: string): Promise<void> {
  await page.keyboard.press(key, { delay: 40 });
  await waitFrames(page, 3);
}

/** Hold a key for `ms` of wall-clock time (e.g. a full-height jump). */
export async function hold(page: Page, key: string, ms: number): Promise<void> {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
  await waitFrames(page, 2);
}

/** Convert game coordinates (480x270) to page coordinates. */
export async function toPage(page: Page, gx: number, gy: number): Promise<{ x: number; y: number }> {
  const box = await page.locator('canvas').boundingBox();
  expect(box).not.toBeNull();
  return { x: box!.x + (gx * box!.width) / GAME_W, y: box!.y + (gy * box!.height) / GAME_H };
}

export async function clickGame(page: Page, gx: number, gy: number): Promise<void> {
  const p = await toPage(page, gx, gy);
  await page.mouse.move(p.x, p.y);
  await waitFrames(page, 2);
  await page.mouse.down();
  await waitFrames(page, 2);
  await page.mouse.up();
  await waitFrames(page, 2);
}

/** Errors we tolerate (GPU driver chatter from headless WebGL). */
export function realErrors(errors: string[]): string[] {
  return errors.filter((e) => !/GL Driver Message|GPU stall/i.test(e));
}

/** Teleport the player to a world position (feet). */
export async function teleport(page: Page, x: number, y: number): Promise<void> {
  await page.evaluate(
    ([px, py]) => {
      const p = (window as any).__spire.scene.player;
      p.body.reset(px, py);
      p.body.velocity.set(0, 0);
    },
    [x, y] as const,
  );
  await waitFrames(page, 3);
}
