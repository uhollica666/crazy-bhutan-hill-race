import { expect, test } from '@playwright/test';
import { makeSave, openGame, openGarage, seedSave, waitForPhase } from './helpers';

const INTRO_DONE = 'cbhr.intro.launched';

test.describe('Pass 5.5: start-up sequence', () => {
  test('first launch plays the studio card then the title card; later launches go straight to the title', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // Record every class the intro goes through (the page may load slower than the first card lasts).
    await page.addInitScript(() => {
      const seen: string[] = [];
      (window as unknown as { __splashStages: string[] }).__splashStages = seen;
      new MutationObserver(() => {
        const el = document.getElementById('splash');
        if (!el) return;
        for (const c of ['stage-studio', 'stage-title']) if (el.classList.contains(c) && !seen.includes(c)) seen.push(c);
      }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
    });
    await page.goto('/?debug=1&cloud=off');
    const splash = page.locator('#splash');
    await expect(splash.locator('.splash-name')).toHaveText('Novarah Interactives');
    await expect.poll(() => page.evaluate(() => (window as unknown as { __splashStages: string[] }).__splashStages), { timeout: 15_000 }).toEqual(['stage-studio', 'stage-title']);
    await expect(splash).toHaveCount(0, { timeout: 15_000 }); // it ends by itself
    await expect(page.locator('#btn-start')).toBeVisible({ timeout: 60_000 });
    expect(await page.evaluate((k) => localStorage.getItem(k), INTRO_DONE)).toBe('1');

    // New session on the same device: the studio card is not repeated.
    await page.evaluate(() => sessionStorage.clear());
    await page.goto('/?debug=1&cloud=off&splashhold=1');
    await expect(page.locator('#splash')).toHaveClass(/stage-title/);
    await expect(page.locator('#splash')).not.toHaveClass(/stage-studio/);
    const game = page.locator('#splash .splash-game');
    await expect(game).toBeVisible();
    await expect.poll(async () => game.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(100);
    await page.screenshot({ path: 'screenshots/desktop-intro-title.png' });
    // The menu is not blocked: tapping skips.
    await page.locator('#splash').click({ position: { x: 20, y: 20 } });
    await expect(page.locator('#splash')).toHaveCount(0, { timeout: 5000 });
    expect(errors).toEqual([]);
  });

  test('reduced motion: still cards, no streaks, finishes on its own', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/?debug=1&cloud=off');
    const splash = page.locator('#splash');
    await expect(splash).toHaveClass(/still/);
    await expect(splash.locator('.splash-streaks')).toBeHidden();
    await expect(splash).toHaveCount(0, { timeout: 15_000 });
    await expect(page.locator('#btn-start')).toBeVisible({ timeout: 60_000 });
  });
});

test.describe('Pass 5.5: main menu', () => {
  test('uses the game logo as the hero, keeps the studio credit separate, and fits the screen', async ({ page }) => {
    const errors = await openGame(page);
    const logo = page.locator('.menu-main .game-logo');
    await expect(logo).toBeVisible();
    expect(await logo.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(100);
    await expect(page.locator('.menu-main .tagline')).toContainText('Deliver your guests');
    await expect(page.locator('#btn-credit img')).toHaveAttribute('src', /novarah-symbol/);
    const vh = page.viewportSize()!.height;
    for (const id of ['#btn-start', '#btn-menu-garage', '#btn-menu-settings', '#btn-menu-feedback']) {
      const b = await page.locator(id).boundingBox();
      expect(b, id).not.toBeNull();
      expect(b!.y + b!.height, `${id} inside the viewport`).toBeLessThanOrEqual(vh);
    }
    // The menu text is the new off-white on charcoal, not the old cream on brown.
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).toBe('rgb(11, 13, 19)');
    await page.screenshot({ path: 'screenshots/desktop-menu-brand.png' });
    expect(errors).toEqual([]);
  });
});

test.describe('Pass 5.5: story briefing and mission dispatch', () => {
  test('the briefing is a three-line card; the long story is one tap away; the mission opens with a dispatch card', async ({
    page,
  }) => {
    await seedSave(page, makeSave({ finished: [], storySeen: [] }));
    const errors = await openGame(page);
    await openGarage(page, 'pass-run');
    await page.locator('#btn-launch').click();
    const brief = page.locator('#screen-briefing');
    await expect(brief).toBeVisible();
    const cards = brief.locator('.brief-quick li');
    await expect(cards).toHaveCount(3);
    await expect(cards.nth(0)).toContainText('slept through');
    await expect(brief.locator('.brief-more')).not.toHaveAttribute('open', '');
    await expect(brief.locator('.brief-text')).toBeHidden();
    await brief.locator('.brief-more summary').click();
    await expect(brief.locator('.brief-text')).toBeVisible();
    await page.screenshot({ path: 'screenshots/desktop-briefing-brand.png' });
    await page.locator('#brief-go').click();
    // While the lights count down, the dispatch card gives the one-line job.
    await expect(page.locator('#dispatch')).toHaveClass(/show/);
    await expect(page.locator('#dispatch')).toContainText('The Sunrise Will Not Wait');
    await page.screenshot({ path: 'screenshots/desktop-dispatch.png' });
    await waitForPhase(page, 'running', 40_000);
    await expect(page.locator('#dispatch')).not.toHaveClass(/show/, { timeout: 10_000 });
    expect(errors).toEqual([]);
  });
});

test.describe('Pass 5.5: about and credits', () => {
  test('credits name the tools and AI assistants as text, never as logos', async ({ page }) => {
    await openGame(page);
    await page.locator('#btn-credit').click();
    const about = page.locator('#screen-about');
    await expect(about).toBeVisible();
    await expect(about.locator('.about-game-logo')).toBeVisible();
    await expect(about.locator('.about-logo')).toBeVisible();
    await expect(about).toContainText('Claude by Anthropic');
    await expect(about).toContainText('ChatGPT by OpenAI');
    await expect(about).toContainText('GitHub');
    await expect(about.locator('img')).toHaveCount(2); // the game and the studio: nothing else
    await page.screenshot({ path: 'screenshots/desktop-about-brand.png' });
  });
});
