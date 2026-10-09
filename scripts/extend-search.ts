// Authoring aid: finds stretch paths that lengthen a mission without the road touching itself.
//   bun scripts/extend-search.ts <levelId> <hairpin|meander|city> [minAddedFrac] [maxAddedFrac]
import { getRaw } from '../src/data/levels/raw';
import { stretchReport } from '../src/data/levels/extend';
import type { PathCmd, Stretch } from '../src/data/levels/extend';

const id = process.argv[2];
const family = process.argv[3] ?? 'hairpin';
const minFrac = Number(process.argv[4] ?? 0.8);
const maxFrac = Number(process.argv[5] ?? 1.15);
const level = getRaw(id);

const zig = (pairs: number, r: number, a: number, left: boolean): PathCmd[] => {
  const s = left ? -1 : 1;
  const out: PathCmd[] = [];
  for (let i = 0; i < pairs; i++) {
    out.push({ turn: s * 90, radius: r }, { straight: a }, { turn: -s * 180, radius: r }, { straight: a }, { turn: s * 90, radius: r });
  }
  return out;
};
const wind = (reps: number, theta: number, R: number, s: number, left: boolean): PathCmd[] => {
  const k = left ? -1 : 1;
  const out: PathCmd[] = [];
  for (let i = 0; i < reps; i++) {
    out.push({ turn: k * theta, radius: R }, { straight: s }, { turn: -2 * k * theta, radius: R }, { straight: s }, { turn: k * theta, radius: R });
  }
  return out;
};
const city = (blocks: number, a: number, b: number, left: boolean): PathCmd[] => {
  const k = left ? -1 : 1;
  const out: PathCmd[] = [];
  for (let i = 0; i < blocks; i++) {
    out.push({ straight: a }, { turn: k * 90, radius: 18 }, { straight: b }, { turn: -k * 90, radius: 18 });
  }
  return out;
};

const candidates: { name: string; path: PathCmd[] }[] = [];
if (family === 'hairpin') {
  for (const pairs of [1, 2, 3, 4])
    for (const r of [14, 18, 24])
      for (const a of [60, 100, 150, 220])
        for (const left of [true, false]) candidates.push({ name: `zig p${pairs} r${r} a${a} ${left ? 'L' : 'R'}`, path: zig(pairs, r, a, left) });
} else if (family === 'meander') {
  for (const reps of [1, 2, 3, 4])
    for (const theta of [25, 40, 55])
      for (const R of [90, 140, 200])
        for (const s of [60, 120, 200])
          for (const left of [true, false]) candidates.push({ name: `wind x${reps} th${theta} R${R} s${s} ${left ? 'L' : 'R'}`, path: wind(reps, theta, R, s, left) });
} else {
  for (const blocks of [1, 2, 3])
    for (const a of [80, 140, 200])
      for (const b of [80, 140, 200])
        for (const left of [true, false]) candidates.push({ name: `city x${blocks} a${a} b${b} ${left ? 'L' : 'R'}`, path: city(blocks, a, b, left) });
}

const results: { score: number; line: string }[] = [];
for (const at of [0.2, 0.28, 0.35, 0.42, 0.5, 0.58, 0.65, 0.72]) {
  for (const c of candidates) {
    const st: Stretch = { at, path: c.path, timeLimit: 999, medals: { gold: 1, silver: 2, bronze: 3 } };
    try {
      const r = stretchReport(level, st);
      const frac = r.added / (level.road.points.length ? 1 : 1);
      void frac;
      results.push({ score: r.minGap - Math.max(0, r.maxGrade - 0.3) * 400, line: `grade ${(r.maxGrade * 100).toFixed(0).padStart(2)} at ${at} ${c.name.padEnd(28)} added ${r.added.toFixed(0).padStart(5)} gap ${r.minGap.toFixed(0).padStart(4)} minR ${r.minRadius.toFixed(0).padStart(4)}` });
    } catch {
      /* invalid candidate */
    }
  }
}
import { Road } from '../src/world/Road';
const L = new Road(level.road, () => 0).length;
const base = stretchReport(level, { at: 0.5, path: [], timeLimit: 1, medals: { gold: 1, silver: 2, bronze: 3 } });
const minRadiusAllowed = Math.min(12, base.minRadius - 0.6);
const ok = results
  .filter((r) => {
    const added = Number(/added\s+(\d+)/.exec(r.line)![1]);
    const minR = Number(/minR\s+(\d+)/.exec(r.line)![1]);
    return added >= minFrac * L && added <= maxFrac * L && minR >= minRadiusAllowed;
  })
  .sort((a, b) => b.score - a.score)
  .slice(0, 14);
console.log(`${id}: base minR ${base.minRadius.toFixed(1)} road ${L.toFixed(0)} m, wanted +${(minFrac * L).toFixed(0)}..${(maxFrac * L).toFixed(0)} m`);
for (const r of ok) console.log('  ' + r.line);
