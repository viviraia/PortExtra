import { expect, test, type Page } from '@playwright/test';
import { collectErrors, open, readSave, realErrors, seedSave, tap, waitForRun, waitForScene, waitFrames } from './helpers';

/** Select the first Sanctum row matching `pred` (focus must be on the list). */
async function selectRow(page: Page, kind: string, id?: string): Promise<string> {
  const picked = await page.evaluate(
    ([k, wanted]) => {
      const s = (window as any).__game.scene.getScene('Sanctum');
      const save = JSON.parse(localStorage.getItem('hollow-spire-save') ?? '{}');
      const idx = s.rows.findIndex((r: any) => {
        if (!r.selectable || r.action.kind !== k) return false;
        if (wanted) return r.action.id === wanted;
        if (k === 'unlock') return !(save.unlocked ?? []).includes(r.action.id);
        return true;
      });
      if (idx < 0) return null;
      s.sel = idx;
      s.drawSelection?.();
      return s.rows[idx].action.id as string;
    },
    [kind, id ?? null] as const,
  );
  expect(picked, `no sanctum row of kind ${kind}`).not.toBeNull();
  await waitFrames(page, 3);
  return picked!;
}

async function currentTab(page: Page): Promise<string> {
  return page.evaluate(() => (window as any).__game.scene.getScene('Sanctum').tab);
}

async function gotoTab(page: Page, tab: string): Promise<void> {
  for (let i = 0; i < 6 && (await currentTab(page)) !== tab; i++) await tap(page, 'KeyE');
  expect(await currentTab(page)).toBe(tab);
}

async function focusList(page: Page): Promise<void> {
  for (let i = 0; i < 3; i++) {
    if ((await page.evaluate(() => (window as any).__game.scene.getScene('Sanctum').focus)) === 'list') return;
    await tap(page, 'ArrowUp');
  }
  expect(await page.evaluate(() => (window as any).__game.scene.getScene('Sanctum').focus)).toBe('list');
}

test.describe('Sanctum meta progression', () => {
  test('buying an upgrade persists across reload and applies to the next run', async ({ page }) => {
    const errors = collectErrors(page);
    await seedSave(page, { coins: 5000, embers: 100 });
    await open(page, 'start=sanctum');
    await waitForScene(page, 'Sanctum');
    await waitFrames(page, 10);
    expect(await currentTab(page)).toBe('upgrades');
    await focusList(page);
    const id = await selectRow(page, 'upgrade');
    await tap(page, 'Enter');
    await page.waitForFunction((k) => JSON.parse(localStorage.getItem('hollow-spire-save')!).upgrades?.[k] === 1, id, { timeout: 15_000 });
    const save = await readSave(page);
    expect(save.coins).toBeLessThan(5000);

    // Reload: the purchase is loaded back by the game, and the next run uses it.
    await page.reload();
    await page.waitForFunction(() => !!(window as any).__game, null, { timeout: 30_000 });
    await waitForScene(page, 'Sanctum');
    await waitFrames(page, 10);
    expect((await readSave(page)).upgrades[id]).toBe(1);
    await tap(page, 'Enter'); // focus starts on DESCEND
    await waitForRun(page);
    expect(await page.evaluate((k) => (window as any).__spire.scene.run.upgrades[k], id)).toBe(1);
    expect(realErrors(errors)).toEqual([]);
  });

  test('unlocking an armory item with embers persists', async ({ page }) => {
    const errors = collectErrors(page);
    await seedSave(page, { coins: 0, embers: 100 });
    await open(page, 'start=sanctum');
    await waitForScene(page, 'Sanctum');
    await waitFrames(page, 10);
    await gotoTab(page, 'armory');
    await focusList(page);
    const id = await selectRow(page, 'unlock');
    await tap(page, 'Enter');
    await page.waitForFunction((k) => (JSON.parse(localStorage.getItem('hollow-spire-save')!).unlocked ?? []).includes(k), id, { timeout: 15_000 });
    expect((await readSave(page)).embers).toBeLessThan(100);

    await page.reload();
    await page.waitForFunction(() => !!(window as any).__game, null, { timeout: 30_000 });
    await waitForScene(page, 'Sanctum');
    expect((await readSave(page)).unlocked).toContain(id);
    expect(realErrors(errors)).toEqual([]);
  });

  test('loadout choice starts the next run with that weapon', async ({ page }) => {
    const errors = collectErrors(page);
    await open(page, 'start=sanctum');
    await waitForScene(page, 'Sanctum');
    await waitFrames(page, 10);
    await gotoTab(page, 'loadout');
    await focusList(page);
    await selectRow(page, 'weapon', 'hunter_bow');
    await tap(page, 'Enter');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('hollow-spire-save')!).loadout.weapon === 'hunter_bow', null, { timeout: 15_000 });

    // Back to DESCEND, then descend.
    await tap(page, 'Escape');
    await page.waitForFunction(() => (window as any).__game.scene.getScene('Sanctum').focus === 'descend', null, { timeout: 10_000 });
    await tap(page, 'Enter');
    await waitForRun(page);
    expect(await page.evaluate(() => (window as any).__spire.scene.run.weapons[0]?.defId)).toBe('hunter_bow');
    expect(realErrors(errors)).toEqual([]);
  });
});
