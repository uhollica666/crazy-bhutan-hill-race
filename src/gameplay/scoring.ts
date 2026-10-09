import type { LevelDef, Medal } from '../data/types';
import { clamp } from '../core/math';
import type { LevelTimes } from '../data/levels';

export const MEDAL_RANK: Record<Medal, number> = { none: 0, bronze: 1, silver: 2, gold: 3 };
const BY_RANK: Medal[] = ['none', 'bronze', 'silver', 'gold'];

export const betterMedal = (a: Medal, b: Medal): Medal => (MEDAL_RANK[a] >= MEDAL_RANK[b] ? a : b);
export const worseMedal = (a: Medal, b: Medal): Medal => (MEDAL_RANK[a] <= MEDAL_RANK[b] ? a : b);
export const medalFromRank = (r: number): Medal => BY_RANK[clamp(Math.round(r), 0, 3)];

export function medalFromTime(times: LevelTimes, time: number): Medal {
  if (time <= times.gold) return 'gold';
  if (time <= times.silver) return 'silver';
  if (time <= times.bronze) return 'bronze';
  return 'none';
}

export function medalFromComfort(thresholds: LevelDef['comfortMedals'], comfort: number): Medal {
  if (comfort >= thresholds.gold) return 'gold';
  if (comfort >= thresholds.silver) return 'silver';
  if (comfort >= thresholds.bronze) return 'bronze';
  return 'none';
}

export interface ScoreInput {
  times: LevelTimes;
  time: number;
  /** Average passenger satisfaction 0..100, or null when the mission does not track comfort. */
  comfort: number | null;
}

/**
 * Run score 0..100 (used for personal bests and the results screen; medals are decided separately).
 *  timeScore = 100 at or under the gold time, falling linearly to 0 at the time limit.
 *  Comfort missions: score = 0.6 * timeScore + 0.4 * comfort.  Others: score = timeScore.
 */
export function runScore({ times, time, comfort }: ScoreInput): number {
  const span = Math.max(1, times.limit - times.gold);
  const timeScore = 100 * clamp((times.limit - time) / span, 0, 1);
  return Math.round(comfort === null ? timeScore : 0.6 * timeScore + 0.4 * comfort);
}

/**
 * Final medal. Pure time missions: the time medal. Comfort missions: the WORSE of the time medal and the
 * comfort medal, so neither flat-out speed nor a glacial, perfectly smooth crawl can earn gold.
 */
export function finalMedal(level: LevelDef, times: LevelTimes, time: number, comfort: number | null): Medal {
  const t = medalFromTime(times, time);
  if (comfort === null || !level.mission.comfort) return t;
  return worseMedal(t, medalFromComfort(level.comfortMedals, comfort));
}
