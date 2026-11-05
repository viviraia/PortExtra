import { expect, test, type Page } from '@playwright/test';
import { collectErrors, open, realErrors, toPage, waitForRun, waitFrames } from './helpers';

/** Touch button centers in game coordinates (see src/core/input/TouchScene.ts). */
const JUMP = { x: 444, y: 228 };
const ATTACK = { x: 400, y: 238 };

async function tapGame(page: Page, g: { x: number; y: number }): Promise<void> {
  const p = await toPage(page, g.x, g.y);
  await page.touchscreen.tap(p.x, p.y);
  await waitFrames(page, 3);
}

test.describe('mobile (touch)', () => {
  test('touch controls render; tapping jump and attack works', async ({ page }) => {
    const errors = collectErrors(page);
    await open(page, 'start=game');
    await waitForRun(page);
    await page.evaluate(() => {
      const s = (window as any).__spire;
      s.god(true);
      s.killAll();
    });

    // Touch overlay is running and visible.
    await page.waitForFunction(() => {
      const g = (window as any).__game;
      return g.scene.isActive('Touch') && g.scene.getScene('Touch').shown === true;
    }, null, { timeout: 15_000 });

    // Jump: y goes up at some point after tapping the jump button.
    await page.waitForFunction(() => (window as any).__spire.scene.player.grounded, null, { timeout: 15_000 });
    const y0 = await page.evaluate(() => (window as any).__spire.scene.player.y);
    await page.evaluate((base) => {
      const w = window as any;
      w.__minY = base;
      w.__stop = false;
      const tick = () => {
        const y = w.__spire.scene.player.y;
        if (y < w.__minY) w.__minY = y;
        if (!w.__stop) requestAnimationFrame(tick);
      };
      tick();
    }, y0);
    let jumped = false;
    for (let i = 0; i < 3 && !jumped; i++) {
      await tapGame(page, JUMP);
      jumped = await page
        .waitForFunction((base) => (window as any).__minY < base - 12, y0, { timeout: 5_000 })
        .then(() => true)
        .catch(() => false);
    }
    await page.evaluate(() => ((window as any).__stop = true));
    expect(jumped).toBe(true);

    // Attack: the weapon becomes busy / attack pose plays.
    await page.waitForFunction(() => (window as any).__spire.scene.player.grounded, null, { timeout: 15_000 });
    await page.evaluate(() => {
      const w = window as any;
      w.__attacked = false;
      const tick = () => {
        const p = w.__spire.scene.player;
        const key: string = p.anims?.currentAnim?.key ?? '';
        if (p.combat.busy || /attack|stab|shoot/.test(key)) w.__attacked = true;
        if (!w.__attacked) requestAnimationFrame(tick);
      };
      tick();
    });
    let attacked = false;
    for (let i = 0; i < 3 && !attacked; i++) {
      await tapGame(page, ATTACK);
      attacked = await page
        .waitForFunction(() => (window as any).__attacked === true, null, { timeout: 5_000 })
        .then(() => true)
        .catch(() => false);
    }
    expect(attacked).toBe(true);

    expect(await page.evaluate(() => (window as any).__spire.state().hp)).toBeGreaterThan(0);
    expect(realErrors(errors)).toEqual([]);
  });
});
