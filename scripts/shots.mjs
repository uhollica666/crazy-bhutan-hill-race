// Visual inspection helper: node scripts/shots.mjs [baseUrl] [outDir]
// Needs a server (bun run preview, or bun run dev). Saves menu, selection, garage and driving screenshots for all five levels.
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const base = process.argv[2] ?? 'http://localhost:4173';
const out = process.argv[3] ?? 'screenshots/stage3';
mkdirSync(out, { recursive: true });

const save = {
  version: 3,
  wallet: { credits: 10000 },
  garage: { owned: ['dzo-hatch', 'tourist-coaster', 'druk-ranger', 'dragon-cruiser'], upgrades: {} },
  story: { seen: ['pass-run', 'thimphu-pickup', 'airport-dash', 'chelela-climb', 'remote-expedition'] },
  settings: {
    masterVolume: 0.8,
    musicVolume: 0,
    sfxVolume: 0.9,
    muted: true,
    quality: 'high',
    touchControls: 'auto',
    touchSensitivity: 1,
  },
  progress: {
    levels: {
      'pass-run': {
        completions: 2,
        medal: 'silver',
        vehicles: {
          'druk-ranger': {
            bestTime: 91.3,
            bestScore: 70,
            bestComfort: null,
            medal: 'silver',
            completions: 2,
          },
        },
      },
      'chelela-climb': { completions: 1, medal: 'bronze', vehicles: {} },
      'airport-dash': {
        completions: 1,
        medal: 'bronze',
        vehicles: {
          'tourist-coaster': {
            bestTime: 118.2,
            bestScore: 55,
            bestComfort: 72,
            medal: 'bronze',
            completions: 1,
          },
        },
      },
    },
  },
  selection: { levelId: null, vehicleId: null },
  history: [],
};

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.addInitScript((s) => localStorage.setItem('cbhr.v3.save', JSON.stringify(s)), save);
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
page.on('console', (m) => m.type() === 'error' && console.log('CONSOLE', m.text()));

const ready = () => page.waitForFunction(() => !!window.__cbhr, undefined, { timeout: 90000 });
const st = () => page.evaluate(() => window.__cbhr.state());
await page.goto(`${base}/?debug=1&nosplash=1&cloud=off`);
await ready();
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/01-menu.png` });
await page.click('#btn-start');
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/02-levels.png` });

for (const [levelId, tag] of [
  ['pass-run', 'pass'],
  ['thimphu-pickup', 'thimphu'],
  ['airport-dash', 'airport'],
  ['chelela-climb', 'chelela'],
  ['remote-expedition', 'expedition'],
]) {
  if (levelId !== 'pass-run') {
    await page.goto(`${base}/?debug=1&nosplash=1&cloud=off`);
    await ready();
    await page.click('#btn-start');
  } else {
    // already on the level screen
  }
  await page.click(`button[data-level="${levelId}"]`);
  await page.waitForSelector('#screen-garage:not([hidden])');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/10-garage-${tag}-a.png` });
  await page.click('#btn-veh-next');
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/11-garage-${tag}-b.png` });
  await page.click('#btn-veh-prev');
  await page.waitForTimeout(500);
  if (levelId === 'chelela-climb') {
    // coach is not allowed here: make sure the recommended 4x4 is selected for the run
  }
  await page.click('#btn-launch');
  await page.waitForFunction(() => window.__cbhr.state().phase === 'running', undefined, { timeout: 30000 });
  await page.evaluate(() => window.__cbhr.autodrive(true));
  for (const [i, sec] of [
    [1, 6],
    [2, 10],
    [3, 14],
  ]) {
    await page.waitForTimeout(sec * 1000);
    await page.screenshot({ path: `${out}/20-${tag}-drive-${i}.png` });
  }
  console.log(tag, JSON.stringify(await st()));
}
await browser.close();
