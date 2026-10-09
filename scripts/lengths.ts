import { listLevels } from '../src/data/levels';
import { Course } from '../src/world/Course';

for (const l of listLevels()) {
  const c = new Course(l);
  console.log(
    `${l.id.padEnd(18)} road ${c.road.length.toFixed(0).padStart(5)} m  drive ${(c.finishS - c.startS).toFixed(0).padStart(5)} m  limit ${String(l.timeLimit).padStart(4)}s  medals ${l.medals.gold}/${l.medals.silver}/${l.medals.bronze}  stops ${l.stops.length} cps ${l.checkpoints.length} haz ${l.hazards.length}  fuel ${l.startFuel}  pts ${l.road.points.length}`,
  );
}
