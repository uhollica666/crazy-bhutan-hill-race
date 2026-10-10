import type { LandmarkDef } from '../types';
import type { Stretch } from './extend';

/**
 * Pass 5 lengthens every mission to roughly twice its original distance. Each entry splices a new stretch of
 * road into the mission (see `extend.ts`); the original road, scenery and stops keep their places on either side.
 * Time limits and medals are calibrated against the autopilot with `bun scripts/medals.ts`.
 */

type Dress = Omit<LandmarkDef, 'at'> & { t: number };

/** Deterministic roadside dressing for a new stretch: no randomness, so levels always play the same. */
function dress(kinds: LandmarkDef['kind'][], count: number, from = 0.04, to = 0.96, offset = 18): Dress[] {
  const out: Dress[] = [];
  for (let i = 0; i < count; i++) {
    const t = from + ((to - from) * (i + 0.5)) / count;
    const kind = kinds[i % kinds.length];
    const side = (i * 7) % 3 === 0 ? -1 : (i % 2 === 0 ? 1 : -1);
    const wide = kind === 'house' || kind === 'dzong' ? 10 : kind === 'flagSpan' ? -offset : 0;
    out.push({ kind, t, side: side as -1 | 1, offset: Math.max(0, offset + wide + ((i * 5) % 7)), rotation: ((i * 37) % 10) / 10 - 0.5 });
  }
  return out;
}

export const EXTENSIONS: Record<string, Stretch> = {
  'gmc-plains': {
    at: 0.58,
    path: [
      { turn: 25, radius: 90 }, { straight: 200 }, { turn: -50, radius: 90 }, { straight: 200 }, { turn: 25, radius: 90 },
      { turn: 25, radius: 90 }, { straight: 200 }, { turn: -50, radius: 90 }, { straight: 200 }, { turn: 25, radius: 90 },
      { turn: 25, radius: 90 }, { straight: 200 }, { turn: -50, radius: 90 }, { straight: 200 }, { turn: 25, radius: 90 },
    ],
    note: 'The closed course gains a second, faster loop around the infield.',
    rivalFinishTime: 150,
    timeLimit: 320,
    medals: { gold: 145, silver: 170, bronze: 210 },
    stops: [{ id: 'pit-2', kind: 'service', t: 0.5, label: 'Infield pit lane', side: 1, services: ['refuel', 'repair'], optional: true }],
    checkpoints: [
      { t: 0.35, label: 'Back straight' },
      { t: 0.75, label: 'Infield chicane' },
    ],
    landmarks: [...dress(['tower', 'flagSpan', 'streetLamp', 'house'], 10, 0.04, 0.96, 26)],
  },
};
