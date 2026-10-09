import { describe, expect, it } from 'vitest';
import { UPGRADES } from '../src/data/upgrades';
import { listVehicles } from '../src/data/vehicles';
import { applyPayload, canonical, combine, decide, garageValue, isPristine, mergeProgress, parseCloudSave, payloadEquals, summarise, toPayload, wealth } from '../src/cloud/payload';
import type { SyncPayload } from '../src/cloud/payload';
import { emptySave } from '../src/storage/SaveStore';
import type { Progress, VehicleRecord } from '../src/storage/SaveStore';

const rec = (over: Partial<VehicleRecord> = {}): VehicleRecord => ({ bestTime: 100, bestScore: 50, bestComfort: null, medal: 'bronze', completions: 1, ...over });
const payload = (over: Partial<SyncPayload> = {}): SyncPayload => ({ ...toPayload(emptySave()), ...over });
const ranger = listVehicles().find((v) => v.id === 'druk-ranger')!;

describe('payload basics', () => {
  it('is the shared part of the save only: device settings, selection and history stay behind', () => {
    const save = emptySave();
    save.settings.quality = 'low';
    save.settings.touchSteer = 'wheel';
    save.selection = { levelId: 'pass-run', vehicleId: 'dzo-hatch' };
    const p = toPayload(save);
    expect(JSON.stringify(p)).not.toMatch(/quality|touch|selection|history|volume/i);
    expect(p.prefs).toEqual({ hudMode: 'standard', reducedMotion: false });
  });

  it('applying a payload changes the shared fields and nothing else', () => {
    const save = emptySave();
    save.settings.quality = 'low';
    save.selection = { levelId: 'pass-run', vehicleId: 'dzo-hatch' };
    const p = payload({ wallet: { credits: 77 } });
    const next = applyPayload(save, p);
    expect(next.wallet.credits).toBe(77);
    expect(next.settings.quality).toBe('low');
    expect(next.selection).toEqual(save.selection);
    expect(save.wallet.credits).toBe(0); // the input is not modified
  });

  it('equality ignores key order and list order, and zero upgrade levels', () => {
    const a = payload({ garage: { owned: ['dzo-hatch', 'druk-ranger'], upgrades: { 'dzo-hatch': { engine: 0 } } } });
    const b = payload({ garage: { owned: ['druk-ranger', 'dzo-hatch'], upgrades: {} } });
    expect(payloadEquals(a, b)).toBe(true);
    expect(canonical(a)).toBe(canonical(b));
    expect(payloadEquals(a, payload({ wallet: { credits: 1 } }))).toBe(false);
  });

  it('a fresh profile is pristine; any mission, purchase or credit makes it not', () => {
    expect(isPristine(payload())).toBe(true);
    expect(isPristine(payload({ wallet: { credits: 5 } }))).toBe(false);
    expect(isPristine(payload({ garage: { owned: ['dzo-hatch', 'druk-ranger'], upgrades: {} } }))).toBe(false);
    const prog: Progress = { levels: { 'pass-run': { completions: 1, medal: 'gold', vehicles: { 'dzo-hatch': rec() } } } };
    expect(isPristine(payload({ progress: prog }))).toBe(false);
  });
});

describe('forward-only progress merge', () => {
  it('keeps the faster time, the higher medal and the larger count, per level and vehicle', () => {
    const a: Progress = { levels: { 'pass-run': { completions: 2, medal: 'silver', vehicles: { 'dzo-hatch': rec({ bestTime: 90, medal: 'silver', completions: 2 }) } } } };
    const b: Progress = {
      levels: {
        'pass-run': { completions: 3, medal: 'bronze', vehicles: { 'dzo-hatch': rec({ bestTime: 95, completions: 3 }), 'druk-ranger': rec({ bestTime: 80, medal: 'gold' }) } },
        'chelela-climb': { completions: 1, medal: 'gold', vehicles: { 'druk-ranger': rec({ medal: 'gold' }) } },
      },
    };
    const m = mergeProgress(a, b);
    expect(m.levels['pass-run'].completions).toBe(3);
    expect(m.levels['pass-run'].medal).toBe('silver');
    expect(m.levels['pass-run'].vehicles['dzo-hatch']).toMatchObject({ bestTime: 90, medal: 'silver', completions: 3 });
    expect(m.levels['pass-run'].vehicles['druk-ranger'].bestTime).toBe(80);
    expect(m.levels['chelela-climb'].medal).toBe('gold');
  });

  it('is symmetric and idempotent', () => {
    const a: Progress = { levels: { x: { completions: 1, medal: 'gold', vehicles: { v: rec({ bestTime: 50 }) } } } };
    const b: Progress = { levels: { x: { completions: 4, medal: 'bronze', vehicles: { v: rec({ bestTime: 70 }) } } } };
    expect(mergeProgress(a, b)).toEqual(mergeProgress(b, a));
    const m = mergeProgress(a, b);
    expect(mergeProgress(m, a)).toEqual(m);
  });
});

describe('economy: combining never creates or erases credits', () => {
  const owned = (...ids: string[]) => ({ owned: ['dzo-hatch', ...ids], upgrades: {} });

  it('garage value is the vehicle prices plus every purchased upgrade level', () => {
    const e1 = UPGRADES.engine.levels[0].cost;
    const e2 = UPGRADES.engine.levels[1].cost;
    expect(garageValue({ owned: ['dzo-hatch'], upgrades: {} })).toBe(0);
    expect(garageValue({ owned: ['dzo-hatch', 'druk-ranger'], upgrades: { 'druk-ranger': { engine: 2 } } })).toBe(ranger.price + e1 + e2);
    // Upgrades on a vehicle that is not owned are worth nothing.
    expect(garageValue({ owned: ['dzo-hatch'], upgrades: { 'druk-ranger': { engine: 3 } } })).toBe(0);
  });

  it('wealth does not change when credits are spent on the garage', () => {
    const before = payload({ wallet: { credits: 3000 } });
    const after = payload({ wallet: { credits: 3000 - ranger.price }, garage: owned('druk-ranger') });
    expect(wealth(after)).toBe(wealth(before));
  });

  it('with a common ancestor, independent earnings on both devices add up exactly once', () => {
    const base = payload({ wallet: { credits: 1000 } });
    const local = payload({ wallet: { credits: 1300 } }); // earned 300 here
    const cloud = payload({ wallet: { credits: 1200 } }); // earned 200 elsewhere
    const c = combine(local, cloud, base);
    expect(c.ok).toBe(true);
    if (c.ok) expect(c.payload.wallet.credits).toBe(1500);
  });

  it('buying on one side and earning on the other keeps both the purchase and the earnings', () => {
    const base = payload({ wallet: { credits: 3000 } });
    const local = payload({ wallet: { credits: 3000 - ranger.price }, garage: owned('druk-ranger') }); // bought a vehicle
    const cloud = payload({ wallet: { credits: 3400 } }); // earned 400
    const c = combine(local, cloud, base);
    expect(c.ok).toBe(true);
    if (c.ok) {
      expect(c.payload.garage.owned).toContain('druk-ranger');
      expect(c.payload.wallet.credits).toBe(3400 - ranger.price);
      expect(wealth(c.payload)).toBe(wealth(local) + wealth(cloud) - wealth(base));
    }
  });

  it('without an ancestor the larger wealth is kept, never the sum (that could count the same credits twice)', () => {
    const local = payload({ wallet: { credits: 500 } });
    const cloud = payload({ wallet: { credits: 800 } });
    const c = combine(local, cloud, null);
    expect(c.ok).toBe(true);
    if (c.ok) expect(c.payload.wallet.credits).toBe(800);
  });

  it('refuses to combine when the merged garage costs more than was ever earned', () => {
    const local = payload({ wallet: { credits: 0 }, garage: owned('druk-ranger') });
    const cloud = payload({ wallet: { credits: 0 }, garage: owned('tourist-coaster') });
    const c = combine(local, cloud, null);
    expect(c.ok).toBe(false);
  });

  it('merges upgrades by the higher level, stories by union, and the campaign flag by or', () => {
    const local = payload({ garage: { owned: ['dzo-hatch', 'druk-ranger'], upgrades: { 'druk-ranger': { engine: 1 } } }, story: { seen: ['a'] }, wallet: { credits: 10_000 } });
    const cloud = payload({ garage: { owned: ['dzo-hatch', 'druk-ranger'], upgrades: { 'druk-ranger': { engine: 3, tires: 1 } } }, story: { seen: ['b'] }, stats: { missionsPlayed: 4, creditsEarned: 100, campaignCompleted: true }, wallet: { credits: 10_000 } });
    const c = combine(local, cloud, null);
    expect(c.ok).toBe(true);
    if (c.ok) {
      expect(c.payload.garage.upgrades['druk-ranger']).toEqual({ engine: 3, tires: 1 });
      expect(c.payload.story.seen.sort()).toEqual(['a', 'b']);
      expect(c.payload.stats.campaignCompleted).toBe(true);
    }
  });
});

describe('deciding what to do', () => {
  const doneA: Progress = { levels: { 'pass-run': { completions: 1, medal: 'gold', vehicles: { 'dzo-hatch': rec() } } } };
  const doneB: Progress = { levels: { 'thimphu-pickup': { completions: 1, medal: 'bronze', vehicles: { 'dzo-hatch': rec() } } } };
  const A = payload({ progress: doneA });
  const B = payload({ progress: doneB });

  it('no cloud copy: upload real progress, but do nothing for an empty profile', () => {
    expect(decide(A, null, null)).toEqual({ kind: 'upload' });
    expect(decide(payload(), null, null)).toEqual({ kind: 'inSync' });
  });

  it('identical data is in sync', () => {
    expect(decide(A, { payload: structuredClone(A), revision: 3 }, null)).toEqual({ kind: 'inSync' });
  });

  it('only this device changed since the last sync: upload', () => {
    expect(decide(A, { payload: payload(), revision: 2 }, { payload: payload(), revision: 2 })).toEqual({ kind: 'upload' });
  });

  it('only the cloud changed since the last sync: download', () => {
    expect(decide(A, { payload: B, revision: 3 }, { payload: A, revision: 2 })).toEqual({ kind: 'download' });
  });

  it('both changed: the player has to choose', () => {
    expect(decide(A, { payload: B, revision: 3 }, { payload: payload(), revision: 2 })).toEqual({ kind: 'conflict' });
  });

  it('no shared history: an empty side yields to the other, two real profiles conflict', () => {
    expect(decide(payload(), { payload: B, revision: 4 }, null)).toEqual({ kind: 'download' });
    expect(decide(A, { payload: payload(), revision: 4 }, null)).toEqual({ kind: 'upload' });
    expect(decide(A, { payload: B, revision: 4 }, null)).toEqual({ kind: 'conflict' });
  });

  it('summaries count missions, medals, vehicles and upgrade levels', () => {
    const s = summarise(payload({ progress: { levels: { ...doneA.levels, ...doneB.levels } }, wallet: { credits: 9 }, garage: { owned: ['dzo-hatch', 'druk-ranger'], upgrades: { 'druk-ranger': { engine: 2, tires: 1 } } } }));
    expect(s).toEqual({ missions: 2, medals: { gold: 1, silver: 0, bronze: 1 }, credits: 9, vehicles: 2, upgrades: 3 });
  });
});

describe('reading a stored cloud save', () => {
  const good = () => ({ schema: 1, revision: 4, progress: { levels: {} }, garage: { owned: ['dzo-hatch'], upgrades: {} }, wallet: { credits: 12 }, stats: { missionsPlayed: 1, creditsEarned: 20, campaignCompleted: false }, story: { seen: [] }, prefs: { hudMode: 'minimal', reducedMotion: true } });

  it('accepts a valid document', () => {
    const r = parseCloudSave(good());
    expect(r).not.toBe('unreadable');
    if (r !== 'unreadable') {
      expect(r.revision).toBe(4);
      expect(r.payload.prefs).toEqual({ hudMode: 'minimal', reducedMotion: true });
    }
  });

  it('treats corrupt, missing-field and newer-schema documents as unreadable instead of guessing', () => {
    expect(parseCloudSave(null)).toBe('unreadable');
    expect(parseCloudSave('text')).toBe('unreadable');
    expect(parseCloudSave({ ...good(), schema: 2 })).toBe('unreadable');
    expect(parseCloudSave({ ...good(), revision: 0 })).toBe('unreadable');
    expect(parseCloudSave({ ...good(), progress: null })).toBe('unreadable');
    expect(parseCloudSave({ ...good(), garage: 5 })).toBe('unreadable');
  });

  it('clamps nonsense values rather than trusting them', () => {
    const r = parseCloudSave({ ...good(), wallet: { credits: -50 }, stats: { missionsPlayed: 'many', creditsEarned: 1e99, campaignCompleted: 'yes' }, prefs: { hudMode: 'x' } });
    expect(r).not.toBe('unreadable');
    if (r !== 'unreadable') {
      expect(r.payload.wallet.credits).toBe(0);
      expect(r.payload.stats.missionsPlayed).toBe(0);
      expect(r.payload.stats.creditsEarned).toBeLessThanOrEqual(1e12);
      expect(r.payload.stats.campaignCompleted).toBe(false);
      expect(r.payload.prefs.hudMode).toBe('standard');
    }
  });
});
