import type { LevelDef, Medal } from '../data/types';
import type { Progress } from '../storage/SaveStore';
import { isLevelUnlocked } from './progression';

/** Short plain-language tags describing what makes a mission different (shown on the mission map). */
export function challengeTags(level: LevelDef): string[] {
  const tags: string[] = [];
  const first = level.conditions[0];
  if (first.time === 'night') tags.push('Night');
  else if (first.time === 'dusk') tags.push('Dusk');
  const weather: Record<string, string> = { rain: 'Rain', heavyRain: 'Storm', fog: 'Fog', snow: 'Snow', cloudy: '' };
  if (weather[first.weather]) tags.push(weather[first.weather]);
  if (level.startFuel <= 0.35) tags.push('Low fuel');
  if (level.ford || level.fords?.length) tags.push('River ford');
  if (level.surfaces?.some((s) => s.surface === 'mud' || s.surface === 'rocky' || s.surface === 'gravel')) tags.push('Off-road');
  if (level.mission.comfort) tags.push('Comfort');
  if (level.stops.filter((s) => s.kind === 'pickup').length > 1) tags.push(`${level.stops.filter((s) => s.kind === 'pickup').length} pickups`);
  const kinds = new Set(level.hazards.map((h) => h.kind));
  if (kinds.has('landslide')) tags.push('Rockfall');
  if (kinds.has('creature')) tags.push('Yeti');
  if (kinds.has('brokenTruck')) tags.push('Blocked road');
  if (level.terrain.drop && level.terrain.drop.depth >= 40) tags.push('Cliff drop');
  if (level.rival) tags.push('Rival');
  if (level.traffic) tags.push('Traffic');
  if (level.mission.kind === 'circuit') tags.push('Closed course');
  return tags.slice(0, 4);
}

export interface RegionGroup {
  name: string;
  levels: LevelDef[];
}

/** Missions grouped by chapter, in campaign order. */
export function groupByRegion(levels: readonly LevelDef[]): RegionGroup[] {
  const out: RegionGroup[] = [];
  for (const l of levels) {
    let g = out.find((x) => x.name === l.region);
    if (!g) out.push((g = { name: l.region, levels: [] }));
    g.levels.push(l);
  }
  return out;
}

export interface CampaignStatus {
  completed: number;
  total: number;
  medals: Record<Exclude<Medal, 'none'>, number>;
  done: boolean;
}

export function campaignStatus(levels: readonly LevelDef[], progress: Progress): CampaignStatus {
  const medals = { gold: 0, silver: 0, bronze: 0 };
  let completed = 0;
  for (const l of levels) {
    const rec = progress.levels[l.id];
    if (!rec || rec.completions < 1) continue;
    completed++;
    if (rec.medal !== 'none') medals[rec.medal]++;
  }
  return { completed, total: levels.length, medals, done: completed === levels.length };
}

/** The mission to play next: the first unlocked, not yet completed one in campaign order. */
export function nextUnplayed(levels: readonly LevelDef[], progress: Progress): LevelDef | null {
  return levels.find((l) => isLevelUnlocked(l, progress) && (progress.levels[l.id]?.completions ?? 0) < 1) ?? null;
}

/**
 * True when a run that has just been recorded finished the last unfinished mission. `before` is the progress
 * from before the run, so replaying a mission in an already-finished campaign does not trigger it again.
 */
export function justCompletedCampaign(levels: readonly LevelDef[], before: Progress, after: Progress): boolean {
  return !campaignStatus(levels, before).done && campaignStatus(levels, after).done;
}
