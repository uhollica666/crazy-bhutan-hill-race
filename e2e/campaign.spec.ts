import { test, expect } from '@playwright/test';
import { drive, timescale, makeSave, openGame, seedSave, startMission, state, storedSave } from './helpers';

const ALL_LEVELS = [
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

for (const [level, vehicle] of [
  ['pass-run', 'dzo-hatch'],
  ['thimphu-pickup', 'dzo-hatch'],
  ['airport-dash', 'tourist-coaster'],
  ['chelela-climb', 'druk-ranger'],
  ['remote-expedition', 'dragon-cruiser'],
  ['punakha-valley', 'dzo-hatch'],
  ['dochula-storm', 'druk-ranger'],
  ['trongsa-gorge', 'dzo-hatch'],
  ['bumthang-night', 'tourist-coaster'],
  ['gmc-plains', 'dragon-cruiser'],
]) {
  test(`full UI mission completion: ${level}/${vehicle}`, async ({ page }) => {
    test.setTimeout(900_000);
    await seedSave(
      page,
      makeSave({
        finished: ALL_LEVELS,
        owned: ['dzo-hatch', 'tourist-coaster', 'druk-ranger', 'dragon-cruiser'],
      }),
    );
    const errors = await openGame(page, '&quality=low');
    await startMission(page, level, vehicle);
    const before = (await storedSave(page)).progress.levels[level]?.completions ?? 0;
    await drive(page);
    // Software-rendered Chrome runs at ~10 fps; a 20-minute mission would not finish in test time at 1x.
    await timescale(page, 6);
    await expect(page.locator('#screen-finish')).toBeVisible({ timeout: 720_000 });
    await expect(page.locator('#finish-stamp')).toHaveText('Mission complete');
    await expect(page.locator('#finish-story')).not.toBeEmpty();
    const s = await state(page);
    expect(s.phase).toBe('finished');
    // Guests dropped off on the way are no longer aboard: the rest ride to the finish.
    expect(s.onboard).toBeGreaterThan(0);
    expect(s.onboard).toBeLessThanOrEqual(s.party);
    expect((await storedSave(page)).progress.levels[level].completions).toBe(before + 1);
    const credits = s.credits;
    await page.waitForTimeout(500);
    const settled = await state(page);
    expect(settled.credits).toBe(credits); // results do not repeatedly grant rewards
    expect(settled.position).toEqual(s.position); // no brake-to-reverse motion behind results
    expect(settled.fuel).toBe(s.fuel);
    await page.screenshot({ path: `screenshots/campaign-${level}-results.png` });
    await page.locator('#btn-replay').click();
    await expect(page.locator('#screen-briefing')).toBeHidden();
    const restarted = await state(page);
    expect(['countdown', 'running']).toContain(restarted.phase);
    expect(restarted.time).toBeLessThan(10);
    expect(restarted.onboard).toBe(0);
    expect(errors).toEqual([]);
  });
}
