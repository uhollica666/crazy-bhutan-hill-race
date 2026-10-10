import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { drive, makeSave, openGame, seedSave, showMissionList, startMission, state, timescale } from './helpers';

interface MusicState {
  slug: string | null;
  scene: string | null;
  playing: boolean;
  audible: number;
  format: 'webm' | 'mp3';
  enabled: boolean;
  deckCount: number;
  raceTrack: string | null;
}
const music = async (page: Page): Promise<MusicState> => ((await state(page)) as unknown as { music: MusicState }).music;
const slugIs = (page: Page, slug: string) => expect.poll(async () => (await music(page)).slug, { timeout: 20_000 }).toBe(slug);
const RACE = ['off-road-blitz', 'off-road-fury', 'mountain-road-fury'];

test.describe('soundtrack', () => {
  test('follows the screen the player is on, streams only what it plays, and respects the music controls', async ({ page }) => {
    test.setTimeout(240_000);
    const audioRequests: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('/audio/music/')) audioRequests.push(new URL(r.url()).pathname.split('/').pop() ?? '');
    });
    await seedSave(page, makeSave({ settings: { muted: false, musicVolume: 0.8, quality: 'low' } }));
    const errors = await openGame(page, '&quality=low');

    // Nothing is downloaded before there is a reason to play.
    expect(audioRequests).toEqual([]);

    // Main menu music starts at the first gesture (the click that leaves the menu also counts, so check the menu first).
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await slugIs(page, 'road-to-the-clouds');
    const first = await music(page);
    expect(first.playing).toBe(true);
    expect(first.format).toBe('webm');
    expect(first.audible).toBe(1);

    // Mission selection.
    await page.locator('#btn-start').click();
    // A first-time player is offered Route 0 (the Driver's Academy): decline it to reach the mission map.
    const skip = page.getByRole('button', { name: 'Skip for now' });
    if (await skip.isVisible({ timeout: 3000 }).catch(() => false)) await skip.click();
    await showMissionList(page);
    await slugIs(page, 'mountain-pass');

    // Garage.
    await page.locator('button[data-level="pass-run"]').click();
    await expect(page.locator('#screen-garage')).toBeVisible({ timeout: 30_000 });
    await slugIs(page, 'mischievous-groove');

    // A race: one of the three race tracks, and the same one through pause and resume.
    await page.locator('#btn-launch').click();
    const brief = page.locator('#brief-go');
    if (await brief.isVisible().catch(() => false)) await brief.click();
    await expect.poll(async () => RACE.includes((await music(page)).slug ?? ''), { timeout: 20_000 }).toBe(true);
    const raceSlug = (await music(page)).slug;
    await page.keyboard.press('Escape');
    await expect(page.locator('#screen-pause')).toBeVisible();
    await page.waitForTimeout(1200);
    expect((await music(page)).slug).toBe(raceSlug);
    expect((await music(page)).audible).toBe(1);
    await page.locator('#btn-resume').click();
    await page.waitForTimeout(600);
    expect((await music(page)).slug).toBe(raceSlug);

    // Mute music only: the soundtrack stops, the setting persists, and nothing new is fetched while muted.
    await page.keyboard.press('Escape');
    await page.locator('#btn-pause-settings').click();
    await page.locator('#set-music-mute').check();
    await expect.poll(async () => (await music(page)).enabled).toBe(false);
    await expect.poll(async () => (await music(page)).audible, { timeout: 10_000 }).toBe(0);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('cbhr.v3.save') ?? '{}').settings);
    expect(saved.musicMuted).toBe(true);
    expect(saved.sfxVolume).toBeGreaterThan(0); // sound effects are untouched
    await page.locator('#set-music-mute').uncheck();
    await expect.poll(async () => (await music(page)).enabled).toBe(true);
    await expect.poll(async () => (await music(page)).audible, { timeout: 20_000 }).toBe(1);

    // Never more than two players, and only the tracks that were visited were fetched (not the whole soundtrack).
    expect((await music(page)).deckCount).toBeLessThanOrEqual(2);
    const tracks = new Set(audioRequests.filter((f) => f.endsWith('.webm')));
    expect(tracks.size).toBeGreaterThanOrEqual(4);
    expect(tracks.size).toBeLessThanOrEqual(6);
    expect(audioRequests.some((f) => f.endsWith('.mp3'))).toBe(false);
    expect(errors).toEqual([]);
  });

  test('credits, the extreme finale and the victory theme (completed missions only)', async ({ page }) => {
    test.setTimeout(420_000);
    await seedSave(page, makeSave({ finished: ['pass-run', 'thimphu-pickup', 'airport-dash', 'punakha-valley', 'dochula-storm', 'trongsa-gorge', 'chelela-climb', 'bumthang-night', 'remote-expedition'], owned: ['dzo-hatch', 'druk-ranger', 'dragon-cruiser'], settings: { muted: false, musicVolume: 0.8 } }));
    const errors = await openGame(page, '&quality=low');
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await slugIs(page, 'road-to-the-clouds');

    // About and credits have their own track, and closing it returns to the menu music.
    await page.locator('#btn-credit').click();
    await expect(page.locator('#screen-about')).toBeVisible();
    await slugIs(page, 'himalayan-sunset');
    await page.locator('#about-done').click();
    await slugIs(page, 'road-to-the-clouds');

    // The finale is an extreme challenge.
    await startMission(page, 'gmc-plains', 'druk-ranger');
    await slugIs(page, 'maquina-de-guerra');
    await page.keyboard.press('Escape');
    await page.locator('#btn-pause-menu').click();
    await slugIs(page, 'road-to-the-clouds');

    // A completed mission earns the victory theme.
    await startMission(page, 'pass-run', 'dzo-hatch');
    await expect.poll(async () => RACE.includes((await music(page)).slug ?? ''), { timeout: 20_000 }).toBe(true);
    await drive(page);
    await timescale(page, 6);
    await expect(page.locator('#screen-finish')).toBeVisible({ timeout: 300_000 });
    await slugIs(page, 'first-place-summit');
    // Replaying starts a new race on a race track again.
    await page.locator('#btn-replay').click();
    await expect.poll(async () => RACE.includes((await music(page)).slug ?? ''), { timeout: 20_000 }).toBe(true);
    expect(errors).toEqual([]);
  });

  test('branding: manifest icons, favicons and the social card are served', async ({ page, request }) => {
    const manifest = await (await request.get('/manifest.webmanifest')).json();
    const purposes = manifest.icons.map((i: { sizes: string; purpose: string }) => `${i.sizes}:${i.purpose}`).sort();
    expect(purposes).toEqual(['192x192:any', '192x192:maskable', '512x512:any', '512x512:maskable']);
    for (const icon of manifest.icons) {
      const res = await request.get('/' + icon.src);
      expect(res.ok(), icon.src).toBe(true);
      expect(res.headers()['content-type']).toContain('image/png');
    }
    await openGame(page, '&quality=low');
    const links = await page.evaluate(() => [...document.querySelectorAll('link[rel~=icon], link[rel=apple-touch-icon]')].map((l) => (l as HTMLLinkElement).getAttribute('href')));
    expect(links).toEqual(expect.arrayContaining(['./favicon.ico', './favicon-16.png', './favicon-32.png', './favicon-48.png', './apple-touch-icon.png']));
    for (const href of links as string[]) expect((await request.get('/' + href.replace('./', ''))).ok(), href).toBe(true);
    expect((await request.get('/og-image.png')).ok()).toBe(true);
    expect((await request.get('/brand/cbhr-logo.webp')).ok()).toBe(true);
  });
});
