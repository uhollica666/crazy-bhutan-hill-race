// Derives web-optimised branding assets from the supplied official logo WITHOUT modifying the source file.
//   node scripts/brand-assets.mjs
// Input : novarah-logo.png (project root, 937x266 RGBA, transparent background, white wordmark + pink symbol)
// Output: public/brand/novarah-logo.webp   (full horizontal logo, alpha preserved)
//         public/brand/novarah-symbol.webp (the circular "N/W" symbol only, cropped from the same artwork)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const src = readFileSync('novarah-logo.png');
mkdirSync('public/brand', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage();
const dataUrl = `data:image/png;base64,${src.toString('base64')}`;
const results = await page.evaluate(async (url) => {
  const img = new Image();
  img.src = url;
  await img.decode();
  const encode = async (sx, sy, sw, sh, quality) => {
    const c = document.createElement('canvas');
    c.width = sw;
    c.height = sh;
    c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    const blob = await new Promise((r) => c.toBlob(r, 'image/webp', quality));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  };
  return {
    size: [img.naturalWidth, img.naturalHeight],
    logo: await encode(0, 0, img.naturalWidth, img.naturalHeight, 0.92),
    symbol: await encode(30, 10, 285, 245, 0.92),
  };
}, dataUrl);
writeFileSync('public/brand/novarah-logo.webp', Buffer.from(results.logo));
writeFileSync('public/brand/novarah-symbol.webp', Buffer.from(results.symbol));
console.log('source', results.size.join('x'), '-> logo', results.logo.length, 'bytes, symbol', results.symbol.length, 'bytes');
await browser.close();
