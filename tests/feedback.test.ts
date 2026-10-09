import { describe, expect, it } from 'vitest';
import {
  buildPayload,
  cleanText,
  createTransport,
  DraftStore,
  emptyForm,
  exportFileName,
  feedbackAsText,
  HttpEndpointTransport,
  MAX_DRAFTS,
  MAX_TEXT,
  readFeedbackConfig,
  validateFeedback,
} from '../src/services/feedback';

const form = () => ({ ...emptyForm(), rating: 4 });
const payload = () =>
  buildPayload(form(), {
    appVersion: '0.3.0',
    origin: 'menu',
    device: null,
    now: new Date('2026-10-09T00:00:00Z'),
    id: 'fb-test-0001',
  });

describe('feedback validation and privacy', () => {
  it.each([0, -1, 6, 1.5, NaN, Infinity])('rejects rating %s', (rating) => {
    expect(validateFeedback({ ...form(), rating }).ok).toBe(false);
  });
  it.each([1, 2, 3, 4, 5])('accepts rating %s with all optional fields blank', (rating) => {
    expect(validateFeedback({ ...form(), rating }).ok).toBe(true);
  });
  it('validates text and contact boundaries and strips control characters', () => {
    expect(validateFeedback({ ...form(), gameplay: 'x'.repeat(MAX_TEXT) }).ok).toBe(true);
    expect(validateFeedback({ ...form(), gameplay: 'x'.repeat(MAX_TEXT + 1) }).ok).toBe(false);
    expect(validateFeedback({ ...form(), contact: 'invalid address' }).ok).toBe(false);
    expect(validateFeedback({ ...form(), contact: 'player@example.com' }).ok).toBe(true);
    expect(cleanText('  a\u0000b\n c  ')).toBe('ab\n c');
    expect(cleanText(null)).toBe('');
    expect(() => buildPayload(emptyForm(), { appVersion: '0.3.0', origin: 'menu', device: null })).toThrow();
  });
  it('device details and contact remain absent without consent', () => {
    expect(payload()).toMatchObject({ rating: 4, device: null, contact: null, schemaVersion: 1 });
    expect(feedbackAsText(payload())).not.toContain('Device:');
    expect(exportFileName(payload())).toBe('cbhr-feedback-2026-10-09.json');
    const p = buildPayload(
      { ...form(), interest: { ...form().interest, playLargerVersion: false } },
      { appVersion: '0.3.0', origin: 'about', device: null },
    );
    expect(feedbackAsText(p)).toContain('Would play a larger version: no');
  });
  it('default configuration cannot send feedback and rejects insecure endpoints', async () => {
    const config = readFeedbackConfig({
      VITE_FEEDBACK_ENDPOINT: 'http://example.com',
      VITE_FEEDBACK_MAILTO: 'invalid',
    });
    expect(config).toEqual({ endpoint: null, mailto: null });
    const transport = createTransport(config);
    expect(transport.delivers).toBe(false);
    expect((await transport.submit(payload())).status).toBe('not-sent');
  });
  it('only a successful HTTP response is delivery; errors never claim success', async () => {
    for (const status of [200, 400, 503]) {
      const fetcher: typeof fetch = async (_url, init) => {
        expect(init?.credentials).toBe('omit');
        expect(init?.referrerPolicy).toBe('no-referrer');
        expect(JSON.parse(init!.body as string)).toEqual(payload());
        return new Response('', { status });
      };
      const result = await new HttpEndpointTransport('https://example.com', fetcher).submit(payload());
      expect(result.status).toBe(status === 200 ? 'sent' : 'not-sent');
    }
    const failing: typeof fetch = async () => {
      throw new Error('offline');
    };
    expect((await new HttpEndpointTransport('https://example.com', failing).submit(payload())).status).toBe(
      'not-sent',
    );
  });
});

describe('local feedback drafts', () => {
  it('bounded drafts persist, export intact and remove by unique id even at capacity', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (k: string) => values.get(k) ?? null,
      setItem: (k: string, v: string) => {
        values.set(k, v);
      },
    };
    const drafts = new DraftStore(storage);
    for (let i = 0; i < MAX_DRAFTS + 3; i++) drafts.add(payload(), new Date(0));
    const restored = new DraftStore(storage);
    expect(restored.list()).toHaveLength(MAX_DRAFTS);
    expect(new Set(restored.list().map((x) => x.id)).size).toBe(MAX_DRAFTS);
    expect(restored.list()[0].payload).toEqual(payload());
    restored.remove(restored.list()[0].id);
    expect(restored.list()).toHaveLength(MAX_DRAFTS - 1);
    restored.clear();
    expect(new DraftStore(storage).list()).toEqual([]);
  });
  it('corrupt storage is recoverable and blocked storage is reported honestly', () => {
    const store = new DraftStore({
      getItem: () => 'broken',
      setItem: () => {
        throw new Error('quota');
      },
    });
    store.add(payload());
    expect(store.list()).toHaveLength(1);
    expect(store.persisted).toBe(false);
    const memory = new DraftStore(null);
    memory.add(payload());
    expect(memory.persisted).toBe(false);
  });
});
