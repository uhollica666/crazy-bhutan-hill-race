import type { Medal } from '../data/types';
import { clamp } from '../core/math';

export type QualityLevel = 'low' | 'medium' | 'high';
export type TouchMode = 'auto' | 'on' | 'off';

export interface Settings {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  muted: boolean;
  quality: QualityLevel;
  touchControls: TouchMode;
}

export interface LevelProgress {
  bestTime: number | null;
  medal: Medal;
  completions: number;
}

export interface Progress {
  levels: Record<string, LevelProgress>;
}

const SETTINGS_KEY = 'cbhr.v1.settings';
const PROGRESS_KEY = 'cbhr.v1.progress';

export const defaultSettings = (quality: QualityLevel = 'medium'): Settings => ({
  masterVolume: 0.8,
  musicVolume: 0.5,
  sfxVolume: 0.9,
  muted: false,
  quality,
  touchControls: 'auto',
});

const MEDAL_RANK: Record<Medal, number> = { none: 0, bronze: 1, silver: 2, gold: 3 };

const isQuality = (v: unknown): v is QualityLevel => v === 'low' || v === 'medium' || v === 'high';
const isTouch = (v: unknown): v is TouchMode => v === 'auto' || v === 'on' || v === 'off';
const vol = (v: unknown, fallback: number): number =>
  typeof v === 'number' && isFinite(v) ? clamp(v, 0, 1) : fallback;

/** Defensive parse: corrupt, partial or old data falls back field-by-field to defaults. */
export function parseSettings(raw: unknown, fallback: Settings): Settings {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    masterVolume: vol(o.masterVolume, fallback.masterVolume),
    musicVolume: vol(o.musicVolume, fallback.musicVolume),
    sfxVolume: vol(o.sfxVolume, fallback.sfxVolume),
    muted: typeof o.muted === 'boolean' ? o.muted : fallback.muted,
    quality: isQuality(o.quality) ? o.quality : fallback.quality,
    touchControls: isTouch(o.touchControls) ? o.touchControls : fallback.touchControls,
  };
}

export function parseProgress(raw: unknown): Progress {
  const out: Progress = { levels: {} };
  const levels = (raw as { levels?: unknown } | null)?.levels;
  if (typeof levels !== 'object' || levels === null) return out;
  for (const [id, v] of Object.entries(levels as Record<string, unknown>)) {
    const o = v as Partial<LevelProgress> | null;
    if (!o || typeof o !== 'object') continue;
    out.levels[id] = {
      bestTime: typeof o.bestTime === 'number' && isFinite(o.bestTime) && o.bestTime > 0 ? o.bestTime : null,
      medal: o.medal === 'gold' || o.medal === 'silver' || o.medal === 'bronze' ? o.medal : 'none',
      completions: typeof o.completions === 'number' && o.completions > 0 ? Math.floor(o.completions) : 0,
    };
  }
  return out;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

/** localStorage wrapper that never throws (private mode, quota, blocked storage) and keeps working in memory. */
export class SaveStore {
  settings: Settings;
  progress: Progress;
  private readonly memory = new Map<string, string>();

  constructor(
    private readonly storage: StorageLike | null,
    defaultQuality: QualityLevel = 'medium',
  ) {
    this.settings = parseSettings(this.read(SETTINGS_KEY), defaultSettings(defaultQuality));
    this.progress = parseProgress(this.read(PROGRESS_KEY));
  }

  private read(key: string): unknown {
    try {
      const raw = this.storage?.getItem(key) ?? this.memory.get(key) ?? null;
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  private write(key: string, value: unknown): void {
    const text = JSON.stringify(value);
    this.memory.set(key, text);
    try {
      this.storage?.setItem(key, text);
    } catch {
      /* storage unavailable: keep the in-memory copy */
    }
  }

  updateSettings(patch: Partial<Settings>): Settings {
    this.settings = parseSettings({ ...this.settings, ...patch }, this.settings);
    this.write(SETTINGS_KEY, this.settings);
    return this.settings;
  }

  /** Records a completed run. Returns what improved so the UI can celebrate it. */
  recordCompletion(levelId: string, time: number, medal: Medal): { newBest: boolean; newMedal: boolean } {
    const prev = this.progress.levels[levelId] ?? { bestTime: null, medal: 'none' as Medal, completions: 0 };
    const newBest = prev.bestTime === null || time < prev.bestTime;
    const newMedal = MEDAL_RANK[medal] > MEDAL_RANK[prev.medal];
    this.progress.levels[levelId] = {
      bestTime: newBest ? time : prev.bestTime,
      medal: newMedal ? medal : prev.medal,
      completions: prev.completions + 1,
    };
    this.write(PROGRESS_KEY, this.progress);
    return { newBest, newMedal };
  }

  levelProgress(levelId: string): LevelProgress {
    return this.progress.levels[levelId] ?? { bestTime: null, medal: 'none', completions: 0 };
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
