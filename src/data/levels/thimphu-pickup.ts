import type { LandmarkDef, LevelDef } from '../types';
import { roundedPolyline } from './routes';

/** Street corners of the route (x east, z south). Rounded into smooth 15 m junctions below. */
const STREETS: [number, number][] = [
  [0, 300],
  [0, 140],
  [110, 140],
  [110, 0],
  [-60, 0],
  [-60, -160],
  [70, -160],
  [70, -300],
  [-90, -300],
  [-90, -460],
  [30, -460],
];

/** Shopfronts and street lamps lining each straight, leaving the junctions clear. */
function streetFurniture(): LandmarkDef[] {
  const out: LandmarkDef[] = [];
  for (let i = 0; i < STREETS.length - 1; i++) {
    const [ax, az] = STREETS[i];
    const [bx, bz] = STREETS[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const dx = (bx - ax) / len;
    const dz = (bz - az) / len;
    // Right of travel = (-dz, dx) in (x, z).
    const rx = -dz;
    const rz = dx;
    for (let d = 34; d < len - 34; d += 27) {
      for (const side of [-1, 1] as const) {
        out.push({
          kind: 'shopRow',
          at: 0,
          side,
          offset: 0,
          pos: { x: ax + dx * d + rx * side * 13.5, z: az + dz * d + rz * side * 13.5 },
          scale: 1,
        });
      }
      const side = d % 54 < 27 ? 1 : -1;
      out.push({
        kind: 'streetLamp',
        at: 0,
        side,
        offset: 0,
        pos: { x: ax + dx * (d + 13) + rx * side * 6.6, z: az + dz * (d + 13) + rz * side * 6.6 },
      });
    }
  }
  return out;
}

/**
 * A compact urban mission: three tourists scattered across town, tight junctions, local traffic, a broken-down
 * lorry, and a drop-off in the clock-tower square. Navigation and patience beat raw speed.
 */
export const thimphuPickup: LevelDef = {
  id: 'thimphu-pickup',
  name: 'Thimphu Town Pickup',
  subtitle: 'Three tourists, one very confused tour guide',
  description:
    'Your guide has lost his group across town. Collect three solo travellers (a backpacker, a shopper and an archery fan) and deliver them all to Clock Tower Square before dinner.',
  objective: 'Pick up all three tourists, then pull up in Clock Tower Square.',
  difficulty: 3,
  region: 'Paro & Thimphu',
  mission: {
    kind: 'city',
    party: 3,
    finishMode: 'stop',
    timerStyle: 'elapsed',
    timerLabel: 'Time',
    comfort: true,
  },
  vehicles: ['dzo-hatch', 'tourist-coaster', 'druk-ranger', 'dragon-cruiser'],
  tip: 'Pull right up to each tourist and stop. Traffic is slow but busy: brake early, and give the broken-down lorry a wide berth.',
  conditions: [
    { weather: 'clear', time: 'day', bonus: 1 },
    { weather: 'rain', time: 'dusk', bonus: 1.3 },
    { weather: 'clear', time: 'night', bonus: 1.4 },
  ],
  startFuel: 0.75,
  reward: 300,
  stops: [
    { id: 'cafe', kind: 'pickup', at: 0.08, label: 'Yeti Beans Cafe', side: 1, party: 1, optional: false, who: 'backpacker' },
    { id: 'market', kind: 'pickup', at: 0.36, label: 'Craft Market gate', side: -1, party: 1, optional: false, who: 'shopper' },
    { id: 'archery', kind: 'pickup', at: 0.64, label: 'Archery ground', side: 1, party: 1, optional: false, who: 'archery-fan' },
    {
      id: 'town-fuel',
      kind: 'service',
      at: 0.5,
      label: 'Town fuel station',
      side: -1,
      services: ['refuel', 'repair'],
      optional: true,
    },
  ],
  hazards: [{ id: 'lorry', kind: 'brokenTruck', at: 0.78, seed: 3, label: 'Broken-down lorry' }],
  traffic: { count: 8, speed: [6.5, 10], oncoming: 0.45, seed: 11 },
  optional: [
    { id: 'smooth', kind: 'comfort', value: 80, reward: 60, label: 'Gentle with the tourists' },
    { id: 'clean', kind: 'condition', value: 90, reward: 50, label: 'No dents in town' },
    { id: 'fuel', kind: 'useService', reward: 25, label: 'Topped up at the town pump' },
  ],
  terrain: {
    seed: 3,
    bounds: { minX: -280, maxX: 340, minZ: -660, maxZ: 440 },
    cell: 5,
    slope: 0.012,
    hillHeight: 3,
    detailHeight: 0.8,
    valleyZ: 9999,
    valleyDepth: 0,
    waterLevel: -999,
  },
  road: {
    width: 9,
    shoulder: 0.9,
    startOffset: 30,
    finishOffset: 32,
    points: roundedPolyline(STREETS, 15),
  },
  checkpoints: [
    { at: 0.24, label: 'Weaver Street' },
    { at: 0.5, label: 'Prayer-flag Plaza' },
    { at: 0.82, label: 'Butter Lamp Lane' },
  ],
  finishLabel: 'Clock Tower Square',
  timeLimit: 190,
  medals: { gold: 118, silver: 142, bronze: 170 },
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
    treeLine: 200,
  },
  weather: 'none',
  scenery: {
    seed: 71,
    trees: 120,
    rocks: 0,
    species: { pine: 0.1, cypress: 0.2, broadleaf: 0.7, shrub: 0 },
    landmarks: [
      ...streetFurniture(),
      { kind: 'clockTower', at: 0, side: 1, offset: 0, pos: { x: 12, z: -490 }, scale: 1 },
      { kind: 'chortenGroup', at: 0, side: 1, offset: 0, pos: { x: 140, z: 60 }, scale: 0.9 },
      { kind: 'prayerWheelHouse', at: 0, side: 1, offset: 0, pos: { x: 135, z: -60 } },
      { kind: 'flagSpan', at: 0.02, side: 1, offset: 0 },
      { kind: 'flagSpan', at: 0.52, side: 1, offset: 0 },
      { kind: 'station', at: 0.5, side: -1, offset: 14 },
    ],
  },
  atmosphere: { summitMist: 0, mistStart: 0.5, visibility: 1.1 },
};
