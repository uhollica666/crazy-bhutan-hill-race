import type { HazardDef, JunctionDef, LandmarkDef, LevelDef, PuddleDef, RiverDef, RoadPointDef, RoadsideDef, StopDef, SurfaceId } from '../types';
import { walkPath } from './extend';
import { GMC_LENGTH, GMC_PATH, gmcRange } from './gmcPath';

/**
 * Level 10: GMC Plains, the finale (about 12.9 km). One long journey from a southern mountain lodge to a Gelephu Mindfulness
 * City-inspired arrival hall, combining everything in the campaign: a steep forest descent (brake fade, heavy trucks, a narrow
 * bridge), a landslide corridor, a muddy off-road detour (4x4 earns its keep), river and flood crossings (water-depth awareness),
 * a wildlife corridor with creatures that are not all animals, a monsoon storm (heavy rain, flooding, fog), a fast southern highway
 * (opposing traffic, slow lorries to overtake), a congested town (a police-directed junction, crossings, roadworks) and a grand arrival.
 *
 * The passengers follow a manifest. Some roadside people look like pickups and are not: check their ID with E before they board
 * (a clue is on the stop label; an impostor who boards is found out later, costing time and comfort). Seating never exceeds five.
 *
 * Distances are metres from the start line (`m`). The level id, unlock rule (now after the Remote Expedition) and the full vehicle
 * list's seating are respected: both eligible vehicles (the Druk Ranger and the Dragon Cruiser) are unlocked by then and can wade
 * every ford (all 0.45 m or less). The deadline and medals are provisional (Stage 6.10B calibrates).
 */
const P = GMC_LENGTH;
const START_OFFSET = 30;
const FINISH_OFFSET = 40;
/** Fraction of the playable stretch (stops, hazards, checkpoints, puddles, roadside life, weather zones, traffic). */
const at = (m: number): number => m / P;
/** Fraction of the whole road (surfaces, width profile, landmarks, rivers, fords). */
const whole = (m: number): number => (START_OFFSET + m) / (P + START_OFFSET + FINISH_OFFSET);

const depart = gmcRange('depart');
const descent = gmcRange('descent');
const corridor = gmcRange('corridor');
const detour = gmcRange('detour');
const river = gmcRange('river');
const wildlife = gmcRange('wildlife');
const storm = gmcRange('storm');
const highway = gmcRange('highway');
const town = gmcRange('town');
const gmc = gmcRange('gmc');

const DESCENT_LADDER = 816.4;
const DETOUR_LADDER = 751.3;
const slice = (from: number, to: number): { from: number; to: number } => ({ from, to });
/** Gradient (rise per metre): the mountain ladders are the steepest (10% down, 9% up), the plains are flat. */
const GRADES: [{ from: number; to: number }, number][] = [
  [depart, -0.01],
  [slice(descent.from, descent.from + DESCENT_LADDER), -0.1],
  [slice(descent.from + DESCENT_LADDER, descent.to), -0.06],
  [corridor, -0.01],
  [slice(detour.from, detour.from + DETOUR_LADDER), 0.09],
  [slice(detour.from + DETOUR_LADDER, detour.to), -0.075],
  [river, -0.01],
  [wildlife, -0.005],
  [storm, -0.005],
  [highway, -0.003],
  [town, 0],
  [gmc, 0],
];
/** Height of the road above the start (about 170 m of descent into the plains); the terrain follows it. */
const relief = (m: number): number => GRADES.reduce((h, [r, g]) => h + g * Math.min(Math.max(m - r.from, 0), r.to - r.from), 0);

function buildRoad(): { points: RoadPointDef[]; bounds: LevelDef['terrain']['bounds'] } {
  const w = walkPath({ x: 0, z: START_OFFSET }, { x: 0, z: -1 }, GMC_PATH);
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

// ------------------------------------------------------------------------------------------ fords, rivers, bridges
/** Fords: all 0.45 m or less (the ranger wades 0.5 m, the cruiser 0.8 m), but the rain makes them dangerous in other ways. */
const FORDS: { centre: number; half: number; depth: number }[] = [
  { centre: detour.from + 955, half: 10, depth: 0.42 },
  { centre: river.from + 245, half: 22, depth: 0.3 },
  { centre: river.from + 430, half: 30, depth: 0.35 },
  { centre: river.from + 628, half: 26, depth: 0.42 },
  { centre: river.from + 996, half: 18, depth: 0.45 },
  { centre: storm.from + 1030, half: 16, depth: 0.35 },
];
const fords = FORDS.map((f) => ({ from: whole(f.centre - f.half), to: whole(f.centre + f.half), depth: f.depth }));
const BRIDGE_A = descent.from + 1575;
const BRIDGE_B = wildlife.from + 1157;
const rp = (m: number, lateral: number, below: number): { at: number; lateral: number; below: number } => ({ at: whole(m), lateral, below });
const crossing = (id: string, centre: number, width: number, depth: number, bank: number): RiverDef => ({
  id,
  width,
  depth,
  bank,
  points: [rp(centre - 56, 34, 0.5), rp(centre - 28, 16, 0.5), rp(centre, 0, 0.35), rp(centre + 28, -16, 0.5), rp(centre + 56, -34, 0.5)],
});
/** A river under a narrow bridge: the water well below the deck. */
const underBridge = (id: string, centre: number): RiverDef => ({
  id,
  width: 14,
  depth: 1.6,
  bank: 16,
  points: [rp(centre - 55, 38, 12), rp(centre - 26, 18, 11), rp(centre, 0, 11), rp(centre + 26, -18, 11), rp(centre + 55, -38, 12)],
});
const rivers: RiverDef[] = [
  crossing('detour-creek', FORDS[0].centre, 8, 0.6, 10),
  crossing('flood-1', FORDS[1].centre, 10, 0.8, 12),
  crossing('flood-2', FORDS[2].centre, 12, 0.9, 12),
  crossing('flood-3', FORDS[3].centre, 14, 1.0, 14),
  crossing('flood-4', FORDS[4].centre, 16, 1.1, 14),
  crossing('storm-run-off', FORDS[5].centre, 8, 0.6, 10),
  underBridge('gorge-river', BRIDGE_A),
  underBridge('wild-river', BRIDGE_B),
];

// -------------------------------------------------------------------------------------------------- stops
/** The manifest: pickups with a clue on the label; the impostors (fake) have a detail that does not match, or nobody expecting them. */
const stops: StopDef[] = [
  { id: 'lodge-group', kind: 'pickup', at: at(depart.from + 90), label: 'The Dorji family (green scarves) at the lodge', side: 1, party: 3, optional: false, who: 'photo-nomads', clue: 'Dorji family, green scarves', line: 'Three of us, eleven bags, one very large map. We are ready for the finale.' },
  { id: 'lodge-late', kind: 'pickup', at: at(depart.from + 262), label: 'Sonam (blue backpack) at the lodge gate', side: -1, party: 1, optional: false, who: 'shopper', clue: 'Sonam, blue backpack', line: 'I was told ten minutes. That was an hour ago. I regret nothing.' },
  { id: 'depart-pump', kind: 'service', at: at(depart.from + 482), label: 'Lodge fuel pump', side: 1, services: ['refuel'], optional: true, variant: 'fuel' },
  { id: 'fake-junction', kind: 'pickup', at: at(descent.from + 75), label: 'Waving traveller (red scarf) at the junction', side: -1, party: 1, optional: true, fake: true, who: 'backpacker', clue: 'Nobody on the manifest wears a red scarf', line: 'Gelephu? Yes, that is exactly where I am going. Probably.' },
  { id: 'forest-viewpoint', kind: 'dropoff', at: at(descent.from + 880), label: 'Forest viewpoint (Sonam leaves)', side: -1, party: 1, optional: false, who: 'shopper', farewell: 'I am walking down from here. It is downhill. How hard can it be?' },
  { id: 'descent-kiosk', kind: 'service', at: at(descent.from + 1235), label: 'Descent tea kiosk', side: 1, services: ['refuel', 'repair'], optional: true, variant: 'kiosk' },
  { id: 'stranded', kind: 'pickup', at: at(corridor.from + 1090), label: 'The film crew (grey cases) after the slides', side: 1, party: 2, optional: false, who: 'film-crew', clue: 'Film crew, grey equipment cases', line: 'We were here first. The mountain was here first. The mountain won.' },
  { id: 'corridor-workshop', kind: 'service', at: at(corridor.from + 1148), label: 'Corridor workshop', side: -1, services: ['repair'], optional: true, variant: 'workshop' },
  { id: 'transfer', kind: 'dropoff', at: at(detour.from + 1075), label: 'Camp truck transfer (film crew)', side: 1, party: 2, optional: false, who: 'film-crew', farewell: 'The camp truck takes the gear from here. Please do not look at the state of the car.' },
  { id: 'detour-recovery', kind: 'service', at: at(detour.from + 1120), label: 'Detour recovery camp', side: -1, services: ['repair', 'refuel'], optional: true, variant: 'workshop' },
  { id: 'doctor', kind: 'pickup', at: at(river.from + 1200), label: 'Dr Lhamo (white coat) at the river bank', side: 1, party: 1, optional: false, who: 'doctor', clue: 'Dr Lhamo, white coat and a red cross bag', line: 'I have crossed four rivers today. I would like to cross zero more.' },
  { id: 'river-station', kind: 'service', at: at(river.from + 1230), label: 'River station', side: -1, services: ['refuel', 'repair'], optional: true, variant: 'kiosk' },
  { id: 'fake-fence', kind: 'pickup', at: at(wildlife.from + 440), label: 'Two walkers with a yellow suitcase by the fence', side: 1, party: 1, optional: true, fake: true, who: 'night-hikers', clue: 'The manifest has no yellow suitcase', line: 'A lift! How kind. I mean, we were waiting for you. Obviously.' },
  { id: 'ranger-drop', kind: 'dropoff', at: at(wildlife.from + 640), label: 'Ranger station (Dr Lhamo leaves)', side: -1, party: 1, optional: false, who: 'doctor', farewell: 'The rangers are expecting me. They have a bear with a sore paw.' },
  { id: 'wild-kiosk', kind: 'service', at: at(wildlife.from + 1196), label: 'Wildlife kiosk', side: 1, services: ['refuel'], optional: true, variant: 'kiosk' },
  { id: 'storm-pump', kind: 'service', at: at(storm.from + 60), label: 'Storm fuel stop', side: 1, services: ['refuel', 'repair'], optional: true, variant: 'fuel' },
  { id: 'storm-shelter', kind: 'pickup', at: at(storm.from + 440), label: 'Mr and Mrs Tshering (yellow raincoats) at the shelter', side: 1, party: 1, optional: false, who: 'grandparents', clue: 'Mr and Mrs Tshering, yellow raincoats', line: 'We have been standing in the rain for an hour. We are a little wet.' },
  { id: 'highway-stop', kind: 'pickup', at: at(highway.from + 160), label: 'Pema (orange cap) at the highway bus stop', side: 1, party: 1, optional: false, who: 'honeymooners', clue: 'Pema, orange cap', line: 'We were promised a coach. This is a very nice coach. Hello!' },
  { id: 'highway-pump', kind: 'service', at: at(highway.from + 1150), label: 'Highway fuel station', side: 1, services: ['refuel', 'repair'], optional: true, variant: 'fuel' },
  { id: 'town-pump', kind: 'service', at: at(town.from + 30), label: 'Town fuel pump', side: 1, services: ['refuel'], optional: true, variant: 'fuel' },
  { id: 'town-hotel', kind: 'dropoff', at: at(town.from + 170), label: 'Gelephu hotel (the Dorji family)', side: 1, party: 2, optional: false, who: 'photo-nomads', farewell: 'We have never been so happy to see a hotel. Thank you, and sorry about the bags.' },
  { id: 'town-guide', kind: 'pickup', at: at(town.from + 540), label: 'Tashi (GMC lanyard) at the tourist office', side: -1, party: 1, optional: false, who: 'archery-fan', clue: 'Tashi, a GMC lanyard', line: 'I am the GMC guide. I have a lanyard. This makes me official.' },
  { id: 'fake-corner', kind: 'pickup', at: at(town.from + 790), label: 'Man with a suitcase (ticket says Paro)', side: 1, party: 1, optional: true, fake: true, who: 'trekkers', clue: 'His ticket says Paro, not Gelephu', line: 'Gelephu, Paro, same thing. Mostly.' },
];

// ---------------------------------------------------------------------------------------------- hazards
const hazards: HazardDef[] = [
  { id: 'descent-rock-1', kind: 'landslide', at: at(descent.from + 1050), seed: 4, label: 'Falling rocks', side: -1 },
  { id: 'descent-rock-2', kind: 'landslide', at: at(descent.from + 1400), seed: 5, label: 'Falling rocks', side: 1 },
  { id: 'slide-a', kind: 'landslide', at: at(corridor.from + 230), seed: 14, label: 'Landslide', side: 1 },
  { id: 'slide-b', kind: 'landslide', at: at(corridor.from + 410), seed: 15, label: 'Partial landslide', side: -1 },
  { id: 'slide-c', kind: 'landslide', at: at(corridor.from + 590), seed: 16, label: 'Rockfall', side: 1 },
  { id: 'slide-d', kind: 'landslide', at: at(corridor.from + 780), seed: 17, label: 'Fallen trees', side: -1, log: true },
  { id: 'slide-e', kind: 'landslide', at: at(corridor.from + 950), seed: 18, label: 'Landslide debris', side: 1 },
  { id: 'detour-bear', kind: 'creature', at: at(detour.from + 240), seed: 31, label: 'Bear crossing', variant: 'bear', reactive: true, side: 1 },
  { id: 'detour-rock', kind: 'landslide', at: at(detour.from + 800), seed: 21, label: 'Rockfall on the detour', side: -1 },
  { id: 'detour-yeti', kind: 'creature', at: at(detour.from + 1230), seed: 9, label: 'Yeti crossing', variant: 'yeti', reactive: true, side: 1 },
  { id: 'river-herd', kind: 'herd', at: at(river.from + 80), seed: 6, label: 'Cattle at the water', reactive: true, count: 4 },
  { id: 'river-log', kind: 'landslide', at: at(river.from + 830), seed: 22, label: 'Flood debris: fallen trees', side: 1, log: true },
  { id: 'wild-herd', kind: 'herd', at: at(wildlife.from + 90), seed: 8, label: 'Wild animals on the road', reactive: true, count: 5 },
  { id: 'wild-bear', kind: 'creature', at: at(wildlife.from + 250), seed: 33, label: 'Bear crossing', variant: 'bear', reactive: true, side: 1 },
  { id: 'wild-yeti', kind: 'creature', at: at(wildlife.from + 800), seed: 10, label: 'Yeti crossing', variant: 'yeti', reactive: true, side: -1 },
  { id: 'wild-zombie', kind: 'creature', at: at(wildlife.from + 985), seed: 27, label: 'Something on the road', variant: 'zombie', behavior: 'chase', side: 1 },
  { id: 'storm-ghost', kind: 'creature', at: at(storm.from + 250), seed: 3, label: 'Spirit in the road', variant: 'ghost', behavior: 'linger', reactive: true, side: -1 },
  { id: 'storm-rock', kind: 'landslide', at: at(storm.from + 650), seed: 41, label: 'Monsoon rockfall', side: 1 },
  { id: 'storm-zombie', kind: 'creature', at: at(storm.from + 820), seed: 29, label: 'Something on the road', variant: 'zombie', behavior: 'chase', side: -1 },
  { id: 'highway-tree', kind: 'landslide', at: at(highway.from + 850), seed: 23, label: 'Storm-felled trees', side: -1, log: true },
  { id: 'highway-herd', kind: 'herd', at: at(highway.from + 1800), seed: 12, label: 'Cattle on the highway', reactive: true, count: 4 },
];

// ------------------------------------------------------------------------------------------ road surface
const seg = (from: number, to: number, surface: SurfaceId): { from: number; to: number; surface: SurfaceId } => ({ from: whole(from), to: whole(to), surface });
const surfaces = [
  seg(depart.from + 600, depart.to, 'worn'),
  seg(descent.from, descent.from + DESCENT_LADDER, 'worn'),
  seg(descent.from + 230, descent.from + 300, 'gravel'),
  seg(descent.from + 640, descent.from + 700, 'gravel'),
  seg(descent.from + DESCENT_LADDER, descent.from + 1300, 'worn'),
  seg(corridor.from, corridor.to, 'worn'),
  seg(corridor.from + 215, corridor.from + 262, 'rocky'),
  seg(corridor.from + 395, corridor.from + 440, 'mud'),
  seg(corridor.from + 575, corridor.from + 620, 'rocky'),
  seg(corridor.from + 935, corridor.from + 985, 'mud'),
  // The detour: rock, deep mud and ruts, nothing like a road.
  seg(detour.from, detour.from + 300, 'rocky'),
  seg(detour.from + 300, detour.from + 450, 'mud'),
  seg(detour.from + 450, detour.from + 600, 'rocky'),
  seg(detour.from + 600, detour.from + 751, 'mud'),
  seg(detour.from + 751, detour.from + 900, 'dirt'),
  seg(detour.from + 1010, detour.from + 1100, 'mud'),
  seg(detour.from + 1100, detour.to, 'dirt'),
  seg(river.from, river.from + 200, 'gravel'),
  seg(river.from + 280, river.from + 380, 'mud'),
  seg(river.from + 480, river.from + 570, 'gravel'),
  seg(river.from + 670, river.from + 940, 'mud'),
  seg(river.from + 1060, river.to, 'gravel'),
  seg(wildlife.from, wildlife.from + 600, 'dirt'),
  seg(wildlife.from + 600, wildlife.to, 'gravel'),
  seg(storm.from, storm.to, 'worn'),
  seg(storm.from + 560, storm.from + 640, 'mud'),
  seg(town.from + 1010, town.from + 1110, 'gravel'),
];
const pu = (m: number, lateral: number, radius: number, pothole = false): PuddleDef => ({ at: at(m), lateral, radius, pothole });
const puddles: PuddleDef[] = [
  pu(descent.from + 260, 0.8, 1.0, true),
  pu(descent.from + 1300, -0.8, 1.6),
  pu(corridor.from + 400, 0.6, 2.0),
  pu(detour.from + 330, -0.6, 2.4),
  pu(detour.from + 420, 0.8, 2.2),
  pu(detour.from + 650, -0.5, 2.4),
  pu(detour.from + 1040, 0.6, 2.2),
  pu(river.from + 330, -0.8, 2.0),
  pu(river.from + 700, 0.6, 2.4),
  pu(river.from + 880, -0.7, 2.2),
  pu(wildlife.from + 300, 0.7, 1.8),
  pu(storm.from + 100, -0.9, 2.4),
  pu(storm.from + 330, 0.8, 2.6),
  pu(storm.from + 560, -0.5, 2.6),
  pu(storm.from + 700, 0.7, 2.4),
  pu(storm.from + 960, -0.8, 2.6),
  pu(highway.from + 500, 0.9, 1.8),
  pu(town.from + 1060, 0.6, 1.2, true),
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

// The mountain lodge.
add(
  lm('lodge', depart.from + 110, 1, 28),
  lm('flagSpan', 6, 1, 0),
  lm('flagSpan', depart.from + 450, 1, 0),
  lm('house', depart.from + 60, -1, 24),
  lm('house', depart.from + 300, -1, 28, { rotation: 0.2 }),
  lm('chorten', depart.from + 200, 1, 12),
  lm('streetLamp', depart.from + 80, -1, 6.0),
  lm('signpost', depart.from + 20, 1, 5.8),
);
// The forest descent: retaining walls on the hairpins, cliffs, a narrow bridge.
every('retainWall', descent.from + 100, descent.from + DESCENT_LADDER, 100, 4.8, 0, -1);
every('cliff', descent.from + 80, descent.to - 80, 150, 10, 3, 1);
add(
  lm('viewpoint', descent.from + 880, -1, 8),
  lm('trussBridge', BRIDGE_A, 1, 0),
  lm('signpost', BRIDGE_A - 60, -1, 4.6),
  lm('flagSpan', descent.from + 1200, 1, 0),
  lm('chorten', descent.from + 1000, 1, 11),
  lm('house', descent.from + 1240, 1, 20),
);
// The corridor: raw cliffs and scars.
every('cliff', corridor.from + 40, corridor.to - 40, 100, 9, 3, 1, { scale: 1.4 });
add(
  lm('cliff', corridor.from + 230, 1, 9, { scale: 1.9 }),
  lm('cliff', corridor.from + 410, -1, 9, { scale: 1.9 }),
  lm('cliff', corridor.from + 590, 1, 9, { scale: 1.8 }),
  lm('cliff', corridor.from + 950, 1, 9, { scale: 1.8 }),
  lm('tent', corridor.from + 1085, 1, 17),
  lm('house', corridor.from + 1150, -1, 18),
  lm('signpost', corridor.from + 20, 1, 5.0),
);
// The detour: a track through the forest.
every('cliff', detour.from + 80, detour.to - 80, 140, 10, 3, -1, { scale: 1.1 });
every('retainWall', detour.from + 100, detour.from + DETOUR_LADDER, 90, 4.4, 0, 1);
add(lm('tent', detour.from + 1070, 1, 18), lm('house', detour.from + 1125, -1, 16), lm('flagSpan', detour.from + 1180, 1, 0), lm('signpost', detour.from + 20, 1, 5.0));
// The river: depth boards at each ford, a broken bridge, shrines.
add(
  lm('brokenBridge', FORDS[3].centre - 44, 1, 26),
  lm('signpost', FORDS[1].centre - 40, 1, 5.0),
  lm('signpost', FORDS[2].centre - 50, 1, 5.0),
  lm('signpost', FORDS[3].centre - 50, 1, 5.0),
  lm('signpost', FORDS[4].centre - 40, 1, 5.0),
  lm('house', river.from + 1195, 1, 18),
  lm('chorten', river.from + 760, -1, 11),
  lm('flagSpan', river.from + 1100, 1, 0),
);
// The wildlife corridor: ranger station, shrines, fencing.
every('cliff', wildlife.from + 60, wildlife.to - 60, 200, 12, 3, 1);
add(
  lm('trussBridge', BRIDGE_B, 1, 0),
  lm('signpost', BRIDGE_B - 60, -1, 4.6),
  lm('house', wildlife.from + 650, -1, 18),
  lm('stall', wildlife.from + 660, -1, 9),
  lm('chorten', wildlife.from + 380, 1, 11),
  lm('flagSpan', wildlife.from + 500, 1, 0),
  lm('ruin', wildlife.from + 900, 1, 20),
);
// The storm zone: a shelter, flood boards, wet walls.
every('cliff', storm.from + 100, storm.to - 100, 220, 11, 3, -1);
add(
  lm('shelter', storm.from + 440, 1, 13),
  lm('signpost', FORDS[5].centre - 50, 1, 5.0),
  lm('chorten', storm.from + 700, 1, 11),
  lm('flagSpan', storm.from + 300, 1, 0),
);
// The southern highway: wide, flat, signs, a roadside fuel station, distant houses.
every('signpost', highway.from + 200, highway.to - 100, 420, 7.4, 0, 1);
every('house', highway.from + 400, highway.to - 200, 280, 40, 10, -1);
add(
  lm('busShelter', highway.from + 162, 1, 8.0),
  lm('flagSpan', highway.from + 600, 1, 0),
  lm('flagSpan', highway.from + 1700, 1, 0),
  lm('chortenGroup', highway.from + 1400, -1, 34),
  lm('stall', highway.from + 1152, -1, 10),
);
// The town: shops, the hotel, the tourist office, roadworks, lamps.
every('shopRow', town.from + 40, town.to - 40, 130, 16, 4, 1);
add(
  lm('hotel', town.from + 175, 1, 22),
  lm('restaurant', town.from + 420, 1, 18),
  lm('office', town.from + 545, -1, 18),
  lm('policeBooth', town.from + 297, 1, 9),
  lm('clockTower', town.from + 330, -1, 16),
  lm('busShelter', town.from + 650, 1, 9),
  lm('signpost', town.from + 20, 1, 6.0),
  lm('signpost', town.from + 1000, -1, 6.0),
  lm('flagSpan', town.from + 880, 1, 0),
);
for (let m = town.from + 30; m < town.to - 30; m += 55) landmarks.push(lm('streetLamp', m, (Math.floor(m / 55) % 2 ? 1 : -1) as -1 | 1, 6.4));
// The arrival: the hall, the forecourt, gates, flags, lamps, planters, sheltered waiting areas.
add(
  lm('gmcHall', gmc.to - 100, 1, 42),
  lm('plaza', gmc.to - 52, 1, 15),
  lm('gateArch', gmc.from + 70, 1, 0),
  lm('flagSpan', gmc.from + 20, 1, 0),
  lm('flagSpan', gmc.to - 120, 1, 0),
  lm('flagSpan', gmc.to - 30, 1, 0),
  lm('planter', gmc.to - 82, -1, 8.4),
  lm('planter', gmc.to - 50, -1, 8.4),
  lm('planter', gmc.to - 18, -1, 8.4),
  lm('busShelter', gmc.to - 66, -1, 10),
  lm('busShelter', gmc.to - 30, -1, 10),
  lm('chortenGroup', gmc.from + 150, -1, 30),
  lm('signpost', gmc.from + 30, -1, 6.2),
  lm('signpost', gmc.to - 140, -1, 6.6),
  lm('viewpoint', gmc.to - 110, -1, 12),
);
for (let m = gmc.from + 40; m < gmc.to - 10; m += 36) landmarks.push(lm('streetLamp', m, (Math.floor(m / 36) % 2 ? 1 : -1) as -1 | 1, 6.4));

// -------------------------------------------------------------------------------------- roadside life
const roadside: RoadsideDef = {
  walkers: [
    { at: at(depart.from + 110), side: 1, count: 4, span: 12 },
    { at: at(corridor.from + 1100), side: 1, count: 2, span: 12 },
    { at: at(river.from + 1210), side: 1, count: 2, span: 12 },
    { at: at(wildlife.from + 660), side: -1, count: 2, span: 12 },
    { at: at(storm.from + 440), side: 1, count: 2, span: 10 },
    { at: at(highway.from + 170), side: 1, count: 2, span: 12 },
    { at: at(town.from + 120), side: 1, count: 4, span: 24 },
    { at: at(town.from + 440), side: -1, count: 4, span: 26 },
    { at: at(town.from + 900), side: 1, count: 4, span: 24 },
    { at: at(gmc.from + 200), side: 1, count: 6, span: 24 },
  ],
  standing: [
    { at: at(depart.from + 92), side: 1, count: 3 },
    { at: at(depart.from + 264), side: -1, count: 1 },
    { at: at(descent.from + 77), side: -1, count: 1 },
    { at: at(descent.from + 882), side: -1, count: 1 },
    { at: at(corridor.from + 1092), side: 1, count: 2 },
    { at: at(detour.from + 1077), side: 1, count: 2 },
    { at: at(river.from + 1202), side: 1, count: 1 },
    { at: at(wildlife.from + 442), side: 1, count: 2 },
    { at: at(storm.from + 442), side: 1, count: 2 },
    { at: at(highway.from + 162), side: 1, count: 1 },
    { at: at(town.from + 172), side: 1, count: 3 },
    { at: at(town.from + 542), side: -1, count: 1 },
    { at: at(town.from + 792), side: 1, count: 1 },
    { at: at(gmc.to - 56), side: -1, count: 5 },
  ],
  cones: [{ at: at(town.from + 1010), side: 1, length: 66 }],
  police: [{ at: at(town.from + 300), side: 1 }],
  yaks: [
    { at: at(river.from + 40), side: 1, offset: 18 },
    { at: at(wildlife.from + 40), side: -1, offset: 18 },
    { at: at(wildlife.from + 60), side: -1, offset: 24 },
    { at: at(highway.from + 1760), side: 1, offset: 20 },
  ],
  parked: [
    { at: at(depart.from + 72), side: 1, kind: 'minibus' },
    { at: at(depart.from + 150), side: 1, kind: 'taxi' },
    { at: at(corridor.from + 1100), side: 1, kind: 'suv' },
    { at: at(detour.from + 1090), side: 1, kind: 'truck' },
    { at: at(storm.from + 460), side: 1, kind: 'taxi' },
    { at: at(highway.from + 1175), side: 1, kind: 'truck' },
    { at: at(town.from + 190), side: 1, kind: 'bus' },
    { at: at(town.from + 560), side: -1, kind: 'taxi' },
    { at: at(town.from + 640), side: 1, kind: 'delivery' },
    { at: at(gmc.to - 108), side: 1, kind: 'bus' },
    { at: at(gmc.to - 84), side: 1, kind: 'bus' },
    { at: at(gmc.to - 60), side: 1, kind: 'minibus' },
    { at: at(gmc.to - 38), side: 1, kind: 'taxi' },
    { at: at(gmc.to - 120), side: 1, kind: 'suv' },
    { at: at(gmc.to - 138), side: 1, kind: 'suv' },
    { at: at(gmc.to - 14), side: 1, kind: 'taxi' },
  ],
  birds: [
    { at: at(wildlife.from + 600), side: -1, offset: 22, count: 4 },
    { at: at(highway.from + 1000), side: 1, offset: 30, count: 5 },
    { at: at(gmc.to - 100), side: -1, offset: 30, count: 5 },
  ],
  crowd: { at: at(P - 24), side: -1, count: 12, offset: 5, width: 20 },
};

const wp = (from: number, to: number, width: number, shoulder: number): { from: number; to: number; width: number; shoulder: number } => ({ from: whole(from), to: whole(to), width, shoulder });
const widthProfile = [
  wp(-12, depart.from + 150, 8.4, 2.0),
  wp(depart.from + 170, depart.to - 10, 7.2, 0.8),
  wp(descent.from + 10, descent.to - 10, 6.2, 0.5),
  wp(BRIDGE_A - 28, BRIDGE_A + 28, 5.0, 0.3),
  wp(corridor.from + 10, corridor.from + 215, 7.0, 0.6),
  wp(corridor.from + 215, corridor.from + 245, 8.8, 0.8),
  wp(corridor.from + 255, corridor.from + 395, 7.0, 0.6),
  wp(corridor.from + 395, corridor.from + 425, 8.8, 0.8),
  wp(corridor.from + 435, corridor.from + 575, 7.0, 0.6),
  wp(corridor.from + 575, corridor.from + 605, 8.8, 0.8),
  wp(corridor.from + 615, corridor.from + 765, 7.0, 0.6),
  wp(corridor.from + 765, corridor.from + 795, 8.8, 0.8),
  wp(corridor.from + 805, corridor.from + 935, 7.0, 0.6),
  wp(corridor.from + 935, corridor.from + 965, 8.8, 0.8),
  wp(corridor.from + 975, corridor.to - 10, 7.0, 0.6),
  wp(detour.from + 10, detour.to - 10, 5.4, 0.4),
  wp(river.from + 10, river.to - 10, 6.0, 0.5),
  wp(wildlife.from + 10, wildlife.to - 10, 6.2, 0.5),
  wp(BRIDGE_B - 28, BRIDGE_B + 28, 5.0, 0.3),
  wp(storm.from + 10, storm.to - 10, 6.8, 0.6),
  wp(highway.from + 10, highway.to - 10, 10.4, 2.2),
  wp(town.from + 10, town.to - 10, 9.0, 3.0),
  wp(gmc.to - 135, gmc.to + FINISH_OFFSET, 14, 7),
];

const junctions: JunctionDef[] = [
  { at: at(town.from + 300), sides: [-1, 1], arm: 36, width: 8, zebra: true },
  { at: at(town.from + 520), sides: [1], arm: 30, width: 7, zebra: false },
  { at: at(town.from + 860), sides: [-1], arm: 30, width: 7, zebra: false },
  { at: at(town.from + 1070), sides: [1], arm: 30, width: 7, zebra: false },
];

export const gmcPlains: LevelDef = {
  id: 'gmc-plains',
  name: 'GMC Plains Challenge',
  subtitle: 'The long road to Gelephu',
  description:
    'The final assignment: bring a manifest of guests from a southern mountain lodge to the Gelephu Mindfulness City arrival hall, over everything the kingdom can throw at a car: a brake-cooking descent, landslides, mud, four rivers, bears and worse, a monsoon storm, a fast highway and a very busy town. Not everyone waving at the roadside is on the list. Check their ID.',
  objective: 'Collect the manifest guests in order, check the strangers\' IDs, make every drop-off and bring the last guests to the Gelephu arrival hall before the deadline.',
  difficulty: 10,
  region: 'Southern Plains',
  mission: { kind: 'tour', party: 5, finishMode: 'stop', timerStyle: 'deadline', timerLabel: 'Arrival deadline', comfort: true },
  vehicles: ['druk-ranger', 'dragon-cruiser'],
  tip: 'Plan your fuel and your seats. Use 4x4 (F) for the mud and the rivers, brake early on the long descent, take the bridges on green, and press E at a kerbside guest to check their ID against the manifest before they board.',
  conditions: [
    { weather: 'clear', time: 'day', bonus: 1 },
    { weather: 'heavyRain', time: 'day', bonus: 1.4 },
    { weather: 'cloudy', time: 'dusk', bonus: 1.25 },
  ],
  startFuel: 0.55,
  reward: 1500,
  stops,
  hazards,
  traffic: {
    count: 12,
    speed: [8, 13],
    oncoming: 0.4,
    seed: 87,
    turnChance: 0.12,
    slowInFog: true,
    mix: [
      { kind: 'truck', weight: 2.2 },
      { kind: 'bus', weight: 1.4 },
      { kind: 'suv', weight: 1.6 },
      { kind: 'taxi', weight: 1.2 },
      { kind: 'car', weight: 1.2 },
      { kind: 'minibus', weight: 0.9 },
      { kind: 'delivery', weight: 0.8 },
      { kind: 'moto', weight: 0.8 },
      { kind: 'scooter', weight: 0.5 },
      { kind: 'bike', weight: 0.3 },
    ],
    // Traffic is sparse in the mountains, fast and heavy on the highway, thick in the town.
    zones: [
      { from: 0, to: at(wildlife.from), count: 3, scale: 0.8 },
      { from: at(wildlife.from), to: at(highway.from), count: 3, scale: 0.9 },
      { from: at(highway.from), to: at(town.from), count: 12, scale: 1.6 },
      { from: at(town.from), to: at(gmc.from), count: 10, scale: 0.85 },
      { from: at(gmc.from), to: 1, count: 6, scale: 0.6 },
    ],
    controls: [
      { at: at(BRIDGE_A), kind: 'bridge', go: 14, stop: 11, span: 22 },
      { at: at(BRIDGE_B), kind: 'bridge', go: 14, stop: 11, span: 22 },
      { at: at(town.from + 300), kind: 'police', go: 14, stop: 11 },
      { at: at(town.from + 665), kind: 'crossing', peds: 3 },
      { at: at(town.from + 950), kind: 'crossing', peds: 4 },
    ],
    scripted: [
      { at: at(depart.from + 600), kind: 'bus', speed: 6.0 },
      { at: at(descent.from + 300), kind: 'truck', speed: 3.8 },
      { at: at(descent.from + 800), kind: 'truck', speed: 4.2 },
      { at: at(corridor.from + 650), kind: 'truck', speed: 4.6 },
      { at: at(detour.from + 400), kind: 'tractor', speed: 3.2 },
      { at: at(river.from + 520), kind: 'truck', speed: 4.0 },
      { at: at(wildlife.from + 700), kind: 'bus', speed: 5.0 },
      { at: at(storm.from + 350), kind: 'truck', speed: 4.8 },
      { at: at(highway.from + 400), kind: 'truck', speed: 7.0 },
      { at: at(highway.from + 1100), kind: 'bus', speed: 8.0 },
      { at: at(highway.from + 1700), kind: 'truck', speed: 6.5 },
      { at: at(town.from + 200), kind: 'delivery', speed: 4.5 },
      { at: at(town.from + 700), kind: 'taxi', speed: 5.0, hold: 6, trigger: 100 },
    ],
  },
  junctions,
  roadside,
  rivers,
  fords,
  brakeFade: true,
  bigCelebration: true,
  weatherZones: [
    // Clear at the lodge, then cloud, rain, the heavy rain and floods of the middle, the monsoon storm with its fog, easing on the
    // highway, and a clear golden dusk at the arrival hall.
    { from: at(descent.from + 300), to: at(corridor.from), weather: 'cloudy' },
    { from: at(corridor.from), to: at(detour.from + 400), weather: 'rain' },
    { from: at(detour.from + 400), to: at(river.to), weather: 'heavyRain' },
    { from: at(river.to), to: at(storm.from), weather: 'rain' },
    { from: at(storm.from), to: at(storm.from + 500), weather: 'heavyRain' },
    { from: at(storm.from + 500), to: at(storm.from + 900), weather: 'fog' },
    { from: at(storm.from + 900), to: at(storm.to), weather: 'heavyRain' },
    { from: at(storm.to), to: at(highway.from + 700), weather: 'rain' },
    { from: at(highway.from + 700), to: at(gmc.from), weather: 'cloudy' },
    { from: at(gmc.from), to: at(gmc.to), weather: 'clear', time: 'dusk' },
  ],
  celebrate: true,
  celebrateFlags: true,
  optional: [
    { id: 'intact', kind: 'condition', value: 70, reward: 200, label: 'Arrive in one piece' },
    { id: 'smooth', kind: 'comfort', value: 65, reward: 200, label: 'The calmest guests in Bhutan' },
    { id: 'pump', kind: 'useService', reward: 60, label: 'Fuelled on the way' },
  ],
  puddles,
  surfaces,
  shoulder: 'gravel',
  terrain: {
    seed: 87,
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
    { at: at(depart.to - 40), label: 'Down from the lodge' },
    { at: at(descent.from + 700), label: 'The forest descent' },
    { at: at(descent.to - 60), label: 'Over the gorge bridge' },
    { at: at(corridor.from + 300), label: 'The landslide corridor' },
    { at: at(corridor.from + 900), label: 'Past the slides' },
    { at: at(detour.from + 500), label: 'The off-road detour' },
    { at: at(detour.to - 60), label: 'Back on the road' },
    { at: at(river.from + 700), label: 'The flooded crossings' },
    { at: at(river.to - 30), label: 'Across the rivers' },
    { at: at(wildlife.from + 300), label: 'The wildlife corridor' },
    { at: at(wildlife.to - 60), label: 'Past the bridge' },
    { at: at(storm.from + 300), label: 'The monsoon storm' },
    { at: at(storm.to - 60), label: 'Storm exit' },
    { at: at(highway.from + 800), label: 'The southern highway' },
    { at: at(highway.to - 60), label: 'Gelephu ahead' },
    { at: at(town.from + 300), label: 'Gelephu town' },
    { at: at(town.from + 700), label: 'Tourist office' },
    { at: at(town.to - 60), label: 'Roadworks' },
    { at: at(gmc.from + 100), label: 'The arrival hall' },
  ],
  finishLabel: 'GMC arrival hall',
  // Provisional: Stage 6.10B calibrates the deadline and medals by driving the route.
  timeLimit: 1500,
  medals: { gold: 1120, silver: 1230, bronze: 1360 },
  comfortMedals: { gold: 75, silver: 60, bronze: 40 },
  unlock: { levelId: 'remote-expedition', requirement: 'finish' },
  look: {
    skyTop: 0x4f86b8,
    skyMid: 0xa5c6d6,
    skyHorizon: 0xeadfc6,
    fog: 0xcfd0c0,
    mist: 0xdcddd0,
    grassA: 0x6f9a4a,
    grassB: 0x5a8540,
    meadow: 0x95a85a,
    hemi: 2.0,
    sun: 3.0,
    rockFrom: 9999,
    snowFrom: 9999,
    snowTo: 10000,
    meadowFrom: 9999,
    meadowTo: 10000,
    leaf: 0x6aa044,
    treeLine: 900,
    shoulder: 0x8a7e66,
  },
  weather: 'none',
  scenery: {
    seed: 95,
    trees: 1700,
    rocks: 500,
    species: { pine: 0.25, cypress: 0.1, broadleaf: 0.6, shrub: 0.05 },
    landmarks,
  },
  atmosphere: { summitMist: 0.2, mistStart: 0.5, visibility: 1.0 },
};
