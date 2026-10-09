// Pass 5.5 screenshots: node scripts/pass55-shots.mjs <outDir> [baseUrl] [desktop|mobile|all]
// Startup sequence (first launch), main menu, mission list, briefing, countdown dispatch, about, mobile.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] ?? 'screenshots/pass55';
const base = process.argv[3] ?? 'http://localhost:4180';
const which = process.argv[4] ?? 'all';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

async function run(name, ctxOpts, mobile) {
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  await ctx.addInitScript(() => { document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = '#debug{display:none!important}'; document.head.appendChild(st); }); });
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  // Startup sequence on a clean profile.
  await page.goto(`${base}/?debug=1&cloud=off`);
  let n = 0;
  for (const ms of [400, 1300, 1000, 900, 1100]) {
    await page.waitForTimeout(ms);
    await page.screenshot({ path: `${out}/${name}-intro-${++n}.png` });
  }
  await page.waitForFunction(() => !!window.__cbhr, undefined, { timeout: 90000 });
  await page.waitForSelector('#btn-start', { state: 'visible', timeout: 20000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/${name}-menu.png` });
  await page.evaluate(() => document.querySelector('#btn-start').click());
  await page.waitForSelector('#screen-levels:not([hidden])');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/${name}-levels-map.png` });
  await page.evaluate(() => document.querySelector('button[data-level="pass-run"]')?.click());
  await page.waitForSelector('#screen-garage:not([hidden])', { timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/${name}-garage.png` });
  await page.evaluate(() => document.querySelector('#btn-launch').click());
  await page.waitForSelector('#brief-go', { state: 'visible', timeout: 15000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/${name}-briefing.png` });
  await page.evaluate(() => document.querySelector('.brief-more summary')?.click());
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/${name}-briefing-open.png` });
  await page.evaluate(() => document.querySelector('#brief-go').click());
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/${name}-countdown.png` });
  await page.waitForFunction(() => window.__cbhr.state().phase === 'running', undefined, { timeout: 60000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/${name}-go.png` });
  await page.evaluate(() => document.querySelector('#btn-pause')?.click());
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/${name}-pause.png` });
  await page.evaluate(() => document.querySelector('#btn-pause-menu')?.click());
  await page.waitForSelector('#btn-menu-garage', { state: 'visible', timeout: 20000 });
  await page.evaluate(() => document.querySelector('#btn-credit').click());
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${out}/${name}-about.png` });
  await ctx.close();
}

if (which === 'all' || which === 'desktop') await run('desktop', { viewport: { width: 1280, height: 720 } }, false);
if (which === 'all' || which === 'mobile')
  await run('mobile', { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }, true);
if (which === 'all' || which === 'portrait')
  await run('portrait', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }, true);
await browser.close();
