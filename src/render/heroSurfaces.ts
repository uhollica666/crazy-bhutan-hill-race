import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GeoBuilder } from './geo';
import type { Place } from './geo';

/** Small bevels carry highlights at close garage distances without changing component bounds. */
export class HeroBuilder extends GeoBuilder {
  constructor(private readonly low: boolean) {
    super();
  }
  override box(w: number, h: number, d: number, color: number, p: Place = {}): this {
    if (this.low || Math.min(w, h, d) < 0.025) return super.box(w, h, d, color, p);
    return this.add(new RoundedBoxGeometry(w, h, d, 2, Math.min(w, h, d) * 0.18), color, p);
  }
}

/** Indexed parametric sheet; smooth shared normals, explicit winding, no overlapping closed prisms. */
export function surface(
  n: number,
  m: number,
  point: (u: number, v: number) => Vector3,
  reverse = false,
): BufferGeometry {
  const p: number[] = [],
    uv: number[] = [],
    indices: number[] = [];
  for (let j = 0; j <= m; j++)
    for (let i = 0; i <= n; i++) {
      const v = point(i / n, j / m);
      p.push(v.x, v.y, v.z);
      uv.push(i / n, j / m);
    }
  for (let j = 0; j < m; j++)
    for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i,
        b = a + 1,
        c = a + n + 1,
        d = c + 1;
      indices.push(...(reverse ? [a, c, b, b, c, d] : [a, b, c, b, d, c]));
    }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(p, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

/** Thin, gently crowned body panel. Rounded longitudinal shoulders avoid a flat slab highlight. */
export function crown(
  z0: number,
  z1: number,
  width: number,
  y0: number,
  y1: number,
  rise: number,
  low: boolean,
): BufferGeometry {
  const point = (u: number, v: number) => {
    const x = (u * 2 - 1) * width,
      z = z0 + (z1 - z0) * v;
    const taper = 1 - 0.06 * Math.pow(Math.abs(v * 2 - 1), 6);
    return new Vector3(
      x * taper,
      y0 + (y1 - y0) * v + rise * (1 - Math.pow(u * 2 - 1, 4)) + 0.018 * Math.sin(v * Math.PI),
      z,
    );
  };
  const parts = [surface(low ? 8 : 32, low ? 4 : 16, point, true)];
  const thickness = 0.075;
  for (const edge of [0, 1]) {
    parts.push(
      surface(low ? 8 : 32, 1, (u, v) => point(u, edge).add(new Vector3(0, -thickness * v, 0)), edge === 1),
    );
    parts.push(
      surface(low ? 4 : 16, 1, (u, v) => point(edge, u).add(new Vector3(0, -thickness * v, 0)), edge === 0),
    );
  }
  const geometry = mergeGeometries(parts)!;
  parts.forEach((g) => g.dispose());
  return geometry;
}

export function pane(a: Vector3, b: Vector3, c: Vector3, d: Vector3, reverse = false): BufferGeometry {
  return surface(4, 4, (u, v) => a.clone().lerp(b, u).lerp(d.clone().lerp(c, u), v), reverse);
}
