import type { SyncPayload } from './payload';

// ------------------------------------------------------------------------------------------ identity

export interface CloudUser {
  uid: string;
  isAnonymous: boolean;
  email: string | null;
  emailVerified: boolean;
}

/** Network and identity, from the game's point of view. */
export type ConnectionState =
  | 'disabled' //   cloud features are switched off in this build
  | 'local' //      playing locally: no online identity (signed out, or the service is unreachable)
  | 'offline' //    no network, or Firebase could not be reached: the game is fully playable
  | 'connecting' // signing in / restoring the session
  | 'guest' //      connected with an anonymous Firebase identity
  | 'account'; //   connected with an e-mail account

/** Progress sync, shown as a small status. */
export type SyncState =
  | 'idle' //       nothing to do (signed out, or nothing has changed)
  | 'pending' //    local changes are waiting for a connection
  | 'syncing'
  | 'synced'
  | 'failed' //     the last attempt failed; it will be retried
  | 'conflict'; //  this device and the cloud have both changed: the player has to choose

export type CloudErrorCode =
  | 'offline'
  | 'invalid-email'
  | 'weak-password'
  | 'wrong-credentials'
  | 'email-in-use'
  | 'too-many-requests'
  | 'requires-recent-login'
  | 'user-disabled'
  | 'permission-denied'
  | 'stale'
  | 'not-configured'
  | 'unknown';

export class CloudError extends Error {
  constructor(
    readonly code: CloudErrorCode,
    message: string,
    /** The underlying SDK error code, for logs and tests (never shown to players). */
    readonly sdkCode?: string,
  ) {
    super(message);
    this.name = 'CloudError';
  }
}

// ------------------------------------------------------------------------------------------ documents

export interface CloudProfile {
  displayName: string;
  accountType: 'guest' | 'registered';
}

export interface CloudSaveDoc {
  payload: SyncPayload;
  revision: number;
}

export interface LeaderboardEntryDoc {
  uid: string;
  levelId: string;
  timeMs: number;
  vehicleId: string;
  conditions: string;
  displayName: string;
  medal: string;
  comfort: number | null;
  clientAt: number;
}

/** Document bodies are built by the callers; the backend adds server timestamps and the schema marker. */
export type FeedbackDoc = Record<string, unknown>;
export type TelemetryDoc = Record<string, unknown>;

// ------------------------------------------------------------------------------------------- backend

/**
 * Everything the game needs from Firebase, behind one interface. `FirebaseBackend` implements it with the modular
 * SDK (loaded lazily, so the game starts without it); tests use an in-memory fake. Nothing else in the game
 * imports the SDK.
 */
export interface CloudBackend {
  readonly emulated: boolean;
  /** Starts listening for the identity (restores a persisted session, if any). */
  watchAuth(onUser: (u: CloudUser | null) => void, onError: (e: unknown) => void): () => void;
  signInAnonymously(): Promise<CloudUser>;
  /** Creates an e-mail account; when the current user is a guest the credential is LINKED so the uid is kept. */
  register(email: string, password: string): Promise<CloudUser>;
  signIn(email: string, password: string): Promise<CloudUser>;
  signOut(): Promise<void>;
  sendPasswordReset(email: string): Promise<void>;
  sendVerification(): Promise<void>;
  reloadUser(): Promise<CloudUser | null>;

  getProfile(uid: string): Promise<CloudProfile | null>;
  setProfile(uid: string, profile: CloudProfile, exists: boolean): Promise<void>;

  /** 'unreadable': a document exists but cannot be understood (corrupt, or written by a newer game). */
  loadSave(uid: string): Promise<CloudSaveDoc | 'unreadable' | null>;
  /**
   * Writes the save as `expectedRevision + 1` inside a transaction. Resolves 'stale' (and writes nothing) when the
   * stored revision is not `expectedRevision` any more.
   */
  writeSave(uid: string, payload: SyncPayload, expectedRevision: number, meta: { deviceId: string; appVersion: string }): Promise<'ok' | 'stale'>;
  deleteSave(uid: string): Promise<void>;

  topEntries(levelId: string, max: number): Promise<LeaderboardEntryDoc[]>;
  myEntry(levelId: string, uid: string): Promise<LeaderboardEntryDoc | null>;
  /** Number of entries strictly faster than `timeMs`, from a server-side count (1 read per 1000 counted). */
  countFaster(levelId: string, timeMs: number): Promise<number>;
  /** Writes (or improves) the player's entry. Resolves 'slower' when a faster one is already stored. */
  submitEntry(entry: LeaderboardEntryDoc, appVersion: string): Promise<'ok' | 'slower'>;
  deleteEntry(levelId: string, uid: string): Promise<void>;

  /** Resolves only after the SERVER has accepted the document (never on a local-cache write). */
  submitFeedback(id: string, doc: FeedbackDoc): Promise<void>;
  submitTelemetry(id: string, doc: TelemetryDoc): Promise<void>;

  /** Releases listeners and the SDK instance (tests). */
  dispose(): Promise<void>;
}
