// Derives the web-sized game logo from the supplied artwork WITHOUT modifying the source file.
//   node scripts/game-logo.mjs      (reads cbhr-logo.png in the project root)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const src = readFileSync('cbhr-logo.png');
mkdirSync('public/brand', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage();
const out = await page.evaluate(async (url) => {
  const img = new Image();
  img.src = url;
  await img.decode();
  const size = 720;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, 0, 0, size, size);
  const blob = await new Promise((r) => c.toBlob(r, 'image/webp', 0.88));
  return { size: [img.naturalWidth, img.naturalHeight], data: Array.from(new Uint8Array(await blob.arrayBuffer())) };
}, `data:image/png;base64,${src.toString('base64')}`);
writeFileSync('public/brand/cbhr-logo.webp', Buffer.from(out.data));
console.log('source', out.size.join('x'), '-> public/brand/cbhr-logo.webp', out.data.length, 'bytes');
await browser.close();
