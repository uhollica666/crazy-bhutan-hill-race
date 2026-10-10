import {
  BoxGeometry,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  Float32BufferAttribute,
  IcosahedronGeometry,
  Matrix4,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three';
import { Color } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _m = new Matrix4();
const _q = new Quaternion();
const _e = new Euler();
const _p = new Vector3();
const _s = new Vector3();
const _c = new Color();

export interface Place {
  x?: number;
  y?: number;
  z?: number;
  rx?: number;
  ry?: number;
  rz?: number;
  sx?: number;
  sy?: number;
  sz?: number;
}

/**
 * Collects flat-coloured primitives into ONE vertex-coloured geometry, so a whole house / chorten /
 * tree is a single draw call (and an InstancedMesh of them is still a single draw call).
 */
export class GeoBuilder {
  private readonly parts: BufferGeometry[] = [];

  add(source: BufferGeometry, color: number, p: Place = {}): this {
    const geo = source.index ? source.toNonIndexed() : source.clone();
    source.dispose();
    geo.deleteAttribute('uv');
    _e.set(p.rx ?? 0, p.ry ?? 0, p.rz ?? 0);
    _q.setFromEuler(_e);
    _p.set(p.x ?? 0, p.y ?? 0, p.z ?? 0);
    _s.set(p.sx ?? 1, p.sy ?? 1, p.sz ?? 1);
    _m.compose(_p, _q, _s);
    geo.applyMatrix4(_m);
    geo.computeVertexNormals();
    _c.setHex(color);
    const n = geo.getAttribute('position').count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      col[i * 3] = _c.r;
      col[i * 3 + 1] = _c.g;
      col[i * 3 + 2] = _c.b;
    }
    geo.setAttribute('color', new Float32BufferAttribute(col, 3));
    this.parts.push(geo);
    return this;
  }

  box(w: number, h: number, d: number, color: number, p: Place = {}): this {
    return this.add(new BoxGeometry(w, h, d), color, p);
  }

  /** Square-ish frustum (a box that tapers): bottom/top are edge lengths. */
  frustum(bottom: number, top: number, h: number, color: number, p: Place = {}): this {
    const k = Math.SQRT1_2;
    return this.add(new CylinderGeometry(top * k, bottom * k, h, 4, 1), color, {
      ...p,
      ry: (p.ry ?? 0) + Math.PI / 4,
    });
  }

  cylinder(rTop: number, rBottom: number, h: number, color: number, segs = 8, p: Place = {}): this {
    return this.add(new CylinderGeometry(rTop, rBottom, h, segs, 1), color, p);
  }

  cone(r: number, h: number, color: number, segs = 7, p: Place = {}): this {
    return this.add(new ConeGeometry(r, h, segs, 1), color, p);
  }

  sphere(r: number, color: number, p: Place = {}, segs = 8): this {
    return this.add(new SphereGeometry(r, segs, Math.max(4, segs - 2)), color, p);
  }

  rock(color: number, p: Place = {}): this {
    return this.add(new IcosahedronGeometry(1, 0), color, p);
  }

  /** Adds a quad lying in the XY plane, centred at the origin. */
  quad(w: number, h: number, color: number, p: Place = {}): this {
    const g = new BufferGeometry();
    const x = w / 2;
    const y = h / 2;
    g.setAttribute(
      'position',
      new Float32BufferAttribute([-x, -y, 0, x, -y, 0, x, y, 0, -x, -y, 0, x, y, 0, -x, y, 0], 3),
    );
    g.setAttribute('uv', new Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1], 2));
    return this.add(g, color, p);
  }

  build(): BufferGeometry {
    const merged = mergeGeometries(this.parts, false);
    this.parts.forEach((g) => g.dispose());
    this.parts.length = 0;
    if (!merged) throw new Error('GeoBuilder: nothing to merge');
    merged.computeBoundingSphere();
    return merged;
  }
}

export type Ring = [z: number, halfWidth: number, bottom: number, top: number];
/** Chamfered eight-point sections produce a continuous shoulder, bonnet and tapered roof. */
export function loft(rings: Ring[]): BufferGeometry {
  const points: number[][] = [];
  for (const [z, w, b, t] of rings) {
    const c = Math.min(0.09, (t - b) * 0.2);
    points.push([-w + c, b, z], [w - c, b, z], [w, b + c, z], [w, t - c, z],
      [w - c, t, z], [-w + c, t, z], [-w, t - c, z], [-w, b + c, z]);
  }
  const pos: number[] = [];
  const tri = (a: number, b: number, c: number): void => { pos.push(...points[a], ...points[b], ...points[c]); };
  for (let r = 0; r < rings.length - 1; r++) for (let i = 0; i < 8; i++) {
    const a = r * 8 + i, b = r * 8 + (i + 1) % 8, c = b + 8, d = a + 8;
    tri(a, b, c); tri(a, c, d);
  }
  for (let i = 1; i < 7; i++) { tri(0, i + 1, i); const k = points.length - 8; tri(k, k + i, k + i + 1); }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

