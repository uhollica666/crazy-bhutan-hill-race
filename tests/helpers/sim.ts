import { getVehicle } from '../../src/data/vehicles';
import type { LevelDef } from '../../src/data/types';
import { levelTimes, paceFor } from '../../src/data/levels';
import { AutoDriver } from '../../src/dev/AutoDriver';
import { MotionSampler } from '../../src/gameplay/MotionSampler';
import type { RaceResult } from '../../src/gameplay/RaceSession';
import { RaceSession } from '../../src/gameplay/RaceSession';
import { VehicleBody } from '../../src/physics/VehicleBody';
import { createVehicleInput } from '../../src/physics/types';
import { Course } from '../../src/world/Course';
import { createRoadHit } from '../../src/world/Road';

export const DT = 1 / 120;

export interface SimOptions {
  cornerAccel?: number;
  maxBrake?: number;
  brakeDecel?: number;
  /** Wall-clock cap (s of simulated time). */
  maxSeconds?: number;
}

export interface SimOutcome {
  finished: boolean;
  result: RaceResult | null;
  simTime: number;
  maxLateral: number;
  maxImpact: number;
  overturned: boolean;
  stuck: boolean;
  recoveries: number;
}

const courses = new Map<string, Course>();
export const courseFor = (l: LevelDef): Course => {
  let c = courses.get(l.id);
  if (!c) courses.set(l.id, (c = new Course(l)));
  return c;
};

/**
 * Drives a level with the autopilot through the real RaceSession (countdown, checkpoints, comfort, medals),
 * using the same fixed step, motion sampling and rules as the game.
 */
export function simulate(level: LevelDef, vehicleId: string, opts: SimOptions = {}): SimOutcome {
  const def = getVehicle(vehicleId);
  const course = courseFor(level);
  const body = new VehicleBody(def);
  const p = course.poseAt(course.startS);
  body.place(course, p.x, p.z, p.tx, p.tz);
  const bot = new AutoDriver(course, def, opts.cornerAccel, {
    maxBrake: opts.maxBrake,
    brakeDecel: opts.brakeDecel,
  });
  const session = new RaceSession(
    level,
    { checkpointS: course.checkpointS, finishS: course.finishS, gateHalfWidth: course.road.wallOffset },
    course.startS,
    { vehicleId, times: levelTimes(level, paceFor(level, def)) },
  );
  const motion = new MotionSampler();
  const input = createVehicleInput();
  const hit = createRoadHit();
  let t = 0;
  let still = 0;
  let maxLateral = 0;
  let maxImpact = 0;
  let overturned = false;
  let stuck = false;
  // The full-length routes run up to 25 minutes against their own limit: allow that plus a margin.
  const maxSeconds = opts.maxSeconds ?? Math.max(400, level.timeLimit * 1.3);
  while (t < maxSeconds && session.isActive) {
    if (session.phase === 'countdown') {
      input.steer = input.throttle = input.brake = 0;
    } else {
      bot.update(body, input);
    }
    body.step(DT, input, course);
    t += DT;
    course.road.project(body.position.x, body.position.z, hit);
    maxLateral = Math.max(maxLateral, Math.abs(hit.lateral));
    const impact = body.consumeImpact();
    if (impact > maxImpact) maxImpact = impact;
    if (impact > 2.5) session.feedImpact(impact);
    session.update(DT, hit.s, hit.lateral);
    if (motion.sample(body, DT)) session.feedMotion(DT, motion.lateral, motion.longitudinal, motion.roll);
    still = session.phase === 'running' && body.velocity.length() < 0.5 ? still + DT : 0;
    if (still > 5) {
      stuck = true;
      break;
    }
    if (body.overturnedFor > 1.5) {
      overturned = true;
      break;
    }
  }
  return {
    finished: session.phase === 'finished',
    result: session.result,
    simTime: t,
    maxLateral,
    maxImpact,
    overturned,
    stuck,
    recoveries: session.recoveries,
  };
}
