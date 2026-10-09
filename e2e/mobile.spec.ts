import { expect, test } from '@playwright/test';
import { openGame, state, waitForPhase } from './helpers';

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

test.describe('mobile (Pixel 7 landscape emulation)', () => {
  test('touch controls appear, multi-touch steer + gas work together, layout has no overlap', async ({
    page,
  }) => {
    const errors = await openGame(page);
    await page.screenshot({ path: 'screenshots/mobile-menu.png' });
    await page.locator('#btn-start').tap();
    await expect(page.locator('#touch')).toBeVisible();
    await waitForPhase(page, 'running', 20_000);
    await page.screenshot({ path: 'screenshots/mobile-hud.png' });

    // Two fingers at once: finger 1 on the steering bar (right of centre), finger 2 on GAS.
    await page.evaluate(touch('.steer-pad', 'pointerdown', 1, 0.75));
    await page.evaluate(touch('.pedal.gas', 'pointerdown', 2));
    const read = () =>
      page.evaluate(() =>
        (window as unknown as { __cbhr: { cmd(): { steer: number; throttle: number } } }).__cbhr.cmd(),
      );
    await expect.poll(async () => (await read()).throttle).toBe(1);
    expect((await read()).steer).toBeGreaterThan(0.5);

    // Releasing one finger must not release the other: the car keeps accelerating, now straight.
    await page.evaluate(touch('.steer-pad', 'pointerup', 1));
    await expect.poll(async () => (await read()).steer).toBe(0);
    expect((await read()).throttle).toBe(1);
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
        speed: r('.hud-speed'),
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
    expect(boxes.speed.bottom).toBeLessThan(boxes.steer.top);

    await page.locator('#btn-pause').tap();
    await expect(page.locator('#screen-pause')).toBeVisible();
    await page.screenshot({ path: 'screenshots/mobile-pause.png' });
    await page.locator('#btn-resume').tap();
    await expect(page.locator('#screen-pause')).toBeHidden();
    expect(errors).toEqual([]);
  });

  test('page does not scroll or zoom while touching the game', async ({ page }) => {
    await openGame(page);
    await page.locator('#btn-start').tap();
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
});
