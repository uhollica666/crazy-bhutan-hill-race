import { describe, expect, it } from 'vitest';
import { getVehicle } from '../src/data/vehicles';
import { MotionSampler } from '../src/gameplay/MotionSampler';
import { VehicleBody } from '../src/physics/VehicleBody';
import { createVehicleInput } from '../src/physics/types';
import type { PhysicsWorld } from '../src/physics/types';

const DT = 1 / 120;

const flat = (slope = 0): PhysicsWorld => ({
  ground(_x, z, out) {
    out.height = -z * slope;
    const l = Math.hypot(slope, 1);
    out.nx = 0;
    out.ny = 1 / l;
    out.nz = -slope / l;
  },
  barrier: () => false,
});

function car(id: string, world: PhysicsWorld): VehicleBody {
  const b = new VehicleBody(getVehicle(id));
  b.place(world, 0, 0, 0, -1);
  return b;
}

function run(b: VehicleBody, w: PhysicsWorld, s: number, input = createVehicleInput()): void {
  for (let i = 0; i < s / DT; i++) b.step(DT, input, w);
}

/** Time to reach `v` m/s from rest at full throttle. */
function timeTo(id: string, v: number): number {
  const w = flat();
  const b = car(id, w);
  run(b, w, 1);
  const input = createVehicleInput();
  input.throttle = 1;
  let t = 0;
  while (b.speed < v && t < 40) {
    b.step(DT, input, w);
    t += DT;
  }
  return t;
}

/** Distance to stop from `v` m/s with full braking. */
function stopDistance(id: string, v: number): number {
  const w = flat();
  const b = car(id, w);
  const input = createVehicleInput();
  input.throttle = 1;
  while (b.speed < v) b.step(DT, input, w);
  const z0 = b.position.z;
  input.throttle = 0;
  input.brake = 1;
  while (b.speed > 0.5) b.step(DT, input, w);
  return Math.abs(b.position.z - z0);
}

describe('vehicle handling differences (same physics code, different definitions)', () => {
  it('the coach accelerates much more slowly than the 4x4', () => {
    const suv = timeTo('druk-ranger', 20);
    const bus = timeTo('tourist-coaster', 20);
    expect(suv).toBeLessThan(6);
    expect(bus).toBeGreaterThan(suv * 1.35);
  });

  it('the coach needs a longer distance to stop', () => {
    const suv = stopDistance('druk-ranger', 20);
    const bus = stopDistance('tourist-coaster', 20);
    expect(bus).toBeGreaterThan(suv * 1.3);
    expect(suv).toBeLessThan(30);
  });

  it('the coach turns wider at the same speed and leans more', () => {
    const results = ['druk-ranger', 'tourist-coaster'].map((id) => {
      const w = flat();
      const b = car(id, w);
      const input = createVehicleInput();
      input.throttle = 0.7;
      while (b.speed < 14) b.step(DT, input, w);
      input.throttle = 0.35;
      input.steer = 1;
      const m = new MotionSampler();
      let maxRoll = 0;
      // Let the turn settle, then measure the radius from the yaw rate.
      run(b, w, 2.5, input);
      let yawSum = 0;
      let speedSum = 0;
      let n = 0;
      for (let i = 0; i < 2 / DT; i++) {
        b.step(DT, input, w);
        if (m.sample(b, DT)) maxRoll = Math.max(maxRoll, Math.abs(m.roll));
        yawSum += Math.abs(b.angularVelocity.y);
        speedSum += Math.hypot(b.velocity.x, b.velocity.z);
        n++;
      }
      const radius = speedSum / n / (yawSum / n);
      return { radius, maxRoll, upright: b.groundedWheels >= 3 && b.overturnedFor === 0 };
    });
    const [suv, bus] = results;
    expect(suv.upright && bus.upright).toBe(true);
    expect(bus.radius).toBeGreaterThan(suv.radius * 1.15);
    expect(bus.maxRoll).toBeGreaterThan(suv.maxRoll * 1.4);
  });

  it('neither vehicle spins or flips under full-lock at speed (yaw assist keeps it driveable)', () => {
    for (const id of ['druk-ranger', 'tourist-coaster']) {
      const w = flat();
      const b = car(id, w);
      const input = createVehicleInput();
      input.throttle = 1;
      run(b, w, 8, input);
      input.steer = 1;
      run(b, w, 3, input);
      input.steer = -1;
      run(b, w, 3, input);
      expect(b.overturnedFor, id).toBe(0);
      expect(b.groundedWheels, id).toBeGreaterThanOrEqual(3);
      // Still heading broadly where the velocity points: it did not spin out.
      const head = { x: 0, z: 0 };
      b.headingXZ(head);
      const v = Math.hypot(b.velocity.x, b.velocity.z);
      if (v > 3) expect((head.x * b.velocity.x + head.z * b.velocity.z) / v, id).toBeGreaterThan(0.6);
    }
  });

  it('both settle on their suspension and hold still on a slope (auto-hold)', () => {
    for (const id of ['druk-ranger', 'tourist-coaster']) {
      const w = flat(0.2);
      const b = car(id, w);
      run(b, w, 4);
      expect(b.groundedWheels, id).toBe(4);
      expect(b.velocity.length(), id).toBeLessThan(0.3);
    }
  });

  it('both climb a steep (22%) grade from a standstill', () => {
    for (const id of ['druk-ranger', 'tourist-coaster']) {
      const w = flat(0.22);
      const b = car(id, w);
      run(b, w, 1);
      const input = createVehicleInput();
      input.throttle = 1;
      run(b, w, 6, input);
      expect(b.speed, id).toBeGreaterThan(3);
    }
  });

  it('reverse works for both, within the reverse speed limit', () => {
    for (const id of ['druk-ranger', 'tourist-coaster']) {
      const w = flat();
      const b = car(id, w);
      const input = createVehicleInput();
      input.brake = 1;
      run(b, w, 8, input);
      expect(b.speed, id).toBeLessThan(-3);
      expect(b.speed, id).toBeGreaterThan(-getVehicle(id).engine.reverseSpeed * 1.15);
    }
  });

  it('recovery: placing the vehicle clears all motion and re-seats the wheels', () => {
    const w = flat();
    const b = car('tourist-coaster', w);
    const input = createVehicleInput();
    input.throttle = 1;
    input.steer = 1;
    run(b, w, 5, input);
    b.place(w, 10, 20, 0, -1);
    expect(b.velocity.length()).toBe(0);
    expect(b.angularVelocity.length()).toBe(0);
    expect(b.overturnedFor).toBe(0);
    run(b, w, 2);
    expect(b.groundedWheels).toBe(4);
    expect(Math.abs(b.position.x - 10)).toBeLessThan(0.3);
  });

  it('frame-rate independence holds for the coach too (60 vs 120 vs 240 Hz)', () => {
    const speeds = [60, 120, 240].map((hz) => {
      const w = flat();
      const b = car('tourist-coaster', w);
      const input = createVehicleInput();
      input.throttle = 1;
      for (let i = 0; i < 10 * hz; i++) b.step(1 / hz, input, w);
      return b.speed;
    });
    for (const s of speeds) expect(Math.abs(s - speeds[1])).toBeLessThan(2);
  });
});
