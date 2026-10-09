import type { VehicleDef } from '../types';
import { drukRanger } from './druk-ranger';

const registry = new Map<string, VehicleDef>([[drukRanger.id, drukRanger]]);

export const getVehicle = (id: string): VehicleDef => {
  const def = registry.get(id);
  if (!def) throw new Error(`Unknown vehicle "${id}"`);
  return def;
};
export const listVehicles = (): VehicleDef[] => [...registry.values()];
