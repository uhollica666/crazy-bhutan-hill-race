import { test, expect } from '@playwright/test';
import { makeSave, openGame, seedSave, state, startMission, storedSave } from './helpers';
const owned = ['dzo-hatch', 'tourist-coaster', 'druk-ranger', 'dragon-cruiser'];
test('Route 0 opens with its training objective and actual controls', async ({ page }) => {
  const errors = await openGame(page, '&quality=low');
  await page.locator('#btn-start').click();
  await page.locator('#tut-start').click();
  await expect.poll(async () => (await state(page)).levelId).toBe('drivers-academy');
  await expect(page.locator('#academy')).toBeVisible();
  await page.screenshot({ path: 'docs/release/route0.png' });
  expect(errors).toEqual([]);
});
test('four remastered garage vehicles load and cosmetics persist', async ({ page }) => {
  await seedSave(page, makeSave({ owned, credits: 10000, storySeen: 'all' }));
  const failed: string[] = [];
  page.on('response', r => { if(r.status() >= 400) failed.push(r.url()); });
  const errors = await openGame(page, '&quality=medium');
  await page.locator('#btn-menu-garage').click();
  await expect(page.locator('#screen-garage')).toBeVisible();
  for (let i = 0; i < 4; i++) {
    await expect.poll(async () => (await state(page)).detailedModel, { timeout: 60000 }).toBe(true);
    await page.locator('select[data-cosmetic="paint"]').selectOption('red');
    await page.locator('select[data-cosmetic="equipment"]').selectOption('carrier');
    await page.screenshot({ path: `docs/release/garage-${i}.png` });
    await page.locator('#btn-veh-next').click();
  }
  await expect(page.locator('select[data-cosmetic="paint"]')).toHaveValue('red');
  await expect(page.locator('select[data-cosmetic="equipment"]')).toHaveValue('carrier');
  expect(errors).toEqual([]); expect(failed).toEqual([]);
});
test('Low starts without remaster requests and keyboard driving still works', async ({ page }) => {
  await seedSave(page, makeSave({ storySeen: 'all' }));
  const requests: string[] = [];
  page.on('request', r => { if(r.url().includes('/remaster/')) requests.push(r.url()); });
  const errors = await openGame(page, '&quality=low');
  await startMission(page, 'pass-run');
  await page.keyboard.down('KeyW');
  await expect.poll(async () => (await state(page)).speed, { timeout: 60000 }).toBeGreaterThan(5);
  await page.keyboard.up('KeyW');
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await state(page)).flow).toBe('paused');
  expect((await storedSave(page)).settings).toBeTruthy();
  expect(requests).toEqual([]); expect(errors).toEqual([]);
});
test('download page has branding and only real artifact links', async ({ page }) => {
  await page.goto('/download/');
  await expect(page.getByRole('heading', { name: 'The mountains are calling.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Play online' }).first()).toHaveAttribute('href', '/');
  const broken = await page.locator('img').evaluateAll(imgs => imgs.some(img => !(img as HTMLImageElement).complete || !(img as HTMLImageElement).naturalWidth));
  expect(broken).toBe(false);
  await page.screenshot({ path: 'docs/release/download-page.png', fullPage: true });
});
