import { describe, expect, it } from 'vitest';
import { getLevel, listLevels } from '../src/data/levels';
import { getVehicle, listVehicles } from '../src/data/vehicles';
import { GameFlow } from '../src/app/GameFlow';
import { COUNTDOWN_SECONDS, RaceSession, formatTime, medalFor } from '../src/gameplay/RaceSession';
import { readKeyboard } from '../src/input/keyboardMap';
import { createVehicleInput } from '../src/physics/types';
import { SaveStore, defaultSettings, parseProgress, parseSettings } from '../src/storage/SaveStore';
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
  it('every level references an existing vehicle and has sane medals/checkpoints', () => {
    for (const l of listLevels()) {
      expect(() => getVehicle(l.vehicleId)).not.toThrow();
      expect(l.medals.gold).toBeLessThan(l.medals.silver);
      expect(l.medals.silver).toBeLessThan(l.medals.bronze);
      expect(l.medals.bronze).toBeLessThan(l.timeLimit);
      const at = l.checkpoints.map((c) => c.at);
      expect([...at].sort((a, b) => a - b)).toEqual(at);
    }
  });
  it('vehicle definitions are physically consistent', () => {
    for (const v of listVehicles()) {
      expect(v.engine.gearTopSpeeds.at(-1)).toBe(v.engine.topSpeed);
      expect(v.axles.length).toBeGreaterThanOrEqual(2);
      expect(v.suspension.travel).toBeLessThan(v.suspension.rest);
      // Static sag must fit inside the suspension travel.
      const sag = (v.mass * v.gravity) / (v.axles.length * 2) / v.suspension.stiffness;
      expect(sag).toBeLessThan(v.suspension.travel);
    }
  });
  it('unknown ids throw', () => {
    expect(() => getLevel('nope')).toThrow();
    expect(() => getVehicle('nope')).toThrow();
  });
});

describe('level loading', () => {
  const course = new Course(level);
  it('builds stations in order inside the road', () => {
    expect(course.startS).toBeLessThan(course.checkpointS[0]);
    expect(course.checkpointS.at(-1)!).toBeLessThan(course.finishS);
    expect(course.finishS).toBeLessThan(course.road.length);
  });
  it('terrain under the road matches the road surface and walls hold the car on the road', () => {
    const hit = createRoadHit();
    for (let s = 10; s < course.road.length - 10; s += 17) {
      const p = course.poseAt(s);
      course.road.project(p.x, p.z, hit);
      expect(Math.abs(hit.lateral)).toBeLessThan(0.1);
      expect(Math.abs(course.terrain.heightAt(p.x, p.z) - p.y)).toBeLessThan(0.6);
    }
    const p = course.poseAt(300);
    const out = { depth: 0, nx: 0, nz: 0 };
    const rx = -p.tz;
    const rz = p.tx;
    expect(course.barrier(p.x, p.z, out)).toBe(false);
    const edge = course.road.wallOffset + 0.5;
    expect(course.barrier(p.x + rx * edge, p.z + rz * edge, out)).toBe(true);
    expect(out.depth).toBeCloseTo(0.5, 1);
    expect(out.nx * rx + out.nz * rz).toBeLessThan(-0.9); // pushes back toward the road
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
    expect(s.time).toBeGreaterThan(1.9); // 5 s elapsed - 3 s countdown
    expect(s.time).toBeLessThan(2.1);
  });

  it('awards checkpoints strictly in order and records splits', () => {
    const s = started();
    s.update(1, 150, 0); // passed #1 only (skipping ahead cannot take #3 first)
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
    s.update(1, 420, 0); // jumped beyond every gate: all three are credited, then the finish
    expect(s.phase).toBe('finished');
    expect(s.result?.checkpoints).toBe(3);
    const t = new RaceSession(level, stations, 30);
    t.update(4, 30, 0);
    t.update(1, 50, 0);
    t.update(1, 410, 9); // finish line beyond the wall width does not count
    expect(t.phase).toBe('running');
  });

  it('finishes with a medal based on time and freezes the timer', () => {
    const s = started();
    s.update(level.medals.gold - 1, 420, 0);
    expect(s.phase).toBe('finished');
    expect(s.result?.medal).toBe('gold');
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
    expect(f.dispatch('finish')).toBe(false); // cannot finish while paused
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

describe('SaveStore', () => {
  const fake = () => {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      m,
    };
  };
  it('persists settings and progress across instances, clamping bad values', () => {
    const storage = fake();
    const a = new SaveStore(storage, 'high');
    expect(a.settings.quality).toBe('high');
    a.updateSettings({ masterVolume: 0.3, quality: 'low', muted: true });
    a.updateSettings({ sfxVolume: 7 });
    expect(a.recordCompletion('pass-run', 90, 'silver')).toEqual({ newBest: true, newMedal: true });
    expect(a.recordCompletion('pass-run', 95, 'bronze')).toEqual({ newBest: false, newMedal: false });
    expect(a.recordCompletion('pass-run', 80, 'gold')).toEqual({ newBest: true, newMedal: true });
    const b = new SaveStore(storage);
    expect(b.settings).toMatchObject({ masterVolume: 0.3, quality: 'low', muted: true, sfxVolume: 1 });
    expect(b.levelProgress('pass-run')).toEqual({ bestTime: 80, medal: 'gold', completions: 3 });
  });
  it('survives corrupt data and unavailable storage', () => {
    const storage = fake();
    storage.setItem('cbhr.v1.settings', '{not json');
    storage.setItem(
      'cbhr.v1.progress',
      JSON.stringify({ levels: { x: { bestTime: -5, medal: 'platinum' } } }),
    );
    const s = new SaveStore(storage, 'medium');
    expect(s.settings).toEqual(defaultSettings('medium'));
    expect(s.levelProgress('x')).toEqual({ bestTime: null, medal: 'none', completions: 0 });
    const broken = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    const t = new SaveStore(broken);
    t.updateSettings({ muted: true });
    expect(t.settings.muted).toBe(true);
    expect(parseSettings({ quality: 'ultra', masterVolume: 'x' }, defaultSettings()).quality).toBe('medium');
    expect(parseProgress(null)).toEqual({ levels: {} });
  });
});
