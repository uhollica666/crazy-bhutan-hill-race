import type { FirebaseApp } from 'firebase/app';
import type { Auth, User } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import type { CloudConfig } from './config';
import { parseCloudSave } from './payload';
import type { SyncPayload } from './payload';
import { CloudError } from './types';
import type {
  CloudBackend,
  CloudProfile,
  CloudSaveDoc,
  CloudUser,
  FeedbackDoc,
  LeaderboardEntryDoc,
  TelemetryDoc,
} from './types';

type AuthMod = typeof import('firebase/auth');
type FsMod = typeof import('firebase/firestore');

interface Sdk {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  A: AuthMod;
  F: FsMod;
}

const SCHEMA = 1;

/** Maps SDK error codes to the few failures the game distinguishes, with wording fit for a player. */
export function mapError(e: unknown): CloudError {
  if (e instanceof CloudError) return e;
  const code = String((e as { code?: unknown })?.code ?? '');
  const net = code === 'auth/network-request-failed' || code === 'unavailable' || code === 'deadline-exceeded' || code === 'failed-precondition';
  if (net || (e instanceof TypeError && /fetch|network/i.test(e.message))) {
    return new CloudError('offline', 'Cannot reach the online service right now. The game keeps working offline.', code);
  }
  switch (code) {
    case 'auth/email-already-in-use':
    case 'auth/credential-already-in-use':
      return new CloudError('email-in-use', 'That email address already has an account. Sign in instead, or use a different address.', code);
    case 'auth/invalid-email':
    case 'auth/missing-email':
      return new CloudError('invalid-email', 'That does not look like an email address.', code);
    case 'auth/weak-password':
      return new CloudError('weak-password', 'Please choose a stronger password (at least 6 characters; longer is better).', code);
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
      return new CloudError('wrong-credentials', 'The email address or password is not right.', code);
    case 'auth/too-many-requests':
      return new CloudError('too-many-requests', 'Too many attempts. Please wait a few minutes and try again.', code);
    case 'auth/requires-recent-login':
      return new CloudError('requires-recent-login', 'For your security, please sign in again and retry.', code);
    case 'auth/user-disabled':
      return new CloudError('user-disabled', 'This account has been disabled.', code);
    case 'permission-denied':
      return new CloudError('permission-denied', 'The online service did not accept that.', code);
    default:
      return new CloudError('unknown', 'Something went wrong with the online service.', code || undefined);
  }
}

const toUser = (u: User | null): CloudUser | null =>
  u ? { uid: u.uid, isAnonymous: u.isAnonymous, email: u.email, emailVerified: u.emailVerified } : null;

/**
 * The real backend: the modular Firebase SDK, loaded on first use (`init`), so the game starts, plays and saves
 * without it. Auth and Firestore are separate dynamic imports; Analytics is not imported here at all.
 *
 * Firestore uses the in-memory cache only. That is deliberate: the game's reliable offline save is the local save
 * layer, and a persistent Firestore cache would blur "written locally" and "delivered" (the feedback form must never
 * claim delivery on the strength of a cache write).
 */
export class FirebaseBackend implements CloudBackend {
  private sdk: Promise<Sdk> | null = null;
  private unsubAuth: (() => void) | null = null;
  private readonly inflight = new Map<string, Promise<void>>();

  constructor(private readonly cfg: CloudConfig, private readonly appName = 'cbhr') {}

  get emulated(): boolean {
    return this.cfg.useEmulators;
  }

  private init(): Promise<Sdk> {
    this.sdk ??= (async () => {
      const [{ initializeApp }, A, F] = await Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/firestore')]);
      const app = initializeApp(this.cfg.firebase, this.appName);
      if (this.cfg.appCheckSiteKey && !this.cfg.useEmulators) {
        // Only when a site key has been configured in the Firebase Console and supplied through VITE_APPCHECK_SITE_KEY.
        const AC = await import('firebase/app-check');
        AC.initializeAppCheck(app, { provider: new AC.ReCaptchaV3Provider(this.cfg.appCheckSiteKey), isTokenAutoRefreshEnabled: true });
      }
      const auth = A.getAuth(app);
      const db = F.initializeFirestore(app, { localCache: F.memoryLocalCache(), experimentalAutoDetectLongPolling: true });
      if (this.cfg.useEmulators) {
        A.connectAuthEmulator(auth, `http://${this.cfg.emulatorHost}:${this.cfg.authEmulatorPort}`, { disableWarnings: true });
        F.connectFirestoreEmulator(db, this.cfg.emulatorHost, this.cfg.firestoreEmulatorPort);
      }
      return { app, auth, db, A, F };
    })();
    return this.sdk;
  }

  watchAuth(onUser: (u: CloudUser | null) => void, onError: (e: unknown) => void): () => void {
    let cancelled = false;
    void this.init()
      .then(({ auth, A }) => {
        if (cancelled) return;
        this.unsubAuth = A.onAuthStateChanged(auth, (u) => onUser(toUser(u)), onError);
      })
      .catch(onError);
    return () => {
      cancelled = true;
      this.unsubAuth?.();
      this.unsubAuth = null;
    };
  }

  private async wrap<T>(fn: (s: Sdk) => Promise<T>): Promise<T> {
    try {
      return await fn(await this.init());
    } catch (e) {
      throw mapError(e);
    }
  }

  signInAnonymously(): Promise<CloudUser> {
    return this.wrap(async ({ auth, A }) => toUser((await A.signInAnonymously(auth)).user) as CloudUser);
  }

  register(email: string, password: string): Promise<CloudUser> {
    return this.wrap(async ({ auth, A }) => {
      const current = auth.currentUser;
      if (current?.isAnonymous) {
        // Keep the uid: the guest account is upgraded in place, so its cloud progress stays attached.
        const cred = A.EmailAuthProvider.credential(email, password);
        return toUser((await A.linkWithCredential(current, cred)).user) as CloudUser;
      }
      return toUser((await A.createUserWithEmailAndPassword(auth, email, password)).user) as CloudUser;
    });
  }

  signIn(email: string, password: string): Promise<CloudUser> {
    return this.wrap(async ({ auth, A }) => toUser((await A.signInWithEmailAndPassword(auth, email, password)).user) as CloudUser);
  }

  signOut(): Promise<void> {
    return this.wrap(async ({ auth, A }) => A.signOut(auth));
  }

  sendPasswordReset(email: string): Promise<void> {
    return this.wrap(async ({ auth, A }) => A.sendPasswordResetEmail(auth, email));
  }

  sendVerification(): Promise<void> {
    return this.wrap(async ({ auth, A }) => {
      if (auth.currentUser && !auth.currentUser.isAnonymous) await A.sendEmailVerification(auth.currentUser);
    });
  }

  reloadUser(): Promise<CloudUser | null> {
    return this.wrap(async ({ auth }) => {
      if (!auth.currentUser) return null;
      await auth.currentUser.reload();
      return toUser(auth.currentUser);
    });
  }

  // ------------------------------------------------------------------------------------------- profile

  getProfile(uid: string): Promise<CloudProfile | null> {
    return this.wrap(async ({ db, F }) => {
      const snap = await F.getDoc(F.doc(db, 'players', uid));
      if (!snap.exists()) return null;
      const d = snap.data() as Partial<CloudProfile>;
      return typeof d.displayName === 'string' ? { displayName: d.displayName, accountType: d.accountType === 'registered' ? 'registered' : 'guest' } : null;
    });
  }

  setProfile(uid: string, profile: CloudProfile, exists: boolean): Promise<void> {
    return this.wrap(async ({ db, F }) => {
      const ref = F.doc(db, 'players', uid);
      if (exists) {
        await F.updateDoc(ref, { schema: SCHEMA, displayName: profile.displayName, accountType: profile.accountType, updatedAt: F.serverTimestamp() });
      } else {
        await F.setDoc(ref, { schema: SCHEMA, displayName: profile.displayName, accountType: profile.accountType, createdAt: F.serverTimestamp(), updatedAt: F.serverTimestamp() });
      }
    });
  }

  // ------------------------------------------------------------------------------------------- saves

  loadSave(uid: string): Promise<CloudSaveDoc | 'unreadable' | null> {
    return this.wrap(async ({ db, F }) => {
      const snap = await F.getDoc(F.doc(db, 'players', uid, 'saves', 'current'));
      if (!snap.exists()) return null;
      return parseCloudSave(snap.data());
    });
  }

  writeSave(uid: string, payload: SyncPayload, expectedRevision: number, meta: { deviceId: string; appVersion: string }): Promise<'ok' | 'stale'> {
    return this.wrap(async ({ db, F }) => {
      const ref = F.doc(db, 'players', uid, 'saves', 'current');
      const body = JSON.parse(JSON.stringify(payload)) as SyncPayload;
      return F.runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        const stored = snap.exists() ? Number((snap.data() as { revision?: unknown }).revision) || 0 : 0;
        if (stored !== expectedRevision) return 'stale' as const;
        tx.set(ref, {
          schema: SCHEMA,
          uid,
          revision: expectedRevision + 1,
          updatedAt: F.serverTimestamp(),
          clientUpdatedAt: Date.now(),
          deviceId: meta.deviceId,
          appVersion: meta.appVersion,
          progress: body.progress,
          garage: body.garage,
          wallet: body.wallet,
          stats: body.stats,
          story: body.story,
          prefs: body.prefs,
        });
        return 'ok' as const;
      });
    });
  }

  deleteSave(uid: string): Promise<void> {
    return this.wrap(async ({ db, F }) => F.deleteDoc(F.doc(db, 'players', uid, 'saves', 'current')));
  }

  // --------------------------------------------------------------------------------------- leaderboard

  private entries(s: Sdk, levelId: string) {
    return s.F.collection(s.db, 'leaderboards', levelId, 'entries');
  }

  private static toEntry(d: Record<string, unknown>): LeaderboardEntryDoc {
    return {
      uid: String(d.uid),
      levelId: String(d.levelId),
      timeMs: Number(d.timeMs),
      vehicleId: String(d.vehicleId),
      conditions: String(d.conditions),
      displayName: String(d.displayName),
      medal: String(d.medal),
      comfort: typeof d.comfort === 'number' ? d.comfort : null,
      clientAt: Number(d.clientAt) || 0,
    };
  }

  topEntries(levelId: string, max: number): Promise<LeaderboardEntryDoc[]> {
    return this.wrap(async (s) => {
      const q = s.F.query(this.entries(s, levelId), s.F.orderBy('timeMs', 'asc'), s.F.limit(Math.min(100, Math.max(1, max))));
      return (await s.F.getDocs(q)).docs.map((d) => FirebaseBackend.toEntry(d.data()));
    });
  }

  myEntry(levelId: string, uid: string): Promise<LeaderboardEntryDoc | null> {
    return this.wrap(async (s) => {
      const snap = await s.F.getDoc(s.F.doc(s.db, 'leaderboards', levelId, 'entries', uid));
      return snap.exists() ? FirebaseBackend.toEntry(snap.data()) : null;
    });
  }

  countFaster(levelId: string, timeMs: number): Promise<number> {
    return this.wrap(async (s) => {
      // Bounded to 100 (the rules refuse unbounded lists): a rank beyond 100 is shown as "100+".
      const q = s.F.query(this.entries(s, levelId), s.F.where('timeMs', '<', timeMs), s.F.limit(100));
      return (await s.F.getCountFromServer(q)).data().count;
    });
  }

  submitEntry(entry: LeaderboardEntryDoc, appVersion: string): Promise<'ok' | 'slower'> {
    return this.wrap(async ({ db, F }) => {
      const ref = F.doc(db, 'leaderboards', entry.levelId, 'entries', entry.uid);
      return F.runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (snap.exists() && Number((snap.data() as { timeMs?: unknown }).timeMs) <= entry.timeMs) return 'slower' as const;
        tx.set(ref, { schema: SCHEMA, ...entry, appVersion, submittedAt: F.serverTimestamp() });
        return 'ok' as const;
      });
    });
  }

  deleteEntry(levelId: string, uid: string): Promise<void> {
    return this.wrap(async ({ db, F }) => F.deleteDoc(F.doc(db, 'leaderboards', levelId, 'entries', uid)));
  }

  // ------------------------------------------------------------------------------- feedback, telemetry

  /**
   * Sends a create-only document and resolves when the server has accepted it. A write made while offline stays
   * queued in memory and its promise stays pending, so a pending promise is never reported as delivery. Callers
   * wrap this in a timeout and keep the draft until it resolves.
   */
  private sendCreateOnly(collectionName: string, id: string, body: Record<string, unknown>, idField: string): Promise<void> {
    const existing = this.inflight.get(`${collectionName}/${id}`);
    if (existing) return existing;
    const p = this.wrap(async ({ auth, db, F }) => {
      const user = auth.currentUser;
      if (!user) throw new CloudError('not-configured', 'Not connected yet.');
      await F.setDoc(F.doc(db, collectionName, id), {
        ...body,
        schema: SCHEMA,
        uid: user.uid,
        [idField]: id,
        ...(collectionName === 'feedback' ? { createdAt: F.serverTimestamp() } : {}),
      });
    });
    this.inflight.set(`${collectionName}/${id}`, p);
    const done = (): void => void this.inflight.delete(`${collectionName}/${id}`);
    p.then(done, done);
    return p;
  }

  submitFeedback(id: string, doc: FeedbackDoc): Promise<void> {
    return this.sendCreateOnly('feedback', id, doc, 'submissionId');
  }

  submitTelemetry(id: string, doc: TelemetryDoc): Promise<void> {
    return this.sendCreateOnly('telemetrySessions', id, doc, 'sessionId');
  }

  async dispose(): Promise<void> {
    this.unsubAuth?.();
    this.unsubAuth = null;
    const s = await this.sdk?.catch(() => null);
    this.sdk = null;
    if (!s) return;
    await s.F.terminate(s.db).catch(() => undefined);
    const { deleteApp } = await import('firebase/app');
    await deleteApp(s.app).catch(() => undefined);
  }
}
