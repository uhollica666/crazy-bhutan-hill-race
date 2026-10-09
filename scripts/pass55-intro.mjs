// Captures both intro cards deterministically: node scripts/pass55-intro.mjs <outDir> [baseUrl]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const out = process.argv[2] ?? 'screenshots/pass55';
const base = process.argv[3] ?? 'http://localhost:4180';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const [name, vp] of [['desktop', { width: 1280, height: 720 }], ['phone', { width: 844, height: 390 }], ['portrait', { width: 390, height: 844 }]]) {
  const ctx = await browser.newContext({ viewport: vp });
  const page = await ctx.newPage();
  await page.goto(`${base}/?debug=1&cloud=off&splashhold=1`);
  await page.waitForSelector('#splash');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/${name}-intro-studio.png` });
  await page.evaluate(() => { const e = document.querySelector('#splash'); e.classList.remove('stage-studio'); e.classList.add('stage-title'); });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/${name}-intro-title-streak.png` });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/${name}-intro-title.png` });
  await ctx.close();
}
await browser.close();
