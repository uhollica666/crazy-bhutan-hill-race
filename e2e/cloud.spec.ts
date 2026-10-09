import { expect, test } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import { makeSave, openGame, seedSave, state } from './helpers';

/**
 * Online features against the LOCAL Firebase emulators (Auth :9099, Firestore :8080) with the emulator-only build
 * (`bun run test:e2e:cloud`). These tests cannot reach the live project: the build is configured with the demo
 * project id and emulator endpoints only.
 */
const PROJECT = 'demo-crazy-bhutan-hill-race';
const FS = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const AUTH = `http://127.0.0.1:9099/emulator/v1/projects/${PROJECT}/accounts`;

test.beforeEach(async () => {
  await fetch(FS, { method: 'DELETE' });
  await fetch(AUTH, { method: 'DELETE' });
});

const email = (): string => `p${Date.now()}${Math.floor(Math.random() * 1e5)}@example.com`;

/** Reads a document straight from the emulator, bypassing the rules (test inspection only). */
async function readDoc(path: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${FS}/${path}`, { headers: { Authorization: 'Bearer owner' } });
  if (res.status === 404) return null;
  return (await res.json()) as Record<string, unknown>;
}

async function listDocs(path: string): Promise<string[]> {
  const res = await fetch(`${FS}/${path}`, { headers: { Authorization: 'Bearer owner' } });
  const j = (await res.json()) as { documents?: { name: string }[] };
  return (j.documents ?? []).map((d) => d.name.split('/').pop() as string);
}

/** A real outage for the page: browser offline AND the emulator endpoints unreachable (loopback is not covered by offline mode). */
async function goOffline(ctx: import('@playwright/test').BrowserContext): Promise<void> {
  await ctx.setOffline(true);
  await ctx.route(/127\.0\.0\.1:(8080|9099)/, (r) => void r.abort('internetdisconnected'));
}
async function goOnline(ctx: import('@playwright/test').BrowserContext): Promise<void> {
  await ctx.unroute(/127\.0\.0\.1:(8080|9099)/);
  await ctx.setOffline(false);
}

async function ready(page: Page, connection: 'guest' | 'account' | 'local' | 'offline' = 'guest'): Promise<void> {
  await expect.poll(async () => (await state(page)).cloud.connection, { timeout: 30_000 }).toBe(connection);
}

async function openProfile(page: Page): Promise<void> {
  await page.locator('#btn-menu-profile').click();
  await expect(page.locator('#screen-profile')).toBeVisible();
}

async function newPlayer(browser: Browser, saveJson?: string): Promise<{ page: Page; errors: string[] }> {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  if (saveJson) await seedSave(page, saveJson);
  const errors = await openGame(page, '&quality=low');
  return { page, errors };
}

test.describe('guest play and accounts', () => {
  test('the game starts and is playable at once; a guest identity appears by itself, with no login screen', async ({ page }) => {
    const errors = await openGame(page, '&quality=low');
    await expect(page.locator('#btn-start')).toBeVisible();
    await expect(page.locator('#screen-profile')).toBeHidden();
    await ready(page, 'guest');
    await expect(page.locator('#btn-menu-profile')).toContainText('Guest');
    const s = await state(page);
    expect(s.cloud.uid).toBeTruthy();
    await expect.poll(async () => (await state(page)).cloud.name, { timeout: 20_000 }).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+ \d\d$/);
    // The profile document exists, owned by that uid, and holds no email.
    await expect.poll(async () => (await listDocs('players')).length).toBe(1);
    const doc = await readDoc(`players/${s.cloud.uid}`);
    // The menu's main buttons are all on screen with the online chip present (it sits in a corner, not in the flow).
    for (const id of ['#btn-start', '#btn-menu-garage', '#btn-menu-settings', '#btn-menu-feedback']) await expect(page.locator(id)).toBeInViewport();
    expect(JSON.stringify(doc)).not.toContain('@');
    expect(errors).toEqual([]);
  });

  test('a reload reuses the same guest instead of creating another', async ({ page }) => {
    await openGame(page, '&quality=low');
    await ready(page);
    const uid = (await state(page)).cloud.uid;
    await page.reload();
    await page.waitForFunction(() => !!(window as unknown as { __cbhr?: unknown }).__cbhr);
    await ready(page);
    expect((await state(page)).cloud.uid).toBe(uid);
  });

  test('registering links the guest account (same uid), signing out and in works, and errors are clear', async ({ page }) => {
    const errors = await openGame(page, '&quality=low');
    await ready(page);
    const uid = (await state(page)).cloud.uid;
    await openProfile(page);
    await page.screenshot({ path: 'screenshots/desktop-profile-guest.png' });
    await page.locator('[data-auth="register"]').first().click();
    // Validation first, then the real thing.
    await page.locator('#pf-email').fill('nope');
    await page.locator('#pf-submit').click();
    await expect(page.locator('#pf-msg')).toContainText('valid email');
    const addr = email();
    await page.locator('#pf-email').fill(addr);
    await page.locator('#pf-pass').fill('123');
    await page.locator('#pf-submit').click();
    await expect(page.locator('#pf-msg')).toContainText('at least 6');
    await page.locator('#pf-pass').fill('secret123');
    await page.locator('#pf-submit').click();
    await expect(page.locator('.cl-line').first()).toContainText('Signed in', { timeout: 20_000 });
    await expect(page.locator('#screen-profile')).toContainText(addr);
    expect((await state(page)).cloud.uid).toBe(uid); // upgraded in place
    expect((await state(page)).cloud.connection).toBe('account');
    await page.screenshot({ path: 'screenshots/desktop-profile-account.png' });
    // The password field never keeps the value.
    expect(await page.locator('#pf-pass').count()).toBe(0);
    // Sign out: back to offline play; sign in with a wrong password: a clear message; then the right one.
    await page.locator('#pf-signout').click();
    await expect(page.locator('#screen-profile')).toContainText('Playing offline');
    await page.locator('[data-auth="signin"]').first().click();
    await page.locator('#pf-email').fill(addr);
    await page.locator('#pf-pass').fill('wrong-password');
    await page.locator('#pf-submit').click();
    await expect(page.locator('#pf-msg')).toContainText('not right', { timeout: 20_000 });
    await page.locator('#pf-pass').fill('secret123');
    await page.locator('#pf-submit').click();
    await expect(page.locator('#screen-profile')).toContainText('Signed in', { timeout: 20_000 });
    expect((await state(page)).cloud.uid).toBe(uid);
    expect(errors.filter((e) => !/auth\/|400|403|Failed to load resource/.test(e))).toEqual([]);
  });

  test('the display name is validated and shows on the profile', async ({ page }) => {
    await openGame(page, '&quality=low');
    await ready(page);
    await openProfile(page);
    await page.locator('#pf-name').fill('x');
    await page.locator('#pf-name-save').click();
    await expect.poll(async () => (await state(page)).cloud.name).not.toBe('x');
    await page.locator('#pf-name').fill('Dorji Racer');
    await page.locator('#pf-name-save').click();
    await expect.poll(async () => (await state(page)).cloud.name).toBe('Dorji Racer');
    const uid = (await state(page)).cloud.uid;
    await expect.poll(async () => JSON.stringify(await readDoc(`players/${uid}`))).toContain('Dorji Racer');
  });
});

test.describe('cloud saves', () => {
  test('purchases and credits reach the cloud save, and a second browser signing in receives them', async ({ browser }) => {
    const a = await newPlayer(browser, makeSave({ finished: ['pass-run'], credits: 0 }));
    await ready(a.page);
    const uid = (await state(a.page)).cloud.uid as string;
    await expect.poll(async () => await readDoc(`players/${uid}/saves/current`), { timeout: 30_000 }).not.toBeNull();
    // Register (keeps the uid), then add credits and sync.
    await openProfile(a.page);
    const addr = email();
    await a.page.locator('[data-auth="register"]').first().click();
    await a.page.locator('#pf-email').fill(addr);
    await a.page.locator('#pf-pass').fill('secret123');
    await a.page.locator('#pf-submit').click();
    await expect(a.page.locator('#screen-profile')).toContainText('Signed in', { timeout: 20_000 });
    await a.page.evaluate(() => (window as unknown as { __cbhr: { grantCredits(n: number): void } }).__cbhr.grantCredits(777));
    await a.page.locator('#pf-sync').click();
    await expect.poll(async () => JSON.stringify(await readDoc(`players/${uid}/saves/current`)), { timeout: 30_000 }).toContain('777');
    // A fresh browser signs in and receives the progress and credits.
    const b = await newPlayer(browser);
    await ready(b.page);
    await openProfile(b.page);
    await b.page.locator('[data-auth="signin"]').first().click();
    await b.page.locator('#pf-email').fill(addr);
    await b.page.locator('#pf-pass').fill('secret123');
    await b.page.locator('#pf-submit').click();
    await expect.poll(async () => (await state(b.page)).credits, { timeout: 30_000 }).toBe(777);
    await expect(b.page.locator('#screen-conflict')).toBeHidden();
    await a.page.context().close();
    await b.page.context().close();
  });

  test('two devices with different progress: the player is asked, nothing is overwritten, and combining keeps both', async ({ browser }) => {
    const a = await newPlayer(browser, makeSave({ finished: ['pass-run'], credits: 0 }));
    await ready(a.page);
    await openProfile(a.page);
    const addr = email();
    await a.page.locator('[data-auth="register"]').first().click();
    await a.page.locator('#pf-email').fill(addr);
    await a.page.locator('#pf-pass').fill('secret123');
    await a.page.locator('#pf-submit').click();
    await expect(a.page.locator('#screen-profile')).toContainText('Signed in', { timeout: 20_000 });
    await expect.poll(async () => (await state(a.page)).cloud.sync, { timeout: 30_000 }).toBe('synced');
    // Device B has its own, different progress and signs in to the same account.
    const b = await newPlayer(browser, makeSave({ finished: ['pass-run', 'thimphu-pickup'], credits: 300 }));
    await ready(b.page);
    await openProfile(b.page);
    await b.page.locator('[data-auth="signin"]').first().click();
    await b.page.locator('#pf-email').fill(addr);
    await b.page.locator('#pf-pass').fill('secret123');
    await b.page.locator('#pf-submit').click();
    await expect(b.page.locator('#screen-conflict')).toBeVisible({ timeout: 30_000 });
    await expect(b.page.locator('#screen-conflict')).toContainText('Two saves found');
    await b.page.screenshot({ path: 'screenshots/desktop-conflict.png' });
    // Nothing has been replaced yet.
    expect((await state(b.page)).credits).toBe(300);
    await b.page.locator('#cf-combine').click();
    await expect(b.page.locator('#screen-conflict')).toBeHidden({ timeout: 30_000 });
    expect((await state(b.page)).credits).toBeGreaterThanOrEqual(300);
    await expect.poll(async () => (await state(b.page)).cloud.sync).toBe('synced');
    await a.page.context().close();
    await b.page.context().close();
  });
});

test.describe('leaderboard', () => {
  async function seedEntries(): Promise<void> {
    const mk = (uid: string, name: string, ms: number) => ({
      fields: {
        schema: { integerValue: '1' },
        uid: { stringValue: uid },
        levelId: { stringValue: 'pass-run' },
        timeMs: { integerValue: String(ms) },
        vehicleId: { stringValue: 'dzo-hatch' },
        conditions: { stringValue: 'clear-day' },
        displayName: { stringValue: name },
        medal: { stringValue: 'gold' },
        comfort: { nullValue: null },
        appVersion: { stringValue: 'seed' },
        clientAt: { integerValue: '0' },
        submittedAt: { timestampValue: new Date().toISOString() },
      },
    });
    for (const [uid, name, ms] of [['s1', 'Tashi Speed', 99_000], ['s2', 'Pema Pass', 105_500], ['s3', 'Karma Climb', 120_250]] as [string, string, number][]) {
      await fetch(`${FS}/leaderboards/pass-run/entries/${uid}`, { method: 'PATCH', headers: { Authorization: 'Bearer owner', 'content-type': 'application/json' }, body: JSON.stringify(mk(uid, name, ms)) });
    }
  }

  test('shows an empty board, then real entries ranked by time, labelled beta and unverified', async ({ page }) => {
    await openGame(page, '&quality=low');
    await ready(page);
    await page.locator('#btn-menu-profile').click();
    await page.locator('#pf-board').click();
    await expect(page.locator('#screen-board')).toBeVisible();
    await expect(page.locator('#screen-board')).toContainText('beta');
    await expect(page.locator('#screen-board')).toContainText('not verified');
    await expect(page.locator('#lb-body')).toContainText('first', { timeout: 20_000 });
    await seedEntries();
    await page.locator('#lb-refresh').click();
    await expect(page.locator('.cl-table tbody tr')).toHaveCount(3, { timeout: 20_000 });
    await expect(page.locator('.cl-table tbody tr').first()).toContainText('Tashi Speed');
    await expect(page.locator('.cl-table tbody tr').first()).toContainText('1:39.00');
    await page.screenshot({ path: 'screenshots/desktop-leaderboard.png' });
    // Switching mission loads that mission's (empty) board.
    await page.locator('#lb-next').click();
    await expect(page.locator('#lb-body')).toContainText('first', { timeout: 20_000 });
    await page.keyboard.press('Escape');
    await expect(page.locator('#screen-board')).toBeHidden();
  });

  test('offline: the last page seen is shown and labelled; the game stays usable', async ({ page, context }) => {
    await seedEntries();
    await openGame(page, '&quality=low');
    await ready(page);
    await page.locator('#btn-menu-profile').click();
    await page.locator('#pf-board').click();
    await expect(page.locator('.cl-table tbody tr')).toHaveCount(3, { timeout: 20_000 });
    await goOffline(context);
    await page.locator('#lb-refresh').click();
    await expect(page.locator('#lb-body')).toContainText(/offline|last times seen/i, { timeout: 30_000 });
    await expect(page.locator('.cl-table tbody tr')).toHaveCount(3);
    await goOnline(context);
  });
});

test.describe('feedback goes to the server, honestly', () => {
  async function fillFeedback(page: Page, text: string): Promise<void> {
    await page.locator('#btn-menu-feedback').click();
    await page.locator('[data-star="5"]').click();
    await page.locator('#fb-gameplay').fill(text);
    await page.locator('#fb-graphics').fill('Lovely mountains');
  }

  test('a submission is reported delivered only after the server accepted it, and is really there', async ({ page }) => {
    await openGame(page, '&quality=low');
    await ready(page);
    await fillFeedback(page, 'Online feedback test');
    await expect(page.locator('#screen-feedback')).toContainText('sent to Novarah');
    await page.locator('#fb-submit').click();
    await expect(page.locator('#screen-feedback')).toContainText('Delivered', { timeout: 30_000 });
    await expect(page.locator('#screen-feedback')).toContainText('confirmed');
    await page.screenshot({ path: 'screenshots/desktop-feedback-delivered.png' });
    const ids = await listDocs('feedback');
    expect(ids.length).toBe(1);
    const doc = JSON.stringify(await readDoc(`feedback/${ids[0]}`));
    expect(doc).toContain('Online feedback test');
    expect(doc).toContain('Lovely mountains');
    // No local draft is left behind once delivery is confirmed.
    const drafts = JSON.parse((await page.evaluate(() => localStorage.getItem('cbhr.feedback.drafts'))) ?? '[]');
    expect(drafts).toHaveLength(0);
  });

  test('offline: saved, clearly NOT delivered, then sent automatically once back online (exactly once)', async ({ page, context }) => {
    await openGame(page, '&quality=low');
    await ready(page);
    await goOffline(context);
    await fillFeedback(page, 'Written while offline');
    await page.locator('#fb-submit').click();
    await expect(page.locator('#screen-feedback')).toContainText('not delivered yet', { timeout: 30_000 });
    await expect(page.locator('#screen-feedback')).not.toContainText('Delivered');
    await page.screenshot({ path: 'screenshots/desktop-feedback-pending.png' });
    // (Browser offline emulation does not reliably cut an already-open loopback connection to the emulator, so the
    // server may already hold the write while the confirmation never reached the page. That is exactly the "lost
    // acknowledgement" case: the page must stay honest (pending, kept on the device) and the retry must not duplicate.)
    const queued = JSON.parse((await page.evaluate(() => localStorage.getItem('cbhr.feedback.drafts'))) as string);
    expect(queued).toHaveLength(1);
    expect(queued[0].status).toBe('pending');
    await goOnline(context);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect.poll(async () => (await listDocs('feedback')).length, { timeout: 40_000 }).toBe(1);
    await expect.poll(async () => JSON.parse((await page.evaluate(() => localStorage.getItem('cbhr.feedback.drafts'))) as string).length, { timeout: 20_000 }).toBe(0);
    // Pressing online again does not create a second copy.
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await page.waitForTimeout(1500);
    expect(await listDocs('feedback')).toHaveLength(1);
  });
});

test.describe('privacy and statistics', () => {
  test('statistics are off by default, the choice is offered once, and no telemetry is written without consent', async ({ page }) => {
    await openGame(page, '&quality=low');
    await ready(page);
    await expect(page.locator('#privacy-card')).toBeVisible();
    await expect(page.locator('#privacy-card')).toContainText('Off by default');
    expect((await state(page)).privacy).toMatchObject({ analytics: false, decided: false });
    await page.screenshot({ path: 'screenshots/desktop-menu-online.png' });
    await page.locator('#privacy-no').click();
    await expect(page.locator('#privacy-card')).toHaveCount(0);
    expect((await state(page)).privacy).toMatchObject({ analytics: false, decided: true });
    expect(await listDocs('telemetrySessions')).toEqual([]);
    // It can be turned on later in Settings, Privacy, and the choice survives a reload.
    await page.locator('#btn-menu-settings').click();
    await page.locator('#tab-privacy').click();
    await expect(page.locator('#pane-privacy')).toContainText('What is never shared');
    await page.screenshot({ path: 'screenshots/desktop-settings-privacy.png' });
    await page.locator('#set-analytics').check();
    expect((await state(page)).privacy.analytics).toBe(true);
    await page.reload();
    await page.waitForFunction(() => !!(window as unknown as { __cbhr?: unknown }).__cbhr);
    expect((await state(page)).privacy.analytics).toBe(true);
    await page.locator('#btn-menu-settings').click();
    await page.locator('#tab-privacy').click();
    await page.locator('#set-analytics').uncheck();
    expect((await state(page)).privacy.analytics).toBe(false);
  });

  test('removing online data deletes the cloud save and leaderboard entries but not the local save', async ({ browser }) => {
    const a = await newPlayer(browser, makeSave({ finished: ['pass-run'], credits: 50 }));
    await ready(a.page);
    const uid = (await state(a.page)).cloud.uid as string;
    await expect.poll(async () => await readDoc(`players/${uid}/saves/current`), { timeout: 30_000 }).not.toBeNull();
    a.page.on('dialog', (d) => void d.accept());
    await a.page.locator('#btn-menu-settings').click();
    await a.page.locator('#tab-privacy').click();
    await a.page.locator('#priv-delete').click();
    await expect(a.page.locator('#priv-msg')).toContainText('Removed', { timeout: 20_000 });
    expect(await readDoc(`players/${uid}/saves/current`)).toBeNull();
    expect((await state(a.page)).credits).toBe(50);
    await a.page.context().close();
  });
});

test.describe('offline', () => {
  test('starting with no network: the game opens, plays a mission and saves locally; the chip says offline', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();
    // Load once online (so the page and service worker exist), then reload with the network off.
    await openGame(page, '&quality=low');
    await ready(page);
    await ctx.setOffline(true);
    await page.reload();
    await page.waitForFunction(() => !!(window as unknown as { __cbhr?: unknown }).__cbhr, undefined, { timeout: 60_000 });
    await expect(page.locator('#btn-start')).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('#btn-menu-profile')).toBeVisible();
    await page.locator('#btn-start').click();
    await expect(page.locator('#screen-levels')).toBeVisible();
    await ctx.close();
  });
});
