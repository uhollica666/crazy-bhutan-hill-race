// Captures clean, UI-free screenshots of the real game for the launch site and the store/readme material.
//   node scripts/site-shots.mjs <outDir> [candidates|garage|all]
// Needs a running preview server on :4173 (`bun run build:e2e && bun run preview`). Everything is rendered by the game itself in Chrome;
// no third-party imagery is involved. The HUD, menus and debug overlay are hidden so only the 3D scene remains.
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const out = process.argv[2] ?? 'screenshots/site';
const mode = process.argv[3] ?? 'candidates';
const W = Number(process.env.W ?? 1600);
const H = Number(process.env.H ?? 900);
mkdirSync(out, { recursive: true });

const ALL_IDS = ['pass-run', 'thimphu-pickup', 'airport-dash', 'punakha-valley', 'dochula-storm', 'trongsa-gorge', 'chelela-climb', 'bumthang-night', 'remote-expedition', 'gmc-plains'];
const LEVELS = process.env.LEVELS
  ? process.env.LEVELS.split(',')
  : ['pass-run', 'thimphu-pickup', 'airport-dash', 'punakha-valley', 'dochula-storm', 'trongsa-gorge', 'chelela-climb', 'bumthang-night', 'remote-expedition', 'gmc-plains'];
const VEHICLES = ['dzo-hatch', 'tourist-coaster', 'druk-ranger', 'dragon-cruiser'];
const FRACTIONS = (process.env.FRACTIONS ?? '0.2,0.5').split(',').map(Number);

const save = JSON.stringify({
  version: 3,
  settings: { masterVolume: 0.8, musicVolume: 0, sfxVolume: 0.9, muted: true, quality: process.env.QUALITY ?? 'high', touchControls: 'off', touchSensitivity: 1, reducedMotion: false },
  progress: { levels: Object.fromEntries(ALL_IDS.map((id) => [id, { completions: 1, medal: 'gold', vehicles: {} }])) },
  selection: { levelId: null, vehicleId: null },
  history: [],
  wallet: { credits: 9000 },
  garage: { owned: VEHICLES, upgrades: {} },
  story: { seen: ALL_IDS },
  stats: { missionsPlayed: 0, creditsEarned: 0 },
});

const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await ctx.addInitScript((s) => {
  if (!sessionStorage.getItem('__seeded')) {
    localStorage.setItem('cbhr.v3.save', s);
    sessionStorage.setItem('__seeded', '1');
  }
}, save);
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto('http://localhost:4173/?debug=1&nosplash=1&cloud=off&noadapt=1');
await page.waitForFunction(() => !!window.__cbhr, undefined, { timeout: 120000 });
await page.waitForSelector('#btn-start', { state: 'visible' });
await page.keyboard.press('Backquote'); // debug overlay off
const shot = (name) => page.screenshot({ path: `${out}/${name}.jpg`, type: 'jpeg', quality: 86 });
const state = () => page.evaluate(() => window.__cbhr.state());
const hideUI = () => page.evaluate(() => { if (!document.getElementById('hide-ui')) { const st = document.createElement('style'); st.id = 'hide-ui'; st.textContent = '#ui, .touch-controls, #touch, .hud, #hud, #rearview { visibility: hidden !important; }'; document.head.append(st); } });
const showUI = () => page.evaluate(() => document.getElementById('hide-ui')?.remove());

async function toGarage(level) {
  await page.evaluate(() => document.querySelector('#btn-start')?.click());
  const skip = page.getByRole('button', { name: 'Skip for now' });
  if (await skip.isVisible({ timeout: 1500 }).catch(() => false)) await skip.click();
  await page.waitForSelector('#screen-levels:not([hidden])');
  await page.evaluate((id) => document.querySelector(`button[data-level="${id}"]`)?.click(), level);
  await page.waitForSelector('#screen-garage:not([hidden])', { timeout: 90000 });
  await page.waitForTimeout(800);
}

if (mode === 'garage' || mode === 'all') {
  await toGarage(LEVELS[0]);
  await hideUI();
  // The garage hides its panel with the UI, leaving the vehicle in the showcase composition; bring the UI back only for navigation.
  for (const v of VEHICLES) {
    await page.addStyleTag({ content: '#ui { visibility: visible !important; } #screen-garage { visibility: hidden !important; }' });
    for (let i = 0; i < 6; i++) {
      if ((await state()).vehicleId === v) break;
      await page.evaluate(() => document.querySelector('#btn-veh-next')?.click());
      await page.waitForTimeout(400);
    }
    await page.waitForTimeout(1600);
    await shot(`garage-${v}`);
  }
  await page.evaluate(() => document.querySelector('#btn-garage-back')?.click());
  await page.evaluate(() => document.querySelector('#btn-levels-back')?.click());
}

if (mode === 'candidates' || mode === 'all') {
  for (const level of LEVELS) {
    await page.waitForSelector('#btn-start', { state: 'visible' });
    await toGarage(level);
    const nCond = await page.evaluate(() => document.querySelector('#sel-cond')?.options.length ?? 1);
    for (let c = 0; c < nCond; c++) {
      if (c > 0) {
        await page.evaluate((i) => {
          const sel = document.querySelector('#sel-cond');
          sel.value = String(i);
          sel.dispatchEvent(new Event('change'));
        }, c);
        await page.waitForTimeout(500);
      }
      await page.evaluate(() => document.querySelector('#btn-launch')?.click());
      await page.waitForFunction(() => window.__cbhr.state().phase === 'running', undefined, { timeout: 120000 });
      await hideUI();
      const info = await page.evaluate(() => window.__cbhr.course());
      const span = info.finishS - info.startS;
      for (const f of FRACTIONS) {
        await page.evaluate((s) => window.__cbhr.warp(s), info.startS + span * f);
        await page.waitForTimeout(1600);
        const s = await state();
        await shot(`${level}__${s.vehicleId}__${s.weather}-${s.time_of_day}__${Math.round(f * 100)}`);
      }
      await showUI();
      await page.keyboard.press('Escape');
      await page.evaluate(() => document.querySelector('#btn-pause-garage')?.click());
      await page.waitForSelector('#screen-garage:not([hidden])', { state: 'attached' });
      await page.waitForTimeout(400);
    }
    await page.evaluate(() => document.querySelector('#btn-garage-back')?.click());
    await page.evaluate(() => document.querySelector('#btn-levels-back')?.click());
    console.log('done', level);
  }
}
await browser.close();
console.log('finished', out);
