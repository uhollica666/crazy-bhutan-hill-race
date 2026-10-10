import type { Cosmetics } from './cosmetics';
import {
  AmbientLight,
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Scene,
  TorusGeometry,
  Vector3,
} from 'three';
import type { VehicleDef } from '../data/types';
import { clamp, damp } from '../core/math';
import { VehicleModel } from './VehicleModel';
import type { VehicleAsset } from './assets';

const FLAG_COLOURS = [0x2b5fa8, 0xf4efe2, 0xc8352b, 0x3f8f4e, 0xe3a72f];

/**
 * The garage: a small walled workshop under a string of prayer flags, with its own scene, lights and orbit camera.
 * The world behind the menus is not drawn while the garage is open, so the vehicle is judged on its own
 * and the frame time goes into the model. The car shown is the real in-game model (same meshes, livery and
 * wheel set), standing still on a turntable.
 *
 * Orbit: drag to turn, wheel / pinch (zoom) to move in and out. Left alone it turns slowly; any input stops the
 * turn for a few seconds. Every geometry and material made here is released by `dispose`.
 */
export class GarageScene {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(36, 1, 0.1, 80);
  private readonly geos: BufferGeometry[] = [];
  private readonly mats: { dispose(): void }[] = [];
  private readonly turntable = new Group();
  private readonly key: DirectionalLight;
  private readonly lantern: PointLight;
  private model: VehicleModel | null = null;
  private vehicleId = '';

  // Orbit state (radians / metres). `target*` is where input wants the camera, the plain fields follow it smoothly.
  private az = 2.6;
  private pol = 1.32;
  private dist = 7;
  private tAz = 2.6;
  private tPol = 1.32;
  private tDist = 7;
  private minDist = 4;
  private maxDist = 11;
  private homeDist = 7;
  private idle = 0;
  private width = 1280;
  private height = 720;
  private lookY = 0.8;
  private readonly look = new Vector3(0, 0.8, 0);
  private readonly flags: Mesh[] = [];
  private time = 0;
  reducedMotion = false;

  constructor(shadows: boolean) {
    this.scene.background = new Color(0x0b0d14);
    const hemi = new HemisphereLight(0xe4e8ed, 0x454238, 1.25);
    const amb = new AmbientLight(0xcfd8ff, 0.2);
    this.key = new DirectionalLight(0xf2f5ff, 2.1);
    this.key.position.set(-4.5, 7, -5);
    this.key.castShadow = shadows;
    this.key.shadow.mapSize.set(1024, 1024);
    const sc = this.key.shadow.camera;
    sc.left = -6;
    sc.right = 6;
    sc.top = 6;
    sc.bottom = -6;
    sc.near = 1;
    sc.far = 24;
    this.key.shadow.bias = -0.0006;
    const rim = new DirectionalLight(0xd6e0e5, 1.5);
    rim.position.set(5, 3.5, 6);
    this.lantern = new PointLight(0xffb45a, 14, 12, 1.6);
    this.lantern.position.set(-3.6, 2.4, -2.2);
    this.scene.add(hemi, amb, this.key, this.key.target, rim, this.lantern);
    this.build();
    this.noCulling(this.scene);
    this.resize(this.width, this.height);
    this.applyCamera(true);
  }

  private mat(color: number, emissive = 0): MeshLambertMaterial {
    const m = new MeshLambertMaterial({ color });
    if (emissive) m.emissive = new Color(emissive);
    this.mats.push(m);
    return m;
  }

  private mesh(geo: BufferGeometry, material: MeshLambertMaterial | MeshBasicMaterial, x: number, y: number, z: number, parent: Group | Scene = this.scene): Mesh {
    this.geos.push(geo);
    const m = new Mesh(geo, material);
    m.position.set(x, y, z);
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  /** The workshop: floor, back wall, beams, crates, tyre stacks, a bench and a string of prayer flags. */
  private build(): void {
    const stone = this.mat(0x3c4140);
    const dark = this.mat(0x131622);
    const wood = this.mat(0x755640);
    const woodDark = this.mat(0x403126);
    const maroon = this.mat(0xd12c88);
    const brass = this.mat(0xff8a2a);

    // Floor and the turntable the vehicle stands on.
    const floor = this.mesh(new CircleGeometry(16, 40).rotateX(-Math.PI / 2), stone, 0, 0, 0);
    floor.receiveShadow = true;
    this.scene.add(this.turntable);
    this.mesh(new CylinderGeometry(3.6, 3.75, 0.12, 48), dark, 0, 0.06, 0, this.turntable);
    this.mesh(new TorusGeometry(3.62, 0.05, 6, 64).rotateX(Math.PI / 2), brass, 0, 0.13, 0, this.turntable);
    // Marks on the turntable so rotation reads.
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      this.mesh(new BoxGeometry(0.08, 0.02, 0.5), brass, Math.sin(a) * 3.2, 0.125, Math.cos(a) * 3.2, this.turntable).rotation.y = a;
    }

    // Back wall (a half ring) with a painted band, and timber posts.
    const ring = new CylinderGeometry(13, 13, 5.2, 36, 1, true, Math.PI * 0.55, Math.PI * 0.9);
    this.geos.push(ring);
    const wallMat = new MeshLambertMaterial({ color: 0x3f4543, side: DoubleSide });
    this.mats.push(wallMat);
    const back = new Mesh(ring, wallMat);
    back.position.y = 2.6;
    back.rotation.y = Math.PI * 0.5;
    back.receiveShadow = true;
    this.scene.add(back);
    const band = new CylinderGeometry(12.95, 12.95, 0.5, 36, 1, true, Math.PI * 0.55, Math.PI * 0.9);
    this.geos.push(band);
    const bandMesh = new Mesh(band, this.mat(0xd12c88));
    (bandMesh.material as MeshLambertMaterial).side = DoubleSide;
    bandMesh.position.y = 4.4;
    bandMesh.rotation.y = Math.PI * 0.5;
    this.scene.add(bandMesh);
    for (const a of [-0.9, -0.3, 0.3, 0.9]) {
      this.mesh(new BoxGeometry(0.35, 5.2, 0.35), woodDark, Math.sin(a) * 12.6, 2.6, -Math.cos(a) * 12.6);
    }
    // Roof beam.
    this.mesh(new BoxGeometry(24, 0.35, 0.4), woodDark, 0, 5.15, -12.4);

    // Crates, tyre stacks and a workbench off to the sides, clear of the camera path.
    const crates: [number, number, number, number][] = [[-6.2, 0.45, -5.2, 0.9], [-5.3, 0.45, -5.9, 0.9], [-5.8, 1.35, -5.5, 0.8], [7, 0.4, -4.6, 0.8]];
    for (const [x, y, z, s] of crates) {
      const c = this.mesh(new BoxGeometry(s, s, s), wood, x, y, z);
      c.rotation.y = x * 0.9;
      c.castShadow = true;
    }
    const tyre = new TorusGeometry(0.42, 0.18, 8, 18);
    this.geos.push(tyre);
    const tyreMat = this.mat(0x15171d);
    for (let i = 0; i < 4; i++) {
      const t = new Mesh(tyre, tyreMat);
      t.rotation.x = Math.PI / 2;
      t.position.set(5.6 + (i % 2) * 0.1, 0.19 + i * 0.36, -5.4);
      t.castShadow = true;
      this.scene.add(t);
    }
    const bench = this.mesh(new BoxGeometry(3, 0.12, 0.9), wood, 0, 1, -9);
    bench.castShadow = true;
    for (const sx of [-1.3, 1.3]) this.mesh(new BoxGeometry(0.12, 1, 0.8), woodDark, sx, 0.5, -9);
    this.mesh(new BoxGeometry(0.6, 0.35, 0.4), maroon, -0.8, 1.24, -9);
    // A fuel can and a lantern on the bench.
    this.mesh(new CylinderGeometry(0.2, 0.2, 0.45, 12), this.mat(0xff6a3a), 0.9, 1.3, -9);
    this.mesh(new CylinderGeometry(0.09, 0.09, 0.22, 10), this.mat(0xffcf7a, 0xffb45a), -3.6, 2.4, -2.2);

    // Prayer flags: five colours on a sagging line across the workshop. Flags sway slightly.
    const lineGeo = new BufferGeometry();
    const pts: number[] = [];
    const SEG = 24;
    for (let i = 0; i <= SEG; i++) {
      const u = i / SEG;
      pts.push(-9 + u * 18, 4.7 - Math.sin(u * Math.PI) * 0.9, -7.5);
    }
    lineGeo.setAttribute('position', new Float32BufferAttribute(pts, 3));
    this.geos.push(lineGeo);
    const flagGeo = new PlaneGeometry(0.55, 0.42);
    this.geos.push(flagGeo);
    const flagMats = FLAG_COLOURS.map((c) => {
      const m = new MeshLambertMaterial({ color: c, side: DoubleSide });
      this.mats.push(m);
      return m;
    });
    for (let i = 0; i < 22; i++) {
      const u = (i + 1) / 23;
      const f = new Mesh(flagGeo, flagMats[i % 5]);
      f.position.set(-9 + u * 18, 4.7 - Math.sin(u * Math.PI) * 0.9 - 0.25, -7.5);
      f.userData.phase = i * 0.7;
      this.flags.push(f);
      this.scene.add(f);
    }
    const lineMesh = new Mesh(new BoxGeometry(18, 0.03, 0.03), this.mat(0x131622));
    this.geos.push(lineMesh.geometry);
    lineMesh.position.set(0, 4.25, -7.5);
    lineMesh.visible = false; // the sag is carried by the flag positions; a straight line would cut through them
    this.scene.add(lineMesh);
  }

  /** Shows a vehicle (the real in-game model with upgrades already applied). */
  applyCosmetics(c: Cosmetics): void { this.model?.applyCosmetics(c); }

  setVehicle(def: VehicleDef, asset: VehicleAsset | null): void {
    if (this.model) {
      this.turntable.remove(this.model.root);
      this.model.dispose();
      this.model = null;
    }
    const m = new VehicleModel(def, asset);
    m.setBlobVisible(false);
    m.setReflection(1);
    // Stand on the turntable: wheel bottoms touch its top (y 0.12).
    const wheelBottom = def.axles[0].y - def.suspension.rest - def.wheelRadius;
    m.root.position.set(0, 0.12 - wheelBottom, 0);
    m.poseStatic();
    m.root.traverse((o) => {
      if ((o as Mesh).isMesh) (o as Mesh).castShadow = true;
    });
    this.noCulling(m.root);
    this.turntable.add(m.root);
    this.model = m;
    this.vehicleId = def.id;
    // Frame the vehicle: bigger vehicles sit further back.
    const size = Math.max(def.size.length, def.size.width * 1.6);
    this.minDist = size * 1.3;
    this.maxDist = size * 3.4;
    this.homeDist = size * 2.15;
    this.tDist = this.homeDist;
    this.lookY = def.size.height * 0.45;
    this.look.set(0, this.lookY, 0);
    this.idle = 0;
  }

  /**
   * The scene is small and always in view, so nothing is frustum-culled: every mesh is uploaded to the GPU on the
   * first frame instead of as the camera turns (which would cause hitches while orbiting).
   */
  private noCulling(root: Object3D): void {
    root.traverse((o) => {
      o.frustumCulled = false;
    });
  }

  get shownVehicleId(): string {
    return this.vehicleId;
  }

  setShadows(on: boolean): void {
    this.key.castShadow = on;
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.camera.aspect = width / Math.max(1, height);
    // Keep the vehicle clear of the garage panel: right of centre on wide screens, upper part on phones.
    const narrow = width < 700;
    this.camera.setViewOffset(
      width,
      height,
      narrow ? 0 : -width * 0.2,
      narrow ? height * 0.2 : 0,
      width,
      height,
    );
    this.camera.updateProjectionMatrix();
  }

  /** Drag: pixels moved turn the camera. */
  orbit(dx: number, dy: number): void {
    this.tAz -= dx * 0.008;
    this.tPol = clamp(this.tPol - dy * 0.006, 0.55, 1.5);
    this.idle = 0;
  }

  /** Wheel / pinch / buttons: positive moves away. */
  zoom(amount: number): void {
    this.tDist = clamp(this.tDist * (1 + amount), this.minDist, this.maxDist);
    this.idle = 0;
  }

  /** Turns by a fixed step (keyboard and buttons). */
  turn(radians: number): void {
    this.tAz += radians;
    this.idle = 0;
  }

  setView(view: 'front' | 'rear' | 'side'): void {
    this.tAz = view === 'front' ? 2.6 : view === 'rear' ? 0.55 : Math.PI / 2;
    this.tPol = 1.32; this.tDist = this.homeDist; this.idle = 0;
  }

  resetView(): void {
    this.tAz = 2.6;
    this.tPol = 1.32;
    this.tDist = this.homeDist;
    this.idle = 0;
  }

  /** Current orbit values (for tests and the debug overlay). */
  get view(): { azimuth: number; polar: number; distance: number } {
    return { azimuth: this.az, polar: this.pol, distance: this.dist };
  }

  update(dt: number): void {
    this.time += dt;
    this.idle += dt;
    // Slow turn when untouched (not with reduced motion).
    if (!this.reducedMotion && this.idle > 3) this.tAz += dt * 0.22;
    this.applyCamera(false, dt);
    for (const f of this.flags) {
      const ph = f.userData.phase as number;
      f.rotation.y = Math.sin(this.time * 1.7 + ph) * 0.35;
      f.rotation.z = Math.sin(this.time * 2.3 + ph * 1.3) * 0.08;
    }
    this.lantern.intensity = 14 + Math.sin(this.time * 7.3) * 0.5 + Math.sin(this.time * 3.1) * 0.4;
  }

  private applyCamera(snap: boolean, dt = 0.016): void {
    this.az = damp(this.az, this.tAz, 9, snap ? 1 : dt);
    this.pol = damp(this.pol, this.tPol, 9, snap ? 1 : dt);
    this.dist = damp(this.dist, this.tDist, 7, snap ? 1 : dt);
    const r = this.dist;
    this.camera.position.set(
      Math.sin(this.az) * Math.sin(this.pol) * r,
      this.look.y + Math.cos(this.pol) * r,
      Math.cos(this.az) * Math.sin(this.pol) * r,
    );
    this.camera.lookAt(this.look);
  }

  dispose(): void {
    this.model?.dispose();
    this.model = null;
    this.geos.forEach((g) => g.dispose());
    this.mats.forEach((m) => m.dispose());
    this.geos.length = 0;
    this.mats.length = 0;
    this.scene.clear();
  }
}
