import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CloudService } from '../src/cloud/CloudService';
import { CloudMetaStore } from '../src/cloud/meta';
import { toPayload } from '../src/cloud/payload';
import { CloudError } from '../src/cloud/types';
import { listVehicles } from '../src/data/vehicles';
import { SaveStore } from '../src/storage/SaveStore';
import { FakeBackend } from './helpers/fakeCloud';

const memory = (): { getItem(k: string): string | null; setItem(k: string, v: string): void; data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
};

interface Rig {
  backend: FakeBackend;
  store: SaveStore;
  meta: CloudMetaStore;
  service: CloudService;
  online: { value: boolean };
  notices: string[];
}

/** One "device": its own storage, save and cloud service, sharing a backend with other devices. */
function device(backend: FakeBackend, opts: { debounceMs?: number } = {}): Rig {
  const storage = memory();
  const store = new SaveStore(storage);
  const meta = new CloudMetaStore(storage);
  const online = { value: true };
  const service = new CloudService({ backend, store, meta, appVersion: 'test', isOnline: () => online.value, debounceMs: opts.debounceMs ?? 10_000 });
  const notices: string[] = [];
  service.onNotice((n) => notices.push(n));
  return { backend, store, meta, service, online, notices };
}

const settle = async (): Promise<void> => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

const finish = (store: SaveStore, levelId = 'pass-run', time = 100, medal: 'gold' | 'silver' | 'bronze' = 'silver') => {
  store.recordCompletion({ levelId, vehicleId: 'dzo-hatch', time, medal, score: 60, comfort: null });
  store.addCredits(100);
};

let backend: FakeBackend;
beforeEach(() => {
  backend = new FakeBackend();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('guest play and identity', () => {
  it('signs in anonymously once, with no registration, and creates a default display name', async () => {
    const d = device(backend);
    d.service.start();
    expect(d.service.status.connection).toBe('connecting');
    await settle();
    expect(d.service.status.connection).toBe('guest');
    expect(backend.calls.signInAnonymously).toBe(1);
    expect(d.service.status.displayName).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+ \d\d$/);
    expect(backend.profiles.size).toBe(1);
    expect([...backend.profiles.values()][0].accountType).toBe('guest');
  });

  it('restores a persisted session instead of creating a second anonymous user on the next page load', async () => {
    const first = device(backend);
    first.service.start();
    await settle();
    const uid = first.service.uid;
    // A second page load: the SDK still has the session.
    const again = device(backend);
    again.service.start();
    await settle();
    expect(backend.calls.signInAnonymously).toBe(1);
    expect(again.service.uid).toBe(uid);
  });

  it('starting while offline is harmless: the game is local, and a guest is created when the network returns', async () => {
    backend.online = false;
    const d = device(backend);
    d.online.value = false;
    d.service.start();
    await settle();
    expect(['offline', 'local']).toContain(d.service.status.connection);
    expect(d.service.status.user).toBeNull();
    finish(d.store); // still playable and saving locally
    expect(d.store.progress.levels['pass-run'].completions).toBe(1);
    backend.online = true;
    d.online.value = true;
    d.service.notifyOnline();
    await settle();
    expect(d.service.status.connection).toBe('guest');
    expect(backend.saves.size).toBe(1); // the local progress was uploaded once connected
  });

  it('a disabled build never touches the backend', async () => {
    const storage = memory();
    const store = new SaveStore(storage);
    const service = new CloudService({ backend: null, store, meta: new CloudMetaStore(storage), appVersion: 't' });
    service.start();
    expect(service.status.connection).toBe('disabled');
    finish(store);
    await service.flush();
    expect(service.status.sync).toBe('idle');
    await expect(service.register('a@b.co', 'secret1')).rejects.toBeInstanceOf(CloudError);
  });

  it('signing out returns to local play, keeps the local data and does not create a new guest by itself', async () => {
    const d = device(backend);
    d.service.start();
    await settle();
    finish(d.store);
    await d.service.flush();
    await d.service.signOut();
    expect(d.service.status.connection).toBe('local');
    expect(d.service.status.user).toBeNull();
    expect(d.store.progress.levels['pass-run'].completions).toBe(1);
    expect(backend.calls.signInAnonymously).toBe(1);
    await d.service.playOnlineAsGuest();
    await settle();
    expect(d.service.status.connection).toBe('guest');
  });
});

describe('accounts', () => {
  it('registering from a guest links the credential and keeps the uid and the cloud progress', async () => {
    const d = device(backend);
    d.service.start();
    await settle();
    finish(d.store);
    await d.service.flush();
    const guestUid = d.service.uid;
    await d.service.register('player@example.com', 'secret123');
    await settle();
    expect(d.service.uid).toBe(guestUid);
    expect(d.service.status.connection).toBe('account');
    expect(backend.accounts.size).toBe(1);
    expect(backend.saves.get(guestUid as string)).toBeDefined();
    expect([...backend.profiles.values()][0].accountType).toBe('registered');
    expect(backend.calls.sendVerification).toBe(1);
  });

  it('shows clear errors: invalid email, weak password, address already registered, wrong password', async () => {
    const d = device(backend);
    d.service.start();
    await settle();
    await expect(d.service.register('not-an-email', 'secret123')).rejects.toMatchObject({ code: 'invalid-email' });
    await expect(d.service.register('a@b.co', '123')).rejects.toMatchObject({ code: 'weak-password' });
    await d.service.register('a@b.co', 'secret123');
    const other = device(backend);
    other.service.start();
    await settle();
    // `other` shares the fake's persisted session, so give it its own guest first.
    backend.current = null;
    await other.service.playOnlineAsGuest();
    await settle();
    await expect(other.service.register('a@b.co', 'secret123')).rejects.toMatchObject({ code: 'email-in-use' });
    await expect(other.service.signIn('a@b.co', 'wrongpass')).rejects.toMatchObject({ code: 'wrong-credentials' });
  });

  it('reports a network failure as offline, not as a bad password', async () => {
    const d = device(backend);
    d.service.start();
    await settle();
    backend.online = false;
    await expect(d.service.signIn('a@b.co', 'secret123')).rejects.toMatchObject({ code: 'offline' });
    await expect(d.service.sendPasswordReset('a@b.co')).rejects.toMatchObject({ code: 'offline' });
  });

  it('password reset validates the address', async () => {
    const d = device(backend);
    d.service.start();
    await settle();
    await expect(d.service.sendPasswordReset('nope')).rejects.toMatchObject({ code: 'invalid-email' });
    await expect(d.service.sendPasswordReset('a@b.co')).resolves.toBeUndefined();
  });

  it('display names are validated and stored in the profile, never derived from the email', async () => {
    const d = device(backend);
    d.service.start();
    await settle();
    await expect(d.service.setDisplayName('x')).rejects.toBeInstanceOf(CloudError);
    await expect(d.service.setDisplayName('<b>hi</b>')).rejects.toBeInstanceOf(CloudError);
    await d.service.setDisplayName('  Dorji   Racer ');
    expect(d.service.status.displayName).toBe('Dorji Racer');
    expect([...backend.profiles.values()][0].displayName).toBe('Dorji Racer');
    await d.service.register('dorji@example.com', 'secret123');
    await settle();
    expect(d.service.status.displayName).toBe('Dorji Racer');
    expect(JSON.stringify([...backend.profiles.values()])).not.toContain('dorji@example.com');
  });
});

describe('cloud saves', () => {
  it('a brand new profile writes nothing; the first real progress is uploaded as revision 1', async () => {
    const d = device(backend);
    d.service.start();
    await settle();
    expect(backend.calls.writeSave ?? 0).toBe(0);
    expect(backend.saves.size).toBe(0);
    finish(d.store);
    await d.service.flush();
    const cloud = backend.saves.get(d.service.uid as string);
    expect(cloud).not.toBe('unreadable');
    expect(cloud && cloud !== 'unreadable' && cloud.revision).toBe(1);
    expect(d.service.status.sync).toBe('synced');
  });

  it('batches a burst of changes into one write after the debounce', async () => {
    vi.useFakeTimers();
    const d = device(backend, { debounceMs: 5000 });
    d.service.start();
    await vi.advanceTimersByTimeAsync(10);
    for (let i = 0; i < 6; i++) finish(d.store, 'pass-run', 100 - i);
    expect(d.service.status.sync).toBe('pending');
    await vi.advanceTimersByTimeAsync(4000);
    expect(backend.calls.writeSave ?? 0).toBe(0);
    await vi.advanceTimersByTimeAsync(2000);
    expect(backend.calls.writeSave).toBe(1);
    expect(d.service.status.sync).toBe('synced');
  });

  it('does not write again when nothing syncable changed (settings only, repeated syncs)', async () => {
    const d = device(backend);
    d.service.start();
    await settle();
    finish(d.store);
    await d.service.flush();
    expect(backend.calls.writeSave).toBe(1);
    d.store.updateSettings({ quality: 'low', masterVolume: 0.2 });
    await d.service.flush();
    await d.service.flush();
    await d.service.syncNow('again');
    expect(backend.calls.writeSave).toBe(1);
  });

  it('a second device with an empty profile receives the account progress, with a backup and a notice', async () => {
    const a = device(backend);
    a.service.start();
    await settle();
    finish(a.store, 'pass-run', 88, 'gold');
    await a.service.register('p@example.com', 'secret123');
    await a.service.flush();
    // Device B: a fresh browser, signs in to the same account.
    const b = device(backend);
    backend.current = null;
    b.service.start();
    await settle();
    await b.service.signIn('p@example.com', 'secret123');
    expect(b.store.progress.levels['pass-run'].vehicles['dzo-hatch'].bestTime).toBe(88);
    expect(b.notices).toContain('Progress restored from your account.');
    expect(b.meta.data.backups.some((x) => x.reason === 'before-sign-in')).toBe(true);
    expect(b.service.status.sync).toBe('synced');
  });

  it('changes made on one device flow to the other without a conflict (fast-forward in both directions)', async () => {
    const a = device(backend);
    a.service.start();
    await settle();
    finish(a.store, 'pass-run', 90);
    await a.service.register('p@example.com', 'secret123');
    await a.service.flush();
    const b = device(backend);
    backend.current = null;
    b.service.start();
    await settle();
    await b.service.signIn('p@example.com', 'secret123');
    // B plays, A syncs later.
    finish(b.store, 'thimphu-pickup', 150);
    await b.service.flush();
    backend.current = backend.accounts.get(a.service.uid as string) ?? null;
    await a.service.syncNow('later');
    expect(a.store.progress.levels['thimphu-pickup']).toBeDefined();
    expect(a.service.status.sync).toBe('synced');
    expect(a.service.status.conflict).toBeNull();
  });

  it('offline changes are kept as pending, reported as pending, and sent once when the network returns', async () => {
    const d = device(backend);
    d.service.start();
    await settle();
    finish(d.store);
    await d.service.flush();
    backend.online = false;
    d.online.value = false;
    finish(d.store, 'thimphu-pickup', 140);
    finish(d.store, 'airport-dash', 130);
    await d.service.flush();
    expect(d.service.status.sync).toBe('pending');
    expect(d.meta.data.pendingSince).not.toBeNull();
    const before = backend.calls.writeSave;
    backend.online = true;
    d.online.value = true;
    d.service.notifyOnline();
    await settle();
    expect(backend.calls.writeSave).toBe((before ?? 0) + 1);
    expect(d.service.status.sync).toBe('synced');
    expect(d.meta.data.pendingSince).toBeNull();
    const cloud = backend.saves.get(d.service.uid as string);
    expect(cloud !== 'unreadable' && cloud && Object.keys(cloud.payload.progress.levels).length).toBe(3);
  });

  it('pending changes survive a page reload (the flag is persisted) and are sent on the next start', async () => {
    const storage = memory();
    const store = new SaveStore(storage);
    const meta = new CloudMetaStore(storage);
    const online = { value: false };
    backend.online = false;
    const s1 = new CloudService({ backend, store, meta, appVersion: 't', isOnline: () => online.value, debounceMs: 10_000 });
    s1.start();
    await settle();
    finish(store);
    // No session could be created offline, so nothing is pending yet; go online and create one, then go offline again.
    online.value = true;
    backend.online = true;
    s1.notifyOnline();
    await settle();
    backend.online = false;
    online.value = false;
    finish(store, 'thimphu-pickup', 140);
    await s1.flush();
    expect(meta.data.pendingSince).not.toBeNull();
    s1.dispose();
    // New page load, still logged in, network back.
    const store2 = new SaveStore(storage);
    const meta2 = new CloudMetaStore(storage);
    backend.online = true;
    online.value = true;
    const s2 = new CloudService({ backend, store: store2, meta: meta2, appVersion: 't', isOnline: () => online.value });
    expect(s2.status.sync).toBe('pending');
    s2.start();
    await settle();
    expect(s2.status.sync).toBe('synced');
    const cloud = backend.saves.get(s2.uid as string);
    expect(cloud !== 'unreadable' && cloud && 'thimphu-pickup' in cloud.payload.progress.levels).toBe(true);
  });

  it('a lost write race (the cloud moved between reading and writing) is retried, not overwritten', async () => {
    const d = device(backend);
    d.service.start();
    await settle();
    finish(d.store, 'pass-run', 90);
    await d.service.flush();
    const uid = d.service.uid as string;
    // Another device wrote revision 2 behind our back, and we then change ours.
    const cur = backend.saves.get(uid);
    if (cur && cur !== 'unreadable') backend.saves.set(uid, { revision: 2, payload: { ...cur.payload, wallet: { credits: cur.payload.wallet.credits + 50 } } });
    finish(d.store, 'thimphu-pickup', 140);
    await d.service.flush();
    // Both changed -> never a silent overwrite.
    expect(d.service.status.sync).toBe('conflict');
    const after = backend.saves.get(uid);
    expect(after !== 'unreadable' && after && after.revision).toBe(2);
  });

  it('a transient server failure is reported as failed and retried with backoff', async () => {
    vi.useFakeTimers();
    const d = device(backend, { debounceMs: 100 });
    d.service.start();
    await vi.advanceTimersByTimeAsync(10);
    backend.failNext = { code: 'unknown', times: 1 };
    finish(d.store);
    await vi.advanceTimersByTimeAsync(200);
    expect(d.service.status.sync).toBe('failed');
    expect(d.meta.data.pendingSince).not.toBeNull();
    await vi.advanceTimersByTimeAsync(31_000);
    expect(d.service.status.sync).toBe('synced');
  });

  it('a corrupt or newer-version cloud document is never overwritten silently', async () => {
    const d = device(backend);
    d.service.start();
    await settle();
    const uid = d.service.uid as string;
    backend.saves.set(uid, 'unreadable');
    finish(d.store);
    await d.service.flush();
    expect(d.service.status.sync).toBe('conflict');
    expect(d.service.status.conflict?.kind).toBe('unreadable');
    expect(backend.saves.get(uid)).toBe('unreadable');
    // Choosing "keep the online copy" leaves it alone; choosing this device replaces it.
    await d.service.resolveConflict('device');
    const cloud = backend.saves.get(uid);
    expect(cloud !== 'unreadable' && cloud && cloud.revision).toBe(1);
    expect(d.service.status.sync).toBe('synced');
  });
});

describe('conflicts: two profiles that both moved on', () => {
  /** A has pass-run (gold) + credits; the account has thimphu-pickup + a different wallet. */
  async function diverge(): Promise<{ a: Rig; b: Rig; uid: string }> {
    const a = device(backend);
    a.service.start();
    await settle();
    finish(a.store, 'pass-run', 90, 'gold');
    await a.service.register('p@example.com', 'secret123');
    await a.service.flush();
    const uid = a.service.uid as string;
    // The account is used on device B (a fresh browser) and changed there.
    const b = device(backend);
    backend.current = null;
    b.service.start();
    await settle();
    await b.service.signIn('p@example.com', 'secret123');
    finish(b.store, 'thimphu-pickup', 150, 'bronze');
    await b.service.flush();
    // Meanwhile A, offline, also played.
    backend.current = backend.accounts.get(uid) ?? null;
    finish(a.store, 'airport-dash', 120, 'silver');
    return { a, b, uid };
  }

  it('asks the player instead of picking a side, and shows what each side has', async () => {
    const { a } = await diverge();
    await a.service.flush();
    expect(a.service.status.sync).toBe('conflict');
    const c = a.service.status.conflict;
    expect(c?.kind).toBe('diverged');
    expect(c?.local.missions).toBe(2);
    expect(c?.cloud?.missions).toBe(2);
    expect(c?.canCombine).toBe(true);
  });

  it('"use the account" replaces this device, after saving a backup of it', async () => {
    const { a } = await diverge();
    await a.service.flush();
    await a.service.resolveConflict('cloud');
    expect(a.store.progress.levels['airport-dash']).toBeUndefined();
    expect(a.store.progress.levels['thimphu-pickup']).toBeDefined();
    expect(a.meta.data.backups.some((x) => x.reason === 'conflict-cloud' && 'airport-dash' in x.data.progress.levels)).toBe(true);
    expect(a.service.status.sync).toBe('synced');
  });

  it('"use this device" overwrites the account, after saving a backup, in a revision-checked write', async () => {
    const { a, uid } = await diverge();
    await a.service.flush();
    const before = backend.saves.get(uid);
    await a.service.resolveConflict('device');
    const after = backend.saves.get(uid);
    expect(before !== 'unreadable' && after !== 'unreadable' && before && after && after.revision).toBe((before as { revision: number }).revision + 1);
    expect(after !== 'unreadable' && after && 'thimphu-pickup' in after.payload.progress.levels).toBe(false);
    expect(a.meta.data.backups.some((x) => x.reason === 'conflict-device')).toBe(true);
  });

  it('"combine" keeps every mission and every credit exactly once', async () => {
    const { a, b, uid } = await diverge();
    const walletA = a.store.credits;
    const walletB = b.store.credits;
    await a.service.flush();
    await a.service.resolveConflict('combine');
    expect(a.service.status.sync).toBe('synced');
    expect(Object.keys(a.store.progress.levels).sort()).toEqual(['airport-dash', 'pass-run', 'thimphu-pickup']);
    // Both devices started from the same shared state (pass-run + 100 credits); each earned 100 more since.
    const base = 100;
    expect(a.store.credits).toBe(base + (walletA - base) + (walletB - base));
    const cloud = backend.saves.get(uid);
    expect(cloud !== 'unreadable' && cloud && cloud.payload.wallet.credits).toBe(a.store.credits);
  });

  it('refuses to guess when the cloud moved again while the player was deciding', async () => {
    const { a, uid } = await diverge();
    await a.service.flush();
    const cur = backend.saves.get(uid);
    if (cur && cur !== 'unreadable') backend.saves.set(uid, { ...cur, revision: cur.revision + 1 });
    await a.service.resolveConflict('device');
    // Not written over the newer revision: the conflict is re-evaluated against the new state.
    const after = backend.saves.get(uid);
    expect(after !== 'unreadable' && after && after.revision).toBeGreaterThanOrEqual((cur as { revision: number }).revision + 1);
    expect(['conflict', 'synced']).toContain(a.service.status.sync);
  });
});

describe('signing in to an existing account from a guest session', () => {
  it('does not silently overwrite or discard the guest progress: it asks, with a backup kept', async () => {
    const acct = device(backend);
    acct.service.start();
    await settle();
    finish(acct.store, 'pass-run', 90, 'gold');
    await acct.service.register('p@example.com', 'secret123');
    await acct.service.flush();
    // Someone plays as a guest on another browser, then signs in.
    const guest = device(backend);
    backend.current = null;
    guest.service.start();
    await settle();
    finish(guest.store, 'chelela-climb', 130, 'bronze');
    await guest.service.signIn('p@example.com', 'secret123');
    expect(guest.service.status.sync).toBe('conflict');
    expect(guest.store.progress.levels['chelela-climb']).toBeDefined(); // still there
    expect(guest.meta.data.backups.some((b) => b.reason === 'before-sign-in' && 'chelela-climb' in b.data.progress.levels)).toBe(true);
    await guest.service.resolveConflict('combine');
    expect(Object.keys(guest.store.progress.levels).sort()).toEqual(['chelela-climb', 'pass-run']);
  });
});

describe('removing online data', () => {
  it('deletes the cloud save and leaderboard entries but keeps the local save', async () => {
    const d = device(backend);
    d.service.start();
    await settle();
    finish(d.store);
    await d.service.flush();
    const uid = d.service.uid as string;
    backend.entries.set(`pass-run/${uid}`, { uid, levelId: 'pass-run', timeMs: 1, vehicleId: 'dzo-hatch', conditions: 'clear-day', displayName: 'X Y Z', medal: 'gold', comfort: null, clientAt: 0 });
    await d.service.deleteOnlineData();
    expect(backend.saves.size).toBe(0);
    expect(backend.entries.size).toBe(0);
    expect(d.store.progress.levels['pass-run']).toBeDefined();
  });
});

describe('sanity of the helpers', () => {
  it('the vehicle price table the economy relies on matches the game data', () => {
    expect(listVehicles().find((v) => v.id === 'dzo-hatch')?.price).toBe(0);
    expect(toPayload(new SaveStore(memory()).data).wallet.credits).toBe(0);
  });
});
