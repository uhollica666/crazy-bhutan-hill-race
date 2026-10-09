import { CloudError } from '../../src/cloud/types';
import type {
  CloudBackend,
  CloudProfile,
  CloudSaveDoc,
  CloudUser,
  FeedbackDoc,
  LeaderboardEntryDoc,
  TelemetryDoc,
} from '../../src/cloud/types';
import type { SyncPayload } from '../../src/cloud/payload';

interface Account {
  uid: string;
  email: string | null;
  password: string | null;
  anonymous: boolean;
  verified: boolean;
}

/**
 * A faithful in-memory stand-in for Firebase: accounts with linking, a revision-checked save, a leaderboard that
 * only accepts faster times, create-only feedback, and a switch that makes everything fail as if offline.
 */
export class FakeBackend implements CloudBackend {
  readonly emulated = true;
  online = true;
  /** Make the next calls fail with this error code once (for retry tests). */
  failNext: { code: 'unknown' | 'permission-denied'; times: number } | null = null;
  readonly accounts = new Map<string, Account>();
  readonly profiles = new Map<string, CloudProfile>();
  readonly saves = new Map<string, CloudSaveDoc | 'unreadable'>();
  readonly entries = new Map<string, LeaderboardEntryDoc>();
  readonly feedback = new Map<string, FeedbackDoc>();
  readonly telemetry = new Map<string, TelemetryDoc>();
  readonly calls: Record<string, number> = {};
  /** The persisted session, as Firebase keeps one between page loads. */
  current: Account | null = null;
  private nextUid = 1;
  private listener: ((u: CloudUser | null) => void) | null = null;
  /** Hold feedback submissions until released (to test "pending" versus "delivered"). */
  holdFeedback: Promise<void> | null = null;

  private count(name: string): void {
    this.calls[name] = (this.calls[name] ?? 0) + 1;
  }

  private gate(name: string): void {
    this.count(name);
    if (!this.online) throw new CloudError('offline', 'offline');
    if (this.failNext && this.failNext.times > 0) {
      this.failNext.times--;
      throw new CloudError(this.failNext.code, 'injected failure');
    }
  }

  private user(a: Account | null): CloudUser | null {
    return a ? { uid: a.uid, isAnonymous: a.anonymous, email: a.email, emailVerified: a.verified } : null;
  }

  private emit(): void {
    const u = this.user(this.current);
    queueMicrotask(() => this.listener?.(u));
  }

  watchAuth(onUser: (u: CloudUser | null) => void): () => void {
    this.listener = onUser;
    this.emit();
    return () => {
      this.listener = null;
    };
  }

  async signInAnonymously(): Promise<CloudUser> {
    this.gate('signInAnonymously');
    const a: Account = { uid: `anon-${this.nextUid++}`, email: null, password: null, anonymous: true, verified: false };
    this.accounts.set(a.uid, a);
    this.current = a;
    this.emit();
    return this.user(a) as CloudUser;
  }

  async register(email: string, password: string): Promise<CloudUser> {
    this.gate('register');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new CloudError('invalid-email', 'bad email');
    if (password.length < 6) throw new CloudError('weak-password', 'weak');
    if ([...this.accounts.values()].some((a) => a.email === email)) throw new CloudError('email-in-use', 'in use');
    if (this.current?.anonymous) {
      Object.assign(this.current, { email, password, anonymous: false });
      this.emit();
      return this.user(this.current) as CloudUser;
    }
    const a: Account = { uid: `user-${this.nextUid++}`, email, password, anonymous: false, verified: false };
    this.accounts.set(a.uid, a);
    this.current = a;
    this.emit();
    return this.user(a) as CloudUser;
  }

  async signIn(email: string, password: string): Promise<CloudUser> {
    this.gate('signIn');
    const a = [...this.accounts.values()].find((x) => x.email === email && x.password === password);
    if (!a) throw new CloudError('wrong-credentials', 'wrong');
    this.current = a;
    this.emit();
    return this.user(a) as CloudUser;
  }

  async signOut(): Promise<void> {
    this.count('signOut');
    this.current = null;
    this.emit();
  }

  async sendPasswordReset(email: string): Promise<void> {
    this.gate('sendPasswordReset');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new CloudError('invalid-email', 'bad email');
  }

  async sendVerification(): Promise<void> {
    this.gate('sendVerification');
  }

  async reloadUser(): Promise<CloudUser | null> {
    this.gate('reloadUser');
    return this.user(this.current);
  }

  async getProfile(uid: string): Promise<CloudProfile | null> {
    this.gate('getProfile');
    return this.profiles.get(uid) ?? null;
  }

  async setProfile(uid: string, profile: CloudProfile): Promise<void> {
    this.gate('setProfile');
    this.profiles.set(uid, { ...profile });
  }

  async loadSave(uid: string): Promise<CloudSaveDoc | 'unreadable' | null> {
    this.gate('loadSave');
    const s = this.saves.get(uid);
    return s === 'unreadable' ? 'unreadable' : s ? structuredClone(s) : null;
  }

  async writeSave(uid: string, payload: SyncPayload, expectedRevision: number): Promise<'ok' | 'stale'> {
    this.gate('writeSave');
    const stored = this.saves.get(uid);
    const revision = stored && stored !== 'unreadable' ? stored.revision : 0;
    if (stored === 'unreadable' || revision !== expectedRevision) return 'stale';
    this.saves.set(uid, { payload: structuredClone(payload), revision: revision + 1 });
    return 'ok';
  }

  async deleteSave(uid: string): Promise<void> {
    this.gate('deleteSave');
    this.saves.delete(uid);
  }

  async topEntries(levelId: string, max: number): Promise<LeaderboardEntryDoc[]> {
    this.gate('topEntries');
    return [...this.entries.values()]
      .filter((e) => e.levelId === levelId)
      .sort((a, b) => a.timeMs - b.timeMs)
      .slice(0, Math.min(100, max))
      .map((e) => ({ ...e }));
  }

  async myEntry(levelId: string, uid: string): Promise<LeaderboardEntryDoc | null> {
    this.gate('myEntry');
    return this.entries.get(`${levelId}/${uid}`) ?? null;
  }

  async countFaster(levelId: string, timeMs: number): Promise<number> {
    this.gate('countFaster');
    return Math.min(100, [...this.entries.values()].filter((e) => e.levelId === levelId && e.timeMs < timeMs).length);
  }

  async submitEntry(entry: LeaderboardEntryDoc): Promise<'ok' | 'slower'> {
    this.gate('submitEntry');
    const key = `${entry.levelId}/${entry.uid}`;
    const old = this.entries.get(key);
    if (old && old.timeMs <= entry.timeMs) return 'slower';
    this.entries.set(key, { ...entry });
    return 'ok';
  }

  async deleteEntry(levelId: string, uid: string): Promise<void> {
    this.gate('deleteEntry');
    this.entries.delete(`${levelId}/${uid}`);
  }

  async submitFeedback(id: string, doc: FeedbackDoc): Promise<void> {
    this.gate('submitFeedback');
    if (!this.current) throw new CloudError('not-configured', 'not signed in');
    if (this.holdFeedback) await this.holdFeedback;
    if (!this.online) throw new CloudError('offline', 'offline');
    if (this.feedback.has(id)) throw new CloudError('permission-denied', 'exists');
    this.feedback.set(id, { ...doc, uid: this.current.uid, submissionId: id });
  }

  async submitTelemetry(id: string, doc: TelemetryDoc): Promise<void> {
    this.gate('submitTelemetry');
    if (!this.current) throw new CloudError('not-configured', 'not signed in');
    if (this.telemetry.has(id)) throw new CloudError('permission-denied', 'exists');
    this.telemetry.set(id, { ...doc, uid: this.current.uid, sessionId: id });
  }

  async dispose(): Promise<void> {
    this.listener = null;
  }
}
