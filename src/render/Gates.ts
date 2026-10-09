import {
  AdditiveBlending,
  CanvasTexture,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3,
} from 'three';
import type { BufferGeometry } from 'three';
import type { Course } from '../world/Course';
import { lerp } from '../core/math';
import { GeoBuilder } from './geo';
import { FLAG_COLORS, PAL } from './palette';

function makeSign(text: string, bg: string): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 128);
  g.strokeStyle = '#e0aa2e';
  g.lineWidth = 8;
  g.strokeRect(8, 8, 496, 112);
  g.strokeStyle = 'rgba(224,170,46,0.6)';
  g.lineWidth = 2;
  g.strokeRect(20, 20, 472, 88);
  g.fillStyle = '#fbf1d8';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  let size = 58;
  g.font = `700 ${size}px Georgia, 'Palatino Linotype', serif`;
  while (g.measureText(text).width > 440 && size > 24) {
    size -= 4;
    g.font = `700 ${size}px Georgia, 'Palatino Linotype', serif`;
  }
  g.fillText(text, 256, 68);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function makeCurtainTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createLinearGradient(0, 0, 0, 128);
  grd.addColorStop(0, 'rgba(255,190,60,0)');
  grd.addColorStop(0.6, 'rgba(255,190,60,0.28)');
  grd.addColorStop(1, 'rgba(255,214,110,0.75)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 32, 128);
  return new CanvasTexture(c);
}

interface Gate {
  curtain: Mesh;
}

/**
 * Start line, checkpoint arches and the finish arch, all derived from the course stations.
 * The next gate you need glows with a saffron light curtain.
 */
export class Gates {
  readonly group = new Group();
  private readonly gates: Gate[] = [];
  private readonly curtainMat: MeshBasicMaterial;
  private readonly disposables: { dispose(): void }[] = [];
  private next = 0;

  constructor(course: Course) {
    const level = course.level;
    const stations: { s: number; label: string; bg: string; big: boolean }[] = [
      { s: course.startS, label: 'START', bg: '#1d2f5c', big: false },
      ...level.checkpoints.map((_c, i) => ({
        s: course.checkpointS[i],
        label: `CHECKPOINT ${i + 1}`,
        bg: '#7d2a21',
        big: false,
      })),
      { s: course.finishS, label: level.finishLabel.toUpperCase(), bg: '#1d2f5c', big: true },
    ];

    const statics = new GeoBuilder();
    const curtainTex = makeCurtainTexture();
    this.curtainMat = new MeshBasicMaterial({
      map: curtainTex,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
      fog: false,
    });
    this.disposables.push(curtainTex, this.curtainMat);
    const hw = course.road.wallOffset;
    const roadW = course.road.halfWidth * 2;

    for (const st of stations) {
      const p = course.poseAt(st.s);
      const rx = -p.tz;
      const rz = p.tx;
      const edge = hw + 1.0;
      const top = st.big ? 8.6 : 6.6;
      const gy = p.y;
      const ends: Vector3[] = [];
      for (const side of [-1, 1]) {
        const x = p.x + rx * edge * side;
        const z = p.z + rz * edge * side;
        const y0 = course.terrain.heightAt(x, z) - 0.8;
        statics.cylinder(st.big ? 0.26 : 0.18, st.big ? 0.32 : 0.24, gy + top - y0, PAL.whitewash, 8, {
          x,
          y: (y0 + gy + top) / 2,
          z,
        });
        statics.sphere(st.big ? 0.4 : 0.28, PAL.gold, { x, y: gy + top + 0.1, z }, 8);
        statics.cylinder(0.3, 0.3, 0.35, PAL.maroon, 8, { x, y: gy + top - 0.6, z });
        ends.push(new Vector3(x, gy + top - 0.3, z));
      }
      // Bunting between the poles.
      const n = 16;
      const sag = 0.9;
      const at = (t: number): Vector3 =>
        new Vector3(
          lerp(ends[0].x, ends[1].x, t),
          ends[0].y - sag * 4 * t * (1 - t),
          lerp(ends[0].z, ends[1].z, t),
        );
      const yaw = Math.atan2(p.tx, p.tz);
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const m = at(t);
        statics.quad(0.62, 0.55, FLAG_COLORS[i % 5], { x: m.x, y: m.y - 0.3, z: m.z, ry: yaw });
      }

      // Sign board spanning the road, readable from both directions.
      const sign = makeSign(st.label, st.bg);
      this.disposables.push(sign);
      const signGeo = new PlaneGeometry(roadW + 1.2, st.big ? 1.6 : 1.15);
      this.disposables.push(signGeo);
      const signMat = new MeshBasicMaterial({ map: sign });
      this.disposables.push(signMat);
      // One board per direction so the lettering never reads mirrored.
      for (const turn of [0, Math.PI]) {
        const board = new Mesh(signGeo, signMat);
        board.position.set(p.x, gy + top - (st.big ? 1.9 : 1.6), p.z);
        board.rotation.y = yaw + turn;
        board.translateZ(0.03);
        this.group.add(board);
      }

      // Light curtain marking the next objective.
      const curtainGeo = new PlaneGeometry(roadW, 6);
      this.disposables.push(curtainGeo);
      const curtain = new Mesh(curtainGeo, this.curtainMat);
      curtain.position.set(p.x, gy + 3, p.z);
      curtain.rotation.y = yaw;
      curtain.visible = false;
      curtain.renderOrder = 5;
      this.group.add(curtain);
      this.gates.push({ curtain });
    }

    const geo: BufferGeometry = statics.build();
    const mat = new MeshLambertMaterial({ vertexColors: true, side: DoubleSide });
    this.disposables.push(geo, mat);
    this.group.add(new Mesh(geo, mat));
    this.setNext(0);
  }

  /** `index` = how many checkpoints are done: 0 -> first checkpoint glows, N -> the finish glows. */
  setNext(index: number): void {
    this.next = index;
    this.gates.forEach((g, i) => {
      g.curtain.visible = i === index + 1;
    });
  }

  update(time: number): void {
    this.curtainMat.opacity = 0.75 + Math.sin(time * 3.2) * 0.25;
  }

  get nextIndex(): number {
    return this.next;
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
    this.group.clear();
  }
}
