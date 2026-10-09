// Reports on every lengthened mission: added road, closest approach to the rest of the road, tightest corner and
// steepest grade.   bun scripts/extend-check.ts
import { EXTENSIONS } from '../src/data/levels/extensions';
import { stretchReport } from '../src/data/levels/extend';
import { getRaw } from '../src/data/levels/raw';
import { getLevel } from '../src/data/levels';
import { Course } from '../src/world/Course';

for (const id of Object.keys(EXTENSIONS)) {
  const raw = getRaw(id);
  const r = stretchReport(raw, EXTENSIONS[id]);
  const c = new Course(getLevel(id));
  let maxGrade = 0;
  const road = c.road;
  for (let i = 4; i < road.count; i++) {
    const d = Math.hypot(road.xs[i] - road.xs[i - 4], road.zs[i] - road.zs[i - 4]) || 1;
    maxGrade = Math.max(maxGrade, Math.abs(road.ys[i] - road.ys[i - 4]) / d);
  }
  const a = new Course(raw);
  let rawGrade = 0;
  for (let i = 4; i < a.road.count; i++) {
    const d = Math.hypot(a.road.xs[i] - a.road.xs[i - 4], a.road.zs[i] - a.road.zs[i - 4]) || 1;
    rawGrade = Math.max(rawGrade, Math.abs(a.road.ys[i] - a.road.ys[i - 4]) / d);
  }
  console.log(`${id.padEnd(18)} +${r.added.toFixed(0).padStart(5)} m  gap ${r.minGap.toFixed(0).padStart(4)} m  minR ${r.minRadius.toFixed(1).padStart(5)}  max grade ${(maxGrade * 100).toFixed(0)}% (was ${(rawGrade * 100).toFixed(0)}%)  bounds ${JSON.stringify(getLevel(id).terrain.bounds)}`);
}
