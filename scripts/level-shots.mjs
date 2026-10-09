// Screenshots inside each lengthened mission: node scripts/level-shots.mjs <outDir> [levelId...]   (preview on :4173)
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] ?? 'screenshots/levels';
mkdirSync(out, { recursive: true });
const IDS = ['pass-run', 'thimphu-pickup', 'airport-dash', 'punakha-valley', 'dochula-storm', 'chelela-climb', 'trongsa-gorge', 'bumthang-night', 'remote-expedition', 'gmc-plains'];
const pick = process.argv.slice(3).length ? process.argv.slice(3) : IDS;
const save = JSON.stringify({
  version: 3,
  settings: { masterVolume: 0.8, musicVolume: 0, sfxVolume: 0.9, ambientVolume: 0.7, muted: true, quality: 'medium', touchControls: 'off', touchSensitivity: 1, reducedMotion: false, levelsView: 'list' },
  progress: { levels: Object.fromEntries(IDS.map((id) => [id, { completions: 1, medal: 'bronze', vehicles: {} }])) },
  selection: { levelId: null, vehicleId: null },
  history: [],
  wallet: { credits: 0 },
  garage: { owned: ['dzo-hatch', 'tourist-coaster', 'druk-ranger', 'dragon-cruiser'], upgrades: {} },
  story: { seen: IDS },
  stats: { missionsPlayed: 0, creditsEarned: 0 },
});
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.addInitScript((s) => { if (!sessionStorage.getItem('s')) { localStorage.setItem('cbhr.v3.save', s); sessionStorage.setItem('s', '1'); } }, save);
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto('http://localhost:4173/?debug=1&nosplash=1&cloud=off');
await page.waitForFunction(() => !!window.__cbhr, undefined, { timeout: 90000 });
await page.addStyleTag({ content: '#debug{display:none!important}' });
for (const id of pick) {
  await page.waitForSelector('#btn-start', { state: 'visible' });
  await page.evaluate(() => document.querySelector('#btn-start').click());
  await page.waitForSelector('#screen-levels:not([hidden])');
  await page.evaluate((l) => document.querySelector(`button[data-level="${l}"]`).click(), id);
  await page.waitForSelector('#screen-garage:not([hidden])', { timeout: 30000 });
  await page.evaluate(() => document.querySelector('#btn-launch').click());
  const brief = await page.$('#brief-go');
  if (brief && (await brief.isVisible())) await brief.click();
  await page.waitForFunction(() => window.__cbhr.state().phase === 'running', undefined, { timeout: 60000 });
  const c = await page.evaluate(() => window.__cbhr.course());
  const span = c.finishS - c.startS;
  for (const [name, f] of [['a', 0.2], ['b', 0.35], ['c', 0.62]]) {
    await page.evaluate((s) => window.__cbhr.warp(s), c.startS + span * f);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${out}/${id}-${name}.png` });
  }
  await page.evaluate(() => document.querySelector('#btn-pause').click());
  await page.evaluate(() => document.querySelector('#btn-pause-menu').click());
  console.log(id, 'length', Math.round(c.length));
}
await browser.close();
