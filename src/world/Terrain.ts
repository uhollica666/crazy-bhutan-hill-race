import type { LevelDef } from '../data/types';
import { fbm2, lerp, smoothstep } from '../core/math';
import { Road, createRoadHit } from './Road';
import { nearestRiver } from './Rivers';
import type { River, RiverNearest } from './Rivers';

export interface GroundSample {
  height: number;
  nx: number;
  ny: number;
  nz: number;
}

export const createGroundSample = (): GroundSample => ({ height: 0, nx: 0, ny: 1, nz: 0 });

type TerrainDef = LevelDef['terrain'];

/** Smooth large-scale terrain used to derive road elevation (no rim, no fine detail). */
export function createRoadBase(t: TerrainDef): (x: number, z: number) => number {
  return (x, z) =>
    -t.slope * z +
    t.hillHeight * fbm2(x / 150, z / 150, t.seed, 2) -
    t.valleyDepth * smoothstep(t.valleyZ, t.valleyZ + 90, z) +
    (t.uplift ? t.uplift.height * (1 - smoothstep(0, t.uplift.radius, Math.hypot(x - t.uplift.x, z - t.uplift.z))) : 0);
}

/**
 * The single source of truth for ground height. Both the render mesh and the physics sample the same
 * pre-computed grid, using the same triangulation, so wheels never disagree with what the player sees.
 */
export class Terrain {
  readonly nx: number;
  readonly nz: number;
  readonly cell: number;
  readonly minX: number;
  readonly minZ: number;
  readonly heights: Float32Array;
  readonly normals: Float32Array;
  /** Distance from each node to the road (m), 999 when far. */
  readonly roadDist: Float32Array;
  readonly flatHalf: number;
  readonly blend = 18;
  readonly maxHeight: number;
  readonly minHeight: number;
  readonly waterLevel: number;
  /** Rivers carved into the ground (empty on most levels). */
  readonly rivers: River[];
  /** Distance (m) from each node to the nearest river centre line (999 when far); null without rivers. */
  readonly riverDist: Float32Array | null = null;
  private readonly road: Road;
  /** 0..1 per road sample: how much the road is carried on a bridge deck over the carved river bed there. */
  private readonly deckF: Float32Array | null = null;
  private readonly deckBoxes: { minX: number; maxX: number; minZ: number; maxZ: number }[] = [];
  private readonly deckHit = createRoadHit();
  private deckW = 0;
  private deckY = 0;
  private deckGx = 0;
  private deckGz = 0;

  constructor(
    private readonly def: TerrainDef,
    road: Road,
    rivers: River[] = [],
  ) {
    this.road = road;
    this.rivers = rivers;
    const b = def.bounds;
    this.cell = def.cell;
    this.minX = b.minX;
    this.minZ = b.minZ;
    this.nx = Math.floor((b.maxX - b.minX) / def.cell) + 1;
    this.nz = Math.floor((b.maxZ - b.minZ) / def.cell) + 1;
    this.flatHalf = road.wallOffset + 1.2;
    this.waterLevel = def.waterLevel;
    const n = this.nx * this.nz;
    this.heights = new Float32Array(n);
    this.normals = new Float32Array(n * 3);
    this.roadDist = new Float32Array(n);

    // Rivers: distance, water height and which river, per node (segment-major, so each segment only touches nearby nodes).
    let rd: Float32Array | null = null;
    let ry: Float32Array | null = null;
    let rid: Uint8Array | null = null;
    let deckPending: Float32Array | null = null;
    if (rivers.length) {
      rd = new Float32Array(n).fill(999);
      ry = new Float32Array(n);
      rid = new Uint8Array(n);
      rivers.forEach((r, ri) => {
        const reach = r.width / 2 + r.bank + this.cell;
        for (let p = 0; p < r.pts.length - 1; p++) {
          const a = r.pts[p];
          const b = r.pts[p + 1];
          const i0 = Math.max(0, Math.floor((Math.min(a.x, b.x) - reach - this.minX) / this.cell));
          const i1 = Math.min(this.nx - 1, Math.ceil((Math.max(a.x, b.x) + reach - this.minX) / this.cell));
          const j0 = Math.max(0, Math.floor((Math.min(a.z, b.z) - reach - this.minZ) / this.cell));
          const j1 = Math.min(this.nz - 1, Math.ceil((Math.max(a.z, b.z) + reach - this.minZ) / this.cell));
          const bx = b.x - a.x;
          const bz = b.z - a.z;
          const l2 = bx * bx + bz * bz || 1;
          for (let j = j0; j <= j1; j++) {
            for (let i = i0; i <= i1; i++) {
              const x = this.minX + i * this.cell;
              const z = this.minZ + j * this.cell;
              const t = Math.min(1, Math.max(0, ((x - a.x) * bx + (z - a.z) * bz) / l2));
              const dx = a.x + bx * t - x;
              const dz = a.z + bz * t - z;
              const d = Math.sqrt(dx * dx + dz * dz);
              const k = i + j * this.nx;
              if (d < rd![k]) {
                rd![k] = d;
                ry![k] = a.y + (b.y - a.y) * t;
                rid![k] = ri;
              }
            }
          }
        }
      });
      this.riverDist = rd;
      // Where the road crosses (or hugs) a river it is carried on a bridge deck above the carved bed.
      const cnt = road.count;
      const f = new Float32Array(cnt);
      const near: RiverNearest = { d: 0, y: 0, river: -1 };
      for (let i = 0; i < cnt; i++) {
        nearestRiver(rivers, road.xs[i], road.zs[i], near);
        if (near.river < 0) continue;
        const r = rivers[near.river];
        f[i] = 1 - smoothstep(r.width / 2, r.width / 2 + r.bank, near.d);
      }
      deckPending = f;
    }

    const base = createRoadBase(def);
    // A long mountain descent: the land falls away with the road. The road's height above the plain terrain is sampled every ~100 m and
    // blended (inverse distance) into the ground, so the road runs along a slope instead of sinking into a trench.
    let follow: ((x: number, z: number) => number) | null = null;
    if (def.followRoad) {
      const px: number[] = [];
      const pz: number[] = [];
      const pr: number[] = [];
      const stepI = Math.max(1, Math.round(100 / (road.ss[1] - road.ss[0] || 2)));
      for (let i = 0; i < road.count; i += stepI) {
        px.push(road.xs[i]);
        pz.push(road.zs[i]);
        pr.push(road.ys[i] - base(road.xs[i], road.zs[i]));
      }
      const strength = def.followRoad;
      follow = (x, z) => {
        let sw = 0;
        let sr = 0;
        for (let q = 0; q < px.length; q++) {
          const dx = x - px[q];
          const dz = z - pz[q];
          const d2 = dx * dx + dz * dz;
          if (d2 > 810000) continue;
          const q2 = d2 + 3600;
          const w = 1 / (q2 * Math.sqrt(q2));
          sw += w;
          sr += w * pr[q];
        }
        return sw > 0 ? (sr / sw) * strength : 0;
      };
    }
    const cx = (b.minX + b.maxX) / 2;
    const cz = (b.minZ + b.maxZ) / 2;
    const hx = (b.maxX - b.minX) / 2;
    const hz = (b.maxZ - b.minZ) / 2;
    const natural = (x: number, z: number): number => {
      const nd = Math.max(Math.abs(x - cx) / hx, Math.abs(z - cz) / hz);
      const rim = 150 * smoothstep(0.76, 1, nd) ** 1.5;
      const detail =
        def.detailHeight *
        (fbm2(x / 42, z / 42, def.seed + 5, 3) + 0.35 * fbm2(x / 15, z / 15, def.seed + 9, 2));
      return base(x, z) + detail + rim;
    };

    const hit = createRoadHit();
    let max = -Infinity;
    let min = Infinity;
    for (let j = 0; j < this.nz; j++) {
      for (let i = 0; i < this.nx; i++) {
        const x = this.minX + i * this.cell;
        const z = this.minZ + j * this.cell;
        let h = natural(x, z) + (follow ? follow(x, z) : 0);
        let d = 999;
        const dr = def.drop;
        if (dr) {
          const far = road.farLateral(x, z);
          if (!dr.side || Math.sign(far.lateral) === dr.side) h -= dr.depth * smoothstep(dr.start, dr.start + dr.width, far.dist);
        }
        if (road.project(x, z, hit)) {
          d = hit.dist;
          if (d < this.flatHalf + this.blend) {
            const t = smoothstep(this.flatHalf, this.flatHalf + this.blend, d);
            h = lerp(hit.y - 0.03, h, t);
          }
        }
        const k = i + j * this.nx;
        // Rivers: a rounded bed under the water, and a sloping bank that rises to just above the surface and then eases into the land.
        if (rd && rd[k] < 999) {
          const rv = rivers[rid![k]];
          const hw = rv.width / 2;
          if (rd[k] < hw) {
            const u = rd[k] / hw;
            h = ry![k] - rv.depth * (1 - u * u);
          } else if (rd[k] < hw + rv.bank) {
            h = lerp(ry![k] + 0.25, h, smoothstep(hw, hw + rv.bank, rd[k]));
          }
        }
        this.heights[k] = h;
        this.roadDist[k] = d;
        if (h > max) max = h;
        if (h < min) min = h;
      }
    }
    this.maxHeight = max;
    this.minHeight = min;
    if (deckPending) {
      // A road is on a deck wherever the carved bed is lower than the road surface, however far the river centre is: the distance
      // weight alone leaves a deep gorge only partly bridged, with the bed (not the deck) under the wheels.
      const f = deckPending;
      const cnt = road.count;
      let any = false;
      for (let i = 0; i < cnt; i++) {
        const drop = road.ys[i] - this.gridHeightAt(road.xs[i], road.zs[i]);
        if (drop > 0.15) f[i] = Math.max(f[i], smoothstep(0.15, 0.6, drop));
      }
      // Bridge the small gaps where a single sample sits level with a shallow bed, so a deck never flickers off mid-span.
      const wide = f.slice();
      for (let i = 0; i < cnt; i++) {
        let m = wide[i];
        for (let q = Math.max(0, i - 8); q <= Math.min(cnt - 1, i + 8) && m < 1; q++) m = Math.max(m, wide[q]);
        f[i] = m;
        if (m > 0.01) any = true;
      }
        if (any) {
          this.deckF = f;
          const pad = road.wallOffset + 6;
          let start = -1;
          let last = -1;
          const close = (): void => {
            if (start < 0) return;
            let minX = Infinity;
            let maxX = -Infinity;
            let minZ = Infinity;
            let maxZ = -Infinity;
            for (let q = start; q <= last; q++) {
              minX = Math.min(minX, road.xs[q]);
              maxX = Math.max(maxX, road.xs[q]);
              minZ = Math.min(minZ, road.zs[q]);
              maxZ = Math.max(maxZ, road.zs[q]);
            }
            this.deckBoxes.push({ minX: minX - pad, maxX: maxX + pad, minZ: minZ - pad, maxZ: maxZ + pad });
            start = -1;
          };
          for (let i = 0; i < cnt; i++) {
            if (f[i] > 0.01) {
              if (start < 0) start = i;
              last = i;
            } else if (start >= 0 && i - last > 4) close();
          }
          close();
        }
    }

    for (let j = 0; j < this.nz; j++) {
      for (let i = 0; i < this.nx; i++) {
        const hl = this.heights[Math.max(i - 1, 0) + j * this.nx];
        const hr = this.heights[Math.min(i + 1, this.nx - 1) + j * this.nx];
        const hd = this.heights[i + Math.max(j - 1, 0) * this.nx];
        const hu = this.heights[i + Math.min(j + 1, this.nz - 1) * this.nx];
        const gx = hl - hr;
        const gz = hd - hu;
        const gy = 2 * this.cell;
        const l = Math.hypot(gx, gy, gz);
        const k = (i + j * this.nx) * 3;
        this.normals[k] = gx / l;
        this.normals[k + 1] = gy / l;
        this.normals[k + 2] = gz / l;
      }
    }
  }

  get bounds(): TerrainDef['bounds'] {
    return this.def.bounds;
  }

  /** Height from the triangulated grid, identical to the render mesh, but with the road carried level over a river (a bridge deck). */
  heightAt(x: number, z: number): number {
    const g = this.gridHeightAt(x, z);
    return this.deckBoxes.length && this.deckBlend(x, z) ? g + (this.deckY - g) * this.deckW : g;
  }

  /** True (and fills the deck fields) when a point lies on a bridge deck: the road surface, not the river bed below it. */
  private deckBlend(x: number, z: number): boolean {
    let inside = false;
    for (const b of this.deckBoxes) {
      if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) {
        inside = true;
        break;
      }
    }
    if (!inside) return false;
    const road = this.road;
    const h = this.deckHit;
    if (!road.project(x, z, h) || h.over !== 0) return false;
    const i = Math.min(road.count - 1, Math.max(0, Math.round((h.s / road.length) * (road.count - 1))));
    const f = this.deckF![i];
    if (f <= 0.001) return false;
    const w = f * (1 - smoothstep(road.wallOffset, road.wallOffset + 1.5, Math.abs(h.lateral)));
    if (w <= 0.001) return false;
    const i0 = Math.max(0, i - 1);
    const i1 = Math.min(road.count - 1, i + 1);
    const g = (road.ys[i1] - road.ys[i0]) / (road.ss[i1] - road.ss[i0] || 1);
    this.deckW = w;
    this.deckY = h.y;
    this.deckGx = h.tx * g;
    this.deckGz = h.tz * g;
    return true;
  }

  /** True within `margin` metres of a river's centre line (trees and rocks keep out of the channel). */
  nearRiver(x: number, z: number, margin: number): boolean {
    const rd = this.riverDist;
    if (!rd) return false;
    const i = Math.min(this.nx - 1, Math.max(0, Math.round((x - this.minX) / this.cell)));
    const j = Math.min(this.nz - 1, Math.max(0, Math.round((z - this.minZ) / this.cell)));
    return rd[i + j * this.nx] < margin;
  }

  private gridHeightAt(x: number, z: number): number {
    let fx = (x - this.minX) / this.cell;
    let fz = (z - this.minZ) / this.cell;
    fx = fx < 0 ? 0 : fx > this.nx - 1.0001 ? this.nx - 1.0001 : fx;
    fz = fz < 0 ? 0 : fz > this.nz - 1.0001 ? this.nz - 1.0001 : fz;
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const u = fx - i;
    const v = fz - j;
    const k = i + j * this.nx;
    const a = this.heights[k];
    const b = this.heights[k + 1];
    const c = this.heights[k + this.nx];
    const d = this.heights[k + this.nx + 1];
    // Mesh triangles are (a,c,b) and (b,c,d): split on the b-c diagonal.
    return u + v <= 1 ? a + u * (b - a) + v * (c - a) : d + (1 - u) * (c - d) + (1 - v) * (b - d);
  }

  /** Height plus a smoothly interpolated normal, for suspension. */
  groundAt(x: number, z: number, out: GroundSample): void {
    out.height = this.gridHeightAt(x, z);
    const deck = this.deckBoxes.length > 0 && this.deckBlend(x, z);
    if (deck) out.height += (this.deckY - out.height) * this.deckW;
    let fx = (x - this.minX) / this.cell;
    let fz = (z - this.minZ) / this.cell;
    fx = fx < 0 ? 0 : fx > this.nx - 1.0001 ? this.nx - 1.0001 : fx;
    fz = fz < 0 ? 0 : fz > this.nz - 1.0001 ? this.nz - 1.0001 : fz;
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const u = fx - i;
    const v = fz - j;
    const k = (i + j * this.nx) * 3;
    const s = this.nx * 3;
    const w00 = (1 - u) * (1 - v);
    const w10 = u * (1 - v);
    const w01 = (1 - u) * v;
    const w11 = u * v;
    const n = this.normals;
    let X = n[k] * w00 + n[k + 3] * w10 + n[k + s] * w01 + n[k + s + 3] * w11;
    let Y = n[k + 1] * w00 + n[k + 4] * w10 + n[k + s + 1] * w01 + n[k + s + 4] * w11;
    let Z = n[k + 2] * w00 + n[k + 5] * w10 + n[k + s + 2] * w01 + n[k + s + 5] * w11;
    let l = Math.hypot(X, Y, Z) || 1;
    X /= l;
    Y /= l;
    Z /= l;
    if (deck) {
      // On a bridge deck the surface normal follows the road's grade, not the river bed beneath.
      const dl = Math.hypot(this.deckGx, 1, this.deckGz);
      const w = this.deckW;
      X += (-this.deckGx / dl - X) * w;
      Y += (1 / dl - Y) * w;
      Z += (-this.deckGz / dl - Z) * w;
      l = Math.hypot(X, Y, Z) || 1;
      X /= l;
      Y /= l;
      Z /= l;
    }
    out.nx = X;
    out.ny = Y;
    out.nz = Z;
  }
}
