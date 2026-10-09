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
