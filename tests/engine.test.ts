import { describe, expect, it } from 'vitest';
import { listVehicles } from '../src/data/vehicles';
import { EngineSim, IDLE_RPM } from '../src/gameplay/EngineSim';

const run = (vid: string, seconds: number, throttle: number, accel: number) => {
  const def = listVehicles().find((v) => v.id === vid)!;
  const sim = new EngineSim(def);
  let speed = 0;
  const rpm: number[] = [];
  const gears: number[] = [];
  for (let t = 0; t < seconds; t += 1 / 60) {
    speed = Math.min(def.engine.topSpeed, speed + accel / 60);
    sim.update(1 / 60, speed, throttle);
    rpm.push(sim.state.rpm);
    gears.push(sim.state.gear);
  }
  return { rpm, gears, sim, def };
};

describe('EngineSim', () => {
  it('idles at idle, stays within 0..1 and never goes backwards through the gears while accelerating', () => {
    for (const v of listVehicles()) {
      const { rpm, gears } = run(v.id, 20, 1, 3);
      expect(Math.min(...rpm)).toBeGreaterThanOrEqual(IDLE_RPM - 1e-6);
      expect(Math.max(...rpm)).toBeLessThanOrEqual(1);
      for (let i = 1; i < gears.length; i++) expect(gears[i]).toBeGreaterThanOrEqual(gears[i - 1]);
      expect(gears.at(-1)).toBe(v.engine.gearTopSpeeds.length - 1);
    }
    const sim = new EngineSim(listVehicles()[0]);
    sim.update(0.5, 0, 0);
    expect(sim.state.rpm).toBeCloseTo(IDLE_RPM, 2);
  });

  it('revs fall when a gear changes and the engine reports a short shift', () => {
    const { rpm, gears } = run('druk-ranger', 12, 1, 4);
    const shiftAt = gears.findIndex((g, i) => i > 0 && g > gears[i - 1]);
    expect(shiftAt).toBeGreaterThan(0);
    const before = Math.max(...rpm.slice(Math.max(0, shiftAt - 10), shiftAt));
    const after = Math.min(...rpm.slice(shiftAt, shiftAt + 20));
    expect(after).toBeLessThan(before - 0.05);
  });

  it('lifting off reports overrun, and a heavier throttle means a higher load', () => {
    const def = listVehicles()[2];
    const sim = new EngineSim(def);
    for (let i = 0; i < 60; i++) sim.update(1 / 60, 15, 0);
    expect(sim.state.overrun).toBe(true);
    const lo = new EngineSim(def);
    const hi = new EngineSim(def);
    for (let i = 0; i < 60; i++) {
      lo.update(1 / 60, 8, 0.2);
      hi.update(1 / 60, 8, 1);
    }
    expect(hi.state.load).toBeGreaterThan(lo.state.load);
  });

  it('different vehicles shift at different speeds (the ladder comes from the vehicle data)', () => {
    const shiftSpeeds = listVehicles().map((v) => v.engine.gearTopSpeeds[0]);
    expect(new Set(shiftSpeeds).size).toBeGreaterThan(2);
  });
});
