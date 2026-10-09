import { describe, expect, it } from 'vitest';
import { getLevel } from '../src/data/levels';
import { getVehicle } from '../src/data/vehicles';
import { Particles, SkidMarks, VehicleEffects } from '../src/render/effects';
import { VehicleBody } from '../src/physics/VehicleBody';
import { createVehicleInput } from '../src/physics/types';
import { Course } from '../src/world/Course';

const quadsUsed = (s: SkidMarks): number => {
  const pos = s.mesh.geometry.getAttribute('position');
  let n = 0;
  for (let q = 0; q < pos.count / 4; q++) if (pos.getY(q * 4) > -9000) n++;
  return n;
};

describe('SkidMarks', () => {
  it('lays segments while skidding, breaks the line when the skid stops, and never streaks across a teleport', () => {
    const s = new SkidMarks(50);
    for (let i = 0; i < 20; i++) s.add(0, true, i * 0.5, 0.1, 0, 1, 0);
    expect(quadsUsed(s)).toBeGreaterThan(10);
    const before = quadsUsed(s);
    s.add(0, false, 0, 0, 0, 1, 0);
    s.add(0, true, 100, 0.1, 100, 1, 0); // restart far away: no segment joins the two spots
    s.add(0, true, 100.5, 0.1, 100, 1, 0);
    expect(quadsUsed(s)).toBeLessThanOrEqual(before + 1);
  });

  it('is a ring buffer: it never grows beyond its capacity', () => {
    const s = new SkidMarks(30);
    for (let i = 0; i < 500; i++) s.add(1, true, i * 0.5, 0.1, 0, 1, 0);
    expect(quadsUsed(s)).toBe(30);
    s.clear();
    expect(quadsUsed(s)).toBe(0);
  });
});

describe('Particles', () => {
  it('particles age out, and a thin density setting spawns fewer', () => {
    const p = new Particles(40);
    for (let i = 0; i < 100; i++) p.emit(0, 0, 0, 0, 1, 0, 1, 0.5, 1, 1, 1, 0.5);
    p.update(0.1);
    const alive = () => {
      const st = p.points.geometry.getAttribute('aState');
      let n = 0;
      for (let i = 0; i < st.count; i++) if (st.getZ(i) > 0) n++;
      return n;
    };
    expect(alive()).toBe(40); // pool capacity, no unbounded growth
    p.update(1);
    expect(alive()).toBe(0);
    p.density = 0.2;
    let spawned = 0;
    for (let i = 0; i < 400; i++) {
      p.clear();
      p.emit(0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1);
      p.update(0.01);
      spawned += alive();
    }
    expect(spawned).toBeGreaterThan(20);
    expect(spawned).toBeLessThan(160);
  });
});

describe('VehicleEffects driven by real physics', () => {
  const level = getLevel('pass-run');
  const course = new Course(level);

  it('hard braking at speed leaves skid marks; gentle driving leaves (almost) none', () => {
    const body = new VehicleBody(getVehicle('druk-ranger'));
    const p = course.poseAt(course.startS);
    body.place(course, p.x, p.z, p.tx, p.tz);
    const fx = new VehicleEffects();
    const input = createVehicleInput();
    input.throttle = 1;
    for (let i = 0; i < 120 * 6; i++) {
      body.step(1 / 120, input, course);
      if (i % 2 === 0) fx.update(1 / 60, body, course, true);
    }
    const gentle = quadsUsed(fx.skids);
    expect(gentle).toBeLessThanOrEqual(4); // at most a chirp while the car settles
    input.throttle = 0;
    input.brake = 1;
    for (let i = 0; i < 120 * 2; i++) {
      body.step(1 / 120, input, course);
      if (i % 2 === 0) fx.update(1 / 60, body, course, true);
    }
    expect(body.speed).toBeLessThan(25);
    expect(quadsUsed(fx.skids)).toBeGreaterThan(gentle + 5);
    fx.reset();
    expect(quadsUsed(fx.skids)).toBe(0);
    fx.dispose();
  });
});

describe('Pass 4.5 effects: exhaust, damage smoke, wading, pooling', () => {
  const level = getLevel('pass-run');
  const course = new Course(level);
  const setup = (): { body: VehicleBody; fx: VehicleEffects; input: ReturnType<typeof createVehicleInput> } => {
    const body = new VehicleBody(getVehicle('druk-ranger'));
    const p = course.poseAt(course.startS);
    body.place(course, p.x, p.z, p.tx, p.tz);
    const fx = new VehicleEffects();
    fx.setVehicle(getVehicle('druk-ranger'));
    const input = createVehicleInput();
    input.throttle = 1;
    return { body, fx, input };
  };
  const run = (body: VehicleBody, fx: VehicleEffects, input: ReturnType<typeof createVehicleInput>, seconds: number, ctx?: Parameters<VehicleEffects['update']>[4]): void => {
    for (let i = 0; i < 120 * seconds; i++) {
      body.step(1 / 120, input, course);
      if (i % 2 === 0) fx.update(1 / 60, body, course, true, ctx);
    }
  };

  it('a running engine puffs exhaust; a stopped engine does not', () => {
    const a = setup();
    run(a.body, a.fx, a.input, 3, { rpm: 0.6, load: 0.9, health: 100, waterDepth: 0, engineRunning: true });
    expect(a.fx.particles.alive).toBeGreaterThan(0);
    const b = setup();
    run(b.body, b.fx, b.input, 3, { rpm: 0.2, load: 0, health: 100, waterDepth: 0, engineRunning: false });
    expect(b.fx.particles.alive).toBe(0);
  });

  it('a healthy car does not smoke from the bonnet, a wrecked one does', () => {
    const ok = setup();
    ok.input.throttle = 0;
    run(ok.body, ok.fx, ok.input, 2, { rpm: 0.2, load: 0, health: 100, waterDepth: 0, engineRunning: true });
    const okAlive = ok.fx.particles.alive;
    const hurt = setup();
    hurt.input.throttle = 0;
    run(hurt.body, hurt.fx, hurt.input, 2, { rpm: 0.2, load: 0, health: 8, waterDepth: 0, engineRunning: true });
    expect(hurt.fx.particles.alive).toBeGreaterThan(okAlive + 3);
  });

  it('wading sprays water, and the pool stays bounded however long it runs', () => {
    const { body, fx, input } = setup();
    run(body, fx, input, 8, { rpm: 0.7, load: 1, health: 100, waterDepth: 0.5, engineRunning: true });
    expect(fx.particles.alive).toBeGreaterThan(5);
    expect(fx.particles.alive).toBeLessThanOrEqual(320);
  });

  it('particle gravity makes chunks fall while smoke rises', () => {
    const p = new Particles(8);
    p.emit(0, 5, 0, 0, 0, 0, 1, 2, 1, 1, 1, 1, 9, 0.5, 0); // a falling chunk
    p.emit(1, 5, 0, 0, 0, 0, 1, 2, 1, 1, 1, 1, -0.8, 1, 0); // a rising puff
    p.update(0.5);
    const pos = p.points.geometry.getAttribute('position');
    expect(pos.getY(0)).toBeLessThan(5);
    expect(pos.getY(1)).toBeGreaterThan(5);
  });
});
