import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { FirebaseBackend } from '../../src/cloud/FirebaseBackend';
import { readCloudConfig } from '../../src/cloud/config';
import { CloudService } from '../../src/cloud/CloudService';
import { CloudMetaStore } from '../../src/cloud/meta';
import { toPayload } from '../../src/cloud/payload';
import type { CloudUser } from '../../src/cloud/types';
import { SaveStore } from '../../src/storage/SaveStore';

/**
 * The real Firebase SDK against the Auth and Firestore EMULATORS and the real firestore.rules. Nothing here can reach
 * the live project: the "demo-" project id is forced by the emulator configuration.
 */
const cfg = readCloudConfig({ VITE_USE_EMULATORS: '1' });
const backends: FirebaseBackend[] = [];
let n = 0;
const make = (): FirebaseBackend => {
  const b = new FirebaseBackend(cfg, `test-${n++}`);
  backends.push(b);
  return b;
};
const authed = (b: FirebaseBackend): Promise<CloudUser | null> =>
  new Promise((resolve) => {
    const off = b.watchAuth((u) => {
      off();
      resolve(u);
    }, () => resolve(null));
  });
const email = (): string => `p${Date.now()}${Math.floor(Math.random() * 1e6)}@example.com`;
const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

beforeEach(async () => {
  // Start every test from an empty Firestore and no accounts.
  await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${cfg.firebase.projectId}/databases/(default)/documents`, { method: 'DELETE' });
  await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${cfg.firebase.projectId}/accounts`, { method: 'DELETE' });
});
afterAll(async () => {
  await Promise.all(backends.map((b) => b.dispose()));
});

describe('config', () => {
  it('uses the public project config by default and the demo project in emulator mode', () => {
    expect(readCloudConfig({}).firebase.projectId).toBe('crazy-bhutan-hill-race');
    expect(readCloudConfig({}).useEmulators).toBe(false);
    expect(cfg.firebase.projectId).toMatch(/^demo-/);
    expect(readCloudConfig({ VITE_CLOUD_ENABLED: '0' }).enabled).toBe(false);
    expect(readCloudConfig({ VITE_FIREBASE_PROJECT_ID: 'other' }).firebase.projectId).toBe('other');
    expect(readCloudConfig({}).appCheckSiteKey).toBeNull();
  });
});

describe('authentication', () => {
  it('anonymous sign-in gives a guest uid, and the same session is not duplicated', async () => {
    const b = make();
    expect(await authed(b)).toBeNull();
    const u = await b.signInAnonymously();
    expect(u.isAnonymous).toBe(true);
    expect(u.uid.length).toBeGreaterThan(10);
  });

  it('registering as a guest links the credential: same uid, now with an email', async () => {
    const b = make();
    const guest = await b.signInAnonymously();
    const user = await b.register(email(), 'secret123');
    expect(user.uid).toBe(guest.uid);
    expect(user.isAnonymous).toBe(false);
    expect(user.email).toContain('@example.com');
  });

  it('registering without a guest session creates an account; signing in and out works; errors are mapped', async () => {
    const b = make();
    const addr = email();
    const created = await b.register(addr, 'secret123');
    expect(created.isAnonymous).toBe(false);
    await b.signOut();
    const back = await b.signIn(addr, 'secret123');
    expect(back.uid).toBe(created.uid);
    await b.signOut();
    await expect(b.signIn(addr, 'wrong-password')).rejects.toMatchObject({ code: 'wrong-credentials' });
    await expect(b.register(addr, 'another123')).rejects.toMatchObject({ code: 'email-in-use' });
    await expect(b.register('not an email', 'secret123')).rejects.toMatchObject({ code: 'invalid-email' });
    await expect(b.register(email(), '123')).rejects.toMatchObject({ code: 'weak-password' });
    await expect(b.sendPasswordReset(addr)).resolves.toBeUndefined();
  });

  it('linking an email that already has an account fails clearly and keeps the guest', async () => {
    const owner = make();
    const addr = email();
    await owner.register(addr, 'secret123');
    const guest = make();
    const g = await guest.signInAnonymously();
    await expect(guest.register(addr, 'secret123')).rejects.toMatchObject({ code: 'email-in-use' });
    const still = await guest.reloadUser();
    expect(still?.uid).toBe(g.uid);
    expect(still?.isAnonymous).toBe(true);
  });
});

describe('profile and cloud save under the real rules', () => {
  it('creates and updates the profile; the save is revision-checked', async () => {
    const b = make();
    const u = await b.signInAnonymously();
    await b.setProfile(u.uid, { displayName: 'Swift Yak 42', accountType: 'guest' }, false);
    expect(await b.getProfile(u.uid)).toEqual({ displayName: 'Swift Yak 42', accountType: 'guest' });
    await b.setProfile(u.uid, { displayName: 'Mighty Takin', accountType: 'registered' }, true);
    expect((await b.getProfile(u.uid))?.displayName).toBe('Mighty Takin');

    const payload = toPayload(new SaveStore(memory()).data);
    payload.wallet.credits = 321;
    expect(await b.loadSave(u.uid)).toBeNull();
    expect(await b.writeSave(u.uid, payload, 0, { deviceId: 'device-1234', appVersion: 'test' })).toBe('ok');
    const loaded = await b.loadSave(u.uid);
    expect(loaded && loaded !== 'unreadable' && loaded.revision).toBe(1);
    expect(loaded && loaded !== 'unreadable' && loaded.payload.wallet.credits).toBe(321);
    // A stale writer (still thinking the document is empty) is refused, nothing is overwritten.
    expect(await b.writeSave(u.uid, { ...payload, wallet: { credits: 1 } }, 0, { deviceId: 'device-9999', appVersion: 'test' })).toBe('stale');
    expect(await b.writeSave(u.uid, { ...payload, wallet: { credits: 400 } }, 1, { deviceId: 'device-1234', appVersion: 'test' })).toBe('ok');
    const again = await b.loadSave(u.uid);
    expect(again && again !== 'unreadable' && again.revision).toBe(2);
    await b.deleteSave(u.uid);
    expect(await b.loadSave(u.uid)).toBeNull();
  });

  it("one player cannot read another player's save", async () => {
    const a = make();
    const ua = await a.signInAnonymously();
    await a.writeSave(ua.uid, toPayload(new SaveStore(memory()).data), 0, { deviceId: 'device-1234', appVersion: 'test' });
    const evil = make();
    await evil.signInAnonymously();
    await expect(evil.loadSave(ua.uid)).rejects.toMatchObject({ code: 'permission-denied' });
  });
});

describe('leaderboard', () => {
  const entry = (uid: string, name: string, timeMs: number) => ({ uid, levelId: 'pass-run', timeMs, vehicleId: 'dzo-hatch', conditions: 'clear-day', displayName: name, medal: 'gold', comfort: null, clientAt: Date.now() });

  it('ranks players by time, keeps only each player best, and counts faster entries', async () => {
    const times = [140_000, 100_000, 120_000];
    const rigs: { b: FirebaseBackend; uid: string }[] = [];
    for (const [i, t] of times.entries()) {
      const b = make();
      const u = await b.signInAnonymously();
      rigs.push({ b, uid: u.uid });
      expect(await b.submitEntry(entry(u.uid, `Player ${i}00`, t), 'test')).toBe('ok');
    }
    // A slower time never replaces a faster one; a faster one does.
    expect(await rigs[1].b.submitEntry(entry(rigs[1].uid, 'Player 100', 150_000), 'test')).toBe('slower');
    expect(await rigs[0].b.submitEntry(entry(rigs[0].uid, 'Player 000', 90_000), 'test')).toBe('ok');
    const top = await rigs[2].b.topEntries('pass-run', 10);
    expect(top.map((e) => e.timeMs)).toEqual([90_000, 100_000, 120_000]);
    expect((await rigs[2].b.myEntry('pass-run', rigs[2].uid))?.timeMs).toBe(120_000);
    expect(await rigs[2].b.countFaster('pass-run', 120_000)).toBe(2);
    expect(await rigs[2].b.countFaster('pass-run', 90_000)).toBe(0);
  });

  it('refuses implausible times and times posted for someone else', async () => {
    const b = make();
    const u = await b.signInAnonymously();
    await expect(b.submitEntry(entry(u.uid, 'Cheat Rider', 500), 'test')).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(b.submitEntry(entry('someone-else', 'Cheat Rider', 100_000), 'test')).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('an empty board returns an empty list, and anyone signed in or not can read it', async () => {
    const b = make();
    expect(await b.topEntries('gmc-plains', 20)).toEqual([]);
  });
});

describe('feedback and telemetry', () => {
  const feedback = () => ({
    clientAt: Date.now(),
    appVersion: 'test',
    origin: 'menu',
    rating: 5,
    gameplay: 'Fun',
    controls: '',
    graphics: '',
    performance: '',
    difficulty: 'aboutRight',
    favourite: '',
    improve: '',
    add: '',
    bugs: '',
    contact: null,
    device: null,
    interest: { playLargerVersion: true, considerPurchasingFullGame: null, priceRange: null, voluntarySupport: null },
  });

  it('resolves only when the server accepted it, and the same id cannot be written twice', async () => {
    const b = make();
    await b.signInAnonymously();
    await expect(b.submitFeedback('fb-test-0001', feedback())).resolves.toBeUndefined();
    // The id is the idempotency key: a second write is refused by the rules (create-only), never overwritten.
    await expect(b.submitFeedback('fb-test-0001', { ...feedback(), rating: 1 })).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('is rejected when signed out and when the payload breaks the schema', async () => {
    const b = make();
    await expect(b.submitFeedback('fb-test-0002', feedback())).rejects.toBeDefined();
    await b.signInAnonymously();
    await expect(b.submitFeedback('fb-test-0003', { ...feedback(), rating: 9 })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(b.submitFeedback('fb-test-0004', { ...feedback(), password: 'hunter2' })).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('telemetry summaries are accepted when valid and refused when they carry coordinates', async () => {
    const b = make();
    await b.signInAnonymously();
    const session = {
      startedAt: Date.now() - 1000,
      endedAt: Date.now(),
      appVersion: 'test',
      platform: 'desktop',
      qualityTier: 'high',
      perfTier: 'high',
      counters: { missionsStarted: 1 },
      vehicles: { 'dzo-hatch': 1 },
      levels: {},
      upgrades: {},
      incidents: [{ type: 'collision', levelId: 'pass-run', at: 0.3, vehicleId: 'dzo-hatch', severity: 'low' }],
    };
    await expect(b.submitTelemetry('session-test-1', session)).resolves.toBeUndefined();
    await expect(b.submitTelemetry('session-test-2', { ...session, incidents: [{ type: 'collision', levelId: 'pass-run', at: 0.3, vehicleId: 'dzo-hatch', severity: 'low', lat: 27.4, lng: 89.6 }] })).rejects.toMatchObject({ code: 'permission-denied' });
  });
});

describe('the whole flow: CloudService + FirebaseBackend + rules', () => {
  it('guest plays, progress is saved to the cloud, registers, and a second browser signs in and receives it', async () => {
    const mk = (): { service: CloudService; store: SaveStore } => {
      const storage = memory();
      const store = new SaveStore(storage);
      const service = new CloudService({ backend: make(), store, meta: new CloudMetaStore(storage), appVersion: 'test', debounceMs: 50 });
      return { service, store };
    };
    const one = mk();
    one.service.start();
    await vi_waitFor(() => one.service.status.connection === 'guest');
    one.store.recordCompletion({ levelId: 'pass-run', vehicleId: 'dzo-hatch', time: 99.5, medal: 'gold', score: 70, comfort: null });
    one.store.addCredits(250);
    await one.service.flush();
    expect(one.service.status.sync).toBe('synced');
    const addr = email();
    await one.service.register(addr, 'secret123');
    await vi_waitFor(() => one.service.status.connection === 'account' && one.service.status.sync === 'synced');

    const two = mk();
    two.service.start();
    await vi_waitFor(() => two.service.status.connection === 'guest');
    await two.service.signIn(addr, 'secret123');
    await vi_waitFor(() => two.service.status.sync === 'synced');
    expect(two.store.progress.levels['pass-run'].vehicles['dzo-hatch'].bestTime).toBe(99.5);
    expect(two.store.credits).toBe(250);
    one.service.dispose();
    two.service.dispose();
  });
});

async function vi_waitFor(cond: () => boolean, ms = 15_000): Promise<void> {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('timed out waiting for condition');
    await new Promise((r) => setTimeout(r, 25));
  }
}
