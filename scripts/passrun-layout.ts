// Layout check for the Pass Run path (no gameplay): bun scripts/passrun-layout.ts
import { PASS_RUN_PATH } from '../src/data/levels/passRunPath';
import { walkPath } from '../src/data/levels/extend';

const w = walkPath({ x: 0, z: 30 }, { x: 0, z: -1 }, PASS_RUN_PATH);
const pts = [{ x: 0, z: 30 }, ...w.points];
// dense polyline
const dense: { x: number; z: number; s: number }[] = [];
let s = 0;
for (let i = 1; i < pts.length; i++) {
  const a = pts[i - 1];
  const b = pts[i];
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const n = Math.max(1, Math.round(len / 10));
  for (let k = 0; k < n; k++) dense.push({ x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n, s: s + (len * k) / n });
  s += len;
}
let minD = Infinity;
let at = [0, 0];
for (let i = 0; i < dense.length; i++)
  for (let j = i + 1; j < dense.length; j++) {
    if (dense[j].s - dense[i].s < 120) continue;
    const d = Math.hypot(dense[i].x - dense[j].x, dense[i].z - dense[j].z);
    if (d < minD) {
      minD = d;
      at = [Math.round(dense[i].s), Math.round(dense[j].s)];
    }
  }
const xs = pts.map((p) => p.x);
const zs = pts.map((p) => p.z);
console.log('polyline length', Math.round(s), 'm; x', Math.round(Math.min(...xs)), Math.round(Math.max(...xs)), 'z', Math.round(Math.min(...zs)), Math.round(Math.max(...zs)));
console.log('closest approach of non-adjacent road (>120 m apart along it):', Math.round(minD), 'm at s=', at);
console.log('end heading', w.heading);
