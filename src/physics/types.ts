import type { GroundSample } from '../world/Terrain';
import type { BarrierHit } from '../world/Road';

import type { SurfaceDef } from '../data/surfaces';

export interface ObstacleHit {
  depth: number;
  /** Unit XZ normal pointing from the obstacle toward the vehicle point. */
  nx: number;
  nz: number;
  /** Obstacle velocity (m/s), for relative-speed impacts. */
  vx: number;
  vz: number;
  restitution: number;
  /** Share of the penetration the vehicle is pushed out by (0..1). */
  push: number;
  /** Which obstacle was hit (index in the obstacle list), or -1. */
  id: number;
}

/** What the vehicle simulation needs from the world. Keeps physics independent of rendering and levels. */
export interface PhysicsWorld {
  ground(x: number, z: number, out: GroundSample): void;
  /** Returns true and fills `out` when the point is inside a parapet / end cap. */
  barrier(x: number, z: number, out: BarrierHit): boolean;
  /** The road surface under (x, z). Optional: worlds without it are all asphalt. */
  surface?(x: number, z: number): SurfaceDef;
  /** Tests a point against movable obstacles (boulders, traffic, creatures). */
  obstacle?(x: number, z: number, out: ObstacleHit): boolean;
}

export interface VehicleInput {
  /** -1 (left) .. 1 (right) */
  steer: number;
  /** 0..1 */
  throttle: number;
  /** 0..1 - brakes while moving forward, reverses once (almost) stopped. */
  brake: number;
}

export const createVehicleInput = (): VehicleInput => ({ steer: 0, throttle: 0, brake: 0 });
