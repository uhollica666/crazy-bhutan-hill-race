// Medal calibration table: bun scripts/medals.ts [levelId ...]  (time and medal per autopilot driving style)
import { listLevels } from '../src/data/levels';
import { RAW_LEVELS } from '../src/data/levels/raw';
import { simulate } from '../tests/helpers/sim';

const STYLES = {
  flatOut: {},
  brisk: { cornerAccel: 6.8, maxBrake: 0.6, brakeDecel: 5 },
  steady: { cornerAccel: 5.5, maxBrake: 0.5, brakeDecel: 4.5 },
  careful: { cornerAccel: 4.2, maxBrake: 0.35, brakeDecel: 3.5 },
};
const ids = process.argv.slice(2);
// RAW=1 calibrates the missions as originally authored (before the Pass 5 lengthening) for comparison.
for (const l of process.env.RAW ? RAW_LEVELS : listLevels()) {
  if (ids.length && !ids.includes(l.id)) continue;
  console.log(`## ${l.id}  medals ${l.medals.gold}/${l.medals.silver}/${l.medals.bronze} limit ${l.timeLimit}`);
  for (const v of l.vehicles) {
    const cols = Object.entries(STYLES).map(([n, s]) => {
      const r = simulate(l, v, s).result;
      return `${n}:${r ? r.time.toFixed(0) + '/' + r.medal + (r.comfort !== null ? '/c' + Math.round(r.comfort) : '') : 'DNF'}`;
    });
    console.log(`  ${v.padEnd(16)} ${cols.join('  ')}`);
  }
}
