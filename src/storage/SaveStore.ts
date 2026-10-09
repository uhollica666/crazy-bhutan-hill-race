import type { Medal } from '../data/types';
import { clamp } from '../core/math';
import { MEDAL_RANK } from '../gameplay/scoring';

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

export interface SaveData {
  version: typeof SAVE_VERSION;
  settings: Settings;
  progress: Progress;
  selection: Selection;
  history: HistoryEntry[];
}

export const SAVE_VERSION = 2 as const;
export const SAVE_KEY = 'cbhr.v2.save';
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
});

export const emptySave = (quality: QualityLevel = 'medium'): SaveData => ({
  version: SAVE_VERSION,
  settings: defaultSettings(quality),
  progress: { levels: {} },
  selection: { levelId: null, vehicleId: null },
  history: [],
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
    completions: typeof o.completions === 'number' && o.completions > 0 ? Math.floor(o.completions) : 0,
  };
}

export function parseProgress(raw: unknown): Progress {
  const out: Progress = { levels: {} };
  for (const [id, v] of Object.entries(rec(rec(raw).levels))) {
    const o = rec(v);
    const vehicles: Record<string, VehicleRecord> = {};
    for (const [vid, vr] of Object.entries(rec(o.vehicles))) vehicles[vid] = parseVehicleRecord(vr);
    const completions =
      typeof o.completions === 'number' && o.completions > 0 ? Math.floor(o.completions) : 0;
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
      comfort: typeof o.comfort === 'number' ? clamp(o.comfort, 0, 100) : null,
      at: typeof o.at === 'number' ? o.at : 0,
    });
  }
  return out.slice(-HISTORY_LIMIT);
}

export function parseSave(raw: unknown, fallbackQuality: QualityLevel): SaveData | null {
  const o = rec(raw);
  if (o.version !== SAVE_VERSION) return null;
  const sel = rec(o.selection);
  return {
    version: SAVE_VERSION,
    settings: parseSettings(o.settings, defaultSettings(fallbackQuality)),
    progress: parseProgress(o.progress),
    selection: {
      levelId: typeof sel.levelId === 'string' ? sel.levelId : null,
      vehicleId: typeof sel.vehicleId === 'string' ? sel.vehicleId : null,
    },
    history: parseHistory(o.history),
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
    const legacyProgress = this.read(LEGACY_PROGRESS_KEY);
    const legacySettings = this.read(LEGACY_SETTINGS_KEY);
    const save = emptySave(this.defaultQuality);
    if (legacySettings) save.settings = parseSettings(legacySettings, save.settings);
    if (legacyProgress) {
      save.progress = migrateV1Progress(legacyProgress);
      this.migrated = Object.keys(save.progress.levels).length > 0;
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
