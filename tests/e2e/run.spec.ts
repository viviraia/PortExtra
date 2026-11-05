import { expect, test } from '@playwright/test';
import { clickGame, collectErrors, hold, open, readSave, realErrors, state, tap, waitForRun, waitForScene, waitFrames } from './helpers';

test.describe('in a run', () => {
  test('keyboard moves, jumps and attacks; mouse click attacks', async ({ page }) => {
    const errors = collectErrors(page);
    await open(page, 'start=game');
    await waitForRun(page);
    await page.evaluate(() => (window as any).__spire.god(true));
    await page.evaluate(() => (window as any).__spire.killAll());
    // Let the player settle on the ground.
    await page.waitForFunction(() => (window as any).__spire.scene.player.grounded, null, { timeout: 15_000 });

    // Walk: hold left/right until x changes clearly (either direction may be blocked by a wall).
    const x0 = (await state(page)).player.x;
    for (const key of ['KeyD', 'KeyA']) {
      await page.keyboard.down(key);
      await waitFrames(page, 20);
      await page.keyboard.up(key);
      if (Math.abs((await state(page)).player.x - x0) > 8) break;
    }
    expect(Math.abs((await state(page)).player.x - x0)).toBeGreaterThan(8);

    // Jump: y must go up (smaller) at some point.
    await page.waitForFunction(() => (window as any).__spire.scene.player.grounded, null, { timeout: 15_000 });
    const y0 = (await state(page)).player.y;
    await page.evaluate((base) => {
      const w = window as any;
      w.__minY = base;
      const tick = () => {
        const y = w.__spire.scene.player.y;
        if (y < w.__minY) w.__minY = y;
        if (!w.__stopMinY) requestAnimationFrame(tick);
      };
      w.__stopMinY = false;
      tick();
    }, y0);
    await hold(page, 'Space', 200);
    await page.waitForFunction((base) => (window as any).__minY < base - 12, y0, { timeout: 15_000 });
    await page.evaluate(() => ((window as any).__stopMinY = true));

    // Keyboard attack (J): weapon slot 0 becomes busy / attack pose plays.
    await page.waitForFunction(() => (window as any).__spire.scene.player.grounded, null, { timeout: 15_000 });
    await expectAttack(page, async () => tap(page, 'KeyJ'));

    // Mouse attack (LMB anywhere on the canvas).
    await waitFrames(page, 30);
    await expectAttack(page, async () => clickGame(page, 300, 135));

    expect(realErrors(errors)).toEqual([]);
  });

  test('boss floor: boss present, exit sealed; killing it unlocks the exit; exit banks embers', async ({ page }) => {
    const errors = collectErrors(page);
    await open(page, 'start=game');
    await waitForRun(page);
    await page.evaluate(() => (window as any).__spire.god(true));
    await page.evaluate(() => (window as any).__spire.warp(5));
    await page.waitForFunction(() => (window as any).__spire.state().floor === 5 && (window as any).__spire.scene.sys.isActive(), null, { timeout: 30_000 });
    await waitForRun(page);

    const st = await state(page);
    expect(st.boss).toBe(true);
    expect(await page.evaluate(() => (window as any).__spire.scene.layout.isBoss)).toBe(true);
    expect(await page.evaluate(() => (window as any).__spire.scene.exitPortal.locked)).toBe(true);

    // Give some unbanked embers, then kill everything including the boss.
    await page.evaluate(() => (window as any).__spire.embers(3));
    const unbanked = (await state(page)).unbanked;
    expect(unbanked).toBeGreaterThanOrEqual(3);
    await page.evaluate(() => (window as any).__spire.killAll());
    await page.waitForFunction(() => (window as any).__spire.scene.exitPortal.locked === false, null, { timeout: 20_000 });

    // Use the exit.
    const before = await state(page);
    await page.evaluate(() => (window as any).__spire.teleportExit());
    await waitFrames(page, 6);
    await tap(page, 'KeyF');
    await page.waitForFunction(() => (window as any).__spire.state().floor === 6, null, { timeout: 30_000 });
    await waitForRun(page);
    const after = await state(page);
    expect(after.floor).toBe(6);
    expect(after.unbanked).toBe(0);
    expect(after.embers).toBe(before.embers + before.unbanked);
    expect((await readSave(page)).embers).toBe(after.embers);
    expect(realErrors(errors)).toEqual([]);
  });

  test('death: shows results, keeps coins, loses unbanked embers, records the run', async ({ page }) => {
    const errors = collectErrors(page);
    await open(page, 'start=game&floor=3');
    await waitForRun(page);
    await page.evaluate(() => {
      const s = (window as any).__spire;
      s.coins(50);
      s.embers(4);
    });
    const st = await state(page);
    expect(st.coins).toBeGreaterThanOrEqual(50);
    expect(st.unbanked).toBeGreaterThanOrEqual(4);
    const bankedBefore = st.embers;

    await page.evaluate(() => (window as any).__spire.die());
    await waitForScene(page, 'Death', 45_000);
    await waitFrames(page, 10);

    const save = await readSave(page);
    expect(save.coins).toBeGreaterThanOrEqual(st.coins);
    expect(save.embers).toBe(bankedBefore);
    expect(save.history.length).toBeGreaterThanOrEqual(1);
    expect(save.history[0].depth).toBe(3);
    expect(save.stats.runs).toBe(1);

    // Continue back to the Sanctum.
    await waitFrames(page, 60);
    await tap(page, 'Enter');
    await waitForScene(page, 'Sanctum', 30_000);
    expect(realErrors(errors)).toEqual([]);
  });
});

async function expectAttack(page: import('@playwright/test').Page, trigger: () => Promise<void>): Promise<void> {
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
  await trigger();
  await page.waitForFunction(() => (window as any).__attacked === true, null, { timeout: 15_000 });
  await waitFrames(page, 20);
}
