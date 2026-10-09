import { Vector3 } from 'three';
import type { VehicleBody } from '../physics/VehicleBody';

/**
 * Derives the horizontal chassis acceleration (lateral and longitudinal, m/s^2) from successive fixed-step
 * velocities. Shared by the game and the automated tests so both grade comfort the same way.
 */
export class MotionSampler {
  lateral = 0;
  longitudinal = 0;
  /** Body lean in radians (sideways tilt of the chassis relative to the heading). */
  roll = 0;
  private pvx = 0;
  private pvz = 0;
  private have = false;
  private readonly head = { x: 0, z: -1 };
  private readonly up = new Vector3();

  /** Forget the previous velocity (after a teleport / recovery). */
  reset(): void {
    this.have = false;
    this.lateral = this.longitudinal = this.roll = 0;
  }

  /** Call once per fixed step. Returns false when no valid sample exists yet. */
  sample(body: VehicleBody, dt: number): boolean {
    const vx = body.velocity.x;
    const vz = body.velocity.z;
    const ok = this.have;
    if (ok) {
      const ax = (vx - this.pvx) / dt;
      const az = (vz - this.pvz) / dt;
      body.headingXZ(this.head);
      // Airborne frames carry no meaningful tyre force: treat as zero.
      const grounded = body.groundedWheels >= 2;
      this.longitudinal = grounded ? ax * this.head.x + az * this.head.z : 0;
      this.lateral = grounded ? -ax * this.head.z + az * this.head.x : 0;
    }
    this.up.set(0, 1, 0).applyQuaternion(body.quaternion);
    body.headingXZ(this.head);
    this.roll = Math.asin(Math.max(-1, Math.min(1, -this.up.x * this.head.z + this.up.z * this.head.x)));
    this.pvx = vx;
    this.pvz = vz;
    this.have = true;
    return ok;
  }
}
