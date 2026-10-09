import type { VehicleDef } from '../data/types';
import type { Course } from '../world/Course';
import { createRoadHit } from '../world/Road';
import type { RoadPose } from '../world/Road';
import type { VehicleBody } from '../physics/VehicleBody';
import type { VehicleInput } from '../physics/types';
import { clamp } from '../core/math';

export interface DriveStyle {
  maxBrake?: number;
  brakeDecel?: number;
  /** Avoid obstacles (boulders, traffic, creatures, trucks) by shifting laterally, or stop behind them. */
  avoid?: boolean;
}

/**
 * Pure-pursuit bot. Used by automated tests to prove a level is drivable end to end, and by `?autodrive=1` in the
 * browser for demos and screenshots. It follows the road at a speed planned from upcoming curvature, can stop at
 * a given road distance (pickups, pit stops, drop-offs), and steers around obstacles it can see ahead.
 * It is NOT a player model: it cannot prove the game is fun.
 */
export class AutoDriver {
  private readonly hit = createRoadHit();
  private readonly oHit = createRoadHit();
  private readonly pose: RoadPose = { x: 0, y: 0, z: 0, tx: 0, tz: -1 };
  private readonly head = { x: 0, z: -1 };
  /** Lateral acceleration (m/s^2) the bot is willing to plan corners around. */
  cornerAccel: number;
  /** Stop with the front axle at this road distance (null = just drive). */
  stopAt: number | null = null;
  /** Hold the brake (queueing at a service, waiting for a creature, ...). */
  hold = false;
  /** Cap on the planned speed (m/s), e.g. for mud. */
  speedCap = Infinity;
  private readonly maxBrake: number;
  private readonly brakeDecel: number;
  private readonly avoid: boolean;
  private offset = 0;
  private readonly halfWidth: number;

  constructor(
    private readonly course: Course,
    vehicle?: VehicleDef,
    cornerAccel?: number,
    style: DriveStyle = {},
  ) {
    this.cornerAccel = cornerAccel ?? (vehicle ? 0.5 * vehicle.grip.lateral * vehicle.gravity : 10);
    this.maxBrake = style.maxBrake ?? 1;
    this.brakeDecel = style.brakeDecel ?? 8;
    this.avoid = style.avoid ?? true;
    this.halfWidth = (vehicle?.size.width ?? 1.9) / 2;
  }

  /** Lateral offset (m) from the road centre that keeps clear of what is ahead; sets `blockedGap` when stuck. */
  private plan(s: number, speed: number): { offset: number; gap: number } {
    const road = this.course.road;
    const ob = this.course.obstacles;
    const limit = Math.max(0, road.wallOffset - this.halfWidth - 0.35);
    let gap = Infinity;
    // Collect intervals of lateral space blocked by obstacles within the planning horizon.
    const horizon = 14 + speed * 2.4;
    const blocked: [number, number, number][] = [];
    for (let i = 0; i < ob.capacity; i++) {
      if (!ob.active[i]) continue;
      if (!road.project(ob.xs[i], ob.zs[i], this.oHit)) continue;
      const along = this.oHit.s - s;
      if (along < -3 || along > horizon) continue;
      const clear = ob.rs[i] + this.halfWidth + 0.7;
      blocked.push([this.oHit.lateral - clear, this.oHit.lateral + clear, along]);
    }
    let off = clamp(this.offset, -limit, limit);
    if (!this.avoid || blocked.length === 0) {
      // Drift back to the centre line.
      off += (0 - off) * 0.04;
      this.offset = off;
      return { offset: off, gap };
    }
    // Candidate lateral positions: the centre, and just outside every blocked interval.
    const candidates = [0, ...blocked.flatMap(([lo, hi]) => [lo, hi])].map((c) => clamp(c, -limit, limit));
    let best = off;
    let bestCost = Infinity;
    for (const c of candidates) {
      let free = true;
      let nearest = Infinity;
      for (const [lo, hi, along] of blocked) {
        if (c > lo && c < hi) {
          free = false;
          nearest = Math.min(nearest, along);
        }
      }
      const cost = (free ? 0 : 1000 - nearest) + Math.abs(c - off) * 2 + Math.abs(c) * 0.5;
      if (cost < bestCost) {
        bestCost = cost;
        best = c;
        gap = free ? Infinity : nearest;
      }
    }
    // Move toward the chosen lane smoothly.
    off += clamp(best - off, -0.12, 0.12);
    this.offset = off;
    return { offset: off, gap };
  }

  update(body: VehicleBody, out: VehicleInput): void {
    const road = this.course.road;
    const pos = body.position;
    road.project(pos.x, pos.z, this.hit);
    const speed = Math.max(0, body.speed);
    const s = this.hit.s;

    const { offset, gap } = this.plan(s, speed);
    const look = 6 + speed * 0.5;
    road.at(s + look, this.pose);
    const tx = this.pose.x - this.pose.tz * offset;
    const tz = this.pose.z + this.pose.tx * offset;
    const dx = tx - pos.x;
    const dz = tz - pos.z;
    body.headingXZ(this.head);
    const cross = this.head.x * dz - this.head.z * dx;
    const dot = this.head.x * dx + this.head.z * dz;
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
    let target = maxK < 1e-4 ? top : clamp(Math.sqrt(this.cornerAccel / maxK), 6, top);
    target = Math.min(target, this.speedCap);

    // Stop at a station / pickup / drop-off, or behind something we cannot get around.
    if (this.stopAt !== null) {
      const dist = this.stopAt - s;
      const decel = this.brakeDecel * 0.7;
      target = Math.min(target, dist <= 0.4 ? 0 : Math.sqrt(2 * decel * Math.max(0, dist - 0.6)) + 0.4);
    }
    if (gap < Infinity) target = Math.min(target, Math.sqrt(2 * this.brakeDecel * 0.6 * Math.max(0, gap - 4.5)));
    if (this.hold) target = 0;

    if (target < 0.5 && speed < 1.2) {
      // Hold still: release both pedals so the body's auto-hold keeps the car put (a brake press at a standstill
      // would engage reverse, exactly as it does for a human).
      out.throttle = 0;
      out.brake = 0;
    } else if (speed > target + 1) {
      out.throttle = 0;
      out.brake = clamp((speed - target) / 5, 0, this.maxBrake);
    } else {
      out.brake = 0;
      out.throttle = clamp((target - speed) / 3 + 0.25, 0, 1);
      if (target < 3) out.throttle = Math.min(out.throttle, 0.3);
    }
  }
}
