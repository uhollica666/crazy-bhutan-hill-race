import type { HazardDef } from '../data/types';
import { Emitter } from '../core/emitter';
import { clamp, mulberry32 } from '../core/math';
import type { Course } from '../world/Course';
import type { RoadPose } from '../world/Road';

export type HazardPhase = 'dormant' | 'warning' | 'falling' | 'blocked' | 'waiting' | 'crossing' | 'done' | 'static';

export interface Boulder {
  x: number;
  z: number;
  r: number;
  /** Current height above the ground (m): > 0 while still falling. */
  y: number;
  obstacle: number;
}

export interface HerdAnimal {
  x: number;
  z: number;
  heading: number;
  lateral: number;
  /** Seconds before this animal sets off. */
  delay: number;
  obstacle: number;
  across: boolean;
  /** Startled: stands still until the car has slowed down. */
  frozen: boolean;
}

export interface HazardState {
  def: HazardDef;
  phase: HazardPhase;
  /** Distance along the road where it happens (m). */
  s: number;
  side: -1 | 1;
  /** landslide */
  boulders: Boulder[];
  /** creature (yeti) */
  creature: { x: number; z: number; heading: number; lateral: number; pause: number; obstacle: number; shrug: number } | null;
  /** herd: animals crossing the road one after another (never more than HERD_MAX). */
  herd: HerdAnimal[] | null;
  /** brokenTruck */
  truck: { x: number; z: number; heading: number; obstacles: number[] } | null;
  timer: number;
}

type HazardEvents = {
  warn: HazardState;
  land: { hazard: HazardState; boulder: Boulder };
  appear: HazardState;
  cross: HazardState;
  gone: HazardState;
};

/** Metres the gap beside a blockage must keep free, so even the Coaster can always get through. */
export const MIN_FREE_WIDTH = 4.4;
const FALL_SECONDS = 1.6;
const CROSS_SPEED = 1.5;
const HERD_SPEED = 1.15;
export const HERD_MAX = 6;

/**
 * Controlled, seeded road events. Every hazard registers obstacles with the course, never leaves the road
 * impassable, and is removed by `reset()`. Behaviour is deterministic for a given seed and player path.
 */
export class HazardSystem {
  readonly events = new Emitter<HazardEvents>();
  readonly hazards: HazardState[] = [];
  private readonly pose: RoadPose = { x: 0, y: 0, z: 0, tx: 0, tz: -1 };

  constructor(
    private readonly course: Course,
    defs: HazardDef[],
  ) {
    for (const def of defs) {
      const rng = mulberry32(def.seed);
      this.hazards.push({
        def,
        phase: def.kind === 'brokenTruck' ? 'static' : 'dormant',
        s: course.stretchToS(def.at),
        side: rng() < 0.5 ? -1 : 1,
        boulders: [],
        creature: null,
        herd: null,
        truck: null,
        timer: 0,
      });
    }
    this.reset();
  }

  /** Removes every obstacle and returns all hazards to their initial state. */
  reset(): void {
    const ob = this.course.obstacles;
    for (const h of this.hazards) {
      for (const b of h.boulders) ob.remove(b.obstacle);
      h.boulders.length = 0;
      if (h.creature) ob.remove(h.creature.obstacle);
      h.creature = null;
      if (h.herd) h.herd.forEach((a) => ob.remove(a.obstacle));
      h.herd = null;
      if (h.truck) h.truck.obstacles.forEach((id) => ob.remove(id));
      h.truck = null;
      h.timer = 0;
      h.phase = h.def.kind === 'brokenTruck' ? 'static' : 'dormant';
      if (h.def.kind === 'brokenTruck') this.placeTruck(h);
    }
  }

  private frame(s: number, lateral: number): { x: number; z: number; tx: number; tz: number } {
    const p = this.course.road.at(s, this.pose);
    return { x: p.x - p.tz * lateral, z: p.z + p.tx * lateral, tx: p.tx, tz: p.tz };
  }

  private placeTruck(h: HazardState): void {
    const road = this.course.road;
    const lane = h.side * road.halfWidthAtS(h.s) * 0.5;
    const ob = this.course.obstacles;
    const ids: number[] = [];
    for (const off of [-2.2, 0, 2.2]) {
      const f = this.frame(h.s + off, lane);
      ids.push(ob.add(f.x, f.z, 1.35, { push: 1, restitution: 0.15, tag: 'truck' }));
    }
    const c = this.frame(h.s, lane);
    h.truck = { x: c.x, z: c.z, heading: Math.atan2(c.tx, c.tz), obstacles: ids };
  }

  /** Fixed-step update. */
  update(dt: number, playerS: number, playerSpeed: number): void {
    const ob = this.course.obstacles;
    const road = this.course.road;
    for (const h of this.hazards) {
      switch (h.def.kind) {
        case 'landslide': {
          if (h.phase === 'dormant' && playerS >= h.s - 135 && playerS <= h.s + 30) {
            h.phase = 'warning';
            this.events.emit('warn', h);
          }
          if (h.phase === 'warning' && playerS >= h.s - 75 && playerS <= h.s + 30) {
            this.layoutLandslide(h, playerS > h.s - 50);
          }
          if (h.phase === 'falling') {
            h.timer += dt;
            const t = clamp(h.timer / FALL_SECONDS, 0, 1);
            let landed = true;
            for (const b of h.boulders) {
              // Each rock lands a little after the previous one.
              const idx = h.boulders.indexOf(b);
              const lt = clamp((h.timer - idx * 0.18) / FALL_SECONDS, 0, 1);
              const wasAir = b.y > 0;
              b.y = (1 - lt * lt) * 14;
              if (b.y <= 0 && wasAir) this.landBoulder(h, b);
              if (b.y > 0) landed = false;
            }
            void t;
            if (landed) h.phase = 'blocked';
          }
          break;
        }
        case 'creature': {
          this.updateCreature(h, dt, playerS, playerSpeed);
          break;
        }
        case 'herd': {
          this.updateHerd(h, dt, playerS, playerSpeed);
          break;
        }
        default:
          break;
      }
    }
    void ob;
    void road;
  }

  private layoutLandslide(h: HazardState, instant: boolean): void {
    const road = this.course.road;
    const rng = mulberry32(h.def.seed + 5);
    const edge = road.wallAtS(h.s) - 0.4;
    const maxCover = Math.max(1.6, road.halfWidthAtS(h.s) * 2 - MIN_FREE_WIDTH);
    let covered = 0;
    let along = -4;
    let i = 0;
    while (covered < maxCover - 0.6 && i < 6) {
      const r = 1.0 + rng() * 0.9;
      const lateralFromEdge = covered + r;
      if (covered + r * 2 > maxCover + 0.3 && i > 1) break;
      const lat = h.side * (edge - lateralFromEdge);
      const f = this.frame(h.s + along, lat);
      h.boulders.push({ x: f.x, z: f.z, r, y: instant ? 0 : 14, obstacle: -1 });
      covered += r * 1.5;
      along += 2.2 + rng() * 2.2;
      i++;
    }
    if (instant) {
      for (const b of h.boulders) this.landBoulder(h, b, true);
      h.phase = 'blocked';
    } else {
      h.phase = 'falling';
      h.timer = 0;
    }
  }

  private landBoulder(h: HazardState, b: Boulder, silent = false): void {
    b.y = 0;
    if (b.obstacle < 0) b.obstacle = this.course.obstacles.add(b.x, b.z, b.r * 0.92, { push: 1, restitution: 0.2, tag: 'boulder' });
    if (!silent) this.events.emit('land', { hazard: h, boulder: b });
  }

  private updateCreature(h: HazardState, dt: number, playerS: number, playerSpeed: number): void {
    const road = this.course.road;
    const ob = this.course.obstacles;
    const side = h.side;
    const far = road.wallAtS(h.s) + 2.6;
    if (h.phase === 'dormant' && playerS >= h.s - 120 && playerS <= h.s + 2) {
      const f = this.frame(h.s, -side * far);
      h.creature = {
        x: f.x,
        z: f.z,
        heading: Math.atan2(side * -f.tz, side * f.tx),
        lateral: -side * far,
        pause: 0,
        obstacle: ob.add(f.x, f.z, 1.1, { push: 0.9, restitution: 0.35, tag: 'creature' }),
        shrug: 0,
      };
      h.phase = 'waiting';
      this.events.emit('appear', h);
    }
    const c = h.creature;
    if (!c) return;
    c.shrug = Math.max(0, c.shrug - dt);

    if (h.phase === 'waiting') {
      // Cross only when the road is clear: the player is stopped, far away, or already past.
      const ahead = h.s - playerS;
      const arrival = ahead / Math.max(playerSpeed, 1);
      const safe = h.def.reactive
        ? ahead < 75
        : ahead < -8 || (playerSpeed < 2.5 && ahead > 14) || (arrival > 6.5 && ahead > 22);
      if (safe) {
        h.phase = 'crossing';
        this.events.emit('cross', h);
      }
    }
    if (h.phase === 'crossing') {
      const target = side * far;
      const lat = c.lateral;
      const centre = Math.abs(lat) < 0.8;
      if (centre && c.pause < 1.6) {
        c.pause += dt; // stops in the middle of the road to wave at the car
      } else {
        const dir = Math.sign(target - lat);
        const ahead2 = h.s - playerS;
        // A reactive creature that sees a fast car close by hurries off the road (still gentle: no panic, no damage to it).
        const hurry = h.def.reactive && ahead2 > -2 && ahead2 < 16 && playerSpeed > 7 ? 2.2 : 1;
        c.lateral = lat + dir * CROSS_SPEED * hurry * dt;
        if ((target - c.lateral) * dir <= 0) {
          c.lateral = target;
          h.phase = 'done';
          this.events.emit('gone', h);
        }
      }
      const f = this.frame(h.s, c.lateral);
      c.x = f.x;
      c.z = f.z;
      const sign = Math.sign(target - c.lateral) || side;
      c.heading = Math.atan2(sign * -f.tz, sign * f.tx);
      ob.move(c.obstacle, c.x, c.z, sign * -f.tz * CROSS_SPEED, sign * f.tx * CROSS_SPEED);
    }
    if (h.phase === 'done' && h.creature) {
      ob.remove(h.creature.obstacle);
      h.creature = null;
    }
  }

  private updateHerd(h: HazardState, dt: number, playerS: number, playerSpeed: number): void {
    const road = this.course.road;
    const ob = this.course.obstacles;
    const side = h.side;
    const far = road.wallAtS(h.s) + 2.4;
    if (h.phase === 'dormant' && playerS >= h.s - 150 && playerS <= h.s + 2) {
      const n = Math.max(2, Math.min(HERD_MAX, h.def.count ?? 4));
      const rng = mulberry32(h.def.seed + 11);
      h.herd = [];
      for (let i = 0; i < n; i++) {
        const along = (i - (n - 1) / 2) * 3.4 + (rng() - 0.5) * 0.8;
        const f = this.frame(h.s + along, -side * (far + rng() * 1.2));
        h.herd.push({
          x: f.x,
          z: f.z,
          heading: Math.atan2(side * -f.tz, side * f.tx),
          lateral: -side * (far + rng() * 1.2),
          delay: i * 1.5 + rng() * 1.2,
          obstacle: ob.add(f.x, f.z, 1.0, { push: 0.9, restitution: 0.3, tag: 'herd' }),
          across: false,
          frozen: false,
        });
      }
      h.phase = 'waiting';
      h.timer = 0;
      this.events.emit('appear', h);
    }
    const herd = h.herd;
    if (!herd) return;
    if (h.phase === 'waiting') {
      // They set off once the car is close enough to matter: they never wait for a car that is far away.
      if (h.s - playerS < 95) {
        h.phase = 'crossing';
        h.timer = 0;
        this.events.emit('cross', h);
      }
    }
    if (h.phase === 'crossing') {
      h.timer += dt;
      let allAcross = true;
      for (const a of herd) {
        if (a.across) continue;
        allAcross = false;
        const target = side * far;
        if (h.timer < a.delay) continue;
        // Startled by a fast car close by: stand still until it has slowed down.
        const ahead = h.s - playerS;
        a.frozen = Math.abs(a.lateral) < road.halfWidth + 1 && ahead > -4 && ahead < 18 && playerSpeed > 6;
        if (a.frozen) {
          ob.move(a.obstacle, a.x, a.z, 0, 0);
          continue;
        }
        const dir = Math.sign(target - a.lateral);
        a.lateral += dir * HERD_SPEED * dt;
        if ((target - a.lateral) * dir <= 0) {
          a.lateral = target;
          a.across = true;
        }
        const along = this.alongOf(a, h);
        const f = this.frame(h.s + along, a.lateral);
        a.x = f.x;
        a.z = f.z;
        a.heading = Math.atan2(dir * -f.tz, dir * f.tx);
        ob.move(a.obstacle, a.x, a.z, dir * -f.tz * HERD_SPEED, dir * f.tx * HERD_SPEED);
      }
      if (allAcross) {
        herd.forEach((a) => ob.remove(a.obstacle));
        h.phase = 'done';
        this.events.emit('gone', h);
      }
    }
  }

  /** Each animal keeps its own spot along the road while it crosses. */
  private alongOf(a: HerdAnimal, h: HazardState): number {
    const f = this.frame(h.s, 0);
    // Project the animal's last position back onto the road direction through the hazard point.
    return (a.x - f.x) * f.tx + (a.z - f.z) * f.tz;
  }

  /** Puts the named hazards back to their starting state (used when a training lesson is retried). */
  resetIds(ids: string[]): void {
    const ob = this.course.obstacles;
    for (const h of this.hazards) {
      if (!ids.includes(h.def.id)) continue;
      for (const b of h.boulders) ob.remove(b.obstacle);
      h.boulders.length = 0;
      if (h.creature) ob.remove(h.creature.obstacle);
      h.creature = null;
      if (h.herd) h.herd.forEach((a) => ob.remove(a.obstacle));
      h.herd = null;
      if (h.truck) h.truck.obstacles.forEach((id) => ob.remove(id));
      h.truck = null;
      h.timer = 0;
      h.phase = h.def.kind === 'brokenTruck' ? 'static' : 'dormant';
      if (h.def.kind === 'brokenTruck') this.placeTruck(h);
    }
  }

  /** Reports a vehicle contact with an obstacle so the owner can react (the yeti shrugs, etc.). */
  touched(obstacleId: number): HazardState | null {
    for (const h of this.hazards) {
      if (h.creature && h.creature.obstacle === obstacleId) {
        h.creature.shrug = 1.5;
        return h;
      }
      if (h.herd?.some((x) => x.obstacle === obstacleId)) return h;
      if (h.boulders.some((b) => b.obstacle === obstacleId)) return h;
      if (h.truck?.obstacles.includes(obstacleId)) return h;
    }
    return null;
  }

  /** The widest free corridor (m) left between the walls and any active boulder/truck at distance s. */
  freeWidthAt(s: number): number {
    const road = this.course.road;
    const f = this.frame(s, 0);
    const hit = { s: 0, lateral: 0, dist: 0, y: 0, tx: 0, tz: 0, over: 0 };
    void f;
    // Sample lateral positions and find the largest gap between blocked intervals.
    const blocked: [number, number][] = [];
    const ob = this.course.obstacles;
    for (let i = 0; i < ob.capacity; i++) {
      if (!ob.active[i]) continue;
      if (!road.project(ob.xs[i], ob.zs[i], hit as never)) continue;
      if (Math.abs(hit.s - s) > 40) continue;
      blocked.push([hit.lateral - ob.rs[i], hit.lateral + ob.rs[i]]);
    }
    blocked.sort((a, b) => a[0] - b[0]);
    let cursor = -road.wallOffset;
    let best = 0;
    for (const [lo, hi] of blocked) {
      best = Math.max(best, lo - cursor);
      cursor = Math.max(cursor, hi);
    }
    best = Math.max(best, road.wallOffset - cursor);
    return best;
  }
}
