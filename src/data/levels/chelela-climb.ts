import type { HazardDef, JunctionDef, LandmarkDef, LevelDef, PuddleDef, RoadPointDef, RoadsideDef, StopDef, SurfaceId } from '../types';
import { walkPath } from './extend';
import { CHELELA_LENGTH, CHELELA_PATH, chelelaRange } from './chelelaPath';

/**
 * Level 7: Chelela Hill Climb (about 11 km). Tourists insist on seeing the Chele La pass, and the weather is closing in. A long climb
 * from the Paro-side foothills to a snowy viewpoint: pine and rhododendron forest, a service station, a ladder of eight hairpins, the
 * snowline, a steep slippery traction climb, a windy fogbound ridge, six more hairpins and the summit. Traction is the challenge:
 * frost, packed snow, deep snow, slush and ice change the grip, and four-wheel drive earns its keep. The main road is ploughed and
 * a skilful 4x2 can climb it; the deeper snow, slush and ice reward a vehicle that has 4x4 and a driver who uses it.
 *
 * Distances are metres from the start line (`m`). The level id, unlock rule (now after Trongsa) and eligible vehicles are those of the
 * original mission, so saves and cloud progress keep working. The Dragon Cruiser is not required: the Druk Ranger is eligible too.
 * The deadline and medals are provisional (Stage 6.7B calibrates).
 */
const P = CHELELA_LENGTH;
const START_OFFSET = 30;
const FINISH_OFFSET = 40;
/** Fraction of the playable stretch (stops, hazards, checkpoints, puddles, roadside life, weather zones, traffic). */
const at = (m: number): number => m / P;
/** Fraction of the whole road (surfaces, width profile, landmarks). */
const whole = (m: number): number => Math.min(1, (START_OFFSET + m) / (P + START_OFFSET + FINISH_OFFSET));

const foothill = chelelaRange('foothill');
const forest = chelelaRange('forest');
const service = chelelaRange('service');
const hairpin = chelelaRange('hairpin');
const snowline = chelelaRange('snowline');
const traction = chelelaRange('traction');
const ridge = chelelaRange('ridge');
const summit = chelelaRange('summit');
const viewpoint = chelelaRange('viewpoint');

/** Where the two hairpin ladders end inside their sections (8 U-turns of r20 and 6 of r19, from the path). */
const HAIRPIN_LADDER = 1352.65;
const SUMMIT_LADDER = 1003.1;
const slice = (from: number, to: number): { from: number; to: number } => ({ from, to });
/** Gradient (rise per metre) over each stretch: the ladders and the traction climb are the steepest, about 9 to 10%. */
const GRADES: [{ from: number; to: number }, number][] = [
  [foothill, 0.015],
  [forest, 0.045],
  [service, 0.01],
  [slice(hairpin.from, hairpin.from + HAIRPIN_LADDER), 0.095],
  [slice(hairpin.from + HAIRPIN_LADDER, hairpin.to), 0.06],
  [snowline, 0.065],
  [traction, 0.1],
  [ridge, 0.03],
  [slice(summit.from, summit.from + SUMMIT_LADDER), 0.085],
  [slice(summit.from + SUMMIT_LADDER, summit.to), 0.05],
  [viewpoint, 0.005],
];
/** Height of the road above the start (about 650 m of climb in all); the terrain follows it, so the snowline is a real altitude. */
const relief = (m: number): number => GRADES.reduce((h, [r, g]) => h + g * Math.min(Math.max(m - r.from, 0), r.to - r.from), 0);

function buildRoad(): { points: RoadPointDef[]; bounds: LevelDef['terrain']['bounds'] } {
  const w = walkPath({ x: 0, z: START_OFFSET }, { x: 0, z: -1 }, CHELELA_PATH);
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
  { id: 'lodge', kind: 'pickup', at: at(foothill.from + 90), label: 'Paro foothill lodge', side: 1, party: 2, optional: false, who: 'trekkers', line: 'It is spring in the valley. How cold can a pass really be?' },
  { id: 'foothill-pump', kind: 'service', at: at(foothill.from + 272), label: 'Foothill fuel station', side: 1, services: ['refuel'], optional: true, variant: 'fuel' },
  { id: 'photographer', kind: 'pickup', at: at(forest.from + 60), label: 'Forest lay-by (a snow photographer)', side: -1, party: 1, optional: false, who: 'photographers', line: 'I only need one shot: a snowy prayer flag. How far up is the snow?' },
  { id: 'forest-viewpoint', kind: 'dropoff', at: at(forest.from + 650), label: 'Rhododendron viewpoint', side: -1, party: 1, optional: false, who: 'trekkers', farewell: 'I will walk the rest. It is only nine kilometres. I have snacks!' },
  { id: 'service-pump', kind: 'service', at: at(service.from + 40), label: 'Mountain service station: fuel', side: 1, services: ['refuel'], optional: true, variant: 'fuel' },
  { id: 'service-garage', kind: 'service', at: at(service.from + 102), label: 'Mountain service station: workshop', side: -1, services: ['repair'], optional: true, variant: 'workshop' },
  { id: 'service-tea', kind: 'service', at: at(service.from + 262), label: 'Mountain tea stop', side: 1, services: ['refuel', 'repair'], optional: true, variant: 'kiosk' },
  { id: 'hairpin-tea', kind: 'service', at: at(hairpin.from + 1705), label: 'Hairpin tea stall', side: -1, services: ['refuel', 'repair'], optional: true, variant: 'kiosk' },
  { id: 'stranded', kind: 'pickup', at: at(snowline.from + 235), label: 'Snowline lay-by (stranded visitors)', side: 1, party: 2, optional: false, who: 'sunrise-hikers', line: 'Our car is not stuck. It is resting. In the snow. For two hours.' },
  { id: 'shelter', kind: 'dropoff', at: at(traction.from + 120), label: 'Mountain shelter (hot tea)', side: 1, party: 1, optional: false, who: 'photographers', farewell: 'I am staying in the shelter. The tea is hot, and so is my opinion of this road.' },
  { id: 'shelter-tea', kind: 'service', at: at(traction.from + 178), label: 'Shelter tea counter (fuel can)', side: 1, services: ['refuel'], optional: true, variant: 'kiosk' },
  { id: 'ridge-kiosk', kind: 'service', at: at(ridge.from + 62), label: 'Ridge kiosk (emergency fuel)', side: -1, services: ['refuel'], optional: true, variant: 'kiosk' },
  // The last long climb burns a tank in about three kilometres in 4x4: one more can of fuel before the summit viewpoint.
  { id: 'summit-tea', kind: 'service', at: at(summit.from + 850), label: 'Summit tea house (fuel can)', side: 1, services: ['refuel'], optional: true, variant: 'kiosk' },
];

// ---------------------------------------------------------------------------------------------- hazards
const hazards: HazardDef[] = [
  { id: 'forest-rockfall', kind: 'landslide', at: at(forest.from + 1080), seed: 4, label: 'Falling rocks', side: 1 },
  { id: 'bend-herd', kind: 'herd', at: at(forest.from + 1420), seed: 6, label: 'Yaks on the road', reactive: true, count: 4 },
  { id: 'hairpin-rock', kind: 'landslide', at: at(hairpin.from + 1420), seed: 19, label: 'Falling rocks', side: -1 },
  { id: 'drift-a', kind: 'landslide', at: at(snowline.from + 735), seed: 27, label: 'Snowdrift', side: 1, drift: true },
  { id: 'drift-b', kind: 'landslide', at: at(traction.from + 1000), seed: 31, label: 'Snowdrift', side: -1, drift: true },
  { id: 'yeti', kind: 'creature', at: at(traction.from + 1280), seed: 9, label: 'Yeti crossing', side: 1, reactive: true },
  { id: 'summit-drift', kind: 'landslide', at: at(summit.from + 1500), seed: 37, label: 'Snowdrift', side: -1, drift: true },
];

// ------------------------------------------------------------------------------------------ road surface
const seg = (from: number, to: number, surface: SurfaceId): { from: number; to: number; surface: SurfaceId } => ({ from: whole(from), to: whole(to), surface });
const surfaces = [
  seg(forest.from + 500, forest.from + 900, 'worn'),
  seg(forest.from + 1100, forest.from + 1500, 'worn'),
  // Cold at the top of the hairpin ladder: frost, then the first icy bends.
  seg(hairpin.from + 800, hairpin.from + 1150, 'frost'),
  seg(hairpin.from + 1150, hairpin.from + 1200, 'ice'),
  seg(hairpin.from + 1480, hairpin.to, 'frost'),
  // The snowline: frost, a short icy bend, then the ploughed packed-snow road with slush where the plough has been.
  seg(snowline.from, snowline.from + 200, 'frost'),
  seg(snowline.from + 260, snowline.from + 330, 'ice'),
  seg(snowline.from + 330, snowline.from + 700, 'packed'),
  seg(snowline.from + 700, snowline.from + 790, 'slush'),
  seg(snowline.from + 790, snowline.to, 'packed'),
  // The traction climb: 10% of packed snow with an ice patch, deeper snow, slush and a muddy thaw.
  seg(traction.from, traction.from + 300, 'packed'),
  seg(traction.from + 300, traction.from + 360, 'ice'),
  seg(traction.from + 360, traction.from + 700, 'packed'),
  seg(traction.from + 700, traction.from + 820, 'snow'),
  seg(traction.from + 820, traction.from + 900, 'slush'),
  seg(traction.from + 900, traction.from + 960, 'mud'),
  seg(traction.from + 960, traction.from + 1300, 'packed'),
  seg(traction.from + 1300, traction.from + 1360, 'ice'),
  seg(traction.from + 1360, traction.from + 1450, 'snow'),
  seg(traction.from + 1450, traction.to, 'packed'),
  // The ridge and the summit: packed snow, drifts, glazed hairpin legs.
  seg(ridge.from, ridge.from + 300, 'packed'),
  seg(ridge.from + 300, ridge.from + 380, 'snow'),
  seg(ridge.from + 380, ridge.from + 700, 'packed'),
  seg(ridge.from + 700, ridge.from + 760, 'ice'),
  seg(ridge.from + 760, ridge.to, 'packed'),
  seg(summit.from, summit.from + 130, 'packed'),
  seg(summit.from + 130, summit.from + 190, 'ice'),
  seg(summit.from + 190, summit.from + 560, 'packed'),
  seg(summit.from + 560, summit.from + 620, 'slush'),
  seg(summit.from + 620, summit.from + 900, 'packed'),
  seg(summit.from + 900, summit.from + 960, 'snow'),
  seg(summit.from + 960, summit.from + 1450, 'packed'),
  seg(summit.from + 1450, summit.from + 1500, 'ice'),
  seg(summit.from + 1500, summit.to, 'packed'),
  seg(viewpoint.from, viewpoint.from + 140, 'frost'),
];
const pu = (m: number, lateral: number, radius: number, pothole = false): PuddleDef => ({ at: at(m), lateral, radius, pothole });
const puddles: PuddleDef[] = [
  pu(forest.from + 250, 0.9, 0.9, true),
  pu(forest.from + 800, -0.8, 1.0, true),
  pu(hairpin.from + 330, 0.7, 1.0, true),
  pu(hairpin.from + 640, -0.8, 0.9, true),
  pu(snowline.from + 400, 0.6, 1.0, true),
  pu(traction.from + 860, -0.4, 1.6),
  pu(traction.from + 930, 0.6, 1.8),
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

// Altitude boards and mountain signs all the way up.
every('signpost', foothill.from + 300, viewpoint.to - 200, 520, 5.4, 0, -1);
// The foothills: the lodge, farmhouses, flags.
add(
  lm('lodge', foothill.from + 110, 1, 28, { scale: 0.95 }),
  lm('flagSpan', 6, 1, 0),
  lm('flagSpan', foothill.from + 420, 1, 0),
  lm('house', foothill.from + 60, -1, 24),
  lm('house', foothill.from + 220, -1, 28, { rotation: 0.2 }),
  lm('house', foothill.from + 600, 1, 30, { rotation: -0.2 }),
  lm('chorten', foothill.from + 160, -1, 12),
  lm('prayerWheelHouse', foothill.from + 520, 1, 16),
  lm('paddy', foothill.from + 400, -1, 30),
  lm('streetLamp', foothill.from + 80, -1, 6.0),
  lm('streetLamp', foothill.from + 140, 1, 6.0),
);
// The forest ascent: retaining walls, cuttings, a village, flags and shrines.
every('retainWall', forest.from + 60, forest.to - 60, 150, 5.2, 0, 1);
every('cliff', forest.from + 200, forest.to - 100, 260, 12, 4, -1);
add(
  lm('viewpoint', forest.from + 650, -1, 8),
  lm('flagSpan', forest.from + 300, 1, 0),
  lm('flagSpan', forest.from + 1000, 1, 0),
  lm('flagSpan', forest.from + 1700, 1, 0),
  lm('chorten', forest.from + 520, 1, 12),
  lm('chorten', forest.from + 1200, -1, 12),
  lm('lungta', forest.from + 780, 1, 15),
  lm('house', forest.from + 1550, 1, 22),
  lm('house', forest.from + 1590, 1, 28, { rotation: 0.3 }),
  lm('stall', forest.from + 1620, 1, 9),
);
// The service station: pumps, a workshop and tea are drawn by the stops; a few buildings and parked trucks around them.
add(
  lm('house', service.from + 150, 1, 22),
  lm('chorten', service.from + 200, -1, 12),
  lm('flagSpan', service.from + 60, 1, 0),
  lm('signpost', service.from + 20, -1, 5.6),
  lm('streetLamp', service.from + 100, 1, 6.0),
);
// The hairpin ladder: stone retaining walls on every bend, rocky cuttings, shrines, flags.
every('retainWall', hairpin.from + 100, hairpin.from + HAIRPIN_LADDER, 90, 4.8, 0, -1);
every('cliff', hairpin.from + 80, hairpin.to - 80, 130, 10, 3, 1);
add(
  lm('chorten', hairpin.from + 600, 1, 11),
  lm('flagSpan', hairpin.from + 300, 1, 0),
  lm('flagSpan', hairpin.from + 1000, 1, 0),
  lm('lungta', hairpin.from + 1500, -1, 13),
);
// The snowline: snowy cliffs, flags, height boards, the plough crew's cones.
every('cliff', snowline.from + 80, snowline.to - 80, 170, 11, 3, -1, { scale: 1.1 });
every('retainWall', snowline.from + 100, snowline.to - 100, 150, 5.0, 0, 1);
add(
  lm('flagSpan', snowline.from + 150, 1, 0),
  lm('flagSpan', snowline.from + 700, 1, 0),
  lm('chorten', snowline.from + 420, -1, 11),
  lm('flagPoles', snowline.from + 520, 1, 22, { scale: 0.8 }),
);
// The traction climb: the shelter (drawn here), long snowy slopes, flags and cliffs.
every('cliff', traction.from + 200, traction.to - 100, 200, 11, 3, 1, { scale: 1.2 });
every('retainWall', traction.from + 350, traction.to - 100, 180, 5.0, 0, -1);
add(
  lm('shelter', traction.from + 120, 1, 13),
  lm('flagSpan', traction.from + 400, 1, 0),
  lm('flagSpan', traction.from + 1100, 1, 0),
  lm('flagPoles', traction.from + 600, -1, 24, { scale: 0.9 }),
  lm('chorten', traction.from + 1500, 1, 11),
  lm('signpost', traction.from + 20, -1, 5.0),
);
// The high ridge: prayer-flag fields on the crest, snowy rocks, exposed edges.
every('cliff', ridge.from + 80, ridge.to - 60, 170, 10, 3, 1, { scale: 1.2 });
add(
  lm('flagPoles', ridge.from + 220, 1, 22),
  lm('flagPoles', ridge.from + 700, -1, 22, { scale: 1.1 }),
  lm('flagSpan', ridge.from + 400, 1, 0),
  lm('chorten', ridge.from + 560, 1, 11),
);
// The summit climb: hairpins under snowy cliffs, flags, signs.
every('retainWall', summit.from + 100, summit.from + SUMMIT_LADDER, 85, 4.6, 0, 1);
every('cliff', summit.from + 80, summit.to - 80, 140, 10, 3, -1, { scale: 1.2 });
add(
  lm('flagPoles', summit.from + 500, 1, 24),
  lm('flagPoles', summit.from + 1300, -1, 24),
  lm('flagSpan', summit.from + 300, 1, 0),
  lm('flagSpan', summit.from + 1100, 1, 0),
  lm('chorten', summit.from + 1650, 1, 11),
);
// The Chele La viewpoint: great fields of prayer flags, viewing platforms and railings, a tea stall, parking, signs.
add(
  lm('flagPoles', viewpoint.from + 120, 1, 26, { scale: 1.2 }),
  lm('flagPoles', viewpoint.to - 100, 1, 28, { scale: 1.3 }),
  lm('flagPoles', viewpoint.to - 60, -1, 30, { scale: 1.1 }),
  lm('viewpoint', viewpoint.to - 70, -1, 10),
  lm('viewpoint', viewpoint.to - 20, -1, 10),
  lm('shelter', viewpoint.to - 150, 1, 12),
  lm('stall', viewpoint.to - 100, 1, 10),
  lm('stall', viewpoint.to - 80, 1, 10),
  lm('plaza', viewpoint.to - 40, 1, 14),
  lm('chortenGroup', viewpoint.from + 60, -1, 22),
  lm('flagSpan', viewpoint.from + 20, 1, 0),
  lm('flagSpan', viewpoint.to - 110, 1, 0),
  lm('flagSpan', viewpoint.to - 30, 1, 0),
  lm('signpost', viewpoint.from + 30, 1, 6.0),
  lm('signpost', viewpoint.to - 120, -1, 6.4),
  lm('planter', viewpoint.to - 60, -1, 12),
);
for (let m = viewpoint.from + 150; m < viewpoint.to - 10; m += 14) landmarks.push(lm('railing', m, -1, 7.5));

// -------------------------------------------------------------------------------------- roadside life
const roadside: RoadsideDef = {
  walkers: [
    { at: at(foothill.from + 110), side: 1, count: 3, span: 12 },
    { at: at(forest.from + 1580), side: 1, count: 2, span: 14 },
    { at: at(snowline.from + 885), side: -1, count: 3, span: 10 },
    { at: at(viewpoint.from + 180), side: 1, count: 5, span: 22 },
  ],
  standing: [
    { at: at(foothill.from + 92), side: 1, count: 3 },
    { at: at(forest.from + 62), side: -1, count: 1 },
    { at: at(forest.from + 652), side: -1, count: 2, offset: 0.4 },
    { at: at(service.from + 264), side: 1, count: 2 },
    { at: at(snowline.from + 237), side: 1, count: 3 },
    { at: at(snowline.from + 858), side: 1, count: 3 },
    { at: at(traction.from + 122), side: 1, count: 2 },
    { at: at(viewpoint.to - 56), side: -1, count: 4 },
  ],
  // The snow-clearing crew works behind a line of cones, with the plough ahead.
  cones: [{ at: at(snowline.from + 850), side: 1, length: 66 }],
  markers: [
    { from: at(snowline.from + 100), to: at(traction.to), spacing: 30 },
    { from: at(ridge.from), to: at(ridge.to), spacing: 28 },
    { from: at(summit.from + 100), to: at(summit.to), spacing: 30 },
  ],
  drains: [{ from: at(forest.from + 100), to: at(forest.to - 100), side: -1 }],
  yaks: [
    { at: at(forest.from + 1360), side: -1, offset: 16 },
    { at: at(forest.from + 1380), side: -1, offset: 22 },
    { at: at(snowline.from + 600), side: -1, offset: 18 },
    { at: at(ridge.from + 320), side: -1, offset: 20 },
    { at: at(viewpoint.from + 250), side: -1, offset: 24 },
  ],
  parked: [
    { at: at(foothill.from + 72), side: 1, kind: 'taxi' },
    { at: at(foothill.from + 150), side: 1, kind: 'minibus' },
    { at: at(service.from + 130), side: 1, kind: 'truck' },
    { at: at(service.from + 160), side: -1, kind: 'delivery' },
    { at: at(snowline.from + 255), side: 1, kind: 'suv' },
    { at: at(traction.from + 150), side: 1, kind: 'minibus' },
    { at: at(viewpoint.to - 98), side: 1, kind: 'bus' },
    { at: at(viewpoint.to - 72), side: 1, kind: 'minibus' },
    { at: at(viewpoint.to - 120), side: 1, kind: 'suv' },
    { at: at(viewpoint.to - 138), side: 1, kind: 'taxi' },
    { at: at(viewpoint.to - 44), side: 1, kind: 'suv' },
  ],
  birds: [
    { at: at(forest.from + 700), side: -1, offset: 20, count: 5 },
    { at: at(hairpin.from + 700), side: 1, offset: 22, count: 4 },
  ],
  crowd: { at: at(P - 24), side: 1, count: 12, offset: 5.5, width: 18 },
};

const wp = (from: number, to: number, width: number, shoulder: number): { from: number; to: number; width: number; shoulder: number } => ({ from: whole(from), to: whole(to), width, shoulder });
const widthProfile = [
  wp(-12, foothill.from + 140, 8.6, 2.2),
  wp(foothill.from + 160, foothill.to - 20, 7.6, 1.0),
  wp(forest.from + 10, forest.to - 10, 7.0, 0.6),
  wp(service.from + 10, service.to - 10, 8.4, 3.4),
  wp(hairpin.from + 10, hairpin.from + 190, 6.6, 0.5),
  // Narrow passing bays on the hairpin legs.
  wp(hairpin.from + 205, hairpin.from + 265, 8.8, 1.2),
  wp(hairpin.from + 290, hairpin.from + 440, 6.6, 0.5),
  wp(hairpin.from + 455, hairpin.from + 515, 8.8, 1.2),
  wp(hairpin.from + 540, hairpin.from + 740, 6.6, 0.5),
  wp(hairpin.from + 755, hairpin.from + 815, 8.8, 1.2),
  wp(hairpin.from + 840, hairpin.from + 1040, 6.6, 0.5),
  wp(hairpin.from + 1055, hairpin.from + 1115, 8.8, 1.2),
  wp(hairpin.from + 1140, hairpin.to - 10, 6.6, 0.5),
  wp(snowline.from + 10, snowline.to - 10, 6.4, 0.5),
  wp(traction.from + 10, traction.to - 10, 6.2, 0.5),
  wp(ridge.from + 10, ridge.to - 10, 6.0, 0.4),
  wp(summit.from + 10, summit.to - 10, 6.2, 0.5),
  wp(viewpoint.to - 130, viewpoint.to + FINISH_OFFSET, 13, 6),
];

const junctions: JunctionDef[] = [];

export const chelelaClimb: LevelDef = {
  id: 'chelela-climb',
  name: 'Chelela Hill Climb',
  subtitle: 'Up to the snow and the high pass',
  description:
    'The tourists insist on seeing Chele La, the highest road pass in Bhutan, and the weather has other plans. Climb from the Paro foothills through forest and fourteen hairpins to the snowy viewpoint: frost, packed snow, slush and ice will test your traction, a ploughed road is there for the careful and the deeper snow for those with four-wheel drive, and the cloud is coming down.',
  objective: 'Collect the guests and the photographer, rescue the stranded visitors at the snowline, and climb to the Chele La viewpoint before the weather closes in.',
  difficulty: 5,
  region: 'Mountain Passes',
  mission: { kind: 'hillclimb', party: 4, finishMode: 'stop', timerStyle: 'deadline', timerLabel: 'Weather closes in', comfort: true },
  vehicles: ['druk-ranger', 'dragon-cruiser'],
  conditions: [
    { weather: 'clear', time: 'day', bonus: 1 },
    { weather: 'snow', time: 'day', bonus: 1.3 },
    { weather: 'fog', time: 'dusk', bonus: 1.35 },
  ],
  startFuel: 0.6,
  reward: 700,
  stops,
  hazards,
  traffic: {
    count: 7,
    speed: [7, 12],
    oncoming: 0.4,
    seed: 11,
    turnChance: 0,
    slowInFog: true,
    mix: [
      { kind: 'bus', weight: 1.6 },
      { kind: 'truck', weight: 2 },
      { kind: 'suv', weight: 1.8 },
      { kind: 'taxi', weight: 1.2 },
      { kind: 'minibus', weight: 1 },
      { kind: 'delivery', weight: 0.5 },
      { kind: 'moto', weight: 0.4 },
    ],
    scripted: [
      // Heavy traffic labouring up the mountain, ploughs working the snowy stretches, and a stranded SUV that sets off again.
      { at: at(foothill.from + 500), kind: 'minibus', speed: 6.5 },
      { at: at(forest.from + 300), kind: 'bus', speed: 5.0 },
      { at: at(forest.from + 1100), kind: 'truck', speed: 4.6 },
      { at: at(hairpin.from + 250), kind: 'truck', speed: 3.6 },
      { at: at(hairpin.from + 900), kind: 'bus', speed: 3.8 },
      { at: at(snowline.from + 150), kind: 'suv', speed: 3.0, hold: 14, trigger: 100 },
      { at: at(snowline.from + 520), kind: 'plough', speed: 3.4 },
      { at: at(traction.from + 250), kind: 'plough', speed: 3.2 },
      { at: at(traction.from + 900), kind: 'truck', speed: 3.5 },
      { at: at(ridge.from + 300), kind: 'bus', speed: 4.0 },
      { at: at(summit.from + 400), kind: 'truck', speed: 3.6 },
      { at: at(summit.from + 1200), kind: 'plough', speed: 3.4 },
    ],
  },
  junctions,
  roadside,
  weatherZones: [
    // Clear in the foothills, then cloud, fog in the hairpins, snow from the snowline, a whiteout on the ridge, fog and snow near the
    // summit, and the sky opening just as the car reaches the viewpoint.
    { from: at(forest.from + 600), to: at(forest.to), weather: 'cloudy' },
    { from: at(hairpin.from + 300), to: at(hairpin.from + 1100), weather: 'fog' },
    { from: at(hairpin.from + 1100), to: at(snowline.from), weather: 'cloudy' },
    { from: at(snowline.from), to: at(ridge.from + 150), weather: 'snow' },
    { from: at(ridge.from + 150), to: at(ridge.from + 650), weather: 'blizzard' },
    { from: at(ridge.from + 650), to: at(summit.from + 1150), weather: 'fog' },
    { from: at(summit.from + 1150), to: at(viewpoint.from + 90), weather: 'snow' },
    { from: at(viewpoint.from + 90), to: at(viewpoint.to), weather: 'clear' },
  ],
  celebrate: true,
  celebrateFlags: true,
  optional: [
    { id: 'intact', kind: 'condition', value: 80, reward: 90, label: 'Vehicle in good shape' },
    { id: 'smooth', kind: 'comfort', value: 75, reward: 90, label: 'Calm guests on a slippery road' },
    { id: 'chai', kind: 'useService', reward: 30, label: 'Tea and a top-up on the way' },
  ],
  tip: 'Smooth inputs: gentle throttle on ice, brake in a straight line before each hairpin. On a vehicle with 4x4, press F before the steep snow (the ploughed road can be climbed in 4x2). Top up at every pump: snow and slopes drink fuel.',
  puddles,
  surfaces,
  shoulder: 'gravel',
  terrain: {
    seed: 11,
    bounds: road.bounds,
    cell: 9,
    slope: 0,
    hillHeight: 10,
    detailHeight: 6,
    valleyZ: 99999,
    valleyDepth: 0,
    waterLevel: -999,
    followRoad: 1,
  },
  road: { width: 7.0, shoulder: 0.6, startOffset: START_OFFSET, finishOffset: FINISH_OFFSET, points: road.points, widthProfile },
  checkpoints: [
    { at: at(foothill.to - 40), label: 'Foothills' },
    { at: at(forest.from + 700), label: 'Forest ascent' },
    { at: at(forest.to - 80), label: 'Rhododendron forest' },
    { at: at(service.to - 30), label: 'Service station' },
    { at: at(hairpin.from + 700), label: 'Hairpin ladder' },
    { at: at(hairpin.to - 60), label: 'Above the hairpins' },
    { at: at(snowline.from + 500), label: 'Snow line' },
    { at: at(snowline.to - 60), label: 'Frozen bends' },
    { at: at(traction.from + 700), label: 'Steep traction climb' },
    { at: at(traction.to - 60), label: 'Top of the climb' },
    { at: at(ridge.from + 400), label: 'High ridge' },
    { at: at(summit.from + 500), label: 'Summit hairpins' },
    { at: at(summit.from + 1500), label: 'Last climb' },
    { at: at(viewpoint.from + 100), label: 'Chele La viewpoint' },
  ],
  finishLabel: 'Chele La viewpoint',
  // Provisional: Stage 6.7B calibrates the deadline and medals by driving the route.
  timeLimit: 1080,
  medals: { gold: 840, silver: 930, bronze: 1010 },
  comfortMedals: { gold: 80, silver: 65, bronze: 45 },
  unlock: { levelId: 'trongsa-gorge', requirement: 'finish' },
  look: {
    skyTop: 0x4f7db3,
    skyMid: 0xa9c9e0,
    skyHorizon: 0xe6eaea,
    fog: 0xd2d6d6,
    mist: 0xeef0f2,
    grassA: 0x7c9360,
    grassB: 0x66805a,
    meadow: 0xa6a275,
    hemi: 2.2,
    sun: 2.3,
    sunColor: 0xeef2ff,
    // Height above the start: forest to about 330, treeless meadow and rock above, snow from about 270 and deepening.
    rockFrom: 430,
    meadowFrom: 200,
    meadowTo: 320,
    snowFrom: 270,
    snowTo: 350,
    snowMax: 0.95,
    treeLine: 335,
    blossom: 0xd8486c,
    shoulder: 0xc9ced0,
  },
  weather: 'none',
  scenery: {
    seed: 83,
    trees: 1500,
    rocks: 520,
    species: { pine: 0.5, cypress: 0.12, broadleaf: 0.08, shrub: 0.3 },
    landmarks,
  },
  atmosphere: { summitMist: 0.7, mistStart: 0.45, visibility: 0.92 },
};
