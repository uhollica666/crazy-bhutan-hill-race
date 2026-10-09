import { test, expect } from '@playwright/test';
import { drive, makeSave, openGame, seedSave, startMission, state, storedSave } from './helpers';

for (const [level, vehicle] of [
  ['pass-run', 'dzo-hatch'],
  ['thimphu-pickup', 'dzo-hatch'],
  ['airport-dash', 'tourist-coaster'],
  ['chelela-climb', 'druk-ranger'],
  ['remote-expedition', 'dragon-cruiser'],
]) {
  test(`full UI mission completion: ${level}/${vehicle}`, async ({ page }) => {
    test.setTimeout(420_000);
    await seedSave(
      page,
      makeSave({
        finished: ['pass-run', 'airport-dash', 'chelela-climb'],
        owned: ['dzo-hatch', 'tourist-coaster', 'druk-ranger', 'dragon-cruiser'],
      }),
    );
    const errors = await openGame(page, '&quality=low');
    await startMission(page, level, vehicle);
    const before = (await storedSave(page)).progress.levels[level]?.completions ?? 0;
    await drive(page);
    await expect(page.locator('#screen-finish')).toBeVisible({ timeout: 360_000 });
    const s = await state(page);
    expect(s.phase).toBe('finished');
    expect(s.onboard).toBe(s.party);
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
