import { describe, expect, it } from 'vitest';
import { getLevel, levelTimes, listLevels } from '../src/data/levels';
import { getVehicle, listVehicles, vehicleStats } from '../src/data/vehicles';
import { GameFlow } from '../src/app/GameFlow';
import { COUNTDOWN_SECONDS, RaceSession, formatTime, medalFor } from '../src/gameplay/RaceSession';
import { readKeyboard } from '../src/input/keyboardMap';
import { createVehicleInput } from '../src/physics/types';
import { Course } from '../src/world/Course';
import { createRoadHit } from '../src/world/Road';

const level = getLevel('pass-run');
const stations = { checkpointS: [100, 200, 300], finishS: 400, gateHalfWidth: 5 };
const started = (): RaceSession => {
  const s = new RaceSession(level, stations, 30);
  s.update(COUNTDOWN_SECONDS + 0.01, 30, 0);
  expect(s.phase).toBe('running');
  return s;
};

describe('definitions', () => {
  it('has ten levels and four vehicles in campaign order', () => {
    expect(listLevels().map((l) => l.id)).toEqual([
      'pass-run',
      'thimphu-pickup',
      'airport-dash',
      'punakha-valley',
      'dochula-storm',
      'chelela-climb',
      'trongsa-gorge',
      'bumthang-night',
      'remote-expedition',
      'gmc-plains',
    ]);
    expect(listVehicles().map((v) => v.id)).toEqual(['dzo-hatch', 'tourist-coaster', 'druk-ranger', 'dragon-cruiser']);
  });

  it('every level references existing vehicles and has sane medals, comfort thresholds and checkpoints', () => {
    for (const l of listLevels()) {
      expect(l.vehicles.length).toBeGreaterThan(0);
      l.vehicles.forEach((id) => expect(() => getVehicle(id)).not.toThrow());
      expect(l.medals.gold).toBeLessThan(l.medals.silver);
      expect(l.medals.silver).toBeLessThan(l.medals.bronze);
      expect(l.medals.bronze).toBeLessThan(l.timeLimit);
      expect(l.comfortMedals.gold).toBeGreaterThan(l.comfortMedals.silver);
      expect(l.comfortMedals.silver).toBeGreaterThan(l.comfortMedals.bronze);
      const at = l.checkpoints.map((c) => c.at);
      expect([...at].sort((a, b) => a - b)).toEqual(at);
      expect(at.every((f) => f > 0 && f < 1)).toBe(true);
    }
  });

  it('unlock chain opens the campaign in order and the vehicles one tier at a time', () => {
    expect(getLevel('pass-run').unlock).toBeNull();
    expect(getLevel('thimphu-pickup').unlock).toEqual({ levelId: 'pass-run', requirement: 'finish' });
    expect(getLevel('airport-dash').unlock).toEqual({ levelId: 'pass-run', requirement: 'finish' });
    expect(getLevel('chelela-climb').unlock).toEqual({ levelId: 'airport-dash', requirement: 'finish' });
    expect(getLevel('remote-expedition').unlock).toEqual({ levelId: 'chelela-climb', requirement: 'finish' });
    expect(getVehicle('dzo-hatch').unlock).toBeNull();
    expect(getVehicle('dzo-hatch').price).toBe(0);
    expect(getVehicle('tourist-coaster').unlock).toEqual({ levelId: 'pass-run', requirement: 'finish' });
    expect(getVehicle('druk-ranger').unlock).toEqual({ levelId: 'airport-dash', requirement: 'finish' });
    expect(getVehicle('dragon-cruiser').unlock).toEqual({ levelId: 'chelela-climb', requirement: 'finish' });
  });

  it('vehicle definitions are physically consistent', () => {
    for (const v of listVehicles()) {
      expect(v.engine.gearTopSpeeds.at(-1)).toBe(v.engine.topSpeed);
      expect(v.axles.length).toBeGreaterThanOrEqual(2);
      expect(v.suspension.travel).toBeLessThan(v.suspension.rest);
      const sag = (v.mass * v.gravity) / (v.axles.length * 2) / v.suspension.stiffness;
      expect(sag).toBeLessThan(v.suspension.travel);
      // Chassis must clear the ground at rest.
      const lowest = Math.min(...v.axles.map((a) => a.y));
      const rideHeight = -lowest + v.suspension.rest - sag + v.wheelRadius;
      expect(rideHeight - v.size.height / 2).toBeGreaterThan(0.15);
    }
  });

  it('the coach is clearly different from the 4x4 in every rated dimension that matters', () => {
    const suv = getVehicle('druk-ranger');
    const bus = getVehicle('tourist-coaster');
    expect(bus.mass).toBeGreaterThan(suv.mass * 2.5);
    expect(bus.engine.force / bus.mass).toBeLessThan((suv.engine.force / suv.mass) * 0.7);
    expect(bus.engine.brakeForce / bus.mass).toBeLessThan((suv.engine.brakeForce / suv.mass) * 0.8);
    expect(bus.steering.maxAngle).toBeLessThan(suv.steering.maxAngle);
    expect(bus.suspension.antiRoll / bus.mass).toBeLessThan(suv.suspension.antiRoll / suv.mass);
    expect(bus.camera.distance).toBeGreaterThan(suv.camera.distance * 1.3);
    expect(bus.audio.idleHz).toBeLessThan(suv.audio.idleHz);
    const a = vehicleStats(suv);
    const b = vehicleStats(bus);
    expect(a.acceleration).toBeGreaterThan(b.acceleration);
    expect(a.handling).toBeGreaterThan(b.handling);
  });

  it('medal times scale with vehicle pace', () => {
    const t1 = levelTimes(level, 1);
    const t2 = levelTimes(level, 1.28);
    expect(t2.gold).toBeGreaterThan(t1.gold);
    expect(t2.limit).toBeGreaterThan(t1.limit);
    expect(t2.gold / t1.gold).toBeCloseTo(1.28, 1);
  });

  it('unknown ids throw', () => {
    expect(() => getLevel('nope')).toThrow();
    expect(() => getVehicle('nope')).toThrow();
  });
});

describe('level loading', () => {
  for (const l of listLevels()) {
    describe(l.id, () => {
      const course = new Course(l);
      it('builds stations in order inside the road', () => {
        expect(course.startS).toBeLessThan(course.checkpointS[0]);
        expect(course.checkpointS.at(-1)!).toBeLessThan(course.finishS);
        expect(course.finishS).toBeLessThan(course.road.length);
      });
      it('has a road safe to drive: gentle enough radius and grade', () => {
        expect(course.road.minRadius()).toBeGreaterThan(12);
        expect(course.road.maxGrade()).toBeLessThan(0.34);
      });
      it('terrain under the road matches the road surface and walls hold the car on the road', () => {
        const hit = createRoadHit();
        for (let s = 10; s < course.road.length - 10; s += 17) {
          const p = course.poseAt(s);
          course.road.project(p.x, p.z, hit);
          expect(Math.abs(hit.lateral)).toBeLessThan(0.1);
          expect(Math.abs(course.terrain.heightAt(p.x, p.z) - p.y)).toBeLessThan(0.7);
        }
        const p = course.poseAt(course.road.length / 2);
        const out = { depth: 0, nx: 0, nz: 0 };
        const rx = -p.tz;
        const rz = p.tx;
        expect(course.barrier(p.x, p.z, out)).toBe(false);
        const edge = course.road.wallOffset + 0.5;
        expect(course.barrier(p.x + rx * edge, p.z + rz * edge, out)).toBe(true);
        expect(out.depth).toBeCloseTo(0.5, 1);
        expect(out.nx * rx + out.nz * rz).toBeLessThan(-0.9);
      });
    });
  }

  it('the routes are genuinely different shapes', () => {
    const courses = listLevels().map((l) => new Course(l));
    const radii = courses.map((c) => c.road.minRadius());
    const grades = courses.map((c) => c.road.maxGrade());
    expect(Math.max(...grades)).toBeGreaterThan(Math.min(...grades) * 1.5);
    expect(Math.max(...radii)).toBeGreaterThan(Math.min(...radii) * 1.1);
    expect(new Set(courses.map((c) => Math.round(c.road.length / 100))).size).toBeGreaterThanOrEqual(2);
    expect(new Set(listLevels().map((l) => l.road.width)).size).toBeGreaterThanOrEqual(4); // distinct road widths
  });
});

describe('RaceSession', () => {
  it('counts down 3-2-1 then goes, and the clock only runs after GO', () => {
    const s = new RaceSession(level, stations, 30);
    const ticks: number[] = [];
    let go = 0;
    s.events.on('countdown', (n) => ticks.push(n));
    s.events.on('go', () => go++);
    for (let i = 0; i < 100; i++) s.update(0.05, 30, 0);
    expect(ticks).toEqual([3, 2, 1]);
    expect(go).toBe(1);
    expect(s.time).toBeGreaterThan(1.9);
    expect(s.time).toBeLessThan(2.1);
  });

  it('awards checkpoints strictly in order and records splits', () => {
    const s = started();
    s.update(1, 150, 0);
    expect(s.nextCheckpoint).toBe(1);
    s.update(1, 250, 0);
    expect(s.nextCheckpoint).toBe(2);
    expect(s.splits).toHaveLength(2);
    expect(s.splits[1]).toBeGreaterThan(s.splits[0]);
    expect(s.lastSafeS).toBe(200);
  });

  it('ignores gates when outside the road width and cannot finish with missed checkpoints', () => {
    const s = started();
    s.update(1, 120, 9);
    expect(s.nextCheckpoint).toBe(0);
    s.update(1, 420, 0);
    expect(s.phase).toBe('finished');
    expect(s.result?.checkpoints).toBe(3);
    const t = new RaceSession(level, stations, 30);
    t.update(4, 30, 0);
    t.update(1, 50, 0);
    t.update(1, 410, 9);
    expect(t.phase).toBe('running');
  });

  it('finishes with a medal based on time and freezes the timer', () => {
    const s = started();
    s.update(level.medals.gold - 1, 420, 0);
    expect(s.phase).toBe('finished');
    expect(s.result?.medal).toBe('gold');
    expect(s.result?.comfort).toBeNull();
    const t = s.time;
    s.update(5, 420, 0);
    expect(s.time).toBe(t);
  });

  it('times out at the limit', () => {
    const s = started();
    for (let i = 0; i < level.timeLimit + 5; i++) s.update(1, 50, 0);
    expect(s.phase).toBe('failed');
    expect(s.result?.status).toBe('timeout');
    expect(s.result?.medal).toBe('none');
    expect(s.time).toBe(level.timeLimit);
  });

  it('a slower vehicle gets a longer limit and scaled medal times', () => {
    const times = levelTimes(level, 1.28);
    const s = new RaceSession(level, stations, 30, { vehicleId: 'tourist-coaster', times });
    s.update(COUNTDOWN_SECONDS + 0.01, 30, 0);
    for (let i = 0; i < level.timeLimit + 5; i++) s.update(1, 50, 0);
    expect(s.phase).toBe('running');
    expect(s.timeLeft).toBeGreaterThan(0);
  });

  it('recovery returns the last checkpoint and is counted', () => {
    const s = started();
    expect(s.recover()).toBe(30);
    s.update(1, 150, 0);
    expect(s.recover()).toBe(100);
    expect(s.recoveries).toBe(2);
  });

  it('medal thresholds and time formatting', () => {
    expect(medalFor(level, level.medals.silver)).toBe('silver');
    expect(medalFor(level, level.medals.bronze + 1)).toBe('none');
    expect(formatTime(75.456)).toBe('1:15.45');
    expect(formatTime(-3)).toBe('0:00.00');
  });
});

describe('GameFlow', () => {
  it('follows the allowed transitions and rejects invalid ones', () => {
    const f = new GameFlow();
    const seen: string[] = [];
    f.events.on('change', (c) => seen.push(`${c.from}>${c.to}`));
    expect(f.dispatch('pause')).toBe(false);
    expect(f.dispatch('resume')).toBe(false);
    expect(f.dispatch('start')).toBe(true);
    expect(f.dispatch('pause')).toBe(true);
    expect(f.dispatch('finish')).toBe(false);
    expect(f.dispatch('resume')).toBe(true);
    expect(f.dispatch('restart')).toBe(true);
    expect(f.dispatch('finish')).toBe(true);
    expect(f.dispatch('pause')).toBe(false);
    expect(f.dispatch('restart')).toBe(true);
    expect(f.dispatch('pause')).toBe(true);
    expect(f.dispatch('quit')).toBe(true);
    expect(f.state).toBe('menu');
    expect(seen).toEqual([
      'menu>playing',
      'playing>paused',
      'paused>playing',
      'playing>playing',
      'playing>finished',
      'finished>playing',
      'playing>paused',
      'paused>menu',
    ]);
  });
});

describe('keyboard mapping', () => {
  const read = (...keys: string[]) => {
    const o = createVehicleInput();
    readKeyboard(new Set(keys), o);
    return o;
  };
  it('maps WASD and arrows, and opposing keys cancel', () => {
    expect(read('KeyW')).toEqual({ steer: 0, throttle: 1, brake: 0 });
    expect(read('ArrowDown', 'ArrowLeft')).toEqual({ steer: -1, throttle: 0, brake: 1 });
    expect(read('KeyD')).toMatchObject({ steer: 1 });
    expect(read('KeyA', 'ArrowRight').steer).toBe(0);
    expect(read('KeyQ')).toEqual({ steer: 0, throttle: 0, brake: 0 });
  });
});
