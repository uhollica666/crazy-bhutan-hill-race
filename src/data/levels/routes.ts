import type { RoadPointDef } from '../types';

export interface SwitchbackOptions {
  /** Where the first leg starts (x) and the z of the first leg. Legs climb toward -Z. */
  x0: number;
  z0: number;
  /** Half the leg length: legs run from -half to +half around x0. */
  halfLength: number;
  /** Distance between legs (= 2 x hairpin radius). */
  spacing: number;
  legs: number;
  /** Direction of the first leg: +1 east, -1 west. */
  firstDir: 1 | -1;
  /** Sideways wander (m) added mid-leg so legs are not ruler straight. */
  wobble?: number;
}

/** Generates control points for a zig-zag hill road: straight-ish legs joined by semicircular hairpins. */
export function switchbacks(o: SwitchbackOptions): RoadPointDef[] {
  const pts: RoadPointDef[] = [];
  const r = o.spacing / 2;
  const wob = o.wobble ?? 0;
  for (let i = 0; i < o.legs; i++) {
    const dir = (i % 2 === 0 ? o.firstDir : -o.firstDir) as 1 | -1;
    const z = o.z0 - i * o.spacing;
    const xa = o.x0 - dir * o.halfLength;
    const xb = o.x0 + dir * o.halfLength;
    const bend = (i % 2 === 0 ? 1 : -1) * wob;
    pts.push({ x: xa, z }, { x: o.x0, z: z + bend }, { x: xb, z });
    if (i < o.legs - 1) {
      // Semicircle around (xb, z - r), bulging in the direction of travel.
      for (let k = 1; k <= 5; k++) {
        const phi = (k * Math.PI) / 6;
        pts.push({ x: xb + dir * r * Math.sin(phi), z: z - r + r * Math.cos(phi) });
      }
    }
  }
  return pts;
}

/**
 * Turns a polyline of street corners into spline control points with rounded corners of the given radius.
 * Each interior vertex becomes entry / middle / exit points, so a 90 degree junction is a smooth bend.
 */
export function roundedPolyline(vertices: [number, number][], radius: number): RoadPointDef[] {
  const out: RoadPointDef[] = [{ x: vertices[0][0], z: vertices[0][1] }];
  for (let i = 1; i < vertices.length - 1; i++) {
    const [px, pz] = vertices[i - 1];
    const [vx, vz] = vertices[i];
    const [nx, nz] = vertices[i + 1];
    const al = Math.hypot(px - vx, pz - vz);
    const bl = Math.hypot(nx - vx, nz - vz);
    const ax = (px - vx) / al;
    const az = (pz - vz) / al;
    const bx = (nx - vx) / bl;
    const bz = (nz - vz) / bl;
    const theta = Math.acos(Math.max(-1, Math.min(1, ax * bx + az * bz)));
    const t = Math.min(radius / Math.tan(theta / 2), al / 2.2, bl / 2.2);
    const mx = ax + bx;
    const mz = az + bz;
    const ml = Math.hypot(mx, mz) || 1;
    const r = t * Math.tan(theta / 2);
    const mid = r / Math.sin(theta / 2) - r;
    out.push({ x: vx + ax * t, z: vz + az * t });
    out.push({ x: vx + (mx / ml) * mid, z: vz + (mz / ml) * mid });
    out.push({ x: vx + bx * t, z: vz + bz * t });
  }
  const last = vertices[vertices.length - 1];
  out.push({ x: last[0], z: last[1] });
  return out;
}
