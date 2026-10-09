// Level survey: geometry plus a full autopilot mission for every eligible vehicle, in three driving styles.
//   bun scripts/survey.ts [levelId ...]
// The autopilot goes through the real MissionRuntime (pickups, fuel, hazards, traffic), like the tests do.
import { listLevels } from '../src/data/levels';
import { courseFor, runMission } from '../tests/helpers/mission';

const ids = process.argv.slice(2);
const STYLES: Record<string, { cornerAccel?: number }> = { fast: {}, steady: { cornerAccel: 5.5 }, careful: { cornerAccel: 4.2 } };
for (const level of listLevels()) {
  if (ids.length && !ids.includes(level.id)) continue;
  const c = courseFor(level);
  console.log(
    `## ${level.id} len ${c.road.length.toFixed(0)} minR ${c.road.minRadius().toFixed(1)} grade ${c.road.maxGrade().toFixed(2)}  medals ${level.medals.gold}/${level.medals.silver}/${level.medals.bronze} limit ${level.timeLimit}`,
  );
  for (const vid of level.vehicles) {
    const cols: string[] = [];
    for (const [name, style] of Object.entries(STYLES)) {
      const r = runMission(level, vid, style);
      const res = r.result;
      cols.push(
        `${name}: ${r.finished ? res!.time.toFixed(0) + 's ' + res!.medal + (res!.comfort !== null ? ' c' + Math.round(res!.comfort) : '') : 'DNF(' + (r.stuck ? 'stuck' : r.overturned ? 'flip' : 'timeout') + ')'} f${r.fuelLeft.toFixed(2)} hp${r.health.toFixed(0)}`,
      );
    }
    console.log(`  ${vid.padEnd(16)} ${cols.join(' | ')}`);
  }
}
