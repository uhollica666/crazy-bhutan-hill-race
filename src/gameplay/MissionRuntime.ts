import type { ConditionsDef, Drivetrain, LevelDef, ServiceKind, VehicleDef } from '../data/types';
import { SURFACES } from '../data/surfaces';
import { levelTimes, paceFor } from '../data/levels';
import { groundClearance } from '../data/vehicles';
import { Emitter } from '../core/emitter';
import { clamp } from '../core/math';
import { VehicleBody } from '../physics/VehicleBody';
import type { VehicleInput } from '../physics/types';
import type { Course } from '../world/Course';
import { createRoadHit } from '../world/Road';
import { HazardSystem } from './Hazards';
import type { HazardState } from './Hazards';
import { MotionSampler } from './MotionSampler';
import { RaceSession } from './RaceSession';
import type { RaceResult } from './RaceSession';
import { StopManager } from './Stops';
import type { Objective, StopRuntime } from './Stops';
import { Rival, TrafficSystem } from './Traffic';
import { VehicleStatus } from './VehicleStatus';
import type { StatusIssue } from './VehicleStatus';
import { WeatherState } from './Weather';
import { computeReward, evaluateOptional } from './rewards';
import type { OptionalOutcome, Reward, RunFacts } from './rewards';

export interface MissionOptions {
  vehicle: VehicleDef;
  /** Index into level.conditions. */
  conditions?: number;
  traffic?: boolean;
  hazards?: boolean;
  rival?: boolean;
  /** Fraction of the level's traffic to simulate (quality tiers use fewer cars). */
  trafficScale?: number;
  /** Start the clock only after the countdown (default) - tests can skip it. */
  skipCountdown?: boolean;
}

type RuntimeEvents = {
  impact: { speed: number; damage: number };
  checkpoint: { index: number; split: number };
  countdown: number;
  go: undefined;
  boarded: { stop: StopRuntime; party: number; onboard: number };
  missed: StopRuntime;
  serviceStart: { stop: StopRuntime; kind: ServiceKind };
  serviceDone: { stop: StopRuntime; kind: ServiceKind };
  issue: StatusIssue;
  hazard: { type: 'warn' | 'land' | 'appear' | 'cross' | 'gone'; hazard: HazardState };
  touched: HazardState;
  thunder: { flash: number };
  recovered: undefined;
  finish: RaceResult;
  timeout: RaceResult;
};

const FIXED_GRAVITY_NOTE = 0;
void FIXED_GRAVITY_NOTE;

/**
 * Everything that happens in a mission apart from drawing it: the vehicle body, fuel and damage, pickups and
 * pit stops, hazards, traffic, the rival, weather and the race rules. The game and the automated tests step the
 * same object, so tests exercise the real mission path rather than a lookalike.
 */
export class MissionRuntime {
  readonly events = new Emitter<RuntimeEvents>();
  readonly body: VehicleBody;
  readonly status: VehicleStatus;
  readonly stops: StopManager;
  readonly weather = new WeatherState();
  readonly motion = new MotionSampler();
  readonly conditions: ConditionsDef;
  hazards: HazardSystem | null = null;
  traffic: TrafficSystem | null = null;
  rival: Rival | null = null;
  session!: RaceSession;
  /** Last service the player asked for (cleared when it starts or the car drives off). */
  serviceRequest: ServiceKind | null = null;
  /** Road progress for the current step. */
  s = 0;
  lateral = 0;
  /** What the player may do next, for the HUD. */
  lastIssue: StatusIssue | null = null;

  private readonly hit = createRoadHit();
  private readonly clearance: number;
  private rivalFinish: number | null = null;
  private recoverCount = 0;
  private gust = { x: 0, z: 0 };

  constructor(
    readonly course: Course,
    readonly level: LevelDef,
    readonly opts: MissionOptions,
  ) {
    const def = opts.vehicle;
    this.conditions = level.conditions[clamp(opts.conditions ?? 0, 0, level.conditions.length - 1)];
    this.body = new VehicleBody(def);
    this.status = new VehicleStatus(def, level.startFuel);
    this.stops = new StopManager(level, (f) => course.stretchToS(f));
    this.clearance = groundClearance(def);
    if (opts.hazards !== false && level.hazards.length)
      this.hazards = new HazardSystem(course, level.hazards);
    if (opts.traffic !== false && level.traffic) {
      const scaled = {
        ...level.traffic,
        count: Math.max(1, Math.round(level.traffic.count * (opts.trafficScale ?? 1))),
      };
      this.traffic = new TrafficSystem(course, scaled, level.stops, level.hazards);
    }
    if (opts.rival !== false && level.rival) this.rival = new Rival(course, level.rival);
    this.wire();
    this.begin();
  }

  private makeSession(): RaceSession {
    const { course, level, opts } = this;
    const times = levelTimes(level, paceFor(level, opts.vehicle));
    return new RaceSession(
      level,
      { checkpointS: course.checkpointS, finishS: course.finishS, gateHalfWidth: course.road.wallOffset },
      course.startS,
      { vehicleId: opts.vehicle.id, times, finishMode: level.mission.finishMode },
    );
  }

  private wire(): void {
    const e = this.events;
    const st = this.stops.events;
    st.on('boarded', (b) => e.emit('boarded', b));
    st.on('missed', (m) => e.emit('missed', m));
    st.on('service', (m) => e.emit('serviceStart', m));
    st.on('serviceDone', (m) => e.emit('serviceDone', m));
    this.weather.events.on('thunder', (t) => e.emit('thunder', t));
    const h = this.hazards?.events;
    if (h) {
      for (const type of ['warn', 'appear', 'cross', 'gone'] as const)
        h.on(type, (hazard) => e.emit('hazard', { type, hazard }));
      h.on('land', ({ hazard }) => e.emit('hazard', { type: 'land', hazard }));
    }
  }

  private finalise(r: RaceResult): RaceResult {
    r.fuelLeft = this.status.fuel;
    r.health = this.status.health;
    return r;
  }

  /** (Re)start from the grid: car, rules, hazards, traffic, weather. */
  begin(): void {
    const { course, level, opts } = this;
    this.session = this.makeSession();
    const e = this.events;
    this.session.events.on('countdown', (n) => e.emit('countdown', n));
    this.session.events.on('go', () => e.emit('go', undefined));
    this.session.events.on('checkpoint', (c) => e.emit('checkpoint', c));
    this.session.events.on('finish', (r) => e.emit('finish', this.finalise(r)));
    this.session.events.on('timeout', (r) => e.emit('timeout', this.finalise(r)));
    const p = course.poseAt(course.startS);
    this.body.place(course, p.x, p.z, p.tx, p.tz);
    this.body.setDriveMode(opts.vehicle.drivetrain.default);
    this.status.reset(level.startFuel);
    this.lastIssue = null;
    this.stops.reset();
    this.hazards?.reset();
    this.traffic?.reset();
    this.rival?.reset();
    this.weather.set(this.conditions);
    course.wetness = this.weather.wetness;
    this.motion.reset();
    this.serviceRequest = null;
    this.recoverCount = 0;
    this.rivalFinish = null;
    this.s = course.startS;
    this.lateral = 0;
    if (opts.skipCountdown) this.session.countdown = 0.001;
  }

  /** Puts the car back on the road at the last safe point (last checkpoint or start), keeping fuel and damage. */
  recover(): void {
    const s = this.session.recover();
    const p = this.course.poseAt(Math.min(s, this.stops.gateS() - 8));
    this.body.place(this.course, p.x, p.z, p.tx, p.tz);
    this.motion.reset();
    this.recoverCount++;
    this.events.emit('recovered', undefined);
  }

  setDriveMode(mode: Drivetrain): Drivetrain {
    return this.body.setDriveMode(mode);
  }

  toggleDriveMode(): Drivetrain {
    const modes = this.opts.vehicle.drivetrain.modes;
    if (modes.length < 2) return this.body.driveMode;
    return this.body.setDriveMode(this.body.driveMode === '4x4' ? '4x2' : '4x4');
  }

  /** Fixed step. `input` is the player's (or the bot's) driving command. */
  step(dt: number, input: VehicleInput): void {
    if (!this.session.isActive) return;
    const { body, course, status, session, weather } = this;

    weather.update(dt);
    course.wetness = weather.wetness;
    body.mod.grip = weather.gripFactor;
    weather.gust(this.gust);
    body.mod.windX = this.gust.x;
    body.mod.windZ = this.gust.z;

    status.waterDepth = course.ford ? course.waterDepthAt(body.position.x, body.position.z) : 0;
    status.applyTo(body.mod);

    body.step(dt, input, course);

    // Collisions: damage, comfort and feedback.
    const impact = body.consumeImpact();
    if (impact > 2.5) {
      const damage = status.impact(impact);
      session.feedImpact(impact);
      this.events.emit('impact', { speed: impact, damage });
    }
    if (body.obstacleContact) {
      body.obstacleContact = false;
      const id = this.touchedObstacle();
      if (id >= 0) {
        const h = this.hazards?.touched(id);
        if (h) this.events.emit('touched', h);
      }
    }

    // Road progress.
    course.road.project(body.position.x, body.position.z, this.hit);
    this.s = this.hit.s;
    this.lateral = this.hit.lateral;
    const speed = Math.abs(body.speed);

    // Fuel, scraping, wading.
    const wheel = body.wheels.find((w) => w.inContact);
    const surface = wheel ? wheel.surface : SURFACES.asphalt;
    if (session.isActive) {
      const grade = this.gradeAhead();
      status.update(dt, {
        speed,
        throttle: Math.max(input.throttle, 0),
        grade,
        fourByFour: body.driveMode === '4x4',
        surface,
      });
      const scraped = status.scrape(dt, speed, surface, this.clearance);
      if (scraped > 0.0001) void scraped;
    }

    // Stops and services.
    this.stops.update(dt, this.s, this.lateral, speed, status, course.road.halfWidth, this.serviceRequest);
    if (this.stops.active) this.serviceRequest = null;
    else if (speed > 3) this.serviceRequest = null;

    // Race rules see progress only up to the first unfinished required pickup.
    session.update(dt, Math.min(this.s, this.stops.gateS()), this.lateral, speed);
    if (session.phase === 'running' && this.motion.sample(body, dt)) {
      session.feedMotion(dt, this.motion.lateral, this.motion.longitudinal, this.motion.roll);
    } else if (session.phase !== 'running') {
      this.motion.sample(body, dt);
    }
    session.endStatus = { fuel: status.fuel, health: status.health };

    // World events.
    if (session.phase === 'running') {
      this.hazards?.update(dt, this.s, speed);
      this.rival?.update(session.time, dt);
      if (this.rival?.state.finished && this.rivalFinish === null)
        this.rivalFinish = this.rival.def.finishTime;
    }
    this.traffic?.update(dt, { s: this.s, lateral: this.lateral, speed: body.speed });

    // Guards: fell out of the world, overturned for too long.
    const p = body.position;
    if (!Number.isFinite(p.x + p.y + p.z) || p.y < course.terrain.minHeight - 40) this.recover();
    else if (body.overturnedFor > opts_overturn(this.opts.vehicle) && session.phase === 'running')
      this.recover();

    const issue = status.issue;
    if (issue !== this.lastIssue) {
      this.lastIssue = issue;
      if (issue) this.events.emit('issue', issue);
    }
  }

  private touchedObstacle(): number {
    // The body does not expose the id; find the closest active obstacle to the car centre.
    const ob = this.course.obstacles;
    let best = -1;
    let bd = Infinity;
    for (let i = 0; i < ob.capacity; i++) {
      if (!ob.active[i]) continue;
      const d = Math.hypot(ob.xs[i] - this.body.position.x, ob.zs[i] - this.body.position.z) - ob.rs[i];
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return bd < 3.2 ? best : -1;
  }

  private gradeAhead(): number {
    const a = this.course.road.at(this.s, POSE_A);
    const y0 = a.y;
    const b = this.course.road.at(this.s + 8, POSE_B);
    return (b.y - y0) / 8;
  }

  /** The thing the HUD should tell the player to do right now. */
  objective(): Objective {
    const cp = this.session.nextCheckpoint;
    const next =
      cp < this.session.totalCheckpoints
        ? {
            label: `Checkpoint ${cp + 1}/${this.session.totalCheckpoints}: ${this.level.checkpoints[cp].label}`,
            s: this.course.checkpointS[cp],
          }
        : null;
    const o = this.stops.objective(this.s, this.level.finishLabel, this.course.finishS, next);
    if (o.kind === 'finish' && this.level.mission.finishMode === 'stop') o.kind = 'unload';
    return o;
  }

  get recoveries(): number {
    return this.recoverCount;
  }

  /** Facts about the run that rewards and optional objectives need. */
  facts(firstCompletion: boolean): RunFacts {
    return {
      health: this.status.health,
      usedService: this.status.servicesUsed > 0,
      rivalFinishedAt: this.level.rival ? this.level.rival.finishTime : null,
      conditionsBonus: this.conditions.bonus,
      firstCompletion,
    };
  }

  rewardFor(result: RaceResult, firstCompletion: boolean): { reward: Reward; optional: OptionalOutcome[] } {
    const facts = this.facts(firstCompletion);
    const optional = evaluateOptional(this.level, result, facts);
    return { reward: computeReward(this.level, result, optional, facts), optional };
  }

  /** Removes everything this mission registered with the course (obstacles, traffic, hazards). */
  dispose(): void {
    this.hazards?.reset();
    this.traffic?.reset();
    this.rival?.dispose();
    this.course.obstacles.clear();
    this.course.wetness = 0;
  }
}

const POSE_A = { x: 0, y: 0, z: 0, tx: 0, tz: -1 };
const POSE_B = { x: 0, y: 0, z: 0, tx: 0, tz: -1 };

function opts_overturn(v: VehicleDef): number {
  return v.recovery.overturnSeconds;
}
