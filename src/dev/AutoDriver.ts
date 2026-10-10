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
  /** Seconds the bot has been pushing the throttle without moving, and how much longer it will back up for. */
  private wedged = 0;
  private reversing = 0;
  private reverseStraight = false;
  /** What the bot decided on its last update (for diagnostics and tests). */
  readonly last = { target: 0, gap: Infinity, offset: 0 };
  private readonly halfWidth: number;
  private readonly halfLength: number;

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
    this.halfLength = (vehicle?.size.length ?? 4.2) / 2;
  }

  /** Lateral offset (m) from the road centre that keeps clear of what is ahead; sets `gap` when nothing is clear. */
  private plan(s: number, speed: number): { offset: number; gap: number; tight: boolean; near: { lat: number; r: number; along: number; perm: boolean }[] } {
    const road = this.course.road;
    const ob = this.course.obstacles;
    // The local wall (roads widen and narrow along their length), not the widest one.
    const limit = Math.max(0, road.wallAtS(s) - this.halfWidth - 0.35);
    const horizon = 14 + speed * 2.4;
    // Obstacles within the planning horizon, as lateral centre / radius pairs.
    const near: { lat: number; r: number; along: number; perm: boolean }[] = [];
    for (let i = 0; i < ob.capacity; i++) {
      if (!ob.active[i]) continue;
      if (!road.project(ob.xs[i], ob.zs[i], this.oHit)) continue;
      const along = this.oHit.s - s;
      if (along < -3 || along > horizon) continue;
      // Traffic clears in time; rocks, a broken lorry and the like do not.
      near.push({ lat: this.oHit.lateral, r: ob.rs[i], along, perm: ob.tags[i] !== 'traffic' && ob.tags[i] !== 'rival' });
    }
    let off = clamp(this.offset, -limit, limit);
    if (!this.avoid || near.length === 0) {
      // Drift back to the centre line.
      off += (0 - off) * 0.04;
      this.offset = off;
      return { offset: off, gap: Infinity, tight: false, near };
    }
    // First leave generous room (pure pursuit cuts bends, so the margin grows with speed); if no lane is that wide, squeeze through
    // with the least room that still clears, as a driver would between rocks.
    const margins = [0.7 + Math.min(0.9, speed * 0.07), 0.35];
    let best = off;
    let gap = Infinity;
    let tight = false;
    for (let m = 0; m < margins.length; m++) {
      tight = m > 0;
      const blocked = near.map((o) => {
        const clear = o.r + this.halfWidth + margins[m];
        return [o.lat - clear, o.lat + clear, o.along, o.perm ? 1 : 0] as [number, number, number, number];
      });
      // Candidate lateral positions: the centre, and just outside every blocked interval.
      const candidates = [0, ...blocked.flatMap(([lo, hi]) => [lo, hi])].map((c) => clamp(c, -limit, limit));
      let bestCost = Infinity;
      let anyFree = false;
      for (const c of candidates) {
        let free = true;
        let nearest = Infinity;
        let permanent = false;
        for (const [lo, hi, along, perm] of blocked) {
          if (c > lo && c < hi) {
            free = false;
            nearest = Math.min(nearest, along);
            if (perm) permanent = true;
          }
        }
        if (free) anyFree = true;
        const cost = (free ? 0 : 1000 - nearest + (permanent ? 3000 : 0)) + Math.abs(c - off) * 2 + Math.abs(c) * 0.5;
        if (cost < bestCost) {
          bestCost = cost;
          best = c;
          gap = free ? Infinity : nearest;
        }
      }
      if (anyFree) break;
    }
    // Move toward the chosen lane smoothly.
    off += clamp(best - off, -0.12, 0.12);
    this.offset = off;
    return { offset: off, gap, tight, near };
  }

  update(body: VehicleBody, out: VehicleInput): void {
    const road = this.course.road;
    const pos = body.position;
    road.project(pos.x, pos.z, this.hit);
    const speed = Math.max(0, body.speed);
    const s = this.hit.s;

    const { offset, gap, tight, near } = this.plan(s, speed);
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
    // Squeezing between rocks or cars: only at a walking pace.
    if (tight) target = Math.min(target, 6);
    // Whatever the plan says, never run into something that is physically in the way of where the car IS: brake for the nearest
    // obstacle that overlaps the car's actual lateral position, to a stop short of its edge.
    let ahead = Infinity;
    // The car is on its way to the planned lane, so judge it from where it is about to be (most of the way there).
    const aim = gap === Infinity ? this.hit.lateral + 0.6 * (offset - this.hit.lateral) : this.hit.lateral;
    for (const o of near) {
      if (Math.abs(o.lat - aim) < o.r + this.halfWidth + 0.1) ahead = Math.min(ahead, o.along - o.r - this.halfLength);
    }
    if (ahead < Infinity) {
      target = Math.min(target, Math.sqrt(2 * this.brakeDecel * 0.6 * Math.max(0, ahead - 1.2)));
      // Not yet lined up with the way round: creep (steering needs some speed) rather than sit in front of it for ever.
      if (gap === Infinity && ahead > 3 && Math.abs(offset - this.hit.lateral) > 0.35) target = Math.max(target, 2);
    }
    if (gap < Infinity) target = Math.min(target, Math.sqrt(2 * this.brakeDecel * 0.6 * Math.max(0, gap - 4.5)));
    if (this.hold) target = 0;
    this.last.target = target;
    this.last.gap = gap;
    this.last.offset = offset;

    // Wedged against a rock or a car with the throttle down: back up a little and try again, as a driver would.
    const dt = 1 / 120;
    if (this.reversing > 0) {
      this.reversing -= dt;
      out.throttle = 0;
      out.brake = 1;
      out.steer = this.reverseStraight ? 0 : -out.steer;
      return;
    }
    // (or sitting right in front of something with the way round already planned: back off and line up properly)
    const lineUp = ahead < Infinity && gap === Infinity && target < 0.5;
    if ((target > 2 || lineUp) && speed < 0.3) this.wedged += dt;
    else this.wedged = 0;
    if (this.wedged > 2.5) {
      this.wedged = 0;
      this.reversing = 1.6;
      this.reverseStraight = lineUp;
    }

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
