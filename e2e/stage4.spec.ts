import { expect, test } from '@playwright/test';
import {
  drive,
  makeSave,
  openGame,
  openGarage,
  seedSave,
  startMission,
  state,
  storedSave,
  waitForPhase,
} from './helpers';

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
const OWNED = ['dzo-hatch', 'tourist-coaster', 'druk-ranger', 'dragon-cruiser'];

test.describe('ten-level arcade campaign', () => {
  test('the mission map lists ten missions in five chapters, with tags, rewards and honest locks', async ({ page }) => {
    const errors = await openGame(page);
    await page.locator('#btn-start').click();
    await expect(page.locator('button[data-level]')).toHaveCount(10);
    await expect(page.locator('.region')).toHaveCount(5);
    await expect(page.locator('#levels-progress')).toContainText('0 of 10 missions complete');
    await expect(page.locator('button[data-level="punakha-valley"]')).toContainText('Finish Thimphu Town Pickup');
    await expect(page.locator('button[data-level="dochula-storm"]')).toContainText('Finish Punakha Valley Tour');
    await expect(page.locator('button[data-level="gmc-plains"]')).toContainText('Finish Bumthang Night Expedition');
    await expect(page.locator('button[data-level="thimphu-pickup"] .tags i').first()).toBeVisible();
    await page.screenshot({ path: 'screenshots/desktop-mission-map.png' });
    expect(errors).toEqual([]);
  });

  test('every mission starts, shows its objective, party and conditions, and runs', async ({ page }) => {
    test.setTimeout(420_000);
    await seedSave(page, makeSave({ finished: ALL, owned: OWNED, credits: 0 }));
    const errors = await openGame(page, '&quality=low');
    const expected: Record<string, { party: number; time: string }> = {
      'pass-run': { party: 2, time: 'day' },
      'thimphu-pickup': { party: 3, time: 'day' },
      'airport-dash': { party: 4, time: 'day' },
      'punakha-valley': { party: 3, time: 'day' },
      'dochula-storm': { party: 3, time: 'day' },
      'chelela-climb': { party: 3, time: 'day' },
      'trongsa-gorge': { party: 2, time: 'day' },
      'bumthang-night': { party: 2, time: 'night' },
      'remote-expedition': { party: 2, time: 'day' },
      'gmc-plains': { party: 0, time: 'day' },
    };
    for (const id of ALL) {
      await startMission(page, id);
      const s = await state(page);
      expect(s.levelId, id).toBe(id);
      expect(s.party, id).toBe(expected[id].party);
      expect(s.time_of_day, id).toBe(expected[id].time);
      expect(s.phase, id).toBe('running');
      await expect(page.locator('#hud-obj')).not.toBeEmpty();
      await page.screenshot({ path: `screenshots/desktop-level-${id}.png` });
      await page.keyboard.press('Escape');
      await page.locator('#btn-pause-menu').click();
      await expect(page.locator('#btn-start')).toBeVisible();
    }
    expect(errors).toEqual([]);
  });

  test('finishing the last unfinished mission opens the campaign-complete screen once', async ({ page }) => {
    test.setTimeout(420_000);
    await seedSave(
      page,
      makeSave({ finished: ALL.filter((id) => id !== 'gmc-plains'), owned: OWNED, credits: 1000 }),
    );
    const errors = await openGame(page, '&quality=low');
    await startMission(page, 'gmc-plains', 'druk-ranger');
    await drive(page, true);
    await expect(page.locator('#screen-finish')).toBeVisible({ timeout: 300_000 });
    await expect(page.locator('#finish-title')).toContainText('Finish line');
    await expect(page.locator('#btn-next-label')).toContainText('Campaign complete');
    await page.locator('#btn-next').click();
    const camp = page.locator('#screen-campaign');
    await expect(camp).toBeVisible();
    await expect(camp).toContainText('Arcade campaign complete');
    await expect(camp).toContainText('10/10');
    await expect(camp).toContainText('not available yet'); // the story mode is announced as future content only
    await expect(camp).toContainText('Novarah Interactives');
    await page.screenshot({ path: 'screenshots/desktop-campaign-complete.png' });
    expect((await storedSave(page)).stats.campaignCompleted).toBe(true);
    await page.locator('#btn-camp-feedback').click();
    await expect(page.locator('#screen-feedback')).toBeVisible();
    await expect(page.locator('#screen-feedback')).toContainText('will not be sent to Novarah');
    await page.keyboard.press('Escape');
    await page.locator('#btn-camp-levels').click();
    await expect(page.locator('#screen-levels')).toBeVisible();
    await expect(page.locator('#levels-progress')).toContainText('10 of 10 missions complete');
    expect(errors).toEqual([]);
  });
});

test.describe('3D assets: loading, fallback and lifecycle', () => {
  test('the detailed vehicle models load and are used', async ({ page }) => {
    await openGame(page);
    await expect.poll(async () => (await state(page)).detailedModel, { timeout: 20_000 }).toBe(true);
  });

  test('if the model files cannot be loaded, the procedural vehicles take over and the game still plays', async ({ page }) => {
    await page.route('**/models/**', (r) => r.abort());
    await seedSave(page, makeSave());
    const errors = await openGame(page);
    await openGarage(page, 'pass-run');
    await expect.poll(async () => (await state(page)).detailedModel).toBe(false);
    await page.locator('#btn-launch').click();
    await waitForPhase(page, 'running', 30_000);
    await page.keyboard.down('KeyW');
    await expect.poll(async () => (await state(page)).speed, { timeout: 15_000 }).toBeGreaterThan(5);
    await page.keyboard.up('KeyW');
    await page.screenshot({ path: 'screenshots/desktop-fallback-models.png' });
    // A blocked file is reported as a warning, never as an uncaught error.
    expect(errors.filter((e) => e.startsWith('pageerror'))).toEqual([]);
  });

  test('switching missions and vehicles repeatedly does not leak GPU geometries or textures', async ({ page }) => {
    test.setTimeout(240_000);
    await seedSave(page, makeSave({ finished: ALL, owned: OWNED }));
    await openGame(page, '&quality=low');
    const base = async (id: string): Promise<{ g: number; t: number }> => {
      await openGarage(page, id);
      await page.waitForTimeout(600);
      const s = await state(page);
      await page.locator('#btn-garage-back').click();
      await page.locator('#btn-levels-back').click();
      await page.waitForTimeout(300);
      return { g: s.stats.geometries, t: s.stats.textures };
    };
    const first = await base('pass-run');
    await base('thimphu-pickup');
    await base('punakha-valley');
    await base('gmc-plains');
    const again = await base('pass-run');
    // The same level after a round trip holds (about) the same amount of GPU memory.
    expect(Math.abs(again.g - first.g)).toBeLessThanOrEqual(12);
    expect(Math.abs(again.t - first.t)).toBeLessThanOrEqual(3);
    // Cycling through all four vehicles in the garage does not grow memory without bound either.
    await openGarage(page, 'pass-run');
    // First lap uploads each cached model once; later laps must add nothing.
    for (let i = 0; i < 4; i++) {
      await page.locator('#btn-veh-next').click();
      await page.waitForTimeout(250);
    }
    const before = (await state(page)).stats.geometries;
    for (let i = 0; i < 8; i++) {
      await page.locator('#btn-veh-next').click();
      await page.waitForTimeout(250);
    }
    expect((await state(page)).stats.geometries - before).toBeLessThanOrEqual(6);
  });

  test('Low quality keeps the detailed models and cuts the world detail', async ({ page }) => {
    await openGame(page, '&quality=low');
    await expect.poll(async () => (await state(page)).detailedModel).toBe(true);
    const low = await state(page);
    expect(low.quality).toBe('low');
    expect(low.pixelRatio).toBeLessThanOrEqual(1);
  });
});
