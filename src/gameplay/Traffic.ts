import type { RivalDef, StopDef, HazardDef, TrafficDef, TrafficKind } from '../data/types';
import { Emitter } from '../core/emitter';
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
  /** How it sounds when it passes close by. */
  sound?: 'heavy' | 'light' | 'bike';
}

export const TRAFFIC_KINDS: Record<TrafficKind, KindSpec> = {
  car: { radius: 1.15, off: 1.1, len: 4.2, sound: 'light' },
  suv: { radius: 1.2, off: 1.2, len: 4.8, sound: 'light' },
  taxi: { radius: 1.1, off: 1.05, len: 3.9, speed: [5.5, 10.5], sound: 'light' },
  bus: { radius: 1.5, off: 2.8, len: 9.4, speed: [7.5, 10.5], climb: true, sound: 'heavy' },
  minibus: { radius: 1.4, off: 2.0, len: 6.6, speed: [6.5, 9.5], climb: true, sound: 'heavy' },
  truck: { radius: 1.4, off: 2.6, len: 7.4, speed: [5.5, 8.2], climb: true, sound: 'heavy' },
  delivery: { radius: 1.4, off: 2.2, len: 6.0, speed: [4.5, 7.5], climb: true, sound: 'heavy' },
  moto: { radius: 0.6, off: 0.5, len: 2.0, speed: [11, 15], sound: 'bike' },
  scooter: { radius: 0.5, off: 0.4, len: 1.7, speed: [7, 11], sound: 'bike' },
  bike: { radius: 0.55, off: 0.5, len: 1.9, speed: [3.0, 4.4], edge: true },
};

/** A straight run across the road (cross traffic leaving a side street). */
interface CrossPath {
  x0: number;
  z0: number;
  dx: number;
  dz: number;
  len: number;
  t: number;
}

/** A turn into a side street: a quadratic curve from the car's lane, through the junction, down the side street. */
interface TurnPath {
  p0x: number;
  p0z: number;
  cx: number;
  cz: number;
  p2x: number;
  p2z: number;
  len: number;
  u: number;
}

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
  /** Standing still (a queue, a blocking truck) until the player is near and `holdLeft` has run out. */
  holding: boolean;
  holdLeft: number;
  trigger: number;
  /** Seconds spent stopped behind something (drives the horn). */
  waited: number;
  honkCool: number;
  /** Index of the last junction this car already decided about. */
  turnSeen: number;
  cross: CrossPath | null;
  turn: TurnPath | null;
}

/** A pedestrian on a zebra crossing: waits at the kerb, crosses when traffic has stopped, rests, and goes back. */
export interface PedState {
  /** Lateral position from the centre line (m); the kerbs are at +/- the crossing's reach. */
  lat: number;
  /** +1: walking toward +lateral. */
  dir: 1 | -1;
  /** Offset along the road from the crossing's centre (m): the group spreads out. */
  along: number;
  state: 'rest' | 'wait' | 'cross';
  timer: number;
  obstacle: number;
}

export type ControlPhase = 'go' | 'stop';

export interface TrafficControl {
  kind: 'police' | 'crossing';
  /** Distance along the road (m). */
  s: number;
  /** police: `stop` halts the main road (cross traffic flows); crossing: always `go`. */
  phase: ControlPhase;
  timer: number;
  goTime: number;
  stopTime: number;
  peds: PedState[];
  /** crossing: traffic must stop for pedestrians right now. */
  yieldNow: boolean;
  /** police: index of the matching side street in `course.junctions`, or -1. */
  junction: number;
  crossLeft: number;
  crossTimer: number;
  /** Half the crossing's reach (kerb distance from the centre line). */
  reach: number;
  warnCool: number;
}

type TrafficEvents = {
  /** A police signal changed. */
  phase: TrafficControl;
  /** A driver sounded the horn (queued behind something for a while). */
  honk: TrafficCar;
  /** The player drove through a red signal. */
  violation: TrafficControl;
  /** The player drove fast over a crossing with pedestrians on it. */
  yieldPedestrians: TrafficControl;
};

const SAFE_GAP_BASE = 7;
const MAX_ACCEL = 2.6;
const MAX_BRAKE = 8;
const HARD_CAP = 22;
/** Distance (m) before a control where traffic stops. */
const STOP_LINE = 7.5;
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
 * Lightweight road traffic: a bounded number of vehicles following the road centre line in a lane (left-hand traffic),
 * slowing for bends, for whatever is ahead (other vehicles, the player, boulders) and for the stop line of a police
 * signal or a pedestrian crossing; queueing and restarting; turning into side streets; and spawning only well out of
 * sight. There is no pathfinding or lane changing: vehicles keep their lane, which keeps cost and surprises low.
 */
export class TrafficSystem {
  readonly cars: TrafficCar[] = [];
  readonly controls: TrafficControl[] = [];
  readonly events = new Emitter<TrafficEvents>();
  private rng: () => number;
  private readonly poseA: RoadPose = { x: 0, y: 0, z: 0, tx: 0, tz: -1 };
  private readonly poseB: RoadPose = { x: 0, y: 0, z: 0, tx: 0, tz: -1 };
  private nextId = 1;
  private respawnIn = 0;
  private honkGlobal = 0;
  private prevPlayerS = 0;
  private readonly keepClear: number[];
  private readonly scriptedDone = new Set<number>();

  constructor(
    private readonly course: Course,
    private readonly def: TrafficDef,
    stops: StopDef[],
    hazards: HazardDef[],
  ) {
    this.rng = mulberry32(def.seed);
    for (const c of def.controls ?? []) {
      const s = course.stretchToS(c.at);
      let junction = -1;
      course.junctions.forEach((j, i) => {
        if (Math.abs(j.s - s) < 4) junction = i;
      });
      const peds: PedState[] = [];
      const reach = Math.min(course.road.halfWidthAtS(s) + 1.3, course.road.wallAtS(s) - 0.4);
      if (c.kind === 'crossing') {
        const n = Math.max(1, Math.min(4, c.peds ?? 3));
        for (let i = 0; i < n; i++) {
          const dir: 1 | -1 = i % 2 === 0 ? 1 : -1;
          peds.push({ lat: -dir * reach, dir, along: (i - (n - 1) / 2) * 0.9, state: 'rest', timer: 4 + i * 0.7, obstacle: -1 });
        }
      }
      this.controls.push({
        kind: c.kind,
        s,
        phase: 'go',
        timer: 0,
        goTime: c.go ?? 16,
        stopTime: c.stop ?? 13,
        peds,
        yieldNow: false,
        junction,
        crossLeft: 0,
        crossTimer: 0,
        reach,
        warnCool: 0,
      });
    }
    this.keepClear = [
      ...stops.map((s) => course.stretchToS(s.at)),
      ...hazards.map((h) => course.stretchToS(h.at)),
      ...this.controls.map((c) => c.s),
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
    this.honkGlobal = 0;
    this.prevPlayerS = 0;
    this.scriptedDone.clear();
    const ob = this.course.obstacles;
    for (const c of this.cars) c.obstacles.forEach((id) => ob.remove(id));
    this.cars.length = 0;
    for (const ctl of this.controls) {
      ctl.phase = 'go';
      ctl.timer = ctl.goTime * 0.5;
      ctl.yieldNow = false;
      ctl.crossLeft = 0;
      ctl.crossTimer = 0;
      ctl.warnCool = 0;
      for (const p of ctl.peds) {
        ob.remove(p.obstacle);
        p.obstacle = -1;
        p.state = 'rest';
        p.timer = 4 + this.rng() * 5;
        p.lat = -p.dir * ctl.reach;
      }
    }
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

  private makeCar(kind: TrafficKind, dir: 1 | -1, s: number, speed: number, scripted: boolean): TrafficCar {
    return {
      id: this.nextId++,
      kind,
      scripted,
      s,
      lane: this.laneFor(kind, dir, s),
      dir,
      speed,
      cruise: speed,
      x: 0,
      z: 0,
      heading: 0,
      colorIndex: Math.floor(this.rng() * 6),
      obstacles: [-1, -1],
      alive: true,
      holding: false,
      holdLeft: 0,
      trigger: 70,
      waited: 0,
      honkCool: 0,
      turnSeen: -1,
      cross: null,
      turn: null,
    };
  }

  private spawn(s: number, forceKind?: TrafficKind, forceSpeed?: number, scripted = false, hold?: number, trigger?: number): TrafficCar | null {
    if (!scripted && this.cars.length >= this.def.count) return null;
    if (this.cars.length >= HARD_CAP) return null; // hard cap: obstacle slots and draw cost stay bounded
    for (const k of this.keepClear) if (Math.abs(k - s) < (scripted ? 8 : 28)) return null;
    const oncoming = scripted ? false : this.rng() < this.def.oncoming;
    const dir: 1 | -1 = oncoming ? -1 : 1;
    const kind = forceKind ?? this.pickKind();
    const spec = TRAFFIC_KINDS[kind];
    for (const o of this.cars) if (!o.cross && !o.turn && o.dir === dir && Math.abs(o.s - s) < (scripted ? 6 : 38) + (spec.len + TRAFFIC_KINDS[o.kind].len) / 2) return null;
    const range = spec.speed ?? this.def.speed;
    const cruise = forceSpeed ?? range[0] + this.rng() * (range[1] - range[0]);
    const car = this.makeCar(kind, dir, s, hold !== undefined ? 0 : cruise, scripted);
    car.cruise = cruise;
    if (hold !== undefined) {
      car.holding = true;
      car.holdLeft = hold;
      car.trigger = trigger ?? 70;
    }
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
    this.placeAt(car, p.x + rx * car.lane, p.z + rz * car.lane, p.tx * car.dir, p.tz * car.dir, create);
  }

  /** Sets a car's world position and heading (unit vector hx, hz) and moves its two obstacle circles with it. */
  private placeAt(car: TrafficCar, x: number, z: number, hx: number, hz: number, create: boolean): void {
    car.x = x;
    car.z = z;
    car.heading = Math.atan2(-hx, -hz); // yaw that points the model's -Z at its travel direction
    const ob = this.course.obstacles;
    const vx = hx * car.speed;
    const vz = hz * car.speed;
    const spec = TRAFFIC_KINDS[car.kind];
    for (let k = 0; k < 2; k++) {
      const off = k === 0 ? spec.off : -spec.off;
      const cx = x + hx * off;
      const cz = z + hz * off;
      if (create) car.obstacles[k] = ob.add(cx, cz, spec.radius, { vx, vz, push: 0.55, restitution: 0.25, tag: 'traffic' });
      else ob.move(car.obstacles[k], cx, cz, vx, vz);
    }
  }

  private removeCar(i: number): void {
    const car = this.cars[i];
    car.obstacles.forEach((id) => this.course.obstacles.remove(id));
    this.cars.splice(i, 1);
  }

  /** Distance (m) to the nearest thing ahead of `car` in its lane, and its speed along the car's direction. */
  private leader(
    car: TrafficCar,
    player: { s: number; lateral: number; speed: number },
  ): { gap: number; speed: number } {
    let gap = Infinity;
    let lspeed = 0;
    const spec = TRAFFIC_KINDS[car.kind];
    for (const o of this.cars) {
      if (o === car || o.cross || o.turn || o.dir !== car.dir || Math.abs(o.lane - car.lane) > 1.6) continue;
      const g = (o.s - car.s) * car.dir - ((TRAFFIC_KINDS[o.kind].len + spec.len) / 2 + 0.8);
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
    // Stop lines: a police signal showing red, or pedestrians on (or about to step onto) a crossing.
    for (const ctl of this.controls) {
      const stopping = ctl.kind === 'police' ? ctl.phase === 'stop' : ctl.yieldNow;
      if (!stopping) continue;
      const line = ctl.s - car.dir * STOP_LINE;
      const g = (line - car.s) * car.dir - spec.len * 0.5;
      if (g > -1.5 && g < 60 && g < gap) {
        gap = g;
        lspeed = 0;
      }
    }
    // Static hazards: look for non-traffic obstacles in a corridor ahead (parked vehicles are pulled in to the kerb and ignored).
    const ob = this.course.obstacles;
    const p = this.course.road.at(car.s, this.poseA);
    const hx = p.tx * car.dir;
    const hz = p.tz * car.dir;
    for (let i = 0; i < ob.capacity; i++) {
      if (!ob.active[i]) continue;
      const tag = ob.tags[i];
      if (tag === 'traffic' || tag === 'rival' || tag === 'parked' || tag === 'gate') continue;
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
    this.honkGlobal = Math.max(0, this.honkGlobal - dt);
    this.updateControls(dt, player);
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const car = this.cars[i];
      car.honkCool = Math.max(0, car.honkCool - dt);
      if (car.cross) {
        if (this.updateCross(car, dt, player)) this.removeCar(i);
        continue;
      }
      if (car.turn) {
        if (this.updateTurn(car, dt)) this.removeCar(i);
        continue;
      }
      const kappa = curvatureAhead(c, car.s, this.poseA, this.poseB);
      const curveCap = kappa > 1e-3 ? Math.max(6, Math.sqrt(4.2 / kappa)) : car.cruise;
      let desired = Math.min(car.cruise, curveCap);
      if (TRAFFIC_KINDS[car.kind].climb) {
        // Heavy vehicles labour uphill: up to 40% slower on a steep grade.
        const grade = ((this.poseB.y - this.poseA.y) / 14) * car.dir;
        desired *= 1 - clamp(grade * 6, 0, 0.4);
      }
      if (car.holding) {
        desired = 0;
        if (Math.abs(player.s - car.s) < car.trigger) {
          car.holdLeft -= dt;
          if (car.holdLeft <= 0) car.holding = false;
        }
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

      // A driver stuck behind something for a while leans on the horn (rarely, and only if the player can hear it).
      if (!car.holding && car.speed < 0.4 && lead.gap < 9) car.waited += dt;
      else car.waited = 0;
      if (car.waited > 4.5 && car.honkCool <= 0 && this.honkGlobal <= 0 && Math.abs(player.s - car.s) < 110) {
        car.honkCool = 15;
        car.waited = 2;
        this.honkGlobal = 3.5;
        this.events.emit('honk', car);
      }

      // Turning into a side street (only cars travelling with the road).
      const chance = this.def.turnChance ?? 0;
      if (chance > 0 && car.dir === 1 && !car.holding) {
        for (let ji = 0; ji < c.junctions.length; ji++) {
          const d = c.junctions[ji].s - car.s;
          if (d > 14 && d < 34 && car.turnSeen !== ji) {
            car.turnSeen = ji;
            if (this.rng() < chance) this.beginTurn(car, ji);
            break;
          }
        }
        if (car.turn) {
          continue;
        }
      }
      this.place(car, false);

      const behind = (player.s - car.s) * car.dir;
      const gone =
        car.s > c.finishS + 30 ||
        car.s < c.startS - 30 ||
        (behind > 70 && car.dir === 1) ||
        (behind > 90 && car.dir === -1);
      if (gone) this.removeCar(i);
    }
    this.prevPlayerS = player.s;
    // Hand-placed road users (queues, a lorry blocking a lane, a slow truck on the climb): spawned once as the player gets near.
    const sc = this.def.scripted;
    if (sc) {
      for (let i = 0; i < sc.length; i++) {
        if (this.scriptedDone.has(i)) continue;
        const at = c.stretchToS(sc[i].at);
        if (player.s >= at - 260 && player.s <= at - 60) {
          if (this.spawn(at, sc[i].kind, sc[i].speed, true, sc[i].hold, sc[i].trigger)) this.scriptedDone.add(i);
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

  // ------------------------------------------------------------------ signals and crossings

  private crossingClear(ctl: TrafficControl, player: { s: number; speed: number }): boolean {
    for (const o of this.cars) {
      if (o.cross || o.turn) continue;
      if (Math.abs(o.s - ctl.s) < 4 && o.speed > 0.6) return false;
    }
    const d = ctl.s - player.s;
    if (Math.abs(d) < 5 && Math.abs(player.speed) > 1.5) return false;
    if (d > 0 && d < 28 && player.speed > 6) return false;
    return true;
  }

  private updateControls(dt: number, player: { s: number; lateral: number; speed: number }): void {
    const ob = this.course.obstacles;
    const road = this.course.road;
    for (const ctl of this.controls) {
      ctl.warnCool = Math.max(0, ctl.warnCool - dt);
      if (ctl.kind === 'police') {
        ctl.timer -= dt;
        if (ctl.timer <= 0) {
          ctl.phase = ctl.phase === 'go' ? 'stop' : 'go';
          ctl.timer = ctl.phase === 'go' ? ctl.goTime : ctl.stopTime;
          if (ctl.phase === 'stop') {
            ctl.crossLeft = 2;
            ctl.crossTimer = 1.8;
          }
          this.events.emit('phase', ctl);
        }
        if (ctl.phase === 'stop' && ctl.crossLeft > 0) {
          ctl.crossTimer -= dt;
          if (ctl.crossTimer <= 0) {
            this.spawnCross(ctl);
            ctl.crossLeft--;
            ctl.crossTimer = 3.2;
          }
        }
        // Driving through the red signal.
        const line = ctl.s - STOP_LINE;
        if (ctl.phase === 'stop' && ctl.warnCool <= 0 && this.prevPlayerS <= line && player.s > line && player.s < ctl.s + 6) {
          ctl.warnCool = 6;
          this.events.emit('violation', ctl);
        }
        continue;
      }
      // Zebra crossing.
      let anyWait = false;
      let anyCross = false;
      for (const p of ctl.peds) {
        if (p.state === 'rest') {
          p.timer -= dt;
          if (p.timer <= 0) {
            p.state = 'wait';
            p.timer = 3.4;
          }
        } else if (p.state === 'wait') {
          anyWait = true;
          p.timer -= dt;
          if (p.timer <= 0 && this.crossingClear(ctl, player)) {
            p.state = 'cross';
            const pose = road.at(ctl.s + p.along, this.poseA);
            p.obstacle = ob.add(pose.x - pose.tz * p.lat, pose.z + pose.tx * p.lat, 0.55, { push: 1, restitution: 0.05, tag: 'gate' });
          }
        } else {
          anyCross = true;
          p.lat += p.dir * 1.5 * dt;
          const pose = road.at(ctl.s + p.along, this.poseA);
          ob.move(p.obstacle, pose.x - pose.tz * p.lat, pose.z + pose.tx * p.lat, 0, 0);
          if (p.lat * p.dir >= ctl.reach) {
            p.lat = p.dir * ctl.reach;
            p.state = 'rest';
            p.dir = p.dir === 1 ? -1 : 1;
            p.timer = 9 + this.rng() * 10;
            ob.remove(p.obstacle);
            p.obstacle = -1;
          }
        }
      }
      ctl.yieldNow = anyWait || anyCross;
      if (anyCross && ctl.warnCool <= 0 && Math.abs(player.s - ctl.s) < 12 && player.speed > 4) {
        ctl.warnCool = 7;
        this.events.emit('yieldPedestrians', ctl);
      }
    }
  }

  // ------------------------------------------------------------------ cross traffic and turns

  /** A vehicle leaves one side street, crosses the (stopped) main road and drives off down the other side street. */
  private spawnCross(ctl: TrafficControl): void {
    if (ctl.junction < 0 || this.cars.length >= HARD_CAP) return;
    const j = this.course.junctions[ctl.junction];
    if (j.sides.length < 2) return;
    const road = this.course.road;
    const pose = road.at(j.s, this.poseA);
    const rx = -pose.tz;
    const rz = pose.tx;
    const side = this.rng() < 0.5 ? -1 : 1;
    const dx = -rx * side;
    const dz = -rz * side;
    const reach = road.wallAtS(j.s) + j.arm;
    // Left-hand traffic: the left of the travel direction is (dz, -dx).
    const sx = pose.x + rx * side * reach + dz * 1.5;
    const sz = pose.z + rz * side * reach - dx * 1.5;
    const kinds: TrafficKind[] = ['car', 'taxi', 'suv', 'scooter'];
    const kind = kinds[Math.floor(this.rng() * kinds.length)];
    const car = this.makeCar(kind, 1, j.s, 6.5, true);
    car.cross = { x0: sx, z0: sz, dx, dz, len: reach * 2, t: 0 };
    this.placeAt(car, sx, sz, dx, dz, true);
    this.cars.push(car);
  }

  /** Returns true when the cross vehicle is done and should be removed. */
  private updateCross(car: TrafficCar, dt: number, player: { s: number; speed: number }): boolean {
    const path = car.cross as CrossPath;
    // Wait for anything small and solid in the way (a stalled car, the player).
    const ob = this.course.obstacles;
    let target = 6.5;
    for (let i = 0; i < ob.capacity; i++) {
      if (!ob.active[i] || ob.tags[i] === 'traffic' || ob.tags[i] === 'gate') continue;
      const ex = ob.xs[i] - car.x;
      const ez = ob.zs[i] - car.z;
      const along = ex * path.dx + ez * path.dz;
      const across = Math.abs(-ex * path.dz + ez * path.dx);
      if (along > 0 && along < 10 && across < ob.rs[i] + 1.6) target = 0;
    }
    car.speed += clamp(target - car.speed, -MAX_BRAKE * dt, MAX_ACCEL * dt);
    car.speed = Math.max(0, car.speed);
    path.t += car.speed * dt;
    this.placeAt(car, path.x0 + path.dx * path.t, path.z0 + path.dz * path.t, path.dx, path.dz, false);
    return path.t >= path.len || Math.abs(player.s - car.s) > 320;
  }

  private beginTurn(car: TrafficCar, ji: number): void {
    const j = this.course.junctions[ji];
    if (!j.sides.length) return;
    const side = j.sides[Math.floor(this.rng() * j.sides.length)];
    if (side === 1) {
      // A right turn crosses the oncoming lane: only when nothing is coming.
      for (const o of this.cars) if (!o.cross && !o.turn && o.dir === -1 && Math.abs(o.s - j.s) < 45 && o.speed > 0.3) return;
    }
    const road = this.course.road;
    const pose = road.at(j.s, this.poseA);
    const rx = -pose.tz;
    const rz = pose.tx;
    const dx = rx * side;
    const dz = rz * side;
    const dist = road.wallAtS(j.s) + Math.min(j.arm, 36) * 0.85;
    const cx = pose.x + rx * car.lane;
    const cz = pose.z + rz * car.lane;
    const p2x = pose.x + dx * dist + dz * 1.4;
    const p2z = pose.z + dz * dist - dx * 1.4;
    const len = Math.hypot(cx - car.x, cz - car.z) + Math.hypot(p2x - cx, p2z - cz);
    car.turn = { p0x: car.x, p0z: car.z, cx, cz, p2x, p2z, len: Math.max(8, len), u: 0 };
  }

  private updateTurn(car: TrafficCar, dt: number): boolean {
    const t = car.turn as TurnPath;
    car.speed += clamp(4.5 - car.speed, -MAX_BRAKE * dt, MAX_ACCEL * dt);
    car.speed = Math.max(1.5, car.speed);
    t.u = Math.min(1, t.u + (car.speed * dt) / t.len);
    const u = t.u;
    const a = (1 - u) * (1 - u);
    const b = 2 * (1 - u) * u;
    const c = u * u;
    const x = a * t.p0x + b * t.cx + c * t.p2x;
    const z = a * t.p0z + b * t.cz + c * t.p2z;
    let hx = 2 * (1 - u) * (t.cx - t.p0x) + 2 * u * (t.p2x - t.cx);
    let hz = 2 * (1 - u) * (t.cz - t.p0z) + 2 * u * (t.p2z - t.cz);
    const l = Math.hypot(hx, hz) || 1;
    hx /= l;
    hz /= l;
    this.placeAt(car, x, z, hx, hz, false);
    return u >= 1;
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
    this.lane = -this.course.road.halfWidthAtS(st.s) * 0.5;
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
