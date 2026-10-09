/**
 * Fastest believable time (milliseconds) for each mission. The game checks it before posting a time, and
 * firestore.rules enforces the same floor (tests/cloud-limits.test.ts keeps the two in step). It rejects nonsense
 * such as a one-second Pass Run; it does NOT prove a run was legitimate (see docs/FIREBASE.md, "Leaderboard trust").
 */
export const MIN_TIME_MS: Record<string, number> = {
  'pass-run': 55000,
  'thimphu-pickup': 60000,
  'airport-dash': 57000,
  'punakha-valley': 54000,
  'dochula-storm': 84000,
  'chelela-climb': 78000,
  'trongsa-gorge': 63000,
  'bumthang-night': 65000,
  'remote-expedition': 55000,
  'gmc-plains': 55000,
};

export const MAX_TIME_MS = 3_600_000;

/** What the rules allow for a display name, shared with the UI. */
export const DISPLAY_NAME = { min: 3, max: 20 } as const;
