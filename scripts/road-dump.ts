// Writes road polylines (original and lengthened) to a JSON file for scripts/road-plot.mjs.
import { writeFileSync } from 'node:fs';
import { getLevel } from '../src/data/levels';
import { getRaw } from '../src/data/levels/raw';
import { RAW_LEVELS } from '../src/data/levels/raw';
import { Road } from '../src/world/Road';

const out: Record<string, unknown> = {};
for (const l of RAW_LEVELS) {
  const a = new Road(getRaw(l.id).road, () => 0);
  const lv = getLevel(l.id);
  const b = new Road(lv.road, () => 0);
  const pts = (r: Road): number[][] => Array.from({ length: Math.ceil(r.count / 6) }, (_, i) => [r.xs[i * 6], r.zs[i * 6]]);
  out[l.id] = { old: pts(a), neu: pts(b), bounds: lv.terrain.bounds, oldBounds: l.terrain.bounds, stops: lv.stops.map((s) => s.id) };
}
writeFileSync(process.argv[2] ?? 'scratch-roads.json', JSON.stringify(out));
