import type { HazardDef, JunctionDef, LandmarkDef, LevelDef, RoadPointDef, RoadsideDef, StopDef, TrafficControlDef } from '../types';
import { walkPath } from './extend';
import { THIMPHU_LENGTH, THIMPHU_PATH, THIMPHU_SECTIONS, thimphuCorners, thimphuRange } from './thimphuPath';

/**
 * Level 2: Thimphu City Run (about 3.7 km). From a hotel in Babesa through residential lanes, the commercial streets, a
 * congested stretch and the city exit, then up the hill to the Buddha Dordenma viewpoint at Kuenselphodrang. A fictionalised
 * corridor inspired by Thimphu: a bounded, detailed stretch of road, not a map of the town.
 *
 * Distances are metres from the start line (`m`). The level id, unlock rule, vehicles and rewards are unchanged from the
 * original mission, so saves and cloud progress keep working. Time limit and medals are provisional (Stage 6.2B calibrates).
 */
const P = THIMPHU_LENGTH;
const START_OFFSET = 30;
const FINISH_OFFSET = 32;
const at = (m: number): number => m / P;
const whole = (m: number): number => (START_OFFSET + m) / (P + START_OFFSET + FINISH_OFFSET);

const babesa = thimphuRange('babesa');
const residential = thimphuRange('residential');
const commercial = thimphuRange('commercial');
const congestion = thimphuRange('congestion');
const exit = thimphuRange('exit');
const climb = thimphuRange('climb');
const arrival = thimphuRange('arrival');

function buildRoad(): { points: RoadPointDef[]; bounds: LevelDef['terrain']['bounds']; uplift: NonNullable<LevelDef['terrain']['uplift']> } {
  const w = walkPath({ x: 0, z: START_OFFSET }, { x: 0, z: -1 }, THIMPHU_PATH);
  const raw = [{ x: 0, z: START_OFFSET }, ...w.points];
  const city = walkPath(
    { x: 0, z: START_OFFSET },
    { x: 0, z: -1 },
    THIMPHU_SECTIONS.filter((s) => s.id !== 'climb' && s.id !== 'arrival').flatMap((s) => s.cmds),
  );
  const xs = raw.map((p) => p.x);
  const zs = raw.map((p) => p.z);
  const pad = 260;
  // The hill the viewpoint stands on: the ground rises from the city exit toward the end of the road.
  const reach = Math.hypot(w.end.x - city.end.x, w.end.z - city.end.z) * 1.1;
  return {
    points: raw.map((p) => ({ x: p.x, z: p.z })),
    bounds: { minX: Math.min(...xs) - pad, maxX: Math.max(...xs) + pad, minZ: Math.min(...zs) - pad, maxZ: Math.max(...zs) + pad },
    uplift: { x: w.end.x, z: w.end.z, radius: reach, height: 115 },
  };
}
const road = buildRoad();

// ------------------------------------------------------------------------------------------------ junctions
const junction = (m: number, sides: (-1 | 1)[], arm: number, width: number, zebra = false): JunctionDef => ({ at: at(m), sides, arm, width, zebra });
const POLICE_M = commercial.from + 330;
const junctions: JunctionDef[] = [
  junction(babesa.from + 200, [1], 40, 7),
  junction(residential.from + 30, [-1, 1], 36, 6),
  junction(residential.from + 440, [1], 30, 6),
  junction(commercial.from + 60, [-1, 1], 45, 8, true),
  junction(commercial.from + 190, [1], 40, 7),
  junction(POLICE_M, [-1, 1], 55, 9, true),
  junction(commercial.from + 480, [-1], 35, 7),
  junction(commercial.from + 600, [-1, 1], 40, 8, true),
  junction(congestion.from + 80, [1], 35, 7),
  junction(exit.from + 30, [-1, 1], 40, 7),
];
const nearJunction = (m: number, side: number, margin = 16): boolean =>
  junctions.some((j) => j.sides.some((s) => s === side) && Math.abs(j.at * P - m) < j.width / 2 + margin);
const corners = thimphuCorners();
const nearCorner = (m: number, margin = 24): boolean => corners.some((c) => m > c.from - margin && m < c.to + margin);

// -------------------------------------------------------------------------------------------------- stops
const stops: StopDef[] = [
  { id: 'babesa-hotel', kind: 'pickup', at: at(babesa.from + 120), label: 'Babesa guesthouse', side: -1, party: 2, optional: false, who: 'honeymooners' },
  { id: 'hotel-guest', kind: 'pickup', at: at(babesa.from + 310), label: 'Hotel entrance (a late guest)', side: 1, party: 1, optional: false, who: 'backpacker' },
  { id: 'chorten-dropoff', kind: 'dropoff', at: at(commercial.from + 95), label: 'Memorial Chorten', side: 1, party: 1, optional: false, who: 'backpacker' },
  { id: 'tour-guide', kind: 'pickup', at: at(commercial.from + 560), label: 'Tour guide, Clock Tower corner', side: -1, party: 1, optional: false, who: 'shopper' },
  { id: 'exit-pump', kind: 'service', at: at(exit.from + 200), label: 'Town fuel station', side: 1, services: ['refuel'], optional: true, variant: 'fuel' },
  { id: 'exit-garage', kind: 'service', at: at(exit.from + 250), label: 'Dorji Auto Repairs', side: -1, services: ['repair'], optional: true, variant: 'workshop' },
  { id: 'climb-kiosk', kind: 'service', at: at(climb.from + 585), label: 'Viewpoint tea and fuel', side: 1, services: ['refuel', 'repair'], optional: true, variant: 'kiosk' },
];

// ------------------------------------------------------------------------------------------------ traffic
const controls: TrafficControlDef[] = [
  { at: at(POLICE_M), kind: 'police', go: 16, stop: 13 },
  { at: at(residential.from + 130), kind: 'crossing', peds: 2 },
  { at: at(commercial.from + 160), kind: 'crossing', peds: 3 },
  { at: at(congestion.from + 30), kind: 'crossing', peds: 3 },
  { at: at(babesa.from + 255), kind: 'crossing', peds: 2 },
];

/** The queue: six vehicles standing in the lane, released one after another as the player arrives behind them. */
const queue = [0, 1, 2, 3, 4, 5].map((i) => ({
  at: at(congestion.from + 215 - i * 12.5),
  kind: (['taxi', 'car', 'delivery', 'suv', 'minibus', 'car'] as const)[i],
  speed: 5 + (i % 3),
  hold: 4 + i * 2.6,
  trigger: 150,
}));

// ---------------------------------------------------------------------------------------------- road width
const wp = (from: number, to: number, width: number, shoulder: number): { from: number; to: number; width: number; shoulder: number } => ({ from: whole(from), to: whole(to), width, shoulder });
const widthProfile = [
  wp(-12, 340, 9.6, 2.4),
  wp(residential.from + 6, residential.to - 6, 6.6, 1.8),
  wp(commercial.from + 6, commercial.to - 6, 11, 3.6),
  wp(congestion.from + 6, congestion.to - 6, 9.6, 2.2),
  wp(exit.from + 6, exit.to - 6, 10.4, 2.0),
  wp(arrival.from + 170, arrival.to + FINISH_OFFSET, 13, 7),
];
const HW = { babesa: 4.8, residential: 3.3, commercial: 5.5, congestion: 4.8, exit: 5.2 };
const WALL = { babesa: 7.2, residential: 5.1, commercial: 9.1, congestion: 7.0, exit: 7.2 };

// ------------------------------------------------------------------------------------------------ landmarks
const lm = (kind: LandmarkDef['kind'], m: number, side: -1 | 1, offset: number, extra: Partial<LandmarkDef> = {}): LandmarkDef => ({ kind, at: whole(m), side, offset, ...extra });
const landmarks: LandmarkDef[] = [];

/** Building frontages along a city section: varied kinds, depths, sizes and tilts, kept clear of side streets and sharp corners. */
function facades(sec: { from: number; to: number }, kinds: LandmarkDef['kind'][], step: number, wall: number, seed: number): void {
  let i = seed;
  for (let m = sec.from + 18; m < sec.to - 18; m += step) {
    for (const side of [-1, 1] as const) {
      i++;
      if (nearJunction(m, side) || nearCorner(m)) continue;
      const kind = kinds[(i + (side === 1 ? 1 : 0)) % kinds.length];
      const depth = { hotel: 9.5, office: 8.5, shopRow: 9, house: 8.5, restaurant: 7.5 } as Record<string, number>;
      const off = wall + (depth[kind] ?? 8) + (i % 3) * 0.9;
      landmarks.push(lm(kind, m + ((i * 7) % 5) - 2, side, off, { scale: 0.92 + (i % 4) * 0.07, rotation: ((i % 5) - 2) * 0.05 }));
    }
  }
}
facades(babesa, ['hotel', 'house', 'restaurant', 'house'], 34, WALL.babesa, 0);
facades(residential, ['house', 'house', 'shopRow', 'house'], 26, WALL.residential, 3);
facades(commercial, ['office', 'shopRow', 'hotel', 'restaurant', 'shopRow', 'office'], 27, WALL.commercial, 5);
facades(congestion, ['shopRow', 'office', 'house'], 29, WALL.congestion, 9);
facades(exit, ['house', 'restaurant', 'house'], 36, WALL.exit, 13);

// Street lamps, planters and railings along the verges.
const lampSecs: [{ from: number; to: number }, number][] = [
  [babesa, HW.babesa + 0.9],
  [residential, HW.residential + 1.0],
  [commercial, HW.commercial + 0.9],
  [congestion, HW.congestion + 0.9],
  [exit, HW.exit + 0.9],
];
for (const [sec, off] of lampSecs) {
  let k = 0;
  for (let m = sec.from + 14; m < sec.to - 10; m += 38) {
    const side: -1 | 1 = k++ % 2 === 0 ? 1 : -1;
    if (nearJunction(m, side, 8) || nearCorner(m, 14)) continue;
    landmarks.push(lm('streetLamp', m, side, off));
  }
}
for (let m = commercial.from + 30; m < commercial.to - 30; m += 52) {
  const side: -1 | 1 = m % 104 < 52 ? 1 : -1;
  if (nearJunction(m, side, 10) || nearCorner(m, 18)) continue;
  landmarks.push(lm('planter', m, side, HW.commercial + 2.7, { rotation: 0 }));
  if (!nearJunction(m + 22, -side as -1 | 1, 12) && !nearCorner(m + 22, 18)) landmarks.push(lm('railing', m + 22, -side as -1 | 1, HW.commercial + 2.6));
}
// City gate over the road, flags, the police pavilion, bus shelters, signs.
landmarks.push(lm('gateArch', commercial.from + 16, 1, 0));
landmarks.push(lm('flagSpan', babesa.from + 20, 1, 0), lm('flagSpan', commercial.from + 480, 1, 0), lm('flagSpan', exit.from + 300, 1, 0));
landmarks.push(lm('policeBooth', POLICE_M + 6, -1, WALL.commercial + 1.4));
landmarks.push(lm('busShelter', babesa.from + 62, 1, HW.babesa + 1.6), lm('busShelter', exit.from + 22, 1, HW.exit + 1.6), lm('busShelter', commercial.from + 300, -1, HW.commercial + 1.9));
for (const [m, side] of [
  [babesa.from + 40, -1],
  [residential.from + 20, 1],
  [commercial.from + 40, 1],
  [commercial.from + 430, -1],
  [congestion.from + 150, 1],
  [exit.from + 60, -1],
] as [number, -1 | 1][]) landmarks.push(lm('signpost', m, side, (m < residential.to ? HW.residential : HW.commercial) + 1.1));
for (const [m, side] of [
  [commercial.from + 140, 1],
  [commercial.from + 270, -1],
  [commercial.from + 530, 1],
] as [number, -1 | 1][]) landmarks.push(lm('stall', m, side, HW.commercial + 2.5, { rotation: 0.1 }));
landmarks.push(lm('chorten', commercial.from + 108, 1, WALL.commercial + 5, { scale: 1.1 }), lm('clockTower', commercial.from + 575, -1, WALL.commercial + 6, { scale: 1 }));
// The climb: hillside shrines, prayer flags, retaining walls and viewpoints.
for (const [m, side] of [
  [climb.from + 40, 1],
  [climb.from + 200, -1],
  [climb.from + 330, 1],
  [climb.from + 450, -1],
  [climb.from + 560, 1],
  [climb.from + 700, -1],
  [climb.from + 810, 1],
] as [number, -1 | 1][]) landmarks.push(lm('retainWall', m, side, 5.9));
landmarks.push(
  lm('chorten', climb.from + 260, -1, 12),
  lm('lungta', climb.from + 150, 1, 24),
  lm('flagSpan', climb.from + 520, 1, 0),
  lm('viewpoint', climb.from + 610, 1, 14),
  lm('viewpoint', climb.from + 20, -1, 14, { scale: 0.9 }),
  lm('signpost', climb.from + 100, 1, 5.7),
  lm('signpost', climb.from + 320, -1, 5.7),
  lm('chortenGroup', climb.from + 700, -1, 28),
  lm('prayerWheelHouse', climb.from + 400, 1, 15),
  lm('flagSpan', arrival.from + 60, 1, 0),
  lm('signpost', arrival.from + 40, -1, 5.7),
);
// Kuenselphodrang: the visitor plaza, the great seated Buddha above it, memorial chortens, a few stalls.
landmarks.push(
  lm('plaza', arrival.from + 330, 1, 25),
  lm('buddha', arrival.from + 385, 1, 82),
  lm('chortenGroup', arrival.from + 300, -1, 34),
  lm('flagSpan', arrival.from + 250, 1, 0),
  lm('flagSpan', arrival.from + 415, 1, 0),
  lm('stall', arrival.from + 270, -1, 15),
  lm('stall', arrival.from + 285, -1, 15, { rotation: 0.2 }),
  lm('lungta', arrival.from + 430, 1, 60),
  lm('retainWall', arrival.from + 130, 1, 6),
);

// -------------------------------------------------------------------------------------------- roadside life
const roadside: RoadsideDef = {
  walkers: [
    { at: at(70), side: 1, count: 3, span: 20 },
    { at: at(150), side: -1, count: 2, span: 16 },
    { at: at(residential.from + 90), side: 1, count: 2, span: 14 },
    { at: at(residential.from + 250), side: -1, count: 2, span: 16 },
    { at: at(commercial.from + 50), side: 1, count: 3, span: 22 },
    { at: at(commercial.from + 210), side: -1, count: 3, span: 20 },
    { at: at(commercial.from + 380), side: 1, count: 3, span: 24 },
    { at: at(commercial.from + 510), side: -1, count: 2, span: 18 },
    { at: at(congestion.from + 90), side: 1, count: 2, span: 18 },
    { at: at(exit.from + 90), side: -1, count: 2, span: 16 },
  ],
  standing: [
    { at: at(babesa.from + 62), side: 1, count: 3 },
    { at: at(babesa.from + 305), side: 1, count: 3, offset: 0.4 },
    { at: at(residential.from + 380), side: -1, count: 2 },
    { at: at(commercial.from + 105), side: -1, count: 4 },
    { at: at(commercial.from + 300), side: -1, count: 3 },
    { at: at(commercial.from + 405), side: 1, count: 3 },
    { at: at(commercial.from + 555), side: -1, count: 2 },
    { at: at(exit.from + 22), side: 1, count: 3 },
  ],
  police: [{ at: at(POLICE_M), side: 1 }],
  birds: [
    { at: at(babesa.from + 80), side: -1, offset: 4, count: 5 },
    { at: at(residential.from + 70), side: 1, offset: 5, count: 5 },
    { at: at(commercial.from + 240), side: 1, offset: 9, count: 6 },
    { at: at(commercial.from + 440), side: -1, offset: 10, count: 5 },
    { at: at(climb.from + 300), side: 1, offset: 10, count: 4 },
  ],
  parked: [
    { at: at(babesa.from + 40), side: 1, kind: 'taxi' },
    { at: at(babesa.from + 75), side: -1, kind: 'suv' },
    { at: at(babesa.from + 230), side: -1, kind: 'bus' },
    // The tight squeeze: cars half on the carriageway, alternating sides.
    { at: at(residential.from + 108), side: -1, kind: 'car', edge: true },
    { at: at(residential.from + 130), side: 1, kind: 'suv', edge: true },
    { at: at(residential.from + 152), side: -1, kind: 'car', edge: true },
    { at: at(residential.from + 204), side: 1, kind: 'car', edge: true },
    { at: at(residential.from + 232), side: -1, kind: 'suv', edge: true },
    { at: at(residential.from + 262), side: 1, kind: 'taxi', edge: true },
    { at: at(residential.from + 345), side: 1, kind: 'scooter' },
    { at: at(commercial.from + 75), side: -1, kind: 'scooter' },
    { at: at(commercial.from + 85), side: -1, kind: 'scooter' },
    { at: at(commercial.from + 210), side: 1, kind: 'taxi' },
    { at: at(commercial.from + 225), side: 1, kind: 'taxi' },
    { at: at(commercial.from + 400), side: -1, kind: 'bus' },
    { at: at(commercial.from + 450), side: 1, kind: 'delivery' },
    { at: at(congestion.from + 60), side: -1, kind: 'car' },
    { at: at(congestion.from + 300), side: 1, kind: 'suv' },
    { at: at(exit.from + 120), side: -1, kind: 'minibus' },
    { at: at(exit.from + 280), side: 1, kind: 'car' },
    { at: at(arrival.from + 250), side: -1, kind: 'bus' },
    { at: at(arrival.from + 282), side: -1, kind: 'car' },
    { at: at(arrival.from + 306), side: -1, kind: 'suv' },
    { at: at(arrival.from + 338), side: -1, kind: 'minibus' },
    { at: at(arrival.from + 372), side: -1, kind: 'bus' },
  ],
  crowd: { at: at(P - 32), side: 1, count: 16, offset: 1.4, width: 28 },
};

const hazards: HazardDef[] = [];

export const thimphuPickup: LevelDef = {
  id: 'thimphu-pickup',
  name: 'Thimphu Town Pickup',
  subtitle: 'City streets to Buddha Dordenma',
  description:
    'A guest-filled morning: collect a couple at Babesa, a late guest at the hotel, drop one at the Memorial Chorten, fetch the tour guide from the busy commercial streets, and bring everyone through the congestion and up the hill to the Buddha Dordenma viewpoint at Kuenselphodrang.',
  objective: 'Collect and drop off your guests through the city, then deliver everyone to the Buddha Dordenma viewpoint.',
  difficulty: 3,
  region: 'Paro & Thimphu',
  mission: { kind: 'city', party: 3, finishMode: 'stop', timerStyle: 'elapsed', timerLabel: 'Time', comfort: true },
  vehicles: ['dzo-hatch', 'tourist-coaster', 'druk-ranger', 'dragon-cruiser'],
  tip: 'Obey the police officer, give way at the zebra crossings, and be patient in the queue. The climb after the city is steeper: keep your speed up.',
  conditions: [
    { weather: 'clear', time: 'day', bonus: 1 },
    { weather: 'rain', time: 'dusk', bonus: 1.3 },
    { weather: 'clear', time: 'night', bonus: 1.4 },
  ],
  startFuel: 0.75,
  reward: 300,
  stops,
  hazards,
  traffic: {
    count: 14,
    speed: [5, 10],
    oncoming: 0.45,
    seed: 11,
    turnChance: 0.25,
    mix: [
      { kind: 'car', weight: 3 },
      { kind: 'taxi', weight: 3 },
      { kind: 'suv', weight: 1.5 },
      { kind: 'bus', weight: 0.8 },
      { kind: 'minibus', weight: 1 },
      { kind: 'delivery', weight: 1 },
      { kind: 'moto', weight: 1.2 },
      { kind: 'scooter', weight: 1.4 },
      { kind: 'bike', weight: 0.6 },
      { kind: 'truck', weight: 0.3 },
    ],
    controls,
    scripted: [
      ...queue,
      // A delivery truck double-parked in the lane for a while, then it moves on.
      { at: at(commercial.from + 545), kind: 'delivery', speed: 5, hold: 22, trigger: 55 },
      // Slow tourist buses on the exit and the climb.
      { at: at(exit.from + 320), kind: 'minibus', speed: 5.2 },
      { at: at(climb.from + 40), kind: 'bus', speed: 4.8 },
      { at: at(climb.from + 520), kind: 'truck', speed: 4.4 },
    ],
  },
  junctions,
  roadside,
  celebrate: true,
  celebrateFlags: true,
  optional: [
    { id: 'smooth', kind: 'comfort', value: 80, reward: 60, label: 'Gentle with the tourists' },
    { id: 'clean', kind: 'condition', value: 90, reward: 50, label: 'No dents in town' },
    { id: 'fuel', kind: 'useService', reward: 25, label: 'Topped up on the way' },
  ],
  terrain: {
    seed: 3,
    bounds: road.bounds,
    cell: 5,
    slope: 0.01,
    hillHeight: 3,
    detailHeight: 0.8,
    uplift: road.uplift,
    valleyZ: 99999,
    valleyDepth: 0,
    waterLevel: -999,
  },
  road: { width: 8.4, shoulder: 0.7, startOffset: START_OFFSET, finishOffset: FINISH_OFFSET, points: road.points, widthProfile },
  checkpoints: [
    { at: at(babesa.from + 340), label: 'Babesa hotel row' },
    { at: at(residential.from + 300), label: 'Residential lanes' },
    { at: at(commercial.from + 130), label: 'City gate' },
    { at: at(POLICE_M + 40), label: 'Clock Tower junction' },
    { at: at(congestion.from + 60), label: 'Congestion zone' },
    { at: at(exit.from + 120), label: 'City exit' },
    { at: at(climb.from + 200), label: 'First hairpin' },
    { at: at(climb.from + 540), label: 'Scenic viewpoint' },
    { at: at(arrival.from + 60), label: 'Kuenselphodrang approach' },
  ],
  finishLabel: 'Buddha Dordenma viewpoint',
  // Provisional: Stage 6.2B calibrates these by driving the route.
  timeLimit: 640,
  medals: { gold: 360, silver: 420, bronze: 500 },
  comfortMedals: { gold: 85, silver: 70, bronze: 50 },
  unlock: { levelId: 'pass-run', requirement: 'finish' },
  shoulder: 'asphalt',
  look: {
    skyTop: 0x4d80ae,
    skyMid: 0x9fcde8,
    skyHorizon: 0xf6ead0,
    fog: 0xdcd6c8,
    grassA: 0x91b25a,
    grassB: 0x7a9f4c,
    hemi: 2.5,
    sun: 2.9,
    snowFrom: 9999,
    snowTo: 10000,
    rockFrom: 9999,
    meadowFrom: 9999,
    meadowTo: 10000,
    leaf: 0x86b14b,
    treeLine: 400,
    shoulder: 0xb9b2a4,
  },
  weather: 'none',
  scenery: {
    seed: 71,
    trees: 950,
    rocks: 40,
    species: { pine: 0.3, cypress: 0.2, broadleaf: 0.5, shrub: 0 },
    landmarks,
  },
  atmosphere: { summitMist: 0.2, mistStart: 0.8, visibility: 1.1 },
};
