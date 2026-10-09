import type { LevelDef, VehicleDef } from '../types';
import { airportDash } from './airport-dash';
import { bumthangNight } from './bumthang-night';
import { chelelaClimb } from './chelela-climb';
import { dochulaStorm } from './dochula-storm';
import { gmcPlains } from './gmc-plains';
import { passRun } from './pass-run';
import { punakhaValley } from './punakha-valley';
import { remoteExpedition } from './remote-expedition';
import { thimphuPickup } from './thimphu-pickup';
import { trongsaGorge } from './trongsa-gorge';

/** Campaign order. Unlock rules live on each LevelDef; this list only fixes display order. */
const registry = new Map<string, LevelDef>(
  [passRun, thimphuPickup, airportDash, punakhaValley, dochulaStorm, chelelaClimb, trongsaGorge, bumthangNight, remoteExpedition, gmcPlains].map((l) => [l.id, l]),
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
