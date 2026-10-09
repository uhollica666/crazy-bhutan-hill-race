import { expect, test } from '@playwright/test';
import { openGame, state, waitForPhase } from './helpers';

test.describe('desktop gameplay', () => {
  test('menu renders a real 3D scene, settings persist, and the game boots without errors', async ({
    page,
  }) => {
    const errors = await openGame(page);
    await expect(page.locator('#menu-title')).toContainText('Crazy Bhutan');
    const s = await state(page);
    expect(s.stats.calls).toBeGreaterThan(5);
    expect(s.stats.triangles).toBeGreaterThan(10_000);
    await page.screenshot({ path: 'screenshots/desktop-menu.png' });

    await page.locator('#btn-menu-settings').click();
    await expect(page.locator('#screen-settings')).toBeVisible();
    await page.screenshot({ path: 'screenshots/desktop-settings.png' });
    await page.locator('#set-master').fill('35');
    await page.locator('#set-quality').selectOption('low');
    await page.locator('#set-mute').check();
    await page.locator('#btn-settings-back').click();

    await page.reload();
    await page.waitForFunction(() => !!(window as unknown as { __cbhr?: unknown }).__cbhr);
    await page.locator('#btn-menu-settings').click();
    await expect(page.locator('#set-master')).toHaveValue('35');
    await expect(page.locator('#set-quality')).toHaveValue('low');
    await expect(page.locator('#set-mute')).toBeChecked();
    expect((await state(page)).quality).toBe('low');
    expect(errors).toEqual([]);
  });

  test('keyboard driving: countdown, accelerate, steer, brake, reverse, pause/resume, recover', async ({
    page,
  }) => {
    const errors = await openGame(page, '&quality=medium');
    await page.locator('#btn-start').click();
    await expect(page.locator('#hud')).toBeVisible();
    await waitForPhase(page, 'countdown');
    await page.screenshot({ path: 'screenshots/desktop-countdown.png' });
    // Inputs are ignored during the countdown.
    await page.keyboard.down('KeyW');
    await waitForPhase(page, 'running', 15_000);

    await expect.poll(async () => (await state(page)).speed, { timeout: 15_000 }).toBeGreaterThan(8);
    const before = (await state(page)).position;
    await page.keyboard.down('KeyD');
    await page.waitForTimeout(1500);
    await page.keyboard.up('KeyD');
    const mid = await state(page);
    expect(Math.hypot(mid.position[0] - before[0], mid.position[2] - before[2])).toBeGreaterThan(5);
    expect(mid.grounded).toBeGreaterThanOrEqual(3);
    await expect(page.locator('#hud-speed')).not.toHaveText('0');
    await page.screenshot({ path: 'screenshots/desktop-driving.png' });
    await page.keyboard.up('KeyW');

    // Brake to a stop, keep braking -> reverse.
    await page.keyboard.down('KeyS');
    await expect.poll(async () => (await state(page)).speed, { timeout: 20_000 }).toBeLessThan(-1);
    await page.keyboard.up('KeyS');

    // Pause freezes the clock and physics; resume continues.
    await page.keyboard.press('Escape');
    await expect(page.locator('#screen-pause')).toBeVisible();
    await page.screenshot({ path: 'screenshots/desktop-pause.png' });
    const t1 = (await state(page)).time;
    await page.waitForTimeout(1200);
    const t2 = (await state(page)).time;
    expect(Math.abs(t2 - t1)).toBeLessThan(0.05);
    await page.locator('#btn-resume').click();
    await expect(page.locator('#screen-pause')).toBeHidden();
    await expect.poll(async () => (await state(page)).time, { timeout: 10_000 }).toBeGreaterThan(t2 + 0.3);

    // Recover puts the car back on the road, stationary, at the start.
    await page.keyboard.press('KeyR');
    await expect.poll(async () => Math.abs((await state(page)).speed)).toBeLessThan(1);
    expect(errors).toEqual([]);
  });

  test('driving keys do not scroll the page; restart from pause works', async ({ page }) => {
    await openGame(page);
    await page.locator('#btn-start').click();
    await waitForPhase(page, 'running', 15_000);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Space');
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await page.keyboard.press('Escape');
    await page.locator('#btn-restart').click();
    await waitForPhase(page, 'countdown');
    expect((await state(page)).time).toBe(0);
  });

  test('checkpoints in order, finish, completion screen, saved best time, replay and menu', async ({
    page,
  }) => {
    const errors = await openGame(page);
    await page.locator('#btn-start').click();
    await waitForPhase(page, 'running', 15_000);
    const course = await page.evaluate(() =>
      (
        window as unknown as { __cbhr: { course(): { checkpointS: number[]; finishS: number } } }
      ).__cbhr.course(),
    );
    // Jumping past the finish must NOT skip checkpoints' ordering rules: all gates are credited in order.
    for (const s of course.checkpointS) {
      await page.evaluate(
        (v) => (window as unknown as { __cbhr: { warp(s: number): void } }).__cbhr.warp(v + 2),
        s,
      );
      await expect.poll(async () => (await state(page)).checkpoints, { timeout: 10_000 }).toBeGreaterThan(0);
    }
    await expect.poll(async () => (await state(page)).checkpoints).toBe(course.checkpointS.length);
    await page.screenshot({ path: 'screenshots/desktop-late-route.png' });
    await page.evaluate(
      (v) => (window as unknown as { __cbhr: { warp(s: number): void } }).__cbhr.warp(v + 2),
      course.finishS,
    );
    await expect(page.locator('#screen-finish')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#finish-title')).toContainText('reached');
    await expect(page.locator('#finish-time')).toHaveText(/\d:\d\d\.\d\d/);
    await page.screenshot({ path: 'screenshots/desktop-finish.png' });

    const saved = await page.evaluate(() => localStorage.getItem('cbhr.v1.progress'));
    expect(saved).toContain('pass-run');

    await page.locator('#btn-replay').click();
    await waitForPhase(page, 'countdown');
    await page.keyboard.press('Escape');
    await page.locator('#btn-pause-menu').click();
    await expect(page.locator('#btn-start')).toBeVisible();
    await expect(page.locator('.best')).toContainText('Best');
    expect(errors).toEqual([]);
  });

  test('autopilot completes the whole route in the browser (end-to-end drivability)', async ({ page }) => {
    test.setTimeout(240_000);
    const errors = await openGame(page, '&autodrive=1');
    await page.locator('#btn-start').click();
    await expect(page.locator('#screen-finish')).toBeVisible({ timeout: 200_000 });
    await expect(page.locator('#finish-title')).toContainText('reached');
    expect(errors).toEqual([]);
  });
});
