import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshLambertMaterial,
  Points,
  PointsMaterial,
  Quaternion,
  Vector3,
} from 'three';
import type { Scene } from 'three';
import type { TrafficKind } from '../data/types';
import { mulberry32 } from '../core/math';
import type { Course } from '../world/Course';
import { TRAFFIC_KINDS } from '../gameplay/Traffic';
import { bicycleGeometry, busGeometry, motoGeometry, suvGeometry, truckGeometry, walkerGeometry } from './trafficBodies';
import { yakGeometry } from './Scenery';
import { trafficCarGeometry } from './vehicleBodies';

const UP = new Vector3(0, 1, 0);
const SKIN_TINTS = [0xffffff, 0xf2e2d2, 0xd9b99a, 0xc79a76, 0xf6f4ee];
const COATS = [0xd6322b, 0x2f6fd0, 0xe8b53a, 0x2e9c4f, 0xf1f1ec, 0x8c2a20, 0xe39a1c, 0x6b7f3f];
const PARKED_COLORS = [0xd6322b, 0x2f6fd0, 0xf1f1ec, 0x4a4f5a, 0xe8b53a, 0x2e9c4f];

const GEO: Record<TrafficKind, () => BufferGeometry> = {
  car: trafficCarGeometry,
  suv: suvGeometry,
  bus: busGeometry,
  truck: truckGeometry,
  moto: motoGeometry,
  bike: bicycleGeometry,
};

interface Walker {
  /** Road distance of the middle of the beat, half the beat length, and lateral distance from the centre line. */
  s: number;
  span: number;
  lat: number;
  phase: number;
  speed: number;
  color: number;
  scale: number;
  idle: boolean;
}

/**
 * Everything beside the road that is not traffic: villagers and tourists on the verge, parked vehicles, a market stall or two, the
 * crowd at the destination and the confetti. Lightweight on purpose: a few instanced meshes, no physics for people (they stay on
 * the shoulder or behind the parapet, never on the asphalt), and one obstacle circle per vehicle parked inside the verge.
 */
export class RoadsideView {
  private readonly disposables: { dispose(): void }[] = [];
  private readonly walkerMesh: InstancedMesh | null = null;
  private readonly walkers: Walker[] = [];
  private readonly parkedMeshes: InstancedMesh[] = [];
  private readonly yakMesh: InstancedMesh | null = null;
  private readonly obstacleIds: number[] = [];
  private confetti: { points: Points; pos: Float32Array; vel: Float32Array; life: number; n: number } | null = null;
  private readonly m4 = new Matrix4();
  private readonly q = new Quaternion();
  private readonly pos = new Vector3();
  private readonly scl = new Vector3(1, 1, 1);
  private readonly col = new Color();
  private readonly pose = { x: 0, y: 0, z: 0, tx: 0, tz: -1 };
  private cheer = 0;
  private celebrating = 0;
  private confettiCount = 0;

  constructor(
    private readonly scene: Scene,
    private readonly course: Course,
  ) {
    const level = course.level;
    const rs = level.roadside;
    if (!rs) return;
    const road = course.road;
    const rng = mulberry32(level.scenery.seed * 7 + 3);
    const span = course.finishS - course.startS;
    const lateralFor = (s: number, side: -1 | 1, offset: number): number => {
      const hw = road.halfWidthAtS(s);
      const wall = road.wallAtS(s);
      // On a wide verge people stand on it; where the verge is narrow they stand just behind the parapet.
      const lat = wall - hw >= 1.8 ? Math.min(hw + 1.5 + offset, wall - 0.4) : wall + 1.2 + offset;
      return side * lat;
    };

    for (const w of rs.walkers ?? []) {
      const s = course.startS + w.at * span;
      for (let i = 0; i < w.count; i++) {
        this.walkers.push({
          s: s + (rng() - 0.5) * 6,
          span: w.span / 2,
          lat: lateralFor(s, w.side, (w.offset ?? 0) + rng() * 0.7),
          phase: rng() * 6.28,
          speed: 0.18 + rng() * 0.12,
          color: COATS[Math.floor(rng() * COATS.length)],
          scale: 0.9 + rng() * 0.18,
          idle: false,
        });
      }
    }
    for (const cr of rs.crowd ? [rs.crowd] : []) {
      const s = course.startS + cr.at * span;
      for (let i = 0; i < cr.count; i++) {
        const along = (i / Math.max(1, cr.count - 1) - 0.5) * cr.width + (rng() - 0.5) * 1.2;
        const lat = lateralFor(s + along, cr.side, cr.offset + rng() * 1.6);
        this.walkers.push({
          s: s + along,
          span: 0,
          lat,
          phase: rng() * 6.28,
          speed: 0,
          color: COATS[Math.floor(rng() * COATS.length)],
          scale: 0.92 + rng() * 0.16,
          idle: true,
        });
      }
    }
    if (this.walkers.length) {
      const geo = walkerGeometry();
      const mat = new MeshLambertMaterial({ vertexColors: true });
      this.walkerMesh = new InstancedMesh(geo, mat, Math.min(64, this.walkers.length));
      this.walkerMesh.frustumCulled = false;
      this.walkers.forEach((w, i) => {
        if (i < 64) this.walkerMesh!.setColorAt(i, this.col.setHex(w.color).lerp(new Color(SKIN_TINTS[i % SKIN_TINTS.length]), 0.25));
      });
      scene.add(this.walkerMesh);
      this.disposables.push(geo, mat, this.walkerMesh);
      this.confettiCount = rs.crowd ? 1 : 0;
    }

    // Parked vehicles: one instanced mesh per kind used; a single obstacle circle each if they stand inside the parapet.
    const byKind = new Map<TrafficKind, { s: number; lat: number; yaw: number; color: number }[]>();
    for (const p of rs.parked ?? []) {
      const s = course.startS + p.at * span;
      const spec = TRAFFIC_KINDS[p.kind];
      const hw = road.halfWidthAtS(s);
      const wall = road.wallAtS(s);
      const inside = wall - hw >= spec.radius * 2 + 0.7;
      const lat = p.side * (inside ? hw + spec.radius + 0.35 + (p.offset ?? 0) : wall + spec.radius + 0.8 + (p.offset ?? 0));
      const list = byKind.get(p.kind) ?? [];
      list.push({ s, lat, yaw: p.rotation ?? 0, color: PARKED_COLORS[Math.floor(rng() * PARKED_COLORS.length)] });
      byKind.set(p.kind, list);
      if (inside) {
        road.at(s, this.pose);
        const id = course.obstacles.add(this.pose.x - this.pose.tz * lat, this.pose.z + this.pose.tx * lat, spec.radius + 0.35, { push: 1, restitution: 0.1, tag: 'parked' });
        if (id >= 0) this.obstacleIds.push(id);
      }
    }
    for (const [kind, list] of byKind) {
      const geo = GEO[kind]();
      const mat = new MeshLambertMaterial({ vertexColors: true });
      const mesh = new InstancedMesh(geo, mat, list.length);
      mesh.frustumCulled = false;
      list.forEach((p, i) => {
        road.at(p.s, this.pose);
        const x = this.pose.x - this.pose.tz * p.lat;
        const z = this.pose.z + this.pose.tx * p.lat;
        const heading = Math.atan2(-this.pose.tx, -this.pose.tz) + p.yaw;
        this.q.setFromAxisAngle(UP, heading);
        this.m4.compose(this.pos.set(x, course.terrain.heightAt(x, z), z), this.q, this.scl);
        mesh.setMatrixAt(i, this.m4);
        mesh.setColorAt(i, this.col.setHex(p.color));
      });
      mesh.instanceMatrix.needsUpdate = true;
      scene.add(mesh);
      this.parkedMeshes.push(mesh);
      this.disposables.push(geo, mat, mesh);
    }

    // A few yaks grazing near the pass, as living scenery (they never enter the road).
    const yaks = rs.yaks ?? [];
    if (yaks.length) {
      const geo = yakGeometry();
      const mat = new MeshLambertMaterial({ vertexColors: true });
      this.yakMesh = new InstancedMesh(geo, mat, yaks.length);
      this.yakMesh.frustumCulled = false;
      yaks.forEach((y, i) => {
        const s = course.startS + y.at * span;
        road.at(s, this.pose);
        const lat = y.side * (road.wallAtS(s) + y.offset);
        const x = this.pose.x - this.pose.tz * lat;
        const z = this.pose.z + this.pose.tx * lat;
        this.q.setFromAxisAngle(UP, i * 2.3);
        this.m4.compose(this.pos.set(x, course.terrain.heightAt(x, z), z), this.q, this.scl.setScalar(1.05));
        this.yakMesh!.setMatrixAt(i, this.m4);
      });
      this.scl.setScalar(1);
      this.yakMesh.instanceMatrix.needsUpdate = true;
      scene.add(this.yakMesh);
      this.disposables.push(geo, mat, this.yakMesh);
    }
  }

  /**
   * Starts (or stops) the arrival celebration. `intensity` 0 = no confetti (Low graphics, reduced motion), 1 = full.
   * The crowd cheers whenever `on` is true, whatever the intensity.
   */
  celebrate(on: boolean, intensity: number): void {
    this.celebrating = on ? 1 : 0;
    if (!on) {
      this.removeConfetti();
      return;
    }
    if (intensity <= 0 || !this.confettiCount) return;
    const n = Math.round(150 * intensity);
    const pos = new Float32Array(n * 3);
    const vel = new Float32Array(n * 3);
    const colors = new Float32Array(n * 3);
    const palette = [0xff8a2a, 0xd12c88, 0xf6c452, 0x2fd37a, 0x5b8def, 0xffffff];
    const rng = mulberry32(99);
    const road = this.course.road;
    road.at(this.course.finishS - 4, this.pose);
    const c = new Color();
    for (let i = 0; i < n; i++) {
      pos[i * 3] = this.pose.x + (rng() - 0.5) * 16;
      pos[i * 3 + 1] = this.course.terrain.heightAt(this.pose.x, this.pose.z) + 7 + rng() * 7;
      pos[i * 3 + 2] = this.pose.z + (rng() - 0.5) * 16;
      vel[i * 3] = (rng() - 0.5) * 2.2;
      vel[i * 3 + 1] = -(0.9 + rng() * 1.6);
      vel[i * 3 + 2] = (rng() - 0.5) * 2.2;
      c.setHex(palette[i % palette.length]);
      colors.set([c.r, c.g, c.b], i * 3);
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new Float32BufferAttribute(colors, 3));
    const mat = new PointsMaterial({ size: 0.4, vertexColors: true, transparent: true, depthWrite: false });
    const points = new Points(geo, mat);
    points.frustumCulled = false;
    this.scene.add(points);
    this.removeConfetti();
    this.confetti = { points, pos, vel, life: 5.5, n };
  }

  private removeConfetti(): void {
    if (!this.confetti) return;
    this.scene.remove(this.confetti.points);
    this.confetti.points.geometry.dispose();
    (this.confetti.points.material as PointsMaterial).dispose();
    this.confetti = null;
  }

  update(time: number, dt: number): void {
    const road = this.course.road;
    const mesh = this.walkerMesh;
    this.cheer += ((this.celebrating ? 1 : 0) - this.cheer) * Math.min(1, dt * 4);
    if (mesh) {
      const n = Math.min(64, this.walkers.length);
      for (let i = 0; i < n; i++) {
        const w = this.walkers[i];
        let s = w.s;
        let dir = 0;
        let bob: number;
        if (!w.idle) {
          const ph = time * w.speed + w.phase;
          s = w.s + Math.sin(ph) * w.span;
          dir = Math.cos(ph) >= 0 ? 1 : -1;
          bob = Math.abs(Math.sin(time * 5 + w.phase)) * 0.05;
        } else {
          bob = Math.abs(Math.sin(time * (3 + this.cheer * 5) + w.phase)) * (0.03 + this.cheer * 0.22);
        }
        road.at(s, this.pose);
        const x = this.pose.x - this.pose.tz * w.lat;
        const z = this.pose.z + this.pose.tx * w.lat;
        // Walkers face along the road; the crowd turns to face the road.
        const face = w.idle ? Math.atan2(-this.pose.tz * Math.sign(w.lat), this.pose.tx * Math.sign(w.lat)) : Math.atan2(-this.pose.tx * dir, -this.pose.tz * dir);
        this.q.setFromAxisAngle(UP, face);
        this.m4.compose(this.pos.set(x, this.course.terrain.heightAt(x, z) + bob, z), this.q, this.scl.setScalar(w.scale));
        mesh.setMatrixAt(i, this.m4);
      }
      this.scl.setScalar(1);
      mesh.instanceMatrix.needsUpdate = true;
    }
    const cf = this.confetti;
    if (cf) {
      cf.life -= dt;
      const attr = cf.points.geometry.getAttribute('position') as Float32BufferAttribute;
      for (let i = 0; i < cf.n; i++) {
        cf.pos[i * 3] += (cf.vel[i * 3] + Math.sin(time * 3 + i) * 0.6) * dt;
        cf.pos[i * 3 + 1] += cf.vel[i * 3 + 1] * dt;
        cf.pos[i * 3 + 2] += (cf.vel[i * 3 + 2] + Math.cos(time * 2.4 + i) * 0.6) * dt;
        attr.setXYZ(i, cf.pos[i * 3], cf.pos[i * 3 + 1], cf.pos[i * 3 + 2]);
      }
      attr.needsUpdate = true;
      (cf.points.material as PointsMaterial).opacity = Math.min(1, cf.life / 1.2);
      if (cf.life <= 0) this.removeConfetti();
    }
  }

  dispose(): void {
    this.removeConfetti();
    for (const id of this.obstacleIds) this.course.obstacles.remove(id);
    for (const m of [this.walkerMesh, this.yakMesh, ...this.parkedMeshes]) if (m) this.scene.remove(m);
    this.disposables.forEach((d) => d.dispose());
  }
}
