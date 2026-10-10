import { test, expect } from '@playwright/test';
import { courseInfo, makeSave, openGame, seedSave, startMission, state, warp } from './helpers';

const ALL_BUT_LAST = [
  'pass-run',
  'thimphu-pickup',
  'airport-dash',
  'punakha-valley',
  'dochula-storm',
  'trongsa-gorge',
  'chelela-climb',
  'bumthang-night',
  'remote-expedition',
];

/**
 * Level 10 asks the player to check strangers' IDs against the manifest. The keyboard does that with E; a touch player taps the
 * Check ID button; a gamepad player presses a bumper. All three go through the same game action.
 */
test.describe('Level 10 ID check without a keyboard', () => {
  test.use({ hasTouch: true });

  test('the Check ID button (tap) and a gamepad bumper both check a guest', async ({ page }) => {
    test.setTimeout(240_000);
    // A scriptable gamepad: tests flip a button, the game reads it through navigator.getGamepads() like a real controller.
    await page.addInitScript(() => {
      const pad = {
        connected: true,
        id: 'test-pad',
        index: 0,
        mapping: 'standard',
        axes: [0, 0, 0, 0],
        buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
      };
      (window as unknown as { __pad: typeof pad }).__pad = pad;
      navigator.getGamepads = () => [pad as unknown as Gamepad, null, null, null];
    });
    await seedSave(page, makeSave({ finished: ALL_BUT_LAST, owned: ['dzo-hatch', 'druk-ranger', 'dragon-cruiser'], storySeen: 'all' }));
    const errors = await openGame(page, '&quality=low');
    await startMission(page, 'gmc-plains', 'druk-ranger');

    const info = await courseInfo(page);
    const guest = info.stops.find((s) => s.id === 'lodge-group')!;
    const impostor = info.stops.find((s) => s.id === 'fake-junction')!;
    expect(guest && impostor).toBeTruthy();

    // 1. A real guest, checked with a gamepad bumper (RB).
    await warp(page, guest.s);
    await expect(page.locator('#btn-check-id')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#btn-check-id')).toContainText('Check ID');
    await page.evaluate(() => {
      (window as unknown as { __pad: { buttons: { pressed: boolean }[] } }).__pad.buttons[5].pressed = true;
    });
    await expect(page.locator('#flash')).toContainText('ID confirmed', { timeout: 10_000 });
    await page.evaluate(() => {
      (window as unknown as { __pad: { buttons: { pressed: boolean }[] } }).__pad.buttons[5].pressed = false;
    });
    // Let the family board, which clears the way for the rest of the manifest.
    await expect.poll(async () => (await state(page)).onboard, { timeout: 30_000 }).toBeGreaterThan(0);

    // 2. A stranger waving the car down, turned away with a tap on the visible button.
    await warp(page, impostor.s);
    const button = page.locator('#btn-check-id');
    await expect(button).toBeVisible({ timeout: 15_000 });
    const box = await button.boundingBox();
    expect(box && box.width >= 44 && box.height >= 44, 'a touch-sized target').toBe(true);
    const before = (await state(page)).onboard;
    await button.tap({ force: true }); // the guest is already boarding: no time to wait for the button to settle
    await expect(page.locator('#flash')).toContainText('Not on the manifest', { timeout: 10_000 });
    await expect(button).toBeHidden({ timeout: 10_000 });
    // They did not get in.
    await page.waitForTimeout(1500);
    expect((await state(page)).onboard).toBe(before);
    expect(errors).toEqual([]);
  });
});
