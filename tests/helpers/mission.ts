import { applyUpgrades } from '../../src/data/upgrades';
import type { UpgradeLevels } from '../../src/data/upgrades';
import type { LevelDef } from '../../src/data/types';
import { getVehicle } from '../../src/data/vehicles';
import { MissionDriver } from '../../src/dev/MissionDriver';
import type { MissionDriverOptions } from '../../src/dev/MissionDriver';
import { MissionRuntime } from '../../src/gameplay/MissionRuntime';
import type { RaceResult } from '../../src/gameplay/RaceSession';
import { createVehicleInput } from '../../src/physics/types';
import { Course } from '../../src/world/Course';

export const DT = 1 / 120;

const courses = new Map<string, Course>();
export const courseFor = (l: LevelDef): Course => {
  let c = courses.get(l.id);
  if (!c) courses.set(l.id, (c = new Course(l)));
  return c;
};

export interface MissionSimOptions extends MissionDriverOptions {
  conditions?: number;
  traffic?: boolean;
  hazards?: boolean;
  rival?: boolean;
  upgrades?: UpgradeLevels;
  maxSeconds?: number;
  /** Inspect every step (return false to stop). */
  onStep?: (rt: MissionRuntime, t: number) => void;
}

export interface MissionSimOutcome {
  finished: boolean;
  result: RaceResult | null;
  simTime: number;
  fuelLeft: number;
  health: number;
  maxLateral: number;
  maxImpact: number;
  impacts: number;
  overturned: boolean;
  stuck: boolean;
  recoveries: number;
  onboard: number;
  servicesUsed: number;
  runtime: MissionRuntime;
}

/** Runs one whole mission with the mission autopilot through the real MissionRuntime. */
export function runMission(level: LevelDef, vehicleId: string, o: MissionSimOptions = {}): MissionSimOutcome {
  const course = courseFor(level);
  const base = getVehicle(vehicleId);
  const def = applyUpgrades(base, o.upgrades ?? {});
  const rt = new MissionRuntime(course, level, {
    vehicle: def,
    conditions: o.conditions ?? 0,
    traffic: o.traffic ?? false,
    hazards: o.hazards ?? true,
    rival: o.rival ?? true,
  });
  const driver = new MissionDriver(rt, o);
  const input = createVehicleInput();
  let t = 0;
  let still = 0;
  let maxLateral = 0;
  let maxImpact = 0;
  let impacts = 0;
  let overturned = false;
  let stuck = false;
  rt.events.on('impact', ({ speed }) => {
    impacts++;
    maxImpact = Math.max(maxImpact, speed);
  });
  const maxSeconds = o.maxSeconds ?? 420;
  while (t < maxSeconds && rt.session.isActive) {
    if (rt.session.phase === 'countdown') {
      input.steer = input.throttle = input.brake = 0;
    } else {
      driver.update(input);
    }
    rt.step(DT, input);
    t += DT;
    maxLateral = Math.max(maxLateral, Math.abs(rt.lateral));
    if (o.onStep) o.onStep(rt, t);
    const moving = rt.body.velocity.length() > 0.5;
    const intentionallyStill = rt.stops.active !== null || rt.stops.gate?.state === 'active' || rt.session.unloadProgress > 0;
    still = rt.session.phase === 'running' && !moving && !intentionallyStill ? still + DT : 0;
    if (still > 8) {
      stuck = true;
      break;
    }
    if (rt.body.overturnedFor > 3) {
      overturned = true;
      break;
    }
  }
  const out: MissionSimOutcome = {
    finished: rt.session.phase === 'finished',
    result: rt.session.result,
    simTime: t,
    fuelLeft: rt.status.fuel,
    health: rt.status.health,
    maxLateral,
    maxImpact,
    impacts,
    overturned,
    stuck,
    recoveries: rt.recoveries,
    onboard: rt.stops.onboard,
    servicesUsed: rt.status.servicesUsed,
    runtime: rt,
  };
  rt.dispose();
  return out;
}
