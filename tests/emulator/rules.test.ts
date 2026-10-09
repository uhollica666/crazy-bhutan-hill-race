import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { collection, deleteDoc, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { PROJECT_ID, validEntry, validFeedback, validIncident, validProfile, validRecord, validSave, validSession } from './fixtures';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});
afterAll(async () => {
  await env.cleanup();
});
beforeEach(async () => {
  await env.clearFirestore();
});

const alice = () => env.authenticatedContext('alice').firestore();
const bob = () => env.authenticatedContext('bob').firestore();
const anon = () => env.unauthenticatedContext().firestore();
/** Writes a document bypassing the rules (to set up state). */
const seed = async (path: string, data: Record<string, unknown>): Promise<void> => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path), data);
  });
};

describe('default deny', () => {
  it('unsupported paths are closed to everyone, signed in or not', async () => {
    for (const db of [anon(), alice()]) {
      await assertFails(getDoc(doc(db, 'secrets/one')));
      await assertFails(setDoc(doc(db, 'secrets/one'), { a: 1 }));
      await assertFails(setDoc(doc(db, 'players/alice/other/x'), { a: 1 }));
      await assertFails(setDoc(doc(db, 'leaderboards/pass-run'), { a: 1 }));
      await assertFails(getDocs(collection(db, 'players')));
    }
  });
});

describe('players/{uid} profile', () => {
  it('the owner can create, read and update their profile', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'players/alice'), validProfile()));
    await assertSucceeds(getDoc(doc(alice(), 'players/alice')));
    await assertSucceeds(updateDoc(doc(alice(), 'players/alice'), { displayName: 'Mighty Yeti', updatedAt: serverTimestamp() }));
  });

  it('nobody else can read or write it, and signed-out users cannot touch it', async () => {
    await seed('players/alice', { ...validProfile(), createdAt: new Date(), updatedAt: new Date() });
    await assertFails(getDoc(doc(bob(), 'players/alice')));
    await assertFails(setDoc(doc(bob(), 'players/alice'), validProfile()));
    await assertFails(deleteDoc(doc(bob(), 'players/alice')));
    await assertFails(getDoc(doc(anon(), 'players/alice')));
    await assertFails(setDoc(doc(anon(), 'players/alice'), validProfile()));
  });

  it('rejects unknown fields (such as an e-mail address), bad names and a changed creation date', async () => {
    await assertFails(setDoc(doc(alice(), 'players/alice'), validProfile({ email: 'a@example.com' })));
    await assertFails(setDoc(doc(alice(), 'players/alice'), validProfile({ displayName: 'x' })));
    await assertFails(setDoc(doc(alice(), 'players/alice'), validProfile({ displayName: '<script>alert(1)</script>' })));
    await assertFails(setDoc(doc(alice(), 'players/alice'), validProfile({ displayName: 'a'.repeat(21) })));
    await assertFails(setDoc(doc(alice(), 'players/alice'), validProfile({ accountType: 'admin' })));
    await assertFails(setDoc(doc(alice(), 'players/alice'), validProfile({ createdAt: new Date(0) })));
    await assertSucceeds(setDoc(doc(alice(), 'players/alice'), validProfile()));
    await assertFails(updateDoc(doc(alice(), 'players/alice'), { createdAt: new Date(0), updatedAt: serverTimestamp() }));
  });
});

describe('players/{uid}/saves/current', () => {
  it('the owner can create revision 1 and read it back', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'players/alice/saves/current'), validSave('alice')));
    await assertSucceeds(getDoc(doc(alice(), 'players/alice/saves/current')));
  });

  it('another user, and a signed-out user, can neither read nor write it', async () => {
    await seed('players/alice/saves/current', { ...validSave('alice'), updatedAt: new Date() });
    await assertFails(getDoc(doc(bob(), 'players/alice/saves/current')));
    await assertFails(getDoc(doc(anon(), 'players/alice/saves/current')));
    await assertFails(setDoc(doc(bob(), 'players/alice/saves/current'), validSave('alice', { revision: 2 })));
    await assertFails(setDoc(doc(bob(), 'players/alice/saves/current'), validSave('bob', { revision: 2 })));
    await assertFails(deleteDoc(doc(bob(), 'players/alice/saves/current')));
    await assertFails(setDoc(doc(anon(), 'players/alice/saves/current'), validSave('alice')));
  });

  it('cannot be written under another uid even by its owner, nor under another document name', async () => {
    await assertFails(setDoc(doc(alice(), 'players/alice/saves/current'), validSave('bob')));
    await assertFails(setDoc(doc(alice(), 'players/alice/saves/backup'), validSave('alice')));
  });

  it('optimistic concurrency: an update must be exactly one revision ahead', async () => {
    await seed('players/alice/saves/current', { ...validSave('alice'), updatedAt: new Date() });
    await assertFails(setDoc(doc(alice(), 'players/alice/saves/current'), validSave('alice', { revision: 1 })));
    await assertFails(setDoc(doc(alice(), 'players/alice/saves/current'), validSave('alice', { revision: 3 })));
    await assertSucceeds(setDoc(doc(alice(), 'players/alice/saves/current'), validSave('alice', { revision: 2 })));
    await assertFails(setDoc(doc(alice(), 'players/alice/saves/current'), validSave('alice', { revision: 2 })));
  });

  it('a new document must start at revision 1', async () => {
    await assertFails(setDoc(doc(alice(), 'players/alice/saves/current'), validSave('alice', { revision: 5 })));
  });

  it('rejects malformed payloads: extra fields, wrong types, impossible values, unknown ids, oversize lists', async () => {
    const path = 'players/alice/saves/current';
    const bad: Record<string, unknown>[] = [
      validSave('alice', { extra: 'nope' }),
      validSave('alice', { schema: 2 }),
      validSave('alice', { wallet: { credits: -1 } }),
      validSave('alice', { wallet: { credits: 1e12 } }),
      validSave('alice', { wallet: { credits: 'lots' } }),
      validSave('alice', { wallet: { credits: 5, bonus: 1 } }),
      validSave('alice', { garage: { owned: [], upgrades: {} } }),
      validSave('alice', { garage: { owned: ['tank'], upgrades: {} } }),
      validSave('alice', { garage: { owned: ['dzo-hatch'], upgrades: { tank: {} } } }),
      validSave('alice', { progress: { levels: { 'secret-level': { completions: 1, medal: 'gold', vehicles: {} } } } }),
      validSave('alice', { progress: { levels: { 'pass-run': { completions: -1, medal: 'gold', vehicles: {} } } } }),
      validSave('alice', { progress: { levels: { 'pass-run': { completions: 1, medal: 'platinum', vehicles: {} } } } }),
      validSave('alice', { progress: { levels: { 'pass-run': { completions: 1, medal: 'gold', vehicles: { tank: validRecord() } } } } }),
      validSave('alice', { progress: { levels: { 'pass-run': { completions: 1, medal: 'gold', vehicles: { 'dzo-hatch': validRecord({ bestTime: -4 }) } } } } }),
      validSave('alice', { stats: { missionsPlayed: 1, creditsEarned: 1, campaignCompleted: 'yes' } }),
      validSave('alice', { story: { seen: Array.from({ length: 40 }, (_, i) => `s${i}`) } }),
      validSave('alice', { prefs: { hudMode: 'cinematic', reducedMotion: false } }),
      validSave('alice', { deviceId: 'x' }),
      validSave('alice', { updatedAt: new Date(0) }),
    ];
    for (const b of bad) await assertFails(setDoc(doc(alice(), path), b));
  });

  it('the owner can delete their own cloud save', async () => {
    await seed('players/alice/saves/current', { ...validSave('alice'), updatedAt: new Date() });
    await assertSucceeds(deleteDoc(doc(alice(), 'players/alice/saves/current')));
  });
});

describe('leaderboards/{levelId}/entries/{uid}', () => {
  it('anyone, even signed out, can read a bounded page ordered by time', async () => {
    await seed('leaderboards/pass-run/entries/alice', { ...validEntry('alice'), submittedAt: new Date() });
    await seed('leaderboards/pass-run/entries/bob', { ...validEntry('bob', 'pass-run', { timeMs: 99_000, displayName: 'Bob Bhutan' }), submittedAt: new Date() });
    const q = query(collection(anon(), 'leaderboards/pass-run/entries'), orderBy('timeMs'), limit(50));
    await assertSucceeds(getDocs(q));
    await assertSucceeds(getDoc(doc(anon(), 'leaderboards/pass-run/entries/alice')));
  });

  it('an unbounded or oversized list is refused', async () => {
    await assertFails(getDocs(collection(anon(), 'leaderboards/pass-run/entries')));
    await assertFails(getDocs(query(collection(anon(), 'leaderboards/pass-run/entries'), orderBy('timeMs'), limit(500))));
  });

  it('a player can post their own valid time, and only under their own id', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'leaderboards/pass-run/entries/alice'), validEntry('alice')));
    await assertFails(setDoc(doc(bob(), 'leaderboards/pass-run/entries/alice'), validEntry('alice')));
    await assertFails(setDoc(doc(anon(), 'leaderboards/pass-run/entries/alice'), validEntry('alice')));
    await assertFails(setDoc(doc(alice(), 'leaderboards/pass-run/entries/bob'), validEntry('bob')));
    await assertFails(setDoc(doc(alice(), 'leaderboards/pass-run/entries/alice'), validEntry('bob')));
  });

  it('only a faster time may replace an existing entry', async () => {
    await seed('leaderboards/pass-run/entries/alice', { ...validEntry('alice', 'pass-run', { timeMs: 100_000 }), submittedAt: new Date() });
    await assertFails(setDoc(doc(alice(), 'leaderboards/pass-run/entries/alice'), validEntry('alice', 'pass-run', { timeMs: 100_000 })));
    await assertFails(setDoc(doc(alice(), 'leaderboards/pass-run/entries/alice'), validEntry('alice', 'pass-run', { timeMs: 140_000 })));
    await assertSucceeds(setDoc(doc(alice(), 'leaderboards/pass-run/entries/alice'), validEntry('alice', 'pass-run', { timeMs: 95_000 })));
  });

  it('rejects implausible or malformed entries', async () => {
    const path = 'leaderboards/pass-run/entries/alice';
    const bad: Record<string, unknown>[] = [
      validEntry('alice', 'pass-run', { timeMs: 1_000 }), // below the plausibility floor
      validEntry('alice', 'pass-run', { timeMs: 0 }),
      validEntry('alice', 'pass-run', { timeMs: -5 }),
      validEntry('alice', 'pass-run', { timeMs: 99_999_999 }),
      validEntry('alice', 'pass-run', { timeMs: 100000.5 }),
      validEntry('alice', 'pass-run', { vehicleId: 'rocket' }),
      validEntry('alice', 'pass-run', { displayName: '' }),
      validEntry('alice', 'pass-run', { displayName: '<b>x</b>' }),
      validEntry('alice', 'pass-run', { medal: 'diamond' }),
      validEntry('alice', 'pass-run', { levelId: 'thimphu-pickup' }), // path and document disagree
      validEntry('alice', 'pass-run', { admin: true }),
      validEntry('alice', 'pass-run', { submittedAt: new Date(0) }),
    ];
    for (const b of bad) await assertFails(setDoc(doc(alice(), path), b));
    await assertFails(setDoc(doc(alice(), 'leaderboards/not-a-level/entries/alice'), validEntry('alice', 'not-a-level')));
  });

  it('only the owner can delete their entry', async () => {
    await seed('leaderboards/pass-run/entries/alice', { ...validEntry('alice'), submittedAt: new Date() });
    await assertFails(deleteDoc(doc(bob(), 'leaderboards/pass-run/entries/alice')));
    await assertFails(deleteDoc(doc(anon(), 'leaderboards/pass-run/entries/alice')));
    await assertSucceeds(deleteDoc(doc(alice(), 'leaderboards/pass-run/entries/alice')));
  });
});

describe('feedback/{id}', () => {
  it('a signed-in player (guest included) can submit valid feedback', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'feedback/fb-20261009-0001'), validFeedback('alice', 'fb-20261009-0001')));
  });

  it('signed-out users cannot submit; nobody can submit as someone else', async () => {
    await assertFails(setDoc(doc(anon(), 'feedback/fb-20261009-0002'), validFeedback('alice', 'fb-20261009-0002')));
    await assertFails(setDoc(doc(bob(), 'feedback/fb-20261009-0003'), validFeedback('alice', 'fb-20261009-0003')));
  });

  it('feedback is never listable, editable or deletable by clients; only its author can GET it by id, nobody else can read it', async () => {
    await seed('feedback/fb-20261009-0004', { ...validFeedback('alice', 'fb-20261009-0004'), createdAt: new Date() });
    for (const db of [alice(), bob(), anon()]) {
      await assertFails(updateDoc(doc(db, 'feedback/fb-20261009-0004'), { rating: 1 }));
      await assertFails(deleteDoc(doc(db, 'feedback/fb-20261009-0004')));
      await assertFails(getDocs(collection(db, 'feedback')));
    }
    await assertSucceeds(getDoc(doc(alice(), 'feedback/fb-20261009-0004'))); // the author can confirm their own delivery
    await assertFails(getDoc(doc(bob(), 'feedback/fb-20261009-0004')));
    await assertFails(getDoc(doc(anon(), 'feedback/fb-20261009-0004')));
  });

  it('a submission cannot overwrite an existing one (the id is the idempotency key, and edits are denied)', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'feedback/fb-20261009-0005'), validFeedback('alice', 'fb-20261009-0005')));
    await assertFails(setDoc(doc(alice(), 'feedback/fb-20261009-0005'), validFeedback('alice', 'fb-20261009-0005', { rating: 1 })));
  });

  it('rejects invalid payloads: bad ids, out-of-range ratings, oversized text, unknown fields, forged ownership', async () => {
    const id = 'fb-20261009-0006';
    await assertFails(setDoc(doc(alice(), 'feedback/short'), validFeedback('alice', 'short')));
    await assertFails(setDoc(doc(alice(), 'feedback/bad id with spaces!'), validFeedback('alice', 'bad id with spaces!')));
    const bad: Record<string, unknown>[] = [
      validFeedback('alice', id, { rating: 0 }),
      validFeedback('alice', id, { rating: 6 }),
      validFeedback('alice', id, { rating: 3.5 }),
      validFeedback('alice', id, { bugs: 'x'.repeat(1201) }),
      validFeedback('alice', id, { difficulty: 'impossible' }),
      validFeedback('alice', id, { origin: 'phishing' }),
      validFeedback('alice', id, { isAdmin: true }),
      validFeedback('alice', id, { submissionId: 'another-id-123' }),
      validFeedback('alice', id, { uid: 'bob' }),
      validFeedback('alice', id, { createdAt: new Date(0) }),
      validFeedback('alice', id, { interest: { playLargerVersion: 'definitely', considerPurchasingFullGame: null, priceRange: null, voluntarySupport: null } }),
      validFeedback('alice', id, { interest: { playLargerVersion: true, considerPurchasingFullGame: null, priceRange: 'a-million', voluntarySupport: null } }),
      validFeedback('alice', id, { interest: { playLargerVersion: true, considerPurchasingFullGame: null, priceRange: null, voluntarySupport: null, cardNumber: '4111' } }),
      validFeedback('alice', id, { contact: 'x'.repeat(121) }),
    ];
    for (const b of bad) await assertFails(setDoc(doc(alice(), `feedback/${id}`), b));
  });
});

describe('telemetrySessions/{id}', () => {
  it('a signed-in player can create a valid summary; no client can read, edit or delete one', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'telemetrySessions/session-0001'), validSession('alice', 'session-0001')));
    for (const db of [alice(), bob(), anon()]) {
      await assertFails(getDoc(doc(db, 'telemetrySessions/session-0001')));
      await assertFails(updateDoc(doc(db, 'telemetrySessions/session-0001'), { counters: {} }));
      await assertFails(deleteDoc(doc(db, 'telemetrySessions/session-0001')));
    }
    await assertFails(setDoc(doc(anon(), 'telemetrySessions/session-0002'), validSession('alice', 'session-0002')));
    await assertFails(setDoc(doc(bob(), 'telemetrySessions/session-0003'), validSession('alice', 'session-0003')));
  });

  it('rejects coordinates, unknown incident types, out-of-range route positions and too many incidents', async () => {
    const id = 'session-0004';
    const many = Array.from({ length: 13 }, () => validIncident());
    const bad: Record<string, unknown>[] = [
      validSession('alice', id, { incidents: [validIncident({ at: 1.5 })] }),
      validSession('alice', id, { incidents: [validIncident({ at: -0.1 })] }),
      validSession('alice', id, { incidents: [validIncident({ type: 'keypress' })] }),
      validSession('alice', id, { incidents: [validIncident({ x: 27.3, z: -41.9 })] }),
      validSession('alice', id, { incidents: [validIncident({ lat: 27.47, lng: 89.64 })] }),
      validSession('alice', id, { incidents: [validIncident(), validIncident({ levelId: 'nowhere' })] }),
      validSession('alice', id, { incidents: many }),
      validSession('alice', id, { email: 'a@example.com' }),
      validSession('alice', id, { gps: { lat: 1, lng: 2 } }),
      validSession('alice', id, { platform: 'toaster' }),
    ];
    for (const b of bad) await assertFails(setDoc(doc(alice(), `telemetrySessions/${id}`), b));
  });
});
