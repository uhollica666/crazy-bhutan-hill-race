import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  LinearMipmapLinearFilter,
  Mesh,
  MeshLambertMaterial,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  Uint32BufferAttribute,
} from 'three';
import type { Course } from '../world/Course';
import { fbm2, lerp, smoothstep } from '../core/math';
import { PAL } from './palette';

const _a = new Color();
const _b = new Color();
const _out = new Color();

/** Colours the grid by altitude, slope and distance from the road. */
function terrainColor(course: Course, i: number, j: number, out: Color): Color {
  const t = course.terrain;
  const k = i + j * t.nx;
  const h = t.heights[k];
  const ny = t.normals[k * 3 + 1];
  const x = t.minX + i * t.cell;
  const z = t.minZ + j * t.cell;
  const d = t.roadDist[k];

  const look = course.level.look;
  const rockColor = look.rock ?? PAL.rock;
  const patch = fbm2(x / 22, z / 22, 91, 2) * 0.5 + 0.5;
  _a.setHex(look.grassA ?? PAL.grassA);
  _b.setHex(look.grassB ?? PAL.grassB);
  out.copy(_a).lerp(_b, patch);

  // Alpine meadow and bare ground with altitude, snow on the high ground (all per-level).
  _a.setHex(look.meadow ?? PAL.meadow);
  out.lerp(_a, smoothstep(look.meadowFrom ?? 55, look.meadowTo ?? 110, h) * 0.8);
  const rockFrom = look.rockFrom ?? 105;
  _a.setHex(rockColor);
  out.lerp(_a, smoothstep(rockFrom, rockFrom + 45, h) * 0.9);
  const noise = fbm2(x / 30, z / 30, 5, 2) * 18;
  _a.setHex(PAL.snow);
  out.lerp(_a, smoothstep(look.snowFrom ?? 165, look.snowTo ?? 205, h + noise) * (look.snowMax ?? 1));

  // Steep faces are rock (snow slides off them).
  _a.setHex(rockColor);
  out.lerp(_a, smoothstep(0.86, 0.66, ny) * 0.85);

  // River banks.
  _a.setHex(PAL.sand);
  out.lerp(_a, smoothstep(t.waterLevel + 4, t.waterLevel + 0.5, h));

  // Road verge / cut banks.
  const verge = 1 - smoothstep(t.flatHalf - 0.5, t.flatHalf + 6, d);
  _a.setHex(PAL.dirt);
  out.lerp(_a, verge * 0.9);

  // Forest floor: where the trees stand thick the ground is darker and cooler, which also hides the seams
  // between the instanced trees and the terrain.
  const treeLine = look.treeLine ?? 122;
  const forest = fbm2(x / 55, z / 55, course.level.scenery.seed, 3) * 0.5 + 0.5;
  const canopy = smoothstep(0.4, 0.64, forest) * smoothstep(0.74, 0.86, ny) * (h < treeLine ? 1 : 0) * smoothstep(8, 22, d);
  _a.setHex(0x44552f);
  out.lerp(_a, canopy * 0.45);
  // Dry-grass and bare-earth patches break up the lawn look.
  const dry = smoothstep(0.55, 0.8, fbm2(x / 14, z / 14, 311, 3) * 0.5 + 0.5) * (1 - canopy) * (h < rockFrom ? 1 : 0);
  _a.setHex(0x9a8f58);
  out.lerp(_a, dry * 0.4);
  // Slightly muted overall, with fine grain so large faces never read as one flat colour.
  const lum = out.r * 0.3 + out.g * 0.59 + out.b * 0.11;
  out.r += (lum - out.r) * 0.12;
  out.g += (lum - out.g) * 0.12;
  out.b += (lum - out.b) * 0.12;
  out.multiplyScalar(0.9 + 0.2 * (fbm2(x / 5, z / 5, 733, 2) * 0.5 + 0.5));
  return out;
}

/** A small tiling grain texture: darkening speckles, blades and pebbles that give the ground a surface close up. */
function makeTerrainDetail(): CanvasTexture {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = '#f4f4f4';
  g.fillRect(0, 0, size, size);
  let seed = 12345;
  const rnd = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const wrap = (x: number, y: number, draw: (x: number, y: number) => void): void => {
    for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) draw(x + ox, y + oy);
  };
  for (let i = 0; i < 2600; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const v = 150 + Math.floor(rnd() * 90);
    g.fillStyle = `rgba(${v},${v},${v},0.55)`;
    const w = 1 + rnd() * 2.5;
    const h = 1 + rnd() * (i % 3 === 0 ? 7 : 2.5);
    wrap(x, y, (px, py) => g.fillRect(px, py, w, h));
  }
  for (let i = 0; i < 120; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const r = 2 + rnd() * 5;
    g.fillStyle = 'rgba(205,205,205,0.35)';
    wrap(x, y, (px, py) => {
      g.beginPath();
      g.arc(px, py, r, 0, 7);
      g.fill();
    });
  }
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  t.minFilter = LinearMipmapLinearFilter;
  return t;
}

export function buildTerrainMesh(course: Course): Mesh {
  const t = course.terrain;
  const n = t.nx * t.nz;
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  for (let j = 0; j < t.nz; j++) {
    for (let i = 0; i < t.nx; i++) {
      const k = i + j * t.nx;
      pos[k * 3] = t.minX + i * t.cell;
      pos[k * 3 + 1] = t.heights[k];
      pos[k * 3 + 2] = t.minZ + j * t.cell;
      nor[k * 3] = t.normals[k * 3];
      nor[k * 3 + 1] = t.normals[k * 3 + 1];
      nor[k * 3 + 2] = t.normals[k * 3 + 2];
      terrainColor(course, i, j, _out);
      col[k * 3] = _out.r;
      col[k * 3 + 1] = _out.g;
      col[k * 3 + 2] = _out.b;
    }
  }
  const idx = new Uint32Array((t.nx - 1) * (t.nz - 1) * 6);
  let w = 0;
  for (let j = 0; j < t.nz - 1; j++) {
    for (let i = 0; i < t.nx - 1; i++) {
      const a = i + j * t.nx;
      const b = a + 1;
      const c = a + t.nx;
      const d = c + 1;
      // Same triangulation as Terrain.heightAt: (a,c,b) and (b,c,d).
      idx[w++] = a;
      idx[w++] = c;
      idx[w++] = b;
      idx[w++] = b;
      idx[w++] = c;
      idx[w++] = d;
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new Float32BufferAttribute(col, 3));
  // World-space UVs for the fine detail texture (one repeat every 9 m).
  const uv = new Float32Array(n * 2);
  for (let k = 0; k < n; k++) {
    uv[k * 2] = pos[k * 3] / 9;
    uv[k * 2 + 1] = pos[k * 3 + 2] / 9;
  }
  geo.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  // Coarse index set (every 2nd node) for the Low preset: ~4x fewer terrain triangles, same vertices.
  const cidx: number[] = [];
  for (let j = 0; j + 2 < t.nz; j += 2) {
    for (let i = 0; i + 2 < t.nx; i += 2) {
      const a = i + j * t.nx;
      const b = a + 2;
      const c = a + 2 * t.nx;
      const d = c + 2;
      cidx.push(a, c, b, b, c, d);
    }
  }
  geo.setIndex(new Uint32BufferAttribute(idx, 1));
  geo.userData.fine = geo.index;
  geo.userData.coarse = new Uint32BufferAttribute(new Uint32Array(cidx), 1);
  geo.computeBoundingSphere();
  const mesh = new Mesh(geo, new MeshLambertMaterial({ vertexColors: true, flatShading: true, map: makeTerrainDetail() }));
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return mesh;
}

/** Switches between the full-resolution and coarse (Low quality) terrain triangulation. */
export function setTerrainCoarse(mesh: Mesh, coarse: boolean): void {
  const g = mesh.geometry;
  g.setIndex((coarse ? g.userData.coarse : g.userData.fine) as BufferAttribute);
}

export function buildWater(course: Course): Mesh {
  const b = course.level.terrain.bounds;
  const geo = new PlaneGeometry(b.maxX - b.minX, b.maxZ - b.minZ);
  geo.rotateX(-Math.PI / 2);
  const mesh = new Mesh(
    geo,
    new MeshLambertMaterial({ color: PAL.water, transparent: true, opacity: 0.82, flatShading: true }),
  );
  mesh.position.set((b.minX + b.maxX) / 2, course.terrain.waterLevel, (b.minZ + b.maxZ) / 2);
  mesh.name = 'water';
  return mesh;
}

function makeRoadTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#4a4745';
  g.fillRect(0, 0, 128, 256);
  // Surface grain.
  for (let i = 0; i < 1400; i++) {
    const v = 58 + Math.floor(Math.random() * 40);
    g.fillStyle = `rgba(${v},${v - 2},${v - 4},0.55)`;
    g.fillRect(Math.random() * 128, Math.random() * 256, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  // Edge lines (continuous) and centre line (dashed), painted like worn hill-road markings.
  g.fillStyle = '#ebe6d8';
  g.fillRect(7, 0, 4, 256);
  g.fillRect(117, 0, 4, 256);
  g.fillStyle = '#e8b53a';
  g.fillRect(62, 0, 4, 102);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapT = RepeatWrapping;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.anisotropy = 4;
  return tex;
}

/** Asphalt ribbon, gravel shoulders and stone parapets, built from the same road samples physics uses. */
export function buildRoadMeshes(course: Course): Group {
  const road = course.road;
  const terrain = course.terrain;
  const group = new Group();
  group.name = 'road';
  const hw = road.halfWidth;
  const wl = road.wallOffset;
  const n = road.count;
  const lift = 0.07;

  // Asphalt: 3 columns so the surface can follow the terrain grid across the width.
  {
    const cols = 3;
    const pos = new Float32Array(n * cols * 3);
    const uv = new Float32Array(n * cols * 2);
    for (let i = 0; i < n; i++) {
      const rx = -road.tz[i];
      const rz = road.tx[i];
      for (let c = 0; c < cols; c++) {
        const lat = lerp(-hw, hw, c / (cols - 1));
        const x = road.xs[i] + rx * lat;
        const z = road.zs[i] + rz * lat;
        const o = i * cols + c;
        pos[o * 3] = x;
        pos[o * 3 + 1] = terrain.heightAt(x, z) + lift;
        pos[o * 3 + 2] = z;
        uv[o * 2] = c / (cols - 1);
        uv[o * 2 + 1] = road.ss[i] / 10;
      }
    }
    const idx: number[] = [];
    for (let i = 0; i < n - 1; i++) {
      for (let c = 0; c < cols - 1; c++) {
        const a = i * cols + c;
        const b = a + 1;
        const d = a + cols;
        const e = d + 1;
        idx.push(a, b, d, b, e, d);
      }
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mat = new MeshLambertMaterial({
      map: makeRoadTexture(),
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const mesh = new Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.name = 'asphalt';
    group.add(mesh);
  }

  // Gravel shoulders (both sides, one geometry).
  {
    const pos: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    const gc = new Color(PAL.gravel);
    for (const side of [-1, 1]) {
      const base = pos.length / 3;
      for (let i = 0; i < n; i++) {
        const rx = -road.tz[i] * side;
        const rz = road.tx[i] * side;
        for (const lat of [hw - 0.05, wl + 0.2]) {
          const x = road.xs[i] + rx * lat;
          const z = road.zs[i] + rz * lat;
          pos.push(x, terrain.heightAt(x, z) + lift - 0.01, z);
          col.push(gc.r, gc.g, gc.b);
        }
      }
      for (let i = 0; i < n - 1; i++) {
        const a = base + i * 2;
        if (side > 0) idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        else idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new Mesh(geo, new MeshLambertMaterial({ vertexColors: true }));
    mesh.receiveShadow = true;
    mesh.name = 'shoulders';
    group.add(mesh);
  }

  // Parapets: a continuous low stone wall, limewashed in a repeating 4 m rhythm.
  {
    const pos: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    const stone = new Color(PAL.wall);
    const lime = new Color(PAL.wallPost);
    const height = 0.8;
    const thick = 0.5;
    const push = (x: number, y: number, z: number, c: Color): void => {
      pos.push(x, y, z);
      col.push(c.r, c.g, c.b);
    };
    for (const side of [-1, 1]) {
      const base = pos.length / 3;
      for (let i = 0; i < n; i++) {
        const rx = -road.tz[i] * side;
        const rz = road.tx[i] * side;
        const c = Math.floor(road.ss[i] / 4) % 2 === 0 ? stone : lime;
        // Inner face is at wl; wall rises from the verge height.
        const xi = road.xs[i] + rx * wl;
        const zi = road.zs[i] + rz * wl;
        const xo = road.xs[i] + rx * (wl + thick);
        const zo = road.zs[i] + rz * (wl + thick);
        const y0 = terrain.heightAt(xi, zi) + lift - 0.25;
        push(xi, y0, zi, c); // 0 inner bottom
        push(xi, y0 + height, zi, c); // 1 inner top
        push(xo, y0 + height, zo, c); // 2 outer top
        push(xo, y0 - 0.5, zo, c); // 3 outer bottom (sunk, hides gaps on slopes)
      }
      for (let i = 0; i < n - 1; i++) {
        const a = base + i * 4;
        const b = a + 4;
        const quad = (p: number, q: number, flip: boolean): void => {
          if (flip) idx.push(a + p, b + p, a + q, b + p, b + q, a + q);
          else idx.push(a + p, a + q, b + p, b + p, a + q, b + q);
        };
        const f = side < 0;
        quad(0, 1, f); // inner face
        quad(1, 2, f); // top
        quad(2, 3, f); // outer face
      }
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new Mesh(
      geo,
      new MeshLambertMaterial({ vertexColors: true, flatShading: true, side: DoubleSide }),
    );
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.name = 'parapets';
    group.add(mesh);
  }
  return group;
}

/** Shallow water lying across the road bed at a ford: a flat strip along the road, above the dipped bed. */
export function buildFordWater(course: Course): Mesh | null {
  const ford = course.ford;
  if (!ford) return null;
  const road = course.road;
  const half = road.wallOffset + 7;
  const from = Math.max(0, ford.fromS - 12);
  const to = Math.min(road.length, ford.toS + 12);
  const steps = Math.max(2, Math.ceil((to - from) / 3));
  const pos: number[] = [];
  const idx: number[] = [];
  const p = { x: 0, y: 0, z: 0, tx: 0, tz: -1 };
  for (let i = 0; i <= steps; i++) {
    road.at(from + ((to - from) * i) / steps, p);
    const rx = -p.tz;
    const rz = p.tx;
    pos.push(p.x - rx * half, ford.waterY, p.z - rz * half, p.x + rx * half, ford.waterY, p.z + rz * half);
    if (i > 0) {
      const a = (i - 1) * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new Mesh(
    geo,
    new MeshLambertMaterial({ color: PAL.water, transparent: true, opacity: 0.7, side: DoubleSide, depthWrite: false }),
  );
  mesh.name = 'ford-water';
  mesh.renderOrder = 2;
  return mesh;
}
