import type { LevelDef } from '../data/types';
import { fbm2, lerp, smoothstep } from '../core/math';
import { Road, createRoadHit } from './Road';

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
    t.valleyDepth * smoothstep(t.valleyZ, t.valleyZ + 90, z);
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

  constructor(
    private readonly def: TerrainDef,
    road: Road,
  ) {
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

    const base = createRoadBase(def);
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
        let h = natural(x, z);
        let d = 999;
        if (road.project(x, z, hit)) {
          d = hit.dist;
          if (d < this.flatHalf + this.blend) {
            const t = smoothstep(this.flatHalf, this.flatHalf + this.blend, d);
            h = lerp(hit.y - 0.03, h, t);
          }
        }
        const k = i + j * this.nx;
        this.heights[k] = h;
        this.roadDist[k] = d;
        if (h > max) max = h;
        if (h < min) min = h;
      }
    }
    this.maxHeight = max;
    this.minHeight = min;

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

  /** Height from the triangulated grid, identical to the render mesh. */
  heightAt(x: number, z: number): number {
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
    out.height = this.heightAt(x, z);
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
    const l = Math.hypot(X, Y, Z) || 1;
    X /= l;
    Y /= l;
    Z /= l;
    out.nx = X;
    out.ny = Y;
    out.nz = Z;
  }
}
