import type { HazardDef, JunctionDef, LandmarkDef, LevelDef, PuddleDef, RiverDef, RoadPointDef, RoadsideDef, StopDef, SurfaceId } from '../types';
import { walkPath } from './extend';
import { EXPEDITION_LENGTH, EXPEDITION_PATH, expeditionRange } from './expeditionPath';

/**
 * Level 9: Remote Expedition (about 10.2 km). A documentary team and its gear must reach a remote expedition camp over the worst road in
 * the kingdom: forest ruts and mud, an old broken highway, two river fords beside a collapsed bridge, a rocky hairpin climb, a loose
 * descent, a landslide area with a flooded dip and an unpaved switchback climb, in worsening rain. The tracks look like tracks (dirt, mud,
 * gravel, rock, broken asphalt) and behave like them: grip, rolling drag, damage and wading depth all come from the surface and the
 * water. Four-wheel drive matters, the ranger and the cruiser can both do it (the cruiser is the better wader), and every ford is no
 * deeper than 0.45 m so no eligible vehicle is ever stopped by a crossing.
 *
 * Distances are metres from the start line (`m`). The level id, unlock rule (now after Bumthang) and eligible vehicles are those of the
 * original mission, so saves and cloud progress keep working. The deadline and medals are provisional (Stage 6.9B calibrates).
 */
const P = EXPEDITION_LENGTH;
const START_OFFSET = 30;
const FINISH_OFFSET = 40;
/** Fraction of the playable stretch (stops, hazards, checkpoints, puddles, roadside life, weather zones, traffic). */
const at = (m: number): number => m / P;
/** Fraction of the whole road (surfaces, width profile, landmarks, rivers, fords). */
const whole = (m: number): number => (START_OFFSET + m) / (P + START_OFFSET + FINISH_OFFSET);

const base = expeditionRange('base');
const forest = expeditionRange('forest');
const oldroad = expeditionRange('oldroad');
const river = expeditionRange('river');
const climb = expeditionRange('climb');
const descent = expeditionRange('descent');
const slides = expeditionRange('slides');
const sw = expeditionRange('switch');
const station = expeditionRange('station');
const approach = expeditionRange('approach');
const camp = expeditionRange('camp');

const CLIMB_LADDER = 1094.7;
const DESCENT_LADDER = 776.4;
const SWITCH_LADDER = 776.4;
const slice = (from: number, to: number): { from: number; to: number } => ({ from, to });
/** Gradient (rise per metre) over each stretch: the ladders are the steepest (about 9%), the climbs and descents sweep on at 5 to 7%. */
const GRADES: [{ from: number; to: number }, number][] = [
  [base, 0.01],
  [forest, 0.03],
  [oldroad, -0.01],
  [river, -0.015],
  [slice(climb.from, climb.from + CLIMB_LADDER), 0.095],
  [slice(climb.from + CLIMB_LADDER, climb.to), 0.07],
  [slice(descent.from, descent.from + DESCENT_LADDER), -0.085],
  [slice(descent.from + DESCENT_LADDER, descent.to), -0.05],
  [slides, -0.01],
  [slice(sw.from, sw.from + SWITCH_LADDER), 0.09],
  [slice(sw.from + SWITCH_LADDER, sw.to), 0.06],
  [station, 0],
  [approach, 0.02],
  [camp, 0.01],
];
/** Height of the road above the start (about 180 m net); the terrain follows it. */
const relief = (m: number): number => GRADES.reduce((h, [r, g]) => h + g * Math.min(Math.max(m - r.from, 0), r.to - r.from), 0);

function buildRoad(): { points: RoadPointDef[]; bounds: LevelDef['terrain']['bounds'] } {
  const w = walkPath({ x: 0, z: START_OFFSET }, { x: 0, z: -1 }, EXPEDITION_PATH);
  const raw = [{ x: 0, z: START_OFFSET }, ...w.points];
  const points: RoadPointDef[] = [];
  let m = -START_OFFSET;
  for (let i = 0; i < raw.length; i++) {
    if (i > 0) m += Math.hypot(raw[i].x - raw[i - 1].x, raw[i].z - raw[i - 1].z);
    points.push({ x: raw[i].x, z: raw[i].z, dy: relief(m) });
  }
  const xs = raw.map((p) => p.x);
  const zs = raw.map((p) => p.z);
  return { points, bounds: { minX: Math.min(...xs) - 240, maxX: Math.max(...xs) + 240, minZ: Math.min(...zs) - 200, maxZ: Math.max(...zs) + 200 } };
}
const road = buildRoad();

// ------------------------------------------------------------------------------------------ fords and rivers
/** Each ford: where it is (centre, half length), how deep. All 0.45 m or less: both eligible vehicles can wade it. */
const FORDS: { centre: number; half: number; depth: number }[] = [
  { centre: river.from + 250, half: 20, depth: 0.38 },
  { centre: river.from + 610, half: 28, depth: 0.44 },
  { centre: forest.from + 1200, half: 7, depth: 0.2 },
  { centre: slides.from + 740, half: 9, depth: 0.3 },
  { centre: sw.from + 978, half: 6, depth: 0.25 },
];
const fords = FORDS.map((f) => ({ from: whole(f.centre - f.half), to: whole(f.centre + f.half), depth: f.depth }));
const rp = (m: number, lateral: number, below: number): { at: number; lateral: number; below: number } => ({ at: whole(m), lateral, below });
/** A stream or river crossing the road diagonally at a ford (the water sits just under the road there). */
const crossing = (id: string, centre: number, width: number, depth: number, bank: number): RiverDef => ({
  id,
  width,
  depth,
  bank,
  points: [rp(centre - 56, 34, 0.5), rp(centre - 28, 16, 0.5), rp(centre, 0, 0.35), rp(centre + 28, -16, 0.5), rp(centre + 56, -34, 0.5)],
});
const rivers: RiverDef[] = [crossing('creek', FORDS[0].centre, 8, 0.6, 10), crossing('river', FORDS[1].centre, 14, 1.0, 12), crossing('creek-2', FORDS[4].centre, 6, 0.5, 8)];

// -------------------------------------------------------------------------------------------------- stops
const stops: StopDef[] = [
  { id: 'camp-base', kind: 'pickup', at: at(base.from + 90), label: 'Village base camp', side: -1, party: 2, optional: false, who: 'film-crew', line: 'Forty cases of camera gear, two cameras and one sandwich. We are ready for the expedition.' },
  { id: 'base-drum', kind: 'service', at: at(base.from + 282), label: 'Village fuel drum', side: 1, services: ['refuel'], optional: true, variant: 'fuel' },
  { id: 'guide', kind: 'pickup', at: at(forest.from + 345), label: 'Forest trailhead (the local guide)', side: -1, party: 1, optional: false, who: 'trekkers', line: 'I know a short cut. It involves a river. Several rivers, actually.' },
  { id: 'forest-rest', kind: 'service', at: at(forest.from + 902), label: 'Forest tea rest', side: 1, services: ['refuel', 'repair'], optional: true, variant: 'kiosk' },
  { id: 'survey', kind: 'dropoff', at: at(oldroad.from + 90), label: 'Survey post (camera operator, equipment)', side: -1, party: 1, optional: false, who: 'film-crew', farewell: 'Dropping the camera and me here. If I am not on the next truck, I found a cave.' },
  { id: 'old-workshop', kind: 'service', at: at(oldroad.from + 480), label: 'Roadside workshop', side: 1, services: ['repair', 'refuel'], optional: true, variant: 'workshop' },
  { id: 'clinic', kind: 'pickup', at: at(river.from + 440), label: 'Field clinic (the expedition medic)', side: 1, party: 1, optional: false, who: 'doctor', line: 'I have a first-aid kit, a thermos and absolutely no faith in that bridge.' },
  { id: 'river-camp', kind: 'service', at: at(river.from + 478), label: 'River camp recovery station', side: -1, services: ['refuel', 'repair'], optional: true, variant: 'workshop' },
  { id: 'lookout', kind: 'dropoff', at: at(climb.from + 1130), label: 'High lookout hut (supply drop)', side: 1, party: 1, optional: false, who: 'trekkers', farewell: 'I am staying with the supplies. If the rain gets worse, I am staying with the roof.' },
  { id: 'lookout-kiosk', kind: 'service', at: at(climb.from + 1166), label: 'Lookout kiosk', side: -1, services: ['refuel'], optional: true, variant: 'kiosk' },
  { id: 'descent-kiosk', kind: 'service', at: at(descent.from + 800), label: 'Descent shelter kiosk', side: -1, services: ['refuel', 'repair'], optional: true, variant: 'kiosk' },
  { id: 'stranded', kind: 'pickup', at: at(slides.from + 570), label: 'Landslide area (stranded team)', side: 1, party: 2, optional: false, who: 'botanist', line: 'We were here first. The mountain was here first. The mountain won.' },
  { id: 'switch-kiosk', kind: 'service', at: at(sw.from + 830), label: 'Switchback tea hut', side: 1, services: ['refuel'], optional: true, variant: 'kiosk' },
  { id: 'station-pump', kind: 'service', at: at(station.from + 50), label: 'Wilderness station: fuel', side: 1, services: ['refuel'], optional: true, variant: 'fuel' },
  { id: 'station-garage', kind: 'service', at: at(station.from + 102), label: 'Wilderness station: workshop', side: -1, services: ['repair'], optional: true, variant: 'workshop' },
  { id: 'station-rest', kind: 'service', at: at(station.from + 272), label: 'Wilderness rest hut', side: 1, services: ['refuel', 'repair'], optional: true, variant: 'kiosk' },
];

// ---------------------------------------------------------------------------------------------- hazards
const hazards: HazardDef[] = [
  { id: 'forest-herd', kind: 'herd', at: at(forest.from + 470), seed: 6, label: 'Cattle on the track', reactive: true, count: 4 },
  { id: 'forest-bear', kind: 'creature', at: at(forest.from + 600), seed: 31, label: 'Bear crossing', variant: 'bear', reactive: true, side: -1 },
  { id: 'forest-rock', kind: 'landslide', at: at(forest.from + 1040), seed: 7, label: 'Monsoon rockfall', side: 1 },
  { id: 'old-rock', kind: 'landslide', at: at(oldroad.from + 470), seed: 21, label: 'Loose rocks on the old highway', side: -1 },
  { id: 'old-yeti', kind: 'creature', at: at(oldroad.from + 880), seed: 9, label: 'Yeti crossing', variant: 'yeti', side: 1, reactive: true },
  { id: 'river-herd', kind: 'herd', at: at(river.from + 90), seed: 12, label: 'Cattle at the water', reactive: true, count: 3 },
  { id: 'climb-rock', kind: 'landslide', at: at(climb.from + 1150), seed: 18, label: 'Falling rocks', side: -1 },
  { id: 'descent-bear', kind: 'creature', at: at(descent.from + 860), seed: 33, label: 'Bear crossing', variant: 'bear', reactive: true, side: 1 },
  { id: 'descent-rock', kind: 'landslide', at: at(descent.from + 1140), seed: 24, label: 'Rockfall on the descent', side: -1 },
  { id: 'slide-1', kind: 'landslide', at: at(slides.from + 225), seed: 14, label: 'Major rockfall', side: 1 },
  { id: 'slide-2', kind: 'landslide', at: at(slides.from + 400), seed: 15, label: 'Partial landslide', side: -1 },
  { id: 'slide-3', kind: 'landslide', at: at(slides.from + 690), seed: 16, label: 'Landslide debris', side: 1 },
  { id: 'switch-yeti', kind: 'creature', at: at(sw.from + 1120), seed: 27, label: 'Yeti crossing', variant: 'yeti', side: 1, reactive: true },
  { id: 'approach-slide', kind: 'landslide', at: at(approach.from + 220), seed: 36, label: 'Falling rocks', side: -1 },
  { id: 'approach-herd', kind: 'herd', at: at(approach.from + 570), seed: 38, label: 'Cattle on the track', reactive: true, count: 4 },
];

// ------------------------------------------------------------------------------------------ road surface
const seg = (from: number, to: number, surface: SurfaceId): { from: number; to: number; surface: SurfaceId } => ({ from: whole(from), to: whole(to), surface });
const surfaces = [
  // The base and the forest tracks: dirt, with mud in the hollows and stones.
  seg(base.from, base.to, 'dirt'),
  seg(forest.from, forest.from + 300, 'dirt'),
  seg(forest.from + 300, forest.from + 380, 'mud'),
  seg(forest.from + 380, forest.from + 700, 'dirt'),
  seg(forest.from + 700, forest.from + 800, 'mud'),
  seg(forest.from + 800, forest.from + 1000, 'rocky'),
  seg(forest.from + 1000, forest.to, 'dirt'),
  // The old highway: broken asphalt and gravel where it has gone.
  seg(oldroad.from, oldroad.from + 330, 'worn'),
  seg(oldroad.from + 330, oldroad.from + 480, 'gravel'),
  seg(oldroad.from + 480, oldroad.from + 700, 'worn'),
  seg(oldroad.from + 700, oldroad.to, 'gravel'),
  // The river section: gravel bars and mud banks.
  seg(river.from, river.from + 220, 'gravel'),
  seg(river.from + 280, river.from + 400, 'mud'),
  seg(river.from + 400, river.from + 560, 'gravel'),
  seg(river.from + 650, river.to, 'mud'),
  // The rocky climb: gravel, rock, mud and ruts.
  seg(climb.from, climb.from + 300, 'rocky'),
  seg(climb.from + 300, climb.from + 520, 'dirt'),
  seg(climb.from + 520, climb.from + 600, 'mud'),
  seg(climb.from + 600, climb.from + 820, 'rocky'),
  seg(climb.from + 820, climb.from + 1000, 'mud'),
  seg(climb.from + 1000, climb.from + 1200, 'dirt'),
  seg(climb.from + 1200, climb.to, 'rocky'),
  // The loose descent: gravel on the ladder, dirt below.
  seg(descent.from, descent.from + DESCENT_LADDER, 'gravel'),
  seg(descent.from + DESCENT_LADDER, descent.from + 1000, 'dirt'),
  seg(descent.from + 1000, descent.to, 'gravel'),
  // The landslide area: rubble, mud and a washed-out edge.
  seg(slides.from + 190, slides.from + 290, 'rocky'),
  seg(slides.from + 290, slides.from + 340, 'mud'),
  seg(slides.from + 380, slides.from + 440, 'rocky'),
  seg(slides.from + 640, slides.from + 790, 'mud'),
  // The switchbacks: dirt and mud ruts.
  seg(sw.from, sw.from + 300, 'dirt'),
  seg(sw.from + 300, sw.from + 400, 'mud'),
  seg(sw.from + 400, sw.from + SWITCH_LADDER, 'rocky'),
  seg(sw.from + SWITCH_LADDER, sw.from + 900, 'dirt'),
  seg(sw.from + 900, sw.to, 'mud'),
  seg(station.from, station.to, 'gravel'),
  seg(approach.from, approach.from + 300, 'dirt'),
  seg(approach.from + 300, approach.from + 400, 'mud'),
  seg(approach.from + 400, approach.to, 'dirt'),
  seg(camp.from, camp.to, 'gravel'),
];
const pu = (m: number, lateral: number, radius: number, pothole = false): PuddleDef => ({ at: at(m), lateral, radius, pothole });
const puddles: PuddleDef[] = [
  pu(base.from + 200, 0.8, 1.6),
  pu(forest.from + 330, -0.7, 2.2),
  pu(forest.from + 725, 0.6, 2.4),
  pu(forest.from + 880, -0.8, 1.1, true),
  pu(oldroad.from + 120, 1.2, 1.0, true),
  pu(oldroad.from + 260, -1.4, 1.1, true),
  pu(oldroad.from + 700, 0.8, 1.2, true),
  pu(river.from + 330, -0.8, 2.0),
  pu(river.from + 700, 0.6, 2.2),
  pu(climb.from + 550, 0.4, 2.0),
  pu(climb.from + 880, -0.6, 2.2),
  pu(descent.from + 960, 0.8, 1.6),
  pu(slides.from + 310, 0.5, 2.0),
  pu(slides.from + 700, -0.6, 2.4),
  pu(sw.from + 340, -0.4, 1.8),
  pu(sw.from + 960, 0.6, 2.0),
  pu(approach.from + 340, 0.7, 2.2),
];

// ---------------------------------------------------------------------------------------------- landmarks
const lm = (kind: LandmarkDef['kind'], m: number, side: -1 | 1, offset: number, extra: Partial<LandmarkDef> = {}): LandmarkDef => ({ kind, at: whole(m), side, offset, ...extra });
const landmarks: LandmarkDef[] = [];
const add = (...l: LandmarkDef[]): void => {
  landmarks.push(...l);
};
const every = (kind: LandmarkDef['kind'], from: number, to: number, step: number, offset: number, jitter = 4, first: -1 | 1 = 1, extra: Partial<LandmarkDef> = {}): void => {
  let i = 0;
  for (let m = from; m < to; m += step, i++) landmarks.push(lm(kind, m, ((i % 2 === 0 ? first : -first) as -1 | 1), offset + ((i * 7) % 5) * (jitter / 4), { rotation: ((i * 37) % 10) / 10 - 0.5, ...extra }));
};

// The base camp: a village, tents and gear, prayer flags.
add(
  lm('flagSpan', 6, 1, 0),
  lm('tent', base.from + 70, -1, 17, { rotation: 0.2 }),
  lm('tent', base.from + 100, -1, 21, { rotation: -0.3 }),
  lm('tent', base.from + 124, -1, 16),
  lm('house', base.from + 50, 1, 22),
  lm('house', base.from + 240, 1, 26, { rotation: 0.2 }),
  lm('chorten', base.from + 160, -1, 12),
  lm('prayerWheelHouse', base.from + 400, 1, 16),
  lm('signpost', base.from + 20, 1, 5.6),
);
// The forest tracks: shrines, flags, a hut.
every('retainWall', forest.from + 100, forest.to - 100, 220, 4.6, 0, 1);
add(
  lm('chorten', forest.from + 520, -1, 11),
  lm('flagSpan', forest.from + 700, 1, 0),
  lm('house', forest.from + 905, 1, 22),
  lm('lungta', forest.from + 1100, -1, 14),
  lm('ruin', forest.from + 1350, 1, 18),
  lm('signpost', forest.from + 20, 1, 5.0),
);
// The old highway: cliffs, the clinic.
every('cliff', oldroad.from + 80, oldroad.to - 80, 190, 10, 3, -1);
add(lm('house', oldroad.from + 485, 1, 20), lm('chorten', oldroad.from + 640, 1, 11), lm('flagSpan', oldroad.from + 330, 1, 0), lm('signpost', oldroad.from + 20, 1, 5.0));
// The river section: the collapsed bridge beside the big ford, the clinic and camp.
add(
  lm('brokenBridge', FORDS[1].centre - 44, 1, 26),
  lm('house', river.from + 440, 1, 18),
  lm('tent', river.from + 470, 1, 18),
  lm('tent', river.from + 500, 1, 20, { rotation: 0.3 }),
  lm('chorten', river.from + 300, -1, 11),
  lm('flagSpan', river.from + 420, 1, 0),
  lm('signpost', FORDS[0].centre - 40, 1, 5.0),
  lm('signpost', FORDS[1].centre - 60, -1, 5.0),
  lm('signpost', FORDS[1].centre + 60, 1, 5.0),
);
// The rocky climb, the loose descent, the landslide area: raw cliffs and retaining walls.
every('cliff', climb.from + 80, climb.to - 80, 130, 10, 3, 1, { scale: 1.2 });
every('retainWall', climb.from + 100, climb.from + CLIMB_LADDER, 90, 4.4, 0, -1);
add(lm('house', climb.from + 1135, 1, 16), lm('flagSpan', climb.from + 1220, 1, 0), lm('chorten', climb.from + 700, 1, 11));
every('cliff', descent.from + 80, descent.to - 80, 140, 10, 3, -1, { scale: 1.1 });
add(lm('flagSpan', descent.from + 500, 1, 0), lm('chorten', descent.from + 1000, 1, 11), lm('house', descent.from + 810, -1, 15));
every('cliff', slides.from + 40, slides.to - 40, 100, 9, 3, 1, { scale: 1.5 });
add(lm('cliff', slides.from + 225, 1, 9, { scale: 1.9 }), lm('cliff', slides.from + 400, -1, 9, { scale: 1.9 }), lm('cliff', slides.from + 690, 1, 9, { scale: 1.8 }), lm('tent', slides.from + 565, 1, 17), lm('tent', slides.from + 590, 1, 19, { rotation: 0.4 }));
every('cliff', sw.from + 80, sw.to - 80, 140, 10, 3, 1, { scale: 1.2 });
every('retainWall', sw.from + 100, sw.from + SWITCH_LADDER, 90, 4.4, 0, -1);
add(lm('house', sw.from + 830, 1, 17), lm('flagSpan', sw.from + 600, 1, 0), lm('chorten', sw.from + 1100, 1, 11));
// The wilderness station.
add(
  lm('house', station.from + 170, 1, 20),
  lm('tent', station.from + 200, -1, 18),
  lm('streetLamp', station.from + 50, 1, 6.0),
  lm('streetLamp', station.from + 120, -1, 6.0),
  lm('streetLamp', station.from + 270, 1, 6.0),
  lm('flagSpan', station.from + 60, 1, 0),
);
// The last forest track.
every('cliff', approach.from + 60, approach.to - 60, 170, 11, 3, -1);
add(lm('chorten', approach.from + 480, 1, 11), lm('flagSpan', approach.from + 700, 1, 0));
// The expedition camp: tents, a fire, supplies, parked 4x4s, lamps, flags.
add(
  lm('campsite', camp.to - 80, 1, 27),
  lm('plaza', camp.to - 52, 1, 15),
  lm('tent', camp.to - 120, -1, 22, { rotation: 0.3 }),
  lm('tent', camp.to - 90, -1, 25, { rotation: -0.2 }),
  lm('tent', camp.to - 55, -1, 22),
  lm('flagSpan', camp.from + 20, 1, 0),
  lm('flagSpan', camp.to - 110, 1, 0),
  lm('flagSpan', camp.to - 30, 1, 0),
  lm('signpost', camp.from + 30, -1, 5.8),
  lm('signpost', camp.to - 125, -1, 6.2),
  lm('chorten', camp.from + 100, -1, 12),
);
for (let m = camp.from + 40; m < camp.to - 10; m += 40) landmarks.push(lm('streetLamp', m, (Math.floor(m / 40) % 2 ? 1 : -1) as -1 | 1, 6.0));

// -------------------------------------------------------------------------------------- roadside life
const roadside: RoadsideDef = {
  walkers: [
    { at: at(base.from + 110), side: -1, count: 3, span: 12 },
    { at: at(river.from + 450), side: 1, count: 2, span: 12 },
    { at: at(camp.from + 160), side: 1, count: 4, span: 22 },
  ],
  standing: [
    { at: at(base.from + 92), side: -1, count: 3 },
    { at: at(forest.from + 347), side: -1, count: 1 },
    { at: at(oldroad.from + 92), side: -1, count: 2 },
    { at: at(river.from + 442), side: 1, count: 2 },
    { at: at(climb.from + 1132), side: 1, count: 1 },
    { at: at(slides.from + 572), side: 1, count: 3 },
    { at: at(camp.to - 55), side: 1, count: 5, offset: 4 },
  ],
  cones: [{ at: at(slides.from + 695), side: 1, length: 54 }],
  yaks: [
    { at: at(forest.from + 280), side: -1, offset: 16 },
    { at: at(river.from + 40), side: 1, offset: 18 },
    { at: at(approach.from + 520), side: -1, offset: 16 },
  ],
  parked: [
    { at: at(base.from + 74), side: -1, kind: 'suv' },
    { at: at(base.from + 112), side: -1, kind: 'truck' },
    { at: at(river.from + 445), side: 1, kind: 'suv' },
    { at: at(slides.from + 590), side: 1, kind: 'suv' },
    { at: at(station.from + 72), side: 1, kind: 'truck' },
    { at: at(camp.to - 96), side: 1, kind: 'suv' },
    { at: at(camp.to - 78), side: 1, kind: 'suv' },
    { at: at(camp.to - 36), side: 1, kind: 'truck' },
  ],
  crowd: { at: at(P - 24), side: 1, count: 12, offset: 9, width: 16 },
};

const wp = (from: number, to: number, width: number, shoulder: number): { from: number; to: number; width: number; shoulder: number } => ({ from: whole(from), to: whole(to), width, shoulder });
const widthProfile = [
  wp(-12, base.to - 10, 6.6, 1.2),
  wp(forest.from + 10, forest.to - 10, 5.4, 0.4),
  wp(oldroad.from + 10, oldroad.to - 10, 6.2, 0.6),
  wp(river.from + 10, river.to - 10, 5.8, 0.5),
  wp(climb.from + 10, climb.to - 10, 5.6, 0.4),
  wp(descent.from + 10, descent.to - 10, 5.8, 0.4),
  wp(slides.from + 10, slides.from + 215, 6.6, 0.5),
  wp(slides.from + 215, slides.from + 240, 8.6, 0.8),
  wp(slides.from + 250, slides.from + 390, 6.6, 0.5),
  wp(slides.from + 390, slides.from + 415, 8.6, 0.8),
  wp(slides.from + 425, slides.to - 10, 6.6, 0.5),
  wp(sw.from + 10, sw.to - 10, 5.6, 0.4),
  wp(station.from + 10, station.to - 10, 8.0, 3.2),
  wp(approach.from + 10, approach.to - 10, 5.6, 0.4),
  wp(camp.to - 130, camp.to + FINISH_OFFSET, 13, 6),
];

const junctions: JunctionDef[] = [];

export const remoteExpedition: LevelDef = {
  id: 'remote-expedition',
  name: 'Eastern Tshechu Expedition',
  subtitle: 'Mud, rocks and rivers',
  description:
    'A documentary team, forty cases of gear and a tent that does not fit in the car have to reach a remote expedition camp. The tracks are mud, the highway is broken, the bridge is in the river, the mountain keeps dropping pieces of itself on the road, and the rains have come early. Technical driving, patience and the right drivetrain will get you there.',
  objective: 'Collect the team, make your supply drops, rescue the stranded team past the landslides, and bring everyone to the expedition camp.',
  difficulty: 9,
  region: 'Central & Eastern Bhutan',
  mission: { kind: 'expedition', party: 4, finishMode: 'stop', timerStyle: 'deadline', timerLabel: 'Daylight left', comfort: true },
  vehicles: ['druk-ranger', 'dragon-cruiser'],
  tip: 'Switch to 4x4 (F) before the mud and the climbs, keep steady speed through ruts, cross every ford in a straight line (the ranger wades 0.5 m, the cruiser 0.8), and brake gently and early on the loose descent: the brakes fade.',
  conditions: [
    { weather: 'cloudy', time: 'day', bonus: 1 },
    { weather: 'heavyRain', time: 'day', bonus: 1.35 },
    { weather: 'clear', time: 'day', bonus: 1 },
  ],
  startFuel: 0.6,
  reward: 900,
  stops,
  hazards,
  traffic: {
    count: 3,
    speed: [6, 10],
    oncoming: 0.25,
    seed: 8,
    turnChance: 0,
    mix: [
      { kind: 'truck', weight: 2 },
      { kind: 'suv', weight: 1.2 },
      { kind: 'tractor', weight: 1 },
      { kind: 'bus', weight: 0.4 },
    ],
    scripted: [
      { at: at(forest.from + 800), kind: 'tractor', speed: 3.4 },
      { at: at(oldroad.from + 300), kind: 'truck', speed: 4.6 },
      { at: at(climb.from + 500), kind: 'truck', speed: 3.4 },
      { at: at(descent.from + 400), kind: 'tractor', speed: 3.2 },
      { at: at(sw.from + 500), kind: 'truck', speed: 3.4 },
    ],
  },
  junctions,
  roadside,
  rivers,
  fords,
  brakeFade: true,
  weatherZones: [
    // Cloud, then rain that gets steadily worse, heavy at the landslides, easing to cloud and dusk at the camp.
    { from: at(forest.from + 400), to: at(river.from), weather: 'rain' },
    { from: at(river.from), to: at(climb.from + 600), weather: 'heavyRain' },
    { from: at(climb.from + 600), to: at(slides.from), weather: 'rain' },
    { from: at(slides.from), to: at(sw.from + 500), weather: 'heavyRain' },
    { from: at(sw.from + 500), to: at(station.from), weather: 'rain', time: 'dusk' },
    { from: at(station.from), to: at(camp.to), weather: 'cloudy', time: 'dusk' },
  ],
  celebrate: true,
  celebrateFlags: true,
  optional: [
    { id: 'intact', kind: 'condition', value: 70, reward: 120, label: 'Arrive in one piece' },
    { id: 'smooth', kind: 'comfort', value: 65, reward: 100, label: 'A team that still speaks to you' },
    { id: 'drum', kind: 'useService', reward: 40, label: 'Fuelled on the expedition' },
  ],
  puddles,
  surfaces,
  shoulder: 'dirt',
  terrain: {
    seed: 17,
    bounds: road.bounds,
    cell: 9,
    slope: 0,
    hillHeight: 14,
    detailHeight: 9,
    valleyZ: 99999,
    valleyDepth: 0,
    waterLevel: -999,
    followRoad: 1,
  },
  road: { width: 6.0, shoulder: 0.5, startOffset: START_OFFSET, finishOffset: FINISH_OFFSET, points: road.points, widthProfile },
  checkpoints: [
    { at: at(base.to - 40), label: 'Out of the village' },
    { at: at(forest.from + 700), label: 'Forest tracks' },
    { at: at(forest.to - 60), label: 'The old highway' },
    { at: at(oldroad.from + 700), label: 'Broken asphalt' },
    { at: at(river.from + 400), label: 'The river fords' },
    { at: at(river.to - 40), label: 'Across the river' },
    { at: at(climb.from + 700), label: 'The rocky climb' },
    { at: at(climb.to - 60), label: 'The high lookout' },
    { at: at(descent.from + 700), label: 'The loose descent' },
    { at: at(slides.from + 300), label: 'The landslide area' },
    { at: at(sw.from + 700), label: 'The switchbacks' },
    { at: at(station.from + 200), label: 'Wilderness station' },
    { at: at(approach.from + 450), label: 'The last forest' },
    { at: at(camp.from + 100), label: 'Expedition camp' },
  ],
  finishLabel: 'Expedition camp',
  // Provisional: Stage 6.9B calibrates the deadline and medals by driving the route.
  timeLimit: 1260,
  medals: { gold: 960, silver: 1050, bronze: 1150 },
  comfortMedals: { gold: 75, silver: 60, bronze: 40 },
  unlock: { levelId: 'bumthang-night', requirement: 'finish' },
  look: {
    skyTop: 0x5d7690,
    skyMid: 0xa2b4bd,
    skyHorizon: 0xd2d2c2,
    fog: 0xbcbdae,
    mist: 0xd3d4c8,
    grassA: 0x5b7a3e,
    grassB: 0x486a35,
    meadow: 0x7a8a4e,
    rock: 0x8d8272,
    hemi: 1.9,
    sun: 2.2,
    rockFrom: 9999,
    snowFrom: 9999,
    snowTo: 10000,
    meadowFrom: 9999,
    meadowTo: 10000,
    leaf: 0x5a8a3e,
    treeLine: 900,
    shoulder: 0x7a6a4e,
  },
  weather: 'none',
  scenery: {
    seed: 71,
    trees: 1800,
    rocks: 650,
    species: { pine: 0.4, cypress: 0.15, broadleaf: 0.35, shrub: 0.1 },
    landmarks,
  },
  atmosphere: { summitMist: 0.3, mistStart: 0.4, visibility: 0.92 },
};
