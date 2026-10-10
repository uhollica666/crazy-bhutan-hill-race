import {
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  Quaternion,
  RepeatWrapping,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { mulberry32 } from '../core/math';
import type { Course } from '../world/Course';

const UP = new Vector3(0, 1, 0);
const MAX_ROCKS = 180;
/** Flow speed of the surface pattern (texture repeats per second along the river). */
const FLOW = 0.16;

/** Soft streaks that run along the current, with pale foam flecks. Tiles along V (the river's length). */
export function makeFlowTexture(): CanvasTexture {
  const w = 128;
  const h = 256;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = '#5a9fb2';
  g.fillRect(0, 0, w, h);
  let seed = 4242;
  const rnd = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  // Long soft streaks (darker, then lighter) so the surface reads as moving water rather than a flat tint.
  for (let i = 0; i < 70; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const len = 18 + rnd() * 60;
    const wd = 2 + rnd() * 6;
    const light = rnd() < 0.5;
    g.fillStyle = light ? 'rgba(210,240,250,' + (0.1 + rnd() * 0.16) + ')' : 'rgba(30,80,100,' + (0.12 + rnd() * 0.18) + ')';
    for (const oy of [-h, 0, h]) {
      g.beginPath();
      g.ellipse(x, y + oy, wd, len, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  // Ripple crests and foam flecks.
  for (let i = 0; i < 90; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    g.strokeStyle = 'rgba(240,252,255,' + (0.2 + rnd() * 0.35) + ')';
    g.lineWidth = 1 + rnd() * 1.4;
    for (const oy of [-h, 0, h]) {
      g.beginPath();
      g.moveTo(x, y + oy);
      g.quadraticCurveTo(x + (rnd() - 0.5) * 10, y + oy + 5 + rnd() * 8, x + (rnd() - 0.5) * 6, y + oy + 10 + rnd() * 14);
      g.stroke();
    }
  }
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  return tex;
}

/**
 * The rivers of a level: a ribbon along each centre line with a flowing surface (the pattern scrolls along the current), pale foam
 * at the banks and in a few rapids, and boulders along the shore. One draw call per river plus one for all the rocks.
 */
export class RiverMesh {
  readonly group = new Group();
  private readonly tex: CanvasTexture;

  constructor(course: Course) {
    this.group.name = 'rivers';
    this.tex = makeFlowTexture();
    const mat = new MeshLambertMaterial({ map: this.tex, vertexColors: true, transparent: true, opacity: 0.9, side: DoubleSide, depthWrite: false });
    const terrain = course.terrain;
    const rng = mulberry32(course.level.terrain.seed * 7 + 3);
    const rocks: Matrix4[] = [];
    const m4 = new Matrix4();
    const q = new Quaternion();
    const pos = new Vector3();
    const scl = new Vector3();

    for (const river of course.rivers) {
      const pts = river.pts;
      const hw = river.width / 2;
      const cols = [-1.06, -0.55, 0, 0.55, 1.06];
      const verts: number[] = [];
      const colors: number[] = [];
      const uvs: number[] = [];
      const idx: number[] = [];
      let dist = 0;
      const tint = new Color();
      for (let i = 0; i < pts.length; i++) {
        const a = pts[Math.max(0, i - 1)];
        const b = pts[Math.min(pts.length - 1, i + 1)];
        let tx = b.x - a.x;
        let tz = b.z - a.z;
        const tl = Math.hypot(tx, tz) || 1;
        tx /= tl;
        tz /= tl;
        const nx = -tz;
        const nz = tx;
        if (i > 0) dist += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
        // The river breathes: a little wider and a little narrower, with short rapids where the foam is brighter.
        const breathe = 1 + 0.12 * Math.sin(i * 0.43) + 0.07 * Math.sin(i * 1.1 + 2);
        const rapid = Math.max(0, Math.sin(i * 0.23 + river.width) - 0.55) * 2.2;
        for (let c = 0; c < cols.length; c++) {
          const lat = cols[c] * hw * breathe;
          verts.push(pts[i].x + nx * lat, pts[i].y - 0.02, pts[i].z + nz * lat);
          const edge = Math.abs(cols[c]);
          // Deep teal in the middle, pale foam toward the banks and in the rapids.
          const foam = Math.min(1, edge * edge * 0.55 + rapid * (0.35 + edge * 0.5));
          tint.setRGB(0.72 + foam * 0.28, 0.86 + foam * 0.14, 0.9 + foam * 0.1);
          colors.push(tint.r, tint.g, tint.b);
          uvs.push((c / (cols.length - 1)) * 1, dist / 13);
        }
        if (i > 0) {
          for (let c = 0; c < cols.length - 1; c++) {
            const p = (i - 1) * cols.length + c;
            const n = i * cols.length + c;
            idx.push(p, p + 1, n, p + 1, n + 1, n);
          }
        }
        // Boulders on the banks (and a few in the stream).
        if (i % 2 === 0 && i > 0 && rocks.length < MAX_ROCKS && rng() < 0.62) {
          const side = rng() < 0.5 ? -1 : 1;
          const off = hw * (0.8 + rng() * 0.55) * side;
          const x = pts[i].x + nx * off;
          const z = pts[i].z + nz * off;
          const sc = 0.35 + rng() * 1.1;
          const y = Math.max(terrain.heightAt(x, z), pts[i].y - 0.2) + sc * 0.15;
          q.setFromAxisAngle(UP, rng() * 6.28);
          m4.compose(pos.set(x, y, z), q, scl.set(sc * 1.3, sc * 0.75, sc));
          rocks.push(m4.clone());
        }
      }
      const geo = new BufferGeometry();
      geo.setAttribute('position', new Float32BufferAttribute(verts, 3));
      geo.setAttribute('color', new Float32BufferAttribute(colors, 3));
      geo.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const mesh = new Mesh(geo, mat);
      mesh.name = 'river-' + river.id;
      mesh.renderOrder = 1;
      mesh.frustumCulled = false;
      this.group.add(mesh);
    }

    if (rocks.length) {
      const geo = new IcosahedronGeometry(1, 0);
      const rockMat = new MeshLambertMaterial({ color: 0x8a867c, flatShading: true });
      const mesh = new InstancedMesh(geo, rockMat, rocks.length);
      rocks.forEach((m, i) => mesh.setMatrixAt(i, m));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.frustumCulled = false;
      mesh.name = 'river-rocks';
      this.group.add(mesh);
    }
  }

  /** Scrolls the surface pattern along the current. */
  update(time: number): void {
    this.tex.offset.y = -time * FLOW;
  }
}
