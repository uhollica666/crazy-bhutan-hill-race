import { expect, test } from '@playwright/test';
import { drive, makeSave, openGame, seedSave, showMissionList, startMission, state, storedSave, waitForPhase } from './helpers';

const OWNED = ['dzo-hatch', 'tourist-coaster', 'druk-ranger', 'dragon-cruiser'];
const ALL = [
  'pass-run',
  'thimphu-pickup',
  'airport-dash',
  'punakha-valley',
  'dochula-storm',
  'chelela-climb',
  'trongsa-gorge',
  'bumthang-night',
  'remote-expedition',
  'gmc-plains',
];

const readCmd = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (window as unknown as { __cbhr: { cmd(): { steer: number; throttle: number; brake: number } } }).__cbhr.cmd());

test.describe('Pass 4.5: settings tabs', () => {
  test('five sections work with mouse and arrow keys, and every setting persists', async ({ page }) => {
    const errors = await openGame(page);
    await page.locator('#btn-menu-settings').click();
    const tabs = page.locator('.tabs:not(.sub-tabs) [role=tab]');
    await expect(tabs).toHaveCount(6);
    await expect(page.locator('#pane-audio')).toBeVisible();
    await expect(page.locator('#pane-graphics')).toBeHidden();
    await tabs.first().focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#tab-graphics')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#pane-graphics')).toBeVisible();
    await expect(page.locator('#pane-audio')).toBeHidden();
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('#pane-audio')).toBeVisible();
    // Control help has its own tabs.
    await page.locator('#tab-controls').click();
    await expect(page.locator('[data-help-pane=kb]')).toBeVisible();
    await page.locator('[data-help=touch]').click();
    await expect(page.locator('[data-help-pane=touch]')).toBeVisible();
    await expect(page.locator('[data-help-pane=kb]')).toBeHidden();
    // New settings.
    await page.locator('#set-steer').selectOption('wheel');
    await page.locator('#set-mirror').check();
    await page.locator('#tab-gameplay').click();
    await page.locator('#set-hud').selectOption('telemetry');
    await page.locator('#tab-access').click();
    await page.locator('#set-large').check();
    await page.locator('#tab-audio').click();
    await page.locator('#set-ambient').fill('40');
    await page.screenshot({ path: 'screenshots/desktop-settings-tabs.png' });
    const saved = (await storedSave(page)).settings;
    expect(saved).toMatchObject({ touchSteer: 'wheel', touchMirror: true, hudMode: 'telemetry', touchLarge: true });
    expect(saved.ambientVolume).toBeCloseTo(0.4, 2);
    expect((await state(page)).audioMix.master).toBeGreaterThanOrEqual(0);
    expect(errors).toEqual([]);
  });
});

test.describe('Pass 4.5: the 3D garage', () => {
  test('draws its own scene with the selected vehicle, orbits on request and leaves the world alone', async ({ page }) => {
    await seedSave(page, makeSave({ finished: ['pass-run'], owned: OWNED, credits: 2000 }));
    const errors = await openGame(page, '&quality=low');
    await page.locator('#btn-menu-garage').click();
    await expect(page.locator('#screen-garage')).toBeVisible();
    await expect.poll(async () => (await state(page)).scene).toBe('garage');
    const s0 = await state(page);
    expect(s0.garageVehicle).toBe(s0.vehicleId);
    const v0 = s0.garageView!;
    await page.locator('#gv-right').click();
    await expect.poll(async () => (await state(page)).garageView!.azimuth).not.toBeCloseTo(v0.azimuth, 1);
    await page.locator('#gv-in').click();
    await expect.poll(async () => (await state(page)).garageView!.distance).toBeLessThan(v0.distance);
    // Dragging the empty stage turns the camera as well.
    const before = (await state(page)).garageView!.azimuth;
    await page.mouse.move(900, 500);
    await page.mouse.down();
    await page.mouse.move(700, 500, { steps: 6 });
    await page.mouse.up();
    await expect.poll(async () => Math.abs((await state(page)).garageView!.azimuth - before)).toBeGreaterThan(0.2);
    // Changing vehicle changes the model shown in the garage scene.
    const first = (await state(page)).garageVehicle;
    await page.locator('#btn-veh-next').click();
    await expect.poll(async () => (await state(page)).garageVehicle).not.toBe(first);
    expect((await state(page)).garageVehicle).toBe((await state(page)).vehicleId);
    await page.screenshot({ path: 'screenshots/desktop-garage-3d.png' });
    await page.locator('#btn-garage-back').click();
    await expect.poll(async () => (await state(page)).scene).toBe('world');
    expect(errors).toEqual([]);
  });

  test('upgrades show real before/after numbers and buying changes them', async ({ page }) => {
    await seedSave(page, makeSave({ finished: ['pass-run'], owned: OWNED, credits: 2000 }));
    await openGame(page, '&quality=low');
    await page.locator('#btn-menu-garage').click();
    await page.locator('#veh-upgrades summary').click();
    const delta = page.locator('.upg-delta').first();
    await expect(delta).toBeVisible();
    await expect(delta).toContainText('→');
    const before = await delta.innerText();
    await page.locator('[data-buy-upgrade]').first().click();
    await expect.poll(async () => page.locator('.upg-delta').first().innerText()).not.toBe(before);
  });
});

test.describe('Pass 4.5: illustrated campaign map', () => {
  test('ten pins, previews, honest locks, a list alternative, and the choice persists', async ({ page }) => {
    const errors = await openGame(page);
    await page.locator('#btn-start').click();
    await expect(page.locator('#level-map')).toBeVisible();
    await expect(page.locator('.map-pin')).toHaveCount(10);
    await expect(page.locator('.map-pin.next')).toHaveCount(1);
    await expect(page.locator('.map-pin.locked')).toHaveCount(9);
    await page.screenshot({ path: 'screenshots/desktop-campaign-map.png' });
    // A locked mission previews its lock and cannot be opened.
    await page.locator('[data-pin="punakha-valley"]').click();
    await expect(page.locator('#map-preview')).toContainText('Punakha');
    await expect(page.locator('#map-preview')).toContainText('Finish Thimphu Town Pickup');
    await expect(page.locator('#btn-map-go')).toBeDisabled();
    await page.locator('[data-pin="punakha-valley"]').dblclick();
    await expect(page.locator('#screen-garage')).toBeHidden();
    // Keyboard: focus previews, Enter on the preview button opens the garage.
    await page.locator('[data-pin="pass-run"]').focus();
    await expect(page.locator('#map-preview')).toContainText('Pass Run');
    await page.locator('[data-pin="pass-run"]').click();
    await page.locator('#btn-map-go').click();
    await expect(page.locator('#screen-garage')).toBeVisible({ timeout: 30_000 });
    await page.locator('#btn-garage-back').click();
    // The list view is an alternative, and the choice is saved.
    await page.locator('#btn-levels-view').click();
    await expect(page.locator('#level-cards')).toBeVisible();
    await expect(page.locator('#level-map')).toBeHidden();
    expect((await storedSave(page)).settings.levelsView).toBe('list');
    await page.reload();
    await page.waitForFunction(() => !!(window as unknown as { __cbhr?: unknown }).__cbhr);
    await page.locator('#btn-start').click();
    await expect(page.locator('#level-cards')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('with the campaign finished every pin shows its medal and nothing is locked', async ({ page }) => {
    await seedSave(page, makeSave({ finished: ALL, owned: OWNED, settings: { levelsView: 'map' } }));
    await openGame(page);
    await page.locator('#btn-start').click();
    await expect(page.locator('.map-pin.locked')).toHaveCount(0);
    await expect(page.locator('.map-pin.done')).toHaveCount(10);
    await expect(page.locator('.map-pin.next')).toHaveCount(0);
    await showMissionList(page);
    await expect(page.locator('button[data-level]')).toHaveCount(10);
  });
});

test.describe('Pass 4.5: HUD modes, touch wheel and effects', () => {
  for (const mode of ['standard', 'minimal', 'telemetry'] as const) {
    test(`HUD mode ${mode}`, async ({ page }) => {
      await seedSave(page, makeSave({ finished: ['pass-run'], owned: OWNED, settings: { hudMode: mode } }));
      const errors = await openGame(page, '&quality=low');
      await startMission(page, 'pass-run', 'druk-ranger');
      await expect(page.locator('#hud')).toHaveAttribute('data-mode', mode);
      if (mode === 'telemetry') await expect(page.locator('#hud-telemetry')).toBeVisible();
      else await expect(page.locator('#hud-telemetry')).toBeHidden();
      await expect(page.locator('#hud-speed')).toBeVisible();
      expect(errors).toEqual([]);
    });
  }

  test('the touch steering wheel turns, springs back and works with the gas pedal', async ({ page }) => {
    await seedSave(page, makeSave({ finished: ['pass-run'], owned: OWNED, settings: { touchControls: 'on', touchSteer: 'wheel' } }));
    const errors = await openGame(page, '&quality=low');
    await startMission(page, 'pass-run', 'druk-ranger');
    await expect(page.locator('.steer-wheel')).toBeVisible();
    await expect(page.locator('.steer-pad')).toBeHidden();
    const fire = (sel: string, type: string, id: number, fx: number, fy: number) =>
      page.evaluate(
        ([s, t, i, x, y]) => {
          const el = document.querySelector(s as string) as HTMLElement;
          const r = el.getBoundingClientRect();
          el.dispatchEvent(new PointerEvent(t as string, { pointerId: i as number, pointerType: 'touch', bubbles: true, cancelable: true, clientX: r.left + r.width * (x as number), clientY: r.top + r.height * (y as number) }));
        },
        [sel, type, id, fx, fy],
      );
    // Grab the rim at the right of the wheel (about 90 degrees clockwise): steer right.
    await fire('.steer-wheel', 'pointerdown', 1, 0.95, 0.5);
    await fire('.pedal.gas', 'pointerdown', 2, 0.5, 0.5);
    await expect.poll(async () => (await readCmd(page)).steer).toBeGreaterThan(0.5);
    await expect.poll(async () => (await readCmd(page)).throttle).toBe(1);
    // Left of centre steers left.
    await fire('.steer-wheel', 'pointermove', 1, 0.05, 0.5);
    await expect.poll(async () => (await readCmd(page)).steer).toBeLessThan(-0.5);
    await fire('.steer-wheel', 'pointerup', 1, 0.05, 0.5);
    await expect.poll(async () => (await readCmd(page)).steer).toBe(0);
    await expect.poll(async () => (await readCmd(page)).throttle).toBe(1); // the other thumb is still down
    await fire('.pedal.gas', 'pointerup', 2, 0.5, 0.5);
    await expect.poll(async () => (await readCmd(page)).throttle).toBe(0);
    expect(errors).toEqual([]);
  });

  test('driving puts exhaust in the particle pool without exceeding it', async ({ page }) => {
    await seedSave(page, makeSave({ finished: ['pass-run'], owned: OWNED }));
    await openGame(page, '&quality=low');
    await startMission(page, 'pass-run', 'druk-ranger');
    await waitForPhase(page, 'running');
    await drive(page, true);
    await expect.poll(async () => (await state(page)).particlesAlive, { timeout: 20_000 }).toBeGreaterThan(0);
    expect((await state(page)).particlesAlive).toBeLessThanOrEqual(320);
  });
});
