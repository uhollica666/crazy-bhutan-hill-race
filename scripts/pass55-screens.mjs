// Secondary screens for the brand audit: settings tabs, feedback, mission list, upgrades, cloud/profile modals.
// node scripts/pass55-screens.mjs <outDir> [baseUrl] [width] [height]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] ?? 'screenshots/pass55-screens';
const base = process.argv[3] ?? 'http://localhost:4180';
const W = Number(process.argv[4] ?? 1280);
const H = Number(process.argv[5] ?? 720);
mkdirSync(out, { recursive: true });
const IDS = ['pass-run', 'thimphu-pickup', 'airport-dash', 'punakha-valley'];
const save = JSON.stringify({
  version: 3,
  settings: { masterVolume: 0.8, musicVolume: 0, sfxVolume: 0.9, ambientVolume: 0.7, muted: true, quality: 'low', touchControls: 'off', touchSensitivity: 1, reducedMotion: false, levelsView: 'list' },
  progress: { levels: Object.fromEntries(IDS.map((id, i) => [id, { completions: 1, medal: ['gold', 'silver', 'bronze', 'none'][i], bestTime: 150000 + i * 9000, vehicles: {} }])) },
  selection: { levelId: null, vehicleId: null },
  history: [],
  wallet: { credits: 2400 },
  garage: { owned: ['dzo-hatch', 'tourist-coaster', 'druk-ranger', 'dragon-cruiser'], upgrades: {} },
  story: { seen: IDS },
  stats: { missionsPlayed: 4, creditsEarned: 2400 },
});
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H } });
await ctx.addInitScript((s) => {
  if (!sessionStorage.getItem('s')) {
    localStorage.setItem('cbhr.v3.save', s);
    sessionStorage.setItem('s', '1');
  }
  document.addEventListener('DOMContentLoaded', () => {
    const st = document.createElement('style');
    st.textContent = '#debug{display:none!important}';
    document.head.appendChild(st);
  });
}, save);
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
const shot = async (name) => {
  await page.waitForTimeout(1600);
  await page.screenshot({ path: `${out}/${name}.png` });
};
const click = (sel) => page.evaluate((s) => document.querySelector(s)?.click(), sel);
await page.goto(`${base}/?debug=1&nosplash=1&cloud=off&quality=low`);
await page.waitForFunction(() => !!window.__cbhr, undefined, { timeout: 90000 });
await page.waitForSelector('#btn-start', { state: 'visible' });
await shot('menu-progress');

await click('#btn-menu-settings');
await page.waitForSelector('#pane-audio');
await shot('settings-audio');
for (const t of ['graphics', 'controls', 'gameplay', 'access', 'privacy']) {
  await click(`#tab-${t}`);
  await shot(`settings-${t}`);
}
await click('#btn-settings-back');
await page.waitForTimeout(600);

await click('#btn-menu-feedback');
await page.waitForSelector('#screen-feedback:not([hidden])');
await shot('feedback');
await click('#fb-close');
await page.waitForTimeout(500);

await click('#menu-cloud button');
await shot('cloud-chip-open');
await page.keyboard.press('Escape');
await click('.modal:not([hidden]) [data-back], .modal:not([hidden]) .icon-btn');
await page.waitForTimeout(400);

await click('#btn-start');
await page.waitForSelector('#screen-levels:not([hidden])');
await shot('levels-list');
await click('#btn-levels-view');
await shot('levels-map-progress');
await click('#btn-levels-view');
await click('button[data-level="airport-dash"]');
await page.waitForSelector('#screen-garage:not([hidden])', { timeout: 30000 });
await shot('garage-airport');
await click('#btn-veh-next');
await shot('garage-vehicle-2');
await page.evaluate(() => document.querySelector('.upg-toggle, #btn-upgrades, details.upgrades summary, #upg-toggle')?.click());
await shot('garage-upgrades');
await browser.close();
