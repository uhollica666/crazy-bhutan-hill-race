// UI screenshots: node scripts/ui-shots.mjs <outDir> [width height]   (needs a preview server on :4173)
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] ?? 'screenshots/ui';
const W = Number(process.argv[3] ?? 1280);
const H = Number(process.argv[4] ?? 720);
mkdirSync(out, { recursive: true });
const IDS = ['pass-run', 'thimphu-pickup', 'airport-dash', 'punakha-valley', 'dochula-storm', 'chelela-climb', 'trongsa-gorge', 'bumthang-night', 'remote-expedition', 'gmc-plains'];
const mk = (done) =>
  JSON.stringify({
    version: 3,
    settings: { masterVolume: 0.8, musicVolume: 0, sfxVolume: 0.9, muted: true, quality: 'medium', touchControls: 'auto', touchSensitivity: 1, reducedMotion: false },
    progress: { levels: Object.fromEntries(done.map((id, i) => [id, { completions: 1, medal: ['gold', 'silver', 'bronze'][i % 3], vehicles: { 'dzo-hatch': { bestTime: 90 + i * 7, bestScore: 60, bestComfort: null, medal: 'silver', completions: 1 } } }])) },
    selection: { levelId: null, vehicleId: null },
    history: [],
    wallet: { credits: 1450 },
    garage: { owned: ['dzo-hatch', 'tourist-coaster'], upgrades: {} },
    story: { seen: IDS },
    stats: { missionsPlayed: 12, creditsEarned: 6200, campaignCompleted: false },
  });
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
async function session(name, done, steps) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, hasTouch: W < 900 });
  await ctx.addInitScript((s) => { if (!sessionStorage.getItem('s')) { localStorage.setItem('cbhr.v3.save', s); sessionStorage.setItem('s', '1'); } }, mk(done));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await page.goto('http://localhost:4173/?debug=1&nosplash=1');
  await page.waitForFunction(() => !!window.__cbhr, undefined, { timeout: 90000 });
  await page.waitForSelector('#btn-start', { state: 'visible' });
  await page.waitForTimeout(1200);
  await steps(page, name);
  await ctx.close();
}
await session('mid', IDS.slice(0, 5), async (page) => {
  await page.screenshot({ path: `${out}/menu.png` });
  await page.evaluate(() => document.querySelector('#btn-start').click());
  await page.waitForSelector('#screen-levels:not([hidden])');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/levels.png` });
  await page.evaluate(() => document.querySelector('#screen-levels').scrollTo(0, 99999));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/levels-bottom.png` });
});
await session('all', IDS, async (page) => {
  await page.evaluate(() => window.__cbhr.showCampaign());
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/campaign.png` });
});
await browser.close();
console.log('done', out);
