import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Quaternion,
  SRGBColorSpace,
  Vector3,
} from 'three';
import type { Scene } from 'three';
import type { TrafficKind } from '../data/types';
import { mulberry32 } from '../core/math';
import type { Course } from '../world/Course';
import { TRAFFIC_KINDS } from '../gameplay/Traffic';
import type { TrafficControl } from '../gameplay/Traffic';
import { bicycleGeometry, birdGeometry, coneGeometry, busGeometry, deliveryGeometry, minibusGeometry, motoGeometry, scooterGeometry, suvGeometry, truckGeometry, walkerGeometry } from './trafficBodies';
import { yakGeometry } from './Scenery';
import { makeFlowTexture } from './RiverMesh';
import { GeoBuilder } from './geo';
import { tractorGeometry } from './valleyBodies';
import { ploughGeometry } from './snowBodies';
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
  taxi: trafficCarGeometry,
  minibus: minibusGeometry,
  scooter: scooterGeometry,
  delivery: deliveryGeometry,
  tractor: tractorGeometry,
  plough: ploughGeometry,
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
  /** Part of the destination crowd: cheers (bounces) at the celebration. */
  cheers: boolean;
  /** 0..1: how far the person has stepped back from a passing car. */
  push: number;
}

/** A grazing animal: it drifts away from the road as the car comes close, and wanders back afterwards. */
interface Grazer {
  x: number;
  z: number;
  /** Unit vector pointing away from the road. */
  nx: number;
  nz: number;
  rot: number;
  scale: number;
  off: number;
}

interface Officer {
  group: Group;
  arm: Group;
  s: number;
}

interface Flock {
  x: number;
  y: number;
  z: number;
  count: number;
  /** perched | flying | away (waiting to come back). */
  state: 'perched' | 'flying' | 'away';
  timer: number;
  dirx: number;
  dirz: number;
  first: number;
}

const MAX_WALKERS = 72;
const MAX_PEDS = 12;
const MAX_BIRDS = 24;
const MAX_MARKERS = 520;
const MAX_DRAIN_ROWS = 360;

/**
 * Everything beside the road that is not traffic: villagers and tourists on the verge, people standing at bus stops and
 * market stalls, pedestrians using the crossings (driven by the traffic's crossing controls), traffic officers, perched
 * birds that take off as the car passes, parked vehicles, the crowd at the destination, confetti and checkered flags.
 * Lightweight on purpose: a few instanced meshes, no physics for people (they stay on the verge or behind the parapet),
 * and one obstacle circle per vehicle parked inside the verge.
 */
export class RoadsideView {
  private readonly disposables: { dispose(): void }[] = [];
  private readonly walkerMesh: InstancedMesh | null = null;
  private readonly walkers: Walker[] = [];
  private readonly pedMesh: InstancedMesh | null = null;
  private readonly parkedMeshes: InstancedMesh[] = [];
  private readonly yakMesh: InstancedMesh | null = null;
  private readonly grazers: Grazer[] = [];
  private readonly obstacleIds: number[] = [];
  private readonly officers: Officer[] = [];
  /** Signal lamps at the two ends of a one-lane bridge: red or green for the traffic arriving from that end. */
  private readonly signals: { red: Mesh; green: Mesh; dir: 1 | -1; ctl: number }[] = [];
  private readonly signalGroups: Group[] = [];
  private readonly flocks: Flock[] = [];
  private readonly birdMesh: InstancedMesh | null = null;
  private readonly coneMesh: InstancedMesh | null = null;
  private readonly markerMesh: InstancedMesh | null = null;
  private readonly drainMesh: Mesh | null = null;
  private readonly drainTex: CanvasTexture | null = null;
  private traffic: { controls: TrafficControl[] } | null = null;
  private confetti: { points: Points; pos: Float32Array; vel: Float32Array; life: number; n: number } | null = null;
  private flags: { group: Group; items: { mesh: Mesh; phase: number; baseY: number }[]; t: number } | null = null;
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
    /** 0..1 population scale from the graphics quality (Low = fewer people and birds). */
    density = 1,
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
    const scaled = (n: number): number => Math.max(1, Math.round(n * density));

    for (const w of rs.walkers ?? []) {
      const s = course.startS + w.at * span;
      for (let i = 0; i < scaled(w.count); i++) {
        this.walkers.push({
          s: s + (rng() - 0.5) * 6,
          span: w.span / 2,
          lat: lateralFor(s, w.side, (w.offset ?? 0) + rng() * 0.7),
          phase: rng() * 6.28,
          speed: 0.18 + rng() * 0.12,
          color: COATS[Math.floor(rng() * COATS.length)],
          scale: 0.9 + rng() * 0.18,
          idle: false,
          cheers: false,
          push: 0,
        });
      }
    }
    // People standing about: bus stops, taxi queues, shopkeepers, small groups chatting.
    for (const g of rs.standing ?? []) {
      const s = course.startS + g.at * span;
      for (let i = 0; i < scaled(g.count); i++) {
        const along = (i - (g.count - 1) / 2) * 0.95 + (rng() - 0.5) * 0.5;
        this.walkers.push({
          s: s + along,
          span: 0,
          lat: lateralFor(s + along, g.side, (g.offset ?? 0) + rng() * 0.6),
          phase: rng() * 6.28,
          speed: 0,
          color: COATS[Math.floor(rng() * COATS.length)],
          scale: 0.9 + rng() * 0.18,
          idle: true,
          cheers: false,
          push: 0,
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
          cheers: true,
          push: 0,
        });
      }
    }
    if (this.walkers.length) {
      const geo = walkerGeometry();
      const mat = new MeshLambertMaterial({ vertexColors: true });
      this.walkerMesh = new InstancedMesh(geo, mat, Math.min(MAX_WALKERS, this.walkers.length));
      this.walkerMesh.frustumCulled = false;
      this.walkers.forEach((w, i) => {
        if (i < MAX_WALKERS) this.walkerMesh!.setColorAt(i, this.col.setHex(w.color).lerp(new Color(SKIN_TINTS[i % SKIN_TINTS.length]), 0.25));
      });
      scene.add(this.walkerMesh);
      this.disposables.push(geo, mat, this.walkerMesh);
      this.confettiCount = rs.crowd ? 1 : 0;
    }

    // Pedestrians for the crossings (their state machine lives in the traffic system).
    const nCrossPeds = (level.traffic?.controls ?? []).filter((c) => c.kind === 'crossing').reduce((n, c) => n + Math.max(1, Math.min(4, c.peds ?? 3)), 0);
    if (nCrossPeds > 0) {
      const geo = walkerGeometry();
      const mat = new MeshLambertMaterial({ vertexColors: true });
      this.pedMesh = new InstancedMesh(geo, mat, Math.min(MAX_PEDS, nCrossPeds));
      this.pedMesh.frustumCulled = false;
      for (let i = 0; i < Math.min(MAX_PEDS, nCrossPeds); i++) this.pedMesh.setColorAt(i, this.col.setHex(COATS[(i * 3 + 1) % COATS.length]));
      scene.add(this.pedMesh);
      this.disposables.push(geo, mat, this.pedMesh);
    }

    // Traffic officers: a figure in a pale uniform whose arm shows the state of the junction.
    for (const pl of rs.police ?? []) {
      const s = course.startS + pl.at * span;
      const hw = road.halfWidthAtS(s);
      const lat = pl.side * (hw + 1.1);
      road.at(s, this.pose);
      const x = this.pose.x - this.pose.tz * lat;
      const z = this.pose.z + this.pose.tx * lat;
      const group = new Group();
      const geo = walkerGeometry();
      const mat = new MeshLambertMaterial({ vertexColors: true, color: 0xc9d6f2 });
      const body = new Mesh(geo, mat);
      body.scale.setScalar(1.05);
      group.add(body);
      const armGeo = new BoxGeometry(0.1, 0.12, 0.8);
      const armMat = new MeshLambertMaterial({ color: 0xf6f6f2 });
      const arm = new Group();
      const armMesh = new Mesh(armGeo, armMat);
      armMesh.position.set(0, 0, -0.4);
      arm.add(armMesh);
      arm.position.set(0.28, 1.5, 0);
      group.add(arm);
      group.position.set(x, course.terrain.heightAt(x, z), z);
      group.rotation.y = Math.atan2(pl.side * -this.pose.tz, pl.side * this.pose.tx);
      scene.add(group);
      this.officers.push({ group, arm, s });
      this.disposables.push(geo, mat, armGeo, armMat);
    }

    // One-lane bridge signals: a post with a red and a green lamp at each end, on the left-hand verge facing the approaching traffic.
    (level.traffic?.controls ?? []).forEach((c, ci) => {
      if (c.kind !== 'bridge') return;
      const half = c.span ?? 20;
      const poleGeo = new BoxGeometry(0.12, 3.0, 0.12);
      const poleMat = new MeshLambertMaterial({ color: 0x4a4a50 });
      const boxGeo = new BoxGeometry(0.55, 1.15, 0.3);
      const lampGeo = new CylinderGeometry(0.17, 0.17, 0.12, 12);
      const redMat = new MeshBasicMaterial({ color: 0xff3a2a });
      const greenMat = new MeshBasicMaterial({ color: 0x3aff6a });
      this.disposables.push(poleGeo, poleMat, boxGeo, lampGeo, redMat, greenMat);
      for (const dir of [1, -1] as const) {
        const s = course.startS + c.at * span - dir * (half + 6);
        road.at(s, this.pose);
        const lat = -(road.halfWidthAtS(s) + 0.9);
        const x = this.pose.x - this.pose.tz * lat;
        const z = this.pose.z + this.pose.tx * lat;
        const group = new Group();
        const pole = new Mesh(poleGeo, poleMat);
        pole.position.y = 1.5;
        const box = new Mesh(boxGeo, poleMat);
        box.position.y = 2.7;
        const red = new Mesh(lampGeo, redMat);
        const green = new Mesh(lampGeo, greenMat);
        red.rotation.x = green.rotation.x = Math.PI / 2;
        red.position.set(0, 3.05, -0.17 * dir);
        green.position.set(0, 2.5, -0.17 * dir);
        group.add(pole, box, red, green);
        group.position.set(x, course.terrain.heightAt(x, z), z);
        // The lamps face the traffic arriving at this end.
        group.rotation.y = Math.atan2(-this.pose.tx * dir, -this.pose.tz * dir) + Math.PI;
        scene.add(group);
        this.signalGroups.push(group);
        this.signals.push({ red, green, dir, ctl: ci });
      }
    });

    // Perched birds: roof ridges and wires; they take off when the car comes near.
    const birds = rs.birds ?? [];
    if (birds.length) {
      const geo = birdGeometry();
      const mat = new MeshLambertMaterial({ vertexColors: true });
      this.birdMesh = new InstancedMesh(geo, mat, MAX_BIRDS);
      this.birdMesh.count = 0;
      this.birdMesh.frustumCulled = false;
      scene.add(this.birdMesh);
      this.disposables.push(geo, mat, this.birdMesh);
      let first = 0;
      for (const b of birds) {
        const s = course.startS + b.at * span;
        road.at(s, this.pose);
        const lat = b.side * (road.wallAtS(s) + b.offset);
        const x = this.pose.x - this.pose.tz * lat;
        const z = this.pose.z + this.pose.tx * lat;
        const count = Math.min(Math.max(2, scaled(b.count)), MAX_BIRDS - first);
        if (count <= 0) break;
        // They flee away from the road.
        this.flocks.push({ x, y: course.terrain.heightAt(x, z) + 6 + rng() * 3, z, count, state: 'perched', timer: 0, dirx: -this.pose.tz * b.side, dirz: this.pose.tx * b.side, first });
        first += count;
      }
    }

    // Roadworks: traffic cones squeezing one side of the road. They are soft obstacles (no damage) set outside the
    // traffic lane, so the squeeze is the player's to manage and traffic never jams on it.
    const coneSpots: { x: number; z: number }[] = [];
    for (const c of rs.cones ?? []) {
      const s0 = course.startS + c.at * span;
      for (let d = 0; d <= c.length; d += 6) {
        const s = s0 + d;
        road.at(s, this.pose);
        const lat = c.side * road.halfWidthAtS(s) * 0.88;
        const x = this.pose.x - this.pose.tz * lat;
        const z = this.pose.z + this.pose.tx * lat;
        coneSpots.push({ x, z });
        if (coneSpots.length >= 24) break;
      }
    }
    if (coneSpots.length) {
      const geo = coneGeometry();
      const mat = new MeshLambertMaterial({ vertexColors: true });
      this.coneMesh = new InstancedMesh(geo, mat, coneSpots.length);
      this.coneMesh.frustumCulled = false;
      coneSpots.forEach((c, i) => {
        this.m4.compose(this.pos.set(c.x, course.terrain.heightAt(c.x, c.z), c.z), this.q.setFromAxisAngle(UP, i * 1.7), this.scl);
        this.coneMesh!.setMatrixAt(i, this.m4);
        const id = course.obstacles.add(c.x, c.z, 0.4, { push: 0.6, restitution: 0.1, tag: 'gate' });
        if (id >= 0) this.obstacleIds.push(id);
      });
      this.coneMesh.instanceMatrix.needsUpdate = true;
      scene.add(this.coneMesh);
      this.disposables.push(geo, mat, this.coneMesh);
    }

    // Reflective marker posts along both edges (fog and storm stretches): unlit, so they glow through the murk.
    const markerSpots: { x: number; z: number; side: number; yaw: number }[] = [];
    for (const m of rs.markers ?? []) {
      const s0 = course.startS + m.from * span;
      const s1 = course.startS + m.to * span;
      for (let s = s0; s <= s1 && markerSpots.length < MAX_MARKERS; s += m.spacing ?? 18) {
        road.at(s, this.pose);
        for (const side of [-1, 1]) {
          const lat = side * (road.halfWidthAtS(s) + 0.3);
          markerSpots.push({ x: this.pose.x - this.pose.tz * lat, z: this.pose.z + this.pose.tx * lat, side, yaw: Math.atan2(this.pose.tx, this.pose.tz) });
        }
      }
    }
    if (markerSpots.length) {
      const geo = new GeoBuilder().box(0.09, 1.05, 0.09, 0x4a4a50, { y: 0.52 }).box(0.13, 0.24, 0.13, 0xffffff, { y: 0.95 }).build();
      const mat = new MeshBasicMaterial({ vertexColors: true });
      this.markerMesh = new InstancedMesh(geo, mat, markerSpots.length);
      this.markerMesh.frustumCulled = false;
      markerSpots.forEach((m, i) => {
        this.m4.compose(this.pos.set(m.x, course.terrain.heightAt(m.x, m.z), m.z), this.q.setFromAxisAngle(UP, m.yaw), this.scl);
        this.markerMesh!.setMatrixAt(i, this.m4);
        // Left-hand edge posts glow orange, right-hand edge posts pale yellow-white.
        this.markerMesh!.setColorAt(i, this.col.setHex(m.side < 0 ? 0xff8a2a : 0xfff4b8));
      });
      this.markerMesh.instanceMatrix.needsUpdate = true;
      if (this.markerMesh.instanceColor) this.markerMesh.instanceColor.needsUpdate = true;
      scene.add(this.markerMesh);
      this.disposables.push(geo, mat, this.markerMesh);
    }

    // Runoff channels: a thin ribbon of moving water in the gutter beside the road.
    if (rs.drains?.length) {
      const pos: number[] = [];
      const uv: number[] = [];
      const idx: number[] = [];
      let rows = 0;
      let dist = 0;
      for (const d of rs.drains) {
        const s0 = course.startS + d.from * span;
        const s1 = course.startS + d.to * span;
        const first = rows;
        for (let s = s0; s <= s1 && rows - first < MAX_DRAIN_ROWS; s += 4, rows++) {
          road.at(s, this.pose);
          const lat = d.side * (road.halfWidthAtS(s) + 0.38);
          for (const w of [-0.3, 0.3]) {
            const l = lat + w;
            const x = this.pose.x - this.pose.tz * l;
            const z = this.pose.z + this.pose.tx * l;
            pos.push(x, course.terrain.heightAt(x, z) + 0.11, z);
          }
          uv.push(0, dist / 2, 1, dist / 2);
          dist += 4;
          if (rows > first) {
            const a = (rows - 1) * 2;
            idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
          }
        }
      }
      if (rows > 1) {
        const geo = new BufferGeometry();
        geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
        geo.setAttribute('uv', new Float32BufferAttribute(uv, 2));
        geo.setIndex(idx);
        geo.computeVertexNormals();
        this.drainTex = makeFlowTexture();
        const mat = new MeshLambertMaterial({ map: this.drainTex, color: 0xc8e0ea, transparent: true, opacity: 0.85, depthWrite: false, side: DoubleSide });
        this.drainMesh = new Mesh(geo, mat);
        this.drainMesh.frustumCulled = false;
        this.drainMesh.renderOrder = 2;
        scene.add(this.drainMesh);
        this.disposables.push(geo, mat, this.drainTex);
      }
    }

    // Parked vehicles: one instanced mesh per kind used; a single obstacle circle each if they stand inside the parapet.
    const byKind = new Map<TrafficKind, { s: number; lat: number; yaw: number; color: number }[]>();
    for (const p of rs.parked ?? []) {
      const s = course.startS + p.at * span;
      const spec = TRAFFIC_KINDS[p.kind];
      const hw = road.halfWidthAtS(s);
      const wall = road.wallAtS(s);
      // `edge`: half on the carriageway, half on the verge (a tight squeeze); otherwise on a broad verge, or behind the parapet.
      const inside = p.edge === true || wall - hw >= spec.radius * 2 + 0.7;
      const lat = p.side * (p.edge === true ? hw + 0.35 + (p.offset ?? 0) : inside ? hw + spec.radius + 0.35 + (p.offset ?? 0) : wall + spec.radius + 0.8 + (p.offset ?? 0));
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
        this.grazers.push({ x, z, nx: -this.pose.tz * y.side, nz: this.pose.tx * y.side, rot: i * 2.3, scale: 1.05, off: 0 });
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

  /** Lets the crossing pedestrians and the officers follow the traffic system's state. */
  attach(traffic: { controls: TrafficControl[] } | null): void {
    this.traffic = traffic;
  }

  /**
   * Starts (or stops) the arrival celebration. `intensity` 0 = no confetti (Low graphics, reduced motion), 1 = full.
   * The crowd cheers whenever `on` is true, whatever the intensity; checkered flags go up where the level asks for them.
   */
  celebrate(on: boolean, intensity: number): void {
    this.celebrating = on ? 1 : 0;
    if (!on) {
      this.removeConfetti();
      this.removeFlags();
      return;
    }
    if (this.course.level.celebrateFlags) this.raiseFlags();
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

  /** Black-and-white checkered flags on poles along both sides of the drop-off area. */
  private raiseFlags(): void {
    if (this.flags) return;
    const road = this.course.road;
    const group = new Group();
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 96;
    const g = c.getContext('2d')!;
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 4; x++) {
        g.fillStyle = (x + y) % 2 === 0 ? '#111114' : '#f6f6f2';
        g.fillRect(x * 32, y * 32, 32, 32);
      }
    }
    const tex = new CanvasTexture(c);
    tex.colorSpace = SRGBColorSpace;
    const flagMat = new MeshLambertMaterial({ map: tex, side: DoubleSide });
    const poleMat = new MeshLambertMaterial({ color: 0xe9e6dc });
    const flagGeo = new PlaneGeometry(2.2, 1.6);
    const poleGeo = new CylinderGeometry(0.05, 0.07, 5.2, 6);
    const items: { mesh: Mesh; phase: number; baseY: number }[] = [];
    const finish = this.course.finishS;
    let k = 0;
    for (const side of [-1, 1]) {
      for (const ds of [-34, -26, -18, -10]) {
        const s = finish + ds;
        const hw = road.halfWidthAtS(s);
        const wall = road.wallAtS(s);
        const lat = side * Math.min(hw + 0.9, wall - 0.3);
        road.at(s, this.pose);
        const x = this.pose.x - this.pose.tz * lat;
        const z = this.pose.z + this.pose.tx * lat;
        const gy = this.course.terrain.heightAt(x, z);
        const pole = new Mesh(poleGeo, poleMat);
        pole.position.set(x, gy + 2.6, z);
        const flag = new Mesh(flagGeo, flagMat);
        // The flag streams along the road from the pole (its local X axis lies along the road).
        flag.position.set(x + this.pose.tx * 1.1, gy + 4.4, z + this.pose.tz * 1.1);
        flag.rotation.y = Math.atan2(-this.pose.tz, this.pose.tx);
        group.add(pole, flag);
        items.push({ mesh: flag, phase: k++ * 0.7, baseY: gy + 4.4 });
      }
    }
    this.scene.add(group);
    this.flags = { group, items, t: 0 };
    this.disposables.push(tex, flagMat, poleMat, flagGeo, poleGeo);
  }

  private removeFlags(): void {
    if (!this.flags) return;
    this.scene.remove(this.flags.group);
    this.flags = null;
  }

  update(time: number, dt: number, px = 0, pz = 0): void {
    if (this.drainTex) this.drainTex.offset.y = -time * 0.55;
    const road = this.course.road;
    const mesh = this.walkerMesh;
    this.cheer += ((this.celebrating ? 1 : 0) - this.cheer) * Math.min(1, dt * 4);
    if (mesh) {
      const n = Math.min(MAX_WALKERS, this.walkers.length);
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
        } else if (w.cheers) {
          bob = Math.abs(Math.sin(time * (3 + this.cheer * 5) + w.phase)) * (0.03 + this.cheer * 0.22);
        } else {
          // Standing chatter: a gentle sway.
          bob = Math.abs(Math.sin(time * 1.4 + w.phase)) * 0.015;
        }
        road.at(s, this.pose);
        let x = this.pose.x - this.pose.tz * w.lat;
        let z = this.pose.z + this.pose.tx * w.lat;
        // People step back toward the hillside as a car comes close.
        if (!w.cheers) {
          w.push += ((Math.hypot(x - px, z - pz) < 9 ? 1 : 0) - w.push) * Math.min(1, dt * 2.5);
          if (w.push > 0.01) {
            const o = Math.sign(w.lat) * w.push * 0.9;
            x -= this.pose.tz * o;
            z += this.pose.tx * o;
          }
        }
        // Walkers face along the road; people standing face the road.
        const face = w.idle ? Math.atan2(-this.pose.tz * Math.sign(w.lat), this.pose.tx * Math.sign(w.lat)) : Math.atan2(-this.pose.tx * dir, -this.pose.tz * dir);
        this.q.setFromAxisAngle(UP, face);
        this.m4.compose(this.pos.set(x, this.course.terrain.heightAt(x, z) + bob, z), this.q, this.scl.setScalar(w.scale));
        mesh.setMatrixAt(i, this.m4);
      }
      this.scl.setScalar(1);
      mesh.instanceMatrix.needsUpdate = true;
    }

    // Grazing animals drift away from the road when the car comes within about 25 m, and wander back once it has passed.
    if (this.yakMesh && this.grazers.length) {
      for (let i = 0; i < this.grazers.length; i++) {
        const gz = this.grazers[i];
        const bx = gz.x + gz.nx * gz.off;
        const bz = gz.z + gz.nz * gz.off;
        const d = Math.hypot(bx - px, bz - pz);
        const target = d < 25 ? Math.min(8, (25 - d) * 0.45) : 0;
        gz.off += (target - gz.off) * Math.min(1, dt * (target > gz.off ? 1.1 : 0.25));
        const x = gz.x + gz.nx * gz.off;
        const z = gz.z + gz.nz * gz.off;
        this.q.setFromAxisAngle(UP, gz.rot + Math.sin(time * 0.4 + i) * 0.05);
        this.m4.compose(this.pos.set(x, this.course.terrain.heightAt(x, z), z), this.q, this.scl.setScalar(gz.scale));
        this.yakMesh.setMatrixAt(i, this.m4);
      }
      this.scl.setScalar(1);
      this.yakMesh.instanceMatrix.needsUpdate = true;
    }

    const tr = this.traffic;
    if (this.pedMesh && tr) {
      let i = 0;
      for (const ctl of tr.controls) {
        if (ctl.kind !== 'crossing') continue;
        for (const p of ctl.peds) {
          if (i >= MAX_PEDS) break;
          road.at(ctl.s + p.along, this.pose);
          const x = this.pose.x - this.pose.tz * p.lat;
          const z = this.pose.z + this.pose.tx * p.lat;
          // Facing the way they will walk (toward the far kerb).
          const dx = -this.pose.tz * p.dir;
          const dz = this.pose.tx * p.dir;
          this.q.setFromAxisAngle(UP, Math.atan2(-dx, -dz));
          const bob = p.state === 'cross' ? Math.abs(Math.sin(time * 7 + i)) * 0.07 : 0;
          this.m4.compose(this.pos.set(x, this.course.terrain.heightAt(x, z) + bob, z), this.q, this.scl);
          this.pedMesh.setMatrixAt(i++, this.m4);
        }
      }
      this.pedMesh.count = i;
      this.pedMesh.instanceMatrix.needsUpdate = true;
    }

    // Officers: arm out (still) while the main road is stopped, a sweeping beckon while it flows.
    if (tr) {
      for (const o of this.officers) {
        const ctl = tr.controls.find((c) => c.kind === 'police' && Math.abs(c.s - o.s) < 8);
        const stopped = ctl ? ctl.phase === 'stop' : false;
        o.arm.rotation.set(0, stopped ? 0 : Math.sin(time * 4) * 0.9, stopped ? 0 : -0.5);
      }
    }

    if (tr && this.signals.length) {
      for (const sg of this.signals) {
        const ctl = tr.controls[sg.ctl];
        if (!ctl) continue;
        const green = !ctl.clear && (sg.dir === 1 ? ctl.phase === 'go' : ctl.phase === 'stop');
        sg.green.visible = green;
        sg.red.visible = !green;
      }
    }

    this.updateBirds(time, dt, px, pz);

    const fl = this.flags;
    if (fl) {
      fl.t += dt;
      const rise = Math.min(1, fl.t / 0.9);
      for (const it of fl.items) {
        it.mesh.position.y = it.baseY - (1 - rise) * 3.2;
        it.mesh.rotation.z = Math.sin(time * 5 + it.phase) * 0.12;
      }
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

  /** Birds sit on rooftops until the car comes within 24 m, then scatter upward and away; they return later. */
  private updateBirds(time: number, dt: number, px: number, pz: number): void {
    const mesh = this.birdMesh;
    if (!mesh) return;
    let n = 0;
    for (const f of this.flocks) {
      if (f.state === 'perched') {
        if (Math.hypot(px - f.x, pz - f.z) < 24) {
          f.state = 'flying';
          f.timer = 0;
        }
      } else if (f.state === 'flying') {
        f.timer += dt;
        if (f.timer > 4.5) {
          f.state = 'away';
          f.timer = 26;
        }
      } else {
        f.timer -= dt;
        if (f.timer <= 0) f.state = 'perched';
      }
      if (f.state === 'away') continue;
      for (let b = 0; b < f.count; b++) {
        const idx = f.first + b;
        if (n >= MAX_BIRDS) break;
        const ang = (b / f.count) * 6.28;
        let x = f.x + Math.cos(ang) * 0.9;
        let y = f.y;
        let z = f.z + Math.sin(ang) * 0.9;
        let yaw = ang;
        let flap = 0;
        if (f.state === 'flying') {
          const t = f.timer;
          x += f.dirx * t * (4 + (b % 3)) + Math.sin(t * 2 + b) * 1.2;
          z += f.dirz * t * (4 + (b % 3)) + Math.cos(t * 2 + b) * 1.2;
          y += t * (2.4 + (b % 2) * 0.8);
          yaw = Math.atan2(-f.dirx, -f.dirz);
          flap = Math.sin(time * 22 + idx) * 0.45;
        }
        this.q.setFromAxisAngle(UP, yaw);
        this.m4.compose(this.pos.set(x, y, z), this.q, this.scl.set(1, 1 + flap, 1));
        mesh.setMatrixAt(n++, this.m4);
      }
    }
    this.scl.setScalar(1);
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.removeConfetti();
    this.removeFlags();
    for (const id of this.obstacleIds) this.course.obstacles.remove(id);
    for (const m of [this.walkerMesh, this.pedMesh, this.yakMesh, this.birdMesh, this.coneMesh, this.markerMesh, this.drainMesh, ...this.parkedMeshes]) if (m) this.scene.remove(m);
    for (const o of this.officers) this.scene.remove(o.group);
    for (const g of this.signalGroups) this.scene.remove(g);
    this.disposables.forEach((d) => d.dispose());
  }
}
