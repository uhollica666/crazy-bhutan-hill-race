// Focused asset/shader review only. Does not start a campaign or access beta services.
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const out = process.env.REMASTER_OUT || 'docs/visual/stage8b';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.setDefaultNavigationTimeout(120000);
page.setDefaultTimeout(120000);
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
page.on('response', (response) => {
  if (response.status() >= 400) errors.push(`${response.status()}: ${response.url()}`);
});
await page.goto(
  `http://localhost:4188/tools/remaster-preview.html${process.env.REMASTER_BASELINE ? '?baseline=1' : ''}`,
  { waitUntil: 'domcontentloaded' },
);
await page.waitForFunction(() => !!window.remasterReview, { timeout: 120000 });
await page.waitForTimeout(2000);
async function renderedFrame(target = page) {
  const frame = await target.evaluate(() => window.remasterReview.frameIndex);
  await target.waitForFunction((frame) => window.remasterReview.frameIndex > frame, frame);
}
const signals = [];
for (let i = 0; i < 4; i++) {
  await page.evaluate((i) => window.remasterReview.vehicle(i), i);
  await renderedFrame();
  await page.screenshot({ path: `${out}/vehicle-${i}.png` });
  for (const angle of ['rear', 'side', 'interior']) {
    await page.evaluate((angle) => window.remasterReview.angle(angle), angle);
    await renderedFrame();
    await page.screenshot({ path: `${out}/vehicle-${i}-${angle}.png` });
  }
  signals.push(await page.evaluate((i) => window.remasterReview.verifySignals(i), i));
}
for (const signal of signals)
  if (
    !signal.detailed ||
    signal.intensities.light_reverse !== 1.8 ||
    signal.intensities.indicator_right !== 2.4 ||
    signal.intensities.indicator_left !== 0
  )
    errors.push(`Lamp/asset contract: ${JSON.stringify(signal)}`);
await page.evaluate(() => window.remasterReview.custom());
await renderedFrame();
await page.screenshot({ path: `${out}/custom.png` });
if (process.env.REMASTER_BASELINE) {
  await browser.close();
  await writeFile(
    `${out}/baseline-check.json`,
    JSON.stringify(
      {
        commit: '28a8021',
        errors,
        signals,
        note: 'Committed Stage 8A vehicle geometry, common review lighting and cameras. No campaign.',
      },
      null,
      2,
    ) + '\n',
  );
  process.exit(errors.length ? 1 : 0);
}
await page.evaluate(() => window.remasterReview.actors());
await renderedFrame();
await page.screenshot({ path: `${out}/creatures.png` });
for (let i = 0; i < 5; i++) {
  await page.evaluate((i) => window.remasterReview.actor(i), i);
  await renderedFrame();
  await page.screenshot({ path: `${out}/creature-${i}.png` });
}
await page.evaluate(() => window.remasterReview.world());
await renderedFrame();
await page.screenshot({ path: `${out}/world-high.png` });
const samples = [];
for (const level of ['low', 'medium', 'high']) {
  await page.evaluate((level) => window.remasterReview.quality(level), level);
  await renderedFrame();
  samples.push(
    await page.evaluate(() => ({
      quality: window.remasterReview.renderer.level,
      stats: window.remasterReview.renderer.stats(),
      materials: window.remasterReview.scene.children.filter((o) => o.isMesh).length,
      bones: window.remasterReview.rig.mesh.skeleton.bones.length,
    })),
  );
}
const geometry = await page.evaluate(() => window.remasterReview.geometries);
if (samples[2].stats.calls <= samples[1].stats.calls)
  errors.push('High post-processing did not add its expected passes');
await page.close();
const low = await browser.newPage({ viewport: { width: 960, height: 600 } }),
  lowRequests = [];
low.setDefaultNavigationTimeout(120000);
low.setDefaultTimeout(120000);
low.on('request', (request) => {
  if (request.url().includes('/remaster/')) lowRequests.push(request.url());
});
low.on('pageerror', (error) => errors.push(error.message));
await low.goto('http://localhost:4188/tools/remaster-preview.html?quality=low');
await low.waitForFunction(() => !!window.remasterReview);
await renderedFrame(low);
await low.screenshot({ path: `${out}/fresh-low.png` });
if (lowRequests.length) errors.push(`Fresh Low unexpectedly requested: ${lowRequests.join(', ')}`);
await browser.close();
await writeFile(
  `${out}/focused-check.json`,
  JSON.stringify(
    {
      errors,
      samples,
      geometry,
      signals,
      lowRequests,
      note: 'Software WebGL asset preview only; no campaign, collision or target-device performance verification.',
    },
    null,
    2,
  ) + '\n',
);
console.log(JSON.stringify({ errors, samples, geometry }, null, 2));
if (errors.length) process.exitCode = 1;
