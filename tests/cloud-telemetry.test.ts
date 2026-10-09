import { describe, expect, it, vi } from 'vitest';
import { perfTierOf, platformOf, routeFraction, severityFor, validIncident } from '../src/cloud/events';
import type { GameEvent } from '../src/cloud/events';
import { PrivacyStore } from '../src/cloud/privacy';
import { IncidentLog, Telemetry, histogram, sampleIncidents } from '../src/cloud/Telemetry';
import { FakeBackend } from './helpers/fakeCloud';

const memory = () => {
  const m = new Map<string, string>();
  return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

const crash = (at = 0.4, over: Partial<Extract<GameEvent, { name: 'incident' }>> = {}): GameEvent => ({ name: 'incident', type: 'collision', levelId: 'pass-run', at, vehicleId: 'dzo-hatch', severity: 'medium', ...over });

function rig(opts: { consent?: boolean; signedIn?: boolean } = {}) {
  const storage = memory();
  const privacy = new PrivacyStore(storage);
  if (opts.consent) privacy.setAnalytics(true);
  const backend = new FakeBackend();
  if (opts.signedIn !== false) backend.current = { uid: 'u1', email: null, password: null, anonymous: true, verified: false };
  const incidents = new IncidentLog(storage);
  let t = 1_000_000;
  const tele = new Telemetry({
    privacy,
    incidents,
    backend: () => backend,
    uid: () => (backend.current ? 'u1' : null),
    context: () => ({ appVersion: 'test', platform: 'desktop', qualityTier: 'high', perfTier: 'high' }),
    now: () => t,
    minGapMs: 1000,
    intervalMs: 100_000_000,
  });
  return { tele, privacy, backend, incidents, storage, tick: (ms: number) => void (t += ms) };
}

describe('consent', () => {
  it('statistics are off by default and nothing is aggregated, queued or sent without consent', async () => {
    const r = rig();
    expect(r.privacy.analytics).toBe(false);
    expect(r.privacy.decided).toBe(false);
    r.tele.track({ name: 'game_session_started', platform: 'desktop', qualityTier: 'high', perfTier: 'high' });
    r.tele.track({ name: 'mission_started', levelId: 'pass-run', vehicleId: 'dzo-hatch', conditions: 'clear-day', attempt: 1 });
    r.tele.track(crash());
    expect(r.tele.peek()).toEqual({ counters: {}, vehicles: {}, levels: {}, upgrades: {}, incidents: [] });
    expect(await r.tele.flush('manual')).toBe(false);
    expect(r.backend.telemetry.size).toBe(0);
    expect(r.backend.analyticsLog).toEqual([]);
    expect(r.backend.calls.submitTelemetry ?? 0).toBe(0);
  });

  it('incidents are still kept on this device for the developer heatmap, because they never leave it', () => {
    const r = rig();
    r.tele.track(crash(0.31));
    expect(r.incidents.list().map((i) => i.at)).toEqual([0.31]);
  });

  it('turning statistics on starts collecting; turning them off discards what had not been sent', async () => {
    const r = rig({ consent: true });
    r.tele.track({ name: 'mission_started', levelId: 'pass-run', vehicleId: 'dzo-hatch', conditions: 'clear-day', attempt: 1 });
    expect(r.tele.peek().counters.missionsStarted).toBe(1);
    r.privacy.setAnalytics(false);
    expect(r.tele.peek().counters).toEqual({});
    r.tele.track({ name: 'mission_started', levelId: 'pass-run', vehicleId: 'dzo-hatch', conditions: 'clear-day', attempt: 1 });
    expect(r.tele.peek().counters).toEqual({});
    expect(await r.tele.flush('manual')).toBe(false);
    expect(r.backend.analyticsEnabled).toBe(false);
  });

  it('the choice persists, a dismissal is not a yes, and corrupt storage falls back to off', () => {
    const storage = memory();
    const p = new PrivacyStore(storage);
    p.dismiss();
    expect(p.value).toMatchObject({ analytics: false, decided: true });
    p.setAnalytics(true);
    expect(new PrivacyStore(storage).analytics).toBe(true);
    storage.setItem('cbhr.v1.privacy', '{broken');
    expect(new PrivacyStore(storage).analytics).toBe(false);
  });

  it('a signed-out player never uploads, even after consent', async () => {
    const r = rig({ consent: true, signedIn: false });
    r.tele.track(crash());
    expect(await r.tele.flush('manual')).toBe(false);
    expect(r.backend.telemetry.size).toBe(0);
  });
});

describe('aggregation and data minimisation', () => {
  it('folds events into counters per session rather than one write per event', async () => {
    const r = rig({ consent: true });
    r.tele.track({ name: 'game_session_started', platform: 'desktop', qualityTier: 'high', perfTier: 'high' });
    for (let i = 1; i <= 3; i++) r.tele.track({ name: 'mission_started', levelId: 'pass-run', vehicleId: 'dzo-hatch', conditions: 'clear-day', attempt: i });
    r.tele.track({ name: 'mission_completed', levelId: 'pass-run', vehicleId: 'dzo-hatch', seconds: 141.6, medal: 'gold', attempts: 3 });
    r.tele.track({ name: 'mission_failed', levelId: 'thimphu-pickup', vehicleId: 'dzo-hatch', reason: 'timeout', seconds: 190 });
    r.tele.track({ name: 'upgrade_purchased', vehicleId: 'druk-ranger', upgradeId: 'engine', level: 1 });
    r.tele.track({ name: 'vehicle_selected', vehicleId: 'druk-ranger' });
    r.tele.track({ name: 'feedback_submitted', rating: 4 });
    const a = r.tele.peek();
    expect(a.counters).toMatchObject({ sessions: 1, missionsStarted: 3, retries: 2, missionsCompleted: 1, missionsFailed: 1, upgradesPurchased: 1, feedbackSubmitted: 1 });
    expect(a.levels['pass-run']).toMatchObject({ started: 3, completed: 1, medal_gold: 1, seconds: 142 });
    expect(a.vehicles['druk-ranger']).toBe(1);
    expect(a.upgrades['druk-ranger.engine']).toBe(1);
    expect(await r.tele.flush('manual')).toBe(true);
    expect(r.backend.calls.submitTelemetry).toBe(1); // one document, not eleven
  });

  it('the uploaded document contains no e-mail, no coordinates, no input data and only whitelisted fields', async () => {
    const r = rig({ consent: true });
    r.tele.track(crash(0.42));
    await r.tele.flush('manual');
    const doc = [...r.backend.telemetry.values()][0];
    const text = JSON.stringify(doc);
    expect(text).not.toMatch(/@|"(email|lat|lng|gps|latitude|longitude|x|z|keys?|input|password)"/i);
    expect(Object.keys(doc).sort()).toEqual(['appVersion', 'counters', 'endedAt', 'incidents', 'levels', 'perfTier', 'platform', 'qualityTier', 'sessionId', 'startedAt', 'uid', 'upgrades', 'vehicles'].sort());
    expect(doc.incidents).toEqual([{ type: 'collision', levelId: 'pass-run', at: 0.42, vehicleId: 'dzo-hatch', severity: 'medium' }]);
  });

  it('uploads when twelve incidents have accumulated, in documents of at most twelve', async () => {
    const r = rig({ consent: true });
    for (let i = 0; i < 12; i++) {
      r.tick(2000);
      r.tele.track(crash(i / 20));
    }
    await vi.waitFor(() => expect(r.backend.telemetry.size).toBe(1));
    expect(([...r.backend.telemetry.values()][0].incidents as unknown[]).length).toBe(12);
    expect(r.tele.peek().incidents.length).toBe(0);
  });

  it('keeps an unsent summary while offline and retries; a gap between uploads limits the write rate', async () => {
    const r = rig({ consent: true });
    r.backend.online = false;
    r.tele.track(crash());
    expect(await r.tele.flush('manual')).toBe(false);
    expect(r.tele.peek().incidents.length).toBe(1); // still there
    r.backend.online = true;
    expect(await r.tele.flush('manual')).toBe(true);
    // Within the minimum gap an interval flush does nothing.
    r.tele.track(crash(0.5));
    expect(await r.tele.flush('interval')).toBe(false);
    r.tick(5000);
    expect(await r.tele.flush('interval')).toBe(true);
    expect(r.backend.telemetry.size).toBe(2);
    expect([...r.backend.telemetry.keys()][1]).toMatch(/-2$/);
  });

  it('semantic events (not incidents) also go to product analytics, as flat primitive parameters', () => {
    const r = rig({ consent: true });
    r.tele.track({ name: 'mission_completed', levelId: 'pass-run', vehicleId: 'dzo-hatch', seconds: 141.234, medal: 'gold', attempts: 2 });
    r.tele.track(crash());
    expect(r.backend.analyticsLog).toEqual([{ name: 'mission_completed', params: { levelId: 'pass-run', vehicleId: 'dzo-hatch', seconds: 141.23, medal: 'gold', attempts: 2 } }]);
  });
});

describe('route positions, never places', () => {
  it('normalises a distance along the road to 0..1 and clamps it', () => {
    expect(routeFraction(100, 100, 1100)).toBe(0);
    expect(routeFraction(600, 100, 1100)).toBe(0.5);
    expect(routeFraction(1100, 100, 1100)).toBe(1);
    expect(routeFraction(-50, 100, 1100)).toBe(0);
    expect(routeFraction(5000, 100, 1100)).toBe(1);
    expect(routeFraction(NaN, 100, 1100)).toBe(0);
    expect(routeFraction(500, 100, 100)).toBe(0);
    expect(routeFraction(433.4567, 0, 1000)).toBe(0.433);
  });

  it('buckets impact speed into severities and classifies devices coarsely', () => {
    expect([2, 8, 20].map(severityFor)).toEqual(['low', 'medium', 'high']);
    expect(platformOf(null)).toBe('unknown');
    expect(platformOf({ innerWidth: 1280, innerHeight: 720, matchMedia: () => ({ matches: false }) })).toBe('desktop');
    expect(platformOf({ innerWidth: 800, innerHeight: 360, matchMedia: () => ({ matches: true }) })).toBe('phone');
    expect(platformOf({ innerWidth: 1180, innerHeight: 820, matchMedia: () => ({ matches: true }) })).toBe('tablet');
    expect(perfTierOf(undefined, undefined, 'high')).toBe('unknown');
    expect(perfTierOf(4, 8, 'high')).toBe('low');
    expect(perfTierOf(12, 16, 'high')).toBe('high');
    expect(perfTierOf(8, 4, 'medium')).toBe('mid');
  });

  it('rejects incidents with out-of-range positions or unknown types', () => {
    expect(validIncident({ type: 'collision', levelId: 'pass-run', at: 0.5, vehicleId: 'x', severity: 'low' })).toBe(true);
    expect(validIncident({ type: 'collision', levelId: 'pass-run', at: 1.2, vehicleId: 'x', severity: 'low' })).toBe(false);
    expect(validIncident({ type: 'keypress' as never, levelId: 'pass-run', at: 0.5, vehicleId: 'x', severity: 'low' })).toBe(false);
    expect(validIncident({ type: 'collision', levelId: 'pass-run', at: NaN, vehicleId: 'x', severity: 'low' })).toBe(false);
  });
});

describe('local incident log and the sample dataset', () => {
  it('is bounded, persistent and ignores invalid entries', () => {
    const storage = memory();
    const log = new IncidentLog(storage);
    for (let i = 0; i < 350; i++) log.add({ type: 'collision', levelId: 'pass-run', at: (i % 100) / 100, vehicleId: 'dzo-hatch', severity: 'low' }, i);
    log.add({ type: 'collision', levelId: 'pass-run', at: 7, vehicleId: 'dzo-hatch', severity: 'low' });
    expect(log.list().length).toBe(300);
    expect(new IncidentLog(storage).list().length).toBe(300);
    expect(log.list('gmc-plains')).toEqual([]);
    log.clear();
    expect(new IncidentLog(storage).list()).toEqual([]);
  });

  it('the sample dataset is deterministic, valid, and clusters around a few hot spots', () => {
    const a = sampleIncidents('pass-run', ['dzo-hatch']);
    const b = sampleIncidents('pass-run', ['dzo-hatch']);
    expect(a).toEqual(b);
    expect(a.every((i) => validIncident(i))).toBe(true);
    const h = histogram(a, 20);
    expect(h.reduce((x, y) => x + y, 0)).toBe(a.length);
    expect(Math.max(...h)).toBeGreaterThan(a.length / 12); // not uniform
    expect(sampleIncidents('gmc-plains', ['dzo-hatch'])).not.toEqual(a);
  });
});
