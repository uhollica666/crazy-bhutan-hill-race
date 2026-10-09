// Measures render workload and main-thread cost per quality preset.
//   node scripts/perf.mjs <baseUrl> [--stage1]
// Needs a server (bun run build && bun run preview). Software GL (SwiftShader) is used, so fps is NOT
// representative of any real GPU: the useful numbers are triangles / draw calls / geometries / textures and the
// JS time spent per animation frame (callback time, which includes issuing GL commands).
import { chromium } from '@playwright/test';

const base = process.argv[2] ?? 'http://localhost:4173';
const stage1 = process.argv.includes('--stage1');
const levels = stage1
  ? ['pass-run']
  : ['pass-run', 'thimphu-pickup', 'airport-dash', 'chelela-climb', 'remote-expedition'];

const full = (quality) => ({
  version: 3,
  wallet: { credits: 0 },
  garage: { owned: ['dzo-hatch', 'tourist-coaster', 'druk-ranger', 'dragon-cruiser'], upgrades: {} },
  story: { seen: levels },
  stats: { missionsPlayed: 0, creditsEarned: 0 },
  settings: {
    masterVolume: 0.8,
    musicVolume: 0,
    sfxVolume: 0.9,
    muted: true,
    levelsView: 'list',
    quality,
    touchControls: 'off',
    touchSensitivity: 1,
  },
  progress: {
    levels: {
      'pass-run': {
        completions: 1,
        medal: 'bronze',
        vehicles: {
          'druk-ranger': { bestTime: 130, bestScore: 40, bestComfort: null, medal: 'bronze', completions: 1 },
        },
      },
      'airport-dash': {
        completions: 1,
        medal: 'bronze',
        vehicles: {
          'druk-ranger': { bestTime: 130, bestScore: 40, bestComfort: null, medal: 'bronze', completions: 1 },
        },
      },
      'chelela-climb': { completions: 1, medal: 'bronze', vehicles: {} },
    },
  },
  selection: { levelId: null, vehicleId: null },
  history: [],
});

const launch = () =>
  chromium.launch({
    channel: 'chrome',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
const rows = [];
for (const level of levels) {
  for (const quality of ['low', 'medium', 'high']) {
    // Fresh browser per sample also releases SwiftShader's process-level shader caches.
    const browser = await launch();
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await ctx.addInitScript(
      ({ s, q, stage1 }) => {
        if (stage1)
          localStorage.setItem(
            'cbhr.v1.settings',
            JSON.stringify({
              masterVolume: 0.8,
              musicVolume: 0,
              sfxVolume: 0.9,
              muted: true,
              quality: q,
              touchControls: 'off',
            }),
          );
        else localStorage.setItem('cbhr.v3.save', JSON.stringify(s));
        // Time every animation-frame callback.
        const raf = window.requestAnimationFrame.bind(window);
        window.__frames = { n: 0, ms: 0, max: 0, start: performance.now() };
        window.requestAnimationFrame = (cb) =>
          raf((t) => {
            const t0 = performance.now();
            cb(t);
            const d = performance.now() - t0;
            window.__frames.n++;
            window.__frames.ms += d;
            window.__frames.max = Math.max(window.__frames.max, d);
          });
      },
      { s: full(quality), q: quality, stage1 },
    );
    const page = await ctx.newPage();
    await page.goto(`${base}/?debug=1&nosplash=1&noadapt`);
    await page.waitForFunction(() => !!window.__cbhr, undefined, { timeout: 120000 });
    await page.click('#btn-start');
    if (!stage1) {
      await page.click(`button[data-level="${level}"]`);
      await page.waitForSelector('#screen-garage:not([hidden])', { timeout: 60000 });
      await page.click('#btn-launch');
    }
    await page.waitForFunction(() => window.__cbhr.state().phase === 'running', undefined, {
      timeout: 60000,
    });
    // Keep the camera and vehicle at the grid for equivalent scenes across quality tiers.
    await page.waitForTimeout(2500);
    await page.evaluate(() => (window.__frames = { n: 0, ms: 0, max: 0, start: performance.now() }));
    await page.waitForTimeout(6000);
    const r = await page.evaluate(() => {
      const s = window.__cbhr.state();
      const f = window.__frames;
      const mem = performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null;
      const assets = performance
        .getEntriesByType('resource')
        .filter(
          (e) => e.initiatorType === 'script' || e.initiatorType === 'link' || e.initiatorType === 'img',
        );
      return {
        stats: s.stats,
        // Wall-clock callback rate avoids the game's clamped-dt FPS estimate.
        fps: (f.n * 1000) / Math.max(1, performance.now() - f.start),
        vehicle: s.vehicleId,
        frames: f.n,
        jsMsAvg: f.ms / Math.max(1, f.n),
        jsMsMax: f.max,
        heapMB: mem,
        dpr: s.pixelRatio,
        loadedAssetKB: assets.reduce((sum, e) => sum + e.decodedBodySize, 0) / 1024,
      };
    });
    const row = {
      level,
      quality,
      vehicle: r.vehicle,
      ...r.stats,
      swiftshaderFps: +r.fps.toFixed(1),
      jsMsPerFrame: +r.jsMsAvg.toFixed(2),
      jsMsWorst: +r.jsMsMax.toFixed(1),
      heapMB: r.heapMB ? +r.heapMB.toFixed(0) : null,
      pixelRatio: r.dpr,
      loadedAssetKB: +r.loadedAssetKB.toFixed(1),
      browser: browser.version(),
    };
    rows.push(row);
    console.log(JSON.stringify(row));
    await ctx.close();
    await browser.close();
  }
}
console.log(`${stage1 ? 'STAGE1' : 'STAGE3'}: ${rows.length} equivalent-grid scenes measured`);
