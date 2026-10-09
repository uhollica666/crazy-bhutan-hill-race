import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  drive,
  makeSave,
  openGame,
  showMissionList,
  seedSave,
  startMission,
  state,
  storedSave,
  waitForPhase,
} from './helpers';

/** Dispatches a PointerEvent with its own pointerId so simultaneous touches are simulated faithfully. */
const touch = (
  selector: string,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  id: number,
  xFrac = 0.5,
) =>
  `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    const r = el.getBoundingClientRect();
    el.dispatchEvent(new PointerEvent(${JSON.stringify(type)}, { pointerId: ${id}, pointerType: 'touch', isPrimary: ${id === 1},
      bubbles: true, cancelable: true, clientX: r.left + r.width * ${xFrac}, clientY: r.top + r.height / 2 }));
  })()`;

const readCmd = (page: Page) =>
  page.evaluate(() =>
    (
      window as unknown as { __cbhr: { cmd(): { steer: number; throttle: number; brake: number } } }
    ).__cbhr.cmd(),
  );

test.describe('mobile (Pixel 7 landscape EMULATION: not a real device)', () => {
  test('touch controls appear, multi-touch steer + gas work together, layout has no overlap', async ({
    page,
  }) => {
    const errors = await openGame(page);
    await page.screenshot({ path: 'screenshots/mobile-menu.png' });
    await page.locator('#btn-start').tap();
    await showMissionList(page);
    await page.locator('button[data-level="pass-run"]').tap();
    await expect(page.locator('#screen-garage')).toBeVisible({ timeout: 30_000 });
    await page.locator('#btn-launch').tap();
    if (await page.locator('#brief-skip').isVisible()) await page.locator('#brief-skip').tap();
    await expect(page.locator('#touch')).toBeVisible();
    await waitForPhase(page, 'running', 20_000);
    await page.screenshot({ path: 'screenshots/mobile-hud.png' });

    // Two fingers at once: finger 1 on the steering bar (right of centre), finger 2 on GAS.
    await page.evaluate(touch('.steer-pad', 'pointerdown', 1, 0.75));
    await page.evaluate(touch('.pedal.gas', 'pointerdown', 2));
    await expect.poll(async () => (await readCmd(page)).throttle).toBe(1);
    const c = await readCmd(page);
    expect(c.steer).toBeGreaterThan(0.3);
    expect(c.steer).toBeLessThan(0.9); // nonlinear: 75% of the bar is not full lock

    // Releasing one finger must not release the other.
    await page.evaluate(touch('.steer-pad', 'pointerup', 1));
    await expect.poll(async () => (await readCmd(page)).steer).toBe(0);
    expect((await readCmd(page)).throttle).toBe(1);
    await expect.poll(async () => (await state(page)).speed, { timeout: 30_000 }).toBeGreaterThan(5);
    await page.screenshot({ path: 'screenshots/mobile-driving.png' });
    await page.evaluate(touch('.pedal.gas', 'pointerup', 2));

    // Controls are comfortably large and clear of the HUD.
    const boxes = await page.evaluate(() => {
      const r = (s: string) => document.querySelector(s)!.getBoundingClientRect().toJSON();
      return {
        gas: r('.pedal.gas'),
        brake: r('.pedal.brake'),
        steer: r('.steer-pad'),
        pause: r('#btn-pause'),
        left: r('.hud-tl'),
        gauge: r('#gauge'),
        vw: innerWidth,
        vh: innerHeight,
      };
    });
    expect(boxes.gas.width).toBeGreaterThanOrEqual(88);
    expect(boxes.brake.width).toBeGreaterThanOrEqual(68);
    expect(boxes.gas.right).toBeLessThanOrEqual(boxes.vw);
    expect(boxes.brake.right).toBeLessThan(boxes.gas.left);
    expect(boxes.steer.right).toBeLessThan(boxes.brake.left);
    expect(boxes.pause.bottom).toBeLessThan(boxes.gas.top);
    expect(boxes.left.bottom).toBeLessThan(boxes.steer.top);
    // The instrument cluster sits between the steering control and the pedals, overlapping neither.
    const hit = (a: { left: number; right: number; top: number; bottom: number }, b: typeof a): boolean =>
      a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    expect(hit(boxes.gauge, boxes.steer)).toBe(false);
    expect(hit(boxes.gauge, boxes.brake)).toBe(false);
    expect(hit(boxes.gauge, boxes.gas)).toBe(false);

    await page.locator('#btn-pause').tap();
    await expect(page.locator('#screen-pause')).toBeVisible();
    await page.screenshot({ path: 'screenshots/mobile-pause.png' });
    await page.locator('#btn-resume').tap();
    await expect(page.locator('#screen-pause')).toBeHidden();
    expect(errors).toEqual([]);
  });

  test('losing focus or a cancelled touch releases every control (no stuck throttle)', async ({ page }) => {
    await openGame(page);
    await startMission(page, 'pass-run');
    await page.evaluate(touch('.pedal.gas', 'pointerdown', 5));
    await page.evaluate(touch('.steer-pad', 'pointerdown', 6, 0.9));
    await expect.poll(async () => (await readCmd(page)).throttle).toBe(1);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expect.poll(async () => (await readCmd(page)).throttle).toBe(0);
    expect((await readCmd(page)).steer).toBe(0);

    // A new finger can press the same pedal after cancellation; old pointer ids must not lock it.
    await page.evaluate(touch('.pedal.gas', 'pointerdown', 8));
    await expect.poll(async () => (await readCmd(page)).throttle).toBe(1);
    await page.evaluate(touch('.pedal.gas', 'pointerup', 8));
    await expect.poll(async () => (await readCmd(page)).throttle).toBe(0);

    // A cancelled pointer (e.g. system gesture) releases that control too.
    await page.evaluate(touch('.pedal.brake', 'pointerdown', 7));
    await expect.poll(async () => (await readCmd(page)).brake).toBe(1);
    await page.evaluate(() => {
      const el = document.querySelector('.pedal.brake')!;
      el.dispatchEvent(
        new PointerEvent('pointercancel', { pointerId: 7, pointerType: 'touch', bubbles: true }),
      );
    });
    await expect.poll(async () => (await readCmd(page)).brake).toBe(0);
  });

  test('choose a mission and vehicle by tapping; garage and cards fit the screen with large targets', async ({
    page,
  }) => {
    await seedSave(
      page,
      makeSave({
        finished: ['pass-run', 'airport-dash'],
        owned: ['dzo-hatch', 'druk-ranger', 'tourist-coaster'],
      }),
    );
    await openGame(page);
    await page.locator('#btn-start').tap();
    await expect(page.locator('#screen-levels')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(
      1,
    );
    await page.screenshot({ path: 'screenshots/mobile-levels.png' });
    const cardBox = await page.locator('button[data-level="airport-dash"]').boundingBox();
    expect(cardBox!.height).toBeGreaterThanOrEqual(44);
    await page.locator('button[data-level="airport-dash"]').tap();
    await expect(page.locator('#screen-garage')).toBeVisible({ timeout: 30_000 });
    await page.locator('#btn-veh-next').tap();
    await page.screenshot({ path: 'screenshots/mobile-garage.png' });
    for (const sel of ['#btn-veh-prev', '#btn-veh-next', '#btn-launch', '#btn-garage-back']) {
      const b = await page.locator(sel).boundingBox();
      expect(b!.width, sel).toBeGreaterThanOrEqual(44);
      expect(b!.height, sel).toBeGreaterThanOrEqual(44);
    }
    // The launch button is pinned inside the viewport (no scrolling needed).
    const lb = await page.locator('#btn-launch').boundingBox();
    const vp = page.viewportSize()!;
    expect(lb!.y + lb!.height).toBeLessThanOrEqual(vp.height + 1);
    await page.locator('#btn-launch').tap();
    await waitForPhase(page, 'running', 30_000);
    expect(['druk-ranger', 'tourist-coaster']).toContain((await state(page)).vehicleId);
  });

  test('page does not scroll or zoom while touching the game', async ({ page }) => {
    await openGame(page);
    await startMission(page, 'pass-run');
    expect(
      await page.evaluate(() => [
        document.documentElement.scrollHeight <= innerHeight + 1,
        getComputedStyle(document.body).overflow,
      ]),
    ).toEqual([true, 'hidden']);
    const touchAction = await page.evaluate(
      () => getComputedStyle(document.querySelector('.pedal.gas')!).touchAction,
    );
    expect(touchAction).toBe('none');
  });

  test('portrait: a landscape hint appears, menus stay inside the screen', async ({ page }) => {
    await seedSave(page, makeSave({ finished: ['pass-run'] }));
    await page.setViewportSize({ width: 390, height: 780 });
    await openGame(page);
    await page.locator('#btn-start').tap();
    await expect(page.locator('#rotate-hint')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(
      1,
    );
    await page.screenshot({ path: 'screenshots/mobile-portrait-levels.png' });
    await page.locator('button[data-level="pass-run"]').tap();
    await expect(page.locator('#screen-garage')).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: 'screenshots/mobile-portrait-garage.png' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(
      1,
    );
    await expect(page.locator('#btn-launch')).toBeVisible();
  });
});

for (const viewport of [
  { width: 640, height: 360 },
  { width: 915, height: 412 },
]) {
  test(`Stage 3 touch journey, story, restart and local feedback at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/?debug=1&quality=low');
    const splash = page.locator('#splash');
    await expect(splash).toBeVisible();
    await splash.tap();
    await expect(splash).toHaveCount(0);
    await expect(page.locator('#btn-start')).toBeVisible();
    await page.locator('#btn-credit').tap();
    await expect(page.locator('#screen-about')).toBeVisible();
    await page.locator('#about-feedback').tap();
    await expect(page.locator('#screen-feedback')).toBeVisible();
    await page.locator('[data-star="4"]').tap();
    await page.locator('#fb-gameplay').fill('Landscape controls');
    await page.locator('#fb-submit').tap();
    await expect(page.locator('#screen-feedback')).toContainText('NOT been sent');
    await page.locator('#fb-done').tap();
    await page.locator('#btn-start').tap();
    await showMissionList(page);
    await page.locator('button[data-level="pass-run"]').tap();
    await page.locator('#btn-launch').tap();
    await expect(page.locator('#screen-briefing')).toBeVisible();
    await page.screenshot({ path: `screenshots/mobile-${viewport.width}-story.png` });
    await page.locator('#brief-skip').tap();
    await waitForPhase(page, 'running');
    await page.keyboard.press('Backquote'); // hide debug panel for the actual mobile layout
    await page.locator('#btn-pause').tap();
    const paused = (await state(page)).time;
    await page.waitForTimeout(350);
    expect((await state(page)).time).toBe(paused);
    await page.locator('#btn-restart').tap();
    await expect(page.locator('#screen-briefing')).toBeHidden();
    await waitForPhase(page, 'running');
    await page.screenshot({ path: `screenshots/mobile-${viewport.width}-hud.png` });
    const prompt = await page.locator('#hud-prompt').boundingBox();
    if (prompt)
      for (const selector of ['.steer-pad', '.pedal.gas', '.pedal.brake']) {
        const box = await page.locator(selector).boundingBox();
        expect(prompt.y + prompt.height).toBeLessThanOrEqual(box!.y);
      }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(
      1,
    );
    for (const selector of ['.pedal.gas', '.pedal.brake', '.steer-pad', '#btn-pause']) {
      const box = await page.locator(selector).boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
    }
  });
}

test('mobile mission completes through real driving, rewards persist and results feedback exports', async ({
  page,
}) => {
  test.setTimeout(360_000);
  await seedSave(page, makeSave());
  const errors = await openGame(page, '&quality=low');
  await startMission(page, 'pass-run');
  await drive(page);
  await expect(page.locator('#screen-finish')).toBeVisible({ timeout: 300_000 });
  expect((await storedSave(page)).progress.levels['pass-run'].completions).toBe(1);
  await page.screenshot({ path: 'screenshots/mobile-results.png' });
  await page.locator('#btn-finish-feedback').tap();
  await page.locator('[data-star="5"]').tap();
  await page.locator('#fb-submit').tap();
  const download = page.waitForEvent('download');
  await page.locator('#fb-download').tap();
  expect((await download).suggestedFilename()).toMatch(/^cbhr-feedback-.*\.json$/);
  await page.locator('#fb-done').tap();
  await expect(page.locator('#screen-finish')).toBeVisible();
  expect(errors).toEqual([]);
});
