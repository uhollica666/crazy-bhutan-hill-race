import { describe, expect, it } from 'vitest';
import { getLevel, levelTimes } from '../src/data/levels';
import { ComfortMeter } from '../src/gameplay/Comfort';
import { COUNTDOWN_SECONDS, RaceSession } from '../src/gameplay/RaceSession';
import { finalMedal, medalFromComfort, medalFromTime, runScore, worseMedal } from '../src/gameplay/scoring';

const airport = getLevel('airport-dash');
// A time-only fixture: Pass Run without its comfort meter (every shipped mission now has one).
const passRun = getLevel('pass-run');
const pass = { ...passRun, mission: { ...passRun.mission, comfort: false } };

/** Runs a constant acceleration profile for `seconds` at a given step size. */
function drive(m: ComfortMeter, seconds: number, lat: number, long: number, dt: number): void {
  for (let i = 0; i < Math.round(seconds / dt); i++) m.update(dt, lat, long);
}

describe('ComfortMeter', () => {
  it('ordinary driving costs nothing', () => {
    const m = new ComfortMeter();
    drive(m, 30, 2.5, 1.5, 1 / 120);
    expect(m.value).toBe(100);
    expect(m.cause).toBeNull();
    expect(m.quality).toBe('smooth');
  });

  it('tiny steering corrections and bumpy noise are filtered out', () => {
    const m = new ComfortMeter();
    for (let i = 0; i < 120 * 20; i++) m.update(1 / 120, i % 2 ? 7 : -7, i % 3 ? 6 : -6); // jitter averaging to ~0
    expect(m.value).toBeGreaterThan(99);
  });

  it('sustained hard cornering drains comfort and names the cause', () => {
    const m = new ComfortMeter();
    drive(m, 4, 8, 0, 1 / 120);
    expect(m.value).toBeLessThan(80);
    expect(m.cause).toBe('corner');
  });

  it('hard braking and jerky launches drain comfort, braking more than accelerating', () => {
    const a = new ComfortMeter();
    drive(a, 3, 0, -9, 1 / 120);
    expect(a.cause).toBe('brake');
    const b = new ComfortMeter();
    drive(b, 3, 0, 9, 1 / 120);
    expect(b.cause).toBe('accel');
    expect(a.value).toBeLessThan(b.value);
  });

  it('recovers slowly once things calm down, and never exceeds 100 or drops below 0', () => {
    const m = new ComfortMeter();
    drive(m, 3, 8, 0, 1 / 120);
    const low = m.value;
    drive(m, 5, 1, 0, 1 / 120);
    expect(m.value).toBeGreaterThan(low);
    expect(m.value).toBeLessThan(100);
    drive(m, 60, 12, -12, 1 / 120);
    expect(m.value).toBe(0);
    drive(m, 120, 0, 0, 1 / 120);
    expect(m.value).toBe(100);
  });

  it('is frame-rate independent: the same drive at 30, 60, 120 and 240 Hz gives the same comfort', () => {
    const results = [30, 60, 120, 240].map((hz) => {
      const m = new ComfortMeter();
      drive(m, 3, 6.5, 0, 1 / hz);
      drive(m, 2, 0, -7, 1 / hz);
      drive(m, 4, 1, 0, 1 / hz);
      return m.value;
    });
    for (const r of results) expect(Math.abs(r - results[0])).toBeLessThan(0.6);
    expect(results[0]).toBeLessThan(100);
  });

  it('collisions cost a flat amount that grows with speed; light taps are free', () => {
    const m = new ComfortMeter();
    m.impact(1.5);
    expect(m.value).toBe(100);
    m.impact(5);
    const afterSmall = m.value;
    expect(afterSmall).toBeLessThan(100);
    m.impact(15);
    expect(afterSmall - m.value).toBeGreaterThan(afterSmall > 90 ? 5 : 1);
    expect(m.cause).toBe('bump');
  });
});

describe('scoring', () => {
  const times = levelTimes(airport, 1);
  it('time medals follow the thresholds', () => {
    expect(medalFromTime(times, times.gold)).toBe('gold');
    expect(medalFromTime(times, times.silver)).toBe('silver');
    expect(medalFromTime(times, times.bronze)).toBe('bronze');
    expect(medalFromTime(times, times.bronze + 1)).toBe('none');
  });

  it('comfort medals follow the level thresholds', () => {
    expect(medalFromComfort(airport.comfortMedals, 95)).toBe('gold');
    expect(medalFromComfort(airport.comfortMedals, 72)).toBe('silver');
    expect(medalFromComfort(airport.comfortMedals, 55)).toBe('bronze');
    expect(medalFromComfort(airport.comfortMedals, 20)).toBe('none');
  });

  it('comfort missions award the WORSE of time and comfort; pure time missions ignore comfort', () => {
    expect(finalMedal(airport, times, times.gold, 95)).toBe('gold');
    expect(finalMedal(airport, times, times.gold, 72)).toBe('silver'); // fast but bumpy
    expect(finalMedal(airport, times, times.silver, 99)).toBe('silver'); // smooth but slower
    expect(finalMedal(airport, times, times.gold, 10)).toBe('none');
    expect(finalMedal(pass, levelTimes(pass, 1), pass.medals.gold, 0)).toBe('gold');
    expect(worseMedal('gold', 'bronze')).toBe('bronze');
  });

  it('score: 100 at gold time or better, 0 at the limit; comfort weighs 40% on comfort missions', () => {
    expect(runScore({ times, time: times.gold - 5, comfort: null })).toBe(100);
    expect(runScore({ times, time: times.limit, comfort: null })).toBe(0);
    expect(runScore({ times, time: times.gold, comfort: 100 })).toBe(100);
    expect(runScore({ times, time: times.gold, comfort: 50 })).toBe(80);
    expect(runScore({ times, time: times.limit, comfort: 100 })).toBe(40);
    const mid = runScore({ times, time: (times.gold + times.limit) / 2, comfort: null });
    expect(mid).toBeGreaterThan(40);
    expect(mid).toBeLessThan(60);
  });
});

describe('RaceSession comfort integration', () => {
  const stations = { checkpointS: [100], finishS: 200, gateHalfWidth: 6 };
  const make = () => {
    const s = new RaceSession(airport, stations, 30, {
      vehicleId: 'tourist-coaster',
      times: levelTimes(airport, 1.28),
    });
    s.update(COUNTDOWN_SECONDS + 0.01, 30, 0);
    return s;
  };

  it('only airport-style missions have a meter', () => {
    expect(make().comfort).not.toBeNull();
    expect(new RaceSession(pass, stations, 30).comfort).toBeNull();
  });

  it('ignores motion before GO and averages comfort over the run', () => {
    const s = new RaceSession(airport, stations, 30);
    s.feedMotion(1, 12, 0); // countdown: ignored
    expect(s.comfort?.value).toBe(100);
    s.update(COUNTDOWN_SECONDS + 0.01, 30, 0);
    for (let i = 0; i < 4 * 120; i++) {
      s.feedMotion(1 / 120, 9, 0);
      s.update(1 / 120, 40, 0);
    }
    const low = s.comfort!.value;
    expect(low).toBeLessThan(75);
    for (let i = 0; i < 20 * 120; i++) {
      s.feedMotion(1 / 120, 0, 0);
      s.update(1 / 120, 60, 0);
    }
    s.update(1, 250, 0);
    expect(s.phase).toBe('finished');
    const r = s.result!;
    expect(r.comfort).toBeLessThan(100);
    expect(r.comfort).toBeGreaterThan(low);
    expect(r.comfortLow).toBeLessThanOrEqual(Math.round(low) + 1);
    expect(r.comfortMedal).not.toBeNull();
    expect(r.vehicleId).toBe('tourist-coaster');
    expect(r.score).toBeGreaterThan(0);
  });

  it('recovery is not a free comfort reset', () => {
    const s = make();
    s.feedImpact(10);
    const afterHit = s.comfort!.value;
    s.recover();
    expect(s.comfort!.value).toBeLessThan(afterHit);
  });

  it('a timeout is a failed mission with no medal and no score', () => {
    const s = make();
    for (let i = 0; i < airport.timeLimit * 1.28 + 5; i++) s.update(1, 40, 0);
    expect(s.phase).toBe('failed');
    expect(s.result).toMatchObject({ status: 'timeout', medal: 'none', score: 0 });
  });
});
