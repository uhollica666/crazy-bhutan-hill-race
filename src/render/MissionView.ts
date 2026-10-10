import {
  AdditiveBlending,
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
  Quaternion,
  Scene,
  ShaderMaterial,
  LineSegments,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { getCast } from '../data/story';
import { getVehicle } from '../data/vehicles';
import type { StopRuntime } from '../gameplay/Stops';
import type { MissionRuntime } from '../gameplay/MissionRuntime';
import { mulberry32 } from '../core/math';
import {
  lorryGeometry,
  luggageGeometry,
  stationGeometry,
  touristGeometry,
  trafficCarGeometry,
  yetiGeometry,
} from './vehicleBodies';
import { createStaticVehicle } from './VehicleModel';
import { yakGeometry } from './Scenery';
import type { HazardState } from '../gameplay/Hazards';
import { GeoBuilder } from './geo';
import { PAL } from './palette';

const UP = new Vector3(0, 1, 0);

function signTexture(text: string, bg: string, fg: string): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 144;
  const g = c.getContext('2d')!;
  g.fillStyle = bg;
  g.fillRect(0, 0, 256, 144);
  g.strokeStyle = fg;
  g.lineWidth = 8;
  g.strokeRect(8, 8, 240, 128);
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const words = text.split(' ');
  const lines = words.length > 2 ? [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.ceil(words.length / 2)).join(' ')] : words;
  g.font = `800 ${lines.length > 1 ? 36 : 44}px Georgia, serif`;
  lines.forEach((l, i) => g.fillText(l, 128, 72 + (i - (lines.length - 1) / 2) * 42));
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

function labelSprite(text: string, bg = '#1d2f5c'): Sprite {
  const c = document.createElement('canvas');
  c.width = 384;
  c.height = 80;
  const g = c.getContext('2d')!;
  g.fillStyle = bg;
  g.beginPath();
  g.roundRect(4, 4, 376, 72, 18);
  g.fill();
  g.strokeStyle = '#dca72c';
  g.lineWidth = 5;
  g.stroke();
  g.fillStyle = '#fbf1d8';
  g.font = '800 40px Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 192, 42);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  const s = new Sprite(new SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
  s.scale.set(7.2, 1.5, 1);
  return s;
}

/** A warning sign on two posts. */
function buildSign(text: string, bg: string, fg: string): { group: Group; dispose: () => void } {
  const g = new Group();
  const tex = signTexture(text, bg, fg);
  const face = new MeshBasicMaterial({ map: tex, side: DoubleSide });
  const board = new Mesh(new PlaneGeometry(2.8, 1.6), face);
  board.position.y = 2.7;
  const postsGeo = new GeoBuilder().cylinder(0.06, 0.06, 3.3, PAL.woodDark, 5, { x: -1.1, y: 1.65 }).cylinder(0.06, 0.06, 3.3, PAL.woodDark, 5, { x: 1.1, y: 1.65 }).build();
  const posts = new Mesh(postsGeo, new MeshLambertMaterial({ vertexColors: true }));
  g.add(board, posts);
  return {
    group: g,
    dispose: () => {
      tex.dispose();
      face.dispose();
      board.geometry.dispose();
      postsGeo.dispose();
      (posts.material as MeshLambertMaterial).dispose();
    },
  };
}

interface StopVisual {
  stop: StopRuntime;
  people: InstancedMesh | null;
  luggage: Mesh | null;
  zone: Mesh;
  beam: Mesh;
  building: Mesh | null;
  baseY: number;
  px: number;
  pz: number;
  heading: number;
}

/** Everything in the world that belongs to the mission rather than the level: people, stations, hazards, traffic. */
export class MissionView {
  readonly group = new Group();
  private readonly disposables: { dispose(): void }[] = [];
  private readonly stopVisuals: StopVisual[] = [];
  private readonly zoneMat = new MeshBasicMaterial({ color: 0xf6c452, transparent: true, opacity: 0.28, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, fog: false });
  private readonly zoneMatBlue = new MeshBasicMaterial({ color: 0x59b8e8, transparent: true, opacity: 0.26, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, fog: false });
  private readonly beamMat = new MeshBasicMaterial({ color: 0xf6c452, transparent: true, opacity: 0.18, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, fog: false });
  private readonly beamMatBlue = new MeshBasicMaterial({ color: 0x59b8e8, transparent: true, opacity: 0.16, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, fog: false });
  private readonly m4 = new Matrix4();
  private readonly q = new Quaternion();
  private readonly pos = new Vector3();
  private readonly scl = new Vector3(1, 1, 1);

  // Hazards.
  private rocks: InstancedMesh | null = null;
  private readonly creatures: { h: HazardState; mesh: Mesh; bubble: Sprite; ghost: boolean }[] = [];
  private readonly herds: { h: HazardState; mesh: InstancedMesh }[] = [];
  private lorries: { mesh: Mesh; tri: Mesh }[] = [];
  private readonly signs: { group: Group; dispose: () => void }[] = [];

  // Traffic.
  private cars: InstancedMesh | null = null;
  private rival: { group: Group; label: Sprite; dispose: () => void } | null = null;

  constructor(
    private readonly scene: Scene,
    private readonly rt: MissionRuntime,
  ) {
    this.group.name = 'mission';
    scene.add(this.group);
    this.buildStops();
    this.buildHazards();
    this.buildTraffic();
  }

  private ground(x: number, z: number): number {
    return this.rt.course.terrain.heightAt(x, z);
  }

  // --------------------------------------------------------------------------- stops

  private buildStops(): void {
    const { rt } = this;
    const road = rt.course.road;
    const pose = { x: 0, y: 0, z: 0, tx: 0, tz: -1 };
    const zoneGeo = new PlaneGeometry(road.halfWidth * 2, 18);
    zoneGeo.rotateX(-Math.PI / 2);
    const beamGeo = new CylinderGeometry(1.6, 1.6, 15, 14, 1, true);
    this.disposables.push(zoneGeo, beamGeo, this.zoneMat, this.zoneMatBlue, this.beamMat, this.beamMatBlue);

    for (const stop of rt.stops.stops) {
      road.at(stop.s, pose);
      const rx = -pose.tz;
      const rz = pose.tx;
      const heading = Math.atan2(pose.tx, pose.tz);
      const isPickup = stop.def.kind === 'pickup';
      const side = stop.def.side;

      const zone = new Mesh(zoneGeo, isPickup ? this.zoneMat : this.zoneMatBlue);
      zone.position.set(pose.x, this.ground(pose.x, pose.z) + 0.16, pose.z);
      zone.rotation.y = heading;
      zone.renderOrder = 3;
      const beam = new Mesh(beamGeo, isPickup ? this.beamMat : this.beamMatBlue);
      beam.position.set(pose.x, this.ground(pose.x, pose.z) + 7.5, pose.z);
      beam.renderOrder = 4;
      this.group.add(zone, beam);

      const vis: StopVisual = { stop, people: null, luggage: null, zone, beam, building: null, baseY: 0, px: 0, pz: 0, heading: 0 };

      if (isPickup) {
        const lat = side * (road.wallOffset + 3.4);
        const cx = pose.x + rx * lat;
        const cz = pose.z + rz * lat;
        const cast = getCast(stop.def.who ?? '');
        const p = cast?.portrait;
        const geo = touristGeometry(p?.scarf ?? 0xd6322b, p?.skin ?? 0xe8b890, p?.hair ?? 0x3b2a20, p?.hat ?? null, 0x2f6fd0);
        const party = stop.def.party ?? 1;
        const people = new InstancedMesh(geo, new MeshLambertMaterial({ vertexColors: true }), party);
        const face = Math.atan2(-side * rx, -side * rz);
        const rng = mulberry32(stop.def.id.length * 131 + 7);
        for (let i = 0; i < party; i++) {
          const ox = (i - (party - 1) / 2) * 0.85 + (rng() - 0.5) * 0.2;
          const px = cx + pose.tx * ox;
          const pz = cz + pose.tz * ox;
          this.q.setFromAxisAngle(UP, face + (rng() - 0.5) * 0.4);
          this.m4.compose(this.pos.set(px, this.ground(px, pz), pz), this.q, this.scl);
          people.setMatrixAt(i, this.m4);
        }
        people.instanceMatrix.needsUpdate = true;
        people.frustumCulled = false;
        const lugGeo = luggageGeometry();
        const luggage = new Mesh(lugGeo, new MeshLambertMaterial({ vertexColors: true }));
        luggage.position.set(cx - side * rx * 1.4, this.ground(cx, cz), cz - side * rz * 1.4);
        luggage.rotation.y = face;
        this.group.add(people, luggage);
        vis.people = people;
        vis.luggage = luggage;
        vis.px = cx;
        vis.pz = cz;
        vis.baseY = this.ground(cx, cz);
        vis.heading = face;
        this.disposables.push(geo, lugGeo, people.material as MeshLambertMaterial, luggage.material as MeshLambertMaterial);
      } else {
        const lat = side * (road.wallOffset + 11);
        const bx = pose.x + rx * lat;
        const bz = pose.z + rz * lat;
        const geo = stationGeometry();
        const mat = new MeshLambertMaterial({ vertexColors: true });
        const b = new Mesh(geo, mat);
        b.position.set(bx, this.ground(bx, bz), bz);
        b.rotation.y = Math.atan2(-side * rx, -side * rz);
        this.group.add(b);
        vis.building = b;
        this.disposables.push(geo, mat);
      }
      this.stopVisuals.push(vis);
    }
  }

  // ------------------------------------------------------------------------- hazards

  private buildHazards(): void {
    const hz = this.rt.hazards;
    if (!hz) return;
    const road = this.rt.course.road;
    const pose = { x: 0, y: 0, z: 0, tx: 0, tz: -1 };
    for (const h of hz.hazards) {
      const label =
        h.def.kind === 'landslide'
          ? 'ROCKFALL AREA'
          : h.def.kind === 'creature'
            ? h.def.variant === 'ghost'
              ? 'SPIRIT CROSSING'
              : 'YETI CROSSING'
            : h.def.kind === 'herd'
              ? 'ANIMALS ON ROAD'
              : 'BROKEN DOWN VEHICLE';
      const sign = buildSign(label, '#f0c23a', '#2a2220');
      road.at(h.s - (h.def.kind === 'brokenTruck' ? 50 : 80), pose);
      const lat = -h.side * (road.wallOffset + 1.2);
      sign.group.position.set(pose.x - pose.tz * lat, this.ground(pose.x - pose.tz * lat, pose.z + pose.tx * lat), pose.z + pose.tx * lat);
      sign.group.rotation.y = Math.atan2(-pose.tx, -pose.tz);
      this.group.add(sign.group);
      this.signs.push(sign);
    }
    if (hz.hazards.some((h) => h.def.kind === 'landslide')) {
      const geo = new GeoBuilder().rock(0x8b857a, { sy: 0.8 }).rock(0x77716a, { x: 0.5, y: 0.3, z: 0.2, sx: 0.6, sy: 0.5, sz: 0.6 }).build();
      this.rocks = new InstancedMesh(geo, new MeshLambertMaterial({ vertexColors: true, flatShading: true }), 32);
      this.rocks.count = 0;
      this.rocks.frustumCulled = false;
      this.group.add(this.rocks);
      this.disposables.push(geo, this.rocks.material as MeshLambertMaterial);
    }
    const creatureHazards = hz.hazards.filter((h) => h.def.kind === 'creature');
    if (creatureHazards.length) {
      const geo = yetiGeometry();
      const yetiMat = new MeshLambertMaterial({ vertexColors: true });
      // The lantern spirit: the same friendly silhouette, pale and softly glowing (it is not frightening).
      const ghostMat = new MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.55, emissive: 0x9fd8ff, emissiveIntensity: 0.55, depthWrite: false });
      this.disposables.push(geo, yetiMat, ghostMat);
      for (const h of creatureHazards) {
        const ghost = h.def.variant === 'ghost';
        const mesh = new Mesh(geo, ghost ? ghostMat : yetiMat);
        mesh.visible = false;
        const bubble = labelSprite(ghost ? 'Whooo~' : 'Hello!', ghost ? '#3b4a7a' : '#2e7d9a');
        bubble.visible = false;
        this.group.add(mesh, bubble);
        this.creatures.push({ h, mesh, bubble, ghost });
      }
    }
    const herdHazards = hz.hazards.filter((h) => h.def.kind === 'herd');
    if (herdHazards.length) {
      const geo = yakGeometry();
      const mat = new MeshLambertMaterial({ vertexColors: true });
      this.disposables.push(geo, mat);
      for (const h of herdHazards) {
        const mesh = new InstancedMesh(geo, mat, 6);
        mesh.count = 0;
        mesh.frustumCulled = false;
        this.group.add(mesh);
        this.herds.push({ h, mesh });
      }
    }
    for (const h of hz.hazards) {
      if (h.def.kind !== 'brokenTruck' || !h.truck) continue;
      const geo = lorryGeometry();
      const mat = new MeshLambertMaterial({ vertexColors: true });
      const mesh = new Mesh(geo, mat);
      mesh.position.set(h.truck.x, this.ground(h.truck.x, h.truck.z), h.truck.z);
      mesh.rotation.y = h.truck.heading;
      const triGeo = new CylinderGeometry(0, 0.5, 0.8, 3);
      const tri = new Mesh(triGeo, new MeshBasicMaterial({ color: 0xd6322b }));
      const back = road.at(h.s - 9, pose);
      tri.position.set(back.x - back.tz * (h.side * road.halfWidth * 0.5), this.ground(back.x, back.z) + 0.4, back.z + back.tx * (h.side * road.halfWidth * 0.5));
      this.group.add(mesh, tri);
      this.lorries.push({ mesh, tri });
      this.disposables.push(geo, mat, triGeo, tri.material as MeshBasicMaterial);
    }
  }

  // --------------------------------------------------------------------------- traffic

  private buildTraffic(): void {
    const { rt } = this;
    if (rt.traffic) {
      const geo = trafficCarGeometry();
      const mat = new MeshLambertMaterial({ vertexColors: true });
      this.cars = new InstancedMesh(geo, mat, 20);
      this.cars.count = 0;
      this.cars.frustumCulled = false;
      const palette = [0xd6322b, 0x2f6fd0, 0xe8b53a, 0x2e9c4f, 0xf1f1ec, 0x4a4f5a];
      const c = new Color();
      for (let i = 0; i < 20; i++) this.cars.setColorAt(i, c.setHex(palette[i % palette.length]));
      this.group.add(this.cars);
      this.disposables.push(geo, mat);
    }
    if (rt.rival) {
      const def = getVehicle(rt.rival.def.vehicleId);
      const st = createStaticVehicle(def, { body: 0xf5f5f0, accent: 0x2e9c4f, trim: 0x1d2f5c });
      const label = labelSprite(rt.rival.def.name.toUpperCase(), '#2a6a45');
      label.position.y = def.size.height + 2.8;
      st.group.add(label);
      this.group.add(st.group);
      this.rival = { group: st.group, label, dispose: st.dispose };
    }
  }

  // ---------------------------------------------------------------------------- update

  update(time: number): void {
    const rt = this.rt;
    // Stops: people fade when boarded, the marker beam pulses on the current target.
    const gate = rt.stops.gate;
    const pulse = 0.75 + 0.25 * Math.sin(time * 3.2);
    for (const v of this.stopVisuals) {
      const st = v.stop;
      const done = st.def.kind === 'pickup' && st.state === 'done';
      const isTarget = st.def.kind === 'pickup' ? st === gate : true;
      v.zone.visible = !done && (isTarget || st.def.kind === 'service');
      v.beam.visible = v.zone.visible && (st.def.kind === 'pickup' ? st === gate : false);
      if (v.people) {
        v.people.visible = !done;
        if (!done) {
          const n = v.people.count;
          for (let i = 0; i < n; i++) {
            // Little hop of impatience while waiting; wave when the car is close.
            const bob = Math.abs(Math.sin(time * 3 + i * 1.7)) * 0.08;
            this.v3(v.px + Math.cos(v.heading) * (i - (n - 1) / 2) * 0.85, v.baseY + bob, v.pz - Math.sin(v.heading) * (i - (n - 1) / 2) * 0.85);
            this.q.setFromAxisAngle(UP, v.heading);
            this.m4.compose(this.pos, this.q, this.scl);
            v.people.setMatrixAt(i, this.m4);
          }
          v.people.instanceMatrix.needsUpdate = true;
        }
      }
      if (v.luggage) v.luggage.visible = !done;
      v.zone.scale.set(1, 1, 1);
      (v.zone.material as MeshBasicMaterial).opacity = (st.state === 'active' ? 0.4 : 0.22) * pulse + 0.06;
    }
    this.beamMat.opacity = 0.14 * pulse + 0.06;
    this.beamMatBlue.opacity = 0.12 * pulse + 0.05;

    // Hazards.
    const hz = rt.hazards;
    if (hz) {
      if (this.rocks) {
        let n = 0;
        for (const h of hz.hazards) {
          for (const b of h.boulders) {
            if (n >= 32) break;
            const gy = this.ground(b.x, b.z);
            this.v3(b.x, gy + b.r * 0.55 + b.y, b.z);
            this.q.setFromAxisAngle(UP, (b.x + b.z) * 0.37);
            this.scl.setScalar(b.r);
            this.m4.compose(this.pos, this.q, this.scl);
            this.rocks.setMatrixAt(n++, this.m4);
          }
        }
        this.scl.setScalar(1);
        this.rocks.count = n;
        this.rocks.instanceMatrix.needsUpdate = true;
      }
      for (const cr of this.creatures) {
        const c = cr.h.creature;
        cr.mesh.visible = !!c;
        cr.bubble.visible = !!c && ((cr.h.phase === 'crossing' && Math.abs(c.lateral) < 3) || c.shrug > 0);
        if (c) {
          const bob = cr.ghost ? 0.5 + Math.sin(time * 2.2) * 0.25 : Math.abs(Math.sin(time * 5)) * 0.06;
          cr.mesh.position.set(c.x, this.ground(c.x, c.z) + bob, c.z);
          cr.mesh.rotation.y = c.heading + Math.PI;
          cr.mesh.scale.setScalar(0.62);
          cr.bubble.position.set(c.x, cr.mesh.position.y + 3.6, c.z);
        }
      }
      for (const hd of this.herds) {
        const herd = hd.h.herd;
        const n = herd ? Math.min(6, herd.length) : 0;
        for (let i = 0; i < n; i++) {
          const a = herd![i];
          const sway = a.frozen || a.across ? 0 : Math.sin(time * 4 + i * 1.9) * 0.05;
          this.v3(a.x, this.ground(a.x, a.z) + sway, a.z);
          this.q.setFromAxisAngle(UP, a.heading + Math.PI);
          this.scl.setScalar(1.05 + (i % 3) * 0.06);
          this.m4.compose(this.pos, this.q, this.scl);
          hd.mesh.setMatrixAt(i, this.m4);
        }
        this.scl.setScalar(1);
        hd.mesh.count = n;
        hd.mesh.instanceMatrix.needsUpdate = true;
      }
    }

    // Traffic.
    if (this.cars && rt.traffic) {
      const cars = rt.traffic.cars;
      for (let i = 0; i < cars.length && i < 20; i++) {
        const c = cars[i];
        this.v3(c.x, this.ground(c.x, c.z), c.z);
        this.q.setFromAxisAngle(UP, c.heading);
        this.m4.compose(this.pos, this.q, this.scl);
        this.cars.setMatrixAt(i, this.m4);
        this.cars.setColorAt(i, COLORS[c.colorIndex % COLORS.length]);
      }
      this.cars.count = Math.min(20, cars.length);
      this.cars.instanceMatrix.needsUpdate = true;
      if (this.cars.instanceColor) this.cars.instanceColor.needsUpdate = true;
    }
    if (this.rival && rt.rival) {
      const st = rt.rival.state;
      this.rival.group.position.set(st.x, this.ground(st.x, st.z) + 1.35, st.z);
      this.rival.group.rotation.y = st.heading;
    }
  }

  private v3(x: number, y: number, z: number): void {
    this.pos.set(x, y, z);
  }

  dispose(): void {
    this.scene.remove(this.group);
    this.signs.forEach((s) => s.dispose());
    this.rival?.dispose();
    this.disposables.forEach((d) => d.dispose());
    this.group.clear();
  }
}

const COLORS = [0xd6322b, 0x2f6fd0, 0xe8b53a, 0x2e9c4f, 0xf1f1ec, 0x4a4f5a].map((h) => new Color(h));

// -------------------------------------------------------------------------------------------- rain

const RAIN_VERT = /* glsl */ `
uniform float uTime;
uniform vec3 uCam;
uniform vec3 uBox;
uniform float uStreak;
attribute vec3 aSeed;
attribute float aEnd;
varying float vAlpha;
void main() {
  vec3 p = aSeed * uBox;
  p.y -= uTime * (22.0 + aSeed.x * 6.0);
  p.x += uTime * 3.0;
  vec3 origin = uCam - uBox * 0.5;
  vec3 world = origin + mod(p - origin, uBox);
  world.y += aEnd * uStreak;
  world.x += aEnd * uStreak * 0.12;
  vec4 mv = viewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mv;
  vAlpha = (1.0 - smoothstep(25.0, 48.0, -mv.z)) * smoothstep(1.0, 4.0, -mv.z) * 0.75;
}`;
const RAIN_FRAG = /* glsl */ `
varying float vAlpha;
void main() { gl_FragColor = vec4(0.82, 0.88, 0.95, vAlpha); }`;

/** Rain: thin streaks animated entirely in the vertex shader. */
export class Rain {
  readonly lines: LineSegments;
  private readonly geo = new BufferGeometry();
  private readonly mat: ShaderMaterial;

  constructor(maxDrops = 900) {
    const seeds = new Float32Array(maxDrops * 2 * 3);
    const ends = new Float32Array(maxDrops * 2);
    for (let i = 0; i < maxDrops; i++) {
      const x = Math.random();
      const y = Math.random();
      const z = Math.random();
      for (let k = 0; k < 2; k++) {
        seeds.set([x, y, z], (i * 2 + k) * 3);
        ends[i * 2 + k] = k;
      }
    }
    this.geo.setAttribute('position', new Float32BufferAttribute(new Float32Array(maxDrops * 2 * 3), 3));
    this.geo.setAttribute('aSeed', new Float32BufferAttribute(seeds, 3));
    this.geo.setAttribute('aEnd', new Float32BufferAttribute(ends, 1));
    this.mat = new ShaderMaterial({
      vertexShader: RAIN_VERT,
      fragmentShader: RAIN_FRAG,
      transparent: true,
      depthWrite: false,
      fog: false,
      uniforms: { uTime: { value: 0 }, uCam: { value: new Vector3() }, uBox: { value: new Vector3(46, 28, 46) }, uStreak: { value: 0.9 } },
    });
    this.lines = new LineSegments(this.geo, this.mat);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 9;
    this.lines.visible = false;
  }

  /** `intensity` 0..1 and the quality cap on how many drops are drawn. */
  setIntensity(intensity: number, maxDrops: number): void {
    const n = Math.round(intensity * maxDrops);
    this.geo.setDrawRange(0, n * 2);
    this.lines.visible = n > 0;
  }

  update(time: number, camera: Vector3): void {
    this.mat.uniforms.uTime.value = time;
    (this.mat.uniforms.uCam.value as Vector3).copy(camera);
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}
