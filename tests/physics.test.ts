import { describe, expect, it } from 'vitest';
import { VehicleBody } from '../src/physics/VehicleBody';
import { createVehicleInput } from '../src/physics/types';
import type { PhysicsWorld } from '../src/physics/types';
import { getVehicle } from '../src/data/vehicles';
import { getLevel } from '../src/data/levels';
import { Course } from '../src/world/Course';
import { AutoDriver } from '../src/dev/AutoDriver';
import { createRoadHit } from '../src/world/Road';

const DT = 1 / 120;
const def = getVehicle('druk-ranger');

const flatWorld = (slope = 0): PhysicsWorld => ({
  ground(_x, z, out) {
    out.height = -z * slope;
    const l = Math.hypot(slope, 1);
    out.nx = 0;
    out.ny = 1 / l;
    out.nz = -slope / l;
  },
  barrier() {
    return false;
  },
});

function run(
  body: VehicleBody,
  world: PhysicsWorld,
  seconds: number,
  input: ReturnType<typeof createVehicleInput>,
): void {
  for (let i = 0; i < seconds / DT; i++) body.step(DT, input, world);
}

describe('VehicleBody on flat ground', () => {
  it('settles on its suspension without bouncing away or sinking', () => {
    const world = flatWorld();
    const body = new VehicleBody(def);
    body.place(world, 0, 0, 0, -1);
    run(body, world, 3, createVehicleInput());
    expect(body.groundedWheels).toBe(4);
    expect(body.position.y).toBeGreaterThan(0.8);
    expect(body.position.y).toBeLessThan(1.3);
    expect(body.velocity.length()).toBeLessThan(0.1);
  });

  it('accelerates forward to near top speed and respects the limit', () => {
    const world = flatWorld();
    const body = new VehicleBody(def);
    body.place(world, 0, 0, 0, -1);
    const input = createVehicleInput();
    input.throttle = 1;
    run(body, world, 5, input);
    expect(body.speed).toBeGreaterThan(12); // quick off the line
    run(body, world, 40, input);
    expect(body.speed).toBeGreaterThan(def.engine.topSpeed * 0.85);
    expect(body.speed).toBeLessThan(def.engine.topSpeed * 1.05);
    expect(body.position.z).toBeLessThan(-100);
    expect(Math.abs(body.position.x)).toBeLessThan(0.5); // tracks straight
  });

  it('brakes to a stop, then reverses', () => {
    const world = flatWorld();
    const body = new VehicleBody(def);
    body.place(world, 0, 0, 0, -1);
    const input = createVehicleInput();
    input.throttle = 1;
    run(body, world, 6, input);
    const v0 = body.speed;
    input.throttle = 0;
    input.brake = 1;
    let t = 0;
    while (body.speed > 1 && t < 6) {
      body.step(DT, input, world);
      t += DT;
    }
    expect(t).toBeLessThan(v0 / 7); // better than ~7 m/s^2 of braking
    run(body, world, 4, input);
    expect(body.speed).toBeLessThan(-3); // brake held => reverse engaged
    expect(body.speed).toBeGreaterThan(-def.engine.reverseSpeed * 1.1);
  });

  it('steers: full lock turns the car and it stays upright', () => {
    const world = flatWorld();
    const body = new VehicleBody(def);
    body.place(world, 0, 0, 0, -1);
    const input = createVehicleInput();
    input.throttle = 0.6;
    run(body, world, 4, input);
    input.steer = 1;
    run(body, world, 3, input);
    expect(body.position.x).toBeGreaterThan(5); // turned right (+x)
    expect(body.groundedWheels).toBeGreaterThanOrEqual(3);
    expect(body.overturnedFor).toBe(0);
  });

  it('holds still on a slope when idle (auto-hold)', () => {
    const world = flatWorld(0.2);
    const body = new VehicleBody(def);
    body.place(world, 0, 0, 0, -1);
    run(body, world, 4, createVehicleInput());
    expect(body.velocity.length()).toBeLessThan(0.3);
  });

  it('is frame-rate stable: 60 Hz and 120 Hz steps reach a similar speed', () => {
    const world = flatWorld();
    const a = new VehicleBody(def);
    const b = new VehicleBody(def);
    a.place(world, 0, 0, 0, -1);
    b.place(world, 0, 0, 0, -1);
    const input = createVehicleInput();
    input.throttle = 1;
    for (let i = 0; i < 8 / DT; i++) a.step(DT, input, world);
    for (let i = 0; i < 8 / (1 / 60); i++) b.step(1 / 60, input, world);
    expect(Math.abs(a.speed - b.speed)).toBeLessThan(2.5);
  });
});

describe('Pass Run is drivable end to end', () => {
  const course = new Course(getLevel('pass-run'));

  it('has a road wide and gentle enough for the vehicle', () => {
    expect(course.road.length).toBeGreaterThan(1000);
    expect(course.road.minRadius()).toBeGreaterThan(12);
    expect(course.road.maxGrade()).toBeLessThan(0.3);
  });

  it('the autopilot completes the whole route without flipping, getting stuck, or leaving the road', () => {
    const body = new VehicleBody(def);
    const spawn = course.poseAt(course.startS);
    body.place(course, spawn.x, spawn.z, spawn.tx, spawn.tz);
    const bot = new AutoDriver(course);
    const input = createVehicleInput();
    const hit = createRoadHit();
    let t = 0;
    let maxLateral = 0;
    let minHeightOverGround = Infinity;
    let finished = false;
    let stillFor = 0;
    while (t < 240) {
      bot.update(body, input);
      body.step(DT, input, course);
      t += DT;
      course.road.project(body.position.x, body.position.z, hit);
      maxLateral = Math.max(maxLateral, Math.abs(hit.lateral));
      minHeightOverGround = Math.min(
        minHeightOverGround,
        body.position.y - course.terrain.heightAt(body.position.x, body.position.z),
      );
      expect(body.overturnedFor).toBeLessThan(1);
      stillFor = body.velocity.length() < 0.5 ? stillFor + DT : 0;
      expect(stillFor).toBeLessThan(5);
      if (hit.s >= course.finishS) {
        finished = true;
        break;
      }
    }
    // Reported so tuning of medal thresholds stays honest.
    console.log(
      `autopilot finish time ${t.toFixed(1)}s, max lateral ${maxLateral.toFixed(2)}m, road ${course.road.length.toFixed(0)}m`,
    );
    expect(finished).toBe(true);
    expect(maxLateral).toBeLessThan(course.road.wallOffset + 0.5);
    expect(minHeightOverGround).toBeGreaterThan(0.3);
  });
});
