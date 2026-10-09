import { describe, expect, it } from 'vitest';
import { Scene } from 'three';
import { getLevel, listLevels } from '../src/data/levels';
import { getVehicle } from '../src/data/vehicles';
import { applyUpgrades, nextUpgradeCost } from '../src/data/upgrades';
import { SURFACES } from '../src/data/surfaces';
import { HazardSystem, MIN_FREE_WIDTH } from '../src/gameplay/Hazards';
import { TrafficSystem, MIN_SPAWN_DISTANCE } from '../src/gameplay/Traffic';
import { WeatherState } from '../src/gameplay/Weather';
import { VehicleStatus } from '../src/gameplay/VehicleStatus';
import { StopManager, BOARD_SECONDS } from '../src/gameplay/Stops';
import { MissionRuntime } from '../src/gameplay/MissionRuntime';
import { computeReward, evaluateOptional } from '../src/gameplay/rewards';
import { RaceSession } from '../src/gameplay/RaceSession';
import { Environment } from '../src/render/Environment';
import { Course } from '../src/world/Course';
import { createVehicleInput } from '../src/physics/types';

const pass = getLevel('pass-run');
const ranger = getVehicle('druk-ranger');
const activeObstacles = (c: Course) => c.obstacles.active.reduce((a, b) => a + b, 0);

describe('fuel, condition and services', () => {
  it('required tourists cannot board out of route order', () => {
    const st = new StopManager(getLevel('thimphu-pickup'), (f) => f * 1000);
    const status = new VehicleStatus(ranger);
    const pickups = st.stops.filter((x) => x.def.kind === 'pickup' && !x.def.optional);
    expect(pickups.length).toBeGreaterThan(1);
    const last = pickups[pickups.length - 1];
    st.update(5, last.s, 0, 0, status, 5, null);
    expect(st.onboard).toBe(0);
    expect(last.state).toBe('pending');
    for (const pickup of pickups) {
      expect(st.gate).toBe(pickup);
      st.update(5, pickup.s, 0, 0, status, 5, null);
      expect(pickup.state).toBe('done');
    }
    expect(st.requiredDone).toBe(true);
    expect(st.onboard).toBe(st.party);
  });
  it('fuel consumption is independent of step frequency and stops at zero', () => {
    const burn = (hz: number) => {
      const s = new VehicleStatus(ranger);
      for (let i = 0; i < hz * 60; i++)
        s.update(1 / hz, { speed: 15, throttle: 0.7, grade: 0.15, fourByFour: true, surface: SURFACES.mud });
      return s;
    };
    expect(burn(30).fuel).toBeCloseTo(burn(240).fuel, 8);
    const s = burn(30);
    s.update(1e6, { speed: 15, throttle: 1, grade: 1, fourByFour: true, surface: SURFACES.mud });
    expect(s.fuel).toBe(0);
    expect(s.power).toBe(0.12); // documented recovery-friendly limp mode
  });
  it('4x4, mud and uphill consume more fuel; armour reduces actual damage', () => {
    const a = new VehicleStatus(ranger),
      b = new VehicleStatus(ranger);
    a.update(10, { speed: 15, throttle: 1, grade: 0, fourByFour: false, surface: SURFACES.asphalt });
    b.update(10, { speed: 15, throttle: 1, grade: 0.2, fourByFour: true, surface: SURFACES.mud });
    expect(b.fuel).toBeLessThan(a.fuel);
    const armored = new VehicleStatus(applyUpgrades(ranger, { armor: 3 }));
    expect(armored.impact(10)).toBeLessThan(a.impact(10));
    expect(a.impact(2)).toBe(0);
  });
  it('boarding requires stopping, mandatory stops gate the route, passengers board only once', () => {
    const st = new StopManager(pass, (f) => f * 1000);
    const s = new VehicleStatus(ranger);
    const gate = st.gate!;
    st.update(5, gate.s, 0, 10, s, 5, null);
    expect(st.onboard).toBe(0);
    expect(st.gateS()).toBeLessThan(Infinity);
    st.update(BOARD_SECONDS + 0.1, gate.s, 0, 0, s, 5, null);
    expect(st.requiredDone).toBe(true);
    const party = st.onboard;
    st.update(10, gate.s, 0, 0, s, 5, null);
    expect(st.onboard).toBe(party);
    st.reset();
    expect(st.onboard).toBe(0);
    expect(st.requiredDone).toBe(false);
  });
  it('service requires a stationary car in the zone, cancels on exit and cannot count a full tank twice', () => {
    const st = new StopManager(getLevel('airport-dash'), (f) => f * 1000);
    const pump = st.stops.find((x) => x.def.kind === 'service')!;
    const s = new VehicleStatus(ranger, 0.1);
    for (const [pos, lateral, speed] of [
      [pump.s + 20, 0, 0],
      [pump.s, 20, 0],
      [pump.s, 0, 3],
    ]) {
      st.update(1, pos, lateral, speed, s, 5, 'refuel');
      expect(s.fuel).toBe(0.1);
    }
    st.update(1, pump.s, 0, 0, s, 5, 'refuel');
    expect(s.fuel).toBeGreaterThan(0.1);
    st.update(1, pump.s + 30, 0, 0, s, 5, null);
    expect(st.active).toBeNull();
    st.update(10, pump.s, 0, 0, s, 5, 'refuel');
    expect(s.fuel).toBe(1);
    expect(s.servicesUsed).toBe(1);
    st.update(10, pump.s, 0, 0, s, 5, 'refuel');
    expect(s.servicesUsed).toBe(1);
    s.health = 20;
    st.update(10, pump.s, 0, 0, s, 5, 'repair');
    expect(s.health).toBe(100);
    expect(s.servicesUsed).toBe(2);
  });
});

describe('weather and rendering lifecycle', () => {
  it('wetness/rain transitions converge independently of frame rate and drying is slower', () => {
    const evolve = (hz: number) => {
      const w = new WeatherState(8);
      w.set({ weather: 'clear', time: 'night' });
      w.transitionTo('heavyRain');
      for (let i = 0; i < hz * 10; i++) w.update(1 / hz);
      return w;
    };
    const w = evolve(30);
    expect(w.wetness).toBeCloseTo(evolve(240).wetness, 10);
    expect(w.rain).toBeCloseTo(evolve(240).rain, 10);
    expect(w.gripFactor).toBeLessThan(1);
    const wet = w.wetness;
    w.transitionTo('clear');
    w.update(10);
    expect(w.wetness).toBeGreaterThan(wet * 0.5);
  });
  it('seeded thunder is reproducible and gusts are finite', () => {
    const run = () => {
      const w = new WeatherState(12),
        flashes: number[] = [];
      w.set({ weather: 'heavyRain', time: 'dusk' });
      w.events.on('thunder', (t) => flashes.push(t.flash));
      for (let i = 0; i < 600; i++) w.update(0.1);
      const gust = { x: 0, z: 0 };
      w.gust(gust);
      expect(Number.isFinite(gust.x + gust.z)).toBe(true);
      return flashes;
    };
    expect(run().length).toBeGreaterThan(0);
    expect(run()).toEqual(run());
  });
  it('lightning restores night ambient light and disposing removes scene resources', () => {
    const scene = new Scene(),
      env = new Environment(scene, new Course(pass));
    env.setConditions('heavyRain', 'night');
    const ambient = env.hemi.intensity;
    env.setFlash(0.8);
    expect(env.hemi.intensity).toBeGreaterThan(ambient);
    env.setFlash(0);
    expect(env.hemi.intensity).toBeCloseTo(ambient);
    expect(env.lightsOn).toBe(true);
    env.dispose();
    expect(scene.children).toHaveLength(0);
  });
});

describe('hazards and traffic lifecycle', () => {
  it('rockfall warns before landing, leaves a corridor and reset cleans collisions', () => {
    const c = new Course(getLevel('remote-expedition'));
    const h = new HazardSystem(
      c,
      c.level.hazards.filter((x) => x.kind === 'landslide'),
    );
    const events: string[] = [];
    h.events.on('warn', () => events.push('warn'));
    h.events.on('land', () => events.push('land'));
    const s = h.hazards[0].s;
    h.update(0.1, s - 130, 15);
    expect(events).toEqual(['warn']);
    h.update(0.1, s - 70, 15);
    expect(activeObstacles(c)).toBe(0);
    for (let i = 0; i < 30; i++) h.update(0.1, s - 70, 15);
    expect(events[1]).toBe('land');
    expect(activeObstacles(c)).toBeGreaterThan(0);
    expect(h.freeWidthAt(s)).toBeGreaterThanOrEqual(MIN_FREE_WIDTH - 0.3);
    const layout = h.hazards[0].boulders.map((b) => [b.x, b.z, b.r]);
    h.reset();
    expect(activeObstacles(c)).toBe(0);
    h.update(0.1, s - 40, 15);
    expect(h.hazards[0].boulders.map((b) => [b.x, b.z, b.r])).toEqual(layout);
  });
  it('traffic remains bounded, brakes behind the player and resets reproducibly', () => {
    const c = new Course(getLevel('thimphu-pickup'));
    const t = new TrafficSystem(c, c.level.traffic!, c.level.stops, c.level.hazards);
    const layout = t.cars.map((x) => [x.s, x.cruise, x.dir]);
    expect(t.count).toBeGreaterThan(0);
    expect(t.cars.every((x) => x.s - c.startS >= MIN_SPAWN_DISTANCE)).toBe(true);
    const car = t.cars[0],
      speed = car.speed;
    t.update(0.1, { s: car.s + car.dir * 8, lateral: car.lane, speed: 0 });
    expect(car.speed).toBeLessThan(speed);
    for (let i = 0; i < 300; i++) t.update(0.1, { s: c.startS, lateral: 0, speed: 0 });
    expect(t.count).toBeLessThanOrEqual(c.level.traffic!.count);
    expect(activeObstacles(c)).toBe(t.count * 2);
    t.reset();
    expect(t.cars.map((x) => [x.s, x.cruise, x.dir])).toEqual(layout);
  });
});

describe('upgrades, rewards and mission guards', () => {
  it.each(['finished', 'failed'] as const)('ending a mission freezes physics and services: %s', (phase) => {
    const c = new Course(pass),
      rt = new MissionRuntime(c, pass, { vehicle: ranger });
    rt.session.phase = phase;
    const position = rt.body.position.toArray();
    const fuel = rt.status.fuel;
    const input = createVehicleInput();
    input.throttle = 1;
    input.brake = 1;
    for (let i = 0; i < 600; i++) rt.step(1 / 120, input);
    expect(rt.body.position.toArray()).toEqual(position);
    expect(rt.status.fuel).toBe(fuel);
    expect(rt.stops.onboard).toBe(0);
    expect(rt.session.time).toBe(0);
    rt.dispose();
  });
  it('upgrades affect physics, fuel and condition without mutating the base vehicle', () => {
    const v = applyUpgrades(ranger, {
      engine: 3,
      brakes: 2,
      tires: 3,
      tank: 2,
      efficiency: 3,
      suspension: 1,
    });
    expect(v.engine.force).toBeGreaterThan(ranger.engine.force);
    expect(v.engine.brakeForce).toBeGreaterThan(ranger.engine.brakeForce);
    expect(v.grip.lateral).toBeGreaterThan(ranger.grip.lateral);
    expect(v.fuel.rangeKm).toBeGreaterThan(ranger.fuel.rangeKm);
    expect(v.suspension.damping).toBeGreaterThan(ranger.suspension.damping);
    expect(nextUpgradeCost(ranger, { engine: 3 }, 'engine')).toBeNull();
    expect(applyUpgrades(ranger, {}).engine.force).toBe(ranger.engine.force);
  });
  it('failed missions receive only consolation; first completion bonus cannot recur', () => {
    const session = new RaceSession(pass, { checkpointS: [], finishS: 10, gateHalfWidth: 5 }, 0);
    session.update(4, 0, 0);
    session.update(10, 20, 0);
    const r = session.result!;
    const facts = {
      health: 100,
      usedService: false,
      rivalFinishedAt: null,
      conditionsBonus: 1,
      firstCompletion: true,
    };
    const optional = evaluateOptional(pass, r, facts);
    const first = computeReward(pass, r, optional, facts);
    const repeat = computeReward(pass, r, optional, { ...facts, firstCompletion: false });
    expect(first.total - repeat.total).toBe(Math.round(pass.reward * 0.4));
    expect(first.total).toBe(first.lines.reduce((sum, x) => sum + x.amount, 0));
    const fail = computeReward(pass, { ...r, status: 'timeout' }, optional, facts);
    expect(fail.total).toBe(Math.round(pass.reward * 0.08));
    expect(fail.lines).toHaveLength(1);
  });
  it('restart resets the complete runtime and recovery stays before the first unfinished pickup', () => {
    const c = new Course(pass),
      rt = new MissionRuntime(c, pass, { vehicle: ranger });
    rt.status.fuel = 0;
    rt.status.health = 5;
    rt.status.servicesUsed = 2;
    rt.session.time = 80;
    rt.session.phase = 'failed';
    rt.lastIssue = 'outOfFuel';
    rt.begin();
    expect(rt.session.time).toBe(0);
    expect(rt.session.phase).toBe('countdown');
    expect(rt.status.servicesUsed).toBe(0);
    expect(rt.status.fuel).toBe(pass.startFuel);
    expect(rt.status.health).toBe(100);
    expect(rt.lastIssue).toBeNull();
    rt.recover();
    rt.step(1 / 120, createVehicleInput());
    expect(rt.s).toBeLessThan(rt.stops.gateS());
    rt.dispose();
    expect(activeObstacles(c)).toBe(0);
  });
  it('all levels block success when required tourists have not boarded', () => {
    for (const level of listLevels()) {
      const c = new Course(level),
        rt = new MissionRuntime(c, level, { vehicle: getVehicle(level.vehicles[0]), traffic: false });
      const pose = c.poseAt(c.finishS);
      rt.body.place(c, pose.x, pose.z, pose.tx, pose.tz);
      for (let i = 0; i < 600; i++) rt.step(1 / 120, createVehicleInput());
      expect(rt.session.phase, level.id).not.toBe('finished');
      expect(rt.stops.requiredDone).toBe(false);
      rt.dispose();
    }
  });
});
