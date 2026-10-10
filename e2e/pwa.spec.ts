import { expect, test } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { makeSave, openGame, seedSave, startMission, state } from './helpers';

/**
 * Production-build PWA verification (runs against `vite preview` of dist/, where the service worker exists).
 * Steps: load online -> SW installs and takes control -> shell + assets are cached -> go offline -> reload
 * -> the game still boots and a level launches and plays.
 */
test.describe('offline PWA (production build)', () => {
  test('manifest, icons and a versioned service worker are served', async ({ page, request }) => {
    const manifest = await (await request.get('/manifest.webmanifest')).json();
    expect(manifest.name).toBe('Crazy Bhutan Hill Race');
    expect(manifest.display_override ?? [manifest.display]).toContain('fullscreen');
    for (const icon of manifest.icons) expect((await request.get('/' + icon.src)).ok(), icon.src).toBe(true);
    const sw = await (await request.get('/sw.js')).text();
    expect(sw).toMatch(/const VERSION = '[0-9a-f]{12}'/);
    expect(sw).not.toContain('__BUILD_ID__');
    expect(sw).not.toContain('__PRECACHE__');
    await page.goto('/');
    const head = await page.evaluate(() => ({
      theme: document.querySelector('meta[name=theme-color]')?.getAttribute('content'),
      viewport: document.querySelector('meta[name=viewport]')?.getAttribute('content'),
      manifest: document.querySelector('link[rel=manifest]') !== null,
    }));
    expect(head.theme).toBe('#141722');
    expect(head.viewport).toContain('viewport-fit=cover');
    expect(head.manifest).toBe(true);
  });

  test('installs, caches the app, and still loads and plays a level with the network off', async ({
    page,
    context,
  }) => {
    test.setTimeout(240_000);
    await seedSave(
      page,
      makeSave({
        finished: ['pass-run', 'airport-dash', 'chelela-climb'],
        owned: ['dzo-hatch', 'tourist-coaster', 'druk-ranger', 'dragon-cruiser'],
        settings: { quality: 'low' },
      }),
    );
    await page.goto('/?debug=1');
    await page.waitForFunction(() => !!(window as unknown as { __cbhr?: unknown }).__cbhr, undefined, {
      timeout: 90_000,
    });

    // 1-2. The service worker registers, activates and controls the page.
    await expect
      .poll(
        () =>
          page.evaluate(
            async () => (await navigator.serviceWorker.getRegistration())?.active?.state ?? 'none',
          ),
        { timeout: 30_000 },
      )
      .toBe('activated');
    await expect
      .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 30_000 })
      .toBe(true);

    // 3-4. The precache holds the shell, the hashed bundles, the manifest and the icons.
    const cached = await page.evaluate(async () => {
      const names = (await caches.keys()).filter((k) => k.startsWith('cbhr-'));
      const c = await caches.open(names[0]);
      return { names, urls: (await c.keys()).map((r) => new URL(r.url).pathname) };
    });
    expect(cached.names).toHaveLength(1);
    expect(cached.urls.some((u) => u.endsWith('/index.html'))).toBe(true);
    expect(cached.urls.some((u) => /\/assets\/index-.*\.js$/.test(u))).toBe(true);
    expect(cached.urls.some((u) => /\/assets\/index-.*\.css$/.test(u))).toBe(true);
    expect(cached.urls.some((u) => u.endsWith('/manifest.webmanifest'))).toBe(true);
    expect(cached.urls.some((u) => u.endsWith('/icon-512.png'))).toBe(true);
    for (const asset of ['/brand/novarah-logo.webp', '/brand/novarah-symbol.webp']) {
      expect(cached.urls, asset).toContain(asset);
    }

    // 5-6. Network off, reload.
    await context.setOffline(true);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.reload();
    await page.waitForFunction(() => !!(window as unknown as { __cbhr?: unknown }).__cbhr, undefined, {
      timeout: 60_000,
    });
    if (await page.locator('#splash').isVisible()) await page.keyboard.press('Enter');
    await expect(page.locator('#btn-start')).toBeVisible();
    expect(await page.evaluate(() => navigator.onLine)).toBe(false);
    await page.screenshot({ path: 'screenshots/pwa-offline-menu.png' });
    await page.locator('#btn-credit').click();
    await expect(page.locator('#screen-about')).toBeVisible();
    expect(
      await page
        .locator('.about-logo')
        .evaluate((el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0),
    ).toBe(true);
    await page.locator('#about-feedback').click();
    await expect(page.locator('#screen-feedback')).toContainText('No feedback server');
    await page.locator('#fb-cancel').click();

    // 7. A level (not just the menu) launches and is playable offline: use the airport mission.
    await startMission(page, 'airport-dash', 'tourist-coaster');
    await page.keyboard.down('KeyW');
    await expect.poll(async () => (await state(page)).speed, { timeout: 30_000 }).toBeGreaterThan(5);
    await page.keyboard.up('KeyW');
    expect(errors).toEqual([]);

    await context.setOffline(false);
  });

  test('a fresh offline visit with an installed worker serves the shell from cache (cold reload)', async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const context = await browser.newContext();
    const page = await context.newPage();
    await openGame(page);
    await expect
      .poll(
        () =>
          page.evaluate(
            async () => (await navigator.serviceWorker.getRegistration())?.active?.state ?? 'none',
          ),
        { timeout: 30_000 },
      )
      .toBe('activated');
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    await context.setOffline(true);
    await page.goto('/?nosplash=1'); // a brand-new navigation, not just a reload
    await expect(page.locator('#btn-start')).toBeVisible({ timeout: 60_000 });
    await context.close();
  });

  test('a production worker update replaces the old cache and remains playable offline', async ({
    page,
    context,
  }) => {
    const path = 'dist/sw.js';
    const original = await readFile(path, 'utf8');
    const updated = original.replace(/const VERSION = '[0-9a-f]{12}'/, "const VERSION = '000000000003'");
    await openGame(page);
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    const before = await page.evaluate(() => caches.keys());
    try {
      await writeFile(path, updated);
      await page.evaluate(async () => {
        await (await navigator.serviceWorker.getRegistration())!.update();
      });
      await expect.poll(() => page.evaluate(() => caches.keys())).toEqual(['cbhr-000000000003']);
      expect(before).not.toEqual(['cbhr-000000000003']);
      await context.setOffline(true);
      await page.reload();
      await expect(page.locator('#btn-start')).toBeVisible();
      await startMission(page, 'pass-run');
      expect((await state(page)).phase).toBe('running');
    } finally {
      await context.setOffline(false);
      await writeFile(path, original);
    }
  });
});
