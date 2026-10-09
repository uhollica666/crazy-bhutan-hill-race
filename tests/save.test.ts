import { describe, expect, it } from 'vitest';
import { listLevels } from '../src/data/levels';
import { STARTER_VEHICLE, listVehicles } from '../src/data/vehicles';
import {
  availableVehicles,
  canBuyVehicle,
  canUseVehicle,
  describeRule,
  isLevelUnlocked,
  isVehicleUnlocked,
  newlyUnlocked,
  resolveSelection,
  vehicleOwnership,
} from '../src/gameplay/progression';
import {
  LEGACY_PROGRESS_KEY,
  LEGACY_SETTINGS_KEY,
  MAX_CREDITS,
  MIGRATION_CREDITS_PER_MISSION,
  SAVE_KEY,
  SAVE_KEY_V2,
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

describe('SaveStore v3', () => {
  it('persists settings, per-vehicle progress, selection and history across instances', () => {
    const storage = fake();
    const a = new SaveStore(storage, 'high');
    expect(a.settings.quality).toBe('high');
    a.updateSettings({
      masterVolume: 0.3,
      quality: 'low',
      muted: true,
      touchSensitivity: 1.3,
      reducedMotion: true,
    });
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
      reducedMotion: true,
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

  it('starts with the starter vehicle, no credits and no transient state in the document', () => {
    const s = new SaveStore(fake());
    expect(s.garage.owned).toEqual([STARTER_VEHICLE]);
    expect(s.credits).toBe(0);
    const keys = Object.keys(s.data).sort();
    expect(keys).toEqual([
      'garage',
      'history',
      'progress',
      'selection',
      'settings',
      'stats',
      'story',
      'version',
      'wallet',
    ]);
    const text = JSON.stringify(s.data);
    // Nothing about a run in progress (fuel, position, hazards) is ever saved.
    expect(text).not.toMatch(/fuel|position|hazard|traffic/i);
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
    // The Ranger was the Stage 1 car, so it stays owned; the coach opened with Pass Run, and a thank-you is paid.
    expect(s.garage.owned).toEqual(
      expect.arrayContaining([STARTER_VEHICLE, 'druk-ranger', 'tourist-coaster']),
    );
    expect(s.credits).toBe(MIGRATION_CREDITS_PER_MISSION);
    // The new document was written, the old keys are untouched, and unlocks follow from the migrated progress.
    expect(storage.getItem(SAVE_KEY)).toContain('"version":3');
    expect(storage.getItem(LEGACY_PROGRESS_KEY)).toContain('77.7');
    expect(isLevelUnlocked(levels[1], s.progress)).toBe(true);
    expect(isVehicleUnlocked(vehicles[1], s.progress)).toBe(true);
    // A second load reads v3 and does not re-migrate (and does not pay the thank-you twice).
    const again = new SaveStore(storage);
    expect(again.migrated).toBe(false);
    expect(again.credits).toBe(MIGRATION_CREDITS_PER_MISSION);
  });

  it('migrates a Stage 2 save (v2) and leaves the v2 key alone', () => {
    const storage = fake();
    const v2 = {
      version: 2,
      settings: { masterVolume: 0.5, quality: 'high' },
      progress: {
        levels: {
          'pass-run': {
            completions: 2,
            medal: 'gold',
            vehicles: { 'druk-ranger': { bestTime: 70, medal: 'gold', completions: 2 } },
          },
          'airport-dash': {
            completions: 1,
            medal: 'silver',
            vehicles: { 'tourist-coaster': { bestTime: 100, medal: 'silver', completions: 1 } },
          },
        },
      },
      selection: { levelId: 'airport-dash', vehicleId: 'tourist-coaster' },
      history: [
        {
          levelId: 'pass-run',
          vehicleId: 'druk-ranger',
          time: 70,
          medal: 'gold',
          score: 80,
          comfort: null,
          at: 1,
        },
      ],
    };
    storage.setItem(SAVE_KEY_V2, JSON.stringify(v2));
    const s = new SaveStore(storage);
    expect(s.migrated).toBe(true);
    expect(s.settings).toMatchObject({ masterVolume: 0.5, quality: 'high' });
    expect(s.selection).toEqual({ levelId: 'airport-dash', vehicleId: 'tourist-coaster' });
    expect(s.vehicleRecord('pass-run', 'druk-ranger').bestTime).toBe(70);
    expect(s.garage.owned).toEqual(
      expect.arrayContaining([STARTER_VEHICLE, 'druk-ranger', 'tourist-coaster']),
    );
    expect(s.credits).toBe(2 * MIGRATION_CREDITS_PER_MISSION);
    expect(s.data.history).toHaveLength(1);
    expect(storage.getItem(SAVE_KEY_V2)).toBe(JSON.stringify(v2));
    expect(storage.getItem(SAVE_KEY)).toContain('"version":3');
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
        version: 3,
        settings: { quality: 'ultra', masterVolume: 'x' },
        progress: { levels: { 'pass-run': { completions: 'many', vehicles: { a: { bestTime: 'fast' } } } } },
        selection: 5,
        history: [1, { levelId: 3 }],
        wallet: { credits: 'lots' },
        garage: {
          owned: ['druk-ranger', 7, 'druk-ranger'],
          upgrades: { 'druk-ranger': { engine: 99, tires: 'x' } },
        },
        story: { seen: 'yes' },
      }),
    );
    const p = new SaveStore(partial);
    expect(p.settings.quality).toBe('medium');
    expect(p.levelRecord('pass-run').completions).toBe(0);
    expect(p.vehicleRecord('pass-run', 'a').bestTime).toBeNull();
    expect(p.selection).toEqual({ levelId: null, vehicleId: null });
    expect(p.credits).toBe(0);
    // The starter is always owned again, duplicates and junk are dropped, upgrade levels are clamped to 0..3.
    expect(p.garage.owned).toEqual([STARTER_VEHICLE, 'druk-ranger']);
    expect(p.upgradeLevel('druk-ranger', 'engine')).toBe(3);
    expect(p.upgradeLevel('druk-ranger', 'tires')).toBe(0);
    expect(p.data.story.seen).toEqual([]);

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

    expect(parseSave({ version: 4 }, 'low')).toBeNull(); // unknown future versions are not trusted
    expect(parseSave({ version: 2 }, 'low')).toBeNull(); // older ones go through migration, not parsing
    expect(
      parseSettings({ quality: 'ultra', masterVolume: 'x', touchSensitivity: 99 }, defaultSettings())
        .touchSensitivity,
    ).toBe(1.6);
    expect(parseProgress(null)).toEqual({ levels: {} });
    expect(migrateV1Progress({ levels: { a: { bestTime: null, completions: 0 } } })).toEqual({ levels: {} });
    expect(emptySave().version).toBe(3);
  });

  it('credits: earn, spend, cap, and never go negative', () => {
    const s = new SaveStore(fake());
    s.addCredits(500);
    s.addCredits(-50);
    s.addCredits(0);
    expect(s.credits).toBe(500);
    expect(s.spend(600)).toBe(false);
    expect(s.credits).toBe(500);
    expect(s.spend(120)).toBe(true);
    expect(s.credits).toBe(380);
    s.addCredits(MAX_CREDITS * 2);
    expect(s.credits).toBe(MAX_CREDITS);
    expect(s.data.stats.creditsEarned).toBeGreaterThan(500);
  });

  it('vehicles and upgrades: pay once, need ownership, cap at level 3, persist', () => {
    const storage = fake();
    const s = new SaveStore(storage);
    expect(s.buyVehicle('tourist-coaster', 650)).toBe(false); // cannot afford
    s.addCredits(2000);
    expect(s.buyVehicle('tourist-coaster', 650)).toBe(true);
    expect(s.buyVehicle('tourist-coaster', 650)).toBe(false); // already owned: not charged twice
    expect(s.credits).toBe(1350);
    expect(s.buyUpgrade('druk-ranger', 'engine', 100, 3)).toBe(false); // not owned
    expect(s.buyUpgrade('tourist-coaster', 'engine', 180, 3)).toBe(true);
    expect(s.buyUpgrade('tourist-coaster', 'engine', 360, 3)).toBe(true);
    expect(s.buyUpgrade('tourist-coaster', 'engine', 620, 3)).toBe(true);
    expect(s.buyUpgrade('tourist-coaster', 'engine', 100, 3)).toBe(false); // maxed
    expect(s.credits).toBe(190);
    const again = new SaveStore(storage);
    expect(again.upgradeLevel('tourist-coaster', 'engine')).toBe(3);
    expect(again.isOwned('tourist-coaster')).toBe(true);
    expect(again.credits).toBe(190);
  });

  it('remembers which stories were read', () => {
    const storage = fake();
    const s = new SaveStore(storage);
    expect(s.hasSeenStory('pass-run')).toBe(false);
    s.markStorySeen('pass-run');
    s.markStorySeen('pass-run');
    expect(new SaveStore(storage).data.story.seen).toEqual(['pass-run']);
  });

  it('rejects invalid money, unknown purchases and forged upgrade prices without charging', () => {
    const s = new SaveStore(fake());
    s.addCredits(1000);
    for (const n of [NaN, Infinity, -1, 0.5]) expect(s.spend(n)).toBe(false);
    s.addCredits(NaN);
    s.addCredits(Infinity);
    expect(s.buyVehicle('unknown', 0)).toBe(false);
    expect(s.buyVehicle('tourist-coaster', 0)).toBe(false);
    expect(s.buyUpgrade('dzo-hatch', 'engine', 0, 3)).toBe(false);
    expect(s.buyUpgrade('dzo-hatch', 'unknown', 100, 3)).toBe(false);
    expect(s.buyUpgrade('dzo-hatch', 'engine', 180, 99)).toBe(false);
    expect(s.credits).toBe(1000);
    expect(s.upgradeLevel('dzo-hatch', 'engine')).toBe(0);
  });

  it('repairs nonfinite progression fields while preserving valid and unknown historical ids', () => {
    const p = parseProgress({
      levels: {
        'pass-run': {
          completions: Infinity,
          medal: 'silver',
          vehicles: { 'dzo-hatch': { completions: Infinity, bestTime: 70, medal: 'gold' } },
        },
        future: {
          completions: 2,
          medal: 'bronze',
          vehicles: { futureCar: { bestTime: 90, completions: 2 } },
        },
      },
    });
    expect(p.levels['pass-run'].completions).toBe(0);
    expect(p.levels['pass-run'].vehicles['dzo-hatch'].completions).toBe(0);
    expect(p.levels['pass-run'].vehicles['dzo-hatch'].bestTime).toBe(70);
    expect(p.levels.future.vehicles.futureCar.bestTime).toBe(90);
    const selected = resolveSelection({ levelId: 'future', vehicleId: 'futureCar' }, levels, vehicles, p, [
      'dzo-hatch',
    ]);
    expect(selected.level.id).toBe('pass-run');
    expect(selected.vehicle.id).toBe('dzo-hatch');
  });
});

describe('progression', () => {
  const none = { levels: {} };
  const starter = [STARTER_VEHICLE];

  it('starts with Pass Run only; the starter hatchback is owned, the rest are locked behind missions', () => {
    expect(levels.map((l) => isLevelUnlocked(l, none))).toEqual([true, ...Array(levels.length - 1).fill(false)]);
    expect(vehicles.map((v) => vehicleOwnership(v, none, starter))).toEqual([
      'owned',
      'locked',
      'locked',
      'locked',
    ]);
  });

  it('finishing a level opens the next ones; finishing Pass Run also makes the coach available to buy', () => {
    const s = new SaveStore(fake());
    const before = structuredClone(s.progress);
    s.recordCompletion(run('pass-run', 'dzo-hatch', 100, 'none'));
    const u1 = newlyUnlocked(levels, vehicles, before, s.progress);
    expect(u1.levels.map((l) => l.id).sort()).toEqual(['airport-dash', 'thimphu-pickup']);
    expect(u1.vehicles.map((v) => v.id)).toEqual(['tourist-coaster']);

    const mid = structuredClone(s.progress);
    s.recordCompletion(run('pass-run', 'dzo-hatch', 90, 'gold'));
    expect(newlyUnlocked(levels, vehicles, mid, s.progress)).toEqual({ levels: [], vehicles: [] });

    s.recordCompletion(run('airport-dash', 'tourist-coaster', 120, 'bronze', 60));
    expect(isLevelUnlocked(levels.find((l) => l.id === 'chelela-climb') as (typeof levels)[number], s.progress)).toBe(true);
  });

  it('available is not owned: buying needs both the unlock and the credits', () => {
    const coach = vehicles[1];
    expect(canBuyVehicle(coach, none, starter, 5000)).toBe(false); // still locked
    const progress = { levels: { 'pass-run': { completions: 1, medal: 'none' as const, vehicles: {} } } };
    expect(vehicleOwnership(coach, progress, starter)).toBe('available');
    expect(canBuyVehicle(coach, progress, starter, coach.price - 1)).toBe(false);
    expect(canBuyVehicle(coach, progress, starter, coach.price)).toBe(true);
    expect(canBuyVehicle(coach, progress, [...starter, coach.id], 9999)).toBe(false); // already owned
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

  it('eligibility needs the vehicle to be listed AND to seat the whole party', () => {
    const by = (id: string): (typeof levels)[number] => levels.find((l) => l.id === id) as (typeof levels)[number];
    const [pass, thimphu, airport, chelela, expedition] = ['pass-run', 'thimphu-pickup', 'airport-dash', 'chelela-climb', 'remote-expedition'].map(by);
    expect(canUseVehicle(pass, 'dzo-hatch')).toBe(true);
    expect(canUseVehicle(thimphu, 'dzo-hatch')).toBe(true); // party of 3, hatch seats 3
    expect(canUseVehicle(airport, 'dzo-hatch')).toBe(false); // not listed
    expect(canUseVehicle(airport, 'tourist-coaster')).toBe(true);
    expect(canUseVehicle(chelela, 'tourist-coaster')).toBe(false); // too big for the road
    expect(
      canUseVehicle({ ...thimphu, mission: { ...thimphu.mission, party: 4 } }, 'dzo-hatch', vehicles),
    ).toBe(false);
    expect(canUseVehicle(expedition, 'dragon-cruiser')).toBe(true);
  });

  it('only owned, eligible vehicles can be driven', () => {
    const airport = levels.find((l) => l.id === 'airport-dash') as (typeof levels)[number];
    const chelela = levels.find((l) => l.id === 'chelela-climb') as (typeof levels)[number];
    const owned = [STARTER_VEHICLE, 'druk-ranger'];
    expect(availableVehicles(chelela, vehicles, owned).map((v) => v.id)).toEqual(['druk-ranger']);
    expect(availableVehicles(airport, vehicles, owned).map((v) => v.id)).toEqual(['druk-ranger']);
    // The ten-level campaign always has something a starter-only player can drive: Pass Run, Thimphu, Punakha...
    const starterLevels = levels.filter((l) => availableVehicles(l, vehicles, starter).length > 0).map((l) => l.id);
    expect(starterLevels).toEqual(expect.arrayContaining(['pass-run', 'thimphu-pickup', 'punakha-valley', 'gmc-plains']));
    // Nothing owned fits (starter only): the caller provides a loaner rather than blocking the mission.
    expect(availableVehicles(airport, vehicles, starter)).toEqual([]);
  });

  it('repairs impossible saved selections', () => {
    const fresh = resolveSelection(
      { levelId: 'chelela-climb', vehicleId: 'tourist-coaster' },
      levels,
      vehicles,
      none,
      starter,
    );
    expect(fresh.level.id).toBe('pass-run');
    expect(fresh.vehicle.id).toBe('dzo-hatch');
    const progress = {
      levels: {
        'pass-run': { completions: 1, medal: 'none' as const, vehicles: {} },
        'airport-dash': { completions: 1, medal: 'none' as const, vehicles: {} },
      },
    };
    const owned = [STARTER_VEHICLE, 'druk-ranger', 'tourist-coaster'];
    const ok = resolveSelection(
      { levelId: 'chelela-climb', vehicleId: 'tourist-coaster' },
      levels,
      vehicles,
      progress,
      owned,
    );
    expect(ok.level.id).toBe('chelela-climb');
    expect(ok.vehicle.id).toBe('druk-ranger'); // the coach is not allowed on this mission
    expect(
      resolveSelection(
        { levelId: 'airport-dash', vehicleId: 'tourist-coaster' },
        levels,
        vehicles,
        progress,
        owned,
      ).vehicle.id,
    ).toBe('tourist-coaster');
    // A vehicle that is not owned is never selected.
    expect(
      resolveSelection(
        { levelId: 'airport-dash', vehicleId: 'tourist-coaster' },
        levels,
        vehicles,
        progress,
        [STARTER_VEHICLE, 'druk-ranger'],
      ).vehicle.id,
    ).toBe('druk-ranger');
  });
});
