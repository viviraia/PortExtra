import { expect, test } from '@playwright/test';
import { clickGame, collectErrors, open, realErrors, tap, waitForRun, waitForScene, waitFrames } from './helpers';

test.describe('menus → run', () => {
  test('title boots cleanly at / with no errors', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible({ timeout: 30_000 });
    // Give boot (texture generation) and the title a moment to run.
    await page.waitForTimeout(2500);
    expect(realErrors(errors)).toEqual([]);
  });

  test('keyboard: Title → Sanctum → Descend starts a run', async ({ page }) => {
    const errors = collectErrors(page);
    await open(page);
    await waitForScene(page, 'Title');
    await waitFrames(page, 10);
    await tap(page, 'Enter');
    await waitForScene(page, 'Sanctum');
    await waitFrames(page, 10);
    await tap(page, 'Enter');
    await waitForRun(page);
    const st = await page.evaluate(() => (window as any).__spire.state());
    expect(st.floor).toBe(1);
    expect(st.hp).toBeGreaterThan(0);
    expect(realErrors(errors)).toEqual([]);
  });

  test('mouse: clicking Descend on Title and in the Sanctum starts a run', async ({ page }) => {
    const errors = collectErrors(page);
    await open(page);
    await waitForScene(page, 'Title');
    await waitFrames(page, 10);
    await clickGame(page, 240, 140); // Title "Descend" button
    await waitForScene(page, 'Sanctum');
    await waitFrames(page, 10);
    await clickGame(page, 84, 252); // Sanctum DESCEND button
    await waitForRun(page);
    expect((await page.evaluate(() => (window as any).__spire.state())).floor).toBe(1);
    expect(realErrors(errors)).toEqual([]);
  });
});
