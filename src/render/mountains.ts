import { BufferGeometry, Color, Float32BufferAttribute, Vector3 } from 'three';
import { fbm2, lerp } from '../core/math';

export interface MountainLayer {
  /** Distance from the centre of the playable area (m). */
  radius: number;
  /** Angular columns (more = finer silhouette). */
  columns: number;
  /** Peak height above the base plane (m) and how much it varies. */
  base: number;
  amp: number;
  /** 0..1 how much atmospheric haze covers this layer (far layers are hazier). */
  haze: number;
  seed: number;
}

export interface MountainStyle {
  forest: number;
  rock: number;
  snow: number;
  haze: number;
  /** Direction towards the sun (unit). */
  sun: Vector3;
  /** Share of the peak above which snow lies (0..1); high = bare mountains. */
  snowLine: number;
}

/**
 * A ring of faceted mountain ranges around the level: forested foothills, bare rock, snow caps. Built from
 * fractal ridged noise, lit with baked sun shading and fogged per layer, so it is a single unlit draw call that
 * reads as real mountains rather than a row of cones.
 */
export function buildMountainRing(cx: number, cz: number, layers: MountainLayer[], style: MountainStyle): BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const c = new Color();
  const rockC = new Color(style.rock);
  const forestC = new Color(style.forest);
  const snowC = new Color(style.snow);
  const hazeC = new Color(style.haze);
  const n = new Vector3();
  const a = new Vector3();
  const b = new Vector3();
  const d = new Vector3();

  const tri = (p0: Vector3, p1: Vector3, p2: Vector3, kind: number, hazeK: number): void => {
    a.subVectors(p1, p0);
    b.subVectors(p2, p0);
    n.crossVectors(a, b).normalize();
    // The viewer is inside the ring: wind every face to look inward.
    d.set(cx - p0.x, 0, cz - p0.z);
    let q1 = p1;
    let q2 = p2;
    if (n.dot(d) < 0) {
      n.negate();
      q1 = p2;
      q2 = p1;
    }
    const lit = 0.6 + 0.55 * Math.max(0, n.dot(style.sun));
    if (kind === 0) c.copy(forestC);
    else if (kind === 1) c.copy(forestC).lerp(rockC, 0.5);
    else if (kind === 2) c.copy(rockC);
    else c.copy(snowC);
    // Facet-to-facet variation keeps neighbouring faces from merging into one flat colour.
    c.multiplyScalar(lit * (0.9 + 0.2 * ((Math.abs(Math.sin(p0.x * 0.013 + p0.z * 0.021)) * 7) % 1)));
    c.lerp(hazeC, hazeK);
    for (const p of [p0, q1, q2]) {
      pos.push(p.x, p.y, p.z);
      col.push(c.r, c.g, c.b);
    }
  };

  for (const L of layers) {
    const N = L.columns;
    const heights: number[] = [];
    for (let i = 0; i < N; i++) {
      const th = (i / N) * Math.PI * 2;
      const u = Math.cos(th) * 3.1;
      const w = Math.sin(th) * 3.1;
      const ridge = 1 - Math.abs(fbm2(u + L.seed, w, L.seed, 4));
      const massif = fbm2(u * 0.45 + 17, w * 0.45, L.seed + 9, 2) * 0.5 + 0.5;
      heights.push(L.base + L.amp * (Math.pow(ridge, 2.2) * (0.5 + 0.7 * massif)));
    }
    const rowsAt = (i: number): Vector3[] => {
      const th = (i / N) * Math.PI * 2;
      const j = fbm2(i * 0.9, L.seed, L.seed + 3, 2);
      const r = L.radius + j * L.radius * 0.06;
      const x = cx + Math.cos(th) * r;
      const z = cz + Math.sin(th) * r;
      const h = heights[i % N];
      const snowAt = h * style.snowLine;
      const foot = -60;
      const forestTop = Math.min(h * 0.34, 120 + L.base * 0.12);
      const rockTop = Math.max(forestTop + 10, snowAt * 0.98);
      const shoulder = lerp(forestTop, rockTop, 0.5) + fbm2(i * 1.7, L.seed, 4, 2) * h * 0.05;
      return [
        new Vector3(x, foot, z),
        new Vector3(x, forestTop, z),
        new Vector3(x + Math.cos(th) * 18, shoulder, z + Math.sin(th) * 18),
        new Vector3(x, h * 0.98 > rockTop ? Math.max(rockTop, h * 0.85) : rockTop, z),
        new Vector3(x + Math.cos(th) * -10, h, z + Math.sin(th) * -10),
      ];
    };
    let prev = rowsAt(0);
    const first = prev;
    for (let i = 1; i <= N; i++) {
      const cur = i === N ? first : rowsAt(i);
      for (let r = 0; r < 4; r++) {
        const kind = r === 0 ? 0 : r === 1 ? 1 : r === 2 ? 2 : 3;
        const hazeK = L.haze;
        tri(prev[r], prev[r + 1], cur[r], kind, hazeK);
        tri(cur[r], prev[r + 1], cur[r + 1], kind, hazeK);
      }
      prev = cur;
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}
