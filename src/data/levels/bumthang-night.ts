import type { HazardDef, JunctionDef, LandmarkDef, LevelDef, PuddleDef, RiverDef, RoadPointDef, RoadsideDef, StopDef, SurfaceId } from '../types';
import { walkPath } from './extend';
import { BUMTHANG_LENGTH, BUMTHANG_PATH, bumthangRange } from './bumthangPath';

/**
 * Level 8: Bumthang Night Run (about 8.5 km). An evening pickup in a Bumthang town and a long drive into the dark: forest highway at
 * dusk, remote villages, two narrow bridges, dense midnight forest, foggy settlements, wildlife and abandoned huts, a remote fuel
 * station and a dangerous final stretch, ending at a mountain resort. Darkness is the opponent: the headlights light about 45 m of
 * road, the rest is black or fog, other traffic dazzles, and the forest is not empty (ghosts, shamblers, a figure with a lantern,
 * bears, a yeti: all cartoon-friendly, none graphic).
 *
 * Distances are metres from the start line (`m`). The level id, unlock rule and eligible vehicles are those of the original mission,
 * so saves and cloud progress keep working. The deadline and medals are provisional (Stage 6.8B calibrates).
 */
const P = BUMTHANG_LENGTH;
const START_OFFSET = 30;
const FINISH_OFFSET = 36;
/** Fraction of the playable stretch (stops, hazards, checkpoints, puddles, roadside life, weather zones, traffic). */
const at = (m: number): number => m / P;
/** Fraction of the whole road (surfaces, width profile, landmarks, rivers). */
const whole = (m: number): number => (START_OFFSET + m) / (P + START_OFFSET + FINISH_OFFSET);

const town = bumthangRange('town');
const forest = bumthangRange('forest');
const village = bumthangRange('village');
const mountain = bumthangRange('mountain');
const dense = bumthangRange('dense');
const settle = bumthangRange('settle');
const wildlife = bumthangRange('wildlife');
const station = bumthangRange('station');
const final = bumthangRange('final');
const resort = bumthangRange('resort');

/** Gentle ups and downs: the forest highway climbs a little, the mountain road rolls, the resort is slightly higher. */
const relief = (m: number): number => 7 * Math.sin(m / 380) + 5 * Math.sin(m / 150 + 1) + (m > village.from ? 6 : 0);

function buildRoad(): { points: RoadPointDef[]; bounds: LevelDef['terrain']['bounds'] } {
  const w = walkPath({ x: 0, z: START_OFFSET }, { x: 0, z: -1 }, BUMTHANG_PATH);
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

// ------------------------------------------------------------------------------------------------ rivers
const BRIDGE_A = mountain.from + 232;
const BRIDGE_B = mountain.from + 897;
const rp = (m: number, lateral: number, below: number): { at: number; lateral: number; below: number } => ({ at: whole(m), lateral, below });
/** Two rivers, each crossing the road once under a narrow bridge (on a straight, squarely). */
const rivers: RiverDef[] = [
  { id: 'chamkhar', width: 20, depth: 2.2, bank: 22, points: [rp(BRIDGE_A - 90, -70, 14), rp(BRIDGE_A - 50, -42, 12), rp(BRIDGE_A - 22, -26, 11), rp(BRIDGE_A, 0, 11), rp(BRIDGE_A + 22, 26, 11), rp(BRIDGE_A + 50, 42, 12), rp(BRIDGE_A + 100, 70, 14)] },
  { id: 'stream', width: 12, depth: 1.4, bank: 18, points: [rp(BRIDGE_B - 80, 60, 12), rp(BRIDGE_B - 44, 36, 11), rp(BRIDGE_B - 20, 20, 10), rp(BRIDGE_B, 0, 10), rp(BRIDGE_B + 20, -20, 10), rp(BRIDGE_B + 44, -36, 11), rp(BRIDGE_B + 90, -62, 12)] },
];

// -------------------------------------------------------------------------------------------------- stops
const stops: StopDef[] = [
  { id: 'town-pickup', kind: 'pickup', at: at(town.from + 90), label: 'Bumthang town hotel', side: 1, party: 2, optional: false, who: 'honeymooners', line: 'It is only a short drive, they said. It is already getting dark. We love dark. Do we love dark?' },
  { id: 'town-pump', kind: 'service', at: at(town.from + 282), label: 'Town fuel station', side: 1, services: ['refuel'], optional: true, variant: 'fuel' },
  { id: 'forest-hiker', kind: 'pickup', at: at(forest.from + 440), label: 'Forest lay-by (a lost hiker)', side: -1, party: 1, optional: false, who: 'night-hikers', line: 'I got lost on a nature walk. I regret everything except the sunset.' },
  { id: 'village-home', kind: 'dropoff', at: at(village.from + 146), label: 'Remote village (the hiker lives here)', side: 1, party: 1, optional: false, who: 'night-hikers', farewell: 'This is my village. Do not stop on the road, whatever you see. Goodnight!' },
  { id: 'village-kiosk', kind: 'service', at: at(village.from + 732), label: 'Village kiosk (open late)', side: 1, services: ['refuel', 'repair'], optional: true, variant: 'kiosk' },
  { id: 'stranded', kind: 'pickup', at: at(dense.from + 1095), label: 'Broken-down car on the forest road', side: 1, party: 2, optional: false, who: 'film-crew', line: 'Our car stopped by itself. Then something looked at us. Please do not make us walk.' },
  { id: 'guesthouse', kind: 'dropoff', at: at(settle.from + 410), label: 'Foggy roadside guesthouse', side: 1, party: 1, optional: false, who: 'honeymooners', farewell: 'We are staying here. Please do not wait for us. Please do not look at the fog.' },
  { id: 'settle-kiosk', kind: 'service', at: at(settle.from + 560), label: 'Settlement kiosk (one lantern)', side: -1, services: ['refuel'], optional: true, variant: 'kiosk' },
  { id: 'station-pump', kind: 'service', at: at(station.from + 50), label: 'Remote station: fuel', side: 1, services: ['refuel'], optional: true, variant: 'fuel' },
  { id: 'station-garage', kind: 'service', at: at(station.from + 102), label: 'Remote station: workshop', side: -1, services: ['repair'], optional: true, variant: 'workshop' },
  { id: 'station-tea', kind: 'service', at: at(station.from + 272), label: 'Remote station: tea and a lamp', side: 1, services: ['refuel', 'repair'], optional: true, variant: 'kiosk' },
];

// ---------------------------------------------------------------------------------------------- hazards
const hazards: HazardDef[] = [
  { id: 'dusk-herd', kind: 'herd', at: at(forest.from + 700), seed: 6, label: 'Animals on the road', reactive: true, count: 4 },
  { id: 'village-ghost', kind: 'creature', at: at(village.from + 260), seed: 3, label: 'Spirit in the road', variant: 'ghost', behavior: 'linger', reactive: true, side: 1 },
  { id: 'tree-a', kind: 'landslide', at: at(mountain.from + 380), seed: 12, label: 'Fallen trees', side: 1, log: true },
  { id: 'unlit-truck', kind: 'brokenTruck', at: at(mountain.from + 555), seed: 19, label: 'Unlit broken-down truck', side: -1 },
  { id: 'dense-zombie', kind: 'creature', at: at(dense.from + 235), seed: 27, label: 'Something on the road', variant: 'zombie', behavior: 'chase', side: 1 },
  { id: 'dense-bear', kind: 'creature', at: at(dense.from + 400), seed: 31, label: 'Bear crossing', variant: 'bear', reactive: true, side: -1 },
  { id: 'dense-figure', kind: 'creature', at: at(dense.from + 560), seed: 33, label: 'Strange light ahead', variant: 'figure', behavior: 'vanish', side: 1 },
  { id: 'tree-b', kind: 'landslide', at: at(dense.from + 740), seed: 41, label: 'Fallen trees', side: -1, log: true },
  { id: 'dense-yeti', kind: 'creature', at: at(dense.from + 915), seed: 9, label: 'Yeti crossing', variant: 'yeti', side: 1, reactive: true },
  { id: 'settle-ghost', kind: 'creature', at: at(settle.from + 245), seed: 5, label: 'Spirit in the road', variant: 'ghost', behavior: 'linger', reactive: true, side: -1 },
  { id: 'settle-figure', kind: 'creature', at: at(settle.from + 720), seed: 14, label: 'Strange light ahead', variant: 'figure', behavior: 'vanish', side: 1 },
  { id: 'ruin-zombie', kind: 'creature', at: at(wildlife.from + 250), seed: 21, label: 'Something on the road', variant: 'zombie', behavior: 'chase', side: -1 },
  { id: 'deer-herd', kind: 'herd', at: at(wildlife.from + 440), seed: 16, label: 'Wild animals on the road', reactive: true, count: 5 },
  { id: 'final-tree', kind: 'landslide', at: at(final.from + 240), seed: 22, label: 'Fallen trees', side: 1, log: true },
  { id: 'final-zombie', kind: 'creature', at: at(final.from + 400), seed: 24, label: 'Something on the road', variant: 'zombie', behavior: 'chase', side: 1 },
  { id: 'final-ghost', kind: 'creature', at: at(final.from + 690), seed: 26, label: 'Spirit in the road', variant: 'ghost', behavior: 'linger', reactive: true, side: -1 },
  { id: 'final-yeti', kind: 'creature', at: at(final.from + 860), seed: 28, label: 'Yeti crossing', variant: 'yeti', side: 1, reactive: true },
  { id: 'final-rock', kind: 'landslide', at: at(final.from + 1050), seed: 30, label: 'Falling rocks', side: -1 },
];

// ------------------------------------------------------------------------------------------ road surface
const seg = (from: number, to: number, surface: SurfaceId): { from: number; to: number; surface: SurfaceId } => ({ from: whole(from), to: whole(to), surface });
const surfaces = [
  seg(forest.from + 700, forest.from + 900, 'worn'),
  seg(village.from, village.to, 'worn'),
  seg(village.from + 300, village.from + 420, 'gravel'),
  seg(mountain.from + 40, mountain.from + 200, 'worn'),
  seg(mountain.from + 300, mountain.from + 500, 'gravel'),
  seg(mountain.from + 1000, mountain.to, 'worn'),
  seg(dense.from, dense.from + 400, 'worn'),
  seg(dense.from + 500, dense.from + 700, 'dirt'),
  seg(settle.from, settle.from + 330, 'worn'),
  seg(wildlife.from, wildlife.from + 500, 'gravel'),
  seg(final.from + 100, final.from + 520, 'worn'),
  seg(final.from + 600, final.from + 900, 'dirt'),
];
const pu = (m: number, lateral: number, radius: number, pothole = false): PuddleDef => ({ at: at(m), lateral, radius, pothole });
const puddles: PuddleDef[] = [
  pu(village.from + 100, 0.8, 1.0, true),
  pu(village.from + 560, -0.7, 1.0, true),
  pu(mountain.from + 150, 0.6, 1.8),
  pu(mountain.from + 330, -0.8, 2.2),
  pu(mountain.from + 640, 0.8, 1.0, true),
  pu(dense.from + 300, -0.7, 1.0, true),
  pu(dense.from + 620, 0.6, 2.0),
  pu(settle.from + 200, -0.9, 1.0, true),
  pu(wildlife.from + 560, 0.7, 2.2),
  pu(final.from + 300, -0.6, 1.0, true),
  pu(final.from + 620, 0.9, 2.0),
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

// The town: lit streets, the hotel, shops, the pump.
add(
  lm('hotel', town.from + 110, 1, 26, { scale: 0.85 }),
  lm('shopRow', town.from + 230, -1, 18),
  lm('shopRow', town.from + 330, 1, 20),
  lm('flagSpan', 6, 1, 0),
  lm('house', town.from + 60, -1, 22),
  lm('house', town.from + 440, -1, 26, { rotation: 0.2 }),
  lm('chorten', town.from + 400, 1, 12),
  lm('signpost', town.from + 20, 1, 5.8),
);
for (let m = town.from + 40; m < town.to - 40; m += 60) landmarks.push(lm('streetLamp', m, (Math.floor(m / 60) % 2 ? 1 : -1) as -1 | 1, 6.0));
// The forest highway: shrines and flags, a lit farmhouse or two.
every('retainWall', forest.from + 100, forest.to - 100, 200, 5.4, 0, 1);
add(
  lm('chorten', forest.from + 300, -1, 12),
  lm('flagSpan', forest.from + 600, 1, 0),
  lm('house', forest.from + 900, 1, 26),
  lm('lungta', forest.from + 1100, -1, 16),
  lm('signpost', forest.from + 20, 1, 5.6),
  lm('signpost', forest.from + 1250, -1, 5.6),
);
// The remote village: a few lamps and houses.
every('house', village.from + 20, village.to - 20, 80, 14, 6, -1);
add(
  lm('streetLamp', village.from + 140, 1, 5.6),
  lm('streetLamp', village.from + 160, -1, 5.6),
  lm('streetLamp', village.from + 720, 1, 5.6),
  lm('prayerWheelHouse', village.from + 400, -1, 14),
  lm('flagSpan', village.from + 450, 1, 0),
  lm('chorten', village.from + 20, 1, 11),
);
// The mountain road: two truss bridges, cliffs, no lights at all.
add(
  lm('trussBridge', BRIDGE_A, 1, 0),
  lm('trussBridge', BRIDGE_B, 1, 0),
  lm('signpost', BRIDGE_A - 60, -1, 4.6),
  lm('signpost', BRIDGE_B - 60, -1, 4.6),
  lm('flagSpan', BRIDGE_A + 40, 1, 0),
  lm('chorten', BRIDGE_B + 50, 1, 11),
);
every('cliff', mountain.from + 60, mountain.to - 60, 170, 11, 3, 1);
// The dense forest: nothing but trees, one lonely shrine.
every('cliff', dense.from + 80, dense.to - 80, 220, 12, 3, -1);
add(lm('chorten', dense.from + 480, 1, 11), lm('flagSpan', dense.from + 700, 1, 0), lm('signpost', dense.from + 20, 1, 5.4));
// The foggy settlements: a cluster of houses, lanterns, a guesthouse.
every('house', settle.from + 30, settle.to - 30, 70, 15, 6, -1);
add(
  lm('streetLamp', settle.from + 405, 1, 5.8),
  lm('streetLamp', settle.from + 560, -1, 5.8),
  lm('house', settle.from + 440, 1, 20, { scale: 1.1 }),
  lm('prayerWheelHouse', settle.from + 300, 1, 14),
  lm('chorten', settle.from + 120, 1, 11),
  lm('flagSpan', settle.from + 620, 1, 0),
);
// Wildlife and abandoned huts.
add(
  lm('ruin', wildlife.from + 160, 1, 16),
  lm('ruin', wildlife.from + 300, -1, 18, { rotation: 0.3 }),
  lm('ruin', wildlife.from + 640, 1, 20, { rotation: -0.2 }),
  lm('lungta', wildlife.from + 380, -1, 15),
  lm('signpost', wildlife.from + 20, 1, 5.4),
  lm('signpost', wildlife.from + 380, 1, 5.4),
);
every('cliff', wildlife.from + 60, wildlife.to - 60, 200, 11, 3, 1);
// The remote station: lamps at last.
add(
  lm('streetLamp', station.from + 40, 1, 6.0),
  lm('streetLamp', station.from + 120, -1, 6.0),
  lm('streetLamp', station.from + 270, 1, 6.0),
  lm('house', station.from + 180, 1, 22),
  lm('chorten', station.from + 200, -1, 12),
  lm('flagSpan', station.from + 60, 1, 0),
);
// The final forest: a ruin, a shrine, then the resort's glow.
every('cliff', final.from + 60, final.to - 60, 180, 11, 3, -1);
add(lm('ruin', final.from + 520, 1, 17), lm('chorten', final.from + 780, -1, 11), lm('flagSpan', final.from + 950, 1, 0), lm('signpost', final.from + 20, 1, 5.4));
// The resort: a lodge with a covered entrance, lamps, planters, flags.
add(
  lm('lodge', resort.to - 80, 1, 27),
  lm('plaza', resort.to - 52, 1, 15),
  lm('flagSpan', resort.from + 20, 1, 0),
  lm('flagSpan', resort.to - 110, 1, 0),
  lm('flagSpan', resort.to - 30, 1, 0),
  lm('planter', resort.to - 70, -1, 8.2),
  lm('planter', resort.to - 40, -1, 8.2),
  lm('signpost', resort.from + 30, -1, 5.8),
  lm('signpost', resort.to - 125, -1, 6.2),
  lm('chorten', resort.from + 100, -1, 12),
);
for (let m = resort.from + 40; m < resort.to - 10; m += 40) landmarks.push(lm('streetLamp', m, (Math.floor(m / 40) % 2 ? 1 : -1) as -1 | 1, 6.0));

// -------------------------------------------------------------------------------------- roadside life
const roadside: RoadsideDef = {
  walkers: [
    { at: at(town.from + 110), side: 1, count: 3, span: 12 },
    { at: at(village.from + 130), side: 1, count: 2, span: 12 },
    { at: at(settle.from + 400), side: 1, count: 2, span: 10 },
    { at: at(resort.from + 160), side: 1, count: 3, span: 20 },
  ],
  standing: [
    { at: at(town.from + 92), side: 1, count: 3 },
    { at: at(forest.from + 442), side: -1, count: 1 },
    { at: at(village.from + 148), side: 1, count: 2 },
    { at: at(dense.from + 1097), side: 1, count: 2, offset: 0.4 },
    { at: at(settle.from + 412), side: 1, count: 2 },
    { at: at(resort.to - 55), side: 1, count: 4, offset: 4 },
  ],
  // A roadblock: cones squeezing the road beside an officer with a torch.
  cones: [{ at: at(village.from + 20), side: -1, length: 60 }],
  police: [{ at: at(village.from + 14), side: -1 }],
  parked: [
    { at: at(town.from + 72), side: 1, kind: 'taxi' },
    { at: at(town.from + 140), side: 1, kind: 'minibus' },
    { at: at(dense.from + 1115), side: 1, kind: 'suv' },
    { at: at(station.from + 70), side: 1, kind: 'truck' },
    { at: at(settle.from + 430), side: 1, kind: 'car' },
    { at: at(resort.to - 98), side: 1, kind: 'bus' },
    { at: at(resort.to - 28), side: 1, kind: 'suv' },
    { at: at(resort.to - 10), side: 1, kind: 'taxi' },
  ],
  crowd: { at: at(P - 24), side: 1, count: 12, offset: 8, width: 16 },
};

const wp = (from: number, to: number, width: number, shoulder: number): { from: number; to: number; width: number; shoulder: number } => ({ from: whole(from), to: whole(to), width, shoulder });
const widthProfile = [
  wp(-12, town.from + 150, 8.2, 2.0),
  wp(forest.from + 10, forest.to - 10, 7.0, 0.6),
  wp(village.from + 10, village.to - 10, 5.8, 0.4),
  wp(mountain.from + 10, mountain.to - 10, 6.4, 0.5),
  wp(BRIDGE_A - 30, BRIDGE_A + 30, 5.0, 0.3),
  wp(BRIDGE_B - 30, BRIDGE_B + 30, 5.0, 0.3),
  wp(dense.from + 10, dense.to - 10, 6.4, 0.5),
  wp(settle.from + 10, settle.to - 10, 6.6, 0.6),
  wp(wildlife.from + 10, wildlife.to - 10, 6.4, 0.5),
  wp(station.from + 10, station.to - 10, 8.2, 3.2),
  wp(final.from + 10, final.to - 10, 6.2, 0.5),
  wp(resort.to - 130, resort.to + FINISH_OFFSET, 13, 6),
];

const junctions: JunctionDef[] = [
  { at: at(village.from + 560), sides: [1], arm: 28, width: 5, zebra: false },
  { at: at(settle.from + 300), sides: [-1], arm: 28, width: 5, zebra: false },
];

export const bumthangNight: LevelDef = {
  id: 'bumthang-night',
  name: 'Bumthang Night Expedition',
  subtitle: 'Forest roads after dark',
  description:
    'A group of tourists left it too late to leave Bumthang. Now the sun is going down on a long, lonely forest road: unlit bridges, fog in the settlements, animals in the headlights, and some things in the headlights that are not animals. Your lamps show about forty metres. Make them count.',
  objective: 'Collect the guests in town, give a lost hiker a lift home, rescue the stranded film crew, drop the guests at the guesthouse, and bring the rest to the mountain resort.',
  difficulty: 8,
  region: 'Central & Eastern Bhutan',
  mission: { kind: 'night', party: 4, finishMode: 'stop', timerStyle: 'deadline', timerLabel: 'Before midnight', comfort: true },
  vehicles: ['tourist-coaster', 'druk-ranger', 'dragon-cruiser'],
  tip: 'Your headlights show about forty metres: drive to them. Slow for the bridges (wait for the green), keep clear of whatever is in the road, and drive on if something shambles after you. Top up at every pump.',
  conditions: [
    { weather: 'clear', time: 'dusk', bonus: 1.1 },
    { weather: 'fog', time: 'night', bonus: 1.4 },
    { weather: 'rain', time: 'night', bonus: 1.3 },
  ],
  startFuel: 0.4,
  reward: 780,
  stops,
  hazards,
  traffic: {
    count: 6,
    speed: [8, 13],
    oncoming: 0.45,
    seed: 17,
    turnChance: 0,
    slowInFog: true,
    mix: [
      { kind: 'truck', weight: 2.2 },
      { kind: 'bus', weight: 1.4 },
      { kind: 'suv', weight: 1.4 },
      { kind: 'taxi', weight: 1 },
      { kind: 'minibus', weight: 0.8 },
      { kind: 'moto', weight: 0.5 },
      { kind: 'car', weight: 0.6 },
    ],
    // The two narrow bridges take one direction at a time.
    controls: [
      { at: at(BRIDGE_A), kind: 'bridge', go: 14, stop: 11, span: 22 },
      { at: at(BRIDGE_B), kind: 'bridge', go: 14, stop: 11, span: 22 },
    ],
    scripted: [
      { at: at(forest.from + 330), kind: 'truck', speed: 6.0 },
      { at: at(mountain.from + 420), kind: 'bus', speed: 5.5 },
      { at: at(dense.from + 480), kind: 'truck', speed: 5.0 },
      { at: at(wildlife.from + 600), kind: 'truck', speed: 5.5 },
      { at: at(final.from + 560), kind: 'minibus', speed: 5.0 },
    ],
  },
  junctions,
  roadside,
  rivers,
  weatherZones: [
    // Dusk on the forest highway, then night: clear, fog in the villages, rain on the mountain, fog in the dense forest and the settlements, rain
    // again before the station, rain and fog in the final stretch, and clear sky at the resort.
    { from: at(forest.from + 500), to: at(village.from + 300), weather: 'clear', time: 'night' },
    { from: at(village.from + 300), to: at(mountain.from + 100), weather: 'fog', time: 'night' },
    { from: at(mountain.from + 100), to: at(mountain.from + 700), weather: 'rain', time: 'night' },
    { from: at(mountain.from + 700), to: at(dense.from + 150), weather: 'clear', time: 'night' },
    { from: at(dense.from + 150), to: at(wildlife.from + 400), weather: 'fog', time: 'night' },
    { from: at(wildlife.from + 400), to: at(station.from), weather: 'rain', time: 'night' },
    { from: at(station.from), to: at(final.from), weather: 'clear', time: 'night' },
    { from: at(final.from), to: at(final.from + 500), weather: 'rain', time: 'night' },
    { from: at(final.from + 500), to: at(resort.from), weather: 'fog', time: 'night' },
    { from: at(resort.from), to: at(resort.to), weather: 'clear', time: 'night' },
  ],
  celebrate: true,
  celebrateFlags: true,
  optional: [
    { id: 'intact', kind: 'condition', value: 85, reward: 100, label: 'No scratches in the dark' },
    { id: 'smooth', kind: 'comfort', value: 70, reward: 100, label: 'Calm guests, eerie night' },
    { id: 'pump', kind: 'useService', reward: 40, label: 'Fuelled on the way' },
  ],
  puddles,
  surfaces,
  shoulder: 'gravel',
  terrain: {
    seed: 53,
    bounds: road.bounds,
    cell: 9,
    slope: 0,
    hillHeight: 12,
    detailHeight: 7,
    valleyZ: 99999,
    valleyDepth: 0,
    waterLevel: -999,
    followRoad: 1,
  },
  road: { width: 6.6, shoulder: 0.5, startOffset: START_OFFSET, finishOffset: FINISH_OFFSET, points: road.points, widthProfile },
  checkpoints: [
    { at: at(town.to - 40), label: 'Out of town' },
    { at: at(forest.from + 800), label: 'Forest highway' },
    { at: at(village.from + 600), label: 'Remote village' },
    { at: at(mountain.from + 300), label: 'First bridge' },
    { at: at(mountain.from + 1000), label: 'Second bridge' },
    { at: at(dense.from + 650), label: 'Midnight forest' },
    { at: at(dense.from + 1000), label: 'Deep forest' },
    { at: at(settle.from + 560), label: 'Foggy settlement' },
    { at: at(wildlife.from + 700), label: 'Wildlife corridor' },
    { at: at(station.from + 300), label: 'Remote station' },
    { at: at(final.from + 600), label: 'The final forest' },
    { at: at(resort.from + 100), label: 'Resort road' },
  ],
  finishLabel: 'Mountain resort',
  // Provisional: Stage 6.8B calibrates the deadline and medals by driving the route.
  timeLimit: 1020,
  medals: { gold: 800, silver: 880, bronze: 960 },
  pace: { 'tourist-coaster': 1.1 },
  comfortMedals: { gold: 80, silver: 65, bronze: 45 },
  unlock: { levelId: 'chelela-climb', requirement: 'finish' },
  look: {
    skyTop: 0x4d667f,
    skyMid: 0x8da0aa,
    skyHorizon: 0xc9c4b0,
    fog: 0xb5b6a8,
    mist: 0xd0d0c6,
    grassA: 0x4e6a3a,
    grassB: 0x3f5a33,
    meadow: 0x66774a,
    hemi: 1.6,
    sun: 2.2,
    rockFrom: 9999,
    snowFrom: 9999,
    snowTo: 10000,
    meadowFrom: 9999,
    meadowTo: 10000,
    leaf: 0x5a8a3e,
    treeLine: 900,
  },
  weather: 'none',
  scenery: {
    seed: 63,
    trees: 2300,
    rocks: 300,
    species: { pine: 0.6, cypress: 0.2, broadleaf: 0.12, shrub: 0.08 },
    landmarks,
  },
  atmosphere: { summitMist: 0.25, mistStart: 0.5, visibility: 0.85, nightVisibility: 0.5 },
};
