// Result-screen capture (success via the autopilot, failure via a tiny time limit is not available: success only).
// node scripts/pass55-finish.mjs <outDir> [baseUrl] [levelId]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] ?? 'screenshots/pass55';
const base = process.argv[3] ?? 'http://localhost:4180';
const level = process.argv[4] ?? 'pass-run';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.addInitScript(() => {
  document.addEventListener('DOMContentLoaded', () => {
    const st = document.createElement('style');
    st.textContent = '#debug{display:none!important}';
    document.head.appendChild(st);
  });
});
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto(`${base}/?debug=1&nosplash=1&cloud=off&quality=low`);
await page.waitForFunction(() => !!window.__cbhr, undefined, { timeout: 90000 });
await page.waitForSelector('#btn-start', { state: 'visible' });
await page.evaluate(() => document.querySelector('#btn-start').click());
await page.waitForSelector('#screen-levels:not([hidden])');
await page.evaluate((l) => document.querySelector(`button[data-level="${l}"]`)?.click(), level);
await page.waitForSelector('#screen-garage:not([hidden])', { timeout: 30000 });
await page.evaluate(() => document.querySelector('#btn-launch').click());
await page.waitForSelector('#brief-go', { state: 'visible', timeout: 15000 });
await page.evaluate(() => document.querySelector('#brief-skip').click());
await page.waitForFunction(() => window.__cbhr.state().phase === 'running', undefined, { timeout: 60000 });
await page.evaluate(() => window.__cbhr.autodrive(true));
await page.waitForSelector('#screen-finish:not([hidden])', { timeout: 900000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/finish-${level}.png` });
await browser.close();
