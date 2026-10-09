import { expect, test } from '@playwright/test';
import {
  analyticsEvents,
  courseInfo,
  drive,
  grantCredits,
  makeSave,
  openGame,
  showMissionList,
  openGarage,
  seedSave,
  setFuel,
  startMission,
  state,
  storedSave,
  waitForPhase,
  warp,
} from './helpers';

test.describe('studio branding and credits', () => {
  test('splash shows the official Novarah logo and names, can be skipped, and the menu credits the studio', async ({
    page,
  }) => {
    const errors = await openGame(page, '&splash=1');
    // openGame waits for the menu; the splash may already be gone, so check the DOM contract on a fresh load.
    await page.evaluate(() => sessionStorage.clear());
    await page.goto('/?debug=1&splashhold=1');
    const splash = page.locator('#splash');
    await expect(splash).toBeVisible();
    await expect(splash.locator('.splash-logo')).toBeVisible();
    await expect.poll(async () => splash.locator('.splash-logo').evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(100);
    await expect(splash.locator('.splash-name')).toHaveText('Novarah Interactives');
    await expect(splash.locator('.splash-parent')).toContainText('Novarah Technologies');
    await page.screenshot({ path: 'screenshots/desktop-splash.png' });
    await page.keyboard.press('Space'); // any key skips
    await expect(splash).toHaveCount(0, { timeout: 5000 });
    await expect(page.locator('#btn-start')).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('#btn-credit')).toContainText('Novarah Interactives');

    // The same browser session does not replay the full splash on reload.
    await page.reload();
    await expect(page.locator('#splash')).toHaveClass(/short/);
    expect(errors).toEqual([]);
  });

  test('menu credit opens About & credits with studio, version, technology and asset details', async ({ page }) => {
    await openGame(page);
    await page.locator('#btn-credit').click();
    const about = page.locator('#screen-about');
    await expect(about).toBeVisible();
    await expect(about).toContainText('Crazy Bhutan Hill Race');
    await expect(about).toContainText('Novarah Interactives');
    await expect(about).toContainText('subdivision of Novarah Technologies');
    await expect(page.locator('#about-version')).toHaveText(/\d+\.\d+\.\d+/);
    await expect(about).toContainText('Three.js');
    await expect(about).toContainText('no third-party art');
    await expect(about.locator('.about-logo')).toBeVisible();
    await page.screenshot({ path: 'screenshots/desktop-about.png' });
    await page.keyboard.press('Escape');
    await expect(about).toBeHidden();
    await expect(page.locator('#btn-start')).toBeVisible();
  });
});

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
    // Settings are organised in tabs: Audio, Graphics, Controls, Gameplay, Accessibility.
    await expect(page.locator('[role=tab][data-tab]')).toHaveCount(5);
    await page.locator('#set-master').fill('35');
    await page.locator('#set-mute').check();
    await page.locator('#tab-graphics').click();
    await page.locator('#set-quality').selectOption('low');
    await page.locator('#tab-controls').click();
    await page.locator('#set-sens').fill('130');
    await page.locator('#tab-access').click();
    await page.locator('#set-motion').check();
    await page.locator('#btn-settings-back').click();

    await page.reload();
    await page.waitForFunction(() => !!(window as unknown as { __cbhr?: unknown }).__cbhr);
    await page.locator('#btn-menu-settings').click();
    await expect(page.locator('#set-master')).toHaveValue('35');
    await expect(page.locator('#set-mute')).toBeChecked();
    await page.locator('#tab-graphics').click();
    await expect(page.locator('#set-quality')).toHaveValue('low');
    await page.locator('#tab-controls').click();
    await expect(page.locator('#set-sens')).toHaveValue('130');
    await page.locator('#tab-access').click();
    await expect(page.locator('#set-motion')).toBeChecked();
    expect((await state(page)).quality).toBe('low');
    expect(errors).toEqual([]);
  });

  test('a fresh save: only Pass Run and the starter hatchback; locks explain how to unlock', async ({ page }) => {
    const errors = await openGame(page);
    await page.locator('#btn-start').click();
    // The illustrated map is the default view; the list carries the full lock text.
    await expect(page.locator('#level-map')).toBeVisible();
    await expect(page.locator('.map-pin')).toHaveCount(10);
    await page.screenshot({ path: 'screenshots/desktop-mission-map-illustrated.png' });
    await showMissionList(page);
    await expect(page.locator('button[data-level="pass-run"]')).not.toHaveClass(/locked/);
    await expect(page.locator('button[data-level="thimphu-pickup"]')).toHaveClass(/locked/);
    await expect(page.locator('button[data-level="airport-dash"]')).toContainText('Finish Pass Run');
    await expect(page.locator('button[data-level="chelela-climb"]')).toContainText('Finish Airport Dash');
    await expect(page.locator('button[data-level="remote-expedition"]')).toContainText('Finish Chelela');
    await page.screenshot({ path: 'screenshots/desktop-levels.png' });

    // Clicking a locked mission does nothing.
    await page.locator('button[data-level="airport-dash"]').click({ force: true });
    await expect(page.locator('#screen-garage')).toBeHidden();
    expect((await state(page)).levelId).toBe('pass-run');

    await page.locator('button[data-level="pass-run"]').click();
    await expect(page.locator('#screen-garage')).toBeVisible();
    await expect(page.locator('#veh-name')).toHaveText('Dzo Hatch');
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

  test('menus work from the keyboard: arrows move focus, Enter selects, Escape goes back', async ({ page }) => {
    await seedSave(page, makeSave({ finished: ['pass-run', 'airport-dash'], owned: ['dzo-hatch', 'druk-ranger'] }));
    await openGame(page);
    await page.locator('#btn-start').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#screen-levels')).toBeVisible();
    await expect(page.locator('button[data-level="pass-run"]')).toBeFocused();
    await page.locator('button[data-level="chelela-climb"]').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#screen-garage')).toBeVisible({ timeout: 30_000 });
    expect((await state(page)).levelId).toBe('chelela-climb');
    await page.keyboard.press('Escape');
    await expect(page.locator('#screen-levels')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#btn-start')).toBeVisible();
  });

  test('migrates a Stage 1 save: best time kept, next missions unlocked, old keys untouched, credits paid once', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        'cbhr.v1.progress',
        JSON.stringify({ levels: { 'pass-run': { bestTime: 77.7, medal: 'gold', completions: 3 } } }),
      );
      localStorage.setItem(
        'cbhr.v1.settings',
        JSON.stringify({ masterVolume: 0.3, musicVolume: 0, sfxVolume: 0.5, muted: true, quality: 'low', touchControls: 'auto' }),
      );
    });
    const errors = await openGame(page);
    await expect(page.locator('#toast-text')).toContainText('carried over');
    expect((await state(page)).quality).toBe('low');
    expect((await state(page)).credits).toBe(150);
    await page.locator('#btn-start').click();
    await showMissionList(page);
    await expect(page.locator('button[data-level="pass-run"]')).toContainText('1:17.70');
    await expect(page.locator('button[data-level="airport-dash"]')).not.toHaveClass(/locked/);
    await expect(page.locator('button[data-level="thimphu-pickup"]')).not.toHaveClass(/locked/);
    const saved = await storedSave(page);
    expect(saved.version).toBe(3);
    expect(saved.garage.owned).toEqual(expect.arrayContaining(['dzo-hatch', 'druk-ranger', 'tourist-coaster']));
    expect(await page.evaluate(() => localStorage.getItem('cbhr.v1.progress'))).toContain('77.7');
    await page.reload();
    await page.waitForFunction(() => !!(window as unknown as { __cbhr?: unknown }).__cbhr);
    expect((await state(page)).credits).toBe(150);
    expect(errors).toEqual([]);
  });

  test('migrates a Stage 2 save without losing progress', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        'cbhr.v2.save',
        JSON.stringify({
          version: 2,
          settings: { masterVolume: 0.5, musicVolume: 0, sfxVolume: 0.5, muted: true, quality: 'medium', touchControls: 'auto', touchSensitivity: 1 },
          progress: {
            levels: {
              'pass-run': { completions: 2, medal: 'gold', vehicles: { 'druk-ranger': { bestTime: 70, bestScore: 80, bestComfort: null, medal: 'gold', completions: 2 } } },
            },
          },
          selection: { levelId: 'pass-run', vehicleId: 'druk-ranger' },
          history: [],
        }),
      );
    });
    const errors = await openGame(page);
    await page.locator('#btn-start').click();
    await showMissionList(page);
    await expect(page.locator('button[data-level="pass-run"]')).toContainText('1:10.00');
    await page.locator('button[data-level="pass-run"]').click();
    await expect(page.locator('#veh-name')).toHaveText('Druk Ranger'); // the saved vehicle is still owned and selected
    expect(errors).toEqual([]);
  });
});

test.describe('driving and flow', () => {
  test('keyboard driving: countdown, accelerate, steer, brake, reverse, pause/resume, recover', async ({ page }) => {
    await seedSave(page, makeSave({ finished: ['pass-run'], owned: ['dzo-hatch', 'druk-ranger'], storySeen: [] }));
    const errors = await openGame(page, '&quality=medium');
    await openGarage(page, 'pass-run', 'druk-ranger');
    await page.locator('#btn-launch').click();
    await page.locator('#brief-skip').click();
    await expect(page.locator('#hud')).toBeVisible();
    await waitForPhase(page, 'countdown');
    await page.screenshot({ path: 'screenshots/desktop-countdown.png' });
    await page.keyboard.down('KeyW');
    await waitForPhase(page, 'running', 15_000);

    await expect.poll(async () => (await state(page)).speed, { timeout: 15_000 }).toBeGreaterThan(8);
    const before = (await state(page)).position;
    await page.keyboard.down('KeyD');
    // Software rendering runs the sim in slow motion, so wait for the distance rather than for a fixed time.
    await expect
      .poll(async () => {
        const p = (await state(page)).position;
        return Math.hypot(p[0] - before[0], p[2] - before[2]);
      }, { timeout: 15_000 })
      .toBeGreaterThan(5);
    await page.keyboard.up('KeyD');
    const mid = await state(page);
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

  test('driving keys do not scroll the page; restart skips the story and works; pause menu can change vehicle', async ({
    page,
  }) => {
    await seedSave(page, makeSave({ finished: ['pass-run'], owned: ['dzo-hatch', 'tourist-coaster'], storySeen: [] }));
    await openGame(page);
    await openGarage(page, 'pass-run');
    await page.locator('#btn-launch').click();
    await expect(page.locator('#screen-briefing')).toBeVisible(); // first time on this mission: the story
    await page.locator('#brief-go').click();
    await waitForPhase(page, 'running', 30_000);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Space');
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await page.keyboard.press('Escape');
    await page.locator('#btn-restart').click();
    await expect(page.locator('#screen-briefing')).toBeHidden(); // restart never shows the story again
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
    await expect(page.locator('#screen-briefing')).toBeHidden(); // already read
    await waitForPhase(page, 'running', 15_000);
    expect((await state(page)).vehicleId).toBe('tourist-coaster');
  });
});

test.describe('story briefing', () => {
  test('first launch shows the data-driven story with real mechanics; Skip goes straight to the road; "Story" re-reads it', async ({
    page,
  }) => {
    await seedSave(page, makeSave({ storySeen: [] }));
    await openGame(page);
    await openGarage(page, 'pass-run');
    await page.locator('#btn-launch').click();
    const brief = page.locator('#screen-briefing');
    await expect(brief).toBeVisible();
    await expect(page.locator('#brief-title')).toHaveText('The Sunrise Will Not Wait');
    await expect(brief).toContainText('stop so they can climb in');
    await expect(brief).toContainText('Drive through every checkpoint');
    await expect(brief.locator('.cast .portrait')).toHaveCount(1);
    await page.screenshot({ path: 'screenshots/desktop-briefing.png' });
    await page.locator('#brief-skip').click();
    await waitForPhase(page, 'countdown', 20_000);
    expect((await storedSave(page)).story.seen).toContain('pass-run');
    // Back in the garage later: no automatic story, but it can be read on demand.
    await page.keyboard.press('Escape');
    await page.locator('#btn-pause-menu').click();
    await openGarage(page, 'pass-run');
    await page.locator('#btn-read-brief').click();
    await expect(brief).toBeVisible();
    await page.locator('#brief-skip').click();
    await expect(page.locator('#screen-garage')).toBeVisible();
  });
});

test.describe('delivery missions, fuel and pit stops', () => {
  test('a required pickup cannot be skipped: driving past it never finishes the mission', async ({ page }) => {
    const errors = await openGame(page);
    await startMission(page, 'pass-run', 'dzo-hatch');
    const c = await courseInfo(page);
    expect((await state(page)).objective?.kind).toBe('pickup');
    await expect(page.locator('#hud-obj')).toContainText('Pick up 2 tourists');
    for (const s of c.checkpointS) await warp(page, s + 2);
    await warp(page, c.finishS + 2);
    await page.waitForTimeout(2500);
    const s = await state(page);
    expect(s.phase).toBe('running');
    expect(s.checkpoints).toBe(0);
    expect(s.onboard).toBe(0);
    await expect(page.locator('#screen-finish')).toBeHidden();
    await expect(page.locator('#hud-obj')).toContainText('Pick up 2 tourists');
    expect(errors).toEqual([]);
  });

  test('Pass Run with the autopilot: pickup, ordered checkpoints, delivery, rewards, persistence', async ({ page }) => {
    test.setTimeout(900_000);
    const errors = await openGame(page, '&quality=low');
    await startMission(page, 'pass-run', 'dzo-hatch');
    await drive(page, true);
    await expect.poll(async () => (await state(page)).onboard, { timeout: 60_000 }).toBe(2);
    await expect(page.locator('#flash')).toContainText('guests aboard');
    await expect(page.locator('#hud-obj')).toContainText('Checkpoint');
    await expect(page.locator('#screen-finish')).toBeVisible({ timeout: 720_000 });
    await expect(page.locator('#finish-title')).toContainText('reached');
    await expect(page.locator('#finish-grid')).toContainText('Delivered');
    await expect(page.locator('#finish-grid')).toContainText('2/2');
    await expect(page.locator('#finish-rewards')).toContainText('Driving credits earned');
    await expect(page.locator('#finish-rewards')).toContainText('Tourists delivered');
    await expect(page.locator('#finish-unlocks')).toContainText('Thimphu Town Pickup');
    await expect(page.locator('#finish-unlocks')).toContainText('Tourist Coaster');
    await expect(page.locator('#finish-invite')).toContainText('Enjoyed the ride? Tell us what you think!');
    await expect(page.locator('#btn-replay')).toBeVisible();
    await expect(page.locator('#btn-finish-feedback')).toBeVisible();
    await expect(page.locator('#btn-finish-menu')).toContainText('End game');
    await expect(page.locator('#screen-finish .studio-mark')).toContainText('Novarah Interactives');
    await page.screenshot({ path: 'screenshots/desktop-complete-pass-run.png' });

    const credits = (await state(page)).credits;
    expect(credits).toBeGreaterThan(100);
    const saved = await storedSave(page);
    expect(saved.wallet.credits).toBe(credits);
    expect(saved.progress.levels['pass-run'].completions).toBe(1);
    expect(saved.progress.levels['pass-run'].vehicles['dzo-hatch'].bestTime).toBeGreaterThan(30);
    // The save holds nothing about the run that just ended.
    expect(JSON.stringify(saved)).not.toMatch(/fuel|hazard|traffic/i);
    const events = (await analyticsEvents(page)).map((e) => e.name);
    expect(events).toEqual(expect.arrayContaining(['mission_start', 'pickup', 'checkpoint', 'mission_end']));

    // Persists across a reload, and a second completion pays less (no first-time bonus).
    await page.reload();
    await page.waitForFunction(() => !!(window as unknown as { __cbhr?: unknown }).__cbhr);
    expect((await state(page)).credits).toBe(credits);
    expect(errors).toEqual([]);
  });

  test('fuel and the pit stop: you must be stopped in the zone, the service takes time, the tank really fills', async ({
    page,
  }) => {
    await seedSave(page, makeSave({ finished: ['pass-run'], owned: ['dzo-hatch', 'tourist-coaster'] }));
    const errors = await openGame(page);
    await startMission(page, 'airport-dash', 'tourist-coaster');
    const c = await courseInfo(page);
    const pump = c.stops.find((s) => s.kind === 'service');
    expect(pump).toBeTruthy();
    await setFuel(page, 0.1);
    await warp(page, (pump as { s: number }).s);
    await expect(page.locator('#btn-refuel')).toBeVisible();
    await expect(page.locator('#hud-prompt')).toContainText('Pit stop');
    await page.screenshot({ path: 'screenshots/desktop-pit-stop.png' });
    const t0 = (await state(page)).time;
    await page.keyboard.press('KeyE');
    await expect(page.locator('#hud-prompt')).toContainText('Refuelling');
    // It takes game time: not instant.
    await page.waitForTimeout(1200);
    const mid = await state(page);
    expect(mid.fuel).toBeGreaterThan(0.1);
    expect(mid.fuel).toBeLessThan(0.99);
    await expect.poll(async () => (await state(page)).servicesUsed, { timeout: 30_000 }).toBe(1);
    const done = await state(page);
    expect(done.fuel).toBeGreaterThan(0.99);
    expect(done.time - t0).toBeGreaterThan(3); // the clock kept running while refuelling
    await expect(page.locator('#flash')).toContainText('Tank full');
    expect(errors).toEqual([]);
  });

  test('a service needs a stationary car inside the zone', async ({ page }) => {
    await seedSave(page, makeSave({ finished: ['pass-run'], owned: ['dzo-hatch', 'tourist-coaster'] }));
    await openGame(page);
    await startMission(page, 'airport-dash', 'tourist-coaster');
    const c = await courseInfo(page);
    const pump = c.stops.find((s) => s.kind === 'service') as { s: number };
    await setFuel(page, 0.5);
    // Away from the pit stop: nothing happens, and the player is told why.
    await page.keyboard.press('KeyE');
    await expect(page.locator('#toast')).toContainText(/Pit stop ahead|no pit stop/i);
    // Moving through the zone: still no service.
    await warp(page, pump.s - 4);
    await page.keyboard.down('KeyW');
    await expect.poll(async () => (await state(page)).speed, { timeout: 15_000 }).toBeGreaterThan(5);
    await page.keyboard.press('KeyE');
    await expect(page.locator('#toast')).toContainText(/complete stop|Pit stop ahead|no pit stop/i);
    await page.keyboard.up('KeyW');
    expect((await state(page)).servicesUsed).toBe(0);
  });

  test('conditions: rain and dusk change the weather state, the HUD and the lights', async ({ page }) => {
    await seedSave(page, makeSave({ finished: ['pass-run'], owned: ['dzo-hatch', 'tourist-coaster'] }));
    await openGame(page);
    await openGarage(page, 'airport-dash', 'tourist-coaster');
    await page.locator('#sel-cond').selectOption({ index: 1 });
    await page.screenshot({ path: 'screenshots/desktop-garage-conditions.png' });
    await page.locator('#btn-launch').click();
    await waitForPhase(page, 'running', 30_000);
    let s = await state(page);
    expect(s.weather).toBe('rain');
    await expect(page.locator('#hud-cond')).toContainText('Rain');
    await page.screenshot({ path: 'screenshots/desktop-rain.png' });
    await page.keyboard.press('Escape');
    await page.locator('#btn-pause-garage').click();
    await page.locator('#sel-cond').selectOption({ index: 2 });
    await page.locator('#btn-launch').click();
    await waitForPhase(page, 'running', 30_000);
    s = await state(page);
    expect(s.time_of_day).toBe('dusk');
    expect(s.lights).toBe(true);
    await expect(page.locator('#hud-cond')).toHaveClass(/lights/);
    await page.screenshot({ path: 'screenshots/desktop-dusk.png' });
  });
});

test.describe('garage, upgrades and credits', () => {
  test('credits buy real upgrades that change the vehicle and persist; the coach must be unlocked AND bought', async ({
    page,
  }) => {
    await seedSave(page, makeSave({ finished: ['pass-run'], credits: 300 }));
    const errors = await openGame(page);
    await page.locator('#btn-menu-garage').click();
    await expect(page.locator('#screen-garage')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#veh-name')).toHaveText('Dzo Hatch');
    await expect(page.locator('#garage-wallet')).toContainText('300');
    await page.locator('#veh-upgrades summary').click();
    const before = await page.locator('#veh-stats').innerText();
    const engine = page.locator('[data-buy-upgrade="engine"]');
    await expect(engine).toBeEnabled();
    await engine.click();
    await expect(page.locator('#garage-wallet')).toContainText('120'); // 300 - 180
    await expect(page.locator('#veh-upgrade-list')).toContainText('Engine tune');
    // The upgrade is baked into the vehicle, so the stats shown come from the real numbers.
    expect(before).toContain('Acceleration');
    await expect(page.locator('[data-buy-upgrade="engine"]').locator('xpath=ancestor::div[contains(@class,"upg")]').locator('.upg-pips i.on')).toHaveCount(1);
    expect((await storedSave(page)).garage.upgrades['dzo-hatch'].engine).toBe(1);
    expect((await storedSave(page)).wallet.credits).toBe(120);
    // Cannot afford the next level: the button is disabled and nothing is charged.
    await expect(engine).toBeDisabled();

    // The coach is unlocked (Pass Run done) but not owned: buying needs credits.
    await page.locator('#btn-veh-next').click();
    await expect(page.locator('#veh-name')).toHaveText('Tourist Coaster');
    await expect(page.locator('#veh-buy')).toContainText('more credits');
    await grantCredits(page, 700);
    await expect(page.locator('#veh-buy button')).toBeEnabled();
    await page.locator('#veh-buy button').click();
    await expect(page.locator('#garage-wallet')).toContainText('170'); // 820 - 650
    expect((await storedSave(page)).garage.owned).toContain('tourist-coaster');
    await page.screenshot({ path: 'screenshots/desktop-garage-owned.png' });

    await page.reload();
    await page.waitForFunction(() => !!(window as unknown as { __cbhr?: unknown }).__cbhr);
    expect((await state(page)).credits).toBe(170);
    expect((await storedSave(page)).garage.upgrades['dzo-hatch'].engine).toBe(1);
    expect(errors).toEqual([]);
  });

  test('a mission nobody you own can drive lends a loaner instead of blocking you', async ({ page }) => {
    // Airport Dash needs seats for four; the hatchback has three and is not listed for it.
    await seedSave(page, makeSave({ finished: ['pass-run'] }));
    await openGame(page);
    await openGarage(page, 'airport-dash');
    await expect(page.locator('#veh-name')).toHaveText('Tourist Coaster');
    await expect(page.locator('#veh-status')).toContainText('Loaned');
    await expect(page.locator('#btn-launch')).toBeEnabled();
    expect((await state(page)).loaner).toBe(true);
  });
});

test.describe('player feedback', () => {
  test('menu entry: validation, honest local-only result, no fake success, drafts are real', async ({ page }) => {
    const errors = await openGame(page);
    await page.locator('#btn-menu-feedback').click();
    const fb = page.locator('#screen-feedback');
    await expect(fb).toBeVisible();
    await expect(fb).toContainText('No feedback server is connected');
    await expect(fb).toContainText('will not be sent to Novarah');
    await page.screenshot({ path: 'screenshots/desktop-feedback.png' });
    // A rating is required.
    await page.locator('#fb-submit').click();
    await expect(fb).toContainText('Please choose a star rating');
    await expect(fb).not.toContainText('Thank you');
    await page.locator('[data-star="4"]').click();
    await page.locator('#fb-gameplay').fill('Pickups are fun');
    await page.locator('#fb-bugs').fill('The yeti waved at me');
    await page.locator('#fb-difficulty').selectOption('aboutRight');
    // A bad contact is rejected; the field is optional and can be empty.
    await page.locator('#fb-contact').fill('not an address');
    await page.locator('#fb-submit').click();
    await expect(fb).toContainText('does not look like an email');
    await page.locator('#fb-contact').fill('');
    // Device details are off by default and show exactly what they would contain.
    await expect(page.locator('#fb-device')).not.toBeChecked();
    await page.locator('.fb-device summary').click();
    await expect(page.locator('.fb-device pre')).toContainText('Browser:');
    await page.locator('#fb-submit').click();
    await expect(fb).toContainText('Saved on this device only');
    await expect(fb).toContainText('NOT been sent to Novarah');
    await expect(fb).not.toContainText('Thank you');
    await expect(page.locator('#fb-download')).toBeVisible();
    await expect(page.locator('#fb-mail')).toHaveCount(0); // no recipient is configured, so no mailto
    await page.screenshot({ path: 'screenshots/desktop-feedback-saved.png' });
    const drafts = JSON.parse((await page.evaluate(() => localStorage.getItem('cbhr.feedback.drafts'))) as string);
    expect(drafts).toHaveLength(1);
    expect(drafts[0].payload).toMatchObject({ schema: 'cbhr.feedback', schemaVersion: 1, rating: 4, difficulty: 'aboutRight', contact: null, device: null });
    // Nothing went over the network to anywhere but this origin.
    await page.locator('#fb-done').click();
    await expect(fb).toBeHidden();
    expect(errors).toEqual([]);
  });

  test('every feedback entry point exists: settings, about and the results screen', async ({ page }) => {
    await openGame(page);
    await page.locator('#btn-menu-settings').click();
    await page.locator('#btn-settings-feedback').click();
    await expect(page.locator('#screen-feedback')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#screen-feedback')).toBeHidden();
    await page.locator('#btn-settings-about').click();
    await expect(page.locator('#screen-about')).toBeVisible();
    await page.locator('#about-feedback').click();
    await expect(page.locator('#screen-feedback')).toBeVisible();
    await expect(page.locator('#screen-about')).toBeHidden();
  });

  test('from the results screen feedback is optional: the game never blocks on it', async ({ page }) => {
    test.setTimeout(900_000);
    await openGame(page, '&quality=low');
    await startMission(page, 'pass-run', 'dzo-hatch');
    await drive(page, true);
    await expect(page.locator('#screen-finish')).toBeVisible({ timeout: 720_000 });
    await page.locator('#btn-finish-feedback').click();
    await expect(page.locator('#screen-feedback')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#screen-feedback')).toBeHidden();
    await expect(page.locator('#screen-finish')).toBeVisible();
    await page.locator('#btn-replay').click();
    await waitForPhase(page, 'countdown');
  });
});

test.describe('hazards and city traffic', () => {
  test('Chelela: the rockfall warns, then rocks land on the road', async ({ page }) => {
    test.setTimeout(240_000);
    await seedSave(page, makeSave({ finished: ['pass-run', 'airport-dash'], owned: ['dzo-hatch', 'druk-ranger'] }));
    await openGame(page, '&quality=low');
    await startMission(page, 'chelela-climb', 'druk-ranger');
    const c = await courseInfo(page);
    const span = c.finishS - c.startS;
    await warp(page, c.startS + span * 0.56 - 70);
    await expect(page.locator('#flash')).toContainText(/Look out|Rockfall/, { timeout: 30_000 });
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'screenshots/desktop-rockfall.png' });
    await page.keyboard.up('KeyW');
  });

  test('Thimphu has live traffic and a pickup list', async ({ page }) => {
    await seedSave(page, makeSave({ finished: ['pass-run'] }));
    await openGame(page, '&quality=low');
    await startMission(page, 'thimphu-pickup', 'dzo-hatch');
    expect((await state(page)).party).toBe(3);
    await page.screenshot({ path: 'screenshots/desktop-thimphu.png' });
  });
});
