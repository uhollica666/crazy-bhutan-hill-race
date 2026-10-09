import type { VehicleDef } from '../types';
import { drukRanger } from './druk-ranger';
import { touristCoaster } from './tourist-coaster';

/** Display order = selection screen order. */
const registry = new Map<string, VehicleDef>([drukRanger, touristCoaster].map((v) => [v.id, v]));

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
}

const rate = (v: number, lo: number, hi: number): number =>
  1 + Math.round(4 * Math.min(1, Math.max(0, (v - lo) / (hi - lo))));

export function vehicleStats(v: VehicleDef): VehicleStats {
  const lengths = v.axles.map((a) => a.z);
  const wheelbase = Math.max(...lengths) - Math.min(...lengths);
  const minRadius = wheelbase / Math.tan(v.steering.maxAngle);
  return {
    speed: rate(v.engine.topSpeed, 22, 40),
    acceleration: rate(v.engine.force / v.mass, 3, 8),
    handling: rate(-minRadius, -12, -3.5),
    braking: rate(v.engine.brakeForce / v.mass, 8, 20),
    stability: rate(v.stability.uprighting / v.mass + v.stability.yawAssist / v.mass, 1.5, 5),
  };
}
