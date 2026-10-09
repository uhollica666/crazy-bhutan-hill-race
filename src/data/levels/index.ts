import type { LevelDef, VehicleDef } from '../types';
import { EXTENSIONS } from './extensions';
import { extendLevel } from './extend';
import { RAW_LEVELS } from './raw';

/** Campaign order. Unlock rules live on each LevelDef; this list only fixes display order. Every mission is the
 * authored level with its `extensions.ts` stretch spliced in (Pass 5 doubled their length). */
const registry = new Map<string, LevelDef>(
  RAW_LEVELS.map((l) => {
    const st = EXTENSIONS[l.id];
    const level = st ? extendLevel(l, st) : l;
    return [level.id, level] as [string, LevelDef];
  }),
);

export const getLevel = (id: string): LevelDef => {
  const def = registry.get(id);
  if (!def) throw new Error(`Unknown level "${id}"`);
  return def;
};
export const listLevels = (): LevelDef[] => [...registry.values()];

/** Scaled time thresholds for a vehicle: slower vehicles get proportionally more time. */
export interface LevelTimes {
  limit: number;
  gold: number;
  silver: number;
  bronze: number;
}

export function levelTimes(level: LevelDef, pace: number): LevelTimes {
  return {
    limit: Math.round(level.timeLimit * pace),
    gold: Math.round(level.medals.gold * pace),
    silver: Math.round(level.medals.silver * pace),
    bronze: Math.round(level.medals.bronze * pace),
  };
}

/** Time scale for a vehicle on a level: the level's override, else the vehicle's own pace. */
export const paceFor = (level: LevelDef, vehicle: Pick<VehicleDef, 'id' | 'pace'>): number =>
  level.pace?.[vehicle.id] ?? vehicle.pace;
