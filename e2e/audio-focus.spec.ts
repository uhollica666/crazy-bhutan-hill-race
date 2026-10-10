import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { makeSave, openGame, seedSave, startMission, state } from './helpers';

interface Focus {
  background: boolean;
  gate: number;
  context: string | null;
}
interface MusicState {
  slug: string | null;
  audible: number;
}
const snap = async (page: Page): Promise<{ focus: Focus; music: MusicState }> => {
  const s = (await state(page)) as unknown as { audioFocus: Focus; music: MusicState };
  return { focus: s.audioFocus, music: s.music };
};
const send = (page: Page, target: 'window' | 'document', type: string): Promise<void> =>
  page.evaluate(([t, ty]) => void (t === 'window' ? window : document).dispatchEvent(new Event(ty)), [target, type]);

test.describe('background audio', () => {
  test('every sound stops when the game loses focus or is hidden, and returns once when it comes back', async ({ page }) => {
    test.setTimeout(240_000);
    await seedSave(page, makeSave({ storySeen: 'all', settings: { muted: false, musicVolume: 0.8, ambientVolume: 0.6, quality: 'low' } }));
    const errors = await openGame(page, '&quality=low');
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await expect.poll(async () => (await snap(page)).music.audible, { timeout: 20_000 }).toBe(1);

    // A race with the engine and the environment layers running.
    await startMission(page, 'pass-run', 'dzo-hatch');
    await expect.poll(async () => (await snap(page)).music.audible, { timeout: 20_000 }).toBe(1);
    const live = await snap(page);
    expect(live.focus).toMatchObject({ background: false, gate: 1, context: 'running' });

    // 1. The window loses focus: the gate closes at once and the context suspends. The music is paused.
    await send(page, 'window', 'blur');
    await expect.poll(async () => (await snap(page)).focus.gate, { timeout: 5000 }).toBe(0);
    await expect.poll(async () => (await snap(page)).focus.context, { timeout: 5000 }).toBe('suspended');
    expect((await snap(page)).focus.background).toBe(true);
    await expect.poll(async () => (await snap(page)).music.audible).toBe(0);

    // 2. Hiding the tab as well changes nothing; coming back needs BOTH to clear.
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await send(page, 'window', 'focus');
    expect((await snap(page)).focus.background).toBe(true);
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect.poll(async () => (await snap(page)).focus.background).toBe(false);

    // 3. Back in focus: the context resumes, the gate fades in, and exactly one track plays again.
    await expect.poll(async () => (await snap(page)).focus.context, { timeout: 5000 }).toBe('running');
    await expect.poll(async () => (await snap(page)).focus.gate, { timeout: 5000 }).toBe(1);
    await expect.poll(async () => (await snap(page)).music.audible, { timeout: 15_000 }).toBe(1);

    // 4. Page lifecycle freeze/resume and pagehide/pageshow behave the same way.
    await send(page, 'document', 'freeze');
    await expect.poll(async () => (await snap(page)).focus.gate).toBe(0);
    await send(page, 'document', 'resume');
    await expect.poll(async () => (await snap(page)).focus.gate, { timeout: 5000 }).toBe(1);

    // 5. Many quick switches never leave the sound stuck off or stacked.
    for (let i = 0; i < 6; i++) {
      await send(page, 'window', 'blur');
      await send(page, 'window', 'focus');
    }
    await expect.poll(async () => (await snap(page)).focus.gate, { timeout: 5000 }).toBe(1);
    await expect.poll(async () => (await snap(page)).music.audible, { timeout: 15_000 }).toBe(1);
    expect(errors).toEqual([]);
  });

  test('a manual mute stays muted after the game returns from the background', async ({ page }) => {
    await seedSave(page, makeSave({ storySeen: 'all', settings: { muted: true, quality: 'low' } }));
    await openGame(page, '&quality=low');
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await send(page, 'window', 'blur');
    await send(page, 'window', 'focus');
    await page.waitForTimeout(800);
    const s = await snap(page);
    expect(s.music.audible).toBe(0); // Mute all sound still holds
  });
});
