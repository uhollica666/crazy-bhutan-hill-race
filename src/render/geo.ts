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

  add(source: BufferGeometry, color: number, p: Place = {}, preserveColors = false): this {
    const geo = source.index ? source.toNonIndexed() : source.clone();
    source.dispose();
    geo.deleteAttribute('uv');
    _e.set(p.rx ?? 0, p.ry ?? 0, p.rz ?? 0);
    _q.setFromEuler(_e);
    _p.set(p.x ?? 0, p.y ?? 0, p.z ?? 0);
    _s.set(p.sx ?? 1, p.sy ?? 1, p.sz ?? 1);
    _m.compose(_p, _q, _s);
    geo.applyMatrix4(_m);
    if (!geo.getAttribute('normal')) geo.computeVertexNormals();
    _c.setHex(color);
    const n = geo.getAttribute('position').count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      col[i * 3] = _c.r;
      col[i * 3 + 1] = _c.g;
      col[i * 3 + 2] = _c.b;
    }
    if (!preserveColors || !geo.getAttribute('color')) geo.setAttribute('color', new Float32BufferAttribute(col, 3));
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
    const geometry=new IcosahedronGeometry(1,1),positions=geometry.getAttribute('position');
    for(let i=0;i<positions.count;i++) {
      const x=positions.getX(i),y=positions.getY(i),z=positions.getZ(i);
      const stratum=1+0.14*Math.sin(x*8+z*5)+0.09*Math.cos(y*12-z*3);
      positions.setXYZ(i,x*stratum, y*(0.91+0.12*Math.sin(x*6+z*4)),z*stratum);
    }
    geometry.computeVertexNormals();
    return this.add(geometry, color, p);
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
/** Rounded rectangular sections with smooth side normals and separate flat end caps. */
export function loft(rings: Ring[]): BufferGeometry {
  const points:number[]=[],indices:number[]=[];
  const count=20;
  for(const [z,w,b,t] of rings) {
    const r=Math.min(0.19,(t-b)*0.32,w*0.18);
    for(const [cx,cy,angle] of [[w-r,b+r,-Math.PI/2],[w-r,t-r,0],[-w+r,t-r,Math.PI/2],[-w+r,b+r,Math.PI]])
      for(let j=0;j<=4;j++){const a=angle+j*Math.PI/8;points.push(cx+Math.cos(a)*r,cy+Math.sin(a)*r,z);}
  }
  for(let row=0;row<rings.length-1;row++)for(let i=0;i<count;i++) {
    const a=row*count+i,b=row*count+(i+1)%count,c=b+count,d=a+count;indices.push(a,b,c,a,c,d);
  }
  for(const end of [0,rings.length-1]) {
    const offset=points.length/3;
    for(let i=0;i<count;i++)points.push(...points.slice((end*count+i)*3,(end*count+i)*3+3));
    for(let i=1;i<count-1;i++)if(end===0)indices.push(offset,offset+i+1,offset+i);else indices.push(offset,offset+i,offset+i+1);
  }
  const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(points,3));g.setIndex(indices);g.computeVertexNormals();return g;
}
