// Generates favicon + PWA icons from the in-code logo (src/ui/icons.ts) using the locally installed Chrome.
// Run with: node scripts/make-icons.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { logoSvg } from '../src/ui/icons.ts';

mkdirSync('public', { recursive: true });
const logo = logoSvg('ic');
writeFileSync('public/favicon.svg', logo.replace('class="mark" ', ''));

// Icon variants: "any" = transparent round mark; "maskable" = full-bleed indigo with the mark in the safe zone.
const page = (size, inner, bg) =>
  `<html><body style="margin:0;width:${size}px;height:${size}px;background:${bg};display:grid;place-items:center">${inner}</body></html>`;

const targets = [
  { file: 'public/icon-192.png', size: 192, scale: 1, bg: 'transparent' },
  { file: 'public/icon-512.png', size: 512, scale: 1, bg: 'transparent' },
  { file: 'public/icon-maskable-512.png', size: 512, scale: 0.72, bg: '#1d2f5c' },
  { file: 'public/apple-touch-icon.png', size: 180, scale: 0.84, bg: '#1d2f5c' },
  { file: 'public/favicon-32.png', size: 32, scale: 1, bg: 'transparent' },
];

const browser = await chromium.launch({ channel: 'chrome' });
for (const t of targets) {
  const ctx = await browser.newContext({ viewport: { width: t.size, height: t.size } });
  const p = await ctx.newPage();
  const px = Math.round(t.size * t.scale);
  const svg = logo.replace('class="mark"', `width="${px}" height="${px}"`);
  await p.setContent(page(t.size, svg, t.bg));
  await p.screenshot({ path: t.file, omitBackground: t.bg === 'transparent' });
  await ctx.close();
  console.log('wrote', t.file);
}
await browser.close();
