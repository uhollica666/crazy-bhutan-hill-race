// node scripts/road-plot.mjs scratch-roads.json out.png : draws old (grey) and new (red) roads per level.
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
const data = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const html = `<body style="margin:0;background:#222;display:grid;grid-template-columns:repeat(5,380px);gap:6px;font:12px sans-serif;color:#fff">${Object.entries(data).map(([id, d]) => `<div><div>${id}</div><canvas id="c-${id}" width="380" height="440"></canvas></div>`).join('')}</body>`;
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1950, height: 960 } });
await page.setContent(html);
await page.evaluate((data) => {
  for (const [id, d] of Object.entries(data)) {
    const c = document.getElementById('c-' + id); const g = c.getContext('2d');
    const b = d.bounds; const w = b.maxX - b.minX, h = b.maxZ - b.minZ; const k = Math.min(370 / w, 430 / h);
    const X = (x) => 5 + (x - b.minX) * k, Z = (z) => 5 + (z - b.minZ) * k;
    g.fillStyle = '#333'; g.fillRect(X(b.minX), Z(b.minZ), w * k, h * k);
    g.strokeStyle = '#777'; const ob = d.oldBounds; g.strokeRect(X(ob.minX), Z(ob.minZ), (ob.maxX - ob.minX) * k, (ob.maxZ - ob.minZ) * k);
    for (const [pts, col, wd] of [[d.neu, '#ff5a4a', 3], [d.old, '#fff', 1]]) { g.strokeStyle = col; g.lineWidth = wd; g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(X(p[0]), Z(p[1])) : g.moveTo(X(p[0]), Z(p[1])))); g.stroke(); }
  }
}, data);
await page.screenshot({ path: process.argv[3] ?? 'roads.png' });
await browser.close();
