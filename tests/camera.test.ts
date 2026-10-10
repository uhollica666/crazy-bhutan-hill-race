import { describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import { CAMERA_SHAKE, CameraRig } from '../src/render/CameraRig';
import { getVehicle } from '../src/data/vehicles';
import { SURFACES } from '../src/data/surfaces';
import type { SurfaceId } from '../src/data/types';

/** A minimal stand-in for the physics body: a car doing `speed` m/s along -Z on one surface. */
function fakeBody(speed: number, surface: SurfaceId) {
  return {
    speed,
    velocity: new Vector3(0, 0, -speed),
    steerValue: 0,
    wheels: [0, 1, 2, 3].map(() => ({ inContact: true, surface: SURFACES[surface] })),
    interpolate: (_a: number, pos: Vector3, quat: Quaternion) => {
      pos.set(0, 1, 0);
      quat.identity();
    },
    headingXZ: (out: { x: number; z: number }) => {
      out.x = 0;
      out.z = -1;
    },
  };
}
const world = { ground: (_x: number, _z: number, out: { height: number }) => void (out.height = 0) };

/** Peak-to-peak vertical wobble of the camera over two seconds of driving. */
function wobble(view: 'chase' | 'close', speed: number, surface: SurfaceId, roadShake = 1): number {
  const rig = new CameraRig();
  rig.setVehicle(getVehicle('druk-ranger'));
  rig.view = view;
  rig.roadShake = roadShake;
  const body = fakeBody(speed, surface);
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < 240; i++) {
    rig.update(1 / 120, body as never, 1, world as never, i / 120 + 40);
    if (i > 120) {
      lo = Math.min(lo, rig.camera.position.y);
      hi = Math.max(hi, rig.camera.position.y);
    }
  }
  return hi - lo;
}

describe('camera: road-surface shake', () => {
  it('every surface has a shake level, from glass-smooth to rough', () => {
    for (const id of Object.keys(SURFACES) as SurfaceId[]) expect(CAMERA_SHAKE[id], id).toBeGreaterThanOrEqual(0);
    expect(CAMERA_SHAKE.asphalt).toBeLessThan(0.1);
    expect(CAMERA_SHAKE.gravel).toBeGreaterThan(0.5);
    expect(CAMERA_SHAKE.rocky).toBe(1);
  });

  it('rough roads shake far more than smooth ones, and faster driving shakes more', () => {
    for (const view of ['chase', 'close'] as const) {
      const smooth = wobble(view, 20, 'asphalt');
      const gravel = wobble(view, 20, 'gravel');
      const rocky = wobble(view, 20, 'rocky');
      expect(gravel, view).toBeGreaterThan(smooth * 3);
      expect(rocky, view).toBeGreaterThan(gravel);
      expect(wobble(view, 6, 'rocky'), view).toBeLessThan(rocky);
      expect(wobble(view, 0, 'rocky'), view).toBeLessThan(0.01); // a parked car on a rocky road does not shake
    }
  });

  it('the Road shake setting scales it down to nothing', () => {
    const full = wobble('close', 20, 'rocky', 1);
    expect(wobble('close', 20, 'rocky', 0.5)).toBeLessThan(full * 0.8);
    expect(wobble('close', 20, 'rocky', 0)).toBeLessThan(0.002);
  });

  it('the shake stays within sensible bounds', () => {
    expect(wobble('chase', 30, 'rocky')).toBeLessThan(0.5);
    expect(wobble('close', 30, 'rocky')).toBeLessThan(0.5);
  });
});

describe('camera: views', () => {
  it('the driver view sits at the car, the chase view behind it', () => {
    const body = fakeBody(10, 'asphalt');
    const rig = new CameraRig();
    rig.setVehicle(getVehicle('dzo-hatch'));
    rig.view = 'close';
    for (let i = 0; i < 60; i++) rig.update(1 / 120, body as never, 1, world as never, i / 120);
    expect(Math.abs(rig.camera.position.z)).toBeLessThan(1.5);
    expect(rig.camera.near).toBeLessThan(0.2);
    rig.view = 'chase';
    for (let i = 0; i < 240; i++) rig.update(1 / 120, body as never, 1, world as never, i / 120);
    expect(rig.camera.position.z).toBeGreaterThan(4); // behind the car (it faces -Z)
    expect(rig.camera.near).toBeGreaterThan(0.2);
  });

  it('the rear camera looks back down the road from the back of the car', () => {
    const body = fakeBody(-3, 'asphalt');
    const rig = new CameraRig();
    rig.setVehicle(getVehicle('dzo-hatch'));
    rig.update(1 / 120, body as never, 1, world as never, 0);
    const cam = rig.camera.clone();
    rig.placeRearCamera(cam);
    expect(cam.position.z).toBeGreaterThan(1); // at the tail
    const dir = new Vector3();
    cam.getWorldDirection(dir);
    expect(dir.z).toBeGreaterThan(0.9); // looking backwards (+Z)
  });
});
