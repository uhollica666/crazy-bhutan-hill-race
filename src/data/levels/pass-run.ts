import type { HazardDef, LandmarkDef, LevelDef, PuddleDef, RoadPointDef, RoadsideDef, StopDef, SurfaceId } from '../types';
import { walkPath } from './extend';
import { PASS_RUN_PATH, PASS_RUN_LENGTH, sectionRange } from './passRunPath';

/**
 * Route 1: Pass Run. A tourism run from a market village, through the river valley and the forest, past a service area, up a
 * hairpin ladder to a viewpoint, down into a rough side valley and over the icy high pass to the summit plaza (about 4.9 km).
 *
 * Distances below are metres from the start line (`m`). The level id, unlock rule, vehicles and reward are unchanged from the
 * original mission, so saves and cloud progress keep working. Time limit and medals are provisional (Stage 6.1B calibrates them).
 */
const P = PASS_RUN_LENGTH;
const START_OFFSET = 30;
const FINISH_OFFSET = 38;
/** Fraction of the playable stretch (stops, hazards, checkpoints, puddles, roadside life). */
const at = (m: number): number => m / P;
/** Fraction of the whole road (surfaces, width profile, landmarks). */
const whole = (m: number): number => (START_OFFSET + m) / (P + START_OFFSET + FINISH_OFFSET);

const TERRAIN_SLOPE = 0.056;
const bump = (m: number, from: number, to: number): number => {
  if (m <= from || m >= to) return 0;
  const t = (m - from) / (to - from);
  return Math.sin(Math.PI * t) ** 1.4;
};

/** Designed altitude relief on top of the terrain's own climb: a rolling valley, a forest dip, a real descent into the rough valley. */
const relief = (m: number): number => 3.2 * Math.sin(m / 170) * (m < 1000 ? 1 : 0) - 8 * bump(m, 1230, 1480) - 22 * bump(m, 2900, 3300) - 6 * bump(m, 3980, 4120);

function buildRoad(): { points: RoadPointDef[]; bounds: LevelDef['terrain']['bounds'] } {
  const w = walkPath({ x: 0, z: START_OFFSET }, { x: 0, z: -1 }, PASS_RUN_PATH);
  const raw = [{ x: 0, z: START_OFFSET }, ...w.points];
  const points: RoadPointDef[] = [];
  let m = -START_OFFSET;
  for (let i = 0; i < raw.length; i++) {
    if (i > 0) m += Math.hypot(raw[i].x - raw[i - 1].x, raw[i].z - raw[i - 1].z);
    points.push({ x: raw[i].x, z: raw[i].z, dy: relief(m) });
  }
  const xs = raw.map((p) => p.x);
  const zs = raw.map((p) => p.z);
  const pad = 240;
  return { points, bounds: { minX: Math.min(...xs) - pad, maxX: Math.max(...xs) + pad, minZ: Math.min(...zs) - pad, maxZ: Math.max(...zs) + pad } };
}

const road = buildRoad();

const sec = (id: string): { from: number; to: number } => sectionRange(id);
const service = sec('service');
const hairpins = sec('hairpins');
const viewpoint = sec('viewpoint');
const rough = sec('rough');
const pass = sec('pass');
const arrival = sec('arrival');

// ------------------------------------------------------------------------------------------------ stops
const stops: StopDef[] = [
  { id: 'hotel', kind: 'pickup', at: at(150), label: 'Hotel Tashi lay-by', side: -1, party: 2, optional: false, who: 'sunrise-hikers' },
  { id: 'forest-hiker', kind: 'pickup', at: at(1255), label: 'Trailhead lay-by', side: 1, party: 1, optional: false, who: 'backpacker' },
  { id: 'service-fuel', kind: 'service', at: at(service.from + 105), label: 'Gyalpo fuel stop', side: 1, services: ['refuel'], optional: true, variant: 'fuel' },
  { id: 'service-garage', kind: 'service', at: at(service.from + 175), label: 'Tshering Garage', side: -1, services: ['repair'], optional: true, variant: 'workshop' },
  { id: 'viewpoint-dropoff', kind: 'dropoff', at: at(viewpoint.from + 130), label: 'Viewpoint cafe', side: 1, party: 1, optional: false, who: 'backpacker' },
  { id: 'viewpoint-kiosk', kind: 'service', at: at(viewpoint.from + 175), label: 'Viewpoint tea and fuel', side: -1, services: ['refuel', 'repair'], optional: true, variant: 'kiosk' },
  { id: 'viewpoint-pickup', kind: 'pickup', at: at(viewpoint.from + 255), label: 'Viewpoint lay-by', side: 1, party: 1, optional: false, who: 'archery-fan' },
];

// ---------------------------------------------------------------------------------------------- hazards
const hazards: HazardDef[] = [{ id: 'pass-rockfall', kind: 'landslide', at: at(rough.from + 650), seed: 5, label: 'Small rockfall' }];

// ------------------------------------------------------------------------------------------ road surface
const seg = (from: number, to: number, surface: SurfaceId): { from: number; to: number; surface: SurfaceId } => ({ from: whole(from), to: whole(to), surface });
const surfaces = [
  seg(820, 1000, 'wetAsphalt'),
  seg(1480, 1570, 'wetAsphalt'),
  seg(3150, 3300, 'wetAsphalt'),
  seg(rough.from + 330, rough.from + 430, 'gravel'),
  seg(rough.from + 430, rough.from + 510, 'dirt'),
  seg(rough.from + 510, rough.from + 600, 'mud'),
  seg(rough.from + 630, rough.from + 750, 'rocky'),
  seg(pass.from + 395, pass.from + 535, 'ice'),
];

const p = (m: number, lateral: number, radius: number): PuddleDef => ({ at: at(m), lateral, radius });
const puddles: PuddleDef[] = [
  p(300, -1.6, 2.0),
  p(322, 1.8, 1.8),
  p(1100, -1.2, 2.1),
  p(1540, 1.0, 2.0),
  p(3205, -1.2, 2.0),
  p(rough.from + 535, -0.8, 2.4),
  p(rough.from + 552, 1.6, 2.0),
  p(rough.from + 570, 0, 2.2),
  p(pass.from + 330, 0.9, 1.8),
];

// ---------------------------------------------------------------------------------------------- landmarks
const lm = (kind: LandmarkDef['kind'], m: number, side: -1 | 1, offset: number, extra: Partial<LandmarkDef> = {}): LandmarkDef => ({ kind, at: whole(m), side, offset, ...extra });
const landmarks: LandmarkDef[] = [];

// Village: shop rows, houses behind them, lamps along the verge, prayer flags at both ends.
landmarks.push(lm('flagSpan', 4, 1, 0), lm('flagSpan', 396, 1, 0));
[
  [70, 1],
  [150, -1],
  [235, 1],
  [315, -1],
].forEach(([m, side]) => landmarks.push(lm('shopRow', m, side as -1 | 1, 15)));
[
  [30, -1, 22],
  [110, 1, 24],
  [190, -1, 24],
  [275, 1, 24],
  [355, -1, 26],
  [395, 1, 24],
].forEach(([m, side, o], i) => landmarks.push(lm('house', m, side as -1 | 1, o, { rotation: (i % 3) * 0.2 - 0.2 })));
for (let m = 25; m < 410; m += 48) landmarks.push(lm('streetLamp', m, m % 96 === 25 ? 1 : -1, 7.6));
landmarks.push(lm('stall', 100, 1, 9.5, { rotation: 0.1 }), lm('stall', 205, -1, 9.5), lm('stall', 290, 1, 9.5, { rotation: -0.2 }), lm('chorten', 380, -1, 15));
// River valley.
landmarks.push(lm('house', 470, 1, 30), lm('chorten', 590, -1, 13), lm('prayerWheelHouse', 700, 1, 16), lm('flagSpan', 760, 1, 0), lm('house', 820, -1, 34), lm('signpost', 540, 1, 7.4));
// Forest.
landmarks.push(lm('chorten', 960, 1, 12), lm('signpost', 1010, -1, 7), lm('lungta', 1180, -1, 20), lm('house', 1260, -1, 24), lm('flagSpan', 1420, 1, 0), lm('chorten', 1560, -1, 12), lm('signpost', 1600, 1, 7));
// Service area.
landmarks.push(lm('flagSpan', service.from + 10, 1, 0), lm('signpost', service.from + 50, -1, 11), lm('house', service.from + 130, 1, 34), lm('lungta', service.from + 230, -1, 28));
// Hairpin ladder: dry-stone retaining walls and warning signs.
[
  [hairpins.from + 50, 1],
  [hairpins.from + 120, -1],
  [hairpins.from + 205, 1],
  [hairpins.from + 280, -1],
  [hairpins.from + 360, 1],
  [hairpins.from + 440, -1],
  [hairpins.from + 520, 1],
].forEach(([m, side]) => landmarks.push(lm('retainWall', m, side as -1 | 1, 6.4)));
landmarks.push(lm('signpost', hairpins.from + 40, -1, 6.9), lm('signpost', hairpins.from + 265, 1, 6.9), lm('chorten', hairpins.from + 600, 1, 12), lm('lungta', hairpins.from + 330, 1, 22));
// Viewpoint.
landmarks.push(lm('viewpoint', viewpoint.from + 150, 1, 17), lm('flagSpan', viewpoint.from + 120, 1, 0), lm('lungta', viewpoint.from + 210, 1, 26), lm('chortenGroup', viewpoint.from + 330, -1, 30), lm('house', viewpoint.from + 190, -1, 30));
// Rough valley.
landmarks.push(lm('signpost', rough.from + 300, 1, 7), lm('signpost', rough.from + 625, -1, 7), lm('retainWall', rough.from + 690, 1, 6.2), lm('lungta', rough.from + 300, -1, 24), lm('chorten', rough.from + 770, 1, 12));
// High pass.
landmarks.push(lm('flagSpan', pass.from + 120, 1, 0), lm('chorten', pass.from + 230, -1, 12), lm('signpost', pass.from + 380, 1, 7), lm('retainWall', pass.from + 450, -1, 6.2), lm('prayerWheelHouse', pass.from + 560, 1, 16), lm('lungta', pass.from + 620, -1, 20));
// Destination: the summit plaza, its monastery and the memorial chortens.
landmarks.push(
  lm('flagSpan', arrival.from + 120, 1, 0),
  lm('flagSpan', arrival.from + 250, 1, 0),
  lm('plaza', arrival.from + 330, 1, 23),
  lm('dzong', arrival.from + 380, -1, 70, { scale: 0.85 }),
  lm('chortenGroup', arrival.from + 300, -1, 34),
  lm('shopRow', arrival.from + 345, -1, 24),
  lm('lungta', arrival.from + 360, 1, 40),
  lm('house', arrival.from + 395, 1, 44),
);

// ------------------------------------------------------------------------------------- roadside life
const finishM = P;
const roadside: RoadsideDef = {
  walkers: [
    { at: at(60), side: 1, count: 3, span: 18 },
    { at: at(140), side: -1, count: 2, span: 14 },
    { at: at(228), side: 1, count: 3, span: 22 },
    { at: at(318), side: -1, count: 2, span: 16 },
    { at: at(392), side: 1, count: 2, span: 12 },
    { at: at(700), side: 1, count: 2, span: 24 },
    { at: at(service.from + 120), side: 1, count: 2, span: 12 },
    { at: at(viewpoint.from + 190), side: 1, count: 3, span: 14, offset: 1.5 },
    { at: at(arrival.from + 150), side: -1, count: 2, span: 20 },
  ],
  parked: [
    { at: at(75), side: 1, kind: 'car' },
    { at: at(112), side: -1, kind: 'suv' },
    { at: at(188), side: 1, kind: 'bus' },
    { at: at(250), side: -1, kind: 'truck' },
    { at: at(335), side: 1, kind: 'moto' },
    { at: at(service.from + 40), side: -1, kind: 'truck' },
    { at: at(service.from + 85), side: 1, kind: 'bus' },
    { at: at(service.from + 205), side: -1, kind: 'car' },
    { at: at(viewpoint.from + 60), side: 1, kind: 'car' },
    { at: at(viewpoint.from + 95), side: 1, kind: 'bus' },
    { at: at(viewpoint.from + 215), side: -1, kind: 'suv' },
    { at: at(arrival.from + 250), side: -1, kind: 'bus' },
    { at: at(arrival.from + 285), side: -1, kind: 'car' },
    { at: at(arrival.from + 310), side: -1, kind: 'suv' },
    { at: at(arrival.from + 345), side: -1, kind: 'bus' },
  ],
  crowd: { at: at(finishM - 36), side: 1, count: 14, offset: 1, width: 26 },
  yaks: [
    { at: at(pass.from + 160), side: -1, offset: 16 },
    { at: at(pass.from + 175), side: -1, offset: 20 },
    { at: at(pass.from + 480), side: 1, offset: 18 },
    { at: at(rough.from + 200), side: 1, offset: 22 },
  ],
};

// -------------------------------------------------------------------------------------- road width
const wp = (from: number, to: number, width: number, shoulder: number): { from: number; to: number; width: number; shoulder: number } => ({ from: whole(from), to: whole(to), width, shoulder });
const widthProfile = [
  wp(-10, 425, 10.4, 3.4), // market street with a broad verge
  wp(1010, 1180, 6.6, 0.5), // a tight forest lane
  wp(service.from + 5, service.to - 5, 11, 4.5), // service apron
  wp(hairpins.from + 440, hairpins.from + 520, 6.8, 0.5), // narrow cliff traverse
  wp(viewpoint.from + 20, viewpoint.from + 330, 9.4, 6), // lay-by apron
  wp(pass.from + 30, pass.from + 110, 6.4, 0.4), // exposed cliff edge
  wp(arrival.from + 190, arrival.to + FINISH_OFFSET, 12, 7), // arrival apron
].filter((w) => w.to > w.from);

export const passRun: LevelDef = {
  id: 'pass-run',
  name: 'Pass Run',
  subtitle: 'Village to the prayer-flag pass',
  description:
    'Your first real tourism run: collect a family from the village, pick up a hiker on the trail, swap guests at the viewpoint and deliver everyone to the summit plaza. A long, scenic climb with a fuel stop, a workshop and a bit of everything underneath your tyres.',
  objective: 'Collect your guests, make your stops, and deliver everyone to the summit plaza.',
  difficulty: 2,
  region: 'Paro & Thimphu',
  mission: { kind: 'climb', party: 3, finishMode: 'stop', timerStyle: 'elapsed', timerLabel: 'Time', comfort: true },
  vehicles: ['dzo-hatch', 'druk-ranger', 'tourist-coaster', 'dragon-cruiser'],
  conditions: [
    { weather: 'clear', time: 'day', bonus: 1 },
    { weather: 'fog', time: 'day', bonus: 1.2 },
  ],
  startFuel: 0.8,
  reward: 220,
  stops,
  hazards,
  traffic: {
    count: 10,
    speed: [9.5, 13.5],
    oncoming: 0.4,
    seed: 13,
    mix: [
      { kind: 'car', weight: 4 },
      { kind: 'suv', weight: 2 },
      { kind: 'bus', weight: 1.2 },
      { kind: 'truck', weight: 1.6 },
      { kind: 'moto', weight: 1.2 },
      { kind: 'bike', weight: 0.9 },
    ],
    scripted: [
      { at: at(1020), kind: 'truck', speed: 4.8 },
      { at: at(hairpins.from + 215), kind: 'truck', speed: 4.4 },
    ],
  },
  optional: [
    { id: 'gold', kind: 'goldTime', reward: 60, label: 'Gold-medal time' },
    { id: 'clean', kind: 'condition', value: 90, reward: 40, label: 'Not a scratch' },
    { id: 'smooth', kind: 'comfort', value: 80, reward: 50, label: 'A smooth ride' },
    { id: 'serviced', kind: 'useService', reward: 30, label: 'Used a service stop' },
  ],
  tip: 'Stop in the yellow zones, top up at the service area, and slow down on gravel, mud and ice.',
  surfaces,
  shoulder: 'gravel',
  puddles,
  roadside,
  celebrate: true,
  terrain: {
    seed: 7,
    bounds: road.bounds,
    cell: 5,
    slope: TERRAIN_SLOPE,
    hillHeight: 20,
    detailHeight: 7,
    valleyZ: -50,
    valleyDepth: 36,
    waterLevel: -40,
  },
  road: { width: 8.8, shoulder: 0.7, startOffset: START_OFFSET, finishOffset: FINISH_OFFSET, points: road.points, widthProfile },
  checkpoints: [
    { at: at(400), label: 'Village gate' },
    { at: at(880), label: 'River bridge' },
    { at: at(1500), label: 'Forest clearing' },
    { at: at(service.to + 30), label: 'Past the service area' },
    { at: at(hairpins.from + 330), label: 'Upper hairpins' },
    { at: at(viewpoint.to - 40), label: 'Viewpoint plateau' },
    { at: at(rough.from + 380), label: 'Roadworks' },
    { at: at(rough.from + 700), label: 'Rocky climb' },
    { at: at(pass.from + 330), label: 'Pass ridge' },
    { at: at(arrival.from + 120), label: 'Summit approach' },
  ],
  finishLabel: 'Summit plaza',
  // Provisional: Stage 6.1B calibrates these by driving the route.
  timeLimit: 600,
  medals: { gold: 330, silver: 385, bronze: 450 },
  comfortMedals: { gold: 85, silver: 70, bronze: 50 },
  unlock: null,
  look: { meadowFrom: 55, meadowTo: 100, rockFrom: 105, snowFrom: 148, snowTo: 190, snowMax: 0.85, treeLine: 112 },
  weather: 'none',
  scenery: {
    seed: 21,
    trees: 2600,
    rocks: 440,
    species: { pine: 0.58, cypress: 0.2, broadleaf: 0.17, shrub: 0.05 },
    landmarks,
  },
  atmosphere: { summitMist: 0.45, mistStart: 0.82, visibility: 1 },
};
