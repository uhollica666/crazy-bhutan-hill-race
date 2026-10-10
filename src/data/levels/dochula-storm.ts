import type { HazardDef, JunctionDef, LandmarkDef, LevelDef, PuddleDef, RoadPointDef, RoadsideDef, StopDef, SurfaceId } from '../types';
import { walkPath } from './extend';
import { DOCHULA_LENGTH, DOCHULA_PATH, dochulaRange } from './dochulaPath';

/**
 * Level 5: Dochula Storm Descent (about 8.9 km). Tourists lingered too long on the pass and a mountain storm is closing in. A long,
 * steep descent in worsening weather: cold ice at the summit, a ladder of hairpins in the forest, a dense fog zone with trucks
 * creeping ahead, a landslide, the storm corridor, an emergency shelter, then the lower valley and the lodge as the clouds lift.
 * The weather is the challenge: fog, rain and wet asphalt change as the car goes down, and long braking heats the brakes.
 *
 * Distances are metres from the start line (`m`). The level id, unlock rule, vehicles and passenger capacity are those of the
 * original mission, so saves and cloud progress keep working. The deadline and medals are provisional (Stage 6.5B calibrates).
 */
const P = DOCHULA_LENGTH;
const START_OFFSET = 30;
const FINISH_OFFSET = 36;
/** Fraction of the playable stretch (stops, hazards, checkpoints, puddles, roadside life, weather zones). */
const at = (m: number): number => m / P;
/** Fraction of the whole road (surfaces, width profile, landmarks). */
const whole = (m: number): number => (START_OFFSET + m) / (P + START_OFFSET + FINISH_OFFSET);

const summit = dochulaRange('summit');
const highroad = dochulaRange('highroad');
const forest = dochulaRange('forest');
const fog = dochulaRange('fog');
const slide = dochulaRange('slide');
const storm = dochulaRange('storm');
const shelter = dochulaRange('shelter');
const valley = dochulaRange('valley');
const lodge = dochulaRange('lodge');

/** Gradient (rise per metre, negative = downhill) of each section: the descent is steepest in the forest and the storm corridor. */
const GRADES: [{ from: number; to: number }, number][] = [
  [summit, -0.005],
  [highroad, -0.035],
  [forest, -0.09],
  [fog, -0.055],
  [slide, -0.035],
  [storm, -0.07],
  [shelter, -0.005],
  [valley, -0.03],
  [lodge, -0.005],
];
/** Height of the road relative to the start (about 440 m of descent in all); the terrain follows it (`terrain.followRoad`). */
const relief = (m: number): number => GRADES.reduce((h, [r, g]) => h + g * Math.min(Math.max(m - r.from, 0), r.to - r.from), 0);

function buildRoad(): { points: RoadPointDef[]; bounds: LevelDef['terrain']['bounds'] } {
  const w = walkPath({ x: 0, z: START_OFFSET }, { x: 0, z: -1 }, DOCHULA_PATH);
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

// -------------------------------------------------------------------------------------------------- stops
const stops: StopDef[] = [
  { id: 'summit', kind: 'pickup', at: at(summit.from + 85), label: 'Dochula coach park (the 108 chortens)', side: 1, party: 2, optional: false, who: 'photo-nomads', line: 'The clouds are SO dramatic. Can we stay for the thunder?' },
  { id: 'late-visitor', kind: 'pickup', at: at(summit.from + 300), label: 'Souvenir stall (one very late visitor)', side: -1, party: 1, optional: false, who: 'shopper', line: 'Wait, one last photo! It is only a little rain. Is that rain?' },
  { id: 'pass-pump', kind: 'service', at: at(highroad.from + 625), label: 'Mountain roadside pump', side: -1, services: ['refuel'], optional: true, variant: 'fuel' },
  { id: 'forest-kiosk', kind: 'service', at: at(forest.from + 1235), label: 'Forest tea kiosk', side: 1, services: ['refuel', 'repair'], optional: true, variant: 'kiosk' },
  { id: 'storm-shelter', kind: 'dropoff', at: at(shelter.from + 75), label: 'Emergency storm shelter', side: 1, party: 1, optional: false, who: 'shopper', farewell: 'This shelter has a roof and a bench. I will wait for the next bus, with tea, and a very good story.' },
  { id: 'storm-garage', kind: 'service', at: at(shelter.from + 310), label: 'Storm garage (repairs and fuel)', side: 1, services: ['repair', 'refuel'], optional: true, variant: 'workshop' },
  { id: 'valley-lift', kind: 'pickup', at: at(valley.from + 70), label: 'Lay-by (a stranded guest needs a lift)', side: -1, party: 1, optional: false, who: 'archery-fan', line: 'We watched the storm from the ridge. It looked small from there.' },
  { id: 'valley-pump', kind: 'service', at: at(valley.from + 820), label: 'Valley fuel stop', side: 1, services: ['refuel', 'repair'], optional: true, variant: 'kiosk' },
];

// ---------------------------------------------------------------------------------------------- hazards
const hazards: HazardDef[] = [
  { id: 'forest-rockfall', kind: 'landslide', at: at(forest.from + 1535), seed: 31, label: 'Falling rocks', side: -1 },
  { id: 'fog-breakdown', kind: 'brokenTruck', at: at(fog.from + 665), seed: 8, label: 'Broken-down truck', side: -1 },
  { id: 'slide-a', kind: 'landslide', at: at(slide.from + 235), seed: 14, label: 'Landslide', side: 1 },
  { id: 'slide-b', kind: 'landslide', at: at(slide.from + 430), seed: 15, label: 'Landslide debris', side: -1 },
  { id: 'storm-rockfall', kind: 'landslide', at: at(storm.from + 885), seed: 41, label: 'Falling rocks', side: 1 },
];

// ------------------------------------------------------------------------------------------ road surface
const seg = (from: number, to: number, surface: SurfaceId): { from: number; to: number; surface: SurfaceId } => ({ from: whole(from), to: whole(to), surface });
const surfaces = [
  // Black ice in the shade at altitude.
  seg(highroad.from + 330, highroad.from + 385, 'ice'),
  seg(highroad.from + 905, highroad.from + 985, 'ice'),
  // Old, cracked tarmac in the forest and the storm corridor.
  seg(highroad.from + 400, highroad.from + 560, 'worn'),
  seg(forest.from + 300, forest.from + 900, 'worn'),
  seg(forest.from + 1300, forest.from + 1420, 'worn'),
  seg(fog.from + 100, fog.from + 600, 'worn'),
  // Mud and debris around the two slips, and runoff over the washed-out edge in the storm.
  seg(slide.from + 215, slide.from + 280, 'mud'),
  seg(slide.from + 410, slide.from + 475, 'mud'),
  seg(slide.from + 245, slide.from + 262, 'rocky'),
  seg(storm.from, storm.from + 500, 'worn'),
  seg(storm.from + 1030, storm.from + 1110, 'mud'),
  seg(valley.from + 150, valley.from + 500, 'worn'),
];
const pu = (m: number, lateral: number, radius: number, pothole = false): PuddleDef => ({ at: at(m), lateral, radius, pothole });
const puddles: PuddleDef[] = [
  pu(forest.from + 310, 1.1, 1.8),
  pu(forest.from + 640, -1.0, 1.9),
  pu(forest.from + 880, 1.0, 1.1, true),
  pu(forest.from + 1330, -0.8, 1.0, true),
  pu(fog.from + 250, 0.6, 2.0),
  pu(fog.from + 520, -1.1, 1.0, true),
  pu(slide.from + 225, -0.8, 2.2),
  pu(slide.from + 272, 0.6, 2.4),
  pu(slide.from + 418, 1.0, 2.2),
  pu(slide.from + 466, -0.5, 2.0),
  pu(storm.from + 70, 0.8, 2.2),
  pu(storm.from + 150, -1.0, 2.4),
  pu(storm.from + 250, 1.2, 2.3),
  pu(storm.from + 340, -0.7, 2.5),
  pu(storm.from + 435, 0.9, 1.1, true),
  pu(storm.from + 570, -1.2, 2.2),
  pu(storm.from + 720, 0.6, 2.4),
  pu(storm.from + 860, -0.9, 1.1, true),
  pu(storm.from + 1040, 0.4, 2.6),
  pu(storm.from + 1075, -0.9, 2.4),
  pu(storm.from + 1190, 1.0, 2.2),
  pu(storm.from + 1290, -0.6, 2.0),
  pu(shelter.from + 40, 0.9, 2.0),
  pu(valley.from + 260, -0.7, 1.0, true),
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

// The pass: the 108 chortens on their mound, prayer flags everywhere, tea houses, a souvenir stall.
add(
  lm('chortenRing', summit.from + 80, 1, 27, { scale: 1.15 }),
  lm('flagSpan', summit.from + 6, 1, 0),
  lm('flagSpan', summit.from + 70, 1, 0),
  lm('flagSpan', summit.from + 170, 1, 0),
  lm('flagSpan', summit.from + 330, 1, 0),
  lm('flagSpan', summit.from + 470, 1, 0),
  lm('lungta', summit.from + 120, -1, 16),
  lm('lungta', summit.from + 260, 1, 16),
  lm('chortenGroup', summit.from + 210, 1, 24),
  lm('chorten', summit.from + 20, -1, 12),
  lm('chorten', summit.from + 500, 1, 13),
  lm('house', summit.from + 40, -1, 20),
  lm('house', summit.from + 70, -1, 26, { rotation: 0.2 }),
  lm('stall', summit.from + 300, -1, 9),
  lm('stall', summit.from + 330, -1, 9),
  lm('viewpoint', summit.from + 420, -1, 9),
  lm('signpost', summit.from + 18, 1, 6.0),
  lm('signpost', summit.from + 540, -1, 6.0),
  lm('prayerWheelHouse', summit.from + 420, 1, 17),
);
// The high road: cliffs, retaining walls, flags, the abandoned scenic viewpoint.
every('cliff', highroad.from + 100, highroad.to - 60, 170, 11, 4, -1);
every('retainWall', highroad.from + 60, highroad.to - 60, 150, 5.4, 0, 1);
add(
  lm('viewpoint', highroad.to - 70, -1, 8),
  lm('flagSpan', highroad.from + 140, 1, 0),
  lm('flagSpan', highroad.from + 760, 1, 0),
  lm('chorten', highroad.from + 320, 1, 12),
  lm('lungta', highroad.from + 520, -1, 15),
  lm('signpost', highroad.from + 30, 1, 5.6),
  lm('signpost', highroad.from + 880, -1, 5.6),
  lm('stall', highroad.from + 630, 1, 9),
);
// The forest descent: retaining walls at every hairpin, cliffs, shrines.
every('retainWall', forest.from + 150, forest.to - 120, 120, 5.0, 0, -1);
every('cliff', forest.from + 100, forest.to - 100, 150, 12, 4, 1);
add(
  lm('chorten', forest.from + 650, -1, 12),
  lm('chorten', forest.from + 1450, 1, 12),
  lm('lungta', forest.from + 400, 1, 14),
  lm('flagSpan', forest.from + 240, 1, 0),
  lm('flagSpan', forest.from + 1250, 1, 0),
  lm('signpost', forest.from + 20, 1, 5.4),
  lm('signpost', forest.from + 1180, -1, 5.4),
  lm('house', forest.from + 1215, -1, 22),
);
// The fog zone: ghostly shrines and cliffs, hazard signs.
every('cliff', fog.from + 120, fog.to - 100, 190, 11, 4, -1);
add(
  lm('chorten', fog.from + 300, 1, 12),
  lm('chorten', fog.from + 840, -1, 12),
  lm('signpost', fog.from + 40, 1, 5.6),
  lm('signpost', fog.from + 600, -1, 5.6),
  lm('flagSpan', fog.from + 450, 1, 0),
  lm('retainWall', fog.from + 200, 1, 5.2),
  lm('retainWall', fog.from + 700, -1, 5.2),
);
// The landslide: raw scars on the hillside, broken walls, warning signs.
add(
  lm('cliff', slide.from + 225, 1, 11, { scale: 1.5 }),
  lm('cliff', slide.from + 255, 1, 11, { scale: 1.3, rotation: 0.3 }),
  lm('cliff', slide.from + 420, -1, 11, { scale: 1.5 }),
  lm('cliff', slide.from + 450, -1, 11, { scale: 1.3, rotation: -0.3 }),
  lm('retainWall', slide.from + 90, -1, 5.4),
  lm('signpost', slide.from + 60, 1, 5.8),
  lm('signpost', slide.from + 495, -1, 5.8),
);
// The storm corridor: wet walls, tin-roofed houses, a roadside shrine.
every('retainWall', storm.from + 60, storm.to - 60, 140, 5.2, 0, -1);
every('cliff', storm.from + 120, storm.to - 120, 210, 11, 4, 1);
add(
  lm('house', storm.from + 700, -1, 20),
  lm('house', storm.from + 735, -1, 26, { rotation: 0.3 }),
  lm('house', storm.from + 770, -1, 21, { rotation: -0.2 }),
  lm('chorten', storm.from + 560, 1, 12),
  lm('flagSpan', storm.from + 300, 1, 0),
  lm('flagSpan', storm.from + 1180, 1, 0),
  lm('signpost', storm.from + 20, 1, 5.6),
  lm('signpost', storm.from + 960, -1, 5.6),
);
// The shelter and its lay-by.
add(
  lm('shelter', shelter.from + 75, 1, 13),
  lm('streetLamp', shelter.from + 55, 1, 6.2),
  lm('streetLamp', shelter.from + 100, 1, 6.2),
  lm('flagSpan', shelter.from + 200, 1, 0),
  lm('signpost', shelter.from + 20, -1, 5.8),
  lm('signpost', shelter.from + 300, -1, 5.8),
  lm('chorten', shelter.from + 360, -1, 12),
  lm('retainWall', shelter.from + 250, -1, 5.4),
);
// The lower valley: villages, terraces, shrines, the clouds lifting.
every('house', valley.from + 30, valley.to - 40, 85, 18, 8, -1);
every('paddy', valley.from + 60, valley.to - 60, 140, 20, 6, 1);
add(
  lm('stall', valley.from + 90, -1, 9),
  lm('stall', valley.from + 830, -1, 9),
  lm('busShelter', valley.from + 72, -1, 7.2),
  lm('chortenGroup', valley.from + 420, 1, 22),
  lm('prayerWheelHouse', valley.from + 640, -1, 14),
  lm('flagSpan', valley.from + 200, 1, 0),
  lm('flagSpan', valley.from + 900, 1, 0),
  lm('lungta', valley.from + 1000, 1, 16),
  lm('signpost', valley.from + 15, 1, 5.8),
  lm('signpost', valley.from + 1320, -1, 5.8),
);
// The lodge: a covered entrance, parking, flags and signs.
add(
  lm('lodge', lodge.to - 78, 1, 27),
  lm('plaza', lodge.to - 52, 1, 15, { scale: 1.0 }),
  lm('flagSpan', lodge.from + 10, 1, 0),
  lm('flagSpan', lodge.to - 110, 1, 0),
  lm('flagSpan', lodge.to - 20, 1, 0),
  lm('signpost', lodge.from + 30, -1, 5.8),
  lm('signpost', lodge.to - 120, -1, 6.2),
  lm('planter', lodge.to - 70, -1, 8.2),
  lm('planter', lodge.to - 40, -1, 8.2),
  lm('streetLamp', lodge.to - 95, 1, 6.2),
  lm('streetLamp', lodge.to - 60, 1, 6.2),
  lm('streetLamp', lodge.to - 25, 1, 6.2),
  lm('chorten', lodge.from + 90, -1, 12),
  lm('house', lodge.from + 60, -1, 24),
  lm('house', lodge.from + 200, -1, 26, { rotation: 0.2 }),
  lm('stall', lodge.to - 140, -1, 10),
);

// -------------------------------------------------------------------------------------- roadside life
const roadside: RoadsideDef = {
  walkers: [
    { at: at(summit.from + 70), side: 1, count: 4, span: 14 },
    { at: at(summit.from + 150), side: -1, count: 3, span: 18 },
    { at: at(summit.from + 330), side: -1, count: 2, span: 12 },
    { at: at(highroad.from + 620), side: 1, count: 2, span: 14 },
    { at: at(storm.from + 720), side: -1, count: 2, span: 20 },
    { at: at(valley.from + 90), side: -1, count: 2, span: 14 },
    { at: at(valley.from + 560), side: 1, count: 3, span: 20 },
    { at: at(valley.from + 1080), side: -1, count: 2, span: 20 },
  ],
  standing: [
    { at: at(summit.from + 87), side: 1, count: 3 },
    { at: at(summit.from + 302), side: -1, count: 2 },
    { at: at(highroad.from + 627), side: -1, count: 2 },
    { at: at(forest.from + 1237), side: 1, count: 2 },
    { at: at(shelter.from + 77), side: 1, count: 3, offset: 0.4 },
    { at: at(shelter.from + 312), side: 1, count: 2 },
    { at: at(valley.from + 72), side: -1, count: 1 },
    { at: at(lodge.to - 55), side: 1, count: 4, offset: 4 },
  ],
  cones: [{ at: at(storm.from + 1035), side: -1, length: 78 }],
  markers: [
    { from: at(fog.from + 100), to: at(fog.from + 1160), spacing: 20 },
    { from: at(slide.from + 60), to: at(slide.from + 510), spacing: 22 },
    { from: at(storm.from + 100), to: at(storm.from + 760), spacing: 26 },
  ],
  drains: [
    { from: at(forest.from + 320), to: at(forest.to - 120), side: -1 },
    { from: at(slide.from + 20), to: at(slide.from + 480), side: -1 },
    { from: at(storm.from + 40), to: at(storm.to - 40), side: 1 },
  ],
  yaks: [
    { at: at(summit.from + 190), side: 1, offset: 18 },
    { at: at(summit.from + 210), side: 1, offset: 24 },
    { at: at(summit.from + 450), side: -1, offset: 20 },
    { at: at(valley.from + 400), side: 1, offset: 16 },
    { at: at(valley.from + 1150), side: -1, offset: 15 },
  ],
  parked: [
    { at: at(summit.from + 50), side: 1, kind: 'bus' },
    { at: at(summit.from + 100), side: 1, kind: 'bus' },
    { at: at(summit.from + 128), side: 1, kind: 'minibus' },
    { at: at(summit.from + 312), side: -1, kind: 'taxi' },
    { at: at(highroad.to - 62), side: -1, kind: 'suv' },
    { at: at(highroad.to - 78), side: -1, kind: 'car' },
    { at: at(shelter.from + 100), side: 1, kind: 'minibus' },
    { at: at(shelter.from + 330), side: 1, kind: 'truck' },
    { at: at(valley.from + 52), side: -1, kind: 'taxi' },
    { at: at(lodge.to - 98), side: 1, kind: 'suv' },
    { at: at(lodge.to - 82), side: 1, kind: 'car' },
    { at: at(lodge.to - 30), side: 1, kind: 'minibus' },
    { at: at(lodge.to - 12), side: 1, kind: 'taxi' },
  ],
  crowd: { at: at(P - 24), side: 1, count: 12, offset: 8, width: 16 },
};

const wp = (from: number, to: number, width: number, shoulder: number): { from: number; to: number; width: number; shoulder: number } => ({ from: whole(from), to: whole(to), width, shoulder });
const widthProfile = [
  wp(-12, summit.to - 20, 8.2, 1.3),
  wp(highroad.from + 10, highroad.to - 10, 6.8, 0.5),
  wp(forest.from + 10, forest.to - 10, 7.2, 0.5),
  wp(fog.from + 10, fog.to - 10, 7.4, 0.6),
  wp(slide.from + 10, slide.to - 10, 9.0, 0.8),
  wp(storm.from + 10, storm.from + 1020, 7.2, 0.5),
  wp(storm.from + 1040, storm.from + 1115, 5.8, 0.3),
  wp(storm.from + 1130, storm.to - 10, 7.2, 0.5),
  wp(shelter.from + 20, shelter.from + 360, 8.4, 3.6),
  wp(valley.from + 10, valley.to - 10, 8.2, 1.0),
  wp(lodge.to - 140, lodge.to + FINISH_OFFSET, 13, 6),
];

const junctions: JunctionDef[] = [
  { at: at(valley.from + 400), sides: [1], arm: 30, width: 6, zebra: false },
  { at: at(valley.from + 1000), sides: [-1], arm: 30, width: 6, zebra: false },
];

export const dochulaStorm: LevelDef = {
  id: 'dochula-storm',
  name: 'Dochula Storm Descent',
  subtitle: 'Down the pass before the storm peaks',
  description:
    'The tourists lingered too long at the 108 chortens, and a mountain storm is now rolling over the pass. Cloud will swallow the road, fog will hide the trucks, rain will turn the hairpins to glass and a landslide waits below. Get the guests down to the valley lodge before it all gets worse.',
  objective: 'Collect the guests on the pass, take a lost visitor to the emergency shelter, give a stranded guest a lift, and deliver everyone safely to the valley lodge.',
  difficulty: 5,
  region: 'Punakha Valley',
  mission: { kind: 'descent', party: 3, finishMode: 'stop', timerStyle: 'deadline', timerLabel: 'Storm peaks in', comfort: true },
  vehicles: ['dzo-hatch', 'druk-ranger', 'dragon-cruiser'],
  tip: 'Brake early and in short bursts: hot brakes fade on the long descents. Slow right down in the fog and follow the glowing marker posts, take the landslide through the gap, and let rain mean longer braking distances.',
  conditions: [
    { weather: 'clear', time: 'day', bonus: 1 },
    { weather: 'heavyRain', time: 'day', bonus: 1.25 },
    { weather: 'fog', time: 'dusk', bonus: 1.3 },
  ],
  startFuel: 0.6,
  reward: 520,
  stops,
  hazards,
  traffic: {
    count: 7,
    speed: [9, 14],
    oncoming: 0.45,
    seed: 53,
    turnChance: 0,
    slowInFog: true,
    mix: [
      { kind: 'bus', weight: 1.6 },
      { kind: 'truck', weight: 2.2 },
      { kind: 'suv', weight: 1.8 },
      { kind: 'taxi', weight: 1.2 },
      { kind: 'delivery', weight: 1 },
      { kind: 'moto', weight: 0.6 },
      { kind: 'car', weight: 1 },
    ],
    scripted: [
      // Slow trucks and buses creeping around the hairpins, through the fog and down the storm road.
      { at: at(forest.from + 260), kind: 'truck', speed: 4.2 },
      { at: at(forest.from + 1000), kind: 'bus', speed: 5.0 },
      { at: at(fog.from + 330), kind: 'truck', speed: 5.0 },
      { at: at(fog.from + 950), kind: 'delivery', speed: 4.5 },
      { at: at(storm.from + 400), kind: 'truck', speed: 5.5 },
      { at: at(valley.from + 300), kind: 'minibus', speed: 6.5 },
    ],
  },
  junctions,
  roadside,
  weatherZones: [
    // The pass is clear. Then wind and cloud, mist in the trees, rain, thick fog, rain again, the storm, a lull at the shelter,
    // and the cloud thinning over the lower valley.
    { from: at(highroad.from + 120), to: at(forest.from + 300), weather: 'cloudy' },
    { from: at(forest.from + 300), to: at(forest.from + 900), weather: 'fog' },
    { from: at(forest.from + 900), to: at(fog.from + 60), weather: 'rain' },
    { from: at(fog.from + 60), to: at(fog.from + 330), weather: 'fog' },
    { from: at(fog.from + 330), to: at(fog.from + 780), weather: 'denseFog' },
    { from: at(fog.from + 780), to: at(slide.from + 60), weather: 'fog' },
    { from: at(slide.from + 60), to: at(storm.from + 60), weather: 'rain' },
    { from: at(storm.from + 60), to: at(storm.to - 150), weather: 'heavyRain' },
    { from: at(storm.to - 150), to: at(shelter.to), weather: 'rain' },
    { from: at(valley.from), to: at(valley.from + 800), weather: 'cloudy' },
  ],
  celebrate: true,
  celebrateFlags: true,
  brakeFade: true,
  optional: [
    { id: 'smooth', kind: 'comfort', value: 80, reward: 90, label: 'Calm guests, wild weather' },
    { id: 'clean', kind: 'condition', value: 85, reward: 60, label: 'No bumps on the way down' },
    { id: 'tea', kind: 'useService', reward: 25, label: 'Warm tea on the way' },
  ],
  puddles,
  surfaces,
  shoulder: 'mud',
  terrain: {
    seed: 77,
    bounds: road.bounds,
    cell: 9,
    slope: 0,
    hillHeight: 20,
    detailHeight: 8,
    valleyZ: 99999,
    valleyDepth: 0,
    waterLevel: -999,
    followRoad: 1,
  },
  road: { width: 7.2, shoulder: 0.6, startOffset: START_OFFSET, finishOffset: FINISH_OFFSET, points: road.points, widthProfile },
  checkpoints: [
    { at: at(summit.to - 60), label: 'Leaving the pass' },
    { at: at(highroad.from + 500), label: 'High mountain road' },
    { at: at(highroad.to - 70), label: 'Scenic viewpoint (no stopping: storm!)' },
    { at: at(forest.from + 620), label: 'Hairpin descent' },
    { at: at(forest.to - 120), label: 'Forest edge' },
    { at: at(fog.from + 520), label: 'Fog bank' },
    { at: at(slide.from + 300), label: 'The landslide' },
    { at: at(storm.from + 450), label: 'Storm corridor' },
    { at: at(storm.to - 60), label: 'Washed-out edge' },
    { at: at(shelter.to - 30), label: 'Past the shelter' },
    { at: at(valley.from + 650), label: 'Lower valley' },
    { at: at(lodge.from + 120), label: 'Lodge road' },
  ],
  finishLabel: 'Valley lodge',
  // Provisional: Stage 6.5B calibrates the deadline and medals by driving the route.
  timeLimit: 840,
  medals: { gold: 640, silver: 700, bronze: 770 },
  comfortMedals: { gold: 80, silver: 65, bronze: 45 },
  unlock: { levelId: 'punakha-valley', requirement: 'finish' },
  look: {
    skyTop: 0x5c6870,
    skyMid: 0x97a2a6,
    skyHorizon: 0xc9ccc4,
    fog: 0xaeb4ae,
    mist: 0xc8cdc8,
    grassA: 0x58733f,
    grassB: 0x46623a,
    meadow: 0x8e8a5a,
    hemi: 1.8,
    sun: 1.6,
    sunColor: 0xe9e6dc,
    snowFrom: 9999,
    snowTo: 10000,
    rockFrom: 9999,
    // Cold, khaki high-altitude grass at the top of the descent, green forest and fields below.
    meadowFrom: -70,
    meadowTo: -5,
    leaf: 0x4f8a3f,
    treeLine: -12,
    shoulder: 0x6a5a44,
  },
  weather: 'none',
  scenery: {
    seed: 33,
    trees: 1700,
    rocks: 380,
    species: { pine: 0.5, cypress: 0.22, broadleaf: 0.2, shrub: 0.08 },
    landmarks,
  },
  atmosphere: { summitMist: 0.5, mistStart: 0.15, visibility: 0.95 },
};
