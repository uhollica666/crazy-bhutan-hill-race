import type { GroundSample } from '../world/Terrain';
import type { BarrierHit } from '../world/Road';

/** What the vehicle simulation needs from the world. Keeps physics independent of rendering and levels. */
export interface PhysicsWorld {
  ground(x: number, z: number, out: GroundSample): void;
  /** Returns true and fills `out` when the point is inside a parapet / end cap. */
  barrier(x: number, z: number, out: BarrierHit): boolean;
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
