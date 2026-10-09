import { UPGRADES } from '../data/upgrades';
import { STARTER_VEHICLE, listVehicles } from '../data/vehicles';
import { MEDAL_RANK } from '../gameplay/scoring';
import type { Garage, LevelRecord, Progress, SaveData, VehicleRecord } from '../storage/SaveStore';
import { MAX_CREDITS, parseGarage, parseProgress } from '../storage/SaveStore';
import type { Medal } from '../data/types';

/**
 * The part of a save that is shared with the cloud: progress, the garage and wallet, a few counters and two
 * preferences. Device-specific settings (graphics quality, touch layout, volumes), the selection and the run
 * history stay on the device.
 */
export interface SyncPayload {
  progress: Progress;
  garage: Garage;
  wallet: { credits: number };
  stats: { missionsPlayed: number; creditsEarned: number; campaignCompleted: boolean };
  story: { seen: string[] };
  prefs: { hudMode: 'standard' | 'minimal' | 'telemetry'; reducedMotion: boolean };
}

export function toPayload(save: SaveData): SyncPayload {
  return {
    progress: structuredClone(save.progress),
    garage: structuredClone(save.garage),
    wallet: { credits: save.wallet.credits },
    stats: { ...save.stats },
    story: { seen: [...save.story.seen] },
    prefs: { hudMode: save.settings.hudMode, reducedMotion: save.settings.reducedMotion },
  };
}

/** Returns a copy of `save` with the shared part replaced by `p` (device-only data is untouched). */
export function applyPayload(save: SaveData, p: SyncPayload): SaveData {
  const next = structuredClone(save);
  next.progress = parseProgress(p.progress);
  next.garage = parseGarage(p.garage);
  next.wallet = { credits: Math.max(0, Math.min(MAX_CREDITS, Math.floor(p.wallet.credits))) };
  next.stats = { ...p.stats };
  next.story = { seen: [...p.story.seen] };
  next.settings.hudMode = p.prefs.hudMode;
  next.settings.reducedMotion = p.prefs.reducedMotion;
  return next;
}

/** Reads a stored cloud save defensively. Anything that is not a version-1 document is "unreadable". */
export function parseCloudSave(raw: unknown): { payload: SyncPayload; revision: number } | 'unreadable' {
  if (!raw || typeof raw !== 'object') return 'unreadable';
  const o = raw as Record<string, unknown>;
  if (o.schema !== 1) return 'unreadable';
  const revision = Number(o.revision);
  if (!Number.isInteger(revision) || revision < 1) return 'unreadable';
  const wallet = (o.wallet ?? {}) as Record<string, unknown>;
  const stats = (o.stats ?? {}) as Record<string, unknown>;
  const prefs = (o.prefs ?? {}) as Record<string, unknown>;
  const story = (o.story ?? {}) as Record<string, unknown>;
  if (typeof o.progress !== 'object' || o.progress === null || typeof o.garage !== 'object' || o.garage === null) return 'unreadable';
  const n = (v: unknown, hi: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(hi, Math.floor(v))) : 0);
  return {
    revision,
    payload: {
      progress: parseProgress(o.progress),
      garage: parseGarage(o.garage),
      wallet: { credits: n(wallet.credits, MAX_CREDITS) },
      stats: { missionsPlayed: n(stats.missionsPlayed, 1e9), creditsEarned: n(stats.creditsEarned, 1e12), campaignCompleted: stats.campaignCompleted === true },
      story: { seen: Array.isArray(story.seen) ? story.seen.filter((x): x is string => typeof x === 'string').slice(0, 32) : [] },
      prefs: {
        hudMode: prefs.hudMode === 'minimal' || prefs.hudMode === 'telemetry' ? prefs.hudMode : 'standard',
        reducedMotion: prefs.reducedMotion === true,
      },
    },
  };
}

// ----------------------------------------------------------------------------------------- comparing

const sortKeys = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, x]) => [k, sortKeys(x)]),
    );
  }
  return v;
};

/** Canonical text of a payload, independent of key order and of the order of unordered lists. */
export function canonical(p: SyncPayload): string {
  const c = structuredClone(p);
  c.garage.owned = [...c.garage.owned].sort();
  c.story.seen = [...c.story.seen].sort();
  // Empty upgrade maps and zero levels carry no information.
  for (const [v, ups] of Object.entries(c.garage.upgrades)) {
    for (const [u, lv] of Object.entries(ups)) if (!lv) delete ups[u];
    if (!Object.keys(ups).length) delete c.garage.upgrades[v];
  }
  return JSON.stringify(sortKeys(c));
}

export const payloadEquals = (a: SyncPayload, b: SyncPayload): boolean => canonical(a) === canonical(b);

/** True for a profile nothing has happened on: no missions, no purchases, no credits, no counters. */
export function isPristine(p: SyncPayload): boolean {
  const noLevels = Object.values(p.progress.levels).every((l) => l.completions === 0);
  const noUps = Object.values(p.garage.upgrades).every((u) => Object.values(u).every((n) => !n));
  const owned = p.garage.owned.filter((v) => v !== STARTER_VEHICLE);
  return noLevels && noUps && owned.length === 0 && p.wallet.credits === 0 && p.stats.missionsPlayed === 0 && p.stats.creditsEarned === 0;
}

// -------------------------------------------------------------------------------------------- economy

const PRICES = new Map(listVehicles().map((v) => [v.id, v.price]));

/** What the vehicles and upgrades in a garage cost in total (the starter vehicle is free). */
export function garageValue(g: Garage): number {
  let total = 0;
  for (const id of g.owned) total += PRICES.get(id) ?? 0;
  for (const [vid, ups] of Object.entries(g.upgrades)) {
    if (!g.owned.includes(vid)) continue;
    for (const [uid, lv] of Object.entries(ups)) {
      const def = (UPGRADES as Record<string, { levels: { cost: number }[] } | undefined>)[uid];
      if (!def) continue;
      for (let i = 0; i < Math.min(lv, def.levels.length); i++) total += def.levels[i].cost;
    }
  }
  return total;
}

/**
 * "Wealth": credits in the wallet plus everything bought with credits. Earning raises it; buying only moves value
 * between the wallet and the garage, so it never goes down. Two devices that earned independently since a common
 * ancestor can therefore be added together without ever creating or erasing credits.
 */
export const wealth = (p: SyncPayload): number => p.wallet.credits + garageValue(p.garage);

// ---------------------------------------------------------------------------------------------- merge

const better = (a: Medal, b: Medal): Medal => (MEDAL_RANK[a] >= MEDAL_RANK[b] ? a : b);

function mergeVehicle(a: VehicleRecord | undefined, b: VehicleRecord | undefined): VehicleRecord {
  if (!a) return structuredClone(b as VehicleRecord);
  if (!b) return structuredClone(a);
  return {
    bestTime: a.bestTime === null ? b.bestTime : b.bestTime === null ? a.bestTime : Math.min(a.bestTime, b.bestTime),
    bestScore: Math.max(a.bestScore, b.bestScore),
    bestComfort: a.bestComfort === null ? b.bestComfort : b.bestComfort === null ? a.bestComfort : Math.max(a.bestComfort, b.bestComfort),
    medal: better(a.medal, b.medal),
    completions: Math.max(a.completions, b.completions),
  };
}

/** Missions only ever move forward: best times are the faster ones, medals the higher ones, counts the larger. */
export function mergeProgress(a: Progress, b: Progress): Progress {
  const out: Progress = { levels: {} };
  for (const id of new Set([...Object.keys(a.levels), ...Object.keys(b.levels)])) {
    const x: LevelRecord | undefined = a.levels[id];
    const y: LevelRecord | undefined = b.levels[id];
    const vehicles: Record<string, VehicleRecord> = {};
    for (const vid of new Set([...Object.keys(x?.vehicles ?? {}), ...Object.keys(y?.vehicles ?? {})])) {
      vehicles[vid] = mergeVehicle(x?.vehicles[vid], y?.vehicles[vid]);
    }
    out.levels[id] = {
      completions: Math.max(x?.completions ?? 0, y?.completions ?? 0),
      medal: better(x?.medal ?? 'none', y?.medal ?? 'none'),
      vehicles,
    };
  }
  return out;
}

export type CombineResult = { ok: true; payload: SyncPayload } | { ok: false; reason: string };

/**
 * Combines two diverged profiles without inventing or losing currency.
 *   - progress: the forward-only merge above;
 *   - garage: every vehicle and upgrade either side owns;
 *   - wealth: with a common ancestor, both sides' independent earnings are added to it; without one the larger
 *     is kept (never both: that could count the same credits twice);
 *   - credits: wealth minus what the combined garage cost, which is refused if it does not fit.
 */
export function combine(local: SyncPayload, cloud: SyncPayload, base: SyncPayload | null): CombineResult {
  const owned = [...new Set([...local.garage.owned, ...cloud.garage.owned])];
  const upgrades: Garage['upgrades'] = {};
  for (const side of [local.garage.upgrades, cloud.garage.upgrades]) {
    for (const [vid, ups] of Object.entries(side)) {
      const mine = (upgrades[vid] ??= {});
      for (const [uid, lv] of Object.entries(ups)) mine[uid] = Math.max(mine[uid] ?? 0, lv);
    }
  }
  const garage: Garage = { owned, upgrades };
  const wl = wealth(local);
  const wc = wealth(cloud);
  const total = base ? Math.max(0, wl + wc - wealth(base)) : Math.max(wl, wc);
  const credits = total - garageValue(garage);
  if (credits < 0) {
    return { ok: false, reason: 'The vehicles and upgrades on the two saves cost more than the credits earned on them together.' };
  }
  return {
    ok: true,
    payload: {
      progress: mergeProgress(local.progress, cloud.progress),
      garage,
      wallet: { credits: Math.min(MAX_CREDITS, Math.floor(credits)) },
      stats: {
        missionsPlayed: Math.max(local.stats.missionsPlayed, cloud.stats.missionsPlayed),
        creditsEarned: base
          ? Math.max(0, local.stats.creditsEarned + cloud.stats.creditsEarned - base.stats.creditsEarned)
          : Math.max(local.stats.creditsEarned, cloud.stats.creditsEarned),
        campaignCompleted: local.stats.campaignCompleted || cloud.stats.campaignCompleted,
      },
      story: { seen: [...new Set([...local.story.seen, ...cloud.story.seen])] },
      prefs: local.prefs,
    },
  };
}

// ---------------------------------------------------------------------------------------------- decide

export interface CloudSnapshot {
  payload: SyncPayload;
  revision: number;
}
export interface SyncBase {
  payload: SyncPayload;
  revision: number;
}

export type SyncDecision =
  | { kind: 'inSync' }
  | { kind: 'upload' }
  | { kind: 'download' }
  | { kind: 'conflict' };

/**
 * What to do with this device's data and the cloud copy. Nothing is ever overwritten silently: a side that has
 * changed since the last sync wins only if the other has not; when both have, the player chooses.
 */
export function decide(local: SyncPayload, cloud: CloudSnapshot | null, base: SyncBase | null): SyncDecision {
  if (!cloud) return isPristine(local) ? { kind: 'inSync' } : { kind: 'upload' };
  if (payloadEquals(local, cloud.payload)) return { kind: 'inSync' };
  if (base && base.revision === cloud.revision) return { kind: 'upload' };
  if (base && payloadEquals(local, base.payload)) return { kind: 'download' };
  if (!base) {
    if (isPristine(local)) return { kind: 'download' };
    if (isPristine(cloud.payload)) return { kind: 'upload' };
  }
  return { kind: 'conflict' };
}

/** A few plain numbers to show a player when they have to choose. */
export interface PayloadSummary {
  missions: number;
  medals: { gold: number; silver: number; bronze: number };
  credits: number;
  vehicles: number;
  upgrades: number;
}

export function summarise(p: SyncPayload): PayloadSummary {
  const medals = { gold: 0, silver: 0, bronze: 0 };
  let missions = 0;
  for (const l of Object.values(p.progress.levels)) {
    if (l.completions > 0) missions++;
    if (l.medal !== 'none') medals[l.medal]++;
  }
  const upgrades = Object.values(p.garage.upgrades).reduce((n, u) => n + Object.values(u).reduce((a, b) => a + b, 0), 0);
  return { missions, medals, credits: p.wallet.credits, vehicles: p.garage.owned.length, upgrades };
}
