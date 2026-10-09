// Prints GPU geometry/texture counts while opening garages repeatedly: node scripts/leakprobe.mjs (preview on :4173)
import { chromium } from '@playwright/test';

const IDS = ['pass-run', 'thimphu-pickup', 'airport-dash', 'punakha-valley', 'dochula-storm', 'chelela-climb', 'trongsa-gorge', 'bumthang-night', 'remote-expedition', 'gmc-plains'];
const save = JSON.stringify({
  version: 3,
  settings: { masterVolume: 0.8, musicVolume: 0, sfxVolume: 0.9, ambientVolume: 0.7, muted: true, quality: 'low', touchControls: 'auto', touchSensitivity: 1, reducedMotion: false, levelsView: 'list' },
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
if (process.env.TRACE_TEX) await page.addInitScript(() => {
  const P = WebGL2RenderingContext.prototype;
  const c = P.createTexture;
  window.__tex = new Map();
  P.createTexture = function () { const t = c.call(this); Error.stackTraceLimit = 60; window.__tex.set(t, new Error().stack.split(String.fromCharCode(10)).filter((l) => l.includes('/src/')).slice(0, 3).map((l) => l.trim().replace(/http:[^ ]*[/]src[/]/, '')).join(' <- '));  return t; };
  const d = P.deleteTexture;
  P.deleteTexture = function (t) { window.__tex.delete(t); return d.call(this, t); };
});
await page.goto(`http://localhost:${process.env.PORT || 4173}/?debug=1&nosplash=1&quality=low`);
await page.waitForFunction(() => !!window.__cbhr, undefined, { timeout: 90000 });
await page.waitForSelector('#btn-start', { state: 'visible' });
const stat = async () => page.evaluate(() => { const s = window.__cbhr.state(); return `${s.stats.geometries}/${s.stats.textures} scene=${s.scene} veh=${s.vehicleId}`; });
console.log('menu', await stat());
for (const id of [...IDS.slice(0, 4), 'pass-run', 'thimphu-pickup', 'pass-run']) {
  await page.evaluate(() => document.querySelector('#btn-start').click());
  await page.waitForSelector('#screen-levels:not([hidden])');
  await page.evaluate((l) => document.querySelector(`button[data-level="${l}"]`).click(), id);
  await page.waitForSelector('#screen-garage:not([hidden])', { timeout: 30000 });
  await page.waitForTimeout(900);
  console.log(id, await stat());
  if (process.env.TRACE_TEX) { const m = {}; for (const x of await page.evaluate(() => [...window.__tex.values()])) m[x] = (m[x] || 0) + 1; console.log(JSON.stringify(m, null, 1)); }
  await page.evaluate(() => document.querySelector('#btn-garage-back').click());
  await page.evaluate(() => document.querySelector('#btn-levels-back').click());
  await page.waitForTimeout(300);
}
await browser.close();
