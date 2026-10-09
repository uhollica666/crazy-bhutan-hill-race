import { describe, expect, it } from 'vitest';
import { listLevels } from '../src/data/levels';
import { listVehicles } from '../src/data/vehicles';
import {
  availableVehicles,
  canUseVehicle,
  describeRule,
  isLevelUnlocked,
  isVehicleUnlocked,
  newlyUnlocked,
  resolveSelection,
} from '../src/gameplay/progression';
import {
  LEGACY_PROGRESS_KEY,
  LEGACY_SETTINGS_KEY,
  SAVE_KEY,
  SaveStore,
  defaultSettings,
  emptySave,
  migrateV1Progress,
  parseProgress,
  parseSave,
  parseSettings,
} from '../src/storage/SaveStore';

const fake = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
};
const levels = listLevels();
const vehicles = listVehicles();
const run = (
  levelId: string,
  vehicleId: string,
  time: number,
  medal: 'gold' | 'silver' | 'bronze' | 'none',
  comfort: number | null = null,
  score = 60,
) => ({
  levelId,
  vehicleId,
  time,
  medal,
  score,
  comfort,
});

describe('SaveStore v2', () => {
  it('persists settings, per-vehicle progress, selection and history across instances', () => {
    const storage = fake();
    const a = new SaveStore(storage, 'high');
    expect(a.settings.quality).toBe('high');
    a.updateSettings({ masterVolume: 0.3, quality: 'low', muted: true, touchSensitivity: 1.3 });
    a.updateSettings({ sfxVolume: 7 });
    expect(a.recordCompletion(run('pass-run', 'druk-ranger', 90, 'silver'))).toMatchObject({
      newBest: true,
      newMedal: true,
    });
    expect(a.recordCompletion(run('pass-run', 'druk-ranger', 95, 'bronze'))).toMatchObject({
      newBest: false,
      newMedal: false,
    });
    expect(a.recordCompletion(run('pass-run', 'druk-ranger', 80, 'gold', null, 90))).toMatchObject({
      newBest: true,
      newMedal: true,
      newScoreBest: true,
    });
    a.recordCompletion(run('pass-run', 'tourist-coaster', 110, 'silver'));
    a.setSelection('airport-dash', 'tourist-coaster');
    const b = new SaveStore(storage);
    expect(b.settings).toMatchObject({
      masterVolume: 0.3,
      quality: 'low',
      muted: true,
      sfxVolume: 1,
      touchSensitivity: 1.3,
    });
    expect(b.vehicleRecord('pass-run', 'druk-ranger')).toMatchObject({
      bestTime: 80,
      medal: 'gold',
      completions: 3,
      bestScore: 90,
    });
    expect(b.vehicleRecord('pass-run', 'tourist-coaster')).toMatchObject({ bestTime: 110, medal: 'silver' });
    expect(b.levelRecord('pass-run')).toMatchObject({ completions: 4, medal: 'gold' });
    expect(b.selection).toEqual({ levelId: 'airport-dash', vehicleId: 'tourist-coaster' });
    expect(b.data.history).toHaveLength(4);
  });

  it('keeps best comfort and caps history', () => {
    const s = new SaveStore(fake());
    for (let i = 0; i < 40; i++)
      s.recordCompletion(run('airport-dash', 'tourist-coaster', 100 - (i % 5), 'bronze', 60 + (i % 7)));
    expect(s.vehicleRecord('airport-dash', 'tourist-coaster').bestComfort).toBe(66);
    expect(s.data.history.length).toBe(30);
  });

  it('migrates a Stage 1 save (settings + best times) without losing anything and without deleting old keys', () => {
    const storage = fake();
    storage.setItem(
      LEGACY_SETTINGS_KEY,
      JSON.stringify({
        masterVolume: 0.25,
        musicVolume: 0.1,
        sfxVolume: 0.6,
        muted: true,
        quality: 'low',
        touchControls: 'on',
      }),
    );
    storage.setItem(
      LEGACY_PROGRESS_KEY,
      JSON.stringify({ levels: { 'pass-run': { bestTime: 77.7, medal: 'gold', completions: 4 } } }),
    );
    const s = new SaveStore(storage);
    expect(s.migrated).toBe(true);
    expect(s.settings).toMatchObject({
      masterVolume: 0.25,
      quality: 'low',
      touchControls: 'on',
      muted: true,
      touchSensitivity: 1,
    });
    expect(s.vehicleRecord('pass-run', 'druk-ranger')).toMatchObject({
      bestTime: 77.7,
      medal: 'gold',
      completions: 4,
    });
    expect(s.levelRecord('pass-run')).toMatchObject({ completions: 4, medal: 'gold' });
    // The new document was written, the old keys are untouched, and unlocks follow from the migrated progress.
    expect(storage.getItem(SAVE_KEY)).toContain('"version":2');
    expect(storage.getItem(LEGACY_PROGRESS_KEY)).toContain('77.7');
    expect(isLevelUnlocked(levels[1], s.progress)).toBe(true);
    expect(isVehicleUnlocked(vehicles[1], s.progress)).toBe(true);
    // A second load reads v2 and does not re-migrate.
    expect(new SaveStore(storage).migrated).toBe(false);
  });

  it('survives corrupt, partial and unavailable storage', () => {
    const storage = fake();
    storage.setItem(SAVE_KEY, '{not json');
    storage.setItem(
      LEGACY_PROGRESS_KEY,
      JSON.stringify({ levels: { x: { bestTime: -5, medal: 'platinum' } } }),
    );
    const s = new SaveStore(storage, 'medium');
    expect(s.settings).toEqual(defaultSettings('medium'));
    expect(s.levelRecord('x')).toEqual({ completions: 0, medal: 'none', vehicles: {} });

    const partial = fake();
    partial.setItem(
      SAVE_KEY,
      JSON.stringify({
        version: 2,
        settings: { quality: 'ultra', masterVolume: 'x' },
        progress: { levels: { 'pass-run': { completions: 'many', vehicles: { a: { bestTime: 'fast' } } } } },
        selection: 5,
        history: [1, { levelId: 3 }],
      }),
    );
    const p = new SaveStore(partial);
    expect(p.settings.quality).toBe('medium');
    expect(p.levelRecord('pass-run').completions).toBe(0);
    expect(p.vehicleRecord('pass-run', 'a').bestTime).toBeNull();
    expect(p.selection).toEqual({ levelId: null, vehicleId: null });

    const broken = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    const t = new SaveStore(broken);
    t.updateSettings({ muted: true });
    t.recordCompletion(run('pass-run', 'druk-ranger', 70, 'gold'));
    expect(t.settings.muted).toBe(true);
    expect(t.vehicleRecord('pass-run', 'druk-ranger').bestTime).toBe(70);

    expect(parseSave({ version: 3 }, 'low')).toBeNull(); // unknown future versions are not trusted
    expect(
      parseSettings({ quality: 'ultra', masterVolume: 'x', touchSensitivity: 99 }, defaultSettings())
        .touchSensitivity,
    ).toBe(1.6);
    expect(parseProgress(null)).toEqual({ levels: {} });
    expect(migrateV1Progress({ levels: { a: { bestTime: null, completions: 0 } } })).toEqual({ levels: {} });
    expect(emptySave().version).toBe(2);
  });
});

describe('progression', () => {
  const none = { levels: {} };
  it('starts with Pass Run and the SUV only', () => {
    expect(levels.map((l) => isLevelUnlocked(l, none))).toEqual([true, false, false]);
    expect(vehicles.map((v) => isVehicleUnlocked(v, none))).toEqual([true, false]);
  });

  it('finishing a level opens the next one; finishing Pass Run also opens the coach', () => {
    const s = new SaveStore(fake());
    const before = structuredClone(s.progress);
    s.recordCompletion(run('pass-run', 'druk-ranger', 100, 'none'));
    const u1 = newlyUnlocked(levels, vehicles, before, s.progress);
    expect(u1.levels.map((l) => l.id)).toEqual(['airport-dash']);
    expect(u1.vehicles.map((v) => v.id)).toEqual(['tourist-coaster']);

    const mid = structuredClone(s.progress);
    s.recordCompletion(run('pass-run', 'druk-ranger', 90, 'gold'));
    expect(newlyUnlocked(levels, vehicles, mid, s.progress)).toEqual({ levels: [], vehicles: [] });

    s.recordCompletion(run('airport-dash', 'tourist-coaster', 120, 'bronze', 60));
    expect(isLevelUnlocked(levels[2], s.progress)).toBe(true);
  });

  it('medal-gated rules need the medal, not just a finish', () => {
    const rule = { levelId: 'pass-run', requirement: 'silver' as const };
    const s = new SaveStore(fake());
    s.recordCompletion(run('pass-run', 'druk-ranger', 120, 'bronze'));
    expect(isLevelUnlocked({ ...levels[1], unlock: rule }, s.progress)).toBe(false);
    s.recordCompletion(run('pass-run', 'druk-ranger', 100, 'silver'));
    expect(isLevelUnlocked({ ...levels[1], unlock: rule }, s.progress)).toBe(true);
    expect(describeRule(rule, levels)).toBe('Earn silver on Pass Run');
    expect(describeRule({ levelId: 'pass-run', requirement: 'finish' }, levels)).toBe('Finish Pass Run');
  });

  it('level eligibility: the 4x4 only on Chelela, both on the others', () => {
    const [pass, airport, chelela] = levels;
    expect(canUseVehicle(pass, 'tourist-coaster')).toBe(true);
    expect(canUseVehicle(airport, 'tourist-coaster')).toBe(true);
    expect(canUseVehicle(chelela, 'tourist-coaster')).toBe(false);
    const all = {
      levels: {
        'pass-run': { completions: 1, medal: 'none' as const, vehicles: {} },
        'airport-dash': { completions: 1, medal: 'none' as const, vehicles: {} },
      },
    };
    expect(availableVehicles(chelela, vehicles, all).map((v) => v.id)).toEqual(['druk-ranger']);
    expect(availableVehicles(airport, vehicles, all).map((v) => v.id)).toEqual([
      'druk-ranger',
      'tourist-coaster',
    ]);
  });

  it('repairs impossible saved selections', () => {
    const fresh = resolveSelection(
      { levelId: 'chelela-climb', vehicleId: 'tourist-coaster' },
      levels,
      vehicles,
      none,
    );
    expect(fresh.level.id).toBe('pass-run');
    expect(fresh.vehicle.id).toBe('druk-ranger');
    const progress = {
      levels: {
        'pass-run': { completions: 1, medal: 'none' as const, vehicles: {} },
        'airport-dash': { completions: 1, medal: 'none' as const, vehicles: {} },
      },
    };
    const ok = resolveSelection(
      { levelId: 'chelela-climb', vehicleId: 'tourist-coaster' },
      levels,
      vehicles,
      progress,
    );
    expect(ok.level.id).toBe('chelela-climb');
    expect(ok.vehicle.id).toBe('druk-ranger'); // the coach is not allowed on this mission
    expect(
      resolveSelection({ levelId: 'airport-dash', vehicleId: 'tourist-coaster' }, levels, vehicles, progress)
        .vehicle.id,
    ).toBe('tourist-coaster');
  });
});
