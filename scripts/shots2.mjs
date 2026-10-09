// Focused visual checks: coach on the airport mission (comfort HUD) and tyre effects on Pass Run.
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const base = process.argv[2] ?? 'http://localhost:4173';
const out = process.argv[3] ?? 'screenshots/stage2';
mkdirSync(out, { recursive: true });
const save = {
  version: 2,
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
        completions: 1,
        medal: 'silver',
        vehicles: {
          'druk-ranger': {
            bestTime: 91.3,
            bestScore: 70,
            bestComfort: null,
            medal: 'silver',
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
await ctx.addInitScript((s) => localStorage.setItem('cbhr.v2.save', JSON.stringify(s)), save);
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
const ready = () => page.waitForFunction(() => !!window.__cbhr, undefined, { timeout: 90000 });

await page.goto(`${base}/?debug=1`);
await ready();
await page.click('#btn-start');
await page.click('button[data-level="airport-dash"]');
await page.waitForSelector('#screen-garage:not([hidden])');
await page.click('#btn-veh-next');
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/30-garage-coach-airport.png` });
await page.click('#btn-launch');
await page.waitForFunction(() => window.__cbhr.state().phase === 'running', undefined, { timeout: 30000 });
await page.evaluate(() => window.__cbhr.autodrive(true));
await page.waitForTimeout(16000);
await page.screenshot({ path: `${out}/31-coach-airport-drive.png` });
console.log('coach', JSON.stringify(await page.evaluate(() => window.__cbhr.state())));

// Tyre effects: hard cornering on Pass Run with the keyboard.
await page.reload();
await ready();
await page.click('#btn-start');
await page.click('button[data-level="pass-run"]');
await page.waitForSelector('#screen-garage:not([hidden])');
await page.click('#btn-launch');
await page.waitForFunction(() => window.__cbhr.state().phase === 'running', undefined, { timeout: 30000 });
await page.keyboard.down('KeyW');
await page.waitForTimeout(4500);
await page.keyboard.down('KeyD');
await page.waitForTimeout(700);
await page.screenshot({ path: `${out}/32-effects-corner.png` });
await page.keyboard.up('KeyD');
await page.keyboard.up('KeyW');
await page.keyboard.down('KeyS');
await page.waitForTimeout(900);
await page.screenshot({ path: `${out}/33-effects-brake.png` });
await page.keyboard.up('KeyS');
await browser.close();
