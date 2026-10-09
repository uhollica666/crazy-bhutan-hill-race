import type { LevelDef, Medal, UnlockRule, VehicleDef } from '../data/types';
import type { Progress, Selection } from '../storage/SaveStore';
import { MEDAL_RANK } from './scoring';

/** True when `rule` is satisfied by the saved progress (null = always available). */
export function isUnlocked(rule: UnlockRule | null, progress: Progress): boolean {
  if (!rule) return true;
  const rec = progress.levels[rule.levelId];
  if (!rec || rec.completions < 1) return false;
  if (rule.requirement === 'finish') return true;
  return MEDAL_RANK[rec.medal] >= MEDAL_RANK[rule.requirement as Medal];
}

export const isLevelUnlocked = (level: LevelDef, progress: Progress): boolean =>
  isUnlocked(level.unlock, progress);
export const isVehicleUnlocked = (v: VehicleDef, progress: Progress): boolean =>
  isUnlocked(v.unlock, progress);

export interface Unlocks {
  levels: LevelDef[];
  vehicles: VehicleDef[];
}

/** What a progress change newly opened up. */
export function newlyUnlocked(
  levels: LevelDef[],
  vehicles: VehicleDef[],
  before: Progress,
  after: Progress,
): Unlocks {
  return {
    levels: levels.filter((l) => !isLevelUnlocked(l, before) && isLevelUnlocked(l, after)),
    vehicles: vehicles.filter((v) => !isVehicleUnlocked(v, before) && isVehicleUnlocked(v, after)),
  };
}

/** Human text for an unlock requirement, e.g. "Finish Pass Run". */
export function describeRule(rule: UnlockRule, levels: LevelDef[]): string {
  const name = levels.find((l) => l.id === rule.levelId)?.name ?? rule.levelId;
  return rule.requirement === 'finish' ? `Finish ${name}` : `Earn ${rule.requirement} on ${name}`;
}

export function canUseVehicle(level: LevelDef, vehicleId: string): boolean {
  return level.vehicles.includes(vehicleId);
}

/** Vehicles usable on `level` that the player owns. */
export function availableVehicles(level: LevelDef, vehicles: VehicleDef[], progress: Progress): VehicleDef[] {
  return vehicles.filter((v) => canUseVehicle(level, v.id) && isVehicleUnlocked(v, progress));
}

/**
 * Repairs a saved selection after unlocks/eligibility change: the level must be unlocked, and the vehicle
 * must be unlocked and allowed on that level (falling back to the level's recommended vehicle).
 */
export function resolveSelection(
  sel: Selection,
  levels: LevelDef[],
  vehicles: VehicleDef[],
  progress: Progress,
): { level: LevelDef; vehicle: VehicleDef } {
  const unlocked = levels.filter((l) => isLevelUnlocked(l, progress));
  const level = unlocked.find((l) => l.id === sel.levelId) ?? unlocked[0] ?? levels[0];
  const usable = availableVehicles(level, vehicles, progress);
  const vehicle =
    usable.find((v) => v.id === sel.vehicleId) ??
    usable.find((v) => v.id === level.vehicles[0]) ??
    usable[0] ??
    vehicles[0];
  return { level, vehicle };
}
