import { PerspectiveCamera, Quaternion, Vector3 } from 'three';
import type { VehicleDef } from '../data/types';
import { clamp, damp, lerp } from '../core/math';
import { createGroundSample } from '../world/Terrain';
import type { PhysicsWorld } from '../physics/types';
import type { VehicleBody } from '../physics/VehicleBody';

const QUAT = new Quaternion();

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

  setVehicle(def: VehicleDef): void {
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

  update(dt: number, body: VehicleBody, alpha: number, world: PhysicsWorld, time: number): void {
    const cfg = this.cfg;
    const pos = this.tmp;
    body.interpolate(alpha, pos, QUAT);
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
      c.x = damp(c.x, this.want.x, 12, dt);
      c.z = damp(c.z, this.want.z, 12, dt);
      c.y = damp(c.y, this.want.y, 6, dt);
    }
    world.ground(this.camera.position.x, this.camera.position.z, this.ground);
    const minY = this.ground.height + 1.5;
    if (this.camera.position.y < minY) this.camera.position.y = minY;

    this.shake = Math.max(0, this.shake - dt * 2.6);
    if (this.shake > 0) {
      const a = this.shake * 0.28;
      this.camera.position.x += Math.sin(time * 61) * a;
      this.camera.position.y += Math.sin(time * 73 + 1.7) * a * 0.7;
    }

    // Lead into corners with the steering (smoothed so quick corrections do not swing the view).
    this.lookSide = damp(this.lookSide, body.steerValue * (1.5 + speedK * 2.5), 2.5, dt);
    this.lookY = damp(this.lookY, pos.y + 1.1 + rise * 0.55, 4, dt);
    this.look.set(
      pos.x + this.hx * ahead - this.hz * this.lookSide,
      this.lookY,
      pos.z + this.hz * ahead + this.hx * this.lookSide,
    );
    this.camera.lookAt(this.look);

    const targetFov = this.showcase ? 40 : cfg.fov + speedK * cfg.fovBoost + this.intro * 6;
    this.fov = damp(this.fov, targetFov, 4, dt);
    if (Math.abs(this.camera.fov - this.fov) > 0.02) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
