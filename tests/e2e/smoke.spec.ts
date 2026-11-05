import { expect, test } from '@playwright/test';

test('boots straight into a run without errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('/?debug=1&start=game');
  await page.waitForFunction(() => (window as any).__spire?.state, null, { timeout: 30_000 });
  await page.waitForTimeout(1500);
  const st = await page.evaluate(() => (window as any).__spire.state());
  expect(st.floor).toBe(1);
  expect(st.hp).toBeGreaterThan(0);
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(600);
  await page.keyboard.up('KeyD');
  await page.keyboard.press('Space');
  await page.keyboard.press('KeyJ');
  await page.waitForTimeout(500);
  const st2 = await page.evaluate(() => (window as any).__spire.state());
  expect(st2.player.x).not.toBe(st.player.x);
  expect(errors).toEqual([]);
});
