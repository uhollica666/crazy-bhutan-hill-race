import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  courseInfo,
  drive,
  makeSave,
  openGame,
  openGarage,
  seedSave,
  startMission,
  state,
  waitForPhase,
  warp,
} from './helpers';

/** Warps past every checkpoint in order, then across the finish line. */
async function finishByWarp(page: Page): Promise<void> {
  const c = await courseInfo(page);
  for (const s of c.checkpointS) await warp(page, s + 2);
  await expect.poll(async () => (await state(page)).checkpoints).toBe(c.checkpointS.length);
  await warp(page, c.finishS + 2);
  await expect(page.locator('#screen-finish')).toBeVisible({ timeout: 20_000 });
}

test.describe('startup, settings and navigation', () => {
  test('boots into a real 3D menu, settings persist across reload, no console errors', async ({ page }) => {
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
    await page.locator('#set-sens').fill('130');
    await page.locator('#set-quality').selectOption('low');
    await page.locator('#set-mute').check();
    await page.locator('#btn-settings-back').click();

    await page.reload();
    await page.waitForFunction(() => !!(window as unknown as { __cbhr?: unknown }).__cbhr);
    await page.locator('#btn-menu-settings').click();
    await expect(page.locator('#set-master')).toHaveValue('35');
    await expect(page.locator('#set-sens')).toHaveValue('130');
    await expect(page.locator('#set-quality')).toHaveValue('low');
    await expect(page.locator('#set-mute')).toBeChecked();
    expect((await state(page)).quality).toBe('low');
    expect(errors).toEqual([]);
  });

  test('a fresh save: only Pass Run and the 4x4 are available; locks explain how to unlock', async ({
    page,
  }) => {
    const errors = await openGame(page);
    await page.locator('#btn-start').click();
    await expect(page.locator('button[data-level="pass-run"]')).not.toHaveClass(/locked/);
    await expect(page.locator('button[data-level="airport-dash"]')).toHaveClass(/locked/);
    await expect(page.locator('button[data-level="airport-dash"]')).toContainText('Finish Pass Run');
    await expect(page.locator('button[data-level="chelela-climb"]')).toContainText('Finish Airport Dash');
    await page.screenshot({ path: 'screenshots/desktop-levels.png' });

    // Clicking a locked mission does nothing.
    await page.locator('button[data-level="airport-dash"]').click({ force: true });
    await expect(page.locator('#screen-garage')).toBeHidden();
    expect((await state(page)).levelId).toBe('pass-run');

    await page.locator('button[data-level="pass-run"]').click();
    await expect(page.locator('#screen-garage')).toBeVisible();
    await expect(page.locator('#veh-name')).toHaveText('Druk Ranger');
    await expect(page.locator('#btn-launch')).toBeEnabled();
    // The coach is shown but locked, with the reason, and cannot be launched.
    await page.locator('#btn-veh-next').click();
    await expect(page.locator('#veh-name')).toHaveText('Tourist Coaster');
    await expect(page.locator('#veh-status')).toContainText('Locked: Finish Pass Run');
    await expect(page.locator('#btn-launch')).toBeDisabled();
    await expect.poll(async () => (await state(page)).vehicleId).toBe('tourist-coaster'); // the 3D preview changed
    await page.screenshot({ path: 'screenshots/desktop-garage-locked.png' });
    await page.locator('#btn-veh-prev').click();
    await expect(page.locator('#btn-launch')).toBeEnabled();

    // Back navigation: garage -> missions -> menu.
    await page.locator('#btn-garage-back').click();
    await expect(page.locator('#screen-levels')).toBeVisible();
    await page.locator('#btn-levels-back').click();
    await expect(page.locator('#btn-start')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('menus work from the keyboard: arrows move focus, Enter selects, Escape goes back', async ({
    page,
  }) => {
    await seedSave(page, makeSave(['pass-run', 'airport-dash']));
    await openGame(page);
    await page.locator('#btn-start').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#screen-levels')).toBeVisible();
    await expect(page.locator('button[data-level="pass-run"]')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('button[data-level="airport-dash"]')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('button[data-level="chelela-climb"]')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#screen-garage')).toBeVisible({ timeout: 30_000 });
    expect((await state(page)).levelId).toBe('chelela-climb');
    await page.keyboard.press('Escape');
    await expect(page.locator('#screen-levels')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#btn-start')).toBeVisible();
  });

  test('migrates a Stage 1 save: best time kept, next mission and the coach unlocked', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        'cbhr.v1.progress',
        JSON.stringify({ levels: { 'pass-run': { bestTime: 77.7, medal: 'gold', completions: 3 } } }),
      );
      localStorage.setItem(
        'cbhr.v1.settings',
        JSON.stringify({
          masterVolume: 0.3,
          musicVolume: 0,
          sfxVolume: 0.5,
          muted: true,
          quality: 'low',
          touchControls: 'auto',
        }),
      );
    });
    const errors = await openGame(page);
    await expect(page.locator('#toast-text')).toContainText('carried over');
    expect((await state(page)).quality).toBe('low');
    await page.locator('#btn-start').click();
    await expect(page.locator('button[data-level="pass-run"]')).toContainText('1:17.70');
    await expect(page.locator('button[data-level="airport-dash"]')).not.toHaveClass(/locked/);
    const saved = await page.evaluate(() => localStorage.getItem('cbhr.v2.save'));
    expect(saved).toContain('"version":2');
    expect(await page.evaluate(() => localStorage.getItem('cbhr.v1.progress'))).toContain('77.7'); // old key untouched
    expect(errors).toEqual([]);
  });
});

test.describe('driving and flow', () => {
  test('keyboard driving: countdown, accelerate, steer, brake, reverse, pause/resume, recover', async ({
    page,
  }) => {
    const errors = await openGame(page, '&quality=medium');
    await openGarage(page, 'pass-run', 'druk-ranger');
    await page.locator('#btn-launch').click();
    await expect(page.locator('#hud')).toBeVisible();
    await waitForPhase(page, 'countdown');
    await page.screenshot({ path: 'screenshots/desktop-countdown.png' });
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

    await page.keyboard.down('KeyS');
    await expect.poll(async () => (await state(page)).speed, { timeout: 20_000 }).toBeLessThan(-1);
    await page.keyboard.up('KeyS');

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

    await page.keyboard.press('KeyR');
    await expect.poll(async () => Math.abs((await state(page)).speed)).toBeLessThan(1);
    expect(errors).toEqual([]);
  });

  test('driving keys do not scroll the page; restart works; pause menu can change vehicle', async ({
    page,
  }) => {
    await seedSave(page, makeSave(['pass-run']));
    await openGame(page);
    await startMission(page, 'pass-run');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Space');
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await page.keyboard.press('Escape');
    await page.locator('#btn-restart').click();
    await waitForPhase(page, 'countdown');
    expect((await state(page)).time).toBe(0);
    await waitForPhase(page, 'running', 15_000);
    await page.keyboard.press('Escape');
    await page.locator('#btn-pause-garage').click();
    await expect(page.locator('#screen-garage')).toBeVisible();
    await expect(page.locator('#hud')).toBeHidden();
    await page.locator('#btn-veh-next').click();
    await expect(page.locator('#veh-name')).toHaveText('Tourist Coaster');
    await page.locator('#btn-launch').click();
    await waitForPhase(page, 'running', 15_000);
    expect((await state(page)).vehicleId).toBe('tourist-coaster');
  });

  test('Pass Run: ordered checkpoints, finish, saved result, unlock feedback, reload persistence, next mission', async ({
    page,
  }) => {
    const errors = await openGame(page);
    await startMission(page, 'pass-run', 'druk-ranger');
    await finishByWarp(page);
    await expect(page.locator('#finish-title')).toContainText('reached');
    await expect(page.locator('#finish-time')).toHaveText(/\d:\d\d\.\d\d/);
    await expect(page.locator('#finish-unlocks')).toContainText('New mission unlocked');
    await expect(page.locator('#finish-unlocks')).toContainText('Airport Dash');
    await expect(page.locator('#finish-unlocks')).toContainText('New vehicle unlocked');
    await expect(page.locator('#finish-unlocks')).toContainText('Tourist Coaster');
    await expect(page.locator('#btn-next')).toBeVisible();
    await page.screenshot({ path: 'screenshots/desktop-finish.png' });

    const saved = await page.evaluate(() => localStorage.getItem('cbhr.v2.save'));
    expect(saved).toContain('pass-run');
    expect(saved).toContain('druk-ranger');

    // Survives a reload: best time shown, the next mission and the coach stay unlocked.
    await page.reload();
    await page.waitForFunction(() => !!(window as unknown as { __cbhr?: unknown }).__cbhr);
    await expect(page.locator('#menu-summary')).toContainText('1 of 3 missions completed');
    await page.locator('#btn-start').click();
    await expect(page.locator('button[data-level="pass-run"]')).toContainText('Best');
    await expect(page.locator('button[data-level="airport-dash"]')).not.toHaveClass(/locked/);
    await expect(page.locator('button[data-level="airport-dash"] .new-tag')).toBeVisible();
    await page.locator('button[data-level="airport-dash"]').click();
    await expect(page.locator('#screen-garage')).toBeVisible({ timeout: 30_000 });
    await expect.poll(async () => (await state(page)).vehicleId).toBe('tourist-coaster'); // recommended vehicle
    await page.locator('#btn-veh-next').click();
    await expect(page.locator('#btn-launch')).toBeEnabled(); // the Ranger is allowed here too
    expect(errors).toEqual([]);
  });

  test('Results: "Next mission" goes straight to the next garage, and a timeout is a clear failure', async ({
    page,
  }) => {
    await seedSave(page, makeSave([]));
    await openGame(page);
    await startMission(page, 'pass-run', 'druk-ranger');
    await finishByWarp(page);
    await page.locator('#btn-next').click();
    await expect(page.locator('#screen-garage')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#garage-level')).toHaveText('Airport Dash');
    await page.locator('#btn-launch').click();
    await waitForPhase(page, 'running', 20_000);
    await expect(page.locator('#hud-comfort')).toBeVisible(); // comfort tracking is on for the airport
    await expect(page.locator('#hud-timer-label')).toHaveText('Flight departs in');
    await page.screenshot({ path: 'screenshots/desktop-airport-hud.png' });
  });
});

test.describe('full missions (autopilot through the real UI, Low quality)', () => {
  const cases: { level: string; vehicle: string; saved: string[]; title: RegExp }[] = [
    { level: 'pass-run', vehicle: 'druk-ranger', saved: [], title: /Pass summit reached/ },
    { level: 'airport-dash', vehicle: 'tourist-coaster', saved: ['pass-run'], title: /Departures reached/ },
    {
      level: 'chelela-climb',
      vehicle: 'druk-ranger',
      saved: ['pass-run', 'airport-dash'],
      title: /Chelela pass reached/,
    },
  ];
  for (const c of cases) {
    test(`${c.level} with ${c.vehicle} is completed by the autopilot`, async ({ page }) => {
      test.setTimeout(420_000);
      await seedSave(page, makeSave(c.saved));
      const errors = await openGame(page, '&quality=low');
      await startMission(page, c.level, c.vehicle);
      await drive(page, true);
      await expect(page.locator('#screen-finish')).toBeVisible({ timeout: 360_000 });
      await expect(page.locator('#finish-title')).toHaveText(c.title);
      if (c.level === 'airport-dash') await expect(page.locator('#finish-grid')).toContainText('Passengers');
      await page.screenshot({ path: `screenshots/desktop-complete-${c.level}.png` });
      const saved = JSON.parse((await page.evaluate(() => localStorage.getItem('cbhr.v2.save'))) as string);
      expect(saved.progress.levels[c.level].completions).toBeGreaterThanOrEqual(1);
      expect(saved.progress.levels[c.level].vehicles[c.vehicle].bestTime).toBeGreaterThan(30);
      expect(errors).toEqual([]);
    });
  }
});
