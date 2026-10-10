// Focused asset/shader review only. Does not start a campaign or access beta services.
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const out = 'docs/visual/stage8a';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
page.on('response', (response) => {
  if (response.status() >= 400) errors.push(`${response.status()}: ${response.url()}`);
});
await page.goto('http://localhost:4188/tools/remaster-preview.html');
await page.waitForFunction(() => !!window.remasterReview, { timeout: 60000 });
await page.waitForTimeout(2000);
const signals = [];
for (let i = 0; i < 4; i++) {
  await page.evaluate((i) => window.remasterReview.vehicle(i), i);
  signals.push(await page.evaluate((i) => window.remasterReview.verifySignals(i), i));
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${out}/vehicle-${i}.png` });
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
await page.screenshot({ path: `${out}/custom.png` });
await page.evaluate(() => window.remasterReview.world());
await page.waitForTimeout(700);
await page.screenshot({ path: `${out}/world-high.png` });
const samples = [];
for (const level of ['low', 'medium', 'high']) {
  await page.evaluate((level) => window.remasterReview.quality(level), level);
  await page.waitForTimeout(700);
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
await page.close();
const low = await browser.newPage({ viewport: { width: 960, height: 600 } }),
  lowRequests = [];
low.on('request', (request) => {
  if (request.url().includes('/remaster/')) lowRequests.push(request.url());
});
low.on('pageerror', (error) => errors.push(error.message));
await low.goto('http://localhost:4188/tools/remaster-preview.html?quality=low');
await low.waitForFunction(() => !!window.remasterReview);
await low.waitForTimeout(350);
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
