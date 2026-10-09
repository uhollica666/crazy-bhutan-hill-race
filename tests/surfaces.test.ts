import { describe, expect, it } from 'vitest';
import { SURFACES } from '../src/data/surfaces';
import { getVehicle } from '../src/data/vehicles';
import { getLevel } from '../src/data/levels';
import { applyUpgrades } from '../src/data/upgrades';
import { VehicleBody } from '../src/physics/VehicleBody';
import type { PhysicsWorld } from '../src/physics/types';
import { createVehicleInput } from '../src/physics/types';
import { Course } from '../src/world/Course';

function accelerate(surface: keyof typeof SURFACES, slope: number, mode: '4x2' | '4x4', upgraded = false) {
  const base = getVehicle('druk-ranger');
  const b = new VehicleBody(upgraded ? applyUpgrades(base, { engine: 3, tires: 3 }) : base);
  const w: PhysicsWorld = {
    ground(_x, z, out) {
      out.height = -z * slope;
      out.nx = 0;
      out.ny = 1 / Math.hypot(1, slope);
      out.nz = slope / Math.hypot(1, slope);
    },
    barrier() {
      return false;
    },
    surface() {
      return SURFACES[surface];
    },
  };
  b.place(w, 0, 0, 0, -1);
  b.setDriveMode(mode);
  const input = createVehicleInput();
  input.throttle = 1;
  for (let i = 0; i < 480; i++) b.step(1 / 120, input, w);
  return { b, w };
}

describe('controlled surface and drivetrain physics', () => {
  it.each(['asphalt', 'mud'] as const)(
    '%s: drivetrain powers the correct axles without an artificial engine boost',
    (surface) => {
      const two = accelerate(surface, 0, '4x2'),
        four = accelerate(surface, 0, '4x4');
      console.info(surface, two.b.speed, four.b.speed);
      expect(four.b.speed).toBeGreaterThan(two.b.speed);
      if (surface === 'asphalt') expect(four.b.speed / two.b.speed).toBeLessThan(1.05);
      expect(four.b.wheels.filter((w) => w.driven)).toHaveLength(4);
      expect(two.b.wheels.filter((w) => w.driven)).toHaveLength(2);
    },
  );
  it('4x4 climbs better than 4x2 under the same steep muddy conditions', () => {
    expect(accelerate('mud', 0.25, '4x4').b.speed).toBeGreaterThan(accelerate('mud', 0.25, '4x2').b.speed);
  });
  it('mud reduces speed, wet roads lengthen braking and upgrades improve acceleration', () => {
    expect(accelerate('mud', 0, '4x4').b.speed).toBeLessThan(accelerate('asphalt', 0, '4x4').b.speed);
    expect(accelerate('asphalt', 0, '4x2', true).b.speed).toBeGreaterThan(
      accelerate('asphalt', 0, '4x2').b.speed,
    );
    const stopping = (surface: 'asphalt' | 'wetAsphalt') => {
      const { b, w } = accelerate(surface, 0, '4x4');
      b.velocity.set(0, 0, -15);
      const z = b.position.z,
        input = createVehicleInput();
      input.brake = 1;
      for (let i = 0; i < 1000 && b.speed > 0.5; i++) b.step(1 / 120, input, w);
      return z - b.position.z;
    };
    expect(stopping('wetAsphalt')).toBeGreaterThan(stopping('asphalt'));
  });
  it('ordinary hatchback cannot switch to 4x4; water is a real surface with depth', () => {
    const hatch = new VehicleBody(getVehicle('dzo-hatch'));
    expect(hatch.setDriveMode('4x4')).toBe('4x2');
    const c = new Course(getLevel('remote-expedition'));
    const f = c.ford!,
      p = c.poseAt((f.fromS + f.toS) / 2);
    expect(c.surface(p.x, p.z).id).toBe('water');
    expect(c.waterDepthAt(p.x, p.z)).toBeGreaterThan(0);
    const start = c.poseAt(c.startS);
    expect(c.waterDepthAt(start.x, start.z)).toBe(0);
  });
});
