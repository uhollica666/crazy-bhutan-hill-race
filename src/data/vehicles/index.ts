import type { VehicleDef } from '../types';
import { dragonCruiser } from './dragon-cruiser';
import { drukRanger } from './druk-ranger';
import { dzoHatch } from './dzo-hatch';
import { touristCoaster } from './tourist-coaster';

/** Progression order (tier 1 to 4). Garage and unlock UI follow this list. */
const registry = new Map<string, VehicleDef>(
  [dzoHatch, touristCoaster, drukRanger, dragonCruiser].map((v) => [v.id, v]),
);

export const STARTER_VEHICLE = dzoHatch.id;

export const getVehicle = (id: string): VehicleDef => {
  const def = registry.get(id);
  if (!def) throw new Error(`Unknown vehicle "${id}"`);
  return def;
};
export const listVehicles = (): VehicleDef[] => [...registry.values()];

/** 1..5 ratings for the selection screen, derived from the real physics numbers (never hand-typed). */
export interface VehicleStats {
  speed: number;
  acceleration: number;
  handling: number;
  braking: number;
  stability: number;
  offroad: number;
}

const rate = (v: number, lo: number, hi: number): number =>
  1 + Math.round(4 * Math.min(1, Math.max(0, (v - lo) / (hi - lo))));

/** Ground clearance (m) under the chassis box at rest, derived from the suspension and wheel numbers. */
export function groundClearance(v: VehicleDef): number {
  const lowest = Math.min(...v.axles.map((a) => a.y));
  const sag = (v.mass * v.gravity) / (v.axles.length * 2) / v.suspension.stiffness;
  return -lowest + v.suspension.rest - sag + v.wheelRadius - v.size.height / 2;
}

export function vehicleStats(v: VehicleDef): VehicleStats {
  const lengths = v.axles.map((a) => a.z);
  const wheelbase = Math.max(...lengths) - Math.min(...lengths);
  const minRadius = wheelbase / Math.tan(v.steering.maxAngle);
  return {
    speed: rate(v.engine.topSpeed, 22, 42),
    acceleration: rate(v.engine.force / v.mass, 3, 8.5),
    handling: rate(-minRadius, -12, -3.5),
    braking: rate(v.engine.brakeForce / v.mass, 8, 20),
    stability: rate(v.stability.uprighting / v.mass + v.stability.yawAssist / v.mass, 1.5, 5),
    offroad: rate(
      v.offroad * 0.7 + groundClearance(v) * 0.6 + (v.drivetrain.modes.includes('4x4') ? 0.25 : 0),
      0.2,
      1.2,
    ),
  };
}
