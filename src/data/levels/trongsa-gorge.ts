import type { HazardDef, JunctionDef, LandmarkDef, LevelDef, PuddleDef, RiverDef, RoadPointDef, RoadsideDef, StopDef, SurfaceId } from '../types';
import { walkPath } from './extend';
import { TRONGSA_LENGTH, TRONGSA_PATH, trongsaRange } from './trongsaPath';

/**
 * Level 6: Trongsa Gorge Run (about 9.3 km). A group of tourists must reach Trongsa along a narrow, damaged mountain road: a ridge
 * traverse, an exposed cliff ledge, a long gorge descent that heats the brakes, a one-lane bridge with a signal, a rockfall corridor
 * beside the river, a rough muddy climb (4x4 helps, a 4x2 can still do it) and the town above. Harder than Dochula, and fair.
 *
 * Distances are metres from the start line (`m`). The level id, unlock rule (now after Dochula) and eligible vehicles are those of the
 * original mission, so saves and cloud progress keep working. The deadline and medals are provisional (Stage 6.6B calibrates).
 */
const P = TRONGSA_LENGTH;
const START_OFFSET = 30;
const FINISH_OFFSET = 36;
/** Fraction of the playable stretch (stops, hazards, checkpoints, puddles, roadside life, weather zones, traffic). */
const at = (m: number): number => m / P;
/** Fraction of the whole road (surfaces, width profile, landmarks, rivers). */
const whole = (m: number): number => (START_OFFSET + m) / (P + START_OFFSET + FINISH_OFFSET);

const departure = trongsaRange('departure');
const traverse = trongsaRange('traverse');
const cliffside = trongsaRange('cliffside');
const gorge = trongsaRange('gorge');
const bridge = trongsaRange('bridge');
const corridor = trongsaRange('corridor');
const climb = trongsaRange('climb');
const approach = trongsaRange('approach');
const dzong = trongsaRange('dzong');

/** The two hairpin ladders are the steepest parts: about 10% down in the gorge, 9% up the climb. Lengths from the path (4 and 6 U-turns of r22). */
const GORGE_LADDER = 836.5;
const CLIMB_LADDER = 1144.7;
const slice = (from: number, to: number): { from: number; to: number } => ({ from, to });
/** Gradient (rise per metre, negative = downhill) over each stretch of the route. */
const GRADES: [{ from: number; to: number }, number][] = [
  [departure, -0.008],
  [traverse, -0.01],
  [cliffside, -0.02],
  [slice(gorge.from, gorge.from + GORGE_LADDER), -0.1],
  [slice(gorge.from + GORGE_LADDER, gorge.to), -0.06],
  [bridge, 0],
  [corridor, -0.003],
  [slice(climb.from, climb.from + CLIMB_LADDER), 0.09],
  [slice(climb.from + CLIMB_LADDER, climb.to), 0.085],
  [approach, 0.006],
  [dzong, 0.01],
];
/** Height of the road relative to the start (about 170 m down into the gorge, then 165 m back up); the terrain follows it. */
const relief = (m: number): number => GRADES.reduce((h, [r, g]) => h + g * Math.min(Math.max(m - r.from, 0), r.to - r.from), 0);

function buildRoad(): { points: RoadPointDef[]; bounds: LevelDef['terrain']['bounds'] } {
  const w = walkPath({ x: 0, z: START_OFFSET }, { x: 0, z: -1 }, TRONGSA_PATH);
  const raw = [{ x: 0, z: START_OFFSET }, ...w.points];
  const points: RoadPointDef[] = [];
  let m = -START_OFFSET;
  for (let i = 0; i < raw.length; i++) {
    if (i > 0) m += Math.hypot(raw[i].x - raw[i - 1].x, raw[i].z - raw[i - 1].z);
    points.push({ x: raw[i].x, z: raw[i].z, dy: relief(m) });
  }
  const xs = raw.map((p) => p.x);
  const zs = raw.map((p) => p.z);
  return { points, bounds: { minX: Math.min(...xs) - 260, maxX: Math.max(...xs) + 260, minZ: Math.min(...zs) - 200, maxZ: Math.max(...zs) + 200 } };
}
const road = buildRoad();

// ------------------------------------------------------------------------------------------------ river
/** The Mangde Chhu: far below the ledge on the left, level with the road at the bridge, then beside it on the right, then far below again. */
const BRIDGE_M = bridge.from + 80;
const riverLevel = (m: number): number => {
  const atBridge = relief(BRIDGE_M) - 11;
  if (m <= traverse.from) return -95;
  if (m <= BRIDGE_M) return -95 + (atBridge + 95) * ((m - traverse.from) / (BRIDGE_M - traverse.from));
  return atBridge - Math.min(25, 0.012 * (m - BRIDGE_M));
};
/** A river control point `lateral` metres to the right of the road at `m`, with the water at the river's own level (never closer than `minBelow` under the road). */
const rp = (m: number, lateral: number, minBelow = 11): { at: number; lateral: number; below: number } => ({ at: whole(m), lateral, below: Math.max(minBelow, relief(m) - riverLevel(m)) });
const rivers: RiverDef[] = [
  {
    id: 'mangde-chhu',
    width: 24,
    depth: 2.6,
    bank: 45,
    points: [
      // The ridge traverse and the cliff ledge: the river is a thin ribbon deep in the gorge on the left.
      ...Array.from({ length: 7 }, (_, i) => rp(traverse.from + 100 + i * 200, -150)),
      ...Array.from({ length: 8 }, (_, i) => rp(cliffside.from + 40 + i * 130, -62)),
      // The hairpin ladder drifts east, so the river stays well west of it.
      rp(gorge.from + 60, -90),
      rp(gorge.from + 800, -300),
      // Then it closes in on the road as the sweepers reach the valley floor.
      rp(gorge.from + 900, -280),
      rp(gorge.from + 1000, -230),
      rp(gorge.from + 1100, -170),
      rp(gorge.from + 1200, -115),
      rp(gorge.from + 1300, -75),
      rp(gorge.from + 1400, -52),
      rp(gorge.to - 40, -44),
      // Under the bridge, from the left of the road to the right, steeply so the water fits inside the bridge.
      rp(bridge.from + 55, -40),
      rp(bridge.from + 80, 0),
      rp(bridge.from + 105, 40),
      rp(bridge.from + 160, 52),
      // The rockfall corridor beside the river, then away from it as the road climbs (the climb ladder drifts west).
      rp(corridor.from + 60, 52),
      rp(corridor.from + 260, 55),
      rp(corridor.from + 520, 58),
      rp(corridor.from + 760, 60),
      rp(corridor.from + 960, 80),
      rp(corridor.to, 130),
      rp(climb.from + 60, 200),
      rp(climb.from + CLIMB_LADDER - 60, 400),
      rp(climb.from + 1400, 420),
    ],
  },
];

// -------------------------------------------------------------------------------------------------- stops
const stops: StopDef[] = [
  { id: 'lodge', kind: 'pickup', at: at(departure.from + 90), label: 'Mountain lodge forecourt', side: 1, party: 2, optional: false, who: 'sunrise-hikers', line: 'The map says the road is "challenging". We love a challenge. Please do not tell us what it means.' },
  { id: 'guide', kind: 'pickup', at: at(traverse.from + 60), label: 'Village junction (our guide)', side: -1, party: 1, optional: false, who: 'archery-fan', line: 'Welcome. The cliff is "very scenic". I recommend looking at it with your eyes only.' },
  { id: 'traverse-pump', kind: 'service', at: at(traverse.from + 868), label: 'Ridge-road fuel pump', side: -1, services: ['refuel'], optional: true, variant: 'fuel' },
  { id: 'viewpoint', kind: 'dropoff', at: at(cliffside.from + 350), label: 'Scenic lay-by (photo stop)', side: -1, party: 1, optional: false, who: 'sunrise-hikers', farewell: 'Ten minutes for the best photograph in the kingdom. Fifteen. We will walk the rest!' },
  { id: 'gorge-tea', kind: 'service', at: at(gorge.from + 1062), label: 'Gorge tea stop (rest and repairs)', side: 1, services: ['refuel', 'repair'], optional: true, variant: 'kiosk' },
  { id: 'hamlet', kind: 'dropoff', at: at(corridor.from + 350), label: 'Gorge-side hamlet', side: 1, party: 1, optional: false, who: 'archery-fan', farewell: 'This is my village. The brakes smell like my grandmother\'s kitchen. Thank you!' },
  { id: 'stranded', kind: 'pickup', at: at(corridor.from + 950), label: 'Lay-by past the rockfalls', side: 1, party: 2, optional: false, who: 'grandparents', line: 'We have been waiting since the rocks fell. A rock waved at us. We did not wave back.' },
  { id: 'corridor-garage', kind: 'service', at: at(corridor.from + 1012), label: 'Roadside workshop', side: -1, services: ['repair', 'refuel'], optional: true, variant: 'workshop' },
  { id: 'town-pump', kind: 'service', at: at(approach.from + 385), label: 'Trongsa fuel stop', side: 1, services: ['refuel'], optional: true, variant: 'fuel' },
];

// ---------------------------------------------------------------------------------------------- hazards
const hazards: HazardDef[] = [
  { id: 'traverse-herd', kind: 'herd', at: at(traverse.from + 700), seed: 6, label: 'Cattle crossing', reactive: true, count: 4 },
  { id: 'cliff-rockfall', kind: 'landslide', at: at(cliffside.from + 650), seed: 17, label: 'Falling rocks', side: 1 },
  { id: 'cliff-lorry', kind: 'brokenTruck', at: at(cliffside.from + 800), seed: 14, label: 'Broken-down lorry', side: 1 },
  { id: 'gorge-rockfall', kind: 'landslide', at: at(gorge.from + 1220), seed: 5, label: 'Falling rocks', side: 1 },
  { id: 'bridge-slip', kind: 'landslide', at: at(gorge.from + 1530), seed: 23, label: 'Debris on the bridge approach', side: -1 },
  { id: 'corridor-a', kind: 'landslide', at: at(corridor.from + 235), seed: 9, label: 'Falling rocks', side: 1 },
  { id: 'corridor-b', kind: 'landslide', at: at(corridor.from + 520), seed: 33, label: 'Landslide', side: -1 },
  { id: 'corridor-c', kind: 'landslide', at: at(corridor.from + 800), seed: 19, label: 'Falling rocks', side: 1 },
  { id: 'climb-yeti', kind: 'creature', at: at(climb.from + 1480), seed: 12, label: 'Something on the road', side: -1, reactive: true },
  { id: 'climb-rockfall', kind: 'landslide', at: at(climb.from + 1620), seed: 41, label: 'Loose boulders', side: 1 },
];

// ------------------------------------------------------------------------------------------ road surface
const seg = (from: number, to: number, surface: SurfaceId): { from: number; to: number; surface: SurfaceId } => ({ from: whole(from), to: whole(to), surface });
const surfaces = [
  seg(traverse.from + 100, traverse.from + 500, 'worn'),
  seg(cliffside.from, cliffside.to - 200, 'worn'),
  seg(cliffside.from + 920, cliffside.from + 990, 'gravel'),
  // The gorge: broken tarmac, gravel on a hairpin leg, a rocky stretch, an eroded edge.
  seg(gorge.from + 30, gorge.from + 400, 'worn'),
  seg(gorge.from + 220, gorge.from + 300, 'gravel'),
  seg(gorge.from + 400, gorge.from + 440, 'rocky'),
  seg(gorge.from + 560, gorge.from + 660, 'worn'),
  seg(gorge.from + 1020, gorge.from + 1090, 'gravel'),
  // The corridor: debris, mud under the two big slips.
  seg(corridor.from + 215, corridor.from + 262, 'rocky'),
  seg(corridor.from + 495, corridor.from + 552, 'mud'),
  seg(corridor.from + 780, corridor.from + 830, 'gravel'),
  // The climb: gravel, packed dirt on the hairpin legs, short mud and rock runs.
  seg(climb.from, climb.from + 130, 'gravel'),
  seg(climb.from + 130, climb.from + 560, 'dirt'),
  seg(climb.from + 560, climb.from + 620, 'mud'),
  seg(climb.from + 620, climb.from + 780, 'rocky'),
  seg(climb.from + 780, climb.from + 900, 'dirt'),
  seg(climb.from + 900, climb.from + 950, 'mud'),
  seg(climb.from + 950, climb.from + 1144, 'gravel'),
  seg(climb.from + 1170, climb.from + 1250, 'rocky'),
  seg(climb.from + 1300, climb.from + 1450, 'dirt'),
  seg(climb.from + 1470, climb.from + 1525, 'mud'),
  seg(climb.from + 1560, climb.to - 40, 'gravel'),
  seg(approach.from, approach.from + 250, 'worn'),
];
const pu = (m: number, lateral: number, radius: number, pothole = false): PuddleDef => ({ at: at(m), lateral, radius, pothole });
const puddles: PuddleDef[] = [
  pu(traverse.from + 140, 1.0, 0.9, true),
  pu(traverse.from + 330, -0.9, 1.0, true),
  pu(cliffside.from + 70, 0.7, 0.9, true),
  pu(cliffside.from + 260, -0.8, 1.0, true),
  pu(cliffside.from + 560, 0.6, 0.9, true),
  pu(cliffside.from + 940, -0.4, 1.0, true),
  pu(gorge.from + 260, 0.5, 1.1, true),
  pu(gorge.from + 420, -0.8, 1.0, true),
  pu(gorge.from + 590, 0.9, 0.9, true),
  pu(gorge.from + 1040, 0.6, 1.0, true),
  pu(corridor.from + 240, -0.7, 1.4),
  pu(corridor.from + 520, 0.6, 2.0),
  pu(corridor.from + 540, -0.9, 1.8),
  pu(corridor.from + 805, 0.5, 1.0, true),
  pu(climb.from + 580, 0.4, 2.0),
  pu(climb.from + 700, -0.8, 1.2, true),
  pu(climb.from + 930, 0.6, 1.8),
  pu(climb.from + 1210, 0.8, 1.2, true),
  pu(climb.from + 1495, -0.5, 2.0),
  pu(approach.from + 120, 0.8, 1.0, true),
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

// The mountain lodge and the road out.
add(
  lm('lodge', departure.from + 110, 1, 28, { scale: 0.95 }),
  lm('flagSpan', 6, 1, 0),
  lm('flagSpan', departure.from + 250, 1, 0),
  lm('chorten', departure.from + 40, -1, 12),
  lm('house', departure.from + 80, -1, 24),
  lm('house', departure.from + 200, -1, 28, { rotation: 0.2 }),
  lm('prayerWheelHouse', departure.from + 300, 1, 16),
  lm('streetLamp', departure.from + 70, 1, 6.0),
  lm('streetLamp', departure.from + 150, 1, 6.0),
  lm('signpost', departure.from + 20, 1, 5.8),
  lm('signpost', departure.from + 400, -1, 5.8),
);
// The ridge traverse: forest, walls, a village junction, flags, the distant dzong across the gorge.
every('retainWall', traverse.from + 60, traverse.to - 60, 160, 5.6, 0, 1);
every('cliff', traverse.from + 150, traverse.to - 80, 210, 12, 4, 1);
add(
  lm('house', traverse.from + 40, -1, 18),
  lm('house', traverse.from + 80, -1, 24, { rotation: 0.3 }),
  lm('stall', traverse.from + 90, 1, 9),
  lm('busShelter', traverse.from + 62, -1, 7.0),
  lm('flagSpan', traverse.from + 350, 1, 0),
  lm('flagSpan', traverse.from + 1000, 1, 0),
  lm('chorten', traverse.from + 560, -1, 12),
  lm('lungta', traverse.from + 780, -1, 15),
  lm('signpost', traverse.from + 20, 1, 5.6),
  lm('signpost', traverse.from + 1200, -1, 5.6),
  lm('dzongComplex', traverse.from + 1100, -1, 330, { scale: 1.7 }),
);
// The exposed cliffside: rock cuttings on the right, a sheer drop on the left, the viewpoint lay-by.
every('cliff', cliffside.from + 40, cliffside.to - 40, 105, 8.5, 2, 1, { scale: 1.1 });
every('retainWall', cliffside.from + 70, cliffside.to - 60, 120, 4.6, 0, -1);
add(
  lm('viewpoint', cliffside.from + 350, -1, 7.2),
  lm('flagSpan', cliffside.from + 330, 1, 0),
  lm('flagSpan', cliffside.from + 880, 1, 0),
  lm('signpost', cliffside.from + 30, 1, 4.8),
  lm('signpost', cliffside.from + 600, -1, 4.8),
  lm('chorten', cliffside.from + 400, 1, 10),
  lm('dzongComplex', cliffside.from + 500, -1, 340, { scale: 1.9 }),
);
// The gorge descent: retaining walls on every hairpin, cliffs, shrines.
every('retainWall', gorge.from + 150, gorge.to - 150, 115, 4.8, 0, -1);
every('cliff', gorge.from + 100, gorge.to - 120, 135, 10, 3, 1);
add(
  lm('chorten', gorge.from + 500, 1, 11),
  lm('flagSpan', gorge.from + 240, 1, 0),
  lm('flagSpan', gorge.from + 1000, 1, 0),
  lm('lungta', gorge.from + 1150, -1, 13),
  lm('signpost', gorge.from + 20, 1, 4.8),
  lm('signpost', gorge.from + 1190, -1, 5.0),
  lm('house', gorge.from + 1075, -1, 20),
);
// The one-lane bridge: a steel truss over the river, signs and a shrine at each end.
add(
  lm('trussBridge', bridge.from + 80, 1, 0),
  lm('signpost', bridge.from + 20, -1, 4.6),
  lm('signpost', bridge.from + 140, 1, 4.6),
  lm('flagSpan', bridge.from + 75, 1, 0),
  lm('chorten', bridge.from + 150, -1, 11),
  lm('cliff', bridge.from + 40, 1, 12, { scale: 1.3 }),
  lm('cliff', bridge.from + 130, -1, 12, { scale: 1.3 }),
);
// The rockfall corridor: raw cliffs on both sides, scars where the slips came down, the hamlet.
every('cliff', corridor.from + 40, corridor.to - 60, 100, 9, 3, 1, { scale: 1.3 });
add(
  lm('cliff', corridor.from + 215, 1, 9, { scale: 1.6 }),
  lm('cliff', corridor.from + 500, -1, 9, { scale: 1.8 }),
  lm('cliff', corridor.from + 780, 1, 9, { scale: 1.6 }),
  lm('house', corridor.from + 330, 1, 20),
  lm('house', corridor.from + 365, 1, 26, { rotation: 0.2 }),
  lm('chorten', corridor.from + 400, 1, 11),
  lm('stall', corridor.from + 355, 1, 9),
  lm('flagSpan', corridor.from + 340, 1, 0),
  lm('signpost', corridor.from + 20, 1, 5.0),
  lm('signpost', corridor.from + 450, -1, 5.0),
  lm('signpost', corridor.from + 1030, 1, 5.0),
  lm('streetLamp', corridor.from + 945, 1, 5.6),
);
// The rough climb: retaining walls and cuttings, shrines, flags.
every('retainWall', climb.from + 150, climb.to - 100, 120, 4.8, 0, -1);
every('cliff', climb.from + 100, climb.to - 100, 140, 10, 3, 1);
add(
  lm('chorten', climb.from + 300, 1, 11),
  lm('chorten', climb.from + 1300, -1, 11),
  lm('flagSpan', climb.from + 600, 1, 0),
  lm('flagSpan', climb.from + 1400, 1, 0),
  lm('lungta', climb.from + 900, -1, 13),
  lm('signpost', climb.from + 20, 1, 5.0),
  lm('signpost', climb.from + 1700, -1, 5.0),
  lm('house', climb.from + 1750, -1, 20),
);
// The Trongsa approach: houses, shops, restaurants, visitor signs.
every('house', approach.from + 30, approach.to - 40, 62, 15, 8, -1);
add(
  lm('shopRow', approach.from + 150, 1, 18),
  lm('shopRow', approach.from + 480, 1, 18),
  lm('restaurant', approach.from + 620, 1, 17),
  lm('hotel', approach.from + 800, -1, 24, { scale: 0.8 }),
  lm('flagSpan', approach.from + 110, 1, 0),
  lm('flagSpan', approach.from + 700, 1, 0),
  lm('chortenGroup', approach.from + 300, -1, 22),
  lm('prayerWheelHouse', approach.from + 560, -1, 14),
  lm('signpost', approach.from + 20, 1, 6.0),
  lm('signpost', approach.from + 400, -1, 6.0),
  lm('signpost', approach.from + 1000, 1, 6.0),
  lm('streetLamp', approach.from + 520, 1, 5.8),
  lm('streetLamp', approach.from + 560, -1, 5.8),
  lm('paddy', approach.from + 250, -1, 34),
);
// The dzong: a great fortress on the spur beyond the viewing platform, parking plaza, gardens, flags.
add(
  lm('dzongComplex', dzong.to - 90, -1, 118, { scale: 1.05 }),
  lm('viewpoint', dzong.to - 60, -1, 9.5),
  lm('plaza', dzong.to - 26, 1, 21),
  lm('gateArch', dzong.from + 80, 1, 0),
  lm('flagSpan', dzong.from + 10, 1, 0),
  lm('flagSpan', dzong.to - 120, 1, 0),
  lm('flagSpan', dzong.to - 30, 1, 0),
  lm('chortenGroup', dzong.to - 130, 1, 26),
  lm('chorten', dzong.to - 40, -1, 14),
  lm('signpost', dzong.from + 30, 1, 7.0),
  lm('signpost', dzong.to - 100, -1, 7.0),
  lm('planter', dzong.to - 78, -1, 12),
  lm('planter', dzong.to - 44, -1, 12),
  lm('planter', dzong.to - 10, -1, 12),
  lm('busShelter', dzong.to - 55, -1, 14),
  lm('cliff', dzong.to + 10, 1, 110, { scale: 2.2 }),
);
for (let m = dzong.from + 140; m < dzong.to - 10; m += 14) landmarks.push(lm('railing', m, -1, 7.5));

// -------------------------------------------------------------------------------------- roadside life
const roadside: RoadsideDef = {
  walkers: [
    { at: at(departure.from + 110), side: 1, count: 3, span: 12 },
    { at: at(traverse.from + 80), side: -1, count: 3, span: 14 },
    { at: at(traverse.from + 590), side: -1, count: 2, span: 20 },
    { at: at(corridor.from + 340), side: 1, count: 3, span: 14 },
    { at: at(climb.from + 1740), side: -1, count: 2, span: 14 },
    { at: at(approach.from + 160), side: 1, count: 4, span: 22 },
    { at: at(approach.from + 520), side: -1, count: 4, span: 22 },
    { at: at(dzong.from + 160), side: 1, count: 5, span: 22 },
  ],
  standing: [
    { at: at(departure.from + 92), side: 1, count: 3 },
    { at: at(traverse.from + 62), side: -1, count: 2 },
    { at: at(cliffside.from + 352), side: -1, count: 2, offset: 0.4 },
    { at: at(gorge.from + 1064), side: 1, count: 2 },
    { at: at(corridor.from + 352), side: 1, count: 2 },
    { at: at(corridor.from + 952), side: 1, count: 3 },
    { at: at(approach.from + 387), side: 1, count: 2 },
    { at: at(dzong.to - 55), side: -1, count: 4 },
  ],
  cones: [{ at: at(gorge.from + 1030), side: -1, length: 66 }],
  drains: [
    { from: at(cliffside.from + 40), to: at(cliffside.to - 40), side: 1 },
    { from: at(climb.from + 150), to: at(climb.to - 60), side: 1 },
  ],
  yaks: [
    { at: at(traverse.from + 640), side: 1, offset: 16 },
    { at: at(traverse.from + 660), side: 1, offset: 22 },
    { at: at(approach.from + 90), side: -1, offset: 16 },
    { at: at(approach.from + 880), side: 1, offset: 18 },
  ],
  parked: [
    { at: at(departure.from + 70), side: 1, kind: 'taxi' },
    { at: at(departure.from + 150), side: 1, kind: 'minibus' },
    { at: at(traverse.from + 880), side: -1, kind: 'truck' },
    { at: at(cliffside.from + 330), side: -1, kind: 'suv' },
    { at: at(cliffside.from + 372), side: -1, kind: 'car' },
    { at: at(gorge.from + 1090), side: 1, kind: 'delivery' },
    { at: at(corridor.from + 925), side: 1, kind: 'minibus' },
    { at: at(corridor.from + 1040), side: -1, kind: 'truck' },
    { at: at(approach.from + 200), side: 1, kind: 'bus' },
    { at: at(approach.from + 232), side: 1, kind: 'taxi' },
    { at: at(approach.from + 560), side: 1, kind: 'bus' },
    { at: at(dzong.to - 98), side: 1, kind: 'bus' },
    { at: at(dzong.to - 72), side: 1, kind: 'bus' },
    { at: at(dzong.to - 46), side: 1, kind: 'minibus' },
    { at: at(dzong.to - 124), side: 1, kind: 'suv' },
    { at: at(dzong.to - 142), side: 1, kind: 'taxi' },
  ],
  birds: [
    { at: at(cliffside.from + 200), side: -1, offset: 24, count: 5 },
    { at: at(corridor.from + 600), side: 1, offset: 20, count: 4 },
    { at: at(dzong.to - 100), side: -1, offset: 30, count: 5 },
  ],
  crowd: { at: at(P - 22), side: 1, count: 12, offset: 1.6, width: 22 },
};

const wp = (from: number, to: number, width: number, shoulder: number): { from: number; to: number; width: number; shoulder: number } => ({ from: whole(from), to: whole(to), width, shoulder });
const widthProfile = [
  wp(-12, departure.from + 140, 8.4, 2.2),
  wp(departure.from + 160, departure.to - 20, 7.2, 0.8),
  wp(traverse.from + 10, traverse.to - 10, 7.0, 0.6),
  wp(cliffside.from + 10, cliffside.from + 300, 5.4, 0.3),
  wp(cliffside.from + 320, cliffside.from + 390, 5.4, 3.6),
  wp(cliffside.from + 410, cliffside.to - 10, 5.4, 0.3),
  wp(gorge.from + 10, gorge.to - 10, 6.2, 0.4),
  wp(bridge.from + 10, bridge.from + 150, 5.4, 0.3),
  wp(corridor.from + 10, corridor.from + 480, 7.0, 0.6),
  wp(corridor.from + 495, corridor.from + 560, 8.6, 0.8),
  wp(corridor.from + 575, corridor.to - 10, 7.0, 0.6),
  wp(climb.from + 10, climb.to - 10, 6.0, 0.4),
  wp(approach.from + 20, approach.to - 20, 8.0, 1.8),
  wp(dzong.to - 125, dzong.to + FINISH_OFFSET, 13, 6),
];

const junctions: JunctionDef[] = [
  { at: at(traverse.from + 62), sides: [-1], arm: 30, width: 6, zebra: false },
  { at: at(approach.from + 180), sides: [1], arm: 30, width: 6, zebra: false },
  { at: at(approach.from + 640), sides: [-1, 1], arm: 35, width: 7, zebra: false },
];

export const trongsaGorge: LevelDef = {
  id: 'trongsa-gorge',
  name: 'Trongsa Gorge Run',
  subtitle: 'The road with the drop',
  description:
    'A group of tourists needs to reach Trongsa through the roughest mountains in central Bhutan, on a road that is narrow, patched, and increasingly unpredictable. A cliff ledge, a gorge that cooks the brakes, a one-lane bridge, falling rocks and a muddy climb: precision, patience and a little mechanical sympathy.',
  objective: 'Collect the guests at the lodge and the village, drop and collect groups along the gorge, and deliver the rest safely to the Trongsa Dzong parking.',
  difficulty: 5,
  region: 'Mountain Passes',
  mission: { kind: 'gorge', party: 3, finishMode: 'stop', timerStyle: 'deadline', timerLabel: 'Time left', comfort: true },
  vehicles: ['dzo-hatch', 'druk-ranger', 'dragon-cruiser'],
  tip: 'Hold the middle of the narrow lane, brake in short bursts on the gorge (hot brakes fade), wait for green at the bridge, and take the rocky climb steadily: 4x4 (F) helps, but a steady throttle will do it.',
  conditions: [
    { weather: 'cloudy', time: 'day', bonus: 1 },
    { weather: 'fog', time: 'day', bonus: 1.25 },
    { weather: 'clear', time: 'dusk', bonus: 1.2 },
  ],
  startFuel: 0.6,
  reward: 620,
  stops,
  hazards,
  traffic: {
    count: 8,
    speed: [8, 13],
    oncoming: 0.4,
    seed: 29,
    turnChance: 0,
    slowInFog: true,
    mix: [
      { kind: 'truck', weight: 2.4 },
      { kind: 'bus', weight: 1.4 },
      { kind: 'minibus', weight: 1 },
      { kind: 'taxi', weight: 1.2 },
      { kind: 'suv', weight: 1.4 },
      { kind: 'moto', weight: 1 },
      { kind: 'delivery', weight: 0.6 },
      { kind: 'car', weight: 0.6 },
    ],
    // The one-lane bridge: a signal gives the road to one direction at a time (traffic obeys it; so should the player).
    controls: [{ at: at(bridge.from + 80), kind: 'bridge', go: 16, stop: 12, span: 22 }],
    scripted: [
      { at: at(traverse.from + 300), kind: 'bus', speed: 6.5 },
      { at: at(traverse.from + 900), kind: 'truck', speed: 5.5 },
      // A laden lorry halted in the lane while its driver checks the load, and a short queue behind it: they pull away one by one.
      { at: at(traverse.from + 1130), kind: 'truck', speed: 4.0, hold: 6, trigger: 140 },
      { at: at(traverse.from + 1100), kind: 'car', speed: 5.0, hold: 9, trigger: 140 },
      { at: at(traverse.from + 1078), kind: 'minibus', speed: 5.0, hold: 12, trigger: 140 },
      { at: at(cliffside.from + 180), kind: 'truck', speed: 5.0 },
      { at: at(gorge.from + 250), kind: 'truck', speed: 4.0 },
      { at: at(gorge.from + 1100), kind: 'bus', speed: 5.0 },
      { at: at(corridor.from + 600), kind: 'truck', speed: 5.5 },
      { at: at(climb.from + 500), kind: 'truck', speed: 3.8 },
      { at: at(climb.from + 1500), kind: 'bus', speed: 4.2 },
      { at: at(approach.from + 300), kind: 'minibus', speed: 6.0 },
    ],
  },
  junctions,
  roadside,
  rivers,
  weatherZones: [
    { from: at(gorge.from + 250), to: at(gorge.from + 700), weather: 'fog' },
    { from: at(approach.from + 500), to: at(dzong.to), weather: 'clear' },
  ],
  celebrate: true,
  celebrateFlags: true,
  brakeFade: true,
  optional: [
    { id: 'intact', kind: 'condition', value: 85, reward: 100, label: 'Not a scrape' },
    { id: 'smooth', kind: 'comfort', value: 80, reward: 80, label: 'Calm guests, wild gorge' },
    { id: 'chai', kind: 'useService', reward: 30, label: 'Chai and a patch-up' },
  ],
  puddles,
  surfaces,
  shoulder: 'gravel',
  terrain: {
    seed: 29,
    bounds: road.bounds,
    cell: 9,
    slope: 0,
    hillHeight: 8,
    detailHeight: 6,
    valleyZ: 99999,
    valleyDepth: 0,
    waterLevel: -999,
    followRoad: 1,
  },
  road: { width: 6.4, shoulder: 0.5, startOffset: START_OFFSET, finishOffset: FINISH_OFFSET, points: road.points, widthProfile },
  checkpoints: [
    { at: at(traverse.from + 300), label: 'Mountain traverse' },
    { at: at(cliffside.from + 200), label: 'Exposed cliffside' },
    { at: at(cliffside.from + 900), label: 'Cliff road ends' },
    { at: at(gorge.from + 500), label: 'Gorge descent' },
    { at: at(gorge.from + 1300), label: 'Gorge floor' },
    { at: at(bridge.from + 200), label: 'Over the Mangde Chhu' },
    { at: at(corridor.from + 300), label: 'Rockfall corridor' },
    { at: at(corridor.from + 700), label: 'Past the landslide' },
    { at: at(climb.from + 500), label: 'Rough climb' },
    { at: at(climb.from + 1500), label: 'Upper switchbacks' },
    { at: at(approach.from + 500), label: 'Trongsa town' },
    { at: at(dzong.from + 100), label: 'Dzong parking' },
  ],
  finishLabel: 'Trongsa Dzong',
  // Provisional: Stage 6.6B calibrates the deadline and medals by driving the route.
  timeLimit: 960,
  medals: { gold: 740, silver: 810, bronze: 880 },
  comfortMedals: { gold: 85, silver: 70, bronze: 50 },
  unlock: { levelId: 'dochula-storm', requirement: 'finish' },
  look: {
    skyTop: 0x5b7a98,
    skyMid: 0xa8bcc4,
    skyHorizon: 0xdbd2bb,
    fog: 0xc8c6b8,
    mist: 0xdad8cc,
    grassA: 0x75864a,
    grassB: 0x5f7440,
    meadow: 0x8d8f57,
    rock: 0x8d8272,
    hemi: 1.9,
    sun: 2.6,
    rockFrom: 9999,
    snowFrom: 9999,
    snowTo: 10000,
    meadowFrom: 9999,
    meadowTo: 10000,
    leaf: 0x6a9440,
    treeLine: 400,
    shoulder: 0x7d725f,
  },
  weather: 'none',
  scenery: {
    seed: 41,
    trees: 1500,
    rocks: 700,
    species: { pine: 0.55, cypress: 0.15, broadleaf: 0.2, shrub: 0.1 },
    landmarks,
  },
  atmosphere: { summitMist: 0.3, mistStart: 0.4, visibility: 0.95 },
};
