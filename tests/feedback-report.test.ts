import { describe, expect, it } from 'vitest';
import { annotate, filterRecords, fromFirestoreFields, normalizeRecord, platformOf, redactText, summarize, toCsv, toJson, TOPICS } from '../scripts/feedback/core.mjs';
import { buildReport, loadDocs, parseArgs, sampleDocs } from '../scripts/feedback-report.mjs';

const doc = (over: Record<string, unknown> = {}) => ({
  clientAt: Date.UTC(2026, 9, 12, 10),
  appVersion: '0.4.0-beta.1',
  origin: 'results',
  rating: 4,
  gameplay: '',
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
  interest: { playLargerVersion: null, considerPurchasingFullGame: null, priceRange: null, voluntarySupport: null },
  ...over,
});
const rec = (id: string, over: Record<string, unknown> = {}) => annotate([normalizeRecord(id, doc(over))])[0];

describe('feedback report: privacy', () => {
  it('redacts emails, phone numbers and handles from text', () => {
    expect(redactText('mail me at jo.doe+cbhr@example.co.uk or call +975 17 123 456, or @jo_doe on x')).toBe('mail me at [email] or call [number], or [handle] on x');
    expect(redactText(null)).toBe('');
  });

  it('exports are redacted by default: no contact address, no emails in any file', () => {
    const records = annotate([normalizeRecord('a', doc({ contact: 'secret.person@example.com', bugs: 'write to me at secret.person@example.com', device: { userAgent: 'Mozilla/5.0 (Windows NT 10.0)', platform: 'Win32', touch: false, quality: 'high' } }))]);
    const summary = summarize(records);
    for (const text of [toCsv(records), toCsv(records, { includeText: false }), toJson(records, summary)]) {
      expect(text).not.toContain('secret.person@example.com');
      expect(text).not.toContain('Mozilla/5.0');
    }
    expect(toCsv(records, { redact: false })).toContain('secret.person@example.com'); // only when asked for
    expect(toCsv(records, { includeText: false })).not.toContain('write to me');
  });

  it('the generated HTML never embeds contacts or user-agent strings unless asked, and cannot break out of its script tags', () => {
    const docs = sampleDocs(40).map((d) => ({ ...d, doc: { ...d.doc, contact: 'leak@example.com', bugs: '</script><script>alert(1)</script>' } }));
    const { files } = buildReport({ docs, source: 'test', sample: false }, {});
    expect(files['report.html']).not.toContain('leak@example.com');
    expect(files['report.html']).not.toContain('Mozilla/5.0');
    expect(files['report.html']).not.toContain('</script><script>alert(1)');
    expect(files['report.html']).toContain('CONFIDENTIAL');
    const withContacts = buildReport({ docs, source: 'test', sample: false }, { 'include-contacts': true });
    expect(withContacts.files['report.html']).toContain('leak@example.com');
  });

  it('the report script is valid JavaScript (no duplicate declarations between the core and the page code)', () => {
    const { files } = buildReport({ docs: sampleDocs(5), source: 'test', sample: true }, {});
    const html = files['report.html'];
    const start = html.lastIndexOf('<script>') + '<script>'.length;
    const code = html.slice(start, html.lastIndexOf('</script>'));
    expect(code.length).toBeGreaterThan(1000);
    expect(() => new Function(code)).not.toThrow(); // an early error (such as a redeclared const) would throw here
  });

  it('spreadsheet formulas in comments are neutralised in CSV', () => {
    const r = annotate([normalizeRecord('f', doc({ bugs: '=HYPERLINK("http://evil","x")', improve: '+cmd|calc' }))]);
    const lines = toCsv(r).split('\n');
    expect(lines[1]).toContain(`"'=HYPERLINK(""http://evil"",""x"")"`);
    expect(lines[1]).toContain("'+cmd|calc");
  });
});

describe('feedback report: classification is transparent and local', () => {
  it('finds complaints, requests and praise only in the fields that can state them', () => {
    const r = rec('t', { performance: 'Lots of lag and stutter on my phone', add: 'Please add multiplayer races with friends', favourite: 'The music and the mountain scenery', controls: 'Touch buttons are too small' });
    expect(r.topics).toEqual(expect.arrayContaining(['perf', 'req-multiplayer', 'love-music', 'love-scenery', 'controls-touch']));
    // "music" in the "add" box is a request for more music, not praise.
    const r2 = rec('u', { add: 'more music please' });
    expect(r2.topics).toContain('req-sound');
    expect(r2.topics).not.toContain('love-music');
  });

  it('every rule has a label, a group, fields and at least one pattern, and ids are unique', () => {
    expect(new Set(TOPICS.map((t: { id: string }) => t.id)).size).toBe(TOPICS.length);
    for (const t of TOPICS) {
      expect(t.label.length).toBeGreaterThan(3);
      expect(['complaint', 'request', 'praise']).toContain(t.group);
      expect(t.fields.length).toBeGreaterThan(0);
      expect(t.patterns.length).toBeGreaterThan(0);
    }
  });

  it('does not invent topics from empty answers', () => {
    expect(rec('e', {}).topics).toEqual([]);
  });
});

describe('feedback report: analytics', () => {
  const docs = [
    doc({ rating: 5, appVersion: '0.4.0-beta.1', clientAt: Date.UTC(2026, 9, 10), favourite: 'great music', interest: { playLargerVersion: true, considerPurchasingFullGame: true, priceRange: '5to10', voluntarySupport: true }, device: { userAgent: 'Mozilla/5.0 (Windows NT 10.0)', platform: 'Win32', touch: false, quality: 'high' } }),
    doc({ rating: 4, appVersion: '0.4.0-beta.1', clientAt: Date.UTC(2026, 9, 10, 5), performance: 'laggy on phone', difficulty: 'tooDifficult', interest: { playLargerVersion: true, considerPurchasingFullGame: false, priceRange: 'none', voluntarySupport: null }, device: { userAgent: 'Mozilla/5.0 (Linux; Android 14)', platform: 'Linux armv8l', touch: true, quality: 'low' } }),
    doc({ rating: 1, appVersion: '0.3.0', clientAt: Date.UTC(2026, 9, 11), bugs: 'crash on start, black screen', add: 'more routes', origin: 'menu' }),
  ];
  const records = annotate(docs.map((d, i) => normalizeRecord(`r${i}`, d)));
  const s = summarize(records);

  it('totals, average rating and distribution', () => {
    expect(s.total).toBe(3);
    expect(s.avgRating).toBe(3.3);
    expect(s.distribution.map((d: { count: number }) => d.count)).toEqual([1, 0, 0, 1, 1]);
    expect(s.positivePct).toBeCloseTo(66.7, 1);
    expect(s.negativePct).toBeCloseTo(33.3, 1);
  });

  it('submissions over time and version breakdown', () => {
    expect(s.byDay.map((d: { day: string; count: number }) => [d.day, d.count])).toEqual([['2026-10-10', 2], ['2026-10-11', 1]]);
    expect(s.versions[0]).toMatchObject({ version: '0.4.0-beta.1', count: 2, avg: 4.5 });
  });

  it('platform breakdown counts only players who opted in', () => {
    expect(s.deviceShared).toMatchObject({ count: 2 });
    expect(s.platforms.map((p: { os: string }) => p.os).sort()).toEqual(['Android', 'Windows']);
    expect(platformOf(null).os).toBe('Not shared');
    expect(s.kinds.find((k: { kind: string }) => k.kind === 'Phone or tablet')?.count).toBe(1);
  });

  it('interest, price range and difficulty', () => {
    expect(s.interest.largerVersion).toMatchObject({ answered: 2, yes: 2, yesPct: 100 });
    expect(s.interest.purchase).toMatchObject({ answered: 2, yes: 1, yesPct: 50 });
    expect(s.interest.voluntarySupport).toMatchObject({ answered: 1, yes: 1 });
    expect(s.interest.prices.find((p: { price: string }) => p.price === '5to10')?.count).toBe(1);
    expect(s.difficulty.find((d: { difficulty: string }) => d.difficulty === 'tooDifficult')?.count).toBe(1);
  });

  it('topics: complaints, requests and praise are ranked with their average rating', () => {
    expect(s.complaints.map((t: { id: string }) => t.id)).toEqual(expect.arrayContaining(['perf', 'crash']));
    expect(s.requests.map((t: { id: string }) => t.id)).toContain('req-routes');
    expect(s.praise.map((t: { id: string }) => t.id)).toContain('love-music');
    expect(s.complaints.find((t: { id: string; avg: number }) => t.id === 'crash')?.avg).toBe(1);
  });

  it('filters by version, platform, rating, topic, dates and text, and the summary follows', () => {
    expect(filterRecords(records, { version: '0.3.0' })).toHaveLength(1);
    expect(filterRecords(records, { os: 'Android' })).toHaveLength(1);
    expect(filterRecords(records, { minRating: 4 })).toHaveLength(2);
    expect(filterRecords(records, { maxRating: 2 })).toHaveLength(1);
    expect(filterRecords(records, { topic: 'perf' })).toHaveLength(1);
    expect(filterRecords(records, { from: '2026-10-11' })).toHaveLength(1);
    expect(filterRecords(records, { to: '2026-10-10' })).toHaveLength(2);
    expect(filterRecords(records, { text: 'BLACK SCREEN' })).toHaveLength(1);
    expect(filterRecords(records, { origin: 'menu', version: '0.3.0' })).toHaveLength(1);
    expect(summarize(filterRecords(records, { minRating: 4 })).avgRating).toBe(4.5);
  });

  it('an empty selection summarises to zeros without throwing', () => {
    const e = summarize([]);
    expect(e.total).toBe(0);
    expect(e.avgRating).toBe(0);
    expect(e.range).toBeNull();
    expect(e.interest.largerVersion.yesPct).toBe(0);
  });
});

describe('feedback report: inputs', () => {
  it('converts Firestore REST typed values', () => {
    const plain = fromFirestoreFields({
      rating: { integerValue: '5' },
      bugs: { stringValue: 'hello' },
      contact: { nullValue: null },
      createdAt: { timestampValue: '2026-10-12T10:00:00Z' },
      interest: { mapValue: { fields: { playLargerVersion: { booleanValue: true }, priceRange: { nullValue: null } } } },
    });
    expect(plain).toEqual({ rating: 5, bugs: 'hello', contact: null, createdAt: Date.UTC(2026, 9, 12, 10), interest: { playLargerVersion: true, priceRange: null } });
    const r = normalizeRecord('x', plain);
    expect(r.rating).toBe(5);
    expect(r.interest.playLargerVersion).toBe(true);
  });

  it('is tolerant of junk documents', () => {
    const r = normalizeRecord('j', { rating: 'nine', appVersion: 7, interest: 'no', difficulty: 'weird', createdAt: 'never' });
    expect(r.rating).toBe(0);
    expect(r.appVersion).toBe('unknown');
    expect(r.difficulty).toBeNull();
    expect(r.interest.playLargerVersion).toBeNull();
    expect(() => annotate([normalizeRecord('n', null)])).not.toThrow();
  });

  it('sample data is deterministic and clearly labelled', () => {
    expect(sampleDocs(30)).toEqual(sampleDocs(30));
    const { files } = buildReport({ docs: sampleDocs(30), source: 'sample data (30)', sample: true }, {});
    expect(files['report.html']).toContain('SAMPLE DATA');
    expect(Object.keys(files).sort()).toEqual(['feedback-stats-only.csv', 'feedback.csv', 'feedback.json', 'report.html', 'summary.json']);
  });

  it('refuses a service-account key inside the repository and asks for a source when there is none', async () => {
    await expect(loadDocs({ credentials: 'package.json' }, {})).rejects.toThrow(/inside the repository/);
    await expect(loadDocs({}, {})).rejects.toThrow(/No data source/);
  });

  it('parses its command line', () => {
    expect(parseArgs(['--sample', '--open', '--min-rating', '2'])).toMatchObject({ sample: 150, open: true, 'min-rating': '2' });
    expect(parseArgs(['--sample', '20']).sample).toBe(20);
  });
});
