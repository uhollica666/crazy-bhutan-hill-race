import type { HazardDef, JunctionDef, LandmarkDef, LevelDef, PuddleDef, RoadPointDef, RoadsideDef, StopDef, SurfaceId } from '../types';
import { walkPath } from './extend';
import { AIRPORT_LENGTH, AIRPORT_PATH, airportRange } from './airportPath';

/**
 * Level 3: Paro Airport Dash (about 6.4 km). Collect a group of very late tourists from a Thimphu hotel and drive the
 * fictionalised Thimphu to Paro highway: the river, the Chuzom-style confluence, a narrow gorge, roadworks and the Paro
 * valley, against a flight check-in deadline. Fast, long and less crowded than the city, with real hazards.
 *
 * Distances are metres from the start line (`m`). The level id, unlock rule, eligible vehicles and reward are unchanged from
 * the original mission, so saves and cloud progress keep working. The deadline and medals are provisional (Stage 6.3B calibrates).
 */
const P = AIRPORT_LENGTH;
const START_OFFSET = 30;
const FINISH_OFFSET = 36;
const at = (m: number): number => m / P;
const whole = (m: number): number => (START_OFFSET + m) / (P + START_OFFSET + FINISH_OFFSET);

const hotel = airportRange('hotel');
const exit = airportRange('exit');
const riverside = airportRange('riverside');
const confluence = airportRange('confluence');
const gorge = airportRange('gorge');
const roadworks = airportRange('roadworks');
const valley = airportRange('valley');
const airport = airportRange('airport');

/** Designed relief on top of the gentle terrain: a long descent beside the river, a climb through the gorge, a drop through the roadworks. */
const bump = (m: number, from: number, to: number): number => {
  if (m <= from || m >= to) return 0;
  const t = (m - from) / (to - from);
  return Math.sin(Math.PI * t) ** 1.3;
};
const relief = (m: number): number =>
  -16 * bump(m, riverside.from + 120, riverside.from + 1300) + 18 * bump(m, gorge.from - 60, gorge.to - 120) - 14 * bump(m, roadworks.from, roadworks.to + 120) - 8 * bump(m, valley.from + 200, valley.from + 700);

function buildRoad(): { points: RoadPointDef[]; bounds: LevelDef['terrain']['bounds'] } {
  const w = walkPath({ x: 0, z: START_OFFSET }, { x: 0, z: -1 }, AIRPORT_PATH);
  const raw = [{ x: 0, z: START_OFFSET }, ...w.points];
  const points: RoadPointDef[] = [];
  let m = -START_OFFSET;
  for (let i = 0; i < raw.length; i++) {
    if (i > 0) m += Math.hypot(raw[i].x - raw[i - 1].x, raw[i].z - raw[i - 1].z);
    points.push({ x: raw[i].x, z: raw[i].z, dy: relief(m) });
  }
  const xs = raw.map((p) => p.x);
  const zs = raw.map((p) => p.z);
  const pad = 280;
  return { points, bounds: { minX: Math.min(...xs) - pad, maxX: Math.max(...xs) + pad, minZ: Math.min(...zs) - pad, maxZ: Math.max(...zs) + pad } };
}
const road = buildRoad();

// ------------------------------------------------------------------------------------------------ junctions
const junction = (m: number, sides: (-1 | 1)[], arm: number, width: number): JunctionDef => ({ at: at(m), sides, arm, width, zebra: false });
const junctions: JunctionDef[] = [
  junction(exit.from + 60, [1], 40, 8),
  junction(riverside.from + 700, [-1], 35, 7),
  junction(confluence.from + 420, [-1, 1], 55, 9),
  junction(valley.from + 300, [1], 35, 7),
  junction(valley.from + 800, [-1, 1], 40, 8),
  junction(airport.from + 60, [1], 60, 9),
];

// -------------------------------------------------------------------------------------------------- stops
const stops: StopDef[] = [
  { id: 'hotel', kind: 'pickup', at: at(hotel.from + 100), label: 'Hotel Druk entrance (with all the luggage)', side: 1, party: 3, optional: false, who: 'photographers' },
  { id: 'late-guest', kind: 'pickup', at: at(exit.from + 270), label: 'Roadside bus stop (one very late guest)', side: -1, party: 1, optional: false, who: 'shopper' },
  { id: 'river-fuel', kind: 'service', at: at(riverside.from + 900), label: 'Riverside fuel station', side: 1, services: ['refuel'], optional: true, variant: 'fuel' },
  { id: 'river-garage', kind: 'service', at: at(riverside.from + 970), label: 'Chuzom Garage', side: -1, services: ['repair'], optional: true, variant: 'workshop' },
  { id: 'rest-stop', kind: 'service', at: at(confluence.to - 110), label: 'Chuzom rest stop', side: 1, services: ['refuel', 'repair'], optional: true, variant: 'kiosk' },
  { id: 'valley-fuel', kind: 'service', at: at(valley.from + 420), label: 'Paro valley fuel stop', side: 1, services: ['refuel'], optional: true, variant: 'fuel' },
];

// ---------------------------------------------------------------------------------------------- hazards
const hazards: HazardDef[] = [
  { id: 'gorge-rockfall', kind: 'landslide', at: at(gorge.from + 300), seed: 8, label: 'Falling rocks' },
  { id: 'slope-rockfall', kind: 'landslide', at: at(confluence.from + 700), seed: 9, label: 'Falling rocks' },
  { id: 'gorge-truck', kind: 'brokenTruck', at: at(gorge.from + 640), seed: 4, label: 'Broken-down truck' },
];

// ------------------------------------------------------------------------------------------ road surface
const seg = (from: number, to: number, surface: SurfaceId): { from: number; to: number; surface: SurfaceId } => ({ from: whole(from), to: whole(to), surface });
const surfaces = [
  seg(riverside.from + 500, riverside.from + 650, 'wetAsphalt'),
  seg(gorge.from, gorge.from + 150, 'wetAsphalt'),
  seg(gorge.from + 330, gorge.from + 390, 'rocky'),
  seg(roadworks.from + 90, roadworks.from + 150, 'wetAsphalt'),
  seg(roadworks.from + 150, roadworks.from + 430, 'gravel'),
  seg(roadworks.from + 430, roadworks.from + 520, 'wetAsphalt'),
  seg(valley.from + 900, valley.from + 980, 'wetAsphalt'),
];
const pu = (m: number, lateral: number, radius: number, pothole = false): PuddleDef => ({ at: at(m), lateral, radius, pothole });
const puddles: PuddleDef[] = [
  pu(riverside.from + 560, -1.2, 2.0),
  pu(gorge.from + 60, 1.0, 1.8),
  pu(roadworks.from + 100, -1.2, 2.2),
  pu(roadworks.from + 125, 1.4, 2.0),
  pu(roadworks.from + 470, 0.4, 2.2),
  // Potholes in the roadworks: small, dark, avoidable.
  pu(roadworks.from + 170, -1.6, 0.9, true),
  pu(roadworks.from + 205, 1.5, 1.0, true),
  pu(roadworks.from + 240, -0.4, 0.9, true),
  pu(roadworks.from + 300, 1.8, 1.1, true),
  pu(roadworks.from + 340, -1.9, 1.0, true),
  pu(roadworks.from + 385, 0.6, 0.9, true),
  pu(valley.from + 920, 1.0, 0.8, true),
];

// ---------------------------------------------------------------------------------------------- landmarks
const lm = (kind: LandmarkDef['kind'], m: number, side: -1 | 1, offset: number, extra: Partial<LandmarkDef> = {}): LandmarkDef => ({ kind, at: whole(m), side, offset, ...extra });
const landmarks: LandmarkDef[] = [];
// Hotel and the street out of town.
landmarks.push(lm('flagSpan', 8, 1, 0), lm('hotel', hotel.from + 100, 1, 24, { scale: 1.1 }), lm('house', hotel.from + 40, -1, 22), lm('house', hotel.from + 190, -1, 24, { rotation: 0.2 }), lm('house', hotel.from + 230, 1, 26), lm('chorten', hotel.from + 150, -1, 14), lm('streetLamp', hotel.from + 70, -1, 6.4), lm('streetLamp', hotel.from + 150, 1, 6.4));
// Highway exit: signs, lorries' lay-by, hillside.
landmarks.push(lm('signpost', exit.from + 20, 1, 6.2), lm('signpost', exit.from + 250, -1, 6.2), lm('retainWall', exit.from + 190, 1, 6.5), lm('house', exit.from + 300, -1, 30), lm('lungta', exit.from + 400, -1, 22), lm('flagSpan', exit.from + 480, 1, 0));
// Riverside highway: cliffs and retaining walls on one side, the river on the other, a settlement or two.
for (let m = riverside.from + 100; m < riverside.to - 60; m += 150) {
  const side: -1 | 1 = Math.floor((m - riverside.from) / 150) % 2 === 0 ? 1 : -1;
  landmarks.push(lm('retainWall', m, side, 6.4));
}
landmarks.push(
  lm('cliff', riverside.from + 380, 1, 12),
  lm('cliff', riverside.from + 1150, -1, 12),
  lm('signpost', riverside.from + 140, -1, 6.4),
  lm('signpost', riverside.from + 800, 1, 6.4),
  lm('house', riverside.from + 600, -1, 34),
  lm('house', riverside.from + 640, -1, 40, { rotation: 0.3 }),
  lm('chorten', riverside.from + 1000, -1, 14),
  lm('prayerWheelHouse', riverside.from + 1300, 1, 16),
  lm('flagSpan', riverside.from + 760, 1, 0),
  lm('stall', riverside.from + 880, -1, 12),
);
// The confluence: a bridge over each river, the junction, rocky slopes.
landmarks.push(
  lm('bridge', confluence.from + 120, 1, 0),
  lm('bridge', confluence.from + 760, 1, 0),
  lm('cliff', confluence.from + 250, -1, 12),
  lm('cliff', confluence.from + 560, 1, 12, { scale: 1.1 }),
  lm('chorten', confluence.from + 430, 1, 15, { scale: 1.2 }),
  lm('flagSpan', confluence.from + 400, 1, 0),
  lm('signpost', confluence.from + 380, -1, 6.4),
  lm('signpost', confluence.from + 700, 1, 6.4),
  lm('house', confluence.from + 460, -1, 38),
  lm('lungta', confluence.from + 820, -1, 22),
);
// The gorge: cliff faces, retaining walls and warning signs.
for (const [m, side] of [
  [gorge.from + 40, 1],
  [gorge.from + 180, -1],
  [gorge.from + 300, 1],
  [gorge.from + 440, -1],
  [gorge.from + 560, 1],
  [gorge.from + 700, -1],
  [gorge.from + 800, 1],
] as [number, -1 | 1][]) landmarks.push(lm('cliff', m, side, 9, { scale: 0.9 + (m % 3) * 0.1 }));
landmarks.push(lm('retainWall', gorge.from + 110, -1, 5.2), lm('retainWall', gorge.from + 500, 1, 5.2), lm('signpost', gorge.from + 220, 1, 4.8), lm('signpost', gorge.from + 560, -1, 4.8), lm('flagSpan', gorge.from + 650, 1, 0));
// Roadworks: signs, a bit of machinery's worth of dust (rocks), a roadside shrine.
landmarks.push(lm('signpost', roadworks.from + 40, 1, 6.2), lm('signpost', roadworks.from + 80, -1, 6.2), lm('cliff', roadworks.from + 300, 1, 14), lm('retainWall', roadworks.from + 220, -1, 6.2), lm('chorten', roadworks.from + 560, 1, 13));
// Paro valley: villages, prayer flags, farm stalls.
for (const [m, side, off] of [
  [valley.from + 80, -1, 30],
  [valley.from + 140, 1, 34],
  [valley.from + 340, -1, 28],
  [valley.from + 560, 1, 32],
  [valley.from + 640, -1, 36],
  [valley.from + 860, 1, 28],
  [valley.from + 1000, -1, 32],
] as [number, -1 | 1, number][]) landmarks.push(lm('house', m, side, off, { rotation: (m % 5) * 0.1 - 0.2 }));
landmarks.push(lm('chortenGroup', valley.from + 400, -1, 34), lm('dzong', valley.from + 700, -1, 90, { scale: 1.2 }), lm('flagSpan', valley.from + 240, 1, 0), lm('flagSpan', valley.from + 960, 1, 0), lm('stall', valley.from + 120, 1, 11), lm('stall', valley.from + 600, -1, 11), lm('lungta', valley.from + 800, 1, 26), lm('signpost', valley.from + 380, 1, 6.6), lm('signpost', valley.from + 1090, -1, 6.6));
// Airport: the terminal, tower, forecourt, signs; the airfield beyond a fence, with parked aircraft and a runway.
landmarks.push(
  lm('signpost', airport.from + 20, -1, 6.8),
  lm('signpost', airport.from + 100, 1, 6.8),
  lm('flagSpan', airport.from + 130, 1, 0),
  lm('flagSpan', airport.from + 410, 1, 0),
  lm('terminal', airport.from + 360, 1, 46, { scale: 1.15 }),
  lm('terminal', airport.from + 250, 1, 52, { scale: 0.9, rotation: 0.05 }),
  lm('tower', airport.from + 300, 1, 74),
  lm('plaza', airport.from + 340, 1, 20, { scale: 0.9 }),
  lm('busShelter', airport.from + 330, -1, 9.5),
  lm('trolley', airport.from + 345, 1, 15),
  lm('trolley', airport.from + 372, 1, 15, { rotation: 0.2 }),
  lm('planter', airport.from + 300, -1, 9.5),
  lm('planter', airport.from + 390, -1, 9.5),
  lm('runway', airport.from + 300, -1, 150),
  lm('plane', airport.from + 250, -1, 96, { rotation: 0.4 }),
  lm('plane', airport.from + 360, -1, 100, { rotation: -0.3 }),
  lm('chortenGroup', airport.from + 180, 1, 40),
  lm('house', airport.from + 120, -1, 34),
);
for (let m = airport.from + 60; m < airport.to - 80; m += 16) landmarks.push(lm('railing', m, -1, 28));
// A distant ridge of cliffs behind the terminal.
landmarks.push(lm('cliff', airport.from + 200, 1, 120, { scale: 2 }), lm('cliff', airport.from + 420, 1, 110, { scale: 2 }));

// -------------------------------------------------------------------------------------- roadside life
const roadside: RoadsideDef = {
  walkers: [
    { at: at(hotel.from + 90), side: 1, count: 3, span: 12 },
    { at: at(hotel.from + 200), side: -1, count: 2, span: 14 },
    { at: at(riverside.from + 620), side: -1, count: 2, span: 20 },
    { at: at(confluence.from + 450), side: 1, count: 3, span: 18 },
    { at: at(valley.from + 120), side: 1, count: 2, span: 20 },
    { at: at(valley.from + 560), side: -1, count: 2, span: 22 },
    { at: at(airport.from + 150), side: 1, count: 3, span: 20 },
  ],
  standing: [
    { at: at(hotel.from + 110), side: 1, count: 3 },
    { at: at(exit.from + 272), side: -1, count: 2 },
    { at: at(riverside.from + 900), side: 1, count: 2 },
    { at: at(confluence.from + 440), side: -1, count: 3 },
    { at: at(airport.from + 330), side: -1, count: 4 },
    { at: at(airport.from + 360), side: 1, count: 4, offset: 0.4 },
  ],
  cones: [
    { at: at(roadworks.from + 110), side: 1, length: 90 },
    { at: at(roadworks.from + 300), side: -1, length: 66 },
  ],
  parked: [
    { at: at(hotel.from + 60), side: 1, kind: 'taxi' },
    { at: at(hotel.from + 140), side: 1, kind: 'minibus' },
    { at: at(riverside.from + 860), side: 1, kind: 'truck' },
    { at: at(riverside.from + 940), side: -1, kind: 'delivery' },
    { at: at(confluence.to - 140), side: 1, kind: 'bus' },
    { at: at(confluence.to - 100), side: 1, kind: 'car' },
    { at: at(valley.from + 400), side: 1, kind: 'truck' },
    { at: at(airport.from + 260), side: 1, kind: 'bus' },
    { at: at(airport.from + 290), side: 1, kind: 'taxi' },
    { at: at(airport.from + 310), side: 1, kind: 'taxi' },
    { at: at(airport.from + 395), side: 1, kind: 'minibus' },
    { at: at(airport.from + 420), side: 1, kind: 'car' },
    { at: at(airport.from + 440), side: 1, kind: 'suv' },
    { at: at(airport.from + 250), side: -1, kind: 'car' },
    { at: at(airport.from + 275), side: -1, kind: 'suv' },
    { at: at(airport.from + 330), side: -1, kind: 'bus' },
  ],
  birds: [
    { at: at(riverside.from + 400), side: -1, offset: 14, count: 4 },
    { at: at(valley.from + 560), side: 1, offset: 20, count: 5 },
  ],
  crowd: { at: at(P - 24), side: 1, count: 12, offset: 1.2, width: 22 },
};

const wp = (from: number, to: number, width: number, shoulder: number): { from: number; to: number; width: number; shoulder: number } => ({ from: whole(from), to: whole(to), width, shoulder });
const widthProfile = [
  wp(-12, hotel.to + 10, 9.6, 2.4),
  wp(riverside.from + 40, riverside.to - 40, 10, 1.0),
  wp(confluence.to - 220, confluence.to - 30, 11, 5),
  wp(gorge.from + 40, gorge.to - 40, 6.8, 0.5),
  wp(valley.from + 20, valley.to - 20, 10.4, 1.4),
  wp(airport.from + 130, airport.to + FINISH_OFFSET, 14, 8),
];

export const airportDash: LevelDef = {
  id: 'airport-dash',
  name: 'Airport Dash',
  subtitle: 'Thimphu to the departure gate',
  description:
    'A tour group is dangerously late for their flight. Load them up at the hotel, pick up the last straggler, and drive the Thimphu to Paro highway: river, gorge, roadworks and all. A smooth ride keeps the passengers (and the tips) happy.',
  objective: 'Reach Paro Airport before check-in closes, and keep your passengers comfortable.',
  difficulty: 3,
  region: 'Paro & Thimphu',
  mission: { kind: 'airport', party: 4, finishMode: 'stop', timerStyle: 'deadline', timerLabel: 'Check-in closes in', comfort: true },
  vehicles: ['tourist-coaster', 'druk-ranger', 'dragon-cruiser'],
  conditions: [
    { weather: 'clear', time: 'day', bonus: 1 },
    { weather: 'rain', time: 'day', bonus: 1.25 },
    { weather: 'clear', time: 'dusk', bonus: 1.15 },
  ],
  startFuel: 0.6,
  reward: 420,
  stops,
  hazards,
  traffic: {
    count: 9,
    speed: [13, 19],
    oncoming: 0.45,
    seed: 5,
    turnChance: 0.2,
    mix: [
      { kind: 'car', weight: 3 },
      { kind: 'taxi', weight: 1.5 },
      { kind: 'suv', weight: 2 },
      { kind: 'bus', weight: 1.2 },
      { kind: 'minibus', weight: 1.2 },
      { kind: 'truck', weight: 2 },
      { kind: 'delivery', weight: 1 },
      { kind: 'moto', weight: 1 },
      { kind: 'bike', weight: 0.25 },
    ],
    scripted: [
      { at: at(riverside.from + 300), kind: 'truck', speed: 6.5 },
      { at: at(riverside.from + 1100), kind: 'truck', speed: 6.0 },
      { at: at(gorge.from + 120), kind: 'truck', speed: 5.5 },
      { at: at(roadworks.from + 50), kind: 'bus', speed: 7 },
      // A short queue at the confluence junction.
      { at: at(confluence.from + 380), kind: 'car', speed: 5, hold: 3, trigger: 130 },
      { at: at(confluence.from + 366), kind: 'taxi', speed: 5, hold: 5.5, trigger: 130 },
      { at: at(confluence.from + 352), kind: 'minibus', speed: 5, hold: 8, trigger: 130 },
    ],
  },
  junctions,
  roadside,
  weatherZones: [
    { from: at(gorge.from + 100), to: at(gorge.from + 560), weather: 'fog' },
    { from: at(roadworks.from + 20), to: at(roadworks.from + 600), weather: 'rain' },
  ],
  celebrate: true,
  celebrateFlags: true,
  rival: { name: 'Zangmo Express', vehicleId: 'tourist-coaster', finishTime: 430, headStart: 4 },
  optional: [
    { id: 'smooth', kind: 'comfort', value: 85, reward: 70, label: 'Silky smooth ride' },
    { id: 'rival', kind: 'beatRival', reward: 90, label: 'Beat the Zangmo Express' },
    { id: 'fuel', kind: 'useService', reward: 30, label: 'Fuelled up on the way' },
  ],
  tip: 'Passengers dislike hard braking and fast corners. Slow in, smooth out; the straights are where you gain time. Watch for the fuel stop, the gorge and the roadworks.',
  puddles,
  surfaces,
  shoulder: 'gravel',
  terrain: {
    seed: 31,
    bounds: road.bounds,
    cell: 6,
    slope: 0,
    hillHeight: 9,
    detailHeight: 3,
    valleyZ: 99999,
    valleyDepth: 0,
    waterLevel: -999,
  },
  road: { width: 9, shoulder: 0.8, startOffset: START_OFFSET, finishOffset: FINISH_OFFSET, points: road.points, widthProfile },
  checkpoints: [
    { at: at(exit.from + 380), label: 'Highway exit' },
    { at: at(riverside.from + 450), label: 'Riverside' },
    { at: at(riverside.to - 100), label: 'Chuzom approach' },
    { at: at(confluence.to - 20), label: 'Past the confluence' },
    { at: at(gorge.from + 450), label: 'Gorge' },
    { at: at(roadworks.from + 330), label: 'Roadworks' },
    { at: at(valley.from + 450), label: 'Paro valley' },
    { at: at(airport.from + 80), label: 'Airport road' },
  ],
  finishLabel: 'Departures',
  // Provisional: Stage 6.3B calibrates the deadline and medals by driving the route.
  timeLimit: 560,
  medals: { gold: 400, silver: 450, bronze: 500 },
  pace: { 'tourist-coaster': 1.09 },
  comfortMedals: { gold: 85, silver: 70, bronze: 50 },
  unlock: { levelId: 'pass-run', requirement: 'finish' },
  look: {
    skyTop: 0x4a82b3,
    skyMid: 0xa6d4ee,
    skyHorizon: 0xfbf0d6,
    fog: 0xe0dccd,
    grassA: 0x9fbb5c,
    grassB: 0x7fa84f,
    meadow: 0xb0b968,
    hemi: 2.5,
    sun: 3.0,
    snowFrom: 9999,
    snowTo: 10000,
    rockFrom: 9999,
    meadowFrom: 9999,
    meadowTo: 10000,
    leaf: 0x8fb94e,
    treeLine: 160,
  },
  weather: 'none',
  scenery: {
    seed: 57,
    trees: 1500,
    rocks: 380,
    species: { pine: 0.45, cypress: 0.2, broadleaf: 0.3, shrub: 0.05 },
    landmarks,
  },
  atmosphere: { summitMist: 0, mistStart: 0.5, visibility: 1.15 },
};
