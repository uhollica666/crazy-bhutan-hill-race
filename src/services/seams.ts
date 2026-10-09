/**
 * Service seams. Every capability that might one day talk to a server (Firebase or otherwise) is an
 * interface here with a local implementation behind it. Stage 3 ships ONLY the local implementations:
 * nothing in this file performs network access, and no telemetry is sent anywhere.
 */
import type { SaveData } from '../storage/SaveStore';

// ------------------------------------------------------------------------- progress storage

/** Where the save document lives. Today: this browser's localStorage. Later: a cloud-backed adapter. */
export interface ProgressStorage {
  readonly kind: 'local' | 'remote';
  load(): SaveData | null;
  save(data: SaveData): void;
}

// -------------------------------------------------------------------------- player identity

export interface PlayerIdentity {
  /** Opaque id, or null for the anonymous local player. */
  id: string | null;
  displayName: string;
  isAnonymous: boolean;
}

export interface IdentityProvider {
  current(): PlayerIdentity;
}

/** The only identity in Stage 3: nobody signs in, nothing is created, nothing leaves the device. */
export class LocalIdentity implements IdentityProvider {
  current(): PlayerIdentity {
    return { id: null, displayName: 'Driver', isAnonymous: true };
  }
}

// -------------------------------------------------------------------------------- leaderboard

export interface LeaderboardEntry {
  rank: number;
  name: string;
  time: number;
  vehicleId: string;
  isYou: boolean;
}

export interface LeaderboardService {
  readonly kind: 'local' | 'remote';
  /** Best times for a level, best first. */
  top(levelId: string, limit: number): LeaderboardEntry[];
}

/** A personal board built from this device's own history (there is no online leaderboard yet). */
export class LocalLeaderboard implements LeaderboardService {
  readonly kind = 'local' as const;
  constructor(private readonly data: () => SaveData) {}
  top(levelId: string, limit: number): LeaderboardEntry[] {
    const rec = this.data().progress.levels[levelId];
    if (!rec) return [];
    return Object.entries(rec.vehicles)
      .filter(([, v]) => v.bestTime !== null)
      .map(([vehicleId, v]) => ({ vehicleId, time: v.bestTime as number }))
      .sort((a, b) => a.time - b.time)
      .slice(0, limit)
      .map((e, i) => ({ rank: i + 1, name: 'You', time: e.time, vehicleId: e.vehicleId, isYou: true }));
  }
}

// --------------------------------------------------------------------------------- analytics

/**
 * Semantic gameplay events: "reached checkpoint 2 on pass-run", never coordinates or locations.
 * The default sink drops everything; tests and a future opt-in analytics adapter can subscribe.
 */
export type AnalyticsEvent =
  | { name: 'mission_start'; levelId: string; vehicleId: string; conditions: string }
  | { name: 'checkpoint'; levelId: string; index: number }
  | { name: 'pickup'; levelId: string; stopId: string }
  | { name: 'service'; levelId: string; kind: string }
  | { name: 'mission_end'; levelId: string; status: 'completed' | 'timeout'; medal: string; seconds: number }
  | { name: 'upgrade_bought'; vehicleId: string; upgradeId: string; level: number }
  | { name: 'vehicle_bought'; vehicleId: string };

export interface AnalyticsSink {
  readonly sendsOffDevice: boolean;
  track(event: AnalyticsEvent): void;
}

export class NullAnalytics implements AnalyticsSink {
  readonly sendsOffDevice = false;
  track(): void {
    /* no telemetry in Stage 3 */
  }
}

/** Keeps events in memory (for tests and the debug overlay). Never leaves the page. */
export class MemoryAnalytics implements AnalyticsSink {
  readonly sendsOffDevice = false;
  readonly events: AnalyticsEvent[] = [];
  track(e: AnalyticsEvent): void {
    this.events.push(e);
    if (this.events.length > 200) this.events.shift();
  }
}

export interface Services {
  identity: IdentityProvider;
  leaderboard: LeaderboardService;
  analytics: AnalyticsSink;
}
