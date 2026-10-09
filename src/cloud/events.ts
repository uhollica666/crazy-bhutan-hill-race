/**
 * The vocabulary of gameplay statistics. Events are semantic ("mission_completed on pass-run in 142 s"), versioned,
 * and contain no free text, no coordinates, no e-mail address and no input data. Route positions are fractions of a
 * mission's road (0 = start line, 1 = finish line) so they map back onto the level without any real-world location.
 */
export const EVENT_SCHEMA = 1;

export type IncidentType = 'collision' | 'recovered' | 'fuel_exhausted' | 'stuck' | 'hazard' | 'abandoned' | 'failed';
export type Severity = 'low' | 'medium' | 'high';
export type Platform = 'desktop' | 'phone' | 'tablet' | 'unknown';
export type PerfTier = 'low' | 'mid' | 'high' | 'unknown';

export interface Incident {
  type: IncidentType;
  levelId: string;
  /** 0..1 along the mission's road. */
  at: number;
  vehicleId: string;
  severity: Severity;
}

export type GameEvent =
  | { name: 'game_session_started'; platform: Platform; qualityTier: 'low' | 'medium' | 'high'; perfTier: PerfTier }
  | { name: 'mission_selected'; levelId: string }
  | { name: 'vehicle_selected'; vehicleId: string }
  | { name: 'mission_started'; levelId: string; vehicleId: string; conditions: string; attempt: number }
  | { name: 'mission_completed'; levelId: string; vehicleId: string; seconds: number; medal: string; attempts: number }
  | { name: 'mission_failed'; levelId: string; vehicleId: string; reason: 'timeout' | 'abandoned'; seconds: number }
  | { name: 'vehicle_unlocked'; vehicleId: string }
  | { name: 'vehicle_purchased'; vehicleId: string }
  | { name: 'upgrade_purchased'; vehicleId: string; upgradeId: string; level: number }
  | { name: 'feedback_submitted'; rating: number }
  | { name: 'setting_changed'; key: 'quality' | 'hudMode'; value: string }
  | ({ name: 'incident' } & Incident);

export const SEMANTIC_EVENTS: GameEvent['name'][] = [
  'game_session_started',
  'mission_selected',
  'vehicle_selected',
  'mission_started',
  'mission_completed',
  'mission_failed',
  'vehicle_unlocked',
  'vehicle_purchased',
  'upgrade_purchased',
  'feedback_submitted',
  'setting_changed',
  'incident',
];

/** Position along the mission, 0..1, rounded to 3 decimals (about 3 m on a 3 km road). */
export function routeFraction(s: number, startS: number, finishS: number): number {
  const span = finishS - startS;
  if (!(span > 0) || !Number.isFinite(s)) return 0;
  return Math.round(Math.min(1, Math.max(0, (s - startS) / span)) * 1000) / 1000;
}

/** How hard an impact was, as a coarse bucket (m/s of speed lost). Never the raw number. */
export function severityFor(impactSpeed: number): Severity {
  return impactSpeed < 6 ? 'low' : impactSpeed < 13 ? 'medium' : 'high';
}

/** A coarse device class. No model, no user agent. */
export function platformOf(win: { matchMedia?: (q: string) => { matches: boolean }; innerWidth: number; innerHeight: number } | null): Platform {
  if (!win) return 'unknown';
  const coarse = win.matchMedia?.('(pointer: coarse)').matches ?? false;
  if (!coarse) return 'desktop';
  return Math.min(win.innerWidth, win.innerHeight) < 600 ? 'phone' : 'tablet';
}

/** Rough performance class from what the browser says about itself (cores, memory) and the chosen quality. */
export function perfTierOf(cores: number | undefined, memoryGb: number | undefined, quality: 'low' | 'medium' | 'high'): PerfTier {
  if (!cores && !memoryGb) return 'unknown';
  if ((cores ?? 4) <= 4 || (memoryGb ?? 4) <= 3 || quality === 'low') return 'low';
  return (cores ?? 4) >= 8 && (memoryGb ?? 8) >= 8 ? 'high' : 'mid';
}

/** Runtime guard for incidents (the types are erased at run time, and the rules reject anything outside this). */
export function validIncident(i: Incident): boolean {
  return (
    ['collision', 'recovered', 'fuel_exhausted', 'stuck', 'hazard', 'abandoned', 'failed'].includes(i.type) &&
    typeof i.levelId === 'string' &&
    i.levelId.length < 40 &&
    Number.isFinite(i.at) &&
    i.at >= 0 &&
    i.at <= 1 &&
    typeof i.vehicleId === 'string' &&
    ['low', 'medium', 'high'].includes(i.severity)
  );
}
