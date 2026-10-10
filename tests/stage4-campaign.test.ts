import { describe, expect, it } from 'vitest';
import { getLevel, listLevels } from '../src/data/levels';
import { getVehicle, listVehicles } from '../src/data/vehicles';
import { listStoryLocales, getCast, getStory } from '../src/data/story';
import { campaignStatus, challengeTags, groupByRegion, justCompletedCampaign, nextUnplayed } from '../src/gameplay/campaign';
import { isLevelUnlocked } from '../src/gameplay/progression';
import { SaveStore, emptySave, migrateV2 } from '../src/storage/SaveStore';
import { Course } from '../src/world/Course';
import { createGroundSample } from '../src/world/Terrain';

const levels = listLevels();
const vehicles = listVehicles();
const fake = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};
const rec = (n: number, medal: 'gold' | 'silver' | 'bronze' | 'none' = 'bronze') => ({ completions: n, medal, vehicles: {} });

describe('the ten-level arcade campaign', () => {
  it('has ten distinct, fully specified levels', () => {
    expect(levels).toHaveLength(10);
    expect(new Set(levels.map((l) => l.id)).size).toBe(10);
    expect(new Set(levels.map((l) => l.name)).size).toBe(10);
    // Every level has its own route: no two share a start/finish/length fingerprint.
    const prints = levels.map((l) => {
      const c = new Course(l);
      return `${Math.round(c.road.length)}:${Math.round(c.road.minRadius())}:${l.road.width}`;
    });
    expect(new Set(prints).size).toBe(10);
  });

  it('every level has a briefing, passengers that exist, and objectives that match its mechanics', () => {
    expect(listStoryLocales()).toContain('en');
    for (const l of levels) {
      const story = getStory(l.id);
      expect(story, l.id).not.toBeNull();
      expect(story!.objectives.length, l.id).toBeGreaterThanOrEqual(3);
      for (const key of story!.passengers) expect(getCast(key), `${l.id}/${key}`).not.toBeNull();
      const pickups = l.stops.filter((s) => s.kind === 'pickup');
      for (const p of pickups) if (p.who) expect(getCast(p.who), `${l.id}/${p.id}`).not.toBeNull();
      // Missions with required pickups must say so in the briefing.
      if (pickups.some((p) => !p.optional)) expect(story!.objectives.join(' ').toLowerCase(), l.id).toMatch(/collect|pick|stop/);
    }
  });

  it('stops, checkpoints and hazards sit inside the route, in order, with real vehicles and seats', () => {
    for (const l of levels) {
      const cps = l.checkpoints.map((c) => c.at);
      expect([...cps].sort((a, b) => a - b), l.id).toEqual(cps);
      expect(cps.every((f) => f > 0 && f < 1), l.id).toBe(true);
      for (const s of l.stops) expect(s.at > 0 && s.at < 1, `${l.id}/${s.id}`).toBe(true);
      for (const h of l.hazards) expect(h.at > 0 && h.at < 1, `${l.id}/${h.id}`).toBe(true);
      // `mission.party` is the most guests aboard at once (seats needed): pickups add, drop-offs subtract, in route order, impostors excluded.
      let aboard = 0;
      let peak = 0;
      for (const s of [...l.stops].sort((a, b) => a.at - b.at)) {
        if (s.kind === 'pickup' && !s.fake) aboard += s.party ?? 0; // impostors are not part of the party
        else if (s.kind === 'dropoff') aboard -= s.party ?? 0;
        peak = Math.max(peak, aboard);
      }
      expect(peak, l.id).toBe(l.mission.party);
      expect(l.vehicles.every((id) => !!getVehicle(id)), l.id).toBe(true);
      // At least one allowed vehicle seats the party.
      expect(l.vehicles.some((id) => getVehicle(id).capacity >= l.mission.party), l.id).toBe(true);
      expect(l.medals.gold < l.medals.silver && l.medals.silver < l.medals.bronze && l.medals.bronze < l.timeLimit, l.id).toBe(true);
      expect(l.reward, l.id).toBeGreaterThan(0);
      expect(l.region.length, l.id).toBeGreaterThan(2);
    }
  });

  it('every level can be reached from Pass Run through the unlock rules (no dead ends, no cycles)', () => {
    const reached = new Set<string>(['pass-run']);
    let grew = true;
    while (grew) {
      grew = false;
      for (const l of levels) {
        if (reached.has(l.id) || !l.unlock) continue;
        if (reached.has(l.unlock.levelId)) {
          reached.add(l.id);
          grew = true;
        }
      }
    }
    expect([...reached].sort()).toEqual(levels.map((l) => l.id).sort());
    expect(getLevel('pass-run').unlock).toBeNull();
    // Finishing the campaign in list order always has the next level unlocked or an earlier unfinished one available.
    const progress = { levels: {} as Record<string, ReturnType<typeof rec>> };
    for (let i = 0; i < levels.length; i++) {
      const next = nextUnplayed(levels, progress);
      expect(next, `step ${i}`).not.toBeNull();
      progress.levels[(next as (typeof levels)[number]).id] = rec(1);
    }
    expect(nextUnplayed(levels, progress)).toBeNull();
  });

  it('a player who owns only the starter hatchback is never locked out of progress (loaner or eligible vehicle)', () => {
    for (const l of levels) {
      const driveable = l.vehicles.filter((id) => getVehicle(id).capacity >= l.mission.party);
      expect(driveable.length, l.id).toBeGreaterThan(0);
    }
    // The starter can drive at least five missions itself (the off-road finale levels need a 4x4); the rest are covered by a studio loaner.
    const starterCan = levels.filter((l) => l.vehicles.includes('dzo-hatch') && getVehicle('dzo-hatch').capacity >= l.mission.party);
    expect(starterCan.length).toBeGreaterThanOrEqual(5);
  });

  it('terrain drop-offs fall away on the requested side only', () => {
    // The routes now carve their cliffs with the road's own elevation, so exercise the terrain's one-sided drop on a copy of the gorge.
    const base = getLevel('trongsa-gorge');
    const l = { ...base, terrain: { ...base.terrain, drop: { start: 8, width: 14, depth: 60, side: -1 as const } } };
    const c = new Course(l);
    const p = c.poseAt(c.startS + (c.finishS - c.startS) * 0.2);
    const rx = -p.tz;
    const rz = p.tx;
    const side = l.terrain.drop!.side!;
    const off = 30;
    const drop = c.terrain.heightAt(p.x + rx * side * off, p.z + rz * side * off);
    const rise = c.terrain.heightAt(p.x - rx * side * off, p.z - rz * side * off);
    expect(rise - drop).toBeGreaterThan(20);
    const g = createGroundSample();
    c.terrain.groundAt(p.x, p.z, g);
    expect(Math.abs(g.height - p.y)).toBeLessThan(1);
  });

  it('descent levels really lose height and night levels default to night', () => {
    const storm = new Course(getLevel('dochula-storm'));
    expect(storm.road.at(storm.finishS, { x: 0, y: 0, z: 0, tx: 0, tz: 0 }).y).toBeLessThan(
      storm.road.at(storm.startS, { x: 0, y: 0, z: 0, tx: 0, tz: 0 }).y - 40,
    );
    expect(getLevel('bumthang-night').conditions[0].time).toBe('dusk');
    expect(getLevel('bumthang-night').weatherZones?.some((z) => z.time === 'night')).toBe(true);
    expect(getLevel('dochula-storm').weatherZones?.some((z) => z.weather === 'heavyRain')).toBe(true);
  });
});

describe('campaign progress helpers', () => {
  it('groups missions by chapter and tags what makes each one different', () => {
    const groups = groupByRegion(levels);
    expect(groups.map((g) => g.name)).toEqual(['Paro & Thimphu', 'Punakha Valley', 'Mountain Passes', 'Central & Eastern Bhutan', 'Southern Plains']);
    expect(groups.reduce((n, g) => n + g.levels.length, 0)).toBe(10);
    expect(challengeTags(getLevel('bumthang-night'))).toEqual(expect.arrayContaining(['Dusk', 'Night']));
    expect(challengeTags(getLevel('remote-expedition'))).toEqual(expect.arrayContaining(['River ford', 'Off-road']));
    expect(challengeTags(getLevel('gmc-plains'))).toEqual(expect.arrayContaining(['River ford', 'Off-road']));
    for (const l of levels) expect(challengeTags(l).length, l.id).toBeLessThanOrEqual(4);
  });

  it('knows when the last mission is finished, once', () => {
    const none = { levels: {} };
    const nine = { levels: Object.fromEntries(levels.slice(0, 9).map((l) => [l.id, rec(1, 'gold')])) };
    const ten = { levels: Object.fromEntries(levels.map((l) => [l.id, rec(1, 'silver')])) };
    expect(campaignStatus(levels, none)).toMatchObject({ completed: 0, total: 10, done: false });
    expect(campaignStatus(levels, nine)).toMatchObject({ completed: 9, done: false, medals: { gold: 9, silver: 0, bronze: 0 } });
    expect(justCompletedCampaign(levels, nine, ten)).toBe(true);
    // Replaying a mission in an already finished campaign does not celebrate again.
    expect(justCompletedCampaign(levels, ten, ten)).toBe(false);
    expect(justCompletedCampaign(levels, none, nine)).toBe(false);
  });

  it('persists the campaign-complete flag and migrates saves without it', () => {
    const storage = fake();
    const s = new SaveStore(storage);
    expect(s.isCampaignComplete(levels.map((l) => l.id))).toBe(false);
    for (const l of levels) s.recordCompletion({ levelId: l.id, vehicleId: 'dzo-hatch', time: 100, medal: 'bronze', score: 50, comfort: null });
    expect(s.isCampaignComplete(levels.map((l) => l.id))).toBe(true);
    expect(s.data.stats.campaignCompleted).toBe(false);
    s.markCampaignCelebrated();
    expect(new SaveStore(storage).data.stats.campaignCompleted).toBe(true);
    const migrated = migrateV2({ version: 2, settings: emptySave().settings, progress: { levels: {} }, selection: { levelId: null, vehicleId: null }, history: [] });
    expect(migrated.stats.campaignCompleted).toBe(false);
  });

  it('level unlocks follow the saved progress for all ten missions', () => {
    const s = new SaveStore(fake());
    const order = ['pass-run', 'thimphu-pickup', 'airport-dash', 'punakha-valley', 'dochula-storm', 'trongsa-gorge', 'chelela-climb', 'bumthang-night', 'remote-expedition', 'gmc-plains'];
    for (const id of order) {
      expect(isLevelUnlocked(getLevel(id), s.progress), `${id} unlocked before finishing its prerequisite`).toBe(true);
      s.recordCompletion({ levelId: id, vehicleId: 'dzo-hatch', time: 100, medal: 'bronze', score: 10, comfort: null });
    }
    expect(vehicles.length).toBe(4);
  });
});
