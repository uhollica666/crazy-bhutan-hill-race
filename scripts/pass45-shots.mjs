// Pass 4.5 screenshots: node scripts/pass45-shots.mjs <outDir>   (needs a preview server on :4173)
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] ?? 'screenshots/pass45';
mkdirSync(out, { recursive: true });
const IDS = ['pass-run', 'thimphu-pickup', 'airport-dash', 'punakha-valley', 'dochula-storm', 'chelela-climb', 'trongsa-gorge', 'bumthang-night', 'remote-expedition', 'gmc-plains'];
const save = (settings = {}) =>
  JSON.stringify({
    version: 3,
    settings: { masterVolume: 0.8, musicVolume: 0, sfxVolume: 0.9, ambientVolume: 0.7, muted: true, quality: 'low', touchControls: 'auto', touchSensitivity: 1, reducedMotion: false, ...settings },
    progress: { levels: Object.fromEntries(IDS.map((id) => [id, { completions: 1, medal: 'silver', vehicles: { 'dzo-hatch': { bestTime: 100, bestScore: 50, bestComfort: null, medal: 'silver', completions: 1 } } }])) },
    selection: { levelId: null, vehicleId: null },
    history: [],
    wallet: { credits: 1450 },
    garage: { owned: ['dzo-hatch', 'tourist-coaster', 'druk-ranger', 'dragon-cruiser'], upgrades: {} },
    story: { seen: IDS },
    stats: { missionsPlayed: 12, creditsEarned: 6200, campaignCompleted: false },
  });
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

async function session(name, { w, h, touch, settings, level = 'thimphu-pickup', vehicle }, steps) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch });
  await ctx.addInitScript((s) => { if (!sessionStorage.getItem('s')) { localStorage.setItem('cbhr.v3.save', s); sessionStorage.setItem('s', '1'); } }, save(settings));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR', name, e.message));
  await page.goto('http://localhost:4173/?debug=1&nosplash=1');
  await page.waitForFunction(() => !!window.__cbhr, undefined, { timeout: 90000 });
  await page.waitForSelector('#btn-start', { state: 'visible' });
  await page.addStyleTag({ content: '#debug{display:none!important}' });
  await page.waitForTimeout(800);
  await steps(page, async () => {
    await page.evaluate(() => document.querySelector('#btn-start').click());
    await page.waitForSelector('#screen-levels:not([hidden])');
    await page.evaluate((l) => document.querySelector(`button[data-level="${l}"]`).click(), level);
    await page.waitForSelector('#screen-garage:not([hidden])', { timeout: 30000 });
    if (vehicle) {
      for (let i = 0; i < 5; i++) {
        const id = await page.evaluate(() => window.__cbhr.state().vehicleId);
        if (id === vehicle) break;
        await page.evaluate(() => document.querySelector('#btn-veh-next').click());
        await page.waitForTimeout(300);
      }
    }
    await page.evaluate(() => document.querySelector('#btn-launch').click());
    const brief = await page.$('#brief-go');
    if (brief && (await brief.isVisible())) await brief.click();
    await page.waitForFunction(() => window.__cbhr.state().phase === 'running', undefined, { timeout: 40000 });
  });
  await ctx.close();
}

const drive = async (page, ms = 3500) => {
  await page.evaluate(() => window.__cbhr.autodrive(true));
  await page.waitForTimeout(ms);
};

for (const mode of ['standard', 'minimal', 'telemetry']) {
  await session(`hud-${mode}`, { w: 1280, h: 720, touch: false, settings: { hudMode: mode } }, async (page, start) => {
    await start();
    await drive(page);
    await page.screenshot({ path: `${out}/desktop-hud-${mode}.png` });
  });
}
for (const steer of ['bar', 'wheel']) {
  await session(`mobile-${steer}`, { w: 800, h: 360, touch: true, settings: { touchSteer: steer } }, async (page, start) => {
    await start();
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${out}/mobile-hud-${steer}.png` });
  });
}
await session('mobile-mirror-large', { w: 800, h: 360, touch: true, settings: { touchSteer: 'wheel', touchMirror: true, touchLarge: true } }, async (page, start) => {
  await start();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/mobile-hud-wheel-mirror-large.png` });
});
await session('mobile-portrait-menu', { w: 390, h: 844, touch: true, settings: {} }, async (page) => {
  await page.screenshot({ path: `${out}/mobile-portrait-menu.png` });
});
await session('settings', { w: 1280, h: 720, touch: false, settings: {} }, async (page) => {
  await page.evaluate(() => document.querySelector('#btn-menu-settings').click());
  await page.waitForSelector('#screen-settings:not([hidden])');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/settings-audio.png` });
  await page.evaluate(() => document.querySelector('#tab-controls').click());
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${out}/settings-controls.png` });
});
for (const v of ['dzo-hatch', 'tourist-coaster', 'druk-ranger', 'dragon-cruiser']) {
  await session('garage-' + v, { w: 1280, h: 720, touch: false, settings: {}, vehicle: v }, async (page) => {
    await page.evaluate(() => document.querySelector('#btn-menu-garage').click());
    await page.waitForSelector('#screen-garage:not([hidden])');
    for (let i = 0; i < 5; i++) {
      const id = await page.evaluate(() => window.__cbhr.state().vehicleId);
      if (id === v) break;
      await page.evaluate(() => document.querySelector('#btn-veh-next').click());
      await page.waitForTimeout(400);
    }
    await page.waitForTimeout(1500);
    await page.screenshot({ path: out + '/garage-' + v + '.png' });
  });
}
await session('garage-mobile', { w: 800, h: 360, touch: true, settings: {} }, async (page) => {
  await page.evaluate(() => document.querySelector('#btn-menu-garage').click());
  await page.waitForSelector('#screen-garage:not([hidden])');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: out + '/garage-mobile.png' });
});
await browser.close();
console.log('done', out);
