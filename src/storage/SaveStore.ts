import type { Medal } from '../data/types';
import { clamp } from '../core/math';
import { MEDAL_RANK } from '../gameplay/scoring';
import { listVehicles, STARTER_VEHICLE } from '../data/vehicles';
import { MAX_UPGRADE_LEVEL, nextUpgradeCost } from '../data/upgrades';
import type { UpgradeId } from '../data/types';

export type QualityLevel = 'low' | 'medium' | 'high';
export type TouchMode = 'auto' | 'on' | 'off';

export interface Settings {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  muted: boolean;
  quality: QualityLevel;
  touchControls: TouchMode;
  /** Touch steering response, 0.6 (calm) .. 1.6 (sharp). */
  touchSensitivity: number;
  /** Less camera shake and no decorative motion. Also on automatically when the OS asks for reduced motion. */
  reducedMotion: boolean;
  /** Driving HUD detail: everything, only the essentials, or extra telemetry. */
  hudMode: 'standard' | 'minimal' | 'telemetry';
}

export interface VehicleRecord {
  bestTime: number | null;
  bestScore: number;
  /** Best average passenger comfort (comfort missions only). */
  bestComfort: number | null;
  medal: Medal;
  completions: number;
}

export interface LevelRecord {
  /** Completed runs across all vehicles. */
  completions: number;
  /** Best medal across all vehicles. */
  medal: Medal;
  vehicles: Record<string, VehicleRecord>;
}

export interface Progress {
  levels: Record<string, LevelRecord>;
}

export interface Selection {
  levelId: string | null;
  vehicleId: string | null;
}

export interface HistoryEntry {
  levelId: string;
  vehicleId: string;
  time: number;
  medal: Medal;
  score: number;
  comfort: number | null;
  /** Epoch ms. */
  at: number;
}

export interface Garage {
  /** Vehicle ids the player owns. */
  owned: string[];
  /** Purchased upgrade levels per vehicle id (0..3 each). */
  upgrades: Record<string, Record<string, number>>;
}

export interface SaveData {
  version: typeof SAVE_VERSION;
  settings: Settings;
  progress: Progress;
  selection: Selection;
  history: HistoryEntry[];
  /** Driving credits: a fictional in-game currency earned by playing. Never bought with real money. */
  wallet: { credits: number };
  garage: Garage;
  /** Story briefings already read (so restarts and replays skip straight to the road). */
  story: { seen: string[] };
  stats: { missionsPlayed: number; creditsEarned: number; campaignCompleted: boolean };
}

/** The Stage 2 document, kept only so it can be migrated. */
export interface SaveDataV2 {
  version: 2;
  settings: Settings;
  progress: Progress;
  selection: Selection;
  history: HistoryEntry[];
}

export const SAVE_VERSION = 3 as const;
export const SAVE_KEY = 'cbhr.v3.save';
/** Stage 2 key: migrated to v3, left untouched. */
export const SAVE_KEY_V2 = 'cbhr.v2.save';
export const MAX_CREDITS = 9_999_999;
/** Stage 1 keys: still read for migration, never deleted (so rolling back the game loses nothing). */
export const LEGACY_SETTINGS_KEY = 'cbhr.v1.settings';
export const LEGACY_PROGRESS_KEY = 'cbhr.v1.progress';
const LEGACY_VEHICLE = 'druk-ranger';
const HISTORY_LIMIT = 30;

export const defaultSettings = (quality: QualityLevel = 'medium'): Settings => ({
  masterVolume: 0.8,
  musicVolume: 0.5,
  sfxVolume: 0.9,
  muted: false,
  quality,
  touchControls: 'auto',
  touchSensitivity: 1,
  reducedMotion: false,
  hudMode: 'standard',
});

export const emptySave = (quality: QualityLevel = 'medium'): SaveData => ({
  version: SAVE_VERSION,
  settings: defaultSettings(quality),
  progress: { levels: {} },
  selection: { levelId: null, vehicleId: null },
  history: [],
  wallet: { credits: 0 },
  garage: { owned: [STARTER_VEHICLE], upgrades: {} },
  story: { seen: [] },
  stats: { missionsPlayed: 0, creditsEarned: 0, campaignCompleted: false },
});

const isQuality = (v: unknown): v is QualityLevel => v === 'low' || v === 'medium' || v === 'high';
const isTouch = (v: unknown): v is TouchMode => v === 'auto' || v === 'on' || v === 'off';
const isMedal = (v: unknown): v is Medal => v === 'gold' || v === 'silver' || v === 'bronze' || v === 'none';
const num = (v: unknown, fallback: number, lo: number, hi: number): number =>
  typeof v === 'number' && isFinite(v) ? clamp(v, lo, hi) : fallback;
const rec = (v: unknown): Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/** Defensive parse: corrupt, partial or old data falls back field-by-field to defaults. */
export function parseSettings(raw: unknown, fallback: Settings): Settings {
  const o = rec(raw);
  return {
    masterVolume: num(o.masterVolume, fallback.masterVolume, 0, 1),
    musicVolume: num(o.musicVolume, fallback.musicVolume, 0, 1),
    sfxVolume: num(o.sfxVolume, fallback.sfxVolume, 0, 1),
    muted: typeof o.muted === 'boolean' ? o.muted : fallback.muted,
    quality: isQuality(o.quality) ? o.quality : fallback.quality,
    touchControls: isTouch(o.touchControls) ? o.touchControls : fallback.touchControls,
    touchSensitivity: num(o.touchSensitivity, fallback.touchSensitivity, 0.6, 1.6),
    reducedMotion: typeof o.reducedMotion === 'boolean' ? o.reducedMotion : fallback.reducedMotion,
    hudMode: o.hudMode === 'minimal' || o.hudMode === 'telemetry' || o.hudMode === 'standard' ? o.hudMode : fallback.hudMode,
  };
}

function parseVehicleRecord(raw: unknown): VehicleRecord {
  const o = rec(raw);
  const bt = o.bestTime;
  return {
    bestTime: typeof bt === 'number' && isFinite(bt) && bt > 0 ? bt : null,
    bestScore: num(o.bestScore, 0, 0, 100),
    bestComfort:
      typeof o.bestComfort === 'number' && isFinite(o.bestComfort) ? clamp(o.bestComfort, 0, 100) : null,
    medal: isMedal(o.medal) ? o.medal : 'none',
    completions: Math.floor(num(o.completions, 0, 0, 1e9)),
  };
}

export function parseProgress(raw: unknown): Progress {
  const out: Progress = { levels: {} };
  for (const [id, v] of Object.entries(rec(rec(raw).levels))) {
    const o = rec(v);
    const vehicles: Record<string, VehicleRecord> = {};
    for (const [vid, vr] of Object.entries(rec(o.vehicles))) vehicles[vid] = parseVehicleRecord(vr);
    const completions = Math.floor(num(o.completions, 0, 0, 1e9));
    out.levels[id] = { completions, medal: isMedal(o.medal) ? o.medal : 'none', vehicles };
  }
  return out;
}

/** Stage 1 progress: { levels: { id: { bestTime, medal, completions } } } became per-vehicle records. */
export function migrateV1Progress(raw: unknown): Progress {
  const out: Progress = { levels: {} };
  for (const [id, v] of Object.entries(rec(rec(raw).levels))) {
    const o = rec(v);
    const rec1 = parseVehicleRecord(o);
    if (rec1.bestTime === null && rec1.completions === 0) continue;
    out.levels[id] = {
      completions: Math.max(rec1.completions, rec1.bestTime !== null ? 1 : 0),
      medal: rec1.medal,
      vehicles: { [LEGACY_VEHICLE]: { ...rec1, completions: Math.max(rec1.completions, 1) } },
    };
  }
  return out;
}

function parseHistory(raw: unknown): HistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: HistoryEntry[] = [];
  for (const e of raw) {
    const o = rec(e);
    if (typeof o.levelId !== 'string' || typeof o.vehicleId !== 'string') continue;
    if (typeof o.time !== 'number' || !isFinite(o.time)) continue;
    out.push({
      levelId: o.levelId,
      vehicleId: o.vehicleId,
      time: o.time,
      medal: isMedal(o.medal) ? o.medal : 'none',
      score: num(o.score, 0, 0, 100),
      comfort: typeof o.comfort === 'number' && Number.isFinite(o.comfort) ? clamp(o.comfort, 0, 100) : null,
      at: num(o.at, 0, 0, Number.MAX_SAFE_INTEGER),
    });
  }
  return out.slice(-HISTORY_LIMIT);
}

function parseCore(o: Record<string, unknown>, fallbackQuality: QualityLevel): SaveDataV2 {
  const sel = rec(o.selection);
  return {
    version: 2,
    settings: parseSettings(o.settings, defaultSettings(fallbackQuality)),
    progress: parseProgress(o.progress),
    selection: {
      levelId: typeof sel.levelId === 'string' ? sel.levelId : null,
      vehicleId: typeof sel.vehicleId === 'string' ? sel.vehicleId : null,
    },
    history: parseHistory(o.history),
  };
}

/** Parses a Stage 2 document (version 2) or returns null. */
export function parseSaveV2(raw: unknown, fallbackQuality: QualityLevel): SaveDataV2 | null {
  const o = rec(raw);
  return o.version === 2 ? parseCore(o, fallbackQuality) : null;
}

const strList = (v: unknown): string[] =>
  Array.isArray(v)
    ? [...new Set(v.filter((x): x is string => typeof x === 'string' && x.length < 64))].slice(0, 64)
    : [];

function parseGarage(raw: unknown): Garage {
  const o = rec(raw);
  const owned = strList(o.owned);
  if (!owned.includes(STARTER_VEHICLE)) owned.unshift(STARTER_VEHICLE);
  const upgrades: Garage['upgrades'] = {};
  for (const [vid, levels] of Object.entries(rec(o.upgrades))) {
    const out: Record<string, number> = {};
    for (const [uid, lv] of Object.entries(rec(levels))) {
      if (typeof lv === 'number' && isFinite(lv)) out[uid] = clamp(Math.floor(lv), 0, 3);
    }
    upgrades[vid] = out;
  }
  return { owned, upgrades };
}

export function parseSave(raw: unknown, fallbackQuality: QualityLevel): SaveData | null {
  const o = rec(raw);
  if (o.version !== SAVE_VERSION) return null;
  const core = parseCore(o, fallbackQuality);
  const wallet = rec(o.wallet);
  const stats = rec(o.stats);
  return {
    ...core,
    version: SAVE_VERSION,
    wallet: { credits: Math.floor(num(wallet.credits, 0, 0, MAX_CREDITS)) },
    garage: parseGarage(o.garage),
    story: { seen: strList(rec(o.story).seen) },
    stats: {
      missionsPlayed: Math.floor(num(stats.missionsPlayed, 0, 0, 1e9)),
      creditsEarned: Math.floor(num(stats.creditsEarned, 0, 0, 1e12)),
      campaignCompleted: stats.campaignCompleted === true,
    },
  };
}

/** Credits given to a migrated player for each mission they had already completed. */
export const MIGRATION_CREDITS_PER_MISSION = 150;

/**
 * Stage 2 -> Stage 3. Nothing is lost: progress, settings and selection carry over. The Druk Ranger was the
 * default vehicle in Stage 2, so it stays owned; the Coaster stays owned if it had been unlocked (Pass Run
 * finished) or driven. The new starter car is added, and each completed mission earns a one-off thank-you.
 */
export function migrateV2(old: SaveDataV2): SaveData {
  const owned = new Set<string>([STARTER_VEHICLE, 'druk-ranger']);
  let completed = 0;
  for (const [id, rec2] of Object.entries(old.progress.levels)) {
    if (rec2.completions > 0) completed++;
    for (const vid of Object.keys(rec2.vehicles)) owned.add(vid);
    if (id === 'pass-run' && rec2.completions > 0) owned.add('tourist-coaster');
  }
  return {
    ...old,
    version: SAVE_VERSION,
    wallet: { credits: completed * MIGRATION_CREDITS_PER_MISSION },
    garage: { owned: [...owned], upgrades: {} },
    story: { seen: [] },
    stats: { missionsPlayed: old.history.length, creditsEarned: 0, campaignCompleted: false },
  };
}

export interface RunSummary {
  levelId: string;
  vehicleId: string;
  time: number;
  medal: Medal;
  score: number;
  comfort: number | null;
}

export interface RunOutcome {
  newBest: boolean;
  newMedal: boolean;
  newScoreBest: boolean;
  previousBest: number | null;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * Versioned localStorage save. Never throws (private mode, quota, blocked storage): it keeps working
 * from memory. Reads the v2 document, otherwise migrates Stage 1 keys without deleting them.
 */
export class SaveStore {
  data: SaveData;
  /** True if the data was loaded by migrating a Stage 1 save (shown once in logs/tests). */
  migrated = false;
  private readonly memory = new Map<string, string>();

  constructor(
    private readonly storage: StorageLike | null,
    private readonly defaultQuality: QualityLevel = 'medium',
  ) {
    this.data = this.load();
  }

  get settings(): Settings {
    return this.data.settings;
  }
  get progress(): Progress {
    return this.data.progress;
  }
  get selection(): Selection {
    return this.data.selection;
  }

  private read(key: string): unknown {
    try {
      const raw = this.storage?.getItem(key) ?? this.memory.get(key) ?? null;
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  private load(): SaveData {
    const current = parseSave(this.read(SAVE_KEY), this.defaultQuality);
    if (current) return current;
    // Stage 2 document.
    const v2 = parseSaveV2(this.read(SAVE_KEY_V2), this.defaultQuality);
    if (v2) {
      const save = migrateV2(v2);
      this.migrated = Object.keys(save.progress.levels).length > 0;
      this.persist(save);
      return save;
    }
    // Stage 1 keys: v1 -> v2 -> v3.
    const legacyProgress = this.read(LEGACY_PROGRESS_KEY);
    const legacySettings = this.read(LEGACY_SETTINGS_KEY);
    let save = emptySave(this.defaultQuality);
    if (legacySettings) save.settings = parseSettings(legacySettings, save.settings);
    if (legacyProgress) {
      const progress = migrateV1Progress(legacyProgress);
      save = migrateV2({
        version: 2,
        settings: save.settings,
        progress,
        selection: save.selection,
        history: [],
      });
      this.migrated = Object.keys(progress.levels).length > 0;
    }
    if (legacySettings || legacyProgress) this.persist(save);
    return save;
  }

  private persist(data: SaveData = this.data): void {
    const text = JSON.stringify(data);
    this.memory.set(SAVE_KEY, text);
    try {
      this.storage?.setItem(SAVE_KEY, text);
    } catch {
      /* storage unavailable: keep the in-memory copy */
    }
  }

  updateSettings(patch: Partial<Settings>): Settings {
    this.data.settings = parseSettings({ ...this.data.settings, ...patch }, this.data.settings);
    this.persist();
    return this.data.settings;
  }

  setSelection(levelId: string | null, vehicleId: string | null): void {
    this.data.selection = { levelId, vehicleId };
    this.persist();
  }

  get credits(): number {
    return this.data.wallet.credits;
  }
  get garage(): Garage {
    return this.data.garage;
  }

  isOwned(vehicleId: string): boolean {
    return this.data.garage.owned.includes(vehicleId);
  }

  upgradeLevel(vehicleId: string, upgradeId: string): number {
    return this.data.garage.upgrades[vehicleId]?.[upgradeId] ?? 0;
  }

  upgradeLevels(vehicleId: string): Record<string, number> {
    return { ...(this.data.garage.upgrades[vehicleId] ?? {}) };
  }

  addCredits(n: number): void {
    if (!Number.isFinite(n) || n <= 0) return;
    this.data.wallet.credits = Math.min(MAX_CREDITS, this.data.wallet.credits + Math.floor(n));
    this.data.stats.creditsEarned += Math.floor(n);
    this.persist();
  }

  /** Spends credits. Returns false (and changes nothing) when the player cannot afford it. */
  spend(n: number): boolean {
    if (!Number.isInteger(n) || n < 0 || n > this.data.wallet.credits) return false;
    this.data.wallet.credits -= Math.floor(n);
    this.persist();
    return true;
  }

  /** Buys a vehicle the caller has already checked is available. */
  buyVehicle(vehicleId: string, price: number): boolean {
    const def = listVehicles().find((v) => v.id === vehicleId);
    if (!def || price !== def.price) return false;
    if (this.isOwned(vehicleId)) return false;
    if (!this.spend(price)) return false;
    this.data.garage.owned.push(vehicleId);
    this.persist();
    return true;
  }

  /** Buys the next level of an upgrade. The caller supplies the price and the maximum level. */
  buyUpgrade(vehicleId: string, upgradeId: string, price: number, maxLevel: number): boolean {
    const def = listVehicles().find((v) => v.id === vehicleId);
    if (!def || !def.upgrades.includes(upgradeId as UpgradeId) || maxLevel !== MAX_UPGRADE_LEVEL)
      return false;
    if (nextUpgradeCost(def, this.upgradeLevels(vehicleId), upgradeId as UpgradeId) !== price) return false;
    if (!this.isOwned(vehicleId)) return false;
    const lvl = this.upgradeLevel(vehicleId, upgradeId);
    if (lvl >= maxLevel) return false;
    if (!this.spend(price)) return false;
    const mine = (this.data.garage.upgrades[vehicleId] ??= {});
    mine[upgradeId] = lvl + 1;
    this.persist();
    return true;
  }

  hasSeenStory(levelId: string): boolean {
    return this.data.story.seen.includes(levelId);
  }

  markStorySeen(levelId: string): void {
    if (this.hasSeenStory(levelId)) return;
    this.data.story.seen.push(levelId);
    this.persist();
  }

  /** True once every mission has been finished at least once. */
  isCampaignComplete(levelIds: readonly string[]): boolean {
    return levelIds.length > 0 && levelIds.every((id) => (this.data.progress.levels[id]?.completions ?? 0) > 0);
  }

  /** Remembers that the end-of-campaign moment has been shown. */
  markCampaignCelebrated(): void {
    if (this.data.stats.campaignCompleted) return;
    this.data.stats.campaignCompleted = true;
    this.persist();
  }

  noteMissionPlayed(): void {
    this.data.stats.missionsPlayed++;
    this.persist();
  }

  levelRecord(levelId: string): LevelRecord {
    return this.data.progress.levels[levelId] ?? { completions: 0, medal: 'none', vehicles: {} };
  }

  vehicleRecord(levelId: string, vehicleId: string): VehicleRecord {
    return (
      this.levelRecord(levelId).vehicles[vehicleId] ?? {
        bestTime: null,
        bestScore: 0,
        bestComfort: null,
        medal: 'none',
        completions: 0,
      }
    );
  }

  /** Records a completed run and reports what improved. */
  recordCompletion(run: RunSummary, now = Date.now()): RunOutcome {
    const level = this.levelRecord(run.levelId);
    const prev = this.vehicleRecord(run.levelId, run.vehicleId);
    const newBest = prev.bestTime === null || run.time < prev.bestTime;
    const newMedal = MEDAL_RANK[run.medal] > MEDAL_RANK[prev.medal];
    const newScoreBest = run.score > prev.bestScore;
    const next: VehicleRecord = {
      bestTime: newBest ? run.time : prev.bestTime,
      bestScore: Math.max(prev.bestScore, run.score),
      bestComfort:
        run.comfort === null
          ? prev.bestComfort
          : Math.max(prev.bestComfort ?? 0, Math.round(run.comfort * 10) / 10),
      medal: newMedal ? run.medal : prev.medal,
      completions: prev.completions + 1,
    };
    this.data.progress.levels[run.levelId] = {
      completions: level.completions + 1,
      medal: MEDAL_RANK[run.medal] > MEDAL_RANK[level.medal] ? run.medal : level.medal,
      vehicles: { ...level.vehicles, [run.vehicleId]: next },
    };
    this.data.history = [...this.data.history, { ...run, at: now, comfort: run.comfort }].slice(
      -HISTORY_LIMIT,
    );
    this.persist();
    return { newBest, newMedal, newScoreBest, previousBest: prev.bestTime };
  }
}

export function openBrowserStorage(): StorageLike | null {
  try {
    const s = window.localStorage;
    const probe = '__cbhr_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}
