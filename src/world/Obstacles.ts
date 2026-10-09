import type { ObstacleHit } from '../physics/types';

export interface ObstacleOptions {
  vx?: number;
  vz?: number;
  restitution?: number;
  /** 0..1: how much of the overlap is resolved by pushing the vehicle out (1 = immovable). */
  push?: number;
  /** Free-form tag for the owner ("boulder", "traffic", "creature"). */
  tag?: string;
}

/**
 * A small fixed-capacity set of circular obstacles on the ground plane. Hazards, traffic and creatures
 * register circles here; the vehicle body tests its corners against them. Capacity is bounded so physics
 * cost stays bounded.
 */
export class ObstacleSet {
  readonly capacity: number;
  readonly xs: Float32Array;
  readonly zs: Float32Array;
  readonly rs: Float32Array;
  readonly vxs: Float32Array;
  readonly vzs: Float32Array;
  readonly restitution: Float32Array;
  readonly push: Float32Array;
  readonly active: Uint8Array;
  readonly tags: string[];
  private count = 0;

  constructor(capacity = 64) {
    this.capacity = capacity;
    this.xs = new Float32Array(capacity);
    this.zs = new Float32Array(capacity);
    this.rs = new Float32Array(capacity);
    this.vxs = new Float32Array(capacity);
    this.vzs = new Float32Array(capacity);
    this.restitution = new Float32Array(capacity);
    this.push = new Float32Array(capacity);
    this.active = new Uint8Array(capacity);
    this.tags = new Array(capacity).fill('');
  }

  get size(): number {
    return this.count;
  }

  /** Adds an obstacle. Returns its id, or -1 when the set is full. */
  add(x: number, z: number, r: number, o: ObstacleOptions = {}): number {
    let id = -1;
    for (let i = 0; i < this.capacity; i++) {
      if (!this.active[i]) {
        id = i;
        break;
      }
    }
    if (id < 0) return -1;
    this.active[id] = 1;
    this.xs[id] = x;
    this.zs[id] = z;
    this.rs[id] = r;
    this.vxs[id] = o.vx ?? 0;
    this.vzs[id] = o.vz ?? 0;
    this.restitution[id] = o.restitution ?? 0.3;
    this.push[id] = o.push ?? 0.6;
    this.tags[id] = o.tag ?? '';
    this.count++;
    return id;
  }

  move(id: number, x: number, z: number, vx = 0, vz = 0): void {
    if (id < 0 || !this.active[id]) return;
    this.xs[id] = x;
    this.zs[id] = z;
    this.vxs[id] = vx;
    this.vzs[id] = vz;
  }

  remove(id: number): void {
    if (id < 0 || !this.active[id]) return;
    this.active[id] = 0;
    this.count--;
  }

  clear(): void {
    this.active.fill(0);
    this.count = 0;
  }

  /** Deepest overlap of the point with any active obstacle. */
  hit(x: number, z: number, out: ObstacleHit): boolean {
    let best = 0;
    let found = -1;
    for (let i = 0; i < this.capacity; i++) {
      if (!this.active[i]) continue;
      const dx = x - this.xs[i];
      const dz = z - this.zs[i];
      const r = this.rs[i];
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      const depth = r - Math.sqrt(d2);
      if (depth > best) {
        best = depth;
        found = i;
      }
    }
    if (found < 0) {
      out.depth = 0;
      out.id = -1;
      return false;
    }
    const dx = x - this.xs[found];
    const dz = z - this.zs[found];
    const l = Math.hypot(dx, dz) || 1;
    out.depth = best;
    out.nx = dx / l;
    out.nz = dz / l;
    out.vx = this.vxs[found];
    out.vz = this.vzs[found];
    out.restitution = this.restitution[found];
    out.push = this.push[found];
    out.id = found;
    return true;
  }

  /** Distance from a point to the nearest active obstacle edge (Infinity when none). */
  nearest(x: number, z: number): number {
    let best = Infinity;
    for (let i = 0; i < this.capacity; i++) {
      if (!this.active[i]) continue;
      best = Math.min(best, Math.hypot(x - this.xs[i], z - this.zs[i]) - this.rs[i]);
    }
    return best;
  }
}
