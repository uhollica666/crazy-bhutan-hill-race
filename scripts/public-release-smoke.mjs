import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
const origin = 'https://crazy-bhutan-hill-race.vercel.app';
const browser = await chromium.launch({
  channel: 'chrome',
  args: [
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--enable-webgl',
    '--ignore-gpu-blocklist',
  ],
});
const page = await browser.newPage({ viewport: { width: 1365, height: 768 } });
page.setDefaultTimeout(90000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('response', (r) => {
  if (r.status() >= 400 && r.url().startsWith(origin)) errors.push(`${r.status()} ${r.url()}`);
});
const response = await page.goto(`${origin}/download/`);
if (response.status() !== 200) throw Error(`Download page returned ${response.status()}`);
await page.getByRole('heading', { name: 'The mountains are calling.' }).waitFor();
await page.waitForFunction(
  () =>
    document.querySelectorAll('#windows-links a').length === 2 &&
    document.querySelectorAll('#android-links a').length === 1,
);
const manifest = await (await page.request.get(`${origin}/download/release.json`)).json();
await page.waitForFunction(() =>
  Array.from(document.images).every((img) => img.complete && img.naturalWidth),
);
await page.screenshot({ path: 'docs/release/download-page.png', fullPage: true });
await page.goto(`${origin}/?debug=1&nosplash=1&cloud=off&quality=low`);
await page.locator('#btn-start').waitFor();
await page.screenshot({ path: 'docs/release/public-game.png' });
const report = {
  origin,
  checkedAt: new Date().toISOString(),
  publicDownloadPage: true,
  confirmedArtifacts: manifest.artifacts,
  gameMenuLoaded: true,
  errors,
};
await writeFile('docs/release/public-deployment-check.json', JSON.stringify(report, null, 2) + '\n');
await browser.close();
console.log(JSON.stringify(report));
if (errors.length) process.exitCode = 1;
