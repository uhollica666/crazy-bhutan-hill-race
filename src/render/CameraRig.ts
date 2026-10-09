import { PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { clamp, damp, lerp } from '../core/math';
import { createGroundSample } from '../world/Terrain';
import type { PhysicsWorld } from '../physics/types';
import type { VehicleBody } from '../physics/VehicleBody';

const QUAT = new Quaternion();

/** Third-person chase camera: heading-smoothed, speed-aware FOV, terrain-safe, with intro and finish orbit. */
export class CameraRig {
  readonly camera = new PerspectiveCamera(58, 1, 0.3, 2000);
  /** 1 -> 0 during the countdown: a wide swoop into the chase position. */
  intro = 0;
  orbit = false;

  private hx = 0;
  private hz = -1;
  private orbitAngle = 0;
  private shake = 0;
  private fov = 58;
  private readonly look = new Vector3();
  private readonly want = new Vector3();
  private readonly tmp = new Vector3();
  private readonly ground = createGroundSample();
  private readonly head = { x: 0, z: -1 };
  private initialised = false;

  resize(width: number, height: number): void {
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  setFar(far: number): void {
    this.camera.far = far;
    this.camera.updateProjectionMatrix();
  }

  /** Impact feedback (0..1). */
  kick(amount: number): void {
    this.shake = Math.min(1, this.shake + amount);
  }

  snap(): void {
    this.initialised = false;
  }

  update(dt: number, body: VehicleBody, alpha: number, world: PhysicsWorld, time: number): void {
    const pos = this.tmp;
    body.interpolate(alpha, pos, QUAT);
    body.headingXZ(this.head);
    const speed = body.speed;
    const vl = Math.hypot(body.velocity.x, body.velocity.z);

    // Blend the chassis heading with the velocity direction so drifts are readable but the view stays calm.
    let tx = this.head.x;
    let tz = this.head.z;
    if (vl > 5 && speed > 0) {
      const vx = body.velocity.x / vl;
      const vz = body.velocity.z / vl;
      const k = clamp((vl - 5) / 15, 0, 0.55);
      tx = lerp(tx, vx, k);
      tz = lerp(tz, vz, k);
      const l = Math.hypot(tx, tz) || 1;
      tx /= l;
      tz /= l;
    }
    if (!this.initialised) {
      this.hx = tx;
      this.hz = tz;
    } else {
      this.hx = damp(this.hx, tx, 3.2, dt);
      this.hz = damp(this.hz, tz, 3.2, dt);
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

    const speedK = clamp(Math.abs(speed) / 38, 0, 1);
    const dist = (7.4 + speedK * 1.6) * (1 + this.intro * 0.45) * (this.orbit ? 1.15 : 1);
    const height = 3.0 + this.intro * 1.4 + speedK * 0.35;

    this.want.set(pos.x - dirx * dist, pos.y + height, pos.z - dirz * dist);
    if (!this.initialised) {
      this.camera.position.copy(this.want);
      this.initialised = true;
    } else {
      const c = this.camera.position;
      c.x = damp(c.x, this.want.x, 12, dt);
      c.z = damp(c.z, this.want.z, 12, dt);
      c.y = damp(c.y, this.want.y, 7, dt);
    }
    world.ground(this.camera.position.x, this.camera.position.z, this.ground);
    const minY = this.ground.height + 1.5;
    if (this.camera.position.y < minY) this.camera.position.y = minY;

    this.shake = Math.max(0, this.shake - dt * 2.4);
    if (this.shake > 0) {
      const a = this.shake * 0.35;
      this.camera.position.x += Math.sin(time * 61) * a;
      this.camera.position.y += Math.sin(time * 73 + 1.7) * a * 0.7;
    }

    const ahead = 4 + speedK * 3;
    this.look.set(pos.x + this.hx * ahead, pos.y + 1.1, pos.z + this.hz * ahead);
    this.camera.lookAt(this.look);

    const targetFov = 58 + speedK * 14 + this.intro * 6;
    this.fov = damp(this.fov, targetFov, 4, dt);
    if (Math.abs(this.camera.fov - this.fov) > 0.02) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
