import type { RiverDef } from '../data/types';
import type { Road } from './Road';

export interface RiverPoint {
  x: number;
  z: number;
  /** Water surface height (m). */
  y: number;
}

/** A river centre line in world space, evenly resampled (about every STEP metres) and smoothed. */
export interface River {
  id: string;
  width: number;
  depth: number;
  bank: number;
  pts: RiverPoint[];
}

export const RIVER_STEP = 8;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Uniform Catmull-Rom between p1 and p2 (p0 and p3 are the neighbours). */
function spline(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/** Places each river's control points relative to the road and smooths them into an evenly sampled centre line. */
export function resolveRivers(defs: RiverDef[] | undefined, road: Road): River[] {
  const out: River[] = [];
  const pose = { x: 0, y: 0, z: 0, tx: 0, tz: -1 };
  for (const def of defs ?? []) {
    const ctl: RiverPoint[] = def.points.map((p) => {
      road.at(p.at * road.length, pose);
      return { x: pose.x - pose.tz * p.lateral, z: pose.z + pose.tx * p.lateral, y: pose.y - p.below };
    });
    if (ctl.length < 2) continue;
    const pts: RiverPoint[] = [];
    for (let i = 0; i < ctl.length - 1; i++) {
      const p0 = ctl[Math.max(0, i - 1)];
      const p1 = ctl[i];
      const p2 = ctl[i + 1];
      const p3 = ctl[Math.min(ctl.length - 1, i + 2)];
      const n = Math.max(2, Math.ceil(Math.hypot(p2.x - p1.x, p2.z - p1.z) / RIVER_STEP));
      for (let k = 0; k < n; k++) {
        const t = k / n;
        // Heights are interpolated linearly (and smoothed below), not splined, so the water never overshoots.
        pts.push({ x: spline(p0.x, p1.x, p2.x, p3.x, t), z: spline(p0.z, p1.z, p2.z, p3.z, t), y: lerp(p1.y, p2.y, t) });
      }
    }
    pts.push({ ...ctl[ctl.length - 1] });
    // The road's own ups and downs must not make the water jump: smooth the surface height along the river.
    for (let pass = 0; pass < 8; pass++) {
      const ys = pts.map((p) => p.y);
      for (let i = 1; i < pts.length - 1; i++) pts[i].y = 0.25 * ys[i - 1] + 0.5 * ys[i] + 0.25 * ys[i + 1];
    }
    out.push({ id: def.id, width: def.width, depth: def.depth, bank: def.bank ?? 12, pts });
  }
  return out;
}

export interface RiverNearest {
  /** Distance (m) to the centre line. */
  d: number;
  /** Water surface height there. */
  y: number;
  river: number;
}

/** Closest river centre line to a world point (brute force: a few hundred segments, so only call it a handful of times per frame). */
export function nearestRiver(rivers: River[], x: number, z: number, out: RiverNearest): RiverNearest {
  out.d = Infinity;
  out.y = 0;
  out.river = -1;
  for (let r = 0; r < rivers.length; r++) {
    const pts = rivers[r].pts;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const bx = b.x - a.x;
      const bz = b.z - a.z;
      const l2 = bx * bx + bz * bz || 1;
      let t = ((x - a.x) * bx + (z - a.z) * bz) / l2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const dx = a.x + bx * t - x;
      const dz = a.z + bz * t - z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < out.d) {
        out.d = d;
        out.y = lerp(a.y, b.y, t);
        out.river = r;
      }
    }
  }
  return out;
}
