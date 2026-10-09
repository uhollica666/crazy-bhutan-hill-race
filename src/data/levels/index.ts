import type { LevelDef } from '../types';
import { chelelaRun } from './chelela-run';

const registry = new Map<string, LevelDef>([[chelelaRun.id, chelelaRun]]);

export const getLevel = (id: string): LevelDef => {
  const def = registry.get(id);
  if (!def) throw new Error(`Unknown level "${id}"`);
  return def;
};
export const listLevels = (): LevelDef[] => [...registry.values()];
