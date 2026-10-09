import { describe, expect, it } from 'vitest';
import { CloudService } from '../src/cloud/CloudService';
import { FirestoreFeedbackTransport, SentLog, feedbackStatus, flushFeedbackOutbox, toFeedbackDoc } from '../src/cloud/feedbackTransport';
import { CloudMetaStore } from '../src/cloud/meta';
import { DraftStore, buildPayload, emptyForm, newSubmissionId } from '../src/services/feedback';
import { SaveStore } from '../src/storage/SaveStore';
import { FakeBackend } from './helpers/fakeCloud';

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};
const settle = async (): Promise<void> => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
  for (let i = 0; i < 30; i++) await Promise.resolve();
};
const payload = (over: Partial<ReturnType<typeof emptyForm>> = {}, id?: string) =>
  buildPayload({ ...emptyForm(), rating: 4, gameplay: 'Fun', graphics: 'Pretty', ...over }, { appVersion: 't', origin: 'menu', device: null, id });

async function rig() {
  const backend = new FakeBackend();
  const storage = memory();
  const store = new SaveStore(storage);
  const online = { value: true };
  const cloud = new CloudService({ backend, store, meta: new CloudMetaStore(storage), appVersion: 't', isOnline: () => online.value });
  cloud.start();
  await settle();
  const transport = new FirestoreFeedbackTransport(cloud, { timeoutMs: 200, waitForUserMs: 50 });
  const drafts = new DraftStore(memory());
  const sent = new SentLog(memory());
  return { backend, cloud, transport, drafts, sent, online };
}

describe('the feedback document', () => {
  it('has a unique, URL-safe submission id that the server schema accepts', () => {
    const ids = new Set(Array.from({ length: 50 }, () => newSubmissionId()));
    expect(ids.size).toBe(50);
    for (const id of ids) expect(id).toMatch(/^fb-[A-Za-z0-9_-]{8,37}$/);
    expect(payload().submissionId).toMatch(/^fb-/);
  });

  it('maps the form onto the fields the rules allow, with the new graphics answer, and nothing else', () => {
    const doc = toFeedbackDoc(payload({ contact: 'me@example.com', includeDevice: false }));
    expect(Object.keys(doc).sort()).toEqual(['add', 'appVersion', 'bugs', 'clientAt', 'contact', 'controls', 'device', 'difficulty', 'favourite', 'gameplay', 'graphics', 'improve', 'interest', 'origin', 'performance', 'rating'].sort());
    expect(doc.graphics).toBe('Pretty');
    expect(doc.device).toBeNull();
  });
});

describe('delivery states', () => {
  it('"sent" means the server confirmed; sending the same id again is idempotent: the server keeps one copy', async () => {
    const r = await rig();
    const p = payload();
    const res = await r.transport.submit(p);
    expect(res).toEqual({ status: 'sent', via: 'firestore', reference: p.submissionId });
    expect(r.backend.feedback.size).toBe(1);
    // A repeat of the same id is refused by the service (create-only); the transport then confirms with the server that
    // the original is there, so the player is told "delivered" and no second copy exists.
    const again = await r.transport.submit(p);
    expect(again.status).toBe('sent');
    expect(r.backend.feedback.size).toBe(1);
  });

  it('offline: not sent, retryable, never reported as delivered', async () => {
    const r = await rig();
    r.backend.online = false;
    r.online.value = false;
    const res = await r.transport.submit(payload());
    expect(res).toMatchObject({ status: 'not-sent', retryable: true });
    expect(r.backend.feedback.size).toBe(0);
  });

  it('a confirmation that does not arrive in time is "not sent, try again", not success', async () => {
    const r = await rig();
    let release!: () => void;
    r.backend.holdFeedback = new Promise<void>((res) => (release = res));
    const res = await r.transport.submit(payload());
    expect(res).toMatchObject({ status: 'not-sent', retryable: true });
    release();
  });

  it('a submission that arrived but whose confirmation was lost is recognised as delivered on the retry, never duplicated', async () => {
    const r = await rig();
    const p = payload();
    r.backend.loseFeedbackAck = true;
    const first = await r.transport.submit(p); // times out locally, but the server holds it
    expect(first).toEqual({ status: 'sent', via: 'firestore', reference: p.submissionId }); // verified with the server, not assumed
    expect(r.backend.feedback.size).toBe(1);
    // The outbox path: the copy was queued as pending; the retry finds it already delivered.
    r.drafts.add(p, new Date(1), 'pending');
    expect(await flushFeedbackOutbox(r.drafts, r.transport, r.sent)).toBe(1);
    expect(r.backend.feedback.size).toBe(1);
    expect(r.drafts.list()).toEqual([]);
  });

  it('a service rejection is a failure, not retryable, and says so', async () => {
    const r = await rig();
    r.backend.failNext = { code: 'permission-denied', times: 1 };
    const res = await r.transport.submit(payload());
    expect(res).toMatchObject({ status: 'not-sent', retryable: false });
  });

  it('not signed in yet: waits briefly, then reports not connected (retryable)', async () => {
    const backend = new FakeBackend();
    backend.online = false;
    const storage = memory();
    const cloud = new CloudService({ backend, store: new SaveStore(storage), meta: new CloudMetaStore(storage), appVersion: 't', isOnline: () => false });
    cloud.start();
    const t = new FirestoreFeedbackTransport(cloud, { waitForUserMs: 20 });
    const res = await t.submit(payload());
    expect(res).toMatchObject({ status: 'not-sent', retryable: true });
  });

  it('a build without the service says so plainly and is not retryable', async () => {
    const storage = memory();
    const cloud = new CloudService({ backend: null, store: new SaveStore(storage), meta: new CloudMetaStore(storage), appVersion: 't' });
    const res = await new FirestoreFeedbackTransport(cloud).submit(payload());
    expect(res).toMatchObject({ status: 'not-sent', retryable: false });
  });
});

describe('the outbox: drafts survive and are sent when the network returns', () => {
  it('delivers queued copies once, oldest first, then removes them and records only an id and a time', async () => {
    const r = await rig();
    r.drafts.add(payload({ gameplay: 'first' }), new Date(1000), 'pending');
    r.drafts.add(payload({ gameplay: 'second' }), new Date(2000), 'pending');
    r.drafts.add(payload({ gameplay: 'kept locally' }), new Date(3000), 'draft');
    expect(feedbackStatus(r.drafts, r.sent)).toMatchObject({ pending: 2, drafts: 1, failed: 0 });
    const n = await flushFeedbackOutbox(r.drafts, r.transport, r.sent);
    expect(n).toBe(2);
    expect([...r.backend.feedback.values()].map((d) => d.gameplay)).toEqual(['first', 'second']);
    expect(r.drafts.list().map((d) => d.payload.gameplay)).toEqual(['kept locally']);
    expect(r.sent.count).toBe(2);
    expect(JSON.stringify(localStorageDump(r.sent))).not.toContain('first');
    // Flushing again sends nothing new.
    expect(await flushFeedbackOutbox(r.drafts, r.transport, r.sent)).toBe(0);
    expect(r.backend.feedback.size).toBe(2);
  });

  it('stops at the first network failure and keeps everything queued', async () => {
    const r = await rig();
    r.drafts.add(payload({ gameplay: 'a' }), new Date(1), 'pending');
    r.drafts.add(payload({ gameplay: 'b' }), new Date(2), 'pending');
    r.backend.online = false;
    r.online.value = false;
    expect(await flushFeedbackOutbox(r.drafts, r.transport, r.sent)).toBe(0);
    expect(r.drafts.pending().length).toBe(2);
    expect(r.drafts.pending()[0].attempts).toBe(1);
    r.backend.online = true;
    r.online.value = true;
    expect(await flushFeedbackOutbox(r.drafts, r.transport, r.sent)).toBe(2);
  });

  it('a copy the service refuses is marked failed and does not block the others', async () => {
    const r = await rig();
    r.drafts.add(payload({ gameplay: 'bad' }), new Date(1), 'pending');
    r.drafts.add(payload({ gameplay: 'good' }), new Date(2), 'pending');
    r.backend.failNext = { code: 'permission-denied', times: 1 };
    expect(await flushFeedbackOutbox(r.drafts, r.transport, r.sent)).toBe(1);
    expect(r.drafts.list().map((d) => [d.payload.gameplay, d.status])).toEqual([['bad', 'failed']]);
  });

  it('a copy already confirmed earlier is dropped instead of being sent again', async () => {
    const r = await rig();
    const p = payload();
    r.sent.add(p.submissionId);
    r.drafts.add(p, new Date(1), 'pending');
    expect(await flushFeedbackOutbox(r.drafts, r.transport, r.sent)).toBe(0);
    expect(r.drafts.list()).toEqual([]);
    expect(r.backend.feedback.size).toBe(0);
  });
});

function localStorageDump(log: SentLog): unknown {
  return { count: log.count, last: log.last };
}
