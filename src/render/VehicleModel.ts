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
  MeshLambertMaterial,
  Quaternion,
  Vector3,
} from 'three';
import type { BufferGeometry, MeshStandardMaterial, Object3D } from 'three';
import { instantiate } from './assets';
import type { VehicleAsset } from './assets';
import type { VehicleDef } from '../data/types';
import type { VehicleBody } from '../physics/VehicleBody';
import type { PhysicsWorld } from '../physics/types';
import { createGroundSample } from '../world/Terrain';
import { GeoBuilder } from './geo';
import { PAL } from './palette';
import { LIGHT_LAYOUT, cruiserBody, hatchBody } from './vehicleBodies';

const GLASS = 0x2b3f58;
const TIRE = 0x1c1c1f;
const DARK = 0x303034;

function suvBody(def: VehicleDef): BufferGeometry {
  const { body, accent, trim } = def.livery;
  const w = def.size.width;
  const l = def.size.length;
  const g = new GeoBuilder();
  g.box(w - 0.04, 0.62, l, body, { y: -0.28 }); // lower body
  g.box(1.66, 0.62, 2.55, body, { y: 0.35, z: 0.35 }); // cabin
  g.box(1.7, 0.34, 2.28, GLASS, { y: 0.4, z: 0.35 }); // side glass
  g.box(1.5, 0.34, 2.64, GLASS, { y: 0.4, z: 0.35 }); // screens
  g.box(1.64, 0.1, 2.5, body, { y: 0.72, z: 0.35 }); // roof
  g.box(1.78, 0.15, 1.15, body, { y: 0.09, z: -1.55 }); // bonnet
  g.box(1.9, 0.26, 0.22, DARK, { y: -0.45, z: -l / 2 + 0.05 }); // bumpers
  g.box(1.9, 0.26, 0.22, DARK, { y: -0.45, z: l / 2 - 0.05 });
  for (const sx of [-1, 1]) {
    g.box(0.03, 0.14, 3.7, accent, { x: sx * (w / 2 - 0.01), y: -0.14 });
    g.box(0.03, 0.07, 3.7, trim, { x: sx * (w / 2 - 0.01), y: -0.28 });
    g.box(0.1, 0.14, 0.22, DARK, { x: sx * 0.98, y: 0.28, z: -0.82 }); // mirrors
  }
  g.box(1.5, 0.06, 2.0, DARK, { y: 0.82, z: 0.35 }); // roof rack
  g.box(0.7, 0.34, 0.55, accent, { x: -0.3, y: 1.0, z: 0.0 });
  g.box(0.6, 0.28, 0.5, trim, { x: 0.35, y: 0.97, z: 0.75 });
  g.box(0.5, 0.24, 0.4, PAL.flagBlue, { x: 0.45, y: 0.95, z: 0.05 });
  g.box(0.08, 0.5, 0.06, PAL.woodDark, { x: -0.8, y: 1.02, z: 1.5 }); // bunting pole
  g.quad(0.28, 0.2, PAL.flagBlue, { x: -0.72, y: 1.18, z: 1.5 });
  g.quad(0.28, 0.2, PAL.flagRed, { x: -0.72, y: 1.0, z: 1.5 });
  return g.build();
}

/** Coaster-style minibus: tall, boxy, long windows band, roof rack with luggage, festival stripe. */
function coasterBody(def: VehicleDef): BufferGeometry {
  const { body, accent, trim } = def.livery;
  const w = def.size.width;
  const l = def.size.length;
  const g = new GeoBuilder();
  g.box(w, 0.95, l - 0.1, body, { y: -0.52 }); // lower body (floor to waist)
  g.box(w - 0.04, 1.0, l - 0.5, body, { y: 0.5, z: 0.12 }); // upper body
  g.box(w + 0.04, 0.64, l - 1.2, GLASS, { y: 0.62, z: 0.2 }); // side windows band
  g.box(w - 0.3, 0.64, l - 0.45, GLASS, { y: 0.62, z: 0.12 }); // front/rear glass
  for (let i = 0; i < 6; i++) g.box(w + 0.06, 0.7, 0.1, body, { y: 0.62, z: -2.0 + i * 0.86 }); // window pillars
  g.box(w - 0.1, 0.16, l - 0.55, body, { y: 1.07, z: 0.1 }); // roof
  g.box(1.2, 0.2, 1.7, 0xbfc3c6, { y: 1.26, z: 0.4 }); // air-con pod
  g.box(w + 0.02, 0.4, 0.3, DARK, { y: -0.66, z: -l / 2 + 0.1 }); // bumpers
  g.box(w + 0.02, 0.4, 0.3, DARK, { y: -0.66, z: l / 2 - 0.1 });
  g.box(1.3, 0.34, 0.1, DARK, { y: -0.35, z: -l / 2 - 0.02 }); // grille
  g.box(1.1, 0.26, 0.14, trim, { y: 0.98, z: -l / 2 + 0.52 }); // destination board
  g.box(1.0, 0.1, 0.16, accent, { y: 0.98, z: -l / 2 + 0.52 });
  for (const sx of [-1, 1]) {
    g.box(0.03, 0.22, l - 0.9, accent, { x: sx * (w / 2 + 0.005), y: -0.2 }); // saffron flank stripe
    g.box(0.03, 0.1, l - 0.9, trim, { x: sx * (w / 2 + 0.005), y: -0.42 });
    g.box(0.16, 0.34, 0.24, DARK, { x: sx * (w / 2 + 0.12), y: 0.45, z: -l / 2 + 0.75 }); // mirrors
    g.box(0.06, 0.5, 0.9, DARK, { x: sx * (w / 2 + 0.05), y: -0.52, z: -2.25, rz: 0 }); // wheel-arch shadow
    g.box(0.06, 0.5, 0.9, DARK, { x: sx * (w / 2 + 0.05), y: -0.52, z: 1.95 });
  }
  // Roof rack with luggage.
  g.box(1.7, 0.06, 3.4, DARK, { y: 1.22, z: -0.1 });
  g.box(0.9, 0.42, 0.7, accent, { x: -0.4, y: 1.5, z: -0.8 });
  g.box(0.8, 0.36, 0.7, trim, { x: 0.4, y: 1.47, z: -0.4 });
  g.box(0.7, 0.34, 0.6, PAL.flagBlue, { x: -0.3, y: 1.45, z: 0.3 });
  g.box(0.9, 0.4, 0.8, PAL.flagGreen, { x: 0.35, y: 1.48, z: 0.8 });
  g.cylinder(0.18, 0.18, 1.5, PAL.wood, 8, { x: 0, y: 1.42, z: -1.4, rz: Math.PI / 2 }); // rolled mat
  // Festival prayer-flag bunting from the mirrors across the windscreen.
  const flags = [PAL.flagBlue, PAL.flagWhite, PAL.flagRed, PAL.flagGreen, PAL.flagYellow];
  for (let i = 0; i < 5; i++) g.quad(0.22, 0.2, flags[i], { x: -0.8 + i * 0.4, y: 0.82, z: -l / 2 + 0.2 });
  return g.build();
}

function headLights(def: VehicleDef): BufferGeometry {
  const l = def.size.length;
  const { hx, y } = LIGHT_LAYOUT[def.visual];
  const g = new GeoBuilder();
  for (const sx of [-1, 1]) g.box(0.32, 0.18, 0.08, 0xfff1b8, { x: sx * hx, y, z: -l / 2 - 0.01 });
  return g.build();
}

function tailLights(def: VehicleDef): BufferGeometry {
  const l = def.size.length;
  const hx = LIGHT_LAYOUT[def.visual].tailHx;
  const y = LIGHT_LAYOUT[def.visual].tailY;
  const g = new GeoBuilder();
  for (const sx of [-1, 1]) g.box(0.3, 0.2, 0.08, 0xffffff, { x: sx * hx, y, z: l / 2 + 0.01 });
  return g.build();
}

function bodyFor(def: VehicleDef): BufferGeometry {
  switch (def.visual) {
    case 'hatch':
      return hatchBody(def);
    case 'coaster':
      return coasterBody(def);
    case 'cruiser':
      return cruiserBody(def);
    default:
      return suvBody(def);
  }
}

/** A non-simulated copy of a vehicle (body, lights, four static wheels): used for the rival coach. */
export function createStaticVehicle(def: VehicleDef, livery?: Partial<VehicleDef['livery']>): { group: Group; dispose: () => void } {
  const d: VehicleDef = livery ? { ...def, livery: { ...def.livery, ...livery } } : def;
  const body = bodyFor(d);
  const heads = headLights(d);
  const tails = tailLights(d);
  const wheel = wheelGeometry(d);
  const lambert = new MeshLambertMaterial({ vertexColors: true });
  const basic = new MeshBasicMaterial({ vertexColors: true });
  const tailMat = new MeshBasicMaterial({ color: 0xa5272a });
  const group = new Group();
  group.add(new Mesh(body, lambert), new Mesh(heads, basic), new Mesh(tails, tailMat));
  for (const axle of d.axles) {
    for (const side of [-1, 1]) {
      const m = new Mesh(wheel, lambert);
      m.position.set(side * axle.halfTrack, axle.y - d.suspension.rest * 0.8, axle.z);
      group.add(m);
    }
  }
  return {
    group,
    dispose: () => {
      [body, heads, tails, wheel].forEach((g) => g.dispose());
      [lambert, basic, tailMat].forEach((m) => m.dispose());
    },
  };
}

function wheelGeometry(def: VehicleDef): BufferGeometry {
  const r = def.wheelRadius;
  const ww = def.wheelWidth;
  const g = new GeoBuilder();
  g.cylinder(r, r, ww, TIRE, 14, { rz: Math.PI / 2 });
  g.cylinder(r * 0.62, r * 0.62, ww * 1.04, 0xc9c9c4, 12, { rz: Math.PI / 2 });
  for (let i = 0; i < 4; i++) g.box(ww * 1.08, r * 1.22, 0.07, 0x55555a, { rx: (i * Math.PI) / 4 });
  return g.build();
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
  private readonly beam: Mesh;

  constructor(
    private readonly def: VehicleDef,
    asset: VehicleAsset | null = null,
  ) {
    this.detailed = !!asset;
    const lambert = new MeshLambertMaterial({ vertexColors: true });
    const basic = new MeshBasicMaterial({ vertexColors: true });
    const bodyGeo = bodyFor(def);
    const headGeo = headLights(def);
    const tailGeo = tailLights(def);
    const wheelGeo = wheelGeometry(def);
    this.geos.push(bodyGeo, headGeo, tailGeo, wheelGeo);
    this.mats.push(lambert, basic, this.tailMat);

    if (asset) {
      const b = instantiate(asset.body, def.livery);
      this.shell.add(b.object);
      this.headMats.push(...b.lights.head);
      this.tailMats.push(...b.lights.tail);
      this.mats.push(...b.materials);
    } else {
      const body = new Mesh(bodyGeo, lambert);
      body.castShadow = true;
      this.shell.add(body, new Mesh(headGeo, basic), new Mesh(tailGeo, this.tailMat));
    }
    this.root.add(this.shell);

    for (const axle of def.axles) {
      for (const side of [-1, 1]) {
        const pivot = new Group();
        let roll: Object3D;
        if (asset) {
          const w = instantiate(asset.wheel, null);
          roll = w.object;
          this.mats.push(...w.materials);
        } else {
          const m = new Mesh(wheelGeo, lambert);
          m.castShadow = true;
          roll = m;
        }
        pivot.add(roll);
        pivot.position.set(side * axle.halfTrack, axle.y - def.suspension.rest, axle.z);
        this.root.add(pivot);
        this.pivots.push(pivot);
        this.rolls.push(roll);
      }
    }

    // Headlight beam: one additive cone fading to nothing ahead of the car. It costs a single transparent draw
    // call and no real light, which keeps night driving cheap. Hidden unless the conditions ask for lights.
    const beamLen = 20;
    const beamGeo = new CylinderGeometry(3.4, 0.2, beamLen, 12, 1, true);
    beamGeo.rotateX(-Math.PI / 2);
    beamGeo.translate(0, 0, -(def.size.length / 2 + beamLen / 2));
    const bp = beamGeo.getAttribute('position');
    const bc = new Float32Array(bp.count * 4);
    for (let i = 0; i < bp.count; i++) {
      const far = Math.min(1, Math.max(0, (-bp.getZ(i) - def.size.length / 2) / beamLen));
      bc.set([1, 0.95, 0.75, 0.42 * (1 - far) ** 1.4], i * 4);
    }
    beamGeo.setAttribute('color', new Float32BufferAttribute(bc, 4));
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
    const target = body.braking > 0.05 && body.speed > 0.5 ? 1 : 0;
    this.brakeGlow += (target - this.brakeGlow) * 0.35;
    for (const m of this.tailMats) m.emissiveIntensity = 0.45 + this.brakeGlow * 2.8;
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
