import { serverTimestamp } from 'firebase/firestore';

export const PROJECT_ID = 'demo-crazy-bhutan-hill-race';

export const validRecord = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  bestTime: 91.5,
  bestScore: 80,
  bestComfort: null,
  medal: 'silver',
  completions: 2,
  ...over,
});

export const validSave = (uid: string, over: Record<string, unknown> = {}): Record<string, unknown> => ({
  schema: 1,
  uid,
  revision: 1,
  updatedAt: serverTimestamp(),
  clientUpdatedAt: 1_760_000_000_000,
  deviceId: 'device-12345678',
  appVersion: '0.5.0',
  progress: {
    levels: {
      'pass-run': { completions: 2, medal: 'silver', vehicles: { 'dzo-hatch': validRecord() } },
      'thimphu-pickup': { completions: 1, medal: 'bronze', vehicles: { 'druk-ranger': validRecord({ medal: 'bronze', completions: 1 }) } },
    },
  },
  garage: { owned: ['dzo-hatch', 'druk-ranger'], upgrades: { 'dzo-hatch': { engine: 1 } } },
  wallet: { credits: 420 },
  stats: { missionsPlayed: 3, creditsEarned: 900, campaignCompleted: false },
  story: { seen: ['pass-run'] },
  prefs: { hudMode: 'standard', reducedMotion: false },
  ...over,
});

export const validProfile = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  schema: 1,
  displayName: 'Swift Yak 42',
  accountType: 'guest',
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  ...over,
});

export const validEntry = (uid: string, levelId = 'pass-run', over: Record<string, unknown> = {}): Record<string, unknown> => ({
  schema: 1,
  uid,
  levelId,
  timeMs: 123_456,
  vehicleId: 'dzo-hatch',
  conditions: 'clear-day',
  displayName: 'Swift Yak 42',
  medal: 'gold',
  comfort: null,
  appVersion: '0.5.0',
  clientAt: 1_760_000_000_000,
  submittedAt: serverTimestamp(),
  ...over,
});

export const validFeedback = (uid: string, id: string, over: Record<string, unknown> = {}): Record<string, unknown> => ({
  schema: 1,
  uid,
  submissionId: id,
  createdAt: serverTimestamp(),
  clientAt: 1_760_000_000_000,
  appVersion: '0.5.0',
  origin: 'menu',
  rating: 4,
  gameplay: 'Great driving.',
  controls: 'Touch steering is good.',
  graphics: 'Lovely mountains.',
  performance: 'Smooth on my laptop.',
  difficulty: 'aboutRight',
  favourite: 'The garage.',
  improve: 'More levels please.',
  add: 'Multiplayer.',
  bugs: 'Nothing serious.',
  contact: null,
  device: null,
  interest: { playLargerVersion: true, considerPurchasingFullGame: null, priceRange: '5to10', voluntarySupport: false },
  ...over,
});

export const validIncident = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  type: 'collision',
  levelId: 'pass-run',
  at: 0.42,
  vehicleId: 'dzo-hatch',
  severity: 'medium',
  ...over,
});

export const validSession = (uid: string, id: string, over: Record<string, unknown> = {}): Record<string, unknown> => ({
  schema: 1,
  uid,
  sessionId: id,
  startedAt: 1_760_000_000_000,
  endedAt: 1_760_000_600_000,
  appVersion: '0.5.0',
  platform: 'desktop',
  qualityTier: 'high',
  perfTier: 'high',
  counters: { missionsStarted: 3, missionsCompleted: 2 },
  vehicles: { 'dzo-hatch': 3 },
  levels: { 'pass-run': { started: 3, completed: 2 } },
  upgrades: {},
  incidents: [validIncident()],
  ...over,
});
