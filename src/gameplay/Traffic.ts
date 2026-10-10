import type { RivalDef, StopDef, HazardDef, TrafficDef, TrafficKind } from '../data/types';
import { clamp, mulberry32 } from '../core/math';
import type { Course } from '../world/Course';
import type { RoadPose } from '../world/Road';

export interface KindSpec {
  /** Radius (m) of each of the two obstacle circles and how far they sit from the centre. */
  radius: number;
  off: number;
  /** Body length (m), for following gaps. */
  len: number;
  /** Absolute cruise range (m/s); otherwise the level's own range. */
  speed?: [number, number];
  /** Slows noticeably going uphill (trucks, buses). */
  climb?: boolean;
  /** Rides near the edge of the road (cyclists). */
  edge?: boolean;
}

export const TRAFFIC_KINDS: Record<TrafficKind, KindSpec> = {
  car: { radius: 1.15, off: 1.1, len: 4.2 },
  suv: { radius: 1.2, off: 1.2, len: 4.8 },
  bus: { radius: 1.5, off: 2.8, len: 9.4, speed: [7.5, 10.5], climb: true },
  truck: { radius: 1.4, off: 2.6, len: 7.4, speed: [5.5, 8.2], climb: true },
  moto: { radius: 0.6, off: 0.5, len: 2.0, speed: [11, 15] },
  bike: { radius: 0.55, off: 0.5, len: 1.9, speed: [3.0, 4.4], edge: true },
};

export interface TrafficCar {
  id: number;
  kind: TrafficKind;
  scripted: boolean;
  s: number;
  /** Lateral offset from the centre line (+ = right of the direction of the road). */
  lane: number;
  /** +1 travelling with the road direction, -1 oncoming. */
  dir: 1 | -1;
  speed: number;
  cruise: number;
  x: number;
  z: number;
  /** Radians, yaw of the car's forward (-Z local) direction. */
  heading: number;
  colorIndex: number;
  obstacles: [number, number];
  alive: boolean;
}

const SAFE_GAP_BASE = 7;
const MAX_ACCEL = 2.6;
const MAX_BRAKE = 8;
/** Never spawn closer than this to the player (m), and never inside their view cone ahead. */
export const MIN_SPAWN_DISTANCE = 140;

/** Reads curvature ahead so traffic slows for bends. */
function curvatureAhead(course: Course, s: number, pose: RoadPose, pose2: RoadPose): number {
  course.road.at(s, pose);
  course.road.at(s + 14, pose2);
  const dot = clamp(pose.tx * pose2.tx + pose.tz * pose2.tz, -1, 1);
  return Math.acos(dot) / 14;
}

/**
 * Lightweight road traffic: a bounded number of cars following the road centre line in a lane, slowing for
 * bends and for whatever is ahead (other cars, the player, boulders), and spawning only well out of sight.
 * No pathfinding or lane changes: cars simply never leave their lane, which keeps cost and surprises low.
 */
export class TrafficSystem {
  readonly cars: TrafficCar[] = [];
  private rng: () => number;
  private readonly poseA: RoadPose = { x: 0, y: 0, z: 0, tx: 0, tz: -1 };
  private readonly poseB: RoadPose = { x: 0, y: 0, z: 0, tx: 0, tz: -1 };
  private nextId = 1;
  private respawnIn = 0;
  private readonly keepClear: number[];
  private readonly scriptedDone = new Set<number>();

  constructor(
    private readonly course: Course,
    private readonly def: TrafficDef,
    stops: StopDef[],
    hazards: HazardDef[],
  ) {
    this.rng = mulberry32(def.seed);
    this.keepClear = [
      ...stops.map((s) => course.stretchToS(s.at)),
      ...hazards.map((h) => course.stretchToS(h.at)),
    ];
    this.reset();
  }

  get count(): number {
    return this.cars.length;
  }

  /** Remove every car and lay the initial traffic out along the road, away from the start and the stops. */
  reset(): void {
    this.rng = mulberry32(this.def.seed);
    this.nextId = 1;
    this.respawnIn = 0;
    this.scriptedDone.clear();
    const ob = this.course.obstacles;
    for (const c of this.cars) c.obstacles.forEach((id) => ob.remove(id));
    this.cars.length = 0;
    const c = this.course;
    const span = c.finishS - c.startS - 220;
    for (let i = 0; i < this.def.count; i++) {
      const s = c.startS + 150 + ((i + this.rng() * 0.7) / this.def.count) * span;
      this.spawn(s);
    }
  }

  private pickKind(): TrafficKind {
    const mix = this.def.mix;
    if (!mix || !mix.length) return 'car';
    const total = mix.reduce((n, m) => n + m.weight, 0);
    let r = this.rng() * total;
    for (const m of mix) {
      r -= m.weight;
      if (r <= 0) return m.kind;
    }
    return mix[mix.length - 1].kind;
  }

  /** Lane centre for a car at its current spot: it follows the road's width as it narrows or widens. */
  private laneFor(kind: TrafficKind, dir: 1 | -1, s: number): number {
    const hw = this.course.road.halfWidthAtS(s);
    // Left-hand traffic: with the road direction use the left lane, oncoming use the right lane.
    const mag = TRAFFIC_KINDS[kind].edge ? Math.max(1.2, hw - 0.95) : hw * 0.5;
    return (dir === -1 ? 1 : -1) * mag;
  }

  private spawn(s: number, forceKind?: TrafficKind, forceSpeed?: number, scripted = false): TrafficCar | null {
    if (!scripted && this.cars.length >= this.def.count) return null;
    if (this.cars.length >= 16) return null; // hard cap: obstacle slots and draw cost stay bounded
    for (const k of this.keepClear) if (Math.abs(k - s) < (scripted ? 8 : 28)) return null;
    const oncoming = scripted ? false : this.rng() < this.def.oncoming;
    const dir: 1 | -1 = oncoming ? -1 : 1;
    const kind = forceKind ?? this.pickKind();
    const spec = TRAFFIC_KINDS[kind];
    const lane = this.laneFor(kind, dir, s);
    for (const o of this.cars) if (o.dir === dir && Math.abs(o.s - s) < 38 + (spec.len + TRAFFIC_KINDS[o.kind].len) / 2) return null;
    const range = spec.speed ?? this.def.speed;
    const cruise = forceSpeed ?? range[0] + this.rng() * (range[1] - range[0]);
    const car: TrafficCar = {
      id: this.nextId++,
      kind,
      scripted,
      s,
      lane,
      dir,
      speed: cruise,
      cruise,
      x: 0,
      z: 0,
      heading: 0,
      colorIndex: Math.floor(this.rng() * 6),
      obstacles: [-1, -1],
      alive: true,
    };
    this.place(car, true);
    this.cars.push(car);
    return car;
  }

  /** Position (and obstacle circles) from the car's s / lane. */
  private place(car: TrafficCar, create: boolean): void {
    const p = this.course.road.at(car.s, this.poseA);
    const rx = -p.tz;
    const rz = p.tx;
    car.lane = this.laneFor(car.kind, car.dir, car.s);
    car.x = p.x + rx * car.lane;
    car.z = p.z + rz * car.lane;
    const hx = p.tx * car.dir;
    const hz = p.tz * car.dir;
    car.heading = Math.atan2(-hx, -hz); // yaw that points the model's -Z at its travel direction
    const ob = this.course.obstacles;
    const vx = hx * car.speed;
    const vz = hz * car.speed;
    const spec = TRAFFIC_KINDS[car.kind];
    for (let k = 0; k < 2; k++) {
      const off = k === 0 ? spec.off : -spec.off;
      const cx = car.x + hx * off;
      const cz = car.z + hz * off;
      if (create)
        car.obstacles[k] = ob.add(cx, cz, spec.radius, {
          vx,
          vz,
          push: 0.55,
          restitution: 0.25,
          tag: 'traffic',
        });
      else ob.move(car.obstacles[k], cx, cz, vx, vz);
    }
  }

  /** Distance (m) to the nearest thing ahead of `car` in its lane, and its speed along the car's direction. */
  private leader(
    car: TrafficCar,
    player: { s: number; lateral: number; speed: number },
  ): { gap: number; speed: number } {
    let gap = Infinity;
    let lspeed = 0;
    for (const o of this.cars) {
      if (o === car || o.dir !== car.dir || Math.abs(o.lane - car.lane) > 1.6) continue;
      const g = (o.s - car.s) * car.dir - ((TRAFFIC_KINDS[o.kind].len + TRAFFIC_KINDS[car.kind].len) / 2 + 0.8);
      if (g > -2 && g < gap) {
        gap = g;
        lspeed = o.speed;
      }
    }
    // The player (either direction): in the car's lane (within 2 m laterally) and ahead of it.
    if (Math.abs(player.lateral - car.lane) < 2.1) {
      const rel = (player.s - car.s) * car.dir;
      const g = rel - 5;
      if (rel > 0 && g < gap) {
        gap = g;
        lspeed = car.dir === 1 ? Math.max(0, player.speed) : 0;
      }
    }
    // Static hazards: look for non-traffic obstacles in a corridor ahead.
    const ob = this.course.obstacles;
    const p = this.course.road.at(car.s, this.poseA);
    const hx = p.tx * car.dir;
    const hz = p.tz * car.dir;
    for (let i = 0; i < ob.capacity; i++) {
      if (!ob.active[i] || ob.tags[i] === 'traffic' || ob.tags[i] === 'rival') continue;
      const dx = ob.xs[i] - car.x;
      const dz = ob.zs[i] - car.z;
      const along = dx * hx + dz * hz;
      const across = Math.abs(-dx * hz + dz * hx);
      if (along > 0 && along < 30 && across < ob.rs[i] + 1.5) {
        const g = along - ob.rs[i] - 2.2;
        if (g < gap) {
          gap = g;
          lspeed = 0;
        }
      }
    }
    return { gap, speed: lspeed };
  }

  update(dt: number, player: { s: number; lateral: number; speed: number }): void {
    const c = this.course;
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const car = this.cars[i];
      const kappa = curvatureAhead(c, car.s, this.poseA, this.poseB);
      const curveCap = kappa > 1e-3 ? Math.max(6, Math.sqrt(4.2 / kappa)) : car.cruise;
      let desired = Math.min(car.cruise, curveCap);
      if (TRAFFIC_KINDS[car.kind].climb) {
        // Heavy vehicles labour uphill: up to 40% slower on a steep grade.
        const grade = ((this.poseB.y - this.poseA.y) / 14) * car.dir;
        desired *= 1 - clamp(grade * 6, 0, 0.4);
      }
      const lead = this.leader(car, player);
      const safe = SAFE_GAP_BASE + car.speed * 1.5;
      if (lead.gap < safe) {
        const t = clamp((lead.gap - 3) / (safe - 3), 0, 1);
        desired = Math.min(desired, lead.speed * t);
      }
      const dv = desired - car.speed;
      car.speed += clamp(dv, -MAX_BRAKE * dt, MAX_ACCEL * dt);
      car.speed = Math.max(0, car.speed);
      car.s += car.dir * car.speed * dt;
      this.place(car, false);

      const behind = (player.s - car.s) * car.dir;
      const gone =
        car.s > c.finishS + 30 ||
        car.s < c.startS - 30 ||
        (behind > 70 && car.dir === 1) ||
        (behind > 90 && car.dir === -1);
      if (gone) {
        car.obstacles.forEach((id) => c.obstacles.remove(id));
        this.cars.splice(i, 1);
        this.respawnIn = Math.min(this.respawnIn, 1.5);
      }
    }
    // Hand-placed road users (a slow truck on the climb): spawned once as the player gets near.
    const sc = this.def.scripted;
    if (sc) {
      for (let i = 0; i < sc.length; i++) {
        if (this.scriptedDone.has(i)) continue;
        const at = c.stretchToS(sc[i].at);
        if (player.s >= at - 230 && player.s <= at - 60) {
          if (this.spawn(at, sc[i].kind, sc[i].speed, true)) this.scriptedDone.add(i);
        } else if (player.s > at - 60) this.scriptedDone.add(i);
      }
    }
    // Replace cars well ahead of the player, never inside the player's view.
    this.respawnIn -= dt;
    if (this.cars.length < this.def.count && this.respawnIn <= 0) {
      this.respawnIn = 1.2;
      const ahead = MIN_SPAWN_DISTANCE + this.rng() * 140;
      const s = player.s + ahead;
      if (s < c.finishS - 40) this.spawn(s);
    }
  }
}

// -------------------------------------------------------------------------------------------- rival

export interface RivalState {
  s: number;
  lane: number;
  x: number;
  z: number;
  heading: number;
  finished: boolean;
  obstacles: [number, number];
  /** Seconds (from GO) at which it finishes. */
  finishAt: number;
  started: boolean;
}

/**
 * A rival tour operator: a pace-setting vehicle that follows the same road on a fixed, deterministic schedule
 * (faster on straights, slower through bends, scaled so it finishes in exactly `finishTime` seconds).
 * It is a solid object (bumping it costs you time), but it never reacts to the player.
 */
export class Rival {
  readonly state: RivalState;
  private readonly times: Float32Array;
  private readonly stepM = 4;
  private readonly start: number;
  private readonly poseA: RoadPose = { x: 0, y: 0, z: 0, tx: 0, tz: -1 };
  private readonly poseB: RoadPose = { x: 0, y: 0, z: 0, tx: 0, tz: -1 };
  private lane: number;

  constructor(
    private readonly course: Course,
    readonly def: RivalDef,
  ) {
    // The rival waits on the grid in the next slot, 22 m ahead of the player, so they never overlap at the start.
    this.start = course.startS + 22;
    const n = Math.ceil((course.finishS - this.start) / this.stepM);
    const t = new Float32Array(n + 1);
    let acc = 0;
    for (let i = 0; i < n; i++) {
      const s = this.start + i * this.stepM;
      const k = curvatureAhead(course, s, this.poseA, this.poseB);
      const v = Math.min(36, k > 1e-3 ? Math.max(8, Math.sqrt(7 / k)) : 36);
      acc += this.stepM / v;
      t[i + 1] = acc;
    }
    const scale = (def.finishTime - def.headStart) / acc;
    for (let i = 0; i <= n; i++) t[i] *= scale;
    this.times = t;
    this.lane = -course.road.halfWidth * 0.5;
    this.state = {
      s: this.start,
      lane: this.lane,
      x: 0,
      z: 0,
      heading: 0,
      finished: false,
      obstacles: [-1, -1],
      finishAt: def.finishTime,
      started: false,
    };
    this.place(true);
  }

  /** Road distance at `t` seconds after GO. */
  sAt(t: number): number {
    const tt = t - this.def.headStart;
    if (tt <= 0) return this.start;
    const times = this.times;
    if (tt >= times[times.length - 1]) return this.course.finishS;
    let lo = 0;
    let hi = times.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (times[mid] <= tt) lo = mid;
      else hi = mid;
    }
    const f = (tt - times[lo]) / Math.max(1e-6, times[hi] - times[lo]);
    return this.start + (lo + f) * this.stepM;
  }

  private place(create: boolean): void {
    const st = this.state;
    const p = this.course.road.at(st.s, this.poseA);
    st.x = p.x - p.tz * this.lane;
    st.z = p.z + p.tx * this.lane;
    st.heading = Math.atan2(-p.tx, -p.tz);
    const ob = this.course.obstacles;
    const speed = st.finished ? 0 : this.speedNow;
    for (let k = 0; k < 2; k++) {
      const off = k === 0 ? 2.3 : -2.3;
      const cx = st.x + p.tx * off;
      const cz = st.z + p.tz * off;
      if (create)
        st.obstacles[k] = ob.add(cx, cz, 1.35, {
          vx: p.tx * speed,
          vz: p.tz * speed,
          push: 0.5,
          restitution: 0.2,
          tag: 'rival',
        });
      else ob.move(st.obstacles[k], cx, cz, p.tx * speed, p.tz * speed);
    }
  }

  private speedNow = 0;

  /** Advance to `t` seconds after GO. */
  update(t: number, dt: number): void {
    const st = this.state;
    const prev = st.s;
    st.s = this.sAt(t);
    st.started = t >= this.def.headStart;
    this.speedNow = Math.max(0, (st.s - prev) / Math.max(1e-3, dt));
    if (st.s >= this.course.finishS - 0.5) st.finished = true;
    this.place(false);
  }

  reset(): void {
    const st = this.state;
    st.s = this.start;
    st.finished = false;
    st.started = false;
    this.speedNow = 0;
    this.place(false);
  }

  dispose(): void {
    this.state.obstacles.forEach((id) => this.course.obstacles.remove(id));
  }
}
