// Visual regression capture: node scripts/stage4-shots.mjs <outDir> [quality]
// Needs a running preview server on :4173 (bun run build && bun run preview). Writes PNGs into <outDir>.
import { chromium } from '@playwright/test';
import { mkdirSync,writeFileSync } from 'node:fs';

const out = process.argv[2] ?? 'screenshots/after';
const quality = process.argv[3] ?? 'low';
mkdirSync(out, { recursive: true });

const LEVELS_ALL = ['pass-run', 'thimphu-pickup', 'airport-dash', 'punakha-valley', 'dochula-storm', 'chelela-climb', 'trongsa-gorge', 'bumthang-night', 'remote-expedition', 'gmc-plains'];
const extra = process.env.EXTRA_LEVELS ? process.env.EXTRA_LEVELS.split(',') : [];
const ALL = process.env.LEVELS ? process.env.LEVELS.split(',') : [...LEVELS_ALL, ...extra];
const VEHICLES = ['dzo-hatch', 'tourist-coaster', 'druk-ranger', 'dragon-cruiser'];

const SAVE_LEVELS = [...new Set([...LEVELS_ALL, ...extra, ...ALL])];
const save = JSON.stringify({
  version: 3,
  settings: { masterVolume: 0.8, musicVolume: 0, sfxVolume: 0.9, muted: true, quality, touchControls: 'auto', touchSensitivity: 1, reducedMotion: false },
  progress: { levels: Object.fromEntries(SAVE_LEVELS.map((id) => [id, { completions: 1, medal: 'bronze', vehicles: {} }])) },
  selection: { levelId: null, vehicleId: null },
  history: [],
  wallet: { credits: 5000 },
  garage: { owned: VEHICLES, upgrades: {} },
  story: { seen: SAVE_LEVELS },
  stats: { missionsPlayed: 0, creditsEarned: 0 },
});

const errors=[],routeSnapshots={};
const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const ctx = await browser.newContext({ viewport: { width: 960, height: 600 } });
await ctx.addInitScript((s) => {
  if (!sessionStorage.getItem('__seeded')) {
    localStorage.setItem('cbhr.v3.save', s);
    sessionStorage.setItem('__seeded', '1');
  }
}, save);
const page = await ctx.newPage();
page.on('pageerror', (e) => {errors.push(e.message);console.log('PAGEERROR', e.message);});
page.on('console', (m) => {
  if(m.type()==='error')errors.push(m.text());
  if (m.type() === 'error' || m.type() === 'warning') console.log('CONSOLE', m.type(), m.text().slice(0, 300));
});
await page.goto('http://localhost:4173/?debug=1&nosplash=1&cloud=off');
await page.waitForFunction(() => !!window.__cbhr, undefined, { timeout: 90000 });
await page.waitForSelector('#btn-start', { state: 'visible' });
await page.waitForTimeout(1500);
if (!process.env.DEBUGUI) await page.keyboard.press('Backquote');
await page.screenshot({ timeout:60000, path: `${out}/menu.png` });
const qualitySnapshots={};
for(const tier of ['auto','max',quality]){await page.evaluate(tier=>{const el=document.querySelector('#set-quality');el.value=tier;el.dispatchEvent(new Event('change'));},tier);await page.waitForTimeout(300);qualitySnapshots[tier]=await stateSnapshot();}
async function stateSnapshot(){return page.evaluate(()=>window.__cbhr.state());}

const state = () => page.evaluate(() => window.__cbhr.state());
const course = () => page.evaluate(() => window.__cbhr.course());

async function toGarage(level) {
  await page.evaluate(() => document.querySelector('#btn-start')?.click());
  await page.waitForSelector('#screen-levels:not([hidden])');
  await page.evaluate((id) => document.querySelector(`button[data-level="${id}"]`).click(), level);
  await page.waitForSelector('#screen-garage:not([hidden])', { timeout: 60000 });
  await page.waitForTimeout(800);
}

for (const level of ALL) {
  await page.waitForSelector('#btn-start', { state: 'visible' });
  await toGarage(level);
  const nCond = Math.min(1, await page.evaluate(() => document.querySelector('#sel-cond')?.options.length ?? 1));
  for (let c = Number(process.env.CONDITION??0); c < Number(process.env.CONDITION??0)+nCond; c++) {
    if (c > 0) {
      await page.evaluate((i) => {
        const sel = document.querySelector('#sel-cond');
        sel.value = String(i);
        sel.dispatchEvent(new Event('change'));
      }, c);
      await page.waitForTimeout(500);
    }
    await page.evaluate(() => document.querySelector('#btn-launch').click());
    await page.waitForTimeout(2500);
    await page.waitForFunction(()=>window.__cbhr?.state().phase==='running',undefined,{timeout:120000});
    console.log('LAUNCH',JSON.stringify(await state()));
    await page.screenshot({ timeout:60000,path:`${out}/${level}-launch.png`});
    if((await state()).flow!=='playing'){console.log(await page.locator('body').innerText());break;}
    const info = await course();
    const span = info.finishS - info.startS;
    await page.evaluate((s) => window.__cbhr.warp(s), process.env.WARP?Number(process.env.WARP):level==='thimphu-pickup'?info.startS+span*0.63:info.startS+span*0.3);
    await page.waitForTimeout(900);
    const s = await state();routeSnapshots[level]=s;
    await page.screenshot({ timeout:60000, path: `${out}/${level}-${s.weather}-${s.time_of_day}.png` });
    for(const distance of (process.env.WAYPOINTS??'').split(',').filter(Boolean).map(Number)){
      await page.evaluate(distance=>window.__cbhr.warp(distance),distance);
      await page.waitForTimeout(1500);
      routeSnapshots[`${level}@${distance}`]=await state();
      await page.screenshot({timeout:60000,path:`${out}/${level}-${distance}.png`});
    }
    // Pause menu -> back to garage keeps the same level loaded.
    await page.keyboard.press('Escape');
    await page.evaluate(() => document.querySelector('#btn-pause-garage').click());
    await page.waitForSelector('#screen-garage:not([hidden])');
    await page.waitForTimeout(400);
  }
  await page.evaluate(() => document.querySelector('#btn-garage-back').click());
  await page.evaluate(() => document.querySelector('#btn-levels-back')?.click());
  await page.waitForTimeout(300);
}
writeFileSync(`${out}/runtime-report.json`,JSON.stringify({errors,qualitySnapshots,routeSnapshots},null,2));
await browser.close();
console.log('done', out, errors);
