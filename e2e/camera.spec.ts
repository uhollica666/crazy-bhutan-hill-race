import { test, expect } from '@playwright/test';
import { makeSave, openGame, seedSave, startMission, state, storedSave } from './helpers';

test.describe('camera views, road shake and the reversing window', () => {
  test('C (or the camera button) switches chase and driver views and remembers the choice; reversing shows the rear view', async ({ page }) => {
    test.setTimeout(180_000);
    await seedSave(page, makeSave({ storySeen: 'all' }));
    const errors = await openGame(page, '&quality=low');
    await startMission(page, 'pass-run', 'dzo-hatch');

    // Default: third person, no rear window.
    expect((await storedSave(page)).settings.cameraView ?? 'chase').toBe('chase');
    await expect(page.locator('#rearview')).toBeHidden();

    await page.keyboard.press('KeyC');
    await expect(page.locator('#flash')).toContainText("Driver's eye view");
    await expect.poll(async () => (await storedSave(page)).settings.cameraView).toBe('close');
    await page.screenshot({ path: 'docs/release/camera-driver.png' });
    await page.locator('#btn-camera').click();
    await expect.poll(async () => (await storedSave(page)).settings.cameraView).toBe('chase');
    await page.keyboard.press('KeyC');
    await expect.poll(async () => (await storedSave(page)).settings.cameraView).toBe('close');

    // Reversing: hold the brake from a standstill, and the rear view appears at the top centre.
    await page.keyboard.down('KeyS');
    await expect.poll(async () => (await state(page)).speed, { timeout: 20_000 }).toBeLessThan(-1);
    const rear = page.locator('#rearview');
    await expect(rear).toBeVisible();
    await page.screenshot({ path: 'docs/release/camera-reversing.png' });
    const box = await rear.boundingBox();
    const view = page.viewportSize()!;
    expect(box!.y).toBeLessThan(view.height * 0.4);
    expect(Math.abs(box!.x + box!.width / 2 - view.width / 2)).toBeLessThan(4); // centred
    await page.keyboard.up('KeyS');
    // Releasing the brake does not instantly stop a vehicle rolling backwards. Drive forward to end reverse mode.
    await page.keyboard.down('KeyW');
    await expect.poll(async () => (await state(page)).speed, { timeout: 30_000 }).toBeGreaterThan(0);
    await page.keyboard.up('KeyW');
    await expect(rear).toBeHidden({ timeout: 15_000 });
    expect(errors).toEqual([]);
  });

  test('Road shake and Camera view are settings that persist', async ({ page }) => {
    await seedSave(page, makeSave({ storySeen: 'all' }));
    await openGame(page, '&quality=low');
    await page.locator('#btn-menu-settings').click();
    await page.locator('#tab-gameplay').click();
    await page.locator('#set-camera').selectOption('close');
    await page.locator('#set-shake').selectOption('0.5');
    const s = (await storedSave(page)).settings;
    expect(s.cameraView).toBe('close');
    expect(s.cameraShake).toBe(0.5);
    await page.reload();
    await page.waitForFunction(() => !!(window as unknown as { __cbhr?: unknown }).__cbhr);
    const after = (await storedSave(page)).settings;
    expect(after.cameraView).toBe('close');
    expect(after.cameraShake).toBe(0.5);
  });
});
