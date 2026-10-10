import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  LinearMipmapLinearFilter,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  Sphere,
  Uint32BufferAttribute,
  Vector3,
} from 'three';
import type { Object3D } from 'three';
import type { Course } from '../world/Course';
import type { SurfaceId } from '../data/types';
import { fbm2, lerp, smoothstep } from '../core/math';
import { PAL } from './palette';
import { surfaceRelief } from './surfaceRelief';

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

  // River banks: pale shingle at the water's edge, damp stones in the channel.
  const rd = t.riverDist ? t.riverDist[k] : 999;
  if (rd < 999) {
    _a.setHex(0xa79d86);
    out.lerp(_a, (1 - smoothstep(9, 19, rd)) * 0.75);
    _a.setHex(0x6f6a60);
    out.lerp(_a, (1 - smoothstep(3, 8, rd)) * 0.7);
  }

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

export function buildTerrainMesh(course: Course): Group {
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
  // World-space UVs for the fine detail texture (one repeat every 9 m).
  const uv = new Float32Array(n * 2);
  for (let k = 0; k < n; k++) {
    uv[k * 2] = pos[k * 3] / 9;
    uv[k * 2 + 1] = pos[k * 3 + 2] / 9;
  }
  // One shared set of vertices, drawn as square tiles. Each tile is its own mesh with its own bounding sphere, so
  // the renderer culls the tiles outside the view instead of drawing the whole (now much larger) ground every frame.
  const position = new Float32BufferAttribute(pos, 3);
  const normal = new Float32BufferAttribute(nor, 3);
  const color = new Float32BufferAttribute(col, 3);
  const uvAttr = new Float32BufferAttribute(uv, 2);
  const grain = surfaceRelief('terrain', true);
  const material = new MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0,
    map: makeTerrainDetail(), bumpMap: grain, bumpScale: 0.055, roughnessMap: grain });
  const group = new Group();
  group.name = 'terrain';
  const TILE = 64; // cells per side (even, so the Low preset's every-second-node triangulation lines up)
  for (let tj = 0; tj < t.nz - 1; tj += TILE) {
    for (let ti = 0; ti < t.nx - 1; ti += TILE) {
      const iMax = Math.min(ti + TILE, t.nx - 1);
      const jMax = Math.min(tj + TILE, t.nz - 1);
      const fine: number[] = [];
      const coarse: number[] = [];
      for (let j = tj; j < jMax; j++) {
        for (let i = ti; i < iMax; i++) {
          const a = i + j * t.nx;
          const b = a + 1;
          const c = a + t.nx;
          const d = c + 1;
          // Same triangulation as Terrain.heightAt: (a,c,b) and (b,c,d).
          fine.push(a, c, b, b, c, d);
        }
      }
      for (let j = tj; j < jMax; j += 2) {
        for (let i = ti; i < iMax; i += 2) {
          const sx=Math.min(2,iMax-i),sz=Math.min(2,jMax-j);
          let nearRoad=sx<2||sz<2;
          for(let dz=0;dz<=sz;dz++)for(let dx=0;dx<=sx;dx++) {
            const k=i+dx+(j+dz)*t.nx;
            if(t.roadDist[k]<t.flatHalf+t.blend+t.cell*2||(t.riverDist&&t.riverDist[k]<20))nearRoad=true;
          }
          // Keep collision-matching terrain beside roads and river banks even on Low.
          if(nearRoad)for(let dz=0;dz<sz;dz++)for(let dx=0;dx<sx;dx++) {
            const a=i+dx+(j+dz)*t.nx,b=a+1,c=a+t.nx,d=c+1;
            coarse.push(a,c,b,b,c,d);
          } else {
            const a=i+j*t.nx,b=a+2,c=a+2*t.nx,d=c+2;
            coarse.push(a,c,b,b,c,d);
          }
        }
      }
      const geo = new BufferGeometry();
      geo.setAttribute('position', position);
      geo.setAttribute('normal', normal);
      geo.setAttribute('color', color);
      geo.setAttribute('uv', uvAttr);
      geo.setIndex(new Uint32BufferAttribute(new Uint32Array(fine), 1));
      geo.userData.fine = geo.index;
      geo.userData.coarse = new Uint32BufferAttribute(new Uint32Array(coarse), 1);
      // Bounding sphere of just this tile (the default would cover every vertex of the whole terrain).
      let lo = Infinity;
      let hi = -Infinity;
      for (let j = tj; j <= jMax; j++) {
        for (let i = ti; i <= iMax; i++) {
          const h = t.heights[i + j * t.nx];
          if (h < lo) lo = h;
          if (h > hi) hi = h;
        }
      }
      const cx = t.minX + ((ti + iMax) / 2) * t.cell;
      const cz = t.minZ + ((tj + jMax) / 2) * t.cell;
      const half = ((iMax - ti) / 2) * t.cell;
      const halfZ = ((jMax - tj) / 2) * t.cell;
      geo.boundingSphere = new Sphere(new Vector3(cx, (lo + hi) / 2, cz), Math.hypot(half, halfZ, (hi - lo) / 2) + 1);
      const mesh = new Mesh(geo, material);
      mesh.receiveShadow = true;
      mesh.name = 'terrain-tile';
      group.add(mesh);
    }
  }
  return group;
}

/** Switches every terrain tile between the full-resolution and coarse (Low quality) triangulation. */
export function setTerrainCoarse(terrain: Object3D, coarse: boolean): void {
  terrain.traverse((o) => {
    const g = (o as Mesh).geometry as BufferGeometry | undefined;
    if (g?.userData.fine) g.setIndex((coarse ? g.userData.coarse : g.userData.fine) as BufferAttribute);
  });
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

function makeRoadTexture(mode: boolean | 'worn' | 'frost' = false): CanvasTexture {
  const wet = mode === true;
  const worn = mode === 'worn';
  const frost = mode === 'frost';
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = wet ? '#34393d' : worn ? '#5b5853' : '#4a4745';
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
  if (worn) {
    // Old tarmac: faded paint, dark repair patches, a web of cracks and bare aggregate showing through.
    g.fillStyle = 'rgba(96,92,86,0.55)';
    g.fillRect(7, 0, 4, 256);
    g.fillRect(117, 0, 4, 256);
    g.fillRect(62, 0, 4, 102);
    for (let i = 0; i < 9; i++) {
      g.fillStyle = 'rgba(' + (40 + Math.random() * 14) + ',' + (38 + Math.random() * 12) + ',' + (36 + Math.random() * 12) + ',0.7)';
      g.fillRect(14 + Math.random() * 80, Math.random() * 240, 18 + Math.random() * 30, 10 + Math.random() * 24);
    }
    for (let i = 0; i < 380; i++) {
      const v = 120 + Math.floor(Math.random() * 70);
      g.fillStyle = 'rgba(' + v + ',' + (v - 4) + ',' + (v - 10) + ',0.5)';
      g.fillRect(Math.random() * 128, Math.random() * 256, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
    g.strokeStyle = 'rgba(24,24,26,0.7)';
    g.lineWidth = 1.1;
    for (let i = 0; i < 16; i++) {
      g.beginPath();
      let x = 12 + Math.random() * 100;
      let y = Math.random() * 256;
      g.moveTo(x, y);
      for (let k = 0; k < 4; k++) {
        x += (Math.random() - 0.5) * 18;
        y += 6 + Math.random() * 14;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  }
  if (frost) {
    // Frost on cold tarmac: white crystals in the surface, pale glazed patches, the paint half hidden.
    g.fillStyle = 'rgba(210,225,235,0.35)';
    g.fillRect(7, 0, 4, 256);
    g.fillRect(117, 0, 4, 256);
    for (let i = 0; i < 22; i++) {
      g.fillStyle = 'rgba(220,235,245,' + (0.12 + Math.random() * 0.2) + ')';
      g.beginPath();
      g.ellipse(14 + Math.random() * 100, Math.random() * 256, 5 + Math.random() * 16, 3 + Math.random() * 10, Math.random() * 3, 0, Math.PI * 2);
      g.fill();
    }
    for (let i = 0; i < 700; i++) {
      g.fillStyle = 'rgba(245,250,255,' + (0.35 + Math.random() * 0.45) + ')';
      g.fillRect(Math.random() * 128, Math.random() * 256, 1 + Math.random() * 1.6, 1 + Math.random() * 1.6);
    }
  }
  if (wet) {
    // Damp, weathered tarmac: darker, with pale reflective streaks and patched cracks.
    for (let i = 0; i < 16; i++) {
      g.fillStyle = 'rgba(170,200,215,' + (0.08 + Math.random() * 0.12) + ')';
      g.fillRect(14 + Math.random() * 96, Math.random() * 256, 3 + Math.random() * 10, 16 + Math.random() * 40);
    }
    g.strokeStyle = 'rgba(20,22,24,0.55)';
    g.lineWidth = 1.2;
    for (let i = 0; i < 9; i++) {
      g.beginPath();
      const x = 14 + Math.random() * 96;
      const y = Math.random() * 256;
      g.moveTo(x, y);
      g.lineTo(x + (Math.random() - 0.5) * 30, y + 10 + Math.random() * 26);
      g.stroke();
    }
  }
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapT = RepeatWrapping;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.anisotropy = 4;
  return tex;
}

/** Tiling texture for an unpaved road surface: dirt with wheel ruts, loose gravel, broken rock or wet mud. */
function makeUnpavedTexture(kind: 'dirt' | 'gravel' | 'rocky' | 'mud' | 'ice'): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d')!;
  const base = { dirt: '#8c6f48', gravel: '#9a9084', rocky: '#6d675f', mud: '#4a3727', ice: '#c9dce8' }[kind];
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 256);
  // Large soft patches so the surface is never one flat colour.
  for (let i = 0; i < 46; i++) {
    const v = kind === 'mud' ? 30 + Math.random() * 26 : 90 + Math.random() * 70;
    const tint = kind === 'dirt' ? [v, v * 0.78, v * 0.5] : kind === 'mud' ? [v * 1.1, v * 0.85, v * 0.6] : [v, v * 0.97, v * 0.92];
    g.fillStyle = 'rgba(' + tint.map((x) => Math.floor(x)).join(',') + ',0.35)';
    g.beginPath();
    g.ellipse(Math.random() * 128, Math.random() * 256, 8 + Math.random() * 18, 6 + Math.random() * 16, Math.random() * 3, 0, Math.PI * 2);
    g.fill();
  }
  if (kind === 'ice') {
    // Frost: pale blue sheets, white rime and fine dark cracks, with the grey road showing through.
    for (let i = 0; i < 40; i++) {
      g.fillStyle = 'rgba(' + (150 + Math.random() * 70) + ',' + (190 + Math.random() * 50) + ',255,0.4)';
      g.fillRect(Math.random() * 128, Math.random() * 256, 8 + Math.random() * 30, 6 + Math.random() * 30);
    }
    g.strokeStyle = 'rgba(70,95,120,0.6)';
    g.lineWidth = 1;
    for (let i = 0; i < 26; i++) {
      g.beginPath();
      const x = Math.random() * 128;
      const y = Math.random() * 256;
      g.moveTo(x, y);
      g.lineTo(x + (Math.random() - 0.5) * 40, y + (Math.random() - 0.5) * 40);
      g.stroke();
    }
    g.fillStyle = 'rgba(70,72,76,0.45)';
    g.fillRect(34, 0, 12, 256);
    g.fillRect(84, 0, 12, 256);
  }
  const specks = kind === 'gravel' ? 1700 : kind === 'rocky' ? 520 : kind === 'ice' ? 300 : 900;
  for (let i = 0; i < specks; i++) {
    const light = Math.random() < 0.5;
    const v = light ? 150 + Math.random() * 90 : 30 + Math.random() * 40;
    const size = kind === 'rocky' ? 3 + Math.random() * 7 : 1 + Math.random() * 3;
    g.fillStyle = 'rgba(' + Math.floor(v) + ',' + Math.floor(v * 0.96) + ',' + Math.floor(v * 0.9) + ',' + (kind === 'mud' ? 0.25 : 0.6) + ')';
    if (kind === 'rocky') {
      const x = Math.random() * 128;
      const y = Math.random() * 256;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + size, y + size * 0.3);
      g.lineTo(x + size * 0.6, y + size);
      g.lineTo(x - size * 0.4, y + size * 0.7);
      g.closePath();
      g.fill();
    } else {
      g.fillRect(Math.random() * 128, Math.random() * 256, size, size);
    }
  }
  if (kind === 'dirt' || kind === 'mud') {
    // Two wheel ruts and a grassy crown, so it reads as a track rather than a road.
    g.fillStyle = kind === 'mud' ? 'rgba(20,14,9,0.55)' : 'rgba(60,42,24,0.42)';
    g.fillRect(34, 0, 14, 256);
    g.fillRect(82, 0, 14, 256);
    if (kind === 'mud') {
      g.fillStyle = 'rgba(150,175,190,0.35)';
      for (let i = 0; i < 9; i++) g.fillRect(34 + Math.random() * 60, Math.random() * 256, 10 + Math.random() * 12, 3);
    }
    g.fillStyle = 'rgba(88,104,52,0.38)';
    g.fillRect(58, 0, 12, 256);
  }
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.anisotropy = 4;
  return tex;
}

/** Soft ripple texture for puddles and fords. */
function makeWaterTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#6a93a6';
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 26; i++) {
    g.strokeStyle = 'rgba(' + (190 + Math.random() * 60) + ',235,255,' + (0.18 + Math.random() * 0.25) + ')';
    g.lineWidth = 1 + Math.random() * 1.5;
    g.beginPath();
    const x = Math.random() * 128;
    const y = Math.random() * 128;
    g.ellipse(x, y, 6 + Math.random() * 18, 2 + Math.random() * 4, 0, 0, Math.PI * 2);
    g.stroke();
  }
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  return tex;
}

/** Snow, packed snow and slush: white drifts or grey-brown slush with the wheel ruts showing the road or the mud beneath. */
function makeSnowTexture(kind: 'snow' | 'packed' | 'slush'): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = { snow: '#eef3f6', packed: '#d2dade', slush: '#979fa2' }[kind];
  g.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 60; i++) {
    const light = Math.random() < 0.5;
    g.fillStyle = light ? 'rgba(255,255,255,0.45)' : kind === 'slush' ? 'rgba(70,64,56,0.28)' : 'rgba(150,172,192,0.28)';
    g.beginPath();
    g.ellipse(Math.random() * 128, Math.random() * 256, 8 + Math.random() * 20, 6 + Math.random() * 16, Math.random() * 3, 0, Math.PI * 2);
    g.fill();
  }
  // Two wheel ruts: dark and clear on packed snow and slush, a faint hollow in fresh snow.
  g.fillStyle = kind === 'slush' ? 'rgba(52,46,40,0.55)' : kind === 'packed' ? 'rgba(108,116,122,0.55)' : 'rgba(176,192,204,0.5)';
  g.fillRect(34, 0, 14, 256);
  g.fillRect(82, 0, 14, 256);
  if (kind === 'slush') {
    g.fillStyle = 'rgba(190,205,214,0.4)';
    for (let i = 0; i < 14; i++) g.fillRect(30 + Math.random() * 70, Math.random() * 256, 8 + Math.random() * 14, 3);
  }
  for (let i = 0; i < 520; i++) {
    const v = kind === 'slush' ? 40 + Math.random() * 60 : 215 + Math.random() * 40;
    g.fillStyle = 'rgba(' + Math.floor(v) + ',' + Math.floor(v) + ',' + Math.floor(v + 6) + ',' + (kind === 'slush' ? 0.35 : 0.6) + ')';
    g.fillRect(Math.random() * 128, Math.random() * 256, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapT = RepeatWrapping;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.anisotropy = 4;
  return tex;
}

const unpavedKind = (id: SurfaceId): 'dirt' | 'gravel' | 'rocky' | 'mud' | 'ice' | 'wet' | 'worn' | 'frost' | 'snow' | 'packed' | 'slush' | null =>
  id === 'frost' || id === 'snow' || id === 'packed' || id === 'slush' ? id : id === 'worn' ? 'worn' : id === 'dirt' || id === 'grass' ? 'dirt' : id === 'gravel' ? 'gravel' : id === 'rocky' ? 'rocky' : id === 'mud' ? 'mud' : id === 'ice' ? 'ice' : id === 'wetAsphalt' ? 'wet' : null;

/** Asphalt ribbon, gravel shoulders and stone parapets, built from the same road samples physics uses. */
export function buildRoadMeshes(course: Course): Group {
  const road = course.road;
  const terrain = course.terrain;
  const group = new Group();
  group.name = 'road';
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
        const lat = lerp(-road.hws[i], road.hws[i], c / (cols - 1));
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
    // One index range per surface, so the ribbon is drawn as asphalt, dirt, gravel, rock or mud where the level says so.
    const kinds: (string | null)[] = ['asphalt'];
    const buckets: number[][] = [[]];
    for (let i = 0; i < n - 1; i++) {
      const k = unpavedKind(course.roadSurfaceAtSample(i));
      let bi = kinds.indexOf(k);
      if (bi < 0) {
        bi = kinds.push(k) - 1;
        buckets.push([]);
      }
      const idx = buckets[bi];
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
    const all: number[] = [];
    buckets.forEach((b, bi) => {
      geo.addGroup(all.length, b.length, bi);
      for (const v of b) all.push(v);
    });
    geo.setIndex(all);
    geo.computeVertexNormals();
    const mats = kinds.map((k) => {
      const relief = surfaceRelief(k ?? 'asphalt');
      const wet = k === 'wet' || k === 'mud' || k === 'slush' || k === 'ice';
      return new MeshStandardMaterial({
        map: k === 'asphalt' || k === null ? makeRoadTexture() : k === 'wet' ? makeRoadTexture(true) : k === 'worn' ? makeRoadTexture('worn') : k === 'frost' ? makeRoadTexture('frost') : k === 'snow' || k === 'packed' || k === 'slush' ? makeSnowTexture(k) : makeUnpavedTexture(k as 'dirt' | 'gravel' | 'rocky' | 'mud' | 'ice'),
        bumpMap: relief, roughnessMap: relief,
        bumpScale: k === 'rocky' ? 0.085 : k === 'gravel' ? 0.055 : k === 'ice' ? 0.006 : 0.018,
        roughness: wet ? 0.48 : 1, metalness: 0,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      });
    });
    const mesh = new Mesh(geo, mats);
    mesh.receiveShadow = true;
    mesh.name = 'road-surface';
    group.add(mesh);
  }

  // Gravel shoulders (both sides, one geometry).
  {
    const pos: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    const gc = new Color(course.level.look.shoulder ?? PAL.gravel);
    for (const side of [-1, 1]) {
      const base = pos.length / 3;
      for (let i = 0; i < n; i++) {
        const rx = -road.tz[i] * side;
        const rz = road.tx[i] * side;
        for (const lat of [road.hws[i] - 0.05, road.wls[i] + 0.2]) {
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
        const wi = road.wls[i];
        const xi = road.xs[i] + rx * wi;
        const zi = road.zs[i] + rz * wi;
        const xo = road.xs[i] + rx * (wi + thick);
        const zo = road.zs[i] + rz * (wi + thick);
        const y0 = terrain.heightAt(xi, zi) + lift - 0.25;
        push(xi, y0, zi, c); // 0 inner bottom
        push(xi, y0 + height, zi, c); // 1 inner top
        push(xo, y0 + height, zo, c); // 2 outer top
        push(xo, y0 - 0.5, zo, c); // 3 outer bottom (sunk, hides gaps on slopes)
      }
      for (let i = 0; i < n - 1; i++) {
        // A gap in the parapet where a side street joins the road.
        if (road.inOpening(road.ss[i], side)) continue;
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
    const relief=surfaceRelief('rocky');
    const uv:number[]=[];for(let i=0;i<pos.length;i+=3)uv.push((pos[i]+pos[i+2])/5,pos[i+1]/2);
    geo.setAttribute('uv',new Float32BufferAttribute(uv,2));
    const mesh = new Mesh(geo,new MeshStandardMaterial({vertexColors:true,roughness:0.91,bumpMap:relief,bumpScale:0.06,roughnessMap:relief,side:DoubleSide}));
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
  // Ripples run along the road; the strip's UVs follow the road so the texture flows with the current.
  const uv: number[] = [];
  for (let i = 0; i <= steps; i++) uv.push(0, i * 0.5, 4, i * 0.5);
  geo.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  const mesh = new Mesh(
    geo,
    new MeshStandardMaterial({ roughness: 0.2, metalness: 0.05, map: makeWaterTexture(), color: 0xbfe0ee, transparent: true, opacity: 0.74, side: DoubleSide, depthWrite: false }),
  );
  mesh.name = 'ford-water';
  mesh.renderOrder = 2;
  return mesh;
}

/** Side streets joining the main road (asphalt strips on the ground) and zebra crossings (white bars across it). */
export function buildJunctions(course: Course): Group | null {
  if (!course.junctions.length && !course.zebras.length) return null;
  const group = new Group();
  group.name = 'junctions';
  const road = course.road;
  const terrain = course.terrain;
  const pose = { x: 0, y: 0, z: 0, tx: 0, tz: -1 };
  const lift = 0.085;

  if (course.junctions.length) {
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    for (const j of course.junctions) {
      road.at(j.s, pose);
      const rx = -pose.tz;
      const rz = pose.tx;
      const halfW = j.width / 2;
      for (const side of j.sides) {
        const from = road.halfWidthAtS(j.s) - 0.4;
        const to = road.wallAtS(j.s) + j.arm;
        const steps = Math.max(2, Math.ceil((to - from) / 5));
        const base = pos.length / 3;
        for (let k = 0; k <= steps; k++) {
          const lat = from + ((to - from) * k) / steps;
          const cx = pose.x + rx * side * lat;
          const cz = pose.z + rz * side * lat;
          for (const e of [-1, 1]) {
            const x = cx + pose.tx * halfW * e;
            const z = cz + pose.tz * halfW * e;
            pos.push(x, terrain.heightAt(x, z) + lift, z);
            uv.push(e < 0 ? 0 : 1, lat / 10);
          }
          if (k > 0) {
            const a = base + (k - 1) * 2;
            idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
          }
        }
      }
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mat = new MeshLambertMaterial({ map: makeRoadTexture(), side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    const mesh = new Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.name = 'side-streets';
    group.add(mesh);
  }

  if (course.zebras.length) {
    const pos: number[] = [];
    const idx: number[] = [];
    for (const s of course.zebras) {
      road.at(s, pose);
      const rx = -pose.tz;
      const rz = pose.tx;
      const hw = road.halfWidthAtS(s);
      for (let lat = -hw + 0.7; lat <= hw - 0.5; lat += 1.15) {
        const base = pos.length / 3;
        for (const [da, dl] of [
          [-1.7, -0.3],
          [-1.7, 0.3],
          [1.7, 0.3],
          [1.7, -0.3],
        ] as [number, number][]) {
          const x = pose.x + pose.tx * da + rx * (lat + dl);
          const z = pose.z + pose.tz * da + rz * (lat + dl);
          pos.push(x, terrain.heightAt(x, z) + lift + 0.012, z);
        }
        idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mat = new MeshBasicMaterial({ color: 0xf4f2ea, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 });
    const mesh = new Mesh(geo, mat);
    mesh.name = 'zebras';
    group.add(mesh);
  }
  return group;
}

/** Shallow puddles lying on the road: flat rippled discs just above the surface (physics: Course.surfaceIdAt -> water). */
export function buildPuddles(course: Course): Group | null {
  if (!course.puddles.length) return null;
  const group = new Group();
  group.name = 'puddles';
  const tex = makeWaterTexture();
  const mat = new MeshStandardMaterial({ roughness: 0.17, metalness: 0.05, map: tex, color: 0xa3c3cc, transparent: true, opacity: 0.78, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const geo = new CircleGeometry(1, 28);
  geo.rotateX(-Math.PI / 2);
  // Potholes: dark broken ground, no sheen.
  const holeMat = new MeshLambertMaterial({ color: 0x2b2a28, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const p = { x: 0, y: 0, z: 0, tx: 0, tz: -1 };
  for (const pd of course.puddles) {
    course.road.at(pd.s, p);
    const x = p.x - p.tz * pd.lateral;
    const z = p.z + p.tx * pd.lateral;
    const mesh = new Mesh(geo, pd.pothole ? holeMat : mat);
    mesh.position.set(x, course.terrain.heightAt(x, z) + 0.1, z);
    mesh.rotation.y = Math.atan2(p.tx, p.tz);
    mesh.scale.set(pd.r, 1, pd.r * 1.35);
    mesh.renderOrder = 2;
    group.add(mesh);
  }
  return group;
}
