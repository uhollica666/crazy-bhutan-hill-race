import {
  AdditiveBlending,
  CanvasTexture,
  CircleGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  LOD,
  Quaternion,
  Vector3,
} from 'three';
import type { BufferGeometry, MeshStandardMaterial, Object3D } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { vehicleEnvironment } from './assets';
import { createCoachwork } from './coachwork';
import type { VehicleAsset } from './assets';
import type { VehicleDef } from '../data/types';
import type { VehicleBody } from '../physics/VehicleBody';
import type { PhysicsWorld } from '../physics/types';
import { createGroundSample } from '../world/Terrain';
import { LIGHT_LAYOUT } from './vehicleBodies';

/** Static coachwork shares the same authored proportions as the player. */
export function createStaticVehicle(def: VehicleDef, livery?: Partial<VehicleDef['livery']>): { group: Group; dispose: () => void } {
  const d = livery ? { ...def, livery: { ...def.livery, ...livery } } : def;
  const art = createCoachwork(d, true);
  const group = new Group(); group.add(art.body);
  for (const axle of d.axles) for (const side of [-1, 1]) {
    const wheel = art.wheel.clone(true);
    wheel.position.set(side * axle.halfTrack, axle.y - d.suspension.rest, axle.z);
    group.add(wheel);
  }
  return { group, dispose: () => {
    art.geometries.forEach(g => g.dispose()); art.materials.forEach(m => m.dispose());
  } };
}

function makeBlobTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  grd.addColorStop(0, 'rgba(0,0,0,0.55)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new CanvasTexture(c);
}

/** Procedural vehicle: 1 body + head/tail light meshes + 1 draw call per wheel. */
export class VehicleModel {
  readonly root = new Group();
  readonly blob: Mesh;
  /** Body, lights and rack ride on a child group so engine vibration never touches the wheels. */
  private readonly shell = new Group();
  private readonly pivots: Group[] = [];
  private readonly rolls: Object3D[] = [];
  private readonly lods: LOD[] = [];
  private readonly headMats: MeshStandardMaterial[] = [];
  private readonly tailMats: MeshStandardMaterial[] = [];
  /** True when the detailed glTF model is in use (false = procedural fallback). */
  readonly detailed: boolean;
  private readonly geos: BufferGeometry[] = [];
  private readonly mats: { dispose(): void }[] = [];
  private readonly tailMat = new MeshBasicMaterial({ color: 0x5a1416 });
  private readonly ground = createGroundSample();
  private readonly pos = new Vector3();
  private readonly quat = new Quaternion();
  private readonly up = new Vector3(0, 1, 0);
  private readonly n = new Vector3();
  private brakeGlow = 0;
  private readonly reverseMats: MeshStandardMaterial[] = [];
  private readonly indicatorMats: MeshStandardMaterial[][] = [[], []];
  private indicator: -1 | 0 | 1 = 0;

  /** Explicit signal command for future input/traffic integration; steering alone never signals. */
  setIndicator(side: -1 | 0 | 1): void { this.indicator = side; }
  private readonly beam: Mesh;

  constructor(
    private readonly def: VehicleDef,
    asset: VehicleAsset | null = null,
  ) {
    // The old GLB argument remains API-compatible; this remake owns the visible coachwork.
    void asset;
    this.detailed = true;
    const high = createCoachwork(def), low = createCoachwork(def, true);
    const bodyLOD = new LOD(); bodyLOD.addLevel(high.body, 0); bodyLOD.addLevel(low.body, 38, 0.12);
    this.lods.push(bodyLOD);
    this.shell.add(bodyLOD); this.root.add(this.shell);
    for (const art of [high, low]) {
      this.geos.push(...art.geometries); this.mats.push(...art.materials);
      this.headMats.push(art.head); this.tailMats.push(art.tail); this.reverseMats.push(art.reverse);
      art.indicators.forEach((m, i) => this.indicatorMats[i].push(m));
      for (const m of art.materials) {
        if (vehicleEnvironment() && !m.name.startsWith('light') && m.name !== 'rubber' && m.name !== 'cabin') {
          m.envMap = vehicleEnvironment(); m.envMapIntensity = 0.5;
        }
      }
    }
    this.mats.push(this.tailMat);
    for (const axle of def.axles) for (const side of [-1, 1]) {
      const pivot = new Group(), roll = new LOD();
      roll.addLevel(high.wheel.clone(true), 0); roll.addLevel(low.wheel.clone(true), 30, 0.12);
      this.lods.push(roll);
      pivot.add(roll);
      pivot.position.set(side * axle.halfTrack, axle.y - def.suspension.rest, axle.z);
      this.root.add(pivot); this.pivots.push(pivot); this.rolls.push(roll);
    }

    // Headlight beams: TWO additive cones, one from each lamp, angled slightly outward so they overlap into a
    // brighter pool ahead and part toward the verges. Both are merged into one geometry: a single transparent draw
    // call and no real light, which keeps night driving cheap. Hidden unless the conditions ask for lights.
    const beamLen = 20;
    const lampX = LIGHT_LAYOUT[def.visual].hx;
    const cones: BufferGeometry[] = [];
    for (const side of [-1, 1]) {
      const cone = new CylinderGeometry(1.25, 0.1, beamLen, 12, 1, true);
      cone.rotateX(-Math.PI / 2);
      cone.translate(0, 0, -beamLen / 2);
      cone.rotateY(-side * 0.07); // a few degrees outward so the two beams stay two beams
      cone.translate(side * lampX, 0, -(def.size.length / 2));
      const p = cone.getAttribute('position');
      const col = new Float32Array(p.count * 4);
      for (let i = 0; i < p.count; i++) {
        const far = Math.min(1, Math.max(0, (-p.getZ(i) - def.size.length / 2) / beamLen));
        col.set([1, 0.95, 0.75, 0.5 * (1 - far) ** 1.3], i * 4);
      }
      cone.setAttribute('color', new Float32BufferAttribute(col, 4));
      cones.push(cone);
    }
    const beamGeo = mergeGeometries(cones, false) as BufferGeometry;
    cones.forEach((c) => c.dispose());
    const beamMat = new MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false, side: DoubleSide });
    this.beam = new Mesh(beamGeo, beamMat);
    this.beam.position.y = LIGHT_LAYOUT[def.visual].y;
    this.beam.visible = false;
    this.beam.renderOrder = 5;
    this.shell.add(this.beam);
    this.geos.push(beamGeo);
    this.mats.push(beamMat);

    const blobTex = makeBlobTexture();
    const blobMat = new MeshBasicMaterial({
      map: blobTex,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
    });
    this.mats.push(blobMat, blobTex);
    const blobGeo = new CircleGeometry(1, 16);
    blobGeo.rotateX(-Math.PI / 2);
    blobGeo.scale(def.size.width * 1.35, 1, def.size.length * 0.8);
    this.geos.push(blobGeo);
    this.blob = new Mesh(blobGeo, blobMat);
    this.blob.renderOrder = 1;
  }

  /** Wheels at their resting mounts, straight and still: the garage turntable pose. */
  poseStatic(): void {
    let i = 0;
    for (const axle of this.def.axles) {
      for (const side of [-1, 1]) {
        this.pivots[i++].position.set(side * axle.halfTrack, axle.y - this.def.suspension.rest, axle.z);
      }
    }
  }

  /** Scales reflections with the available light (a studio reflection on a night road would glow). */
  setReflection(k: number): void {
    for (const m of this.mats) {
      const std = m as MeshStandardMaterial;
      if (std.isMeshStandardMaterial && std.envMap) std.envMapIntensity = 0.5 * k;
    }
  }

  /** Switches the headlight beam (dusk, night, fog, heavy rain). */
  setHeadlights(on: boolean): void {
    this.beam.visible = on;
    for (const m of this.headMats) m.emissiveIntensity = on ? 2.6 : 0.5;
  }

  /** Low phones skip tread/door details; other tiers use camera-distance LOD with hysteresis. */
  setLowDetail(low: boolean): void {
    for (const lod of this.lods) {
      lod.autoUpdate = !low;
      lod.levels[0].object.visible = !low;
      lod.levels[1].object.visible = low;
    }
  }

  /** Cheap fake shadow for the lowest quality tier (real shadow map otherwise). */
  setBlobVisible(v: boolean): void {
    this.blob.visible = v;
  }

  /**
   * @param time seconds, drives engine vibration
   * @param rpm   0..1 engine speed, scales the vibration
   */
  sync(body: VehicleBody, alpha: number, world: PhysicsWorld, time = 0, rpm = 0): void {
    body.interpolate(alpha, this.pos, this.quat);
    this.root.position.copy(this.pos);
    this.root.quaternion.copy(this.quat);

    // Engine shudder (diesel coach shakes more than the petrol 4x4) fading out at speed.
    const vib = (0.0035 + rpm * 0.006) * (this.def.audio.rumble + 0.4);
    this.shell.position.y = Math.sin(time * (46 + rpm * 60)) * vib;
    this.shell.rotation.z = Math.sin(time * (37 + rpm * 50) + 1.3) * vib * 0.5;

    body.wheels.forEach((w, i) => {
      this.pivots[i].position.set(w.mountLocal.x, w.mountLocal.y - w.suspLength, w.mountLocal.z);
      this.pivots[i].rotation.y = -w.steerAngle;
      this.rolls[i].rotation.x = -w.spin;
    });

    // Brake lights glow while braking (smoothed so quick taps are still visible).
    const target = body.braking > 0.05 ? 1 : 0;
    this.brakeGlow += (target - this.brakeGlow) * 0.35;
    for (const m of this.tailMats) m.emissiveIntensity = 0.45 + this.brakeGlow * 2.8;
    for (const m of this.reverseMats) m.emissiveIntensity = body.speed < -0.25 ? 1.8 : 0;
    for (let side = 0; side < 2; side++) for (const m of this.indicatorMats[side])
      m.emissiveIntensity = this.indicator === (side === 0 ? -1 : 1) && Math.sin(time * Math.PI * 3) > 0 ? 2.4 : 0;
    this.tailMat.color.setRGB(
      0.35 + this.brakeGlow * 0.65,
      0.08 + this.brakeGlow * 0.1,
      0.08 + this.brakeGlow * 0.08,
    );

    if (this.blob.visible) {
      world.ground(this.pos.x, this.pos.z, this.ground);
      const g = this.ground;
      this.blob.position.set(this.pos.x, g.height + 0.12, this.pos.z);
      this.n.set(g.nx, g.ny, g.nz);
      this.blob.quaternion.setFromUnitVectors(this.up, this.n);
      const fx = -2 * (this.quat.x * this.quat.z + this.quat.w * this.quat.y);
      const fz = -(1 - 2 * (this.quat.x * this.quat.x + this.quat.y * this.quat.y));
      this.blob.rotateY(Math.atan2(fx, fz));
      const h = Math.max(0, this.pos.y - g.height);
      (this.blob.material as MeshBasicMaterial).opacity = Math.max(0.15, 1 - h / 5);
    }
  }

  dispose(): void {
    this.geos.forEach((g) => g.dispose());
    this.mats.forEach((m) => m.dispose());
  }

  get vehicleName(): string {
    return this.def.name;
  }
}
