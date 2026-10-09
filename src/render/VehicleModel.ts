import {
  CanvasTexture,
  CircleGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Quaternion,
  Vector3,
} from 'three';
import type { BufferGeometry } from 'three';
import type { VehicleDef } from '../data/types';
import type { VehicleBody } from '../physics/VehicleBody';
import type { PhysicsWorld } from '../physics/types';
import { createGroundSample } from '../world/Terrain';
import { GeoBuilder } from './geo';
import { PAL } from './palette';

const GLASS = 0x2b3f58;
const TIRE = 0x1c1c1f;

function bodyGeometry(def: VehicleDef): BufferGeometry {
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
  g.box(1.9, 0.26, 0.22, 0x303034, { y: -0.45, z: -l / 2 + 0.05 }); // bumpers
  g.box(1.9, 0.26, 0.22, 0x303034, { y: -0.45, z: l / 2 - 0.05 });
  // Saffron + madder-red livery stripes along the flanks.
  for (const sx of [-1, 1]) {
    g.box(0.03, 0.14, 3.7, accent, { x: sx * (w / 2 - 0.01), y: -0.14 });
    g.box(0.03, 0.07, 3.7, trim, { x: sx * (w / 2 - 0.01), y: -0.28 });
    g.box(0.1, 0.14, 0.22, 0x303034, { x: sx * 0.98, y: 0.28, z: -0.82 }); // mirrors
  }
  // Roof rack with luggage: guests' bags in festival colours.
  g.box(1.5, 0.06, 2.0, 0x303034, { y: 0.82, z: 0.35 });
  g.box(0.7, 0.34, 0.55, accent, { x: -0.3, y: 1.0, z: 0.0 });
  g.box(0.6, 0.28, 0.5, trim, { x: 0.35, y: 0.97, z: 0.75 });
  g.box(0.5, 0.24, 0.4, PAL.flagBlue, { x: 0.45, y: 0.95, z: 0.05 });
  // Little festival prayer-flag bunting on the rear.
  g.box(0.08, 0.5, 0.06, PAL.woodDark, { x: -0.8, y: 1.02, z: 1.5 });
  g.quad(0.28, 0.2, PAL.flagBlue, { x: -0.72, y: 1.18, z: 1.5 });
  g.quad(0.28, 0.2, PAL.flagRed, { x: -0.72, y: 1.0, z: 1.5 });
  return g.build();
}

function lightsGeometry(def: VehicleDef): BufferGeometry {
  const l = def.size.length;
  const g = new GeoBuilder();
  for (const sx of [-1, 1]) {
    g.box(0.32, 0.16, 0.08, 0xfff1b8, { x: sx * 0.66, y: -0.1, z: -l / 2 - 0.01 });
    g.box(0.3, 0.14, 0.08, 0xd8262a, { x: sx * 0.68, y: -0.1, z: l / 2 + 0.01 });
  }
  return g.build();
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

/** Procedural low-poly vehicle: 1 body + 1 lights + 4 wheel draw calls. */
export class VehicleModel {
  readonly root = new Group();
  readonly blob: Mesh;
  private readonly pivots: Group[] = [];
  private readonly rolls: Mesh[] = [];
  private readonly geos: BufferGeometry[] = [];
  private readonly mats: { dispose(): void }[] = [];
  private readonly ground = createGroundSample();
  private readonly pos = new Vector3();
  private readonly quat = new Quaternion();
  private readonly up = new Vector3(0, 1, 0);
  private readonly n = new Vector3();

  constructor(private readonly def: VehicleDef) {
    const lambert = new MeshLambertMaterial({ vertexColors: true });
    const basic = new MeshBasicMaterial({ vertexColors: true });
    const bodyGeo = bodyGeometry(def);
    const lightGeo = lightsGeometry(def);
    const wheelGeo = wheelGeometry(def);
    this.geos.push(bodyGeo, lightGeo, wheelGeo);
    this.mats.push(lambert, basic);

    const body = new Mesh(bodyGeo, lambert);
    body.castShadow = true;
    this.root.add(body, new Mesh(lightGeo, basic));

    for (const axle of def.axles) {
      for (const side of [-1, 1]) {
        const pivot = new Group();
        const roll = new Mesh(wheelGeo, lambert);
        roll.castShadow = true;
        pivot.add(roll);
        pivot.position.set(side * axle.halfTrack, axle.y - def.suspension.rest, axle.z);
        this.root.add(pivot);
        this.pivots.push(pivot);
        this.rolls.push(roll);
      }
    }

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

  /** Cheap fake shadow for the lowest quality tier (real shadow map otherwise). */
  setBlobVisible(v: boolean): void {
    this.blob.visible = v;
  }

  sync(body: VehicleBody, alpha: number, world: PhysicsWorld): void {
    body.interpolate(alpha, this.pos, this.quat);
    this.root.position.copy(this.pos);
    this.root.quaternion.copy(this.quat);
    body.wheels.forEach((w, i) => {
      this.pivots[i].position.set(w.mountLocal.x, w.mountLocal.y - w.suspLength, w.mountLocal.z);
      this.pivots[i].rotation.y = -w.steerAngle;
      this.rolls[i].rotation.x = -w.spin;
    });
    if (this.blob.visible) {
      world.ground(this.pos.x, this.pos.z, this.ground);
      const g = this.ground;
      this.blob.position.set(this.pos.x, g.height + 0.12, this.pos.z);
      this.n.set(g.nx, g.ny, g.nz);
      this.blob.quaternion.setFromUnitVectors(this.up, this.n);
      // Align the blob's long axis with the car's heading.
      const fx = -2 * (this.quat.x * this.quat.z + this.quat.w * this.quat.y);
      const fz = -(1 - 2 * (this.quat.x * this.quat.x + this.quat.y * this.quat.y));
      this.blob.rotateY(Math.atan2(-fx, -fz) + Math.PI);
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
