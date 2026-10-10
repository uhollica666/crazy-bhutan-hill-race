import { PerspectiveCamera, Quaternion, Vector3 } from 'three';
import type { SurfaceId, VehicleDef } from '../data/types';
import { clamp, damp, lerp } from '../core/math';
import { createGroundSample } from '../world/Terrain';
import type { PhysicsWorld } from '../physics/types';
import type { VehicleBody } from '../physics/VehicleBody';

const QUAT = new Quaternion();
const UP = new Vector3(0, 1, 0);

export type CameraView = 'chase' | 'close';

/**
 * How hard each surface shakes the view at speed (0 = glass-smooth, 1 = the roughest road in the game). New asphalt is barely
 * felt; gravel and mud rattle; a rocky track throws the camera about.
 */
export const CAMERA_SHAKE: Record<SurfaceId, number> = {
  asphalt: 0.03,
  wetAsphalt: 0.03,
  frost: 0.05,
  ice: 0.04,
  worn: 0.2,
  packed: 0.16,
  snow: 0.22,
  slush: 0.3,
  grass: 0.38,
  water: 0.3,
  dirt: 0.55,
  mud: 0.62,
  gravel: 0.72,
  rocky: 1,
};

/** Smooth pseudo-noise in -1..1 from three incommensurate sines (no allocation, no random jumps). */
const wobble = (t: number, a: number, b: number, c: number): number => (Math.sin(t * a) + Math.sin(t * b + 1.7) + Math.sin(t * c + 4.1)) / 3;

/**
 * Third-person chase camera.
 * - Heading is smoothed and blended toward the velocity direction, so drifts read but the view stays calm.
 * - Distance, height and FOV come from the vehicle definition (a coach needs a longer, higher shot) and
 *   widen with speed.
 * - The look target leads into corners (steering) and rises with the road on climbs and crests.
 * - Never dips under the terrain; impact shake is short and scaled down for touch devices.
 */
export class CameraRig {
  readonly camera = new PerspectiveCamera(58, 1, 0.3, 2000);
  /** 1 -> 0 during the countdown: a wide swoop into the chase position. */
  intro = 0;
  orbit = false;
  /** Garage / vehicle-select framing: close orbit with the car shifted clear of the UI panel. */
  showcase = false;
  /** Multiplier for impact shake (0 disables it). */
  shakeScale = 1;
  /** The player's Camera shake setting (0 off .. 1 full): scales the road-surface shake only. */
  roadShake = 1;
  /** Third-person chase view, or the close driver's-eye view just ahead of the cabin. */
  view: CameraView = 'chase';

  private width = 1280;
  private height = 720;
  private cfg = { distance: 7.4, height: 3.0, lookAhead: 4, fov: 58, fovBoost: 14 };
  private topSpeed = 38;
  private hx = 0;
  private hz = -1;
  private orbitAngle = 0;
  private shake = 0;
  private fov = 58;
  private lookY = 0;
  private lookSide = 0;
  private readonly look = new Vector3();
  private readonly want = new Vector3();
  private readonly tmp = new Vector3();
  private readonly ground = createGroundSample();
  private readonly head = { x: 0, z: -1 };
  private initialised = false;
  private size = { width: 1.9, height: 1.6, length: 4.2 };
  private shakeLevel = 0;
  private readonly eye = new Vector3();
  private readonly fwd = new Vector3(0, 0, -1);
  private readonly fwdWant = new Vector3();
  private readonly upWant = new Vector3();
  private closeReady = false;
  /** The camera's true (unshaken) position and the shake offset added to it last frame. */
  private readonly base = new Vector3();
  private readonly lastOffset = new Vector3();
  /** The body's pose for this frame, kept for the rear-view camera. */
  private readonly bodyPos = new Vector3();
  private readonly bodyQuat = new Quaternion();

  setVehicle(def: VehicleDef): void {
    this.size = { ...def.size };
    this.closeReady = false;
    this.cfg = { ...def.camera };
    this.topSpeed = def.engine.topSpeed;
    this.fov = def.camera.fov;
    this.initialised = false;
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.camera.aspect = width / Math.max(1, height);
    this.applyViewOffset();
  }

  /** Showcase mode shifts the image so the car sits beside the garage panel (right on wide screens, up on phones). */
  setShowcase(on: boolean): void {
    this.showcase = on;
    this.orbit = on || this.orbit;
    this.applyViewOffset();
  }

  private applyViewOffset(): void {
    const cam = this.camera;
    if (this.showcase) {
      const narrow = this.width < 700;
      cam.setViewOffset(
        this.width,
        this.height,
        narrow ? 0 : -this.width * 0.2,
        narrow ? this.height * 0.2 : 0,
        this.width,
        this.height,
      );
    } else {
      cam.clearViewOffset();
    }
    cam.updateProjectionMatrix();
  }

  setFar(far: number): void {
    this.camera.far = far;
    this.camera.updateProjectionMatrix();
  }

  /** Impact feedback (0..1). */
  kick(amount: number): void {
    this.shake = Math.min(1, this.shake + amount * this.shakeScale);
  }

  snap(): void {
    this.initialised = false;
  }

  /** 0..1: how rough the ground under the wheels is, times how fast the car is going (what the shake follows). */
  private roughness(body: VehicleBody): number {
    let sum = 0;
    let n = 0;
    for (const w of body.wheels) {
      if (!w.inContact) continue;
      sum += CAMERA_SHAKE[w.surface.id] ?? 0;
      n++;
    }
    if (n === 0) return 0;
    const speedK = clamp(Math.abs(body.speed) / 18, 0, 1);
    return (sum / n) * Math.pow(speedK, 0.8);
  }

  /** Road-surface shake: position, a little roll and pitch. Smooth noise, so a rocky road rolls and rattles rather than twitches. */
  private applyRoadShake(time: number, close: boolean): void {
    const k = this.shakeLevel * this.roadShake * Math.min(1, this.shakeScale * 1.4);
    if (k < 0.004) return;
    const pos = (close ? 0.1 : 0.075) * k;
    const rough = Math.min(1, this.shakeLevel * 1.4);
    const c = this.camera;
    c.position.x += wobble(time, 17, 23.3, 31.7) * pos * 0.6;
    c.position.y += (wobble(time, 21, 29.1, 37.9) * 0.7 + wobble(time, 3.1, 4.7, 6.3) * rough * 0.9) * pos;
    c.position.z += wobble(time, 13, 19.7, 27.1) * pos * 0.4;
    c.rotateZ(wobble(time, 11, 15.3, 22.9) * 0.02 * k * (close ? 1.4 : 1));
    c.rotateX(wobble(time, 14, 20.9, 26.3) * 0.012 * k);
  }

  /** Driver's-eye view: just ahead of the cabin, looking along the car, leaning into the road a little. */
  private updateClose(dt: number, body: VehicleBody, pos: Vector3, time: number): void {
    const s = this.size;
    const bus = s.length > 5;
    const front = bus ? -s.length / 2 + 0.23 : s.length < 4.3 ? -0.55 : -0.8;
    const roofFront = front + (bus ? 0.14 : s.length < 4.3 ? 0.56 : 0.6);
    // Ahead of the seated driver's head; coaches need an eye at the front cabin, not among the passenger rows.
    this.eye.set(s.width * 0.11, s.height / 2 - 0.24, roofFront + 0.14).applyQuaternion(QUAT).add(pos);
    this.fwdWant.set(0, 0, -1).applyQuaternion(QUAT);
    this.upWant.set(0, 1, 0).applyQuaternion(QUAT).lerp(UP, 0.65).normalize(); // roll is felt at about a third of the body's
    if (!this.closeReady) {
      this.fwd.copy(this.fwdWant);
      this.closeReady = true;
    } else {
      this.fwd.lerp(this.fwdWant, 1 - Math.exp(-dt * 16)).normalize();
    }
    const c = this.camera;
    c.position.copy(this.eye);
    c.up.copy(this.upWant);
    // Look a touch into the corner with the steering.
    const side = body.steerValue * 0.05;
    this.look.set(
      this.eye.x + (this.fwd.x - this.fwd.z * side) * 20,
      this.eye.y + this.fwd.y * 20,
      this.eye.z + (this.fwd.z + this.fwd.x * side) * 20,
    );
    c.lookAt(this.look);
    c.up.copy(UP);
    this.shakeLevel = damp(this.shakeLevel, this.roughness(body), 8, dt);
    this.shake = Math.max(0, this.shake - dt * 2.6);
    if (this.shake > 0) {
      c.position.x += Math.sin(time * 61) * this.shake * 0.12;
      c.position.y += Math.sin(time * 73 + 1.7) * this.shake * 0.09;
    }
    this.applyRoadShake(time, true);
    const speedK = clamp(Math.abs(body.speed) / this.topSpeed, 0, 1);
    this.fov = damp(this.fov, 72 + speedK * 12, 4, dt);
    if (Math.abs(c.fov - this.fov) > 0.02 || c.near !== 0.1) {
      c.fov = this.fov;
      c.near = 0.1;
      c.updateProjectionMatrix();
    }
  }

  /** Puts a camera at the back of the car looking back down the road (the reversing view). */
  placeRearCamera(cam: PerspectiveCamera): void {
    const s = this.size;
    this.eye.set(0, s.height * 0.3, s.length * 0.5 + 0.2).applyQuaternion(this.bodyQuat).add(this.bodyPos);
    cam.position.copy(this.eye);
    this.fwdWant.set(0, -0.07, 1).applyQuaternion(this.bodyQuat);
    this.look.copy(this.eye).addScaledVector(this.fwdWant, 20);
    cam.up.copy(UP);
    cam.lookAt(this.look);
  }

  update(dt: number, body: VehicleBody, alpha: number, world: PhysicsWorld, time: number): void {
    const cfg = this.cfg;
    const pos = this.tmp;
    body.interpolate(alpha, pos, QUAT);
    this.bodyPos.copy(pos);
    this.bodyQuat.copy(QUAT);
    if (this.view === 'close' && !this.showcase && !this.orbit) {
      this.lastOffset.set(0, 0, 0);
      this.updateClose(dt, body, pos, time);
      this.initialised = false; // the chase view re-seats itself when it is next chosen
      return;
    }
    this.closeReady = false;
    if (this.camera.near !== 0.3) {
      this.camera.near = 0.3;
      this.camera.updateProjectionMatrix();
    }
    body.headingXZ(this.head);
    const speed = body.speed;
    const vl = Math.hypot(body.velocity.x, body.velocity.z);

    let tx = this.head.x;
    let tz = this.head.z;
    if (vl > 5 && speed > 0) {
      const k = clamp((vl - 5) / 15, 0, 0.55);
      tx = lerp(tx, body.velocity.x / vl, k);
      tz = lerp(tz, body.velocity.z / vl, k);
      const l = Math.hypot(tx, tz) || 1;
      tx /= l;
      tz /= l;
    }
    if (!this.initialised) {
      this.hx = tx;
      this.hz = tz;
      this.lookY = pos.y + 1.1;
      this.lookSide = 0;
    } else {
      // Heavier vehicles (longer shot) swing the view a touch more slowly.
      const lambda = 3.4 - clamp((cfg.distance - 7.4) * 0.12, 0, 0.8);
      this.hx = damp(this.hx, tx, lambda, dt);
      this.hz = damp(this.hz, tz, lambda, dt);
      const l = Math.hypot(this.hx, this.hz) || 1;
      this.hx /= l;
      this.hz /= l;
    }

    let angle = this.intro * 1.1;
    if (this.orbit) {
      this.orbitAngle += dt * 0.35;
      angle += this.orbitAngle;
    } else {
      this.orbitAngle = 0;
    }
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const dirx = this.hx * cos - this.hz * sin;
    const dirz = this.hx * sin + this.hz * cos;

    const speedK = clamp(Math.abs(speed) / this.topSpeed, 0, 1);
    let dist =
      (cfg.distance + speedK * cfg.distance * 0.2) * (1 + this.intro * 0.45) * (this.orbit ? 1.15 : 1);
    let height = cfg.height + this.intro * 1.4 + speedK * 0.35;
    if (this.showcase) {
      dist = cfg.distance * 1.05 + 1.5;
      height = cfg.height * 0.55;
    }

    // Look ahead along the road surface so climbs and crests stay framed.
    const ahead = this.showcase ? 0 : cfg.lookAhead + speedK * 3;
    const lx = pos.x + this.hx * ahead;
    const lz = pos.z + this.hz * ahead;
    world.ground(lx, lz, this.ground);
    const rise = clamp(this.ground.height - pos.y, -3, 7);

    this.want.set(pos.x - dirx * dist, pos.y + height + Math.max(0, rise) * 0.3, pos.z - dirz * dist);
    if (!this.initialised) {
      this.camera.position.copy(this.want);
      this.initialised = true;
    } else {
      const c = this.camera.position;
      c.sub(this.lastOffset); // last frame's shake is not part of where the camera really is
      c.x = damp(c.x, this.want.x, 12, dt);
      c.z = damp(c.z, this.want.z, 12, dt);
      c.y = damp(c.y, this.want.y, 6, dt);
    }
    world.ground(this.camera.position.x, this.camera.position.z, this.ground);
    const minY = this.ground.height + 1.5;
    if (this.camera.position.y < minY) this.camera.position.y = minY;
    this.base.copy(this.camera.position);

    this.shake = Math.max(0, this.shake - dt * 2.6);
    if (this.shake > 0) {
      const a = this.shake * 0.28;
      this.camera.position.x += Math.sin(time * 61) * a;
      this.camera.position.y += Math.sin(time * 73 + 1.7) * a * 0.7;
    }
    this.shakeLevel = this.showcase || this.orbit ? 0 : damp(this.shakeLevel, this.roughness(body), 8, dt);

    // Lead into corners with the steering (smoothed so quick corrections do not swing the view).
    this.lookSide = damp(this.lookSide, body.steerValue * (1.5 + speedK * 2.5), 2.5, dt);
    this.lookY = damp(this.lookY, pos.y + 1.1 + rise * 0.55, 4, dt);
    this.look.set(
      pos.x + this.hx * ahead - this.hz * this.lookSide,
      this.lookY,
      pos.z + this.hz * ahead + this.hx * this.lookSide,
    );
    this.camera.lookAt(this.look);
    // Apply angular shake after lookAt, which otherwise replaces the shake rotation.
    this.applyRoadShake(time, false);
    this.lastOffset.copy(this.camera.position).sub(this.base);

    const targetFov = this.showcase ? 40 : cfg.fov + speedK * cfg.fovBoost + this.intro * 6;
    this.fov = damp(this.fov, targetFov, 4, dt);
    if (Math.abs(this.camera.fov - this.fov) > 0.02) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
