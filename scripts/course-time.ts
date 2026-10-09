import { getLevel, listLevels } from '../src/data/levels';
import { getRaw } from '../src/data/levels/raw';
import { Course } from '../src/world/Course';
const t = (l: ReturnType<typeof getLevel>): string => {
  const t0 = performance.now();
  const c = new Course(l);
  return `${c.terrain.nx}x${c.terrain.nz}=${((c.terrain.nx * c.terrain.nz) / 1000).toFixed(0)}k nodes ${(performance.now() - t0).toFixed(0)}ms`;
};
for (const l of listLevels()) console.log(l.id.padEnd(18), 'old', t(getRaw(l.id)).padEnd(34), 'new', t(l));
