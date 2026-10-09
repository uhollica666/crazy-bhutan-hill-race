import { Road, createRoadHit } from '../../world/Road';
import { createRoadBase } from '../../world/Terrain';
import type { CheckpointDef, HazardDef, LandmarkDef, LevelDef, RoadPointDef, StopDef } from '../types';

/**
 * One turtle-graphics command. `straight` advances along the heading; `turn` swings the heading by that many
 * degrees (positive = right, negative = left) around a circle of `radius` metres.
 */
export type PathCmd = { straight: number } | { turn: number; radius: number };

/**
 * A stretch of new road spliced into an existing mission, so a mission can be made longer without redrawing it.
 * Everything before the splice stays where it is; everything after it (road, scenery, stops, hazards) is slid
 * along with the road end of the new stretch, which therefore has to leave the heading unchanged (the turns must
 * sum to zero). Fractions in the original level keep meaning "the same place on the road".
 */
export interface Stretch {
  /** Where on the whole road (0..1) the new stretch begins. Snapped to the nearest road control point. */
  at: number;
  path: PathCmd[];
  /** Replacement limits for the longer mission (calibrated against the autopilot, see scripts/medals.ts). */
  timeLimit: number;
  medals: { gold: number; silver: number; bronze: number };
  comfortMedals?: { gold: number; silver: number; bronze: number };
  /** New starting tank fraction when the longer route needs more fuel. */
  startFuel?: number;
  /** New content inside the stretch; `t` is 0..1 along the new road. */
  checkpoints?: { t: number; label: string }[];
  stops?: (Omit<StopDef, 'at'> & { t: number })[];
  hazards?: (Omit<HazardDef, 'at'> & { t: number })[];
  landmarks?: (Omit<LandmarkDef, 'at'> & { t: number })[];
  /** Extra story/objective text appended to the description. */
  note?: string;
  rivalFinishTime?: number;
}

const DEG = Math.PI / 180;

/** Samples a turtle path into spline control points (excluding the start position, including the end). */
export function walkPath(
  start: { x: number; z: number },
  heading: { x: number; z: number },
  path: PathCmd[],
): { points: RoadPointDef[]; end: { x: number; z: number }; heading: { x: number; z: number }; length: number } {
  let px = start.x;
  let pz = start.z;
  let hx = heading.x;
  let hz = heading.z;
  const pts: RoadPointDef[] = [];
  let length = 0;
  for (const c of path) {
    if ('straight' in c) {
      const n = Math.max(1, Math.round(c.straight / 40));
      for (let i = 1; i <= n; i++) {
        pts.push({ x: px + (hx * c.straight * i) / n, z: pz + (hz * c.straight * i) / n });
      }
      px += hx * c.straight;
      pz += hz * c.straight;
      length += c.straight;
    } else {
      const s = Math.sign(c.turn) || 1;
      const ang = Math.abs(c.turn) * DEG;
      // Right vector of the heading is (-hz, hx) in this world (+X east, -Z forward).
      const rx = -hz;
      const rz = hx;
      const cx = px + s * rx * c.radius;
      const cz = pz + s * rz * c.radius;
      const steps = Math.max(2, Math.ceil(ang / (20 * DEG)));
      for (let i = 1; i <= steps; i++) {
        const a = (ang * i) / steps;
        const nhx = hx * Math.cos(a) + s * rx * Math.sin(a);
        const nhz = hz * Math.cos(a) + s * rz * Math.sin(a);
        const nrx = -nhz;
        const nrz = nhx;
        pts.push({ x: cx - s * nrx * c.radius, z: cz - s * nrz * c.radius });
      }
      const nhx = hx * Math.cos(ang) + s * rx * Math.sin(ang);
      const nhz = hz * Math.cos(ang) + s * rz * Math.sin(ang);
      px = cx - s * -nhz * c.radius;
      pz = cz - s * nhx * c.radius;
      hx = nhx;
      hz = nhz;
      length += ang * c.radius;
    }
  }
  return { points: pts, end: { x: px, z: pz }, heading: { x: hx, z: hz }, length };
}

const flat = (): number => 0;

/** Total turning of a path in degrees (must be ~0 for a stretch). */
export function netTurn(path: PathCmd[]): number {
  return path.reduce((a, c) => a + ('turn' in c ? c.turn : 0), 0);
}

/** Returns a longer copy of `level`. The original is not modified. */
export function extendLevel(level: LevelDef, st: Stretch): LevelDef {
  if (Math.abs(netTurn(st.path)) > 0.5) throw new Error(`${level.id}: the stretch must end on its starting heading`);
  const oldRoad = new Road(level.road, flat);
  const oldLen = oldRoad.length;
  const pts = level.road.points;

  // Splice at the control point nearest the requested fraction (never the first or last two).
  const hit = createRoadHit();
  let i0 = 1;
  let best = Infinity;
  for (let i = 1; i < pts.length - 2; i++) {
    oldRoad.project(pts[i].x, pts[i].z, hit);
    const d = Math.abs(hit.s - st.at * oldLen);
    if (d < best) {
      best = d;
      i0 = i;
    }
  }
  const p0 = pts[i0];
  oldRoad.project(p0.x, p0.z, hit);
  const sIns = hit.s;
  const hx0 = pts[i0 + 1].x - pts[i0 - 1].x;
  const hz0 = pts[i0 + 1].z - pts[i0 - 1].z;
  const hl = Math.hypot(hx0, hz0) || 1;
  const walk = walkPath(p0, { x: hx0 / hl, z: hz0 / hl }, st.path);
  const dx = walk.end.x - p0.x;
  const dz = walk.end.z - p0.z;

  const points: RoadPointDef[] = [
    ...pts.slice(0, i0 + 1),
    ...walk.points,
    ...pts.slice(i0 + 1).map((p) => ({ ...p, x: p.x + dx, z: p.z + dz })),
  ];
  const road = { ...level.road, points };
  const newRoad = new Road(road, flat);
  const newLen = newRoad.length;
  const added = newLen - oldLen;

  const so = level.road.startOffset;
  const fo = level.road.finishOffset;
  const oldSpan = oldLen - so - fo;
  const newSpan = newLen - so - fo;
  const mapS = (s: number): number => (s <= sIns ? s : s + added);
  // Stretch fractions (stops, hazards, checkpoints) and whole-road fractions (landmarks, surfaces, ford).
  const mapStretch = (f: number): number => (mapS(so + f * oldSpan) - so) / newSpan;
  const mapWhole = (f: number): number => mapS(f * oldLen) / newLen;
  const stretchT = (t: number): number => (sIns + t * added - so) / newSpan;
  const wholeT = (t: number): number => (sIns + t * added) / newLen;
  const sortBy = <T extends { at: number }>(list: T[]): T[] => list.sort((a, b) => a.at - b.at);

  const landmarks: LandmarkDef[] = level.scenery.landmarks.map((l) => {
    if (l.pos) {
      oldRoad.project(l.pos.x, l.pos.z, hit);
      return hit.s > sIns ? { ...l, pos: { x: l.pos.x + dx, z: l.pos.z + dz } } : l;
    }
    return { ...l, at: mapWhole(l.at) };
  });
  for (const l of st.landmarks ?? []) {
    const { t, ...rest } = l;
    landmarks.push({ ...rest, at: wholeT(t) });
  }

  const checkpoints: CheckpointDef[] = sortBy([
    ...level.checkpoints.map((c) => ({ ...c, at: mapStretch(c.at) })),
    ...(st.checkpoints ?? []).map((c) => ({ at: stretchT(c.t), label: c.label })),
  ]);
  const stops: StopDef[] = sortBy([
    ...level.stops.map((s) => ({ ...s, at: mapStretch(s.at) })),
    ...(st.stops ?? []).map((s) => {
      const { t, ...rest } = s;
      return { ...rest, at: stretchT(t) } as StopDef;
    }),
  ]);
  const hazards: HazardDef[] = sortBy([
    ...level.hazards.map((h) => ({ ...h, at: mapStretch(h.at) })),
    ...(st.hazards ?? []).map((h) => {
      const { t, ...rest } = h;
      return { ...rest, at: stretchT(t) } as HazardDef;
    }),
  ]);

  // Terrain bounds: the original rectangle plus a 220 m margin around the new road (not the original's much
  // larger margins, which would make long diagonal missions pay for acres of empty ground).
  const bbox = (ps: RoadPointDef[]): { minX: number; maxX: number; minZ: number; maxZ: number } => ({
    minX: Math.min(...ps.map((p) => p.x)),
    maxX: Math.max(...ps.map((p) => p.x)),
    minZ: Math.min(...ps.map((p) => p.z)),
    maxZ: Math.max(...ps.map((p) => p.z)),
  });
  const nb = bbox(points);
  const b = level.terrain.bounds;
  const M = 220;
  const bounds = {
    minX: Math.floor(Math.min(b.minX, nb.minX - M)),
    maxX: Math.ceil(Math.max(b.maxX, nb.maxX + M)),
    minZ: Math.floor(Math.min(b.minZ, nb.minZ - M)),
    maxZ: Math.ceil(Math.max(b.maxZ, nb.maxZ + M)),
  };
  // Keep the ground mesh affordable: coarser cells when the rectangle gets big (about 80 k nodes at most).
  const nodes = ((bounds.maxX - bounds.minX) / level.terrain.cell) * ((bounds.maxZ - bounds.minZ) / level.terrain.cell);
  const cell = nodes > 80_000 ? Math.min(8, Math.ceil(level.terrain.cell * Math.sqrt(nodes / 80_000) * 2) / 2) : level.terrain.cell;
  const area = (x: { minX: number; maxX: number; minZ: number; maxZ: number }): number => (x.maxX - x.minX) * (x.maxZ - x.minZ);
  const grow = Math.pow(area(bounds) / area(b), 0.6);

  return {
    ...level,
    description: st.note ? `${level.description} ${st.note}` : level.description,
    startFuel: st.startFuel ?? level.startFuel,
    stops,
    hazards,
    checkpoints,
    surfaces: level.surfaces?.map((s) => ({ ...s, from: mapWhole(s.from), to: mapWhole(s.to) })),
    ford: level.ford ? { ...level.ford, from: mapWhole(level.ford.from), to: mapWhole(level.ford.to) } : undefined,
    rival: level.rival ? { ...level.rival, finishTime: st.rivalFinishTime ?? Math.round(level.rival.finishTime * (newSpan / oldSpan)) } : undefined,
    timeLimit: st.timeLimit,
    medals: st.medals,
    comfortMedals: st.comfortMedals ?? level.comfortMedals,
    road,
    terrain: { ...level.terrain, bounds, cell },
    scenery: {
      ...level.scenery,
      trees: Math.round(level.scenery.trees * grow),
      rocks: Math.round(level.scenery.rocks * grow),
      landmarks,
    },
    atmosphere: { ...level.atmosphere, mistStart: mapWhole(level.atmosphere.mistStart) },
  };
}

/** Diagnostics for authoring: where the new stretch sits and how close it comes to the rest of the road. */
export function stretchReport(level: LevelDef, st: Stretch): { added: number; minGap: number; minRadius: number; maxGrade: number } {
  const longer = extendLevel(level, st);
  const road = new Road(longer.road, flat);
  const old = new Road(level.road, flat);
  const added = road.length - old.length;
  // Gap between the new stretch and road that is far away along the road (> 120 m of road between samples).
  const hit = createRoadHit();
  const oldHit = createRoadHit();
  void oldHit;
  const ins = (() => {
    // The stretch occupies [sIns, sIns + added] on the new road; find sIns from the original road projection.
    const pts = level.road.points;
    let i0 = 1;
    let bestD = Infinity;
    for (let i = 1; i < pts.length - 2; i++) {
      old.project(pts[i].x, pts[i].z, hit);
      const d = Math.abs(hit.s - st.at * old.length);
      if (d < bestD) {
        bestD = d;
        i0 = i;
      }
    }
    old.project(pts[i0].x, pts[i0].z, hit);
    return hit.s;
  })();
  let minGap = Infinity;
  for (let i = 0; i < road.count; i += 2) {
    const s = road.ss[i];
    const inNew = s >= ins - 10 && s <= ins + added + 10;
    for (let j = 0; j < road.count; j += 3) {
      const t = road.ss[j];
      if (Math.abs(s - t) < 160) continue;
      const jn = t >= ins - 10 && t <= ins + added + 10;
      if (inNew === jn) continue; // only compare the new stretch against the rest of the road
      minGap = Math.min(minGap, Math.hypot(road.xs[i] - road.xs[j], road.zs[i] - road.zs[j]));
    }
  }
  // Smallest turning radius from three consecutive samples.
  let minRadius = Infinity;
  for (let i = 2; i < road.count - 2; i++) {
    const ax = road.xs[i - 2];
    const az = road.zs[i - 2];
    const bx = road.xs[i];
    const bz = road.zs[i];
    const cx = road.xs[i + 2];
    const cz = road.zs[i + 2];
    const ab = Math.hypot(bx - ax, bz - az);
    const bc = Math.hypot(cx - bx, cz - bz);
    const ac = Math.hypot(cx - ax, cz - az);
    const area2 = Math.abs((bx - ax) * (cz - az) - (bz - az) * (cx - ax));
    if (area2 > 1e-6) minRadius = Math.min(minRadius, (ab * bc * ac) / (2 * area2));
  }
  // Steepest grade over 4 samples, on the real terrain base (what the game will actually build).
  const real = new Road(longer.road, createRoadBase(longer.terrain));
  let maxGrade = 0;
  for (let i = 4; i < real.count; i++) {
    const d = Math.hypot(real.xs[i] - real.xs[i - 4], real.zs[i] - real.zs[i - 4]) || 1;
    maxGrade = Math.max(maxGrade, Math.abs(real.ys[i] - real.ys[i - 4]) / d);
  }
  return { added, minGap, minRadius, maxGrade };
}
