import { CatmullRomCurve3, Vector3 } from 'three';
import type { LevelDef } from '../data/types';
import { clamp, smoothstep } from '../core/math';

export interface RoadHit {
  /** Distance along the road (m), clamped to the road's extent. */
  s: number;
  /** Signed offset from the centre line, + = right of the direction of travel. */
  lateral: number;
  /** Euclidean distance to the nearest road point (m). */
  dist: number;
  /** Road surface height at the nearest point. */
  y: number;
  /** Unit tangent (XZ). */
  tx: number;
  tz: number;
  /** Signed overshoot beyond the start (<0) or end (>0) of the road, else 0. */
  over: number;
}

export const createRoadHit = (): RoadHit => ({
  s: 0,
  lateral: 0,
  dist: Infinity,
  y: 0,
  tx: 0,
  tz: -1,
  over: 0,
});

export interface BarrierHit {
  depth: number;
  /** Unit XZ normal pointing back toward the road. */
  nx: number;
  nz: number;
}

export interface RoadPose {
  x: number;
  y: number;
  z: number;
  tx: number;
  tz: number;
}

const SPACING = 2;
const CELL = 28;

/**
 * Spline road described by a handful of control points.
 * Samples are resampled at ~2 m spacing; a coarse spatial hash makes nearest-point queries cheap
 * enough to run several times per physics step.
 */
export class Road {
  readonly count: number;
  readonly xs: Float32Array;
  readonly ys: Float32Array;
  readonly zs: Float32Array;
  readonly tx: Float32Array;
  readonly tz: Float32Array;
  readonly ss: Float32Array;
  readonly length: number;
  readonly halfWidth: number;
  /** Lateral distance of the parapet's inner face. */
  readonly wallOffset: number;

  private readonly grid = new Map<number, number[]>();
  private readonly minX: number;
  private readonly minZ: number;
  private readonly stride: number;

  /**
   * @param base natural, smooth terrain height used to derive each control point's elevation
   */
  constructor(def: LevelDef['road'], base: (x: number, z: number) => number) {
    this.halfWidth = def.width / 2;
    this.wallOffset = this.halfWidth + def.shoulder;

    const pts = def.points.map((p) => new Vector3(p.x, base(p.x, p.z) + (p.dy ?? 0), p.z));
    const curve = new CatmullRomCurve3(pts, false, 'centripetal');
    curve.arcLengthDivisions = 4000;
    const total = curve.getLength();
    const n = Math.max(2, Math.ceil(total / SPACING) + 1);
    const samples = curve.getSpacedPoints(n - 1);

    this.count = samples.length;
    this.xs = new Float32Array(this.count);
    this.ys = new Float32Array(this.count);
    this.zs = new Float32Array(this.count);
    this.tx = new Float32Array(this.count);
    this.tz = new Float32Array(this.count);
    this.ss = new Float32Array(this.count);
    samples.forEach((p, i) => {
      this.xs[i] = p.x;
      this.ys[i] = p.y;
      this.zs[i] = p.z;
    });
    this.smoothHeights(9, 4);

    let acc = 0;
    for (let i = 0; i < this.count; i++) {
      if (i > 0) acc += Math.hypot(this.xs[i] - this.xs[i - 1], this.zs[i] - this.zs[i - 1]);
      this.ss[i] = acc;
      const a = Math.max(0, i - 1);
      const b = Math.min(this.count - 1, i + 1);
      const dx = this.xs[b] - this.xs[a];
      const dz = this.zs[b] - this.zs[a];
      const l = Math.hypot(dx, dz) || 1;
      this.tx[i] = dx / l;
      this.tz[i] = dz / l;
    }
    this.length = acc;

    let minX = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    for (let i = 0; i < this.count; i++) {
      minX = Math.min(minX, this.xs[i]);
      maxX = Math.max(maxX, this.xs[i]);
      minZ = Math.min(minZ, this.zs[i]);
    }
    this.minX = minX - CELL * 2;
    this.minZ = minZ - CELL * 2;
    this.stride = Math.ceil((maxX - minX + CELL * 4) / CELL) + 1;
    for (let i = 0; i < this.count; i++) {
      const key = this.cellKey(this.xs[i], this.zs[i]);
      let list = this.grid.get(key);
      if (!list) this.grid.set(key, (list = []));
      list.push(i);
    }
  }

  private smoothHeights(radius: number, passes: number): void {
    const tmp = new Float32Array(this.count);
    for (let p = 0; p < passes; p++) {
      for (let i = 0; i < this.count; i++) {
        let sum = 0;
        let w = 0;
        for (let k = -radius; k <= radius; k++) {
          const j = i + k;
          if (j < 0 || j >= this.count) continue;
          sum += this.ys[j];
          w++;
        }
        tmp[i] = sum / w;
      }
      this.ys.set(tmp);
    }
  }

  private cellKey(x: number, z: number): number {
    return Math.floor((x - this.minX) / CELL) + Math.floor((z - this.minZ) / CELL) * this.stride;
  }

  /** Finds the nearest road point. Returns false (and leaves `out.dist = Infinity`) if the road is far away. */
  project(x: number, z: number, out: RoadHit): boolean {
    const cx = Math.floor((x - this.minX) / CELL);
    const cz = Math.floor((z - this.minZ) / CELL);
    let best = -1;
    let bestD = Infinity;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const list = this.grid.get(cx + dx + (cz + dz) * this.stride);
        if (!list) continue;
        for (let k = 0; k < list.length; k++) {
          const i = list[k];
          const ex = this.xs[i] - x;
          const ez = this.zs[i] - z;
          const d = ex * ex + ez * ez;
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        }
      }
    }
    if (best < 0) {
      out.dist = Infinity;
      return false;
    }

    // Refine on the two segments touching the nearest sample.
    let bestSeg = -1;
    let bestT = 0;
    let segD = Infinity;
    for (let seg = best - 1; seg <= best; seg++) {
      if (seg < 0 || seg >= this.count - 1) continue;
      const ax = this.xs[seg];
      const az = this.zs[seg];
      const bx = this.xs[seg + 1] - ax;
      const bz = this.zs[seg + 1] - az;
      const l2 = bx * bx + bz * bz || 1;
      let t = ((x - ax) * bx + (z - az) * bz) / l2;
      // Allow unclamped extrapolation only at the road's two ends.
      const lo = seg === 0 ? -Infinity : 0;
      const hi = seg === this.count - 2 ? Infinity : 1;
      t = clamp(t, lo, hi);
      const tc = clamp(t, 0, 1);
      const px = ax + bx * tc - x;
      const pz = az + bz * tc - z;
      const d = px * px + pz * pz;
      if (d < segD) {
        segD = d;
        bestSeg = seg;
        bestT = t;
      }
    }
    if (bestSeg < 0) bestSeg = 0;

    const i0 = bestSeg;
    const i1 = bestSeg + 1;
    const segLen = this.ss[i1] - this.ss[i0] || 1;
    const tc = clamp(bestT, 0, 1);
    const ax = this.xs[i0];
    const az = this.zs[i0];
    const bx = this.xs[i1] - ax;
    const bz = this.zs[i1] - az;
    const bl = Math.hypot(bx, bz) || 1;
    const tx = bx / bl;
    const tz = bz / bl;
    const cxp = ax + bx * tc;
    const czp = az + bz * tc;
    const sRaw = this.ss[i0] + bestT * segLen;
    out.s = clamp(sRaw, 0, this.length);
    out.over = sRaw - out.s;
    out.y = this.ys[i0] + (this.ys[i1] - this.ys[i0]) * tc;
    out.tx = tx;
    out.tz = tz;
    // Offset measured from the (possibly extrapolated) centre line, + to the right of travel.
    const ox = x - (ax + bx * bestT);
    const oz = z - (az + bz * bestT);
    out.lateral = ox * -tz + oz * tx;
    out.dist = Math.hypot(x - cxp, z - czp);
    return true;
  }

  /** Brute-force distance and side of any point from the road (used for far-field terrain shaping at build time). */
  farLateral(x: number, z: number): { dist: number; lateral: number } {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < this.count; i++) {
      const ex = this.xs[i] - x;
      const ez = this.zs[i] - z;
      const d = ex * ex + ez * ez;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    const a = Math.max(0, best - 1);
    const b = Math.min(this.count - 1, best + 1);
    const tx = this.xs[b] - this.xs[a];
    const tz = this.zs[b] - this.zs[a];
    const l = Math.hypot(tx, tz) || 1;
    return { dist: Math.sqrt(bestD), lateral: ((x - this.xs[best]) * -tz + (z - this.zs[best]) * tx) / l };
  }

  private readonly tmpHit = createRoadHit();

  /** Parapet / end-cap collision test for a world point. */
  barrier(x: number, z: number, out: BarrierHit): boolean {
    const h = this.tmpHit;
    if (!this.project(x, z, h)) {
      out.depth = 0;
      return false;
    }
    if (h.over !== 0) {
      out.depth = Math.abs(h.over);
      const sgn = h.over > 0 ? -1 : 1;
      out.nx = h.tx * sgn;
      out.nz = h.tz * sgn;
      return true;
    }
    const lat = Math.abs(h.lateral);
    if (lat > this.wallOffset) {
      out.depth = lat - this.wallOffset;
      const sgn = h.lateral > 0 ? -1 : 1;
      out.nx = -h.tz * sgn;
      out.nz = h.tx * sgn;
      return true;
    }
    out.depth = 0;
    return false;
  }

  /** Position and heading at distance `s` along the road. */
  at(s: number, out: RoadPose): RoadPose {
    const sc = clamp(s, 0, this.length);
    let lo = 0;
    let hi = this.count - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.ss[mid] <= sc) lo = mid;
      else hi = mid;
    }
    const span = this.ss[hi] - this.ss[lo] || 1;
    const t = (sc - this.ss[lo]) / span;
    out.x = this.xs[lo] + (this.xs[hi] - this.xs[lo]) * t;
    out.y = this.ys[lo] + (this.ys[hi] - this.ys[lo]) * t;
    out.z = this.zs[lo] + (this.zs[hi] - this.zs[lo]) * t;
    const tx = this.tx[lo] + (this.tx[hi] - this.tx[lo]) * t;
    const tz = this.tz[lo] + (this.tz[hi] - this.tz[lo]) * t;
    const l = Math.hypot(tx, tz) || 1;
    out.tx = tx / l;
    out.tz = tz / l;
    return out;
  }

  /**
   * Lowers the road bed across a stretch (fractions of the road length) to make a ford. Must be called before
   * the terrain is built. Returns the water surface height and the stretch in metres.
   */
  carveFord(fromFrac: number, toFrac: number, depth: number): { fromS: number; toS: number; waterY: number; depth: number } {
    const fromS = fromFrac * this.length;
    const toS = toFrac * this.length;
    const ramp = 14;
    let waterY = 0;
    let n = 0;
    for (let i = 0; i < this.count; i++) {
      const s = this.ss[i];
      if (Math.abs(s - (fromS - ramp)) < 3 || Math.abs(s - (toS + ramp)) < 3) {
        waterY += this.ys[i];
        n++;
      }
    }
    waterY = n ? waterY / n - 0.04 : this.ys[0] - 0.04;
    for (let i = 0; i < this.count; i++) {
      const s = this.ss[i];
      const t = smoothstep(fromS - ramp, fromS, s) * (1 - smoothstep(toS, toS + ramp, s));
      this.ys[i] -= depth * t;
    }
    return { fromS, toS, waterY, depth };
  }

  /** Smallest turning radius found on the centre line (m), looking across ~`window` metres. */
  minRadius(window = 12): number {
    const k = Math.max(1, Math.round(window / SPACING));
    let min = Infinity;
    for (let i = k; i < this.count - k; i++) {
      const ax = this.xs[i - k];
      const az = this.zs[i - k];
      const bx = this.xs[i];
      const bz = this.zs[i];
      const cx = this.xs[i + k];
      const cz = this.zs[i + k];
      const area2 = Math.abs((bx - ax) * (cz - az) - (bz - az) * (cx - ax));
      if (area2 < 1e-6) continue;
      const a = Math.hypot(bx - ax, bz - az);
      const b = Math.hypot(cx - bx, cz - bz);
      const c = Math.hypot(cx - ax, cz - az);
      min = Math.min(min, (a * b * c) / (2 * area2));
    }
    return min;
  }

  /** Steepest longitudinal grade (rise/run). */
  maxGrade(): number {
    let g = 0;
    for (let i = 1; i < this.count; i++) {
      const run = this.ss[i] - this.ss[i - 1];
      if (run > 0) g = Math.max(g, Math.abs(this.ys[i] - this.ys[i - 1]) / run);
    }
    return g;
  }
}
