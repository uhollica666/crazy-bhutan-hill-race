import { actorGround } from './grounding';
import { createCreatureArt } from './creatureArt';
import type { CreatureArt } from './creatureArt';
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
  SphereGeometry,
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
} from './vehicleBodies';
import { createStaticVehicle } from './VehicleModel';
import { yakGeometry } from './Scenery';
import { RoadsideView } from './RoadsideView';
import { busGeometry, bicycleGeometry, deliveryGeometry, kioskGeometry, minibusGeometry, motoGeometry, scooterGeometry, suvGeometry, truckGeometry, workshopGeometry } from './trafficBodies';
import type { TrafficKind } from '../data/types';
import { tractorGeometry } from './valleyBodies';
import { ploughGeometry } from './snowBodies';
import { createBearArt, logGeometry } from './nightBodies';
import { TRAFFIC_KINDS } from '../gameplay/Traffic';
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
  private readonly col = new Color();
  private readonly q = new Quaternion();
  private readonly pos = new Vector3();
  private readonly scl = new Vector3(1, 1, 1);

  // Hazards.
  private rocks: InstancedMesh | null = null;
  private drifts: InstancedMesh | null = null;
  private readonly creatures: { h: HazardState; mesh: Group; art: CreatureArt; bubble: Sprite; ghost: boolean; scale: number }[] = [];
  private logs: InstancedMesh | null = null;
  private glow: InstancedMesh | null = null;
  private night = false;
  private readonly herds: { h: HazardState; mesh: InstancedMesh }[] = [];
  private lorries: { mesh: Mesh; tri: Mesh }[] = [];
  private readonly signs: { group: Group; dispose: () => void }[] = [];

  // Traffic.
  private readonly kindMeshes = new Map<TrafficKind, InstancedMesh>();
  private roadside: RoadsideView | null = null;
  private rival: { group: Group; label: Sprite; dispose: () => void } | null = null;

  constructor(
    private readonly scene: Scene,
    private readonly rt: MissionRuntime,
    /** 0..1 population scale from the graphics quality. */
    private readonly density = 1,
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
      const isPickup = stop.def.kind === 'pickup' || stop.def.kind === 'dropoff';
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
        // Tourists wait on a broad verge or lay-by when there is one, otherwise just behind the parapet.
        const hwS = road.halfWidthAtS(stop.s);
        const wlS = road.wallAtS(stop.s);
        const lat = side * (wlS - hwS >= 3 ? hwS + 2.4 : wlS + 3.4);
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
        const lat = side * (road.wallAtS(stop.s) + 11);
        const bx = pose.x + rx * lat;
        const bz = pose.z + rz * lat;
        const variant = stop.def.variant ?? 'fuel';
        const geo = variant === 'workshop' ? workshopGeometry() : variant === 'kiosk' ? kioskGeometry() : stationGeometry();
        const mat = new MeshLambertMaterial({ vertexColors: true });
        const b = new Mesh(geo, mat);
        const board = labelSprite(variant === 'workshop' ? 'REPAIR WORKSHOP' : variant === 'kiosk' ? 'TEA & FUEL' : 'FUEL STATION', variant === 'workshop' ? '#2f5f8f' : variant === 'kiosk' ? '#8c2a20' : '#2a6a45');
        board.position.set(0, variant === 'workshop' ? 11 : 8.4, 0);
        board.scale.set(9, 1.9, 1);
        b.add(board);
        this.disposables.push({ dispose: () => (board.material as SpriteMaterial).map?.dispose() }, board.material as SpriteMaterial);
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
          ? h.def.drift
            ? 'SNOWDRIFT AHEAD'
            : h.def.log
              ? 'FALLEN TREES'
              : 'ROCKFALL AREA'
          : h.def.kind === 'creature'
            ? h.def.variant === 'ghost'
              ? 'SPIRIT CROSSING'
              : h.def.variant === 'zombie'
                ? 'SOMETHING ON THE ROAD'
                : h.def.variant === 'figure'
                  ? 'STRANGE LIGHT AHEAD'
                  : h.def.variant === 'bear'
                    ? 'BEAR CROSSING'
                    : 'YETI CROSSING'
            : h.def.kind === 'herd'
              ? 'ANIMALS ON ROAD'
              : 'BROKEN DOWN VEHICLE';
      const sign = buildSign(label, '#f0c23a', '#2a2220');
      road.at(h.s - (h.def.kind === 'brokenTruck' ? 50 : 80), pose);
      const lat = -h.side * (road.wallAtS(h.s) + 1.2);
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
      if (hz.hazards.some((h) => h.def.kind === 'landslide' && h.def.drift)) {
        const dgeo = new GeoBuilder().rock(0xf3f7fa, { sy: 0.6 }).rock(0xe1e9ef, { x: 0.55, y: 0.15, z: 0.2, sx: 0.65, sy: 0.45, sz: 0.65 }).build();
        this.drifts = new InstancedMesh(dgeo, new MeshLambertMaterial({ vertexColors: true }), 32);
        this.drifts.count = 0;
        this.drifts.frustumCulled = false;
        this.group.add(this.drifts);
        this.disposables.push(dgeo, this.drifts.material as MeshLambertMaterial);
      }
      if (hz.hazards.some((h) => h.def.kind === 'landslide' && h.def.log)) {
        const lgeo = logGeometry();
        this.logs = new InstancedMesh(lgeo, new MeshLambertMaterial({ vertexColors: true }), 32);
        this.logs.count = 0;
        this.logs.frustumCulled = false;
        this.group.add(this.logs);
        this.disposables.push(lgeo, this.logs.material as MeshLambertMaterial);
      }
    }
    const creatureHazards = hz.hazards.filter((h) => h.def.kind === 'creature');
    if (creatureHazards.length) {
      for (const h of creatureHazards) {
        const v = h.def.variant ?? 'yeti';
        const spirit = v === 'ghost' || v === 'figure';
        // The imported art covers the yeti, the ghost and the zombie; a lantern figure is drawn as a spirit, a bear has its own model.
        const art = v === 'bear' ? createBearArt() : createCreatureArt(spirit ? 'ghost' : v === 'zombie' ? 'zombie' : 'yeti');
        const mesh = art.group;
        this.disposables.push(art);
        mesh.visible = false;
        const text = v === 'ghost' ? 'Whooo~' : v === 'zombie' ? 'Uhhhh...' : v === 'figure' ? 'Psst...' : v === 'bear' ? 'Grr?' : 'Hello!';
        const bubble = labelSprite(text, spirit ? '#3b4a7a' : v === 'zombie' ? '#4a6a3a' : '#2e7d9a');
        bubble.visible = false;
        this.group.add(mesh, bubble);
        this.creatures.push({ h, mesh, art, bubble, ghost: v === 'ghost', scale: v === 'zombie' ? 1.75 : v === 'bear' ? 0.9 : v === 'figure' ? 0.7 : 0.62 });
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
      tri.position.set(back.x - back.tz * (h.side * road.halfWidthAtS(h.s) * 0.5), this.ground(back.x, back.z) + 0.4, back.z + back.tx * (h.side * road.halfWidthAtS(h.s) * 0.5));
      this.group.add(mesh, tri);
      this.lorries.push({ mesh, tri });
      this.disposables.push(geo, mat, triGeo, tri.material as MeshBasicMaterial);
    }
  }

  // --------------------------------------------------------------------------- traffic

  private buildTraffic(): void {
    const { rt } = this;
    if (rt.traffic) {
      const def = rt.course.level.traffic;
      const kinds: TrafficKind[] = def?.mix?.length ? def.mix.map((m) => m.kind) : ['car'];
      for (const s of def?.scripted ?? []) if (!kinds.includes(s.kind)) kinds.push(s.kind);
      // Cross traffic released by a police signal and turning cars use these bodies.
      if (def?.controls?.some((c) => c.kind === 'police') || (def?.turnChance ?? 0) > 0) for (const k of ['car', 'taxi', 'suv', 'scooter'] as TrafficKind[]) if (!kinds.includes(k)) kinds.push(k);
      const make: Record<TrafficKind, () => import('three').BufferGeometry> = { car: trafficCarGeometry, suv: suvGeometry, bus: busGeometry, truck: truckGeometry, moto: motoGeometry, bike: bicycleGeometry, taxi: trafficCarGeometry, minibus: minibusGeometry, scooter: scooterGeometry, delivery: deliveryGeometry, tractor: tractorGeometry, plough: ploughGeometry };
      const palette = [0xd6322b, 0x2f6fd0, 0xe8b53a, 0x2e9c4f, 0xf1f1ec, 0x4a4f5a];
      const c = new Color();
      for (const kind of kinds) {
        if (this.kindMeshes.has(kind)) continue;
        const geo = make[kind]();
        const mat = new MeshLambertMaterial({ vertexColors: true });
        const mesh = new InstancedMesh(geo, mat, 20);
        mesh.count = 0;
        mesh.frustumCulled = false;
        for (let i = 0; i < 20; i++) mesh.setColorAt(i, c.setHex(palette[i % palette.length]));
        this.group.add(mesh);
        this.kindMeshes.set(kind, mesh);
        this.disposables.push(geo, mat);
      }
      // Vehicle lamps for the night: pale headlights that glare as an oncoming car nears, red tail lights on cars ahead.
      const glowGeo = new SphereGeometry(0.2, 8, 6);
      const glowMat = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, blending: AdditiveBlending, depthWrite: false, fog: false });
      this.glow = new InstancedMesh(glowGeo, glowMat, 44);
      this.glow.count = 0;
      this.glow.frustumCulled = false;
      this.glow.renderOrder = 6;
      for (let i = 0; i < 44; i++) this.glow.setColorAt(i, new Color(0xfff0c0));
      this.group.add(this.glow);
      this.disposables.push(glowGeo, glowMat);
    }
    if (rt.course.level.roadside) {
      this.roadside = new RoadsideView(this.scene, rt.course, this.density);
      this.roadside.attach(rt.traffic);
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

  private lastTime = 0;
  private lastDt = 0.016;

  /** The arrival celebration: the crowd cheers and (unless `intensity` is 0) confetti falls. */
  celebrate(on: boolean, intensity: number): void {
    this.roadside?.celebrate(on, intensity);
  }

  update(time: number): void {
    this.lastDt = Math.min(0.1, Math.max(0, time - this.lastTime));
    this.lastTime = time;
    const rt = this.rt;
    // Stops: people fade when boarded, the marker beam pulses on the current target.
    const gate = rt.stops.gate;
    const pulse = 0.75 + 0.25 * Math.sin(time * 3.2);
    for (const v of this.stopVisuals) {
      const st = v.stop;
      const people = st.def.kind === 'pickup' || st.def.kind === 'dropoff';
      const done = people && st.state === 'done';
      const isTarget = people ? st === gate : true;
      v.zone.visible = !done && (isTarget || st.def.kind === 'service');
      v.beam.visible = v.zone.visible && (people ? st === gate : false);
      if (v.people) {
        // Pickup groups wait until boarded; a dropped-off group appears on the verge once it has got out.
        const shown = st.def.kind === 'dropoff' ? done : !done;
        v.people.visible = shown;
        if (shown) {
          const n = v.people.count;
          for (let i = 0; i < n; i++) {
            // Little hop of impatience while waiting; wave when the car is close.
            const bob = Math.abs(Math.sin(time * 3 + i * 1.7)) * 0.08;
            const x=v.px+Math.cos(v.heading)*(i-(n-1)/2)*0.85;
            const z=v.pz-Math.sin(v.heading)*(i-(n-1)/2)*0.85;
            this.v3(x,actorGround(this.rt.course,x,z,v.heading)+bob,z);
            this.q.setFromAxisAngle(UP, v.heading);
            this.m4.compose(this.pos, this.q, this.scl);
            v.people.setMatrixAt(i, this.m4);
          }
          v.people.instanceMatrix.needsUpdate = true;
        }
      }
      if (v.luggage) v.luggage.visible = st.def.kind === 'dropoff' ? done : !done;
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
        let nd = 0;
        let nl = 0;
        for (const h of hz.hazards) {
          const drift = !!h.def.drift && !!this.drifts;
          const log = !!h.def.log && !!this.logs;
          for (const b of h.boulders) {
            if ((log ? nl : drift ? nd : n) >= 32) break;
            const gy = this.ground(b.x, b.z);
            this.v3(b.x, gy + b.r * (log ? 0.2 : drift ? 0.38 : 0.55) + b.y, b.z);
            this.q.setFromAxisAngle(UP, log ? (b.x * 0.9 + b.z * 0.5) % 3.14 : (b.x + b.z) * 0.37);
            if (log) this.scl.setScalar(b.r * 0.9);
            else if (drift) this.scl.set(b.r * 1.2, b.r * 0.75, b.r * 1.2);
            else this.scl.setScalar(b.r);
            this.m4.compose(this.pos, this.q, this.scl);
            if (log) this.logs!.setMatrixAt(nl++, this.m4);
            else if (drift) this.drifts!.setMatrixAt(nd++, this.m4);
            else this.rocks.setMatrixAt(n++, this.m4);
          }
        }
        if (this.logs) {
          this.logs.count = nl;
          this.logs.instanceMatrix.needsUpdate = true;
        }
        this.scl.setScalar(1);
        this.rocks.count = n;
        this.rocks.instanceMatrix.needsUpdate = true;
        if (this.drifts) {
          this.drifts.count = nd;
          this.drifts.instanceMatrix.needsUpdate = true;
        }
      }
      for (const cr of this.creatures) {
        const c = cr.h.creature;
        cr.mesh.visible = !!c;
        cr.bubble.visible = !!c && ((cr.h.phase === 'crossing' && Math.abs(c.lateral) < 3) || c.shrug > 0);
        if (c) {
          cr.art.update(time, c.shrug);
          const bob = cr.ghost ? 0.5 + Math.sin(time * 2.2) * 0.25 : Math.abs(Math.sin(time * 5)) * 0.06;
          cr.mesh.position.set(c.x, actorGround(this.rt.course,c.x,c.z,c.heading,0.32,0.27) + bob, c.z);
          cr.mesh.rotation.y = c.heading + Math.PI;
          cr.mesh.scale.setScalar(cr.scale);
          cr.bubble.position.set(c.x, cr.mesh.position.y + 3.6, c.z);
        }
      }
      for (const hd of this.herds) {
        const herd = hd.h.herd;
        const n = herd ? Math.min(6, herd.length) : 0;
        for (let i = 0; i < n; i++) {
          const a = herd![i];
          const sway = a.frozen || a.across ? 0 : Math.sin(time * 4 + i * 1.9) * 0.05;
          this.v3(a.x, actorGround(this.rt.course,a.x,a.z,a.heading,0.35,0.72) + sway, a.z);
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
    if (this.kindMeshes.size && rt.traffic) {
      const cars = rt.traffic.cars;
      const used = new Map<TrafficKind, number>();
      let gi = 0;
      const bp = rt.body.position;
      for (const c of cars) {
        const mesh = this.kindMeshes.get(c.kind);
        if (!mesh) continue;
        const n = used.get(c.kind) ?? 0;
        if (n >= 20) continue;
        used.set(c.kind, n + 1);
        this.v3(c.x, this.ground(c.x, c.z), c.z);
        this.q.setFromAxisAngle(UP, c.heading);
        this.m4.compose(this.pos, this.q, this.scl);
        mesh.setMatrixAt(n, this.m4);
        const palette = paletteFor(c.kind);
        mesh.setColorAt(n, palette[c.colorIndex % palette.length]);
        if (this.glow && this.night && gi < 43) {
          const dist = Math.hypot(c.x - bp.x, c.z - bp.z);
          if (dist < 170) {
            const spec = TRAFFIC_KINDS[c.kind];
            const fx = -Math.sin(c.heading);
            const fz = -Math.cos(c.heading);
            const rx = Math.cos(c.heading);
            const rz = -Math.sin(c.heading);
            const front = c.dir === -1;
            const sgn = front ? 1 : -1;
            const half = spec.len / 2;
            const lamp = front ? 0xfff0c0 : 0xff3322;
            const glare = front ? 0.9 + 3.4 * Math.min(1, Math.max(0, 1 - dist / 75)) : 0.7;
            const gy = this.ground(c.x, c.z) + (c.kind === 'bus' || c.kind === 'truck' ? 1.1 : c.kind === 'moto' || c.kind === 'scooter' || c.kind === 'bike' ? 0.7 : 0.85);
            for (const side of c.kind === 'moto' || c.kind === 'scooter' || c.kind === 'bike' ? [0] : [-0.6, 0.6]) {
              this.pos.set(c.x + fx * half * sgn + rx * side, gy, c.z + fz * half * sgn + rz * side);
              this.q.identity();
              this.scl.setScalar(glare);
              this.m4.compose(this.pos, this.q, this.scl);
              this.glow.setMatrixAt(gi, this.m4);
              this.glow.setColorAt(gi, this.col.setHex(lamp));
              gi++;
            }
            this.scl.setScalar(1);
          }
        }
      }
      if (this.glow) {
        this.glow.count = this.night ? gi : 0;
        this.glow.instanceMatrix.needsUpdate = true;
        if (this.glow.instanceColor) this.glow.instanceColor.needsUpdate = true;
      }
      for (const [kind, mesh] of this.kindMeshes) {
        mesh.count = used.get(kind) ?? 0;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
    }
    this.roadside?.update(time, this.lastDt, rt.body.position.x, rt.body.position.z);
    if (this.rival && rt.rival) {
      const st = rt.rival.state;
      this.rival.group.position.set(st.x, this.ground(st.x, st.z) + 1.35, st.z);
      this.rival.group.rotation.y = st.heading;
    }
  }

  /** Lamps on the other traffic are lit when the headlights are on (night, fog, heavy rain). */
  setNight(on: boolean): void {
    this.night = on;
  }

  private v3(x: number, y: number, z: number): void {
    this.pos.set(x, y, z);
  }

  dispose(): void {
    this.scene.remove(this.group);
    this.signs.forEach((s) => s.dispose());
    this.roadside?.dispose();
    this.roadside = null;
    this.rival?.dispose();
    this.disposables.forEach((d) => d.dispose());
    this.group.clear();
  }
}

const COLORS = [0xd6322b, 0x2f6fd0, 0xe8b53a, 0x2e9c4f, 0xf1f1ec, 0x4a4f5a].map((h) => new Color(h));
const paletteFor = (kind: TrafficKind): Color[] => (kind === 'taxi' ? TAXI_COLORS : kind === 'bus' || kind === 'minibus' ? BUS_COLORS : kind === 'delivery' ? DELIVERY_COLORS : kind === 'tractor' ? TRACTOR_COLORS : kind === 'plough' ? PLOUGH_COLORS : COLORS);

/** Thimphu taxis are pale blue; coaches are white; delivery vans are plain. */
const TAXI_COLORS = [0x7fb6e0, 0x7fb6e0, 0xf1f1ec, 0x7fb6e0].map((h) => new Color(h));
const BUS_COLORS = [0xffffff, 0xf4efe2, 0xf3d9c8, 0xdfe9f3].map((h) => new Color(h));
const PLOUGH_COLORS = [0xf0b429, 0xf0b429, 0xe8761a, 0xf4c542].map((h) => new Color(h));
const TRACTOR_COLORS = [0xc23a2c, 0x3f8f4a, 0xd6a02a, 0x2f6fd0].map((h) => new Color(h));
const DELIVERY_COLORS = [0xffffff, 0xf1f1ec, 0xe8b53a, 0xd9e6d2].map((h) => new Color(h));

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
