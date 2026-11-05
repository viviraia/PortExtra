import { expect, test, type Page } from '@playwright/test';
import { collectErrors, open, readSave, realErrors, tap, teleport, waitForRun, waitForScene, waitForSceneGone, waitFrames } from './helpers';

/** Start a calm run: god mode, no enemies, player on the ground. */
async function calmRun(page: Page, floor = 1): Promise<void> {
  await open(page, `start=game&floor=${floor}`);
  await waitForRun(page);
  await page.evaluate(() => {
    const s = (window as any).__spire;
    s.god(true);
    s.killAll();
  });
  await page.waitForFunction(() => (window as any).__spire.scene.player.grounded, null, { timeout: 15_000 });
}

/** Walk the floors (via warp) until an interactable matching `field` exists. Returns its position. */
async function findInteractable(page: Page, field: 'stock' | 'choices', floors: number[]): Promise<{ x: number; y: number }> {
  for (const f of floors) {
    const cur = await page.evaluate(() => (window as any).__spire.state().floor);
    if (cur !== f) {
      await page.evaluate((n) => (window as any).__spire.warp(n), f);
      await page.waitForFunction((n) => (window as any).__spire.state().floor === n && (window as any).__spire.scene.sys.isActive(), f, { timeout: 30_000 });
      await waitForRun(page);
      await page.evaluate(() => {
        const s = (window as any).__spire;
        s.god(true);
        s.killAll();
      });
    }
    const pos = await page.evaluate((k) => {
      const it = (window as any).__spire.scene.interactables.find((i: any) => i.active && Array.isArray(i[k]));
      return it ? { x: it.x, y: it.y } : null;
    }, field);
    if (pos) return pos;
  }
  throw new Error(`no interactable with ${field} on floors ${floors.join(',')}`);
}

/** Stand on an interactable and wait for it to be the focused one. */
async function standAt(page: Page, pos: { x: number; y: number }): Promise<void> {
  await teleport(page, pos.x, pos.y - 1);
  await page.waitForFunction(
    ([x, y]) => {
      const f = (window as any).__spire.scene.focused;
      return !!f && f.x === x && f.y === y;
    },
    [pos.x, pos.y] as const,
    { timeout: 15_000 },
  );
}

async function modalKind(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const g = (window as any).__game;
    return g.scene.isActive('Modal') ? (g.scene.getScene('Modal').current?.kind ?? null) : null;
  });
}

async function closeWithEscape(page: Page): Promise<void> {
  await tap(page, 'Escape');
  await waitForSceneGone(page, 'Modal', 15_000);
  await page.waitForFunction(() => (window as any).__spire.scene.modalOpen === false, null, { timeout: 10_000 });
}

test.describe('in-run modals and menus', () => {
  test('swap modal: opens on a third weapon, Esc leaves it, J swaps it in', async ({ page }) => {
    const errors = collectErrors(page);
    await calmRun(page);
    await page.evaluate(() => (window as any).__spire.equip('hunter_bow', 1, 'common'));
    await page.evaluate(() => (window as any).__spire.give('war_hammer', 'epic'));
    await waitFrames(page, 5);
    const drop = await page.evaluate(() => {
      const it = (window as any).__spire.scene.interactables.find((i: any) => i.active && i.item?.defId === 'war_hammer');
      return it ? { x: it.x, y: it.y } : null;
    });
    expect(drop).not.toBeNull();
    await standAt(page, drop!);

    await tap(page, 'KeyF');
    await waitForScene(page, 'Modal');
    expect(await modalKind(page)).toBe('swap');
    expect(await page.evaluate(() => (window as any).__spire.scene.modalOpen)).toBe(true);

    await closeWithEscape(page);
    // Left on the ground: still there, weapons unchanged.
    const again = await page.evaluate(() => {
      const it = (window as any).__spire.scene.interactables.find((i: any) => i.active && i.item?.defId === 'war_hammer');
      return it ? { x: it.x, y: it.y } : null;
    });
    expect(again).not.toBeNull();
    expect(await page.evaluate(() => (window as any).__spire.scene.run.weapons.map((w: any) => w?.defId))).toEqual(['rusty_sword', 'hunter_bow']);

    // Pick it up again and replace slot 1 (J).
    await standAt(page, again!);
    await tap(page, 'KeyF');
    await waitForScene(page, 'Modal');
    await waitFrames(page, 5);
    await tap(page, 'KeyJ');
    await waitForSceneGone(page, 'Modal', 15_000);
    await page.waitForFunction(() => (window as any).__spire.scene.run.weapons[0]?.defId === 'war_hammer', null, { timeout: 10_000 });
    expect(realErrors(errors)).toEqual([]);
  });

  test('merchant modal opens and closes with the keyboard', async ({ page }) => {
    const errors = collectErrors(page);
    // The floor before a boss always has a merchant; try that first.
    await calmRun(page, 4);
    const pos = await findInteractable(page, 'stock', [4, 9, 3, 2]);
    await standAt(page, pos);
    await tap(page, 'KeyF');
    await waitForScene(page, 'Modal');
    expect(await modalKind(page)).toBe('merchant');
    await closeWithEscape(page);
    expect(realErrors(errors)).toEqual([]);
  });

  test('altar modal: Esc declines, Enter takes a scroll', async ({ page }) => {
    const errors = collectErrors(page);
    await calmRun(page, 1);
    const pos = await findInteractable(page, 'choices', [1, 2, 3, 4, 6, 7]);
    await standAt(page, pos);
    await tap(page, 'KeyF');
    await waitForScene(page, 'Modal');
    expect(await modalKind(page)).toBe('altar');
    await closeWithEscape(page);

    const scrollsBefore = await page.evaluate(() => {
      const s = (window as any).__spire.scene.run.scrolls;
      return s.might + s.cunning + s.vigor;
    });
    await standAt(page, pos);
    await tap(page, 'KeyF');
    await waitForScene(page, 'Modal');
    await waitFrames(page, 5);
    await tap(page, 'Enter');
    await waitForSceneGone(page, 'Modal', 15_000);
    await page.waitForFunction(
      (before) => {
        const s = (window as any).__spire.scene.run.scrolls;
        return s.might + s.cunning + s.vigor === before + 1;
      },
      scrollsBefore,
      { timeout: 10_000 },
    );
    expect(realErrors(errors)).toEqual([]);
  });

  test('pause → settings: toggling screen shake persists across reload', async ({ page }) => {
    const errors = collectErrors(page);
    await calmRun(page);
    await tap(page, 'Escape');
    await waitForScene(page, 'Pause');
    await waitFrames(page, 5);
    await tap(page, 'ArrowDown'); // Resume → Settings
    await tap(page, 'Enter');
    await waitForScene(page, 'Settings');
    await waitFrames(page, 5);
    // Rows: master, music, sfx, screen shake, ...
    for (let i = 0; i < 3; i++) await tap(page, 'ArrowDown');
    await page.waitForFunction(() => (window as any).__game.scene.getScene('Settings').menu.index === 3, null, { timeout: 10_000 });
    await tap(page, 'Enter');
    await tap(page, 'Escape'); // back → saves and returns to Pause
    await waitForSceneGone(page, 'Settings');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('hollow-spire-save') ?? '{}').settings?.screenShake === false, null, { timeout: 10_000 });

    // Resume the game from the pause menu.
    await tap(page, 'Escape');
    await waitForSceneGone(page, 'Pause', 15_000).catch(async () => {
      await tap(page, 'Enter');
      await waitForSceneGone(page, 'Pause', 15_000);
    });

    await page.reload();
    await page.waitForFunction(() => !!(window as any).__game, null, { timeout: 30_000 });
    expect((await readSave(page)).settings.screenShake).toBe(false);
    expect(realErrors(errors)).toEqual([]);
  });
});
