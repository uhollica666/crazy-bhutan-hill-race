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

/** Where a vehicle stands for the player. */
export type VehicleOwnership = 'owned' | 'available' | 'locked';

export function vehicleOwnership(v: VehicleDef, progress: Progress, owned: readonly string[]): VehicleOwnership {
  if (owned.includes(v.id)) return 'owned';
  return isVehicleUnlocked(v, progress) ? 'available' : 'locked';
}

/** True when the player can buy it right now. */
export function canBuyVehicle(v: VehicleDef, progress: Progress, owned: readonly string[], credits: number): boolean {
  return vehicleOwnership(v, progress, owned) === 'available' && credits >= v.price;
}

/** A vehicle may drive a mission only if the mission lists it AND it has seats for the whole party. */
export function canUseVehicle(level: LevelDef, vehicle: string | Pick<VehicleDef, 'id' | 'capacity'>, vehicles?: VehicleDef[]): boolean {
  const id = typeof vehicle === 'string' ? vehicle : vehicle.id;
  if (!level.vehicles.includes(id)) return false;
  const def = typeof vehicle === 'string' ? vehicles?.find((v) => v.id === vehicle) : vehicle;
  return !def || def.capacity >= level.mission.party;
}

/** Vehicles the player owns that may drive `level`. */
export function availableVehicles(level: LevelDef, vehicles: VehicleDef[], owned: readonly string[]): VehicleDef[] {
  return vehicles.filter((v) => owned.includes(v.id) && canUseVehicle(level, v));
}

/**
 * Repairs a saved selection after unlocks/ownership/eligibility change: the level must be unlocked, and the
 * vehicle must be owned and allowed on that level (falling back to the first usable one in the level's order).
 */
export function resolveSelection(
  sel: Selection,
  levels: LevelDef[],
  vehicles: VehicleDef[],
  progress: Progress,
  owned: readonly string[],
): { level: LevelDef; vehicle: VehicleDef } {
  const unlocked = levels.filter((l) => isLevelUnlocked(l, progress));
  const level = unlocked.find((l) => l.id === sel.levelId) ?? unlocked[0] ?? levels[0];
  const usable = availableVehicles(level, vehicles, owned);
  const byLevelOrder = level.vehicles.map((id) => usable.find((v) => v.id === id)).find((v) => v);
  const vehicle = usable.find((v) => v.id === sel.vehicleId) ?? byLevelOrder ?? usable[0] ?? vehicles[0];
  return { level, vehicle };
}
