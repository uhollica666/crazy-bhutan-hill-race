import type { SaveStore } from '../storage/SaveStore';
import { generateName, validateDisplayName } from './names';
import type { CloudMetaStore } from './meta';
import { applyPayload, combine, decide, summarise, toPayload } from './payload';
import type { CloudSnapshot, PayloadSummary, SyncPayload } from './payload';
import { CloudError } from './types';
import type { CloudBackend, CloudUser, ConnectionState, SyncState } from './types';

const LEVEL_IDS_FOR_CLEANUP = ['pass-run', 'thimphu-pickup', 'airport-dash', 'punakha-valley', 'dochula-storm', 'chelela-climb', 'trongsa-gorge', 'bumthang-night', 'remote-expedition', 'gmc-plains'];

export interface ConflictInfo {
  /** diverged: both sides changed. unreadable: the cloud copy cannot be understood (corrupt or from a newer game). */
  kind: 'diverged' | 'unreadable';
  local: PayloadSummary;
  cloud: PayloadSummary | null;
  canCombine: boolean;
  combineReason: string | null;
}

export type ConflictChoice = 'cloud' | 'device' | 'combine';

export interface CloudStatus {
  connection: ConnectionState;
  sync: SyncState;
  user: CloudUser | null;
  displayName: string;
  lastSyncedAt: number | null;
  /** A short, player-facing line about the last problem or event. */
  message: string | null;
  conflict: ConflictInfo | null;
  online: boolean;
}

export interface CloudServiceOptions {
  backend: CloudBackend | null;
  store: SaveStore;
  meta: CloudMetaStore;
  appVersion: string;
  isOnline?: () => boolean;
  /** Wait before a burst of local changes is written (ms). */
  debounceMs?: number;
  /** Backoff steps after a failed sync (ms). */
  retryMs?: number[];
}

type Listener = (s: CloudStatus) => void;

const defaultOnline = (): boolean => (typeof navigator === 'undefined' ? true : navigator.onLine !== false);

/**
 * Coordinates identity and progress sync. It never blocks gameplay: every public method either returns quickly or
 * is async and safe to ignore. The local save is the source of truth the game plays from; the cloud is an
 * enhancement that is reconciled with it deliberately (see payload.ts) and never overwrites anything silently.
 */
export class CloudService {
  private readonly backend: CloudBackend | null;
  private readonly store: SaveStore;
  private readonly meta: CloudMetaStore;
  private readonly appVersion: string;
  private readonly isOnline: () => boolean;
  private readonly debounceMs: number;
  private readonly retryMs: number[];
  private readonly listeners = new Set<Listener>();
  private readonly noticeListeners = new Set<(text: string) => void>();
  private readonly onlineListeners = new Set<() => void>();
  private unwatch: (() => void) | null = null;
  private unsubStore: (() => void) | null = null;
  private debounce: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retries = 0;
  private running = false;
  private rerun = false;
  private anonAttempted = false;
  private conflictData: { cloud: CloudSnapshot | null; local: SyncPayload; unreadable: boolean } | null = null;
  private started = false;
  private readonly onWindowOnline = (): void => this.notifyOnline();
  private readonly onWindowOffline = (): void => this.set({ online: false });

  private state: CloudStatus = {
    connection: 'local',
    sync: 'idle',
    user: null,
    displayName: 'Driver',
    lastSyncedAt: null,
    message: null,
    conflict: null,
    online: true,
  };

  constructor(o: CloudServiceOptions) {
    this.backend = o.backend;
    this.store = o.store;
    this.meta = o.meta;
    this.appVersion = o.appVersion;
    this.isOnline = o.isOnline ?? defaultOnline;
    this.debounceMs = o.debounceMs ?? 5000;
    this.retryMs = o.retryMs ?? [30_000, 120_000, 600_000];
    this.state = {
      ...this.state,
      connection: this.backend ? 'connecting' : 'disabled',
      displayName: this.meta.data.displayName ?? 'Driver',
      lastSyncedAt: this.meta.data.lastSyncedAt,
      online: this.isOnline(),
      sync: this.meta.data.pendingSince !== null ? 'pending' : 'idle',
    };
  }

  // --------------------------------------------------------------------------------------- observation

  get status(): CloudStatus {
    return this.state;
  }

  get backendRef(): CloudBackend | null {
    return this.backend;
  }

  get uid(): string | null {
    return this.state.user?.uid ?? null;
  }

  get deviceId(): string {
    return this.meta.data.deviceId;
  }

  onStatus(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  /** One-line, player-facing events ("Progress restored from your account"). */
  onNotice(l: (text: string) => void): () => void {
    this.noticeListeners.add(l);
    return () => this.noticeListeners.delete(l);
  }

  /** Called whenever the network comes back (the leaderboard and feedback queues retry here). */
  onOnline(l: () => void): () => void {
    this.onlineListeners.add(l);
    return () => this.onlineListeners.delete(l);
  }

  private set(patch: Partial<CloudStatus>): void {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l(this.state);
  }

  private notice(text: string): void {
    for (const l of this.noticeListeners) l(text);
  }

  // ------------------------------------------------------------------------------------------ lifecycle

  /** Starts watching the identity. Never throws and never waits: the game does not depend on the result. */
  start(): void {
    if (this.started) return;
    this.started = true;
    if (!this.backend) return;
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.onWindowOnline);
      window.addEventListener('offline', this.onWindowOffline);
    }
    this.unsubStore = this.store.onChange((reason) => {
      if (reason === 'local') this.localChanged();
    });
    this.unwatch = this.backend.watchAuth(
      (u) => void this.handleUser(u),
      () => this.set({ connection: this.isOnline() ? 'local' : 'offline', message: null }),
    );
  }

  dispose(): void {
    this.unwatch?.();
    this.unsubStore?.();
    if (this.debounce) clearTimeout(this.debounce);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.onWindowOnline);
      window.removeEventListener('offline', this.onWindowOffline);
    }
    this.listeners.clear();
    this.started = false;
  }

  notifyOnline(): void {
    this.set({ online: true });
    for (const l of this.onlineListeners) l();
    if (this.state.user) void this.syncNow('online');
    else if (this.backend && this.meta.data.autoGuest && !this.anonAttempted) void this.handleUser(null);
  }

  // ---------------------------------------------------------------------------------------- identity

  private async handleUser(user: CloudUser | null): Promise<void> {
    if (!this.backend) return;
    if (!user) {
      this.set({ user: null });
      if (this.meta.data.autoGuest && !this.anonAttempted) {
        this.anonAttempted = true; // one anonymous identity per page load, and none if a session is restored
        this.set({ connection: 'connecting' });
        try {
          await this.backend.signInAnonymously(); // the auth listener fires again with the new user
        } catch (e) {
          this.anonAttempted = false;
          const err = e instanceof CloudError ? e : null;
          this.set({ connection: err?.code === 'offline' || !this.isOnline() ? 'offline' : 'local', message: err?.code === 'offline' ? null : (err?.message ?? null) });
        }
      } else {
        this.set({ connection: 'local' });
      }
      return;
    }
    this.anonAttempted = true;
    if (this.meta.data.uid !== user.uid) {
      // A different identity than the one this device last synced with: the remembered common ancestor is not valid.
      this.meta.update({ uid: user.uid, base: null });
    }
    this.set({ user, connection: user.isAnonymous ? 'guest' : 'account', message: null });
    void this.ensureProfile(user);
    void this.syncNow('login');
  }

  private async ensureProfile(user: CloudUser): Promise<void> {
    if (!this.backend) return;
    try {
      const existing = await this.backend.getProfile(user.uid);
      const accountType = user.isAnonymous ? 'guest' : 'registered';
      if (!existing) {
        const name = this.meta.data.displayName ?? generateName(user.uid);
        await this.backend.setProfile(user.uid, { displayName: name, accountType }, false);
        this.meta.update({ displayName: name });
        this.set({ displayName: name });
      } else {
        if (existing.accountType !== accountType) await this.backend.setProfile(user.uid, { displayName: existing.displayName, accountType }, true);
        this.meta.update({ displayName: existing.displayName });
        this.set({ displayName: existing.displayName });
      }
    } catch {
      // A profile is a convenience: the default name is used until it can be read or written.
      const name = this.meta.data.displayName ?? generateName(user.uid);
      this.set({ displayName: name });
    }
  }

  async register(email: string, password: string): Promise<void> {
    const backend = this.need();
    this.meta.update({ autoGuest: true });
    const wasGuest = this.state.user?.isAnonymous === true;
    const user = await backend.register(email.trim(), password);
    this.set({ user, connection: 'account', message: null });
    this.meta.update({ uid: user.uid, ...(wasGuest ? {} : { base: null }) });
    try {
      await backend.sendVerification();
    } catch {
      /* the account exists; the verification mail can be re-sent from the profile */
    }
    await this.ensureProfile(user);
    void this.syncNow('register');
  }

  async signIn(email: string, password: string): Promise<void> {
    const backend = this.need();
    // Keep a copy of what is on this device before any account data can replace it.
    this.meta.addBackup('before-sign-in', this.store.snapshot());
    this.meta.update({ autoGuest: true });
    this.anonAttempted = true;
    const user = await backend.signIn(email.trim(), password);
    this.meta.update({ uid: user.uid, base: null });
    this.set({ user, connection: 'account', message: null });
    await this.ensureProfile(user);
    await this.syncNow('sign-in');
  }

  async signOut(): Promise<void> {
    const backend = this.need();
    if (this.debounce) clearTimeout(this.debounce);
    await backend.signOut();
    this.meta.update({ autoGuest: false, uid: null, base: null, pendingSince: null });
    this.conflictData = null;
    this.set({ user: null, connection: 'local', sync: 'idle', conflict: null, message: null });
  }

  /** Re-enables online play as a guest after signing out. */
  async playOnlineAsGuest(): Promise<void> {
    this.meta.update({ autoGuest: true });
    this.anonAttempted = false;
    await this.handleUser(null);
  }

  async sendPasswordReset(email: string): Promise<void> {
    await this.need().sendPasswordReset(email.trim());
  }

  async resendVerification(): Promise<void> {
    await this.need().sendVerification();
  }

  async refreshUser(): Promise<void> {
    const u = await this.need().reloadUser();
    if (u) this.set({ user: u });
  }

  async setDisplayName(raw: string): Promise<void> {
    const v = validateDisplayName(raw);
    if (!v.ok) throw new CloudError('unknown', v.message);
    const user = this.state.user;
    this.meta.update({ displayName: v.name });
    this.set({ displayName: v.name });
    if (!user || !this.backend) return;
    await this.backend.setProfile(user.uid, { displayName: v.name, accountType: user.isAnonymous ? 'guest' : 'registered' }, true);
  }

  /** Removes this player's online data (cloud save, leaderboard entries, profile). The account itself stays. */
  async deleteOnlineData(): Promise<void> {
    const backend = this.need();
    const uid = this.uid;
    if (!uid) throw new CloudError('not-configured', 'Not signed in.');
    await backend.deleteSave(uid);
    for (const id of LEVEL_IDS_FOR_CLEANUP) await backend.deleteEntry(id, uid).catch(() => undefined);
    this.meta.update({ base: null });
    this.set({ sync: 'idle', message: 'Your online progress and leaderboard entries were removed.' });
  }

  private need(): CloudBackend {
    if (!this.backend) throw new CloudError('not-configured', 'Online features are not available in this build.');
    return this.backend;
  }

  // -------------------------------------------------------------------------------------------- syncing

  /** Called after every local save. Cheap: it only schedules work when the shared part of the save has changed. */
  private localChanged(): void {
    if (!this.state.user) return;
    const p = toPayload(this.store.data);
    const base = this.meta.data.base;
    if (base && base.payload && JSON.stringify(p) === JSON.stringify(base.payload) && this.meta.data.pendingSince === null) return;
    if (this.meta.data.pendingSince === null) this.meta.update({ pendingSince: Date.now() });
    if (this.state.sync !== 'conflict') this.set({ sync: 'pending' });
    if (this.debounce) clearTimeout(this.debounce);
    this.debounce = setTimeout(() => void this.syncNow('change'), this.debounceMs);
  }

  /** Request an immediate sync (end of a mission, a purchase). Resolves when the attempt is over. */
  flush(): Promise<void> {
    if (this.debounce) clearTimeout(this.debounce);
    return this.syncNow('flush');
  }

  async syncNow(_reason: string): Promise<void> {
    const backend = this.backend;
    const user = this.state.user;
    if (!backend || !user) return;
    if (this.state.sync === 'conflict') return; // waiting for the player
    if (this.running) {
      this.rerun = true;
      return;
    }
    if (!this.isOnline()) {
      this.set({ online: false, sync: this.meta.data.pendingSince !== null ? 'pending' : this.state.sync === 'synced' ? 'synced' : 'idle' });
      return;
    }
    this.running = true;
    this.set({ sync: 'syncing', online: true });
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const stale = await this.syncOnce(backend, user);
        if (!stale) break;
      }
      this.retries = 0;
    } catch (e) {
      this.syncFailed(e);
    } finally {
      this.running = false;
      if (this.rerun) {
        this.rerun = false;
        void this.syncNow('rerun');
      }
    }
  }

  /** One read-decide-write pass. Returns true when the write lost a race and the pass should be repeated. */
  private async syncOnce(backend: CloudBackend, user: CloudUser): Promise<boolean> {
    const cloud = await backend.loadSave(user.uid);
    const local = toPayload(this.store.data);
    if (cloud === 'unreadable') {
      this.conflictData = { cloud: null, local, unreadable: true };
      this.set({
        sync: 'conflict',
        conflict: { kind: 'unreadable', local: summarise(local), cloud: null, canCombine: false, combineReason: null },
        message: 'The online copy of your progress could not be read, so it was left alone.',
      });
      return false;
    }
    const base = this.meta.data.base && this.meta.data.uid === user.uid ? this.meta.data.base : null;
    const d = decide(local, cloud, base);
    switch (d.kind) {
      case 'inSync':
        if (cloud) this.markSynced(cloud.payload, cloud.revision);
        else this.set({ sync: 'idle' });
        this.clearPending();
        return false;
      case 'upload': {
        const expected = cloud?.revision ?? 0;
        const r = await backend.writeSave(user.uid, local, expected, { deviceId: this.meta.data.deviceId, appVersion: this.appVersion });
        if (r === 'stale') return true;
        this.markSynced(local, expected + 1);
        this.clearPending();
        return false;
      }
      case 'download': {
        const snap = cloud as CloudSnapshot;
        this.meta.addBackup('before-cloud-download', this.store.snapshot());
        this.store.replaceData(applyPayload(this.store.data, snap.payload), 'cloud');
        this.markSynced(snap.payload, snap.revision);
        this.clearPending();
        this.notice('Progress restored from your account.');
        return false;
      }
      case 'conflict': {
        const snap = cloud as CloudSnapshot;
        const c = combine(local, snap.payload, base?.payload ?? null);
        this.conflictData = { cloud: snap, local, unreadable: false };
        this.set({
          sync: 'conflict',
          conflict: {
            kind: 'diverged',
            local: summarise(local),
            cloud: summarise(snap.payload),
            canCombine: c.ok,
            combineReason: c.ok ? null : c.reason,
          },
          message: null,
        });
        return false;
      }
    }
  }

  private markSynced(payload: SyncPayload, revision: number): void {
    const now = Date.now();
    this.meta.update({ base: { payload: structuredClone(payload), revision }, lastSyncedAt: now, uid: this.uid });
    this.set({ sync: 'synced', lastSyncedAt: now, message: null, conflict: null });
  }

  private clearPending(): void {
    if (this.meta.data.pendingSince !== null) this.meta.update({ pendingSince: null });
  }

  private syncFailed(e: unknown): void {
    const err = e instanceof CloudError ? e : null;
    if (err?.code === 'offline' || !this.isOnline()) {
      this.set({ sync: this.meta.data.pendingSince !== null ? 'pending' : 'idle', online: false, message: null });
      return;
    }
    if (this.meta.data.pendingSince === null) this.meta.update({ pendingSince: Date.now() });
    this.set({ sync: 'failed', message: err ? err.message : 'Could not sync your progress. It will be tried again.' });
    const wait = this.retryMs[Math.min(this.retries, this.retryMs.length - 1)];
    this.retries++;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => void this.syncNow('retry'), wait);
  }

  // ------------------------------------------------------------------------------------------- conflict

  /**
   * The player's choice when this device and the cloud have both changed (or the cloud copy is unreadable). A copy of
   * this device's save is kept first, and nothing happens until the player picks.
   */
  async resolveConflict(choice: ConflictChoice): Promise<void> {
    const backend = this.need();
    const user = this.state.user;
    const data = this.conflictData;
    if (!user || !data) return;
    this.meta.addBackup(`conflict-${choice}`, this.store.snapshot());
    this.set({ sync: 'syncing', conflict: null });
    this.running = true;
    try {
      if (data.unreadable) {
        if (choice !== 'device') {
          this.set({ sync: 'idle', message: 'Left the online copy alone.' });
          this.conflictData = null;
          return;
        }
        await backend.deleteSave(user.uid);
        const r = await backend.writeSave(user.uid, data.local, 0, { deviceId: this.meta.data.deviceId, appVersion: this.appVersion });
        if (r === 'ok') this.markSynced(data.local, 1);
        this.clearPending();
        this.conflictData = null;
        return;
      }
      const snap = data.cloud as CloudSnapshot;
      if (choice === 'cloud') {
        this.store.replaceData(applyPayload(this.store.data, snap.payload), 'cloud');
        this.markSynced(snap.payload, snap.revision);
        this.notice('Using the progress from your account.');
      } else {
        let payload = data.local;
        if (choice === 'combine') {
          const base = this.meta.data.base && this.meta.data.uid === user.uid ? this.meta.data.base.payload : null;
          const c = combine(data.local, snap.payload, base);
          if (!c.ok) throw new CloudError('unknown', c.reason);
          payload = c.payload;
          this.store.replaceData(applyPayload(this.store.data, payload), 'cloud');
        }
        const r = await backend.writeSave(user.uid, payload, snap.revision, { deviceId: this.meta.data.deviceId, appVersion: this.appVersion });
        if (r === 'stale') {
          // The cloud moved on while the player was deciding: start over with the new state.
          this.conflictData = null;
          this.running = false;
          this.set({ sync: 'idle' });
          await this.syncNow('resolve-stale');
          return;
        }
        this.markSynced(payload, snap.revision + 1);
        this.notice(choice === 'combine' ? 'Combined both saves.' : 'Your progress on this device is now saved to your account.');
      }
      this.clearPending();
      this.conflictData = null;
    } catch (e) {
      this.running = false;
      this.syncFailed(e);
      // The player has to choose again.
      if (this.conflictData) this.set({ sync: 'conflict', conflict: this.rebuildConflict() });
    } finally {
      this.running = false;
    }
  }

  private rebuildConflict(): ConflictInfo | null {
    const d = this.conflictData;
    if (!d) return null;
    if (d.unreadable || !d.cloud) return { kind: 'unreadable', local: summarise(d.local), cloud: null, canCombine: false, combineReason: null };
    const c = combine(d.local, d.cloud.payload, this.meta.data.base?.payload ?? null);
    return { kind: 'diverged', local: summarise(d.local), cloud: summarise(d.cloud.payload), canCombine: c.ok, combineReason: c.ok ? null : c.reason };
  }
}
