import { getLevel } from '../data/levels';
import type { SaveStore } from '../storage/SaveStore';
import type { CloudService } from './CloudService';
import { MAX_TIME_MS, MIN_TIME_MS } from './limits';
import type { LeaderboardEntryDoc } from './types';

export interface BoardRow {
  rank: number;
  name: string;
  timeMs: number;
  vehicleId: string;
  medal: string;
  conditions: string;
  isYou: boolean;
}

export type BoardState = 'ready' | 'empty' | 'offline' | 'disabled' | 'error';

export interface BoardView {
  levelId: string;
  rows: BoardRow[];
  /** Your own best on this board (when you have posted one): rank is null when it is beyond the loaded page. */
  mine: { rank: number | null; beyond: boolean; row: BoardRow } | null;
  state: BoardState;
  /** When these rows were fetched; stale rows are shown with a note while offline. */
  fetchedAt: number | null;
  stale: boolean;
  message: string | null;
}

export interface RunForBoard {
  levelId: string;
  vehicleId: string;
  /** Seconds, as the game measures it. */
  time: number;
  medal: string;
  comfort: number | null;
  /** weather-time, e.g. "clear-day". */
  conditions: string;
}

interface Pending {
  timeMs: number;
  vehicleId: string;
  conditions: string;
  medal: string;
  comfort: number | null;
  clientAt: number;
}

interface Persisted {
  pending: Record<string, Pending>;
  /** The best time already accepted by the server for each level (so a slower or equal run is never sent again). */
  submitted: Record<string, number>;
  cache: Record<string, { at: number; rows: BoardRow[] }>;
}

export const BOARD_KEY = 'cbhr.v1.board';
export const PAGE_SIZE = 25;
export const MAX_PAGE = 100;
const TTL_MS = 60_000;

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

/** Reasons a finished run is not posted. Pure so it can be tested and reused by the results screen. */
export function eligibility(run: RunForBoard): { ok: true; timeMs: number } | { ok: false; reason: string } {
  if (!Number.isFinite(run.time) || run.time <= 0) return { ok: false, reason: 'invalid time' };
  const timeMs = Math.round(run.time * 1000);
  const floor = MIN_TIME_MS[run.levelId];
  if (!floor) return { ok: false, reason: 'unknown mission' };
  let allowed: boolean;
  try {
    allowed = getLevel(run.levelId).vehicles.includes(run.vehicleId);
  } catch {
    allowed = false;
  }
  if (!allowed) return { ok: false, reason: 'vehicle not allowed on this mission' };
  if (timeMs < floor || timeMs > MAX_TIME_MS) return { ok: false, reason: 'time outside the believable range' };
  return { ok: true, timeMs };
}

/**
 * The online beta leaderboard. Posting is automatic after a completed run when a (guest or account) identity exists;
 * offline results wait in a small persistent queue (the best time per mission) and are sent when the network is back.
 * Reads are bounded (one page of 25), cached for a minute, and replaced by the last cached page while offline.
 */
export class Leaderboards {
  private data: Persisted = { pending: {}, submitted: {}, cache: {} };
  private flushing = false;
  private readonly memoryCache = new Map<string, { at: number; view: BoardView }>();

  constructor(
    private readonly cloud: CloudService,
    private readonly store: SaveStore,
    private readonly storage: StorageLike | null,
    private readonly appVersion: string,
  ) {
    this.load();
    cloud.onOnline(() => void this.flush());
    cloud.onStatus((s) => {
      if (s.user) void this.flush();
    });
  }

  private load(): void {
    try {
      const raw = this.storage?.getItem(BOARD_KEY);
      if (raw) {
        const o = JSON.parse(raw) as Partial<Persisted>;
        this.data = { pending: o.pending ?? {}, submitted: o.submitted ?? {}, cache: o.cache ?? {} };
      }
    } catch {
      /* corrupt: start empty */
    }
  }

  private save(): void {
    try {
      this.storage?.setItem(BOARD_KEY, JSON.stringify(this.data));
    } catch {
      /* storage unavailable */
    }
  }

  get pendingCount(): number {
    return Object.keys(this.data.pending).length;
  }

  /** Called with every completed run. Queues it if it beats what was already posted, then tries to send. */
  submitRun(run: RunForBoard): void {
    const e = eligibility(run);
    if (!e.ok) return;
    const best = Math.min(this.data.submitted[run.levelId] ?? Infinity, this.data.pending[run.levelId]?.timeMs ?? Infinity);
    if (e.timeMs >= best) return; // not an improvement: nothing to send, and an identical run is never sent twice
    this.data.pending[run.levelId] = { timeMs: e.timeMs, vehicleId: run.vehicleId, conditions: run.conditions, medal: run.medal, comfort: run.comfort, clientAt: Date.now() };
    this.save();
    void this.flush();
  }

  async flush(): Promise<void> {
    const backend = this.cloud.backendRef;
    const uid = this.cloud.uid;
    if (!backend || !uid || this.flushing || !this.pendingCount) return;
    this.flushing = true;
    try {
      for (const [levelId, p] of Object.entries(this.data.pending)) {
        const entry: LeaderboardEntryDoc = { uid, levelId, timeMs: p.timeMs, vehicleId: p.vehicleId, conditions: p.conditions, displayName: this.cloud.status.displayName, medal: p.medal, comfort: p.comfort, clientAt: p.clientAt };
        try {
          const r = await backend.submitEntry(entry, this.appVersion);
          this.data.submitted[levelId] = r === 'ok' ? p.timeMs : Math.min(this.data.submitted[levelId] ?? Infinity, p.timeMs);
          delete this.data.pending[levelId];
          for (const k of [...this.memoryCache.keys()]) if (k.startsWith(`${levelId}:`)) this.memoryCache.delete(k);
          this.save();
        } catch (e) {
          const code = (e as { code?: string }).code;
          if (code === 'offline') break; // try again when the network returns
          if (code === 'permission-denied') {
            // The server refused it (for example the time is below its floor): drop it rather than retry forever.
            delete this.data.pending[levelId];
            this.save();
          } else break;
        }
      }
    } finally {
      this.flushing = false;
    }
  }

  /** Loads a board. Bounded, cached; falls back to the last known page (or this device's own records) when offline. */
  async loadBoard(levelId: string, opts: { force?: boolean; limit?: number } = {}): Promise<BoardView> {
    const limit = Math.min(100, Math.max(1, opts.limit ?? PAGE_SIZE));
    const key = `${levelId}:${limit}`;
    const hit = this.memoryCache.get(key);
    if (!opts.force && hit && Date.now() - hit.at < TTL_MS) return hit.view;
    const backend = this.cloud.backendRef;
    if (!backend) return this.localView(levelId, 'disabled', 'Online leaderboards are not available in this build.');
    try {
      if (!this.cloud.status.online) throw Object.assign(new Error('offline'), { code: 'offline' });
      const entries = await backend.topEntries(levelId, limit);
      const uid = this.cloud.uid;
      const rows: BoardRow[] = entries.map((e, i) => ({ rank: i + 1, name: e.displayName, timeMs: e.timeMs, vehicleId: e.vehicleId, medal: e.medal, conditions: e.conditions, isYou: e.uid === uid }));
      let mine: BoardView['mine'] = null;
      if (uid) {
        const mineRow = rows.find((r) => r.isYou);
        if (mineRow) mine = { rank: mineRow.rank, beyond: false, row: mineRow };
        else {
          const own = await backend.myEntry(levelId, uid).catch(() => null);
          if (own) {
            const faster = await backend.countFaster(levelId, own.timeMs).catch(() => null);
            mine = { rank: faster === null || faster >= 100 ? null : faster + 1, beyond: true, row: { rank: 0, name: own.displayName, timeMs: own.timeMs, vehicleId: own.vehicleId, medal: own.medal, conditions: own.conditions, isYou: true } };
          }
        }
      }
      const view: BoardView = { levelId, rows, mine, state: rows.length ? 'ready' : 'empty', fetchedAt: Date.now(), stale: false, message: rows.length ? null : 'No times yet. Be the first!' };
      this.memoryCache.set(key, { at: Date.now(), view });
      this.data.cache[levelId] = { at: Date.now(), rows };
      this.save();
      return view;
    } catch (e) {
      const offline = (e as { code?: string }).code === 'offline' || !this.cloud.status.online;
      const cached = this.data.cache[levelId];
      if (cached) {
        return { levelId, rows: cached.rows.map((r) => ({ ...r, isYou: false })), mine: null, state: offline ? 'offline' : 'error', fetchedAt: cached.at, stale: true, message: offline ? 'You are offline. Showing the last times seen.' : 'Could not refresh the leaderboard. Showing the last times seen.' };
      }
      return this.localView(levelId, offline ? 'offline' : 'error', offline ? 'You are offline. Online times will appear when you reconnect.' : 'Could not load the leaderboard right now.');
    }
  }

  /** This device's own records for a mission, shown when the online board is unavailable. */
  private localView(levelId: string, state: BoardState, message: string): BoardView {
    const rec = this.store.levelRecord(levelId);
    const rows: BoardRow[] = Object.entries(rec.vehicles)
      .filter(([, v]) => v.bestTime !== null)
      .map(([vehicleId, v]) => ({ rank: 0, name: this.cloud.status.displayName, timeMs: Math.round((v.bestTime as number) * 1000), vehicleId, medal: v.medal, conditions: '', isYou: true }))
      .sort((a, b) => a.timeMs - b.timeMs)
      .map((r, i) => ({ ...r, rank: i + 1 }));
    return { levelId, rows, mine: null, state, fetchedAt: null, stale: false, message };
  }
}
