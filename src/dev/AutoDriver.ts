import type { Course } from '../world/Course';
import { createRoadHit } from '../world/Road';
import type { RoadPose } from '../world/Road';
import type { VehicleDef } from '../data/types';
import type { VehicleBody } from '../physics/VehicleBody';
import type { VehicleInput } from '../physics/types';
import { clamp } from '../core/math';

/**
 * Pure-pursuit bot. Used by automated tests to prove a level is drivable end to end,
 * and by `?autodrive=1` in the browser for demos and screenshot capture.
 */
export class AutoDriver {
  private readonly hit = createRoadHit();
  private readonly pose: RoadPose = { x: 0, y: 0, z: 0, tx: 0, tz: -1 };
  private readonly head = { x: 0, z: -1 };
  /** Lateral acceleration (m/s^2) the bot is willing to plan corners around. */
  cornerAccel: number;
  /** Strongest brake the bot will apply (0..1) and the deceleration (m/s^2) it plans its braking around. */
  private readonly maxBrake: number;
  private readonly brakeDecel: number;

  constructor(
    private readonly course: Course,
    vehicle?: VehicleDef,
    cornerAccel?: number,
    style: { maxBrake?: number; brakeDecel?: number } = {},
  ) {
    this.maxBrake = style.maxBrake ?? 1;
    this.brakeDecel = style.brakeDecel ?? 8;
    this.cornerAccel = cornerAccel ?? (vehicle ? 0.5 * vehicle.grip.lateral * vehicle.gravity : 10);
  }

  update(body: VehicleBody, out: VehicleInput): void {
    const road = this.course.road;
    const pos = body.position;
    road.project(pos.x, pos.z, this.hit);
    const speed = Math.max(0, body.speed);
    const s = this.hit.s;

    const look = 6 + speed * 0.5;
    road.at(s + look, this.pose);
    const dx = this.pose.x - pos.x;
    const dz = this.pose.z - pos.z;
    body.headingXZ(this.head);
    const cross = this.head.x * dz - this.head.z * dx;
    const dot = this.head.x * dx + this.head.z * dz;
    // Heading error: > 0 when the target is to the right of the chassis heading.
    const err = Math.atan2(cross, dot);
    out.steer = clamp(err * 1.7, -1, 1);

    // Speed plan from the sharpest bend within braking distance.
    const window = 14 + (speed * speed) / (2 * this.brakeDecel);
    let maxK = 0;
    road.at(s, this.pose);
    let h0 = Math.atan2(this.pose.tz, this.pose.tx);
    for (let d = 6; d <= window; d += 6) {
      road.at(s + d, this.pose);
      const h1 = Math.atan2(this.pose.tz, this.pose.tx);
      let dh = h1 - h0;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      maxK = Math.max(maxK, Math.abs(dh) / 6);
      h0 = h1;
    }
    const top = body.def.engine.topSpeed * 0.92;
    const target = maxK < 1e-4 ? top : clamp(Math.sqrt(this.cornerAccel / maxK), 8, top);
    if (speed > target + 1) {
      out.throttle = 0;
      out.brake = clamp((speed - target) / 5, 0, this.maxBrake);
    } else {
      out.brake = 0;
      out.throttle = clamp((target - speed) / 3 + 0.25, 0, 1);
    }
  }
}
