import { validIncident } from './events';
import type { GameEvent, Incident, PerfTier, Platform } from './events';
import type { PrivacyStore } from './privacy';
import type { CloudBackend } from './types';

// ------------------------------------------------------------------------------- on-device incident log

export const INCIDENT_KEY = 'cbhr.v1.incidents';
export const INCIDENT_LIMIT = 300;
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export interface LoggedIncident extends Incident {
  /** Epoch ms. */
  t: number;
}

/**
 * Where drivers struggled, kept ON THIS DEVICE only (bounded, never sent by itself). It feeds the developer
 * heatmap and does not depend on any consent, because it does not leave the device.
 */
export class IncidentLog {
  private items: LoggedIncident[] = [];

  constructor(private readonly storage: StorageLike | null) {
    try {
      const raw = storage?.getItem(INCIDENT_KEY);
      const arr: unknown = raw ? JSON.parse(raw) : [];
      if (Array.isArray(arr)) this.items = arr.filter((x): x is LoggedIncident => !!x && validIncident(x as Incident) && Number.isFinite((x as LoggedIncident).t)).slice(-INCIDENT_LIMIT);
    } catch {
      /* corrupt: start empty */
    }
  }

  add(i: Incident, t = Date.now()): void {
    if (!validIncident(i)) return;
    this.items = [...this.items, { ...i, t }].slice(-INCIDENT_LIMIT);
    try {
      this.storage?.setItem(INCIDENT_KEY, JSON.stringify(this.items));
    } catch {
      /* storage unavailable */
    }
  }

  list(levelId?: string): LoggedIncident[] {
    return levelId ? this.items.filter((i) => i.levelId === levelId) : [...this.items];
  }

  clear(): void {
    this.items = [];
    try {
      this.storage?.setItem(INCIDENT_KEY, '[]');
    } catch {
      /* storage unavailable */
    }
  }
}

// ----------------------------------------------------------------------------------------- telemetry

export interface TelemetryContext {
  appVersion: string;
  platform: Platform;
  qualityTier: 'low' | 'medium' | 'high';
  perfTier: PerfTier;
}

export interface TelemetryOptions {
  privacy: PrivacyStore;
  incidents: IncidentLog;
  backend: () => CloudBackend | null;
  uid: () => string | null;
  context: () => TelemetryContext;
  /** Minimum gap between uploads (ms). */
  minGapMs?: number;
  /** Upload at least this often while there is something to send (ms). */
  intervalMs?: number;
  now?: () => number;
}

const MAX_INCIDENTS_PER_DOC = 12;

interface Aggregate {
  counters: Record<string, number>;
  vehicles: Record<string, number>;
  levels: Record<string, Record<string, number>>;
  upgrades: Record<string, number>;
  incidents: Incident[];
}

const emptyAggregate = (): Aggregate => ({ counters: {}, vehicles: {}, levels: {}, upgrades: {}, incidents: [] });

/**
 * Optional gameplay statistics. Nothing is collected, kept or sent unless the player has opted in. When they have,
 * events are folded into ONE small summary per session (counters and at most 12 incidents per document) instead of
 * one write per event, and uploaded rarely: when the incident list fills, every few minutes while active, and when
 * the page is hidden. Turning the choice off discards what has not been sent.
 */
export class Telemetry {
  private agg: Aggregate = emptyAggregate();
  private readonly sessionId: string;
  private part = 0;
  private startedAt: number;
  private lastFlush = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private uploading = false;
  private activity = false;
  private readonly minGap: number;
  private readonly interval: number;
  private readonly now: () => number;
  private readonly onVisibility = (): void => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') void this.flush('hidden');
  };

  constructor(private readonly o: TelemetryOptions) {
    this.now = o.now ?? Date.now;
    this.minGap = o.minGapMs ?? 60_000;
    this.interval = o.intervalMs ?? 300_000;
    this.startedAt = this.now();
    const c = globalThis.crypto;
    const raw = c?.randomUUID ? c.randomUUID().replaceAll('-', '') : Array.from({ length: 3 }, () => Math.random().toString(16).slice(2, 12)).join('');
    this.sessionId = `ses-${raw}`.slice(0, 40);
    o.privacy.onChange((p) => {
      if (p.analytics) this.begin();
      else this.revoke();
    });
    if (o.privacy.analytics) this.begin();
  }

  private begin(): void {
    this.startedAt = this.now();
    if (this.timer === null && typeof setInterval !== 'undefined') {
      this.timer = setInterval(() => void this.flush('interval'), this.interval);
      if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.onVisibility);
    }
    void this.o.backend()?.setAnalyticsEnabled(true).catch(() => undefined);
  }

  /** The player turned statistics off: drop what has not been sent and stop everything. */
  private revoke(): void {
    this.agg = emptyAggregate();
    this.activity = false;
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onVisibility);
    void this.o.backend()?.setAnalyticsEnabled(false).catch(() => undefined);
  }

  dispose(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onVisibility);
  }

  private bump(map: Record<string, number>, key: string, n = 1): void {
    map[key] = (map[key] ?? 0) + n;
  }

  private level(id: string): Record<string, number> {
    return (this.agg.levels[id] ??= {});
  }

  /** Records an event. Incidents are always kept locally; everything else only with consent. */
  track(e: GameEvent): void {
    if (e.name === 'incident') {
      const { name: _n, ...incident } = e;
      void _n;
      this.o.incidents.add(incident);
    }
    if (!this.o.privacy.analytics) return; // no consent: nothing is aggregated, queued or sent
    this.activity = true;
    const a = this.agg;
    switch (e.name) {
      case 'game_session_started':
        this.bump(a.counters, 'sessions');
        break;
      case 'mission_selected':
        this.bump(a.counters, 'missionsSelected');
        break;
      case 'vehicle_selected':
        this.bump(a.vehicles, e.vehicleId);
        break;
      case 'mission_started':
        this.bump(a.counters, 'missionsStarted');
        if (e.attempt > 1) this.bump(a.counters, 'retries');
        this.bump(this.level(e.levelId), 'started');
        break;
      case 'mission_completed':
        this.bump(a.counters, 'missionsCompleted');
        this.bump(this.level(e.levelId), 'completed');
        this.bump(this.level(e.levelId), `medal_${e.medal}`);
        this.bump(this.level(e.levelId), 'seconds', Math.round(e.seconds));
        break;
      case 'mission_failed':
        this.bump(a.counters, e.reason === 'abandoned' ? 'missionsAbandoned' : 'missionsFailed');
        this.bump(this.level(e.levelId), e.reason === 'abandoned' ? 'abandoned' : 'failed');
        break;
      case 'vehicle_unlocked':
        this.bump(a.counters, 'vehiclesUnlocked');
        break;
      case 'vehicle_purchased':
        this.bump(a.counters, 'vehiclesPurchased');
        break;
      case 'upgrade_purchased':
        this.bump(a.upgrades, `${e.vehicleId}.${e.upgradeId}`);
        this.bump(a.counters, 'upgradesPurchased');
        break;
      case 'feedback_submitted':
        this.bump(a.counters, 'feedbackSubmitted');
        break;
      case 'setting_changed':
        this.bump(a.counters, `setting_${e.key}`);
        break;
      case 'incident': {
        const { name: _n, ...incident } = e;
        void _n;
        if (validIncident(incident)) {
          a.incidents.push(incident);
          if (a.incidents.length > MAX_INCIDENTS_PER_DOC * 3) a.incidents.shift(); // bounded while offline
          if (a.incidents.length >= MAX_INCIDENTS_PER_DOC) void this.flush('full');
        }
        break;
      }
    }
    // Optional product analytics (Google Analytics via Firebase): lazy, supported browsers only, after consent.
    const b = this.o.backend();
    if (b && e.name !== 'incident') void b.logAnalytics(e.name, flatParams(e)).catch(() => undefined);
  }

  /** Uploads the summary if the player agreed, a user exists, and enough time has passed. Never throws. */
  async flush(reason: 'interval' | 'hidden' | 'full' | 'manual'): Promise<boolean> {
    if (!this.o.privacy.analytics || !this.activity || this.uploading) return false;
    const backend = this.o.backend();
    const uid = this.o.uid();
    if (!backend || !uid) return false;
    const t = this.now();
    if (reason !== 'hidden' && reason !== 'manual' && t - this.lastFlush < this.minGap) return false;
    const a = this.agg;
    const chunk = a.incidents.slice(0, MAX_INCIDENTS_PER_DOC);
    const ctx = this.o.context();
    const doc = {
      startedAt: this.startedAt,
      endedAt: t,
      appVersion: ctx.appVersion,
      platform: ctx.platform,
      qualityTier: ctx.qualityTier,
      perfTier: ctx.perfTier,
      counters: { ...a.counters },
      vehicles: { ...a.vehicles },
      levels: JSON.parse(JSON.stringify(a.levels)) as Aggregate['levels'],
      upgrades: { ...a.upgrades },
      incidents: chunk.map((i) => ({ type: i.type, levelId: i.levelId, at: i.at, vehicleId: i.vehicleId, severity: i.severity })),
    };
    const id = this.part === 0 ? this.sessionId : `${this.sessionId}-${this.part + 1}`.slice(0, 64);
    this.uploading = true;
    try {
      await backend.submitTelemetry(id, doc);
      this.part++;
      this.lastFlush = t;
      // What was sent is removed; anything that arrived meanwhile stays for the next document.
      this.agg = { ...emptyAggregate(), incidents: this.agg.incidents.slice(chunk.length) };
      this.activity = this.agg.incidents.length > 0;
      return true;
    } catch {
      return false; // offline or refused: keep the summary and try again later
    } finally {
      this.uploading = false;
    }
  }

  /** What would be sent now (shown in the developer panel and used by tests). */
  peek(): Aggregate {
    return JSON.parse(JSON.stringify(this.agg)) as Aggregate;
  }
}

/** Flattens an event into primitive analytics parameters (no nested data, no free text). */
function flatParams(e: GameEvent): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(e)) {
    if (k === 'name') continue;
    if (typeof v === 'string') out[k] = v.slice(0, 40);
    else if (typeof v === 'number' && Number.isFinite(v)) out[k] = Math.round(v * 100) / 100;
  }
  return out;
}

// ------------------------------------------------------------------------------------- sample data

/**
 * A deterministic, clearly fake dataset for the developer heatmap and for tests: incidents cluster around a few
 * "hot spots" along the route. It is generated, not collected; it exists so the visualisation can be checked without
 * any player data.
 */
export function sampleIncidents(levelId: string, vehicleIds: string[], count = 160, seed = 7): LoggedIncident[] {
  let s = seed + levelId.length * 131;
  const rnd = (): number => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const spots = [0.18 + rnd() * 0.1, 0.45 + rnd() * 0.1, 0.72 + rnd() * 0.12];
  const types: Incident['type'][] = ['collision', 'collision', 'collision', 'recovered', 'stuck', 'hazard', 'fuel_exhausted', 'failed', 'abandoned'];
  const out: LoggedIncident[] = [];
  for (let i = 0; i < count; i++) {
    const spot = spots[Math.floor(rnd() * spots.length)];
    const g = (rnd() + rnd() + rnd() - 1.5) * 0.06;
    const at = Math.min(1, Math.max(0, Math.round((rnd() < 0.8 ? spot + g : rnd()) * 1000) / 1000));
    out.push({ type: types[Math.floor(rnd() * types.length)], levelId, at, vehicleId: vehicleIds[Math.floor(rnd() * vehicleIds.length)] ?? 'dzo-hatch', severity: (['low', 'medium', 'high'] as const)[Math.floor(rnd() * 3)], t: 0 });
  }
  return out;
}

/** Counts incidents in `bins` equal slices of the route (for the density overlay). */
export function histogram(items: Pick<Incident, 'at'>[], bins = 50): number[] {
  const h = new Array<number>(bins).fill(0);
  for (const i of items) h[Math.min(bins - 1, Math.max(0, Math.floor(i.at * bins)))]++;
  return h;
}
