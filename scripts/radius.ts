// Prints the tightest corners of a level's road: bun scripts/radius.ts <levelId>
import { getLevel } from '../src/data/levels';
import { courseFor } from '../tests/helpers/mission';

const level = getLevel(process.argv[2]);
const road = courseFor(level).road;
const p = { x: 0, y: 0, z: 0, tx: 0, tz: -1 };
const pts: { s: number; x: number; z: number }[] = [];
for (let s = 0; s < road.length; s += 4) {
  road.at(s, p);
  pts.push({ s, x: p.x, z: p.z });
}
const out: { s: number; r: number; x: number; z: number }[] = [];
for (let i = 3; i < pts.length - 3; i++) {
  const a = pts[i - 3], b = pts[i], c = pts[i + 3];
  const area2 = Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x));
  if (area2 < 1e-6) continue;
  const A = Math.hypot(b.x - a.x, b.z - a.z), B = Math.hypot(c.x - b.x, c.z - b.z), C = Math.hypot(c.x - a.x, c.z - a.z);
  out.push({ s: b.s, r: (A * B * C) / (2 * area2), x: b.x, z: b.z });
}
out.sort((u, v) => u.r - v.r);
console.log(out.slice(0, 8).map((o) => `s=${o.s} r=${o.r.toFixed(1)} at (${o.x.toFixed(0)},${o.z.toFixed(0)})`).join('\n'));
