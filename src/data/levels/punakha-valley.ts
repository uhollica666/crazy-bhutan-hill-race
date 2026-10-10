import type { HazardDef, JunctionDef, LandmarkDef, LevelDef, PuddleDef, RiverDef, RoadPointDef, RoadsideDef, StopDef, SurfaceId } from '../types';
import { walkPath } from './extend';
import { PUNAKHA_LENGTH, PUNAKHA_PATH, punakhaRange } from './punakhaPath';

/**
 * Level 4: Punakha Valley Tour (about 7.1 km). A tourism run from a Wangdue lodge, down the valley, through terraced villages and
 * along the river, over a narrow bridge, through a rough rural detour (with a ford), past the viewpoint, restaurant and picnic
 * stops, and into the Punakha dzong's visitor parking, where two rivers meet. A scenic drive that keeps changing: sudden rain,
 * mud, narrow lanes, rural traffic and river hazards.
 *
 * Distances are metres from the start line (`m`). The level id, unlock rule, eligible vehicles and passenger capacity are those of
 * the original mission, so saves and cloud progress keep working. The deadline and medals are provisional (Stage 6.4B calibrates).
 */
const P = PUNAKHA_LENGTH;
const START_OFFSET = 30;
const FINISH_OFFSET = 38;
/** Fraction of the playable stretch (stops, hazards, checkpoints, puddles, roadside life, weather zones). */
const at = (m: number): number => m / P;
/** Fraction of the whole road (surfaces, width profile, landmarks, rivers, the ford). */
const whole = (m: number): number => (START_OFFSET + m) / (P + START_OFFSET + FINISH_OFFSET);

const lodge = punakhaRange('lodge');
const descent = punakhaRange('descent');
const villages = punakhaRange('villages');
const riverside = punakhaRange('riverside');
const bridge = punakhaRange('bridge');
const rural = punakhaRange('rural');
const scenic = punakhaRange('scenic');
const approach = punakhaRange('approach');
const dzong = punakhaRange('dzong');

/** Smooth 0..1 ramp between two distances. */
const ramp = (m: number, from: number, to: number): number => {
  const t = Math.min(1, Math.max(0, (m - from) / (to - from)));
  return t * t * (3 - 2 * t);
};
/** Designed relief on top of the gentle terrain: a long descent into the valley, then easy rises and falls. */
const relief = (m: number): number =>
  -34 * ramp(m, descent.from + 30, descent.to - 30) -
  6 * ramp(m, villages.from, villages.to) -
  8 * ramp(m, riverside.from, riverside.to) +
  14 * ramp(m, rural.from + 100, rural.to - 100) +
  8 * ramp(m, scenic.from, scenic.to) -
  12 * ramp(m, approach.from, approach.to);

function buildRoad(): { points: RoadPointDef[]; bounds: LevelDef['terrain']['bounds'] } {
  const w = walkPath({ x: 0, z: START_OFFSET }, { x: 0, z: -1 }, PUNAKHA_PATH);
  const raw = [{ x: 0, z: START_OFFSET }, ...w.points];
  const points: RoadPointDef[] = [];
  let m = -START_OFFSET;
  for (let i = 0; i < raw.length; i++) {
    if (i > 0) m += Math.hypot(raw[i].x - raw[i - 1].x, raw[i].z - raw[i - 1].z);
    points.push({ x: raw[i].x, z: raw[i].z, dy: relief(m) });
  }
  const xs = raw.map((p) => p.x);
  const zs = raw.map((p) => p.z);
  return { points, bounds: { minX: Math.min(...xs) - 240, maxX: Math.max(...xs) + 240, minZ: Math.min(...zs) - 220, maxZ: Math.max(...zs) + 220 } };
}
const road = buildRoad();

// ------------------------------------------------------------------------------------------------ rivers
/** A river control point: distance along the road, lateral offset (+ = right), and how far below the road the water lies. */
const rp = (m: number, lateral: number, below: number): { at: number; lateral: number; below: number } => ({ at: whole(m), lateral, below });
/** Control points every `step` metres from `from` to `to`, with the lateral offset eased between two values: a river that follows the road's curves. */
const follow = (from: number, to: number, step: number, l0: number, l1: number, below: number): { at: number; lateral: number; below: number }[] => {
  const out: { at: number; lateral: number; below: number }[] = [];
  const n = Math.max(1, Math.round((to - from) / step));
  for (let i = 0; i <= n; i++) out.push(rp(from + ((to - from) * i) / n, l0 + ((l1 - l0) * i) / n, below));
  return out;
};
const rivers: RiverDef[] = [
  // The Pho Chhu: a wide valley river far below the road, then close beside it, under the bridge, and on to the confluence.
  {
    id: 'pho-chhu',
    width: 22,
    depth: 2.2,
    bank: 14,
    points: [
      ...follow(descent.from + 100, descent.to - 50, 100, 110, 92, 10),
      // Through the zig-zagging villages the valley floor is kept well clear of the lane.
      rp(villages.from + 250, 230, 9),
      rp(villages.from + 487, 230, 9),
      rp(villages.from + 702, 230, 8),
      rp(villages.from + 934, 200, 8),
      // Beside the river road.
      ...follow(riverside.from + 40, riverside.to - 60, 100, 62, 34, 6),
      // Under the bridge, from the right-hand side of the road to the left.
      rp(bridge.from + 25, 17, 6),
      rp(bridge.from + 60, 0, 6),
      rp(bridge.from + 95, -17, 6),
      rp(bridge.from + 150, -36, 6),
      // The rural detour wanders away from the river; the road and the river meet again at the scenic stops.
      rp(bridge.to + 20, -90, 7),
      rp(rural.from + 120, -150, 7),
      rp(rural.from + 340, -240, 7),
      rp(rural.from + 560, -240, 8),
      rp(rural.from + 810, -230, 8),
      rp(rural.to - 110, -170, 8),
      rp(rural.to - 20, -100, 7),
      ...follow(scenic.from + 60, dzong.to - 100, 50, -50, -44, 6),
      rp(dzong.to - 60, -44, 6),
      rp(dzong.to + 20, -70, 6),
      rp(dzong.to + 60, -105, 6),
    ],
  },
  // The Mo Chhu: a clearer, narrower river that meets the Pho Chhu below the dzong.
  {
    id: 'mo-chhu',
    width: 16,
    depth: 1.8,
    bank: 14,
    points: [
      rp(scenic.from + 500, -230, 8),
      rp(approach.from + 100, -235, 8),
      rp(approach.from + 500, -225, 8),
      rp(dzong.from + 40, -205, 7),
      rp(dzong.to - 120, -185, 6),
      rp(dzong.to - 50, -168, 6),
      rp(dzong.to + 30, -140, 6),
      rp(dzong.to + 60, -105, 6),
    ],
  },
  // A small stream that crosses the rural track at the ford.
  {
    id: 'ford-stream',
    width: 7,
    depth: 0.7,
    bank: 8,
    points: [rp(rural.from + 330, 38, 0.5), rp(rural.from + 372, 15, 0.5), rp(rural.from + 396, 0, 0.35), rp(rural.from + 420, -15, 0.5), rp(rural.from + 462, -38, 0.5)],
  },
];

// ------------------------------------------------------------------------------------------------ junctions
const junction = (m: number, sides: (-1 | 1)[], arm: number, width: number): JunctionDef => ({ at: at(m), sides, arm, width, zebra: false });
const junctions: JunctionDef[] = [
  junction(villages.from + 235, [-1], 30, 5),
  junction(villages.from + 700, [1], 30, 5),
  junction(rural.from + 150, [1], 30, 5),
  junction(scenic.from + 440, [1], 40, 7),
  junction(approach.from + 130, [-1, 1], 40, 7),
  junction(approach.from + 520, [1], 40, 7),
];

// -------------------------------------------------------------------------------------------------- stops
const stops: StopDef[] = [
  { id: 'lodge', kind: 'pickup', at: at(lodge.from + 130), label: 'Wangdue lodge forecourt', side: 1, party: 2, optional: false, who: 'honeymooners', line: 'The camera is at 4 percent and the valley has not started yet. Drive slowly!' },
  { id: 'village-guide', kind: 'pickup', at: at(villages.from + 250), label: 'Village lane (our guide Pema)', side: -1, party: 1, optional: false, who: 'botanist', line: 'Welcome aboard. The road is only slightly flooded. Slightly.' },
  { id: 'village-pump', kind: 'service', at: at(villages.from + 702), label: 'Village fuel pump', side: -1, services: ['refuel'], optional: true, variant: 'fuel' },
  { id: 'river-pump', kind: 'service', at: at(riverside.from + 905), label: 'Riverside fuel stop', side: -1, services: ['refuel'], optional: true, variant: 'fuel' },
  { id: 'river-garage', kind: 'service', at: at(riverside.from + 970), label: 'Pho Chhu garage', side: -1, services: ['repair'], optional: true, variant: 'workshop' },
  { id: 'rest-stall', kind: 'service', at: at(rural.to - 110), label: 'Farm tea stall (rest stop)', side: 1, services: ['refuel', 'repair'], optional: true, variant: 'kiosk' },
  { id: 'viewpoint', kind: 'dropoff', at: at(scenic.from + 220), label: 'Scenic viewpoint over the river', side: -1, party: 2, optional: false, who: 'honeymooners', farewell: 'Forty minutes. Maybe an hour. It depends on the rhododendron.' },
  { id: 'restaurant', kind: 'pickup', at: at(scenic.from + 400), label: 'Riverside restaurant', side: 1, party: 2, optional: false, who: 'grandparents', line: 'Lunch is still cooking, so we brought the chilies with us.' },
  { id: 'picnic', kind: 'dropoff', at: at(scenic.from + 590), label: 'Riverside picnic spot (photo stop)', side: -1, party: 1, optional: false, who: 'botanist', farewell: 'Five minutes for one photograph. Fifteen. Do not leave without me!' },
  { id: 'approach-pump', kind: 'service', at: at(approach.from + 395), label: 'Punakha fuel stop', side: 1, services: ['refuel'], optional: true, variant: 'fuel' },
];

// ---------------------------------------------------------------------------------------------- hazards
const hazards: HazardDef[] = [
  { id: 'descent-rockfall', kind: 'landslide', at: at(descent.from + 520), seed: 14, label: 'Small rockfall' },
  { id: 'village-herd', kind: 'herd', at: at(villages.from + 935), seed: 6, label: 'Cattle crossing', reactive: true, count: 4 },
  { id: 'river-truck', kind: 'brokenTruck', at: at(riverside.from + 560), seed: 12, label: 'Broken-down truck' },
  { id: 'bank-slip', kind: 'landslide', at: at(riverside.from + 1010), seed: 21, label: 'River bank slip' },
];

// ------------------------------------------------------------------------------------------ road surface
const seg = (from: number, to: number, surface: SurfaceId): { from: number; to: number; surface: SurfaceId } => ({ from: whole(from), to: whole(to), surface });
const surfaces = [
  seg(descent.from + 100, descent.from + 450, 'worn'),
  seg(villages.from, villages.from + 300, 'worn'),
  seg(villages.from + 300, villages.from + 432, 'dirt'),
  seg(villages.from + 432, villages.from + 520, 'mud'),
  seg(villages.from + 520, villages.from + 860, 'worn'),
  seg(riverside.from, riverside.from + 300, 'worn'),
  seg(riverside.from + 560, riverside.from + 680, 'wetAsphalt'),
  seg(riverside.from + 1000, riverside.from + 1060, 'rocky'),
  seg(rural.from, rural.from + 200, 'gravel'),
  seg(rural.from + 200, rural.from + 370, 'dirt'),
  seg(rural.from + 410, rural.from + 470, 'dirt'),
  seg(rural.from + 470, rural.from + 530, 'mud'),
  seg(rural.from + 530, rural.from + 720, 'gravel'),
  seg(rural.from + 720, rural.from + 870, 'dirt'),
  seg(rural.from + 870, rural.from + 985, 'gravel'),
  seg(rural.from + 985, rural.to, 'worn'),
  seg(approach.from, approach.from + 240, 'worn'),
  seg(approach.from + 240, approach.from + 330, 'gravel'),
];
const pu = (m: number, lateral: number, radius: number, pothole = false): PuddleDef => ({ at: at(m), lateral, radius, pothole });
const puddles: PuddleDef[] = [
  pu(descent.from + 200, 1.4, 0.9, true),
  pu(descent.from + 330, -1.3, 0.9, true),
  pu(villages.from + 110, 0.8, 2.0),
  pu(villages.from + 380, -1.0, 1.8),
  pu(villages.from + 455, 0.6, 2.2),
  pu(villages.from + 490, -0.8, 2.0),
  pu(villages.from + 600, 1.2, 0.9, true),
  pu(riverside.from + 40, -1.2, 0.9, true),
  pu(riverside.from + 590, 1.6, 2.4),
  pu(riverside.from + 640, -1.4, 2.2),
  pu(rural.from + 90, 1.2, 1.0, true),
  pu(rural.from + 140, -1.0, 1.0, true),
  pu(rural.from + 245, 0.5, 1.8),
  pu(rural.from + 485, -0.7, 2.1),
  pu(rural.from + 520, 0.9, 2.0),
  pu(rural.from + 560, -1.2, 1.1, true),
  pu(rural.from + 610, 1.1, 1.0, true),
  pu(rural.from + 660, -0.3, 1.2, true),
  pu(rural.from + 700, 1.4, 1.0, true),
  pu(rural.from + 760, -0.9, 2.0),
  pu(rural.from + 905, 0.8, 1.0, true),
  pu(approach.from + 260, -0.6, 1.0, true),
  pu(approach.from + 300, 1.4, 0.9, true),
];

// ---------------------------------------------------------------------------------------------- landmarks
const lm = (kind: LandmarkDef['kind'], m: number, side: -1 | 1, offset: number, extra: Partial<LandmarkDef> = {}): LandmarkDef => ({ kind, at: whole(m), side, offset, ...extra });
const landmarks: LandmarkDef[] = [];
const add = (...l: LandmarkDef[]): void => {
  landmarks.push(...l);
};
/** Landmarks repeated along a section: alternate sides, a different offset each time. */
const every = (kind: LandmarkDef['kind'], from: number, to: number, step: number, offset: number, jitter = 4, first: -1 | 1 = 1, extra: Partial<LandmarkDef> = {}): void => {
  let i = 0;
  for (let m = from; m < to; m += step, i++) landmarks.push(lm(kind, m, ((i % 2 === 0 ? first : -first) as -1 | 1), offset + ((i * 7) % 5) * (jitter / 4), { rotation: ((i * 37) % 10) / 10 - 0.5, ...extra }));
};

// Lodge and the road out of Wangdue.
add(
  lm('flagSpan', 6, 1, 0),
  lm('hotel', lodge.from + 130, 1, 26, { scale: 0.9 }),
  lm('house', lodge.from + 60, -1, 24),
  lm('house', lodge.from + 220, -1, 26, { rotation: 0.2 }),
  lm('chorten', lodge.from + 170, -1, 14),
  lm('prayerWheelHouse', lodge.from + 250, 1, 18),
  lm('signpost', lodge.from + 20, 1, 6.0),
  lm('streetLamp', lodge.from + 90, -1, 5.6),
  lm('streetLamp', lodge.from + 170, 1, 5.6),
  lm('paddy', lodge.from + 150, -1, 26),
);
// Valley descent: broad views, terraces down the slope, retaining walls on the uphill side.
every('paddy', descent.from + 30, descent.to - 40, 105, 22, 8, -1);
every('retainWall', descent.from + 60, descent.to - 40, 150, 5.8, 0, 1);
add(
  lm('signpost', descent.from + 40, 1, 6.2),
  lm('signpost', descent.from + 470, -1, 6.2),
  lm('flagSpan', descent.from + 300, 1, 0),
  lm('viewpoint', descent.from + 160, -1, 9),
  lm('chorten', descent.from + 700, 1, 12),
  lm('house', descent.from + 360, -1, 40),
  lm('house', descent.from + 640, 1, 38, { rotation: 0.3 }),
  lm('cliff', descent.from + 500, 1, 12),
);
// Agricultural villages: farmhouses and terraces right up to the lane, markets, prayer flags.
every('house', villages.from + 20, villages.to - 30, 70, 14, 8, -1);
every('paddy', villages.from + 40, villages.to - 40, 95, 17, 6, 1);
add(
  lm('stall', villages.from + 140, 1, 9),
  lm('stall', villages.from + 620, -1, 9),
  lm('stall', villages.from + 760, 1, 9),
  lm('busShelter', villages.from + 245, 1, 7.2),
  lm('chortenGroup', villages.from + 330, 1, 20),
  lm('prayerWheelHouse', villages.from + 560, -1, 14),
  lm('flagSpan', villages.from + 200, 1, 0),
  lm('flagSpan', villages.from + 880, 1, 0),
  lm('lungta', villages.from + 780, -1, 16),
  lm('signpost', villages.from + 15, 1, 5.0),
  lm('signpost', villages.from + 960, -1, 5.0),
);
// Riverside highway: retaining walls and cliffs on the uphill side, the river on the other, an erosion scar or two.
every('retainWall', riverside.from + 90, riverside.to - 80, 150, 5.4, 0, -1);
add(
  lm('cliff', riverside.from + 220, -1, 11),
  lm('cliff', riverside.from + 640, -1, 11, { scale: 1.1 }),
  lm('cliff', riverside.from + 1040, -1, 11),
  lm('signpost', riverside.from + 130, 1, 6.2),
  lm('signpost', riverside.from + 780, -1, 6.2),
  lm('flagSpan', riverside.from + 350, 1, 0),
  lm('chorten', riverside.from + 480, -1, 13),
  lm('house', riverside.from + 905, -1, 26),
  lm('house', riverside.from + 1150, -1, 28, { rotation: 0.3 }),
  lm('stall', riverside.from + 1200, -1, 10),
  lm('prayerWheelHouse', riverside.from + 1320, -1, 15),
);
// The bridge: a narrow steel truss, signs at each approach.
add(
  lm('trussBridge', bridge.from + 60, 1, 0),
  lm('signpost', bridge.from - 30, 1, 4.6),
  lm('signpost', bridge.from + 105, -1, 4.6),
  lm('flagSpan', bridge.from + 55, 1, 0),
  lm('chorten', bridge.from + 135, 1, 13),
  lm('house', bridge.from + 220, -1, 26),
);
// Rural detour: farm huts, terraces, a shrine, tea stall at the end.
every('paddy', rural.from + 20, rural.to - 40, 125, 14, 6, 1);
every('house', rural.from + 50, rural.to - 80, 120, 17, 6, -1);
add(
  lm('flagSpan', rural.from + 20, 1, 0),
  lm('chorten', rural.from + 300, 1, 11),
  lm('lungta', rural.from + 600, -1, 14),
  lm('stall', rural.to - 110, -1, 9),
  lm('flagSpan', rural.from + 1000, 1, 0),
  lm('signpost', rural.from + 12, 1, 4.6),
);
// Scenic stops: viewpoint platform, restaurant, picnic spot, a pedestrian suspension footbridge, flags.
every('paddy', scenic.from + 20, scenic.to - 40, 130, 20, 6, 1);
add(
  lm('viewpoint', scenic.from + 220, -1, 8),
  lm('restaurant', scenic.from + 400, 1, 17),
  lm('picnic', scenic.from + 590, -1, 14),
  lm('footbridge', scenic.from + 380, -1, 42),
  lm('flagSpan', scenic.from + 190, 1, 0),
  lm('flagSpan', scenic.from + 560, 1, 0),
  lm('chortenGroup', scenic.from + 90, 1, 22),
  lm('house', scenic.from + 150, 1, 28),
  lm('house', scenic.from + 520, 1, 30, { rotation: 0.2 }),
  lm('stall', scenic.from + 420, 1, 9),
  lm('signpost', scenic.from + 30, 1, 6.2),
  lm('signpost', scenic.from + 700, -1, 6.2),
);
// Punakha approach: traditional buildings, shops, visitor signs.
every('house', approach.from + 40, approach.to - 60, 62, 15, 8, -1);
add(
  lm('shopRow', approach.from + 150, 1, 18),
  lm('shopRow', approach.from + 470, 1, 18),
  lm('restaurant', approach.from + 600, 1, 17),
  lm('flagSpan', approach.from + 120, 1, 0),
  lm('flagSpan', approach.from + 800, 1, 0),
  lm('chortenGroup', approach.from + 330, -1, 22),
  lm('prayerWheelHouse', approach.from + 700, -1, 14),
  lm('signpost', approach.from + 20, 1, 6.6),
  lm('signpost', approach.from + 260, -1, 6.6),
  lm('signpost', approach.from + 880, 1, 6.6),
  lm('streetLamp', approach.from + 500, -1, 6.0),
  lm('streetLamp', approach.from + 540, 1, 6.0),
  lm('paddy', approach.from + 250, -1, 32),
);
// The dzong: a fortress on the spit between the two rivers, a covered bridge, parking plaza, gardens.
add(
  lm('dzongComplex', dzong.to - 85, -1, 98, { scale: 0.95 }),
  lm('coveredBridge', dzong.to - 85, -1, 42),
  lm('plaza', dzong.to - 24, 1, 21, { scale: 1.0 }),
  lm('flagSpan', dzong.from + 10, 1, 0),
  lm('flagSpan', dzong.to - 120, 1, 0),
  lm('flagSpan', dzong.to - 30, 1, 0),
  lm('gateArch', dzong.from + 90, 1, 0),
  lm('chortenGroup', dzong.to - 130, 1, 26),
  lm('chorten', dzong.to - 40, -1, 13),
  lm('signpost', dzong.from + 30, 1, 7.0),
  lm('signpost', dzong.to - 100, -1, 7.0),
  lm('planter', dzong.to - 70, -1, 8.4),
  lm('planter', dzong.to - 40, -1, 8.4),
  lm('planter', dzong.to - 10, -1, 8.4),
  lm('busShelter', dzong.to - 55, -1, 9.6),
  lm('stall', dzong.to - 140, 1, 12),
  lm('cliff', dzong.to - 90, 1, 120, { scale: 2.2 }),
  lm('cliff', dzong.to + 10, 1, 110, { scale: 2.2 }),
);
for (let m = dzong.from + 120; m < dzong.to - 10; m += 14) landmarks.push(lm('railing', m, -1, 12.6));

// -------------------------------------------------------------------------------------- roadside life
const roadside: RoadsideDef = {
  walkers: [
    { at: at(lodge.from + 110), side: 1, count: 3, span: 12 },
    { at: at(descent.from + 200), side: -1, count: 2, span: 24 },
    { at: at(villages.from + 90), side: 1, count: 3, span: 20 },
    { at: at(villages.from + 330), side: -1, count: 3, span: 20 },
    { at: at(villages.from + 620), side: 1, count: 3, span: 18 },
    { at: at(villages.from + 780), side: -1, count: 2, span: 18 },
    { at: at(riverside.from + 480), side: -1, count: 2, span: 24 },
    { at: at(riverside.from + 1210), side: -1, count: 2, span: 20 },
    { at: at(rural.from + 150), side: -1, count: 2, span: 30 },
    { at: at(rural.from + 640), side: 1, count: 2, span: 30 },
    { at: at(scenic.from + 230), side: -1, count: 4, span: 18 },
    { at: at(scenic.from + 600), side: -1, count: 3, span: 18 },
    { at: at(approach.from + 160), side: 1, count: 4, span: 22 },
    { at: at(approach.from + 520), side: -1, count: 4, span: 22 },
    { at: at(dzong.from + 160), side: 1, count: 5, span: 24 },
  ],
  standing: [
    { at: at(lodge.from + 132), side: 1, count: 2 },
    { at: at(villages.from + 252), side: -1, count: 2 },
    { at: at(villages.from + 140), side: 1, count: 3 },
    { at: at(riverside.from + 910), side: -1, count: 2 },
    { at: at(rural.to - 112), side: 1, count: 3 },
    { at: at(scenic.from + 222), side: -1, count: 3, offset: 0.4 },
    { at: at(scenic.from + 402), side: 1, count: 3 },
    { at: at(scenic.from + 592), side: -1, count: 3 },
    { at: at(approach.from + 395), side: 1, count: 2 },
    { at: at(dzong.to - 55), side: -1, count: 4 },
  ],
  cones: [{ at: at(approach.from + 250), side: 1, length: 90 }],
  yaks: [
    { at: at(descent.from + 250), side: -1, offset: 16 },
    { at: at(descent.from + 270), side: -1, offset: 22 },
    { at: at(villages.from + 70), side: 1, offset: 12 },
    { at: at(villages.from + 480), side: -1, offset: 13 },
    { at: at(villages.from + 500), side: -1, offset: 17 },
    { at: at(villages.from + 900), side: 1, offset: 12 },
    { at: at(riverside.from + 300), side: 1, offset: 14 },
    { at: at(rural.from + 130), side: 1, offset: 12 },
    { at: at(rural.from + 160), side: 1, offset: 16 },
    { at: at(rural.from + 800), side: -1, offset: 13 },
    { at: at(scenic.from + 150), side: 1, offset: 18 },
    { at: at(scenic.from + 680), side: 1, offset: 16 },
  ],
  parked: [
    { at: at(lodge.from + 80), side: 1, kind: 'taxi' },
    { at: at(lodge.from + 170), side: 1, kind: 'minibus' },
    { at: at(villages.from + 150), side: 1, kind: 'tractor' },
    { at: at(riverside.from + 940), side: -1, kind: 'truck' },
    { at: at(rural.from + 250), side: -1, kind: 'tractor' },
    { at: at(rural.to - 130), side: 1, kind: 'delivery' },
    { at: at(scenic.from + 405), side: 1, kind: 'suv' },
    { at: at(scenic.from + 432), side: 1, kind: 'car' },
    { at: at(scenic.from + 226), side: -1, kind: 'minibus' },
    { at: at(approach.from + 200), side: 1, kind: 'bus' },
    { at: at(approach.from + 232), side: 1, kind: 'taxi' },
    { at: at(approach.from + 330), side: -1, kind: 'truck' },
    { at: at(approach.from + 560), side: 1, kind: 'bus' },
    { at: at(dzong.to - 95), side: 1, kind: 'bus' },
    { at: at(dzong.to - 70), side: 1, kind: 'bus' },
    { at: at(dzong.to - 46), side: 1, kind: 'minibus' },
    { at: at(dzong.to - 122), side: 1, kind: 'suv' },
    { at: at(dzong.to - 140), side: 1, kind: 'taxi' },
  ],
  birds: [
    { at: at(descent.from + 400), side: -1, offset: 18, count: 5 },
    { at: at(riverside.from + 700), side: 1, offset: 20, count: 4 },
    { at: at(scenic.from + 500), side: -1, offset: 24, count: 5 },
    { at: at(dzong.to - 100), side: -1, offset: 30, count: 5 },
  ],
  crowd: { at: at(P - 22), side: 1, count: 12, offset: 1.4, width: 22 },
};

const wp = (from: number, to: number, width: number, shoulder: number): { from: number; to: number; width: number; shoulder: number } => ({ from: whole(from), to: whole(to), width, shoulder });
const widthProfile = [
  wp(-12, lodge.from + 150, 9.2, 2.2),
  wp(descent.from + 20, descent.to - 20, 8.6, 1.0),
  wp(villages.from + 10, villages.to - 10, 5.8, 0.5),
  wp(bridge.from + 10, bridge.from + 112, 5.4, 0.3),
  wp(rural.from + 20, rural.to - 20, 5.2, 0.4),
  wp(scenic.from + 20, scenic.to - 20, 7.6, 1.2),
  wp(approach.from + 20, approach.to - 20, 9.0, 2.4),
  wp(dzong.to - 120, dzong.to + FINISH_OFFSET, 13, 6),
];

export const punakhaValley: LevelDef = {
  id: 'punakha-valley',
  name: 'Punakha Valley Tour',
  subtitle: 'Two rivers and a dzong',
  description:
    'The valley is at its greenest, and the guests want all of it: the rice terraces, the villages, the river road, a lunch they are sure is still cooking, and the dzong where two rivers meet. Rain, mud, a narrow bridge, a ford and farm traffic will try to hurry you. A smooth ride keeps everyone (and the tips) happy.',
  objective: 'Collect the guests at the lodge and in the village, drop and collect groups at the viewpoint, restaurant and picnic spot, and bring the rest to the Punakha Dzong parking before the light fades.',
  difficulty: 4,
  region: 'Punakha Valley',
  mission: { kind: 'tour', party: 3, finishMode: 'stop', timerStyle: 'deadline', timerLabel: 'Daylight left', comfort: true },
  vehicles: ['dzo-hatch', 'tourist-coaster', 'druk-ranger', 'dragon-cruiser'],
  tip: 'Brake early on the long descent, take the muddy village lane slowly, wait for oncoming traffic on the narrow bridge, and cross the ford straight and steady. Top up when you pass a pump: the route is long.',
  conditions: [
    { weather: 'clear', time: 'day', bonus: 1 },
    { weather: 'clear', time: 'dusk', bonus: 1.15 },
    { weather: 'rain', time: 'day', bonus: 1.25 },
  ],
  startFuel: 0.6,
  reward: 460,
  stops,
  hazards,
  traffic: {
    count: 8,
    speed: [8, 13],
    oncoming: 0.4,
    seed: 21,
    turnChance: 0.12,
    mix: [
      { kind: 'car', weight: 3 },
      { kind: 'suv', weight: 1.5 },
      { kind: 'taxi', weight: 1.5 },
      { kind: 'bus', weight: 0.7 },
      { kind: 'minibus', weight: 1 },
      { kind: 'truck', weight: 1 },
      { kind: 'delivery', weight: 0.6 },
      { kind: 'moto', weight: 1.2 },
      { kind: 'scooter', weight: 0.5 },
      { kind: 'bike', weight: 0.4 },
      { kind: 'tractor', weight: 1.2 },
    ],
    scripted: [
      { at: at(descent.from + 700), kind: 'truck', speed: 6.0 },
      { at: at(villages.from + 215), kind: 'tractor', speed: 3.6 },
      { at: at(villages.from + 400), kind: 'bike', speed: 3.4 },
      { at: at(riverside.from + 330), kind: 'truck', speed: 6.2 },
      { at: at(bridge.from + 30), kind: 'truck', speed: 5.0 },
      // A tractor halted across the rural track while its driver chats, then it pulls away.
      { at: at(rural.from + 650), kind: 'tractor', speed: 3.5, hold: 5, trigger: 110 },
      { at: at(scenic.from + 290), kind: 'bus', speed: 7.0 },
      { at: at(approach.from + 60), kind: 'minibus', speed: 6.0 },
    ],
  },
  junctions,
  roadside,
  rivers,
  ford: { from: whole(rural.from + 372), to: whole(rural.from + 420), depth: 0.17 },
  weatherZones: [
    { from: at(descent.from + 300), to: at(villages.from + 420), weather: 'rain' },
    { from: at(riverside.from + 400), to: at(riverside.from + 900), weather: 'rain' },
  ],
  celebrate: true,
  celebrateFlags: true,
  optional: [
    { id: 'smooth', kind: 'comfort', value: 85, reward: 80, label: 'A ride worth five stars' },
    { id: 'clean', kind: 'condition', value: 90, reward: 40, label: 'Not a scratch on the paintwork' },
    { id: 'fuel', kind: 'useService', reward: 25, label: 'Topped up on the way' },
  ],
  puddles,
  surfaces,
  shoulder: 'gravel',
  terrain: {
    seed: 61,
    bounds: road.bounds,
    cell: 9,
    slope: 0,
    hillHeight: 10,
    detailHeight: 4,
    valleyZ: 99999,
    valleyDepth: 0,
    waterLevel: -999,
  },
  road: { width: 8, shoulder: 0.7, startOffset: START_OFFSET, finishOffset: FINISH_OFFSET, points: road.points, widthProfile },
  checkpoints: [
    { at: at(descent.from + 400), label: 'Valley descent' },
    { at: at(villages.from + 500), label: 'Terraced villages' },
    { at: at(riverside.from + 700), label: 'River road' },
    { at: at(bridge.from + 140), label: 'Over the Pho Chhu' },
    { at: at(rural.from + 560), label: 'Rural detour' },
    { at: at(scenic.from + 300), label: 'Scenic stops' },
    { at: at(approach.from + 480), label: 'Punakha approach' },
    { at: at(dzong.from + 100), label: 'Dzong parking' },
  ],
  finishLabel: 'Dzong parking',
  // Provisional: Stage 6.4B calibrates the deadline and medals by driving the route.
  timeLimit: 720,
  medals: { gold: 560, silver: 620, bronze: 680 },
  pace: { 'tourist-coaster': 1.06 },
  comfortMedals: { gold: 85, silver: 70, bronze: 50 },
  unlock: { levelId: 'thimphu-pickup', requirement: 'finish' },
  look: {
    skyTop: 0x4f86b4,
    skyMid: 0xa9c6d0,
    skyHorizon: 0xeadcbf,
    fog: 0xdad6c3,
    grassA: 0x8fb34d,
    grassB: 0x72a043,
    meadow: 0xa9b35a,
    hemi: 2.0,
    sun: 3.2,
    snowFrom: 9999,
    snowTo: 10000,
    rockFrom: 9999,
    meadowFrom: 9999,
    meadowTo: 10000,
    leaf: 0x77a947,
    treeLine: 200,
  },
  weather: 'none',
  scenery: {
    seed: 81,
    trees: 1500,
    rocks: 260,
    species: { pine: 0.3, cypress: 0.18, broadleaf: 0.47, shrub: 0.05 },
    landmarks,
  },
  atmosphere: { summitMist: 0, mistStart: 0.6, visibility: 1.1 },
};
