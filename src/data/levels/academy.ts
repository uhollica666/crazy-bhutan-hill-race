import type { HazardDef, LevelDef, PuddleDef, RoadPointDef, StopDef } from '../types';

/** Route 0: the Driver's Academy. Not part of the ten-mission campaign: it has its own id and is never listed with them. */
export const ACADEMY_ID = 'drivers-academy';

/** Metres from the start line. Lessons, stations and hazards are all placed with these, so level data and lesson logic agree. */
export const ACADEMY = {
  /** Playable length (start line to finish). */
  length: 2700,
  startOffset: 30,
  finishOffset: 38,
  controls: { from: 0, to: 230 },
  passengers: { from: 230, to: 500, pickup: 310, dropoff: 450 },
  fuel: { from: 500, to: 660, station: 610 },
  repair: { from: 660, to: 820, station: 770 },
  surfaces: {
    from: 820,
    to: 1260,
    gravel: [860, 930],
    dirt: [930, 1000],
    rocky: [1000, 1050],
    mud: [1050, 1120],
    puddles: [1140, 1185],
    ford: [1195, 1235],
  },
  fourByFour: { from: 1260, to: 1460, mud: [1310, 1420], hump: [1290, 1440] },
  obstacles: { from: 1460, to: 1760, rockfall: 1560, truck: 1690 },
  wildlife: { from: 1760, to: 1980, yeti: 1850, herd: 1935 },
  weather: { from: 1980, to: 2300, rain: [1980, 2065], fog: [2065, 2150], night: [2150, 2300], ghost: 2262 },
  delivery: { from: 2300, to: 2700, pickup: 2345, puddle: 2420, rockfall: 2520 },
} as const;

const TOTAL = ACADEMY.startOffset + ACADEMY.length + ACADEMY.finishOffset;
/** A distance from the start line as a fraction of the playable stretch (stops, hazards, checkpoints, puddles). */
const at = (m: number): number => m / ACADEMY.length;
/** A distance from the start line as a fraction of the whole road (surfaces and the ford). */
const whole = (m: number): number => (ACADEMY.startOffset + m) / TOTAL;

/** Gentle, balanced bends (nothing sharper than a lazy S), so every lesson has room to work. */
function buildRoad(): { points: RoadPointDef[]; bounds: { minX: number; maxX: number; minZ: number; maxZ: number } } {
  const STEP = 25;
  const turns = [22, -22, 0, 0, -18, 18, 0, 0];
  const points: RoadPointDef[] = [];
  let x = 0;
  let z = 0;
  let heading = 0;
  let m = -ACADEMY.startOffset;
  const hump = ACADEMY.fourByFour.hump;
  const dyAt = (mm: number): number => {
    if (mm < hump[0] || mm > hump[1]) return 0;
    const t = (mm - hump[0]) / (hump[1] - hump[0]);
    return 9 * Math.sin(Math.PI * t) ** 1.2;
  };
  points.push({ x, z, dy: dyAt(m) });
  let chunk = 0;
  let intoChunk = 0;
  const firstStraight = ACADEMY.startOffset + 260;
  while (m < ACADEMY.length + ACADEMY.finishOffset - 1) {
    let turnPerStep = 0;
    if (m + ACADEMY.startOffset >= firstStraight) {
      // 150 m bends: six 25 m steps each.
      turnPerStep = (turns[chunk % turns.length] * (Math.PI / 180)) / 6;
      intoChunk++;
      if (intoChunk >= 6) {
        intoChunk = 0;
        chunk++;
      }
    }
    heading += turnPerStep;
    x += Math.sin(heading) * STEP;
    z -= Math.cos(heading) * STEP;
    m += STEP;
    points.push({ x, z, dy: dyAt(m) });
  }
  const xs = points.map((p) => p.x);
  const zs = points.map((p) => p.z);
  const pad = 230;
  return {
    points,
    bounds: { minX: Math.min(...xs) - pad, maxX: Math.max(...xs) + pad, minZ: Math.min(...zs) - pad, maxZ: Math.max(...zs) + pad },
  };
}

const road = buildRoad();

const stops: StopDef[] = [
  { id: 'academy-pickup-1', kind: 'pickup', at: at(ACADEMY.passengers.pickup), label: 'Pick-up lay-by', side: -1, party: 2, optional: false, who: 'honeymooners' },
  { id: 'academy-dropoff', kind: 'service', at: at(ACADEMY.passengers.dropoff), label: 'Guesthouse drop-off', side: 1, services: [], optional: true },
  { id: 'academy-fuel', kind: 'service', at: at(ACADEMY.fuel.station), label: 'Practice fuel pump', side: 1, services: ['refuel'], optional: true },
  { id: 'academy-repair', kind: 'service', at: at(ACADEMY.repair.station), label: 'Practice workshop', side: 1, services: ['repair'], optional: true },
  { id: 'academy-pickup-2', kind: 'pickup', at: at(ACADEMY.delivery.pickup), label: 'Final pick-up', side: -1, party: 2, optional: false, who: 'grandparents' },
];

const hazards: HazardDef[] = [
  { id: 'academy-rock-1', kind: 'landslide', at: at(ACADEMY.obstacles.rockfall), seed: 31, label: 'Rockfall' },
  { id: 'academy-truck', kind: 'brokenTruck', at: at(ACADEMY.obstacles.truck), seed: 32, label: 'Broken-down lorry' },
  { id: 'academy-yeti', kind: 'creature', at: at(ACADEMY.wildlife.yeti), seed: 33, label: 'Friendly yeti', reactive: true },
  { id: 'academy-herd', kind: 'herd', at: at(ACADEMY.wildlife.herd), seed: 34, label: 'Yak herd', count: 4, reactive: true },
  { id: 'academy-ghost', kind: 'creature', at: at(ACADEMY.weather.ghost), seed: 35, label: 'Lantern spirit', variant: 'ghost', reactive: true },
  { id: 'academy-rock-2', kind: 'landslide', at: at(ACADEMY.delivery.rockfall), seed: 36, label: 'Rockfall' },
];

const s = ACADEMY.surfaces;
const puddleAt = (m: number, lateral: number, radius: number): PuddleDef => ({ at: at(m), lateral, radius });

/** The lesson boundaries double as checkpoints, so Recover always puts the car back at the start of the current lesson. */
const lessonStarts = [ACADEMY.passengers.from, ACADEMY.fuel.from, ACADEMY.repair.from, s.from, ACADEMY.fourByFour.from, ACADEMY.obstacles.from, ACADEMY.wildlife.from, ACADEMY.weather.from, ACADEMY.delivery.from];
const lessonNames = ['Passengers', 'Fuel', 'Repairs', 'Surfaces and water', '4x4', 'Obstacles', 'Wildlife', 'Weather and night', 'Practice delivery'];

export const academy: LevelDef = {
  id: ACADEMY_ID,
  name: "Driver's Academy",
  subtitle: 'Route 0 - learn the road',
  description: 'A relaxed training route with no time limit. Learn every skill the ten routes need, then go and use them.',
  objective: 'Finish the lessons at your own pace. There is no clock to beat and nothing you can fail.',
  difficulty: 1,
  region: 'Route 0',
  mission: { kind: 'tour', party: 2, finishMode: 'stop', timerStyle: 'elapsed', timerLabel: 'Training', comfort: true },
  vehicles: ['druk-ranger', 'dzo-hatch'],
  tip: 'Take your time. Retry any lesson as often as you like.',
  conditions: [{ weather: 'clear', time: 'day', bonus: 1 }],
  startFuel: 1,
  reward: 0,
  stops,
  hazards,
  optional: [],
  surfaces: [
    { from: whole(s.gravel[0]), to: whole(s.gravel[1]), surface: 'gravel' },
    { from: whole(s.dirt[0]), to: whole(s.dirt[1]), surface: 'dirt' },
    { from: whole(s.rocky[0]), to: whole(s.rocky[1]), surface: 'rocky' },
    { from: whole(s.mud[0]), to: whole(s.mud[1]), surface: 'mud' },
    { from: whole(ACADEMY.fourByFour.mud[0]), to: whole(ACADEMY.fourByFour.mud[1]), surface: 'mud' },
  ],
  shoulder: 'gravel',
  puddles: [
    puddleAt(1148, -1.4, 2.2),
    puddleAt(1160, 1.6, 2.0),
    puddleAt(1172, -0.4, 2.4),
    puddleAt(ACADEMY.delivery.puddle, 0.8, 2.4),
  ],
  ford: { from: whole(s.ford[0]), to: whole(s.ford[1]), depth: 0.3 },
  terrain: {
    seed: 11,
    bounds: road.bounds,
    cell: 4,
    slope: 0.018,
    hillHeight: 4,
    detailHeight: 3,
    valleyZ: 99999,
    valleyDepth: 0,
    waterLevel: -999,
  },
  road: { width: 9, shoulder: 0.7, startOffset: ACADEMY.startOffset, finishOffset: ACADEMY.finishOffset, points: road.points },
  checkpoints: lessonStarts.map((m, i) => ({ at: at(m + 14), label: `Lesson ${i + 2}: ${lessonNames[i]}` })),
  finishLabel: 'Academy graduation',
  timeLimit: 86400,
  medals: { gold: 86400, silver: 86400, bronze: 86400 },
  comfortMedals: { gold: 85, silver: 70, bronze: 50 },
  unlock: null,
  look: {},
  weather: 'none',
  scenery: {
    seed: 77,
    trees: 700,
    rocks: 140,
    species: { pine: 0.45, cypress: 0.2, broadleaf: 0.3, shrub: 0.05 },
    landmarks: [
      { kind: 'flagSpan', at: whole(60), side: 1, offset: 0 },
      { kind: 'house', at: whole(120), side: -1, offset: 24, rotation: 0.2 },
      { kind: 'house', at: whole(180), side: 1, offset: 26, rotation: -0.3 },
      { kind: 'chorten', at: whole(420), side: -1, offset: 12 },
      { kind: 'flagSpan', at: whole(ACADEMY.fuel.from + 40), side: 1, offset: 0 },
      { kind: 'chorten', at: whole(900), side: 1, offset: 12 },
      { kind: 'lungta', at: whole(1260), side: -1, offset: 22 },
      { kind: 'flagSpan', at: whole(ACADEMY.obstacles.from + 30), side: 1, offset: 0 },
      { kind: 'yak', at: whole(1700), side: 1, offset: 16 },
      { kind: 'chorten', at: whole(2000), side: -1, offset: 12 },
      { kind: 'flagSpan', at: whole(2320), side: 1, offset: 0 },
      { kind: 'house', at: whole(2640), side: -1, offset: 22, rotation: 0.1 },
      { kind: 'flagSpan', at: whole(2690), side: 1, offset: 0 },
    ],
  },
  atmosphere: { summitMist: 0, mistStart: 1, visibility: 1 },
};
