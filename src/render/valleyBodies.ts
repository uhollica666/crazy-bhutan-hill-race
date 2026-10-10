import type { BufferGeometry } from 'three';
import { GeoBuilder } from './geo';
import { PAL } from './palette';

/**
 * Level 4 (Punakha Valley) models: the farm tractor, rice terraces, bridges and the dzong. Vertex-coloured and merged, so each is one
 * draw call however many are placed. "White" parts of vehicles are tinted per instance. Models sit on the ground (y = 0).
 */

const TYRE = 0x1c1c1f;
const W = 0xffffff;
const STONE = 0x948b78;
const SLATE = 0x5a554d;

/** A small farm tractor towing a hay trailer. Faces -Z. */
export function tractorGeometry(): BufferGeometry {
  const g = new GeoBuilder();
  // Tractor: engine hood, seat frame, big rear and small front wheels.
  g.box(1.1, 0.9, 1.5, W, { y: 0.95, z: -1.25 });
  g.box(1.3, 0.8, 0.9, W, { y: 1.05, z: -0.1 });
  g.box(1.4, 0.07, 1.1, 0x3a3a40, { y: 2.25, z: -0.1 });
  for (const sx of [-1, 1]) {
    g.box(0.07, 1.2, 0.07, 0x3a3a40, { x: sx * 0.62, y: 1.65, z: -0.5 });
    g.box(0.07, 1.2, 0.07, 0x3a3a40, { x: sx * 0.62, y: 1.65, z: 0.3 });
    g.cylinder(0.78, 0.78, 0.4, TYRE, 10, { x: sx * 0.85, y: 0.78, z: -0.1, rz: Math.PI / 2 });
    g.cylinder(0.4, 0.4, 0.25, TYRE, 8, { x: sx * 0.5, y: 0.4, z: -1.65, rz: Math.PI / 2 });
  }
  g.cylinder(0.06, 0.06, 0.9, 0x2a2a2e, 5, { x: 0.35, y: 1.9, z: -1.7 });
  g.box(1.0, 0.1, 0.08, 0xfff1b8, { y: 1.05, z: -2.02 });
  // Trailer with a load of hay.
  g.box(0.08, 0.1, 0.8, 0x2a2a2e, { y: 0.55, z: 0.75 });
  g.box(1.9, 0.12, 2.2, 0x7a4a2a, { y: 0.78, z: 1.45 });
  for (const sx of [-0.93, 0.93]) g.box(0.08, 0.5, 2.2, 0x7a4a2a, { x: sx, y: 1.05, z: 1.45 });
  g.box(1.8, 0.7, 2.0, 0xc9b25a, { y: 1.2, z: 1.45 });
  for (const sx of [-1, 1]) g.cylinder(0.45, 0.45, 0.25, TYRE, 8, { x: sx * 0.95, y: 0.45, z: 1.7, rz: Math.PI / 2 });
  return g.build();
}

/** Rice terraces stepping up from the road (faces +Z toward it): five tiers of bright paddy with stone lips and an irrigation channel. */
export function paddyGeometry(): BufferGeometry {
  const g = new GeoBuilder();
  const greens = [0x86c23d, 0x9bc93f, 0xb7c93f, 0x74b43a, 0xc4c540];
  for (let t = 0; t < 5; t++) {
    const w = 30 - t * 2.2;
    const z = -t * 6.4;
    const y = t * 1.15;
    g.box(w, 0.5, 6.4, greens[t % greens.length], { y: y + 0.1, z, x: (t % 2 ? 1.2 : -1.0) });
    // Furrows across the paddy.
    for (let i = -3; i <= 3; i++) g.box(0.12, 0.06, 6, 0x5f9a2e, { x: i * (w / 7.5) + (t % 2 ? 1.2 : -1.0), y: y + 0.4, z });
    // Stone retaining lip along the front of every tier.
    g.box(w + 0.6, 1.2, 0.7, STONE, { y: y - 0.3, z: z + 3.2, x: (t % 2 ? 1.2 : -1.0) });
  }
  // Irrigation channel at the foot: a thin ribbon of water between low stone edges.
  g.box(30, 0.2, 0.55, 0xa9d4e4, { y: -0.55, z: 4.0 });
  g.box(30, 0.5, 0.2, STONE, { y: -0.45, z: 3.6 });
  g.box(30, 0.5, 0.2, STONE, { y: -0.45, z: 4.4 });
  // A couple of farm huts on the top terrace.
  g.box(3, 2.2, 2.6, PAL.whitewash, { x: -8, y: 5.5, z: -26 });
  g.box(3.6, 0.5, 3.2, PAL.roofRed, { x: -8, y: 6.9, z: -26 });
  return g.build();
}

/** A pedestrian suspension footbridge (about 52 m, long axis X): stone towers, sagging cables, a plank deck, prayer flags. Not drivable. */
export function footbridgeGeometry(): BufferGeometry {
  const g = new GeoBuilder();
  const L = 26;
  g.box(2 * L, 0.18, 1.7, 0x8a5a34, { y: 0.0 });
  for (const sx of [-1, 1]) {
    for (const sz of [-0.9, 0.9]) g.box(0.5, 8, 0.5, 0xd9d2c0, { x: sx * L, y: 4, z: sz });
    g.box(0.6, 0.6, 2.4, 0xd9d2c0, { x: sx * L, y: 8.2 });
    g.box(2.4, 1.0, 2.4, STONE, { x: sx * (L + 1.6), y: 0.0 });
  }
  // Cables sag from the tower tops to just above the deck in the middle; hangers drop to the deck edge.
  const segs = 16;
  for (const sz of [-0.9, 0.9]) {
    for (let i = 0; i < segs; i++) {
      const t0 = -1 + (2 * i) / segs;
      const t1 = -1 + (2 * (i + 1)) / segs;
      const y0 = 1.1 + 7 * t0 * t0;
      const y1 = 1.1 + 7 * t1 * t1;
      const len = Math.hypot((t1 - t0) * L, y1 - y0);
      g.box(len, 0.08, 0.08, 0x3a3a40, { x: ((t0 + t1) / 2) * L, y: (y0 + y1) / 2, z: sz, rz: Math.atan2(y1 - y0, (t1 - t0) * L) });
    }
    for (let i = -11; i <= 11; i++) {
      const t = i / 12;
      const y = 1.1 + 7 * t * t;
      g.box(0.04, y, 0.04, 0x3a3a40, { x: t * L, y: y / 2, z: sz });
    }
  }
  const flag = [PAL.flagBlue, PAL.flagWhite, PAL.flagRed, PAL.flagGreen, PAL.flagYellow];
  for (let i = -10; i <= 10; i++) {
    const t = i / 12;
    g.box(0.45, 0.4, 0.04, flag[(i + 10) % 5], { x: t * L, y: 1.1 + 7 * t * t - 0.3, z: 0 });
  }
  return g.build();
}

/** A narrow steel-truss road bridge (40 m, the road runs along local X): painted trusses, abutments, a plank-edged deck. */
export function trussBridgeGeometry(): BufferGeometry {
  const g = new GeoBuilder();
  const z = 3.55;
  for (const sz of [-z, z]) {
    g.box(40, 0.3, 0.34, 0x3d7a8a, { y: 2.6, z: sz });
    g.box(40, 0.3, 0.34, 0x3d7a8a, { y: 0.2, z: sz });
    for (let i = -9; i <= 9; i++) {
      g.box(0.18, 2.4, 0.2, 0x3d7a8a, { x: i * 2, y: 1.4, z: sz });
      if (i < 9) g.box(2.9, 0.14, 0.16, 0x4a8b9b, { x: i * 2 + 1, y: 1.4, z: sz, rz: (i % 2 ? 1 : -1) * 0.78 });
    }
    // Red end posts.
    for (const sx of [-19.6, 19.6]) g.box(0.4, 3.0, 0.4, 0xc23a2c, { x: sx, y: 1.5, z: sz });
    g.box(40, 0.5, 0.5, 0x6c6a66, { y: -0.35, z: sz * 0.9 });
  }
  g.box(40, 0.4, 7.4, 0x4a4745, { y: -0.45 });
  for (const sx of [-1, 1]) {
    g.box(3.2, 6, 8.6, STONE, { x: sx * 21.6, y: -2.4 });
    g.box(3.4, 0.35, 8.8, 0xb9b2a2, { x: sx * 21.6, y: 0.5 });
  }
  // Warning boards at each end: "narrow bridge".
  for (const sx of [-1, 1]) {
    g.box(0.1, 1.0, 1.0, 0xe8b53a, { x: sx * 18.5, y: 3.7, z: -z });
    g.box(0.1, 0.5, 0.6, 0x2a2a2e, { x: sx * 18.5, y: 3.7, z: -z });
  }
  return g.build();
}

/** A traditional covered wooden bridge (36 m, long axis X): slate gallery roof, whitewashed gate towers, prayer flags. Pedestrians only. */
export function coveredBridgeGeometry(): BufferGeometry {
  const g = new GeoBuilder();
  g.box(34, 0.5, 3.8, 0x6b4426, { y: 0.0 });
  for (let i = -8; i <= 8; i++) for (const sz of [-1.8, 1.8]) g.box(0.2, 2.4, 0.2, 0x7a4a2a, { x: i * 2, y: 1.4, z: sz });
  for (const sz of [-1.8, 1.8]) {
    g.box(34, 0.16, 0.2, 0x7a4a2a, { y: 1.1, z: sz });
    g.box(34, 0.16, 0.2, 0x7a4a2a, { y: 2.5, z: sz });
    for (let i = -16; i <= 16; i++) g.box(0.06, 1.3, 0.06, 0x8a5a34, { x: i * 1.0, y: 1.8, z: sz });
  }
  // Pitched slate roofs in two tiers.
  for (const sz of [-1, 1]) {
    g.box(34, 0.22, 2.7, SLATE, { y: 3.3, z: sz * 1.3, rx: sz * 0.3 });
    g.box(34, 0.22, 2.4, 0x6a655b, { y: 3.95, z: sz * 0.9, rx: sz * 0.3 });
  }
  g.box(34, 0.3, 0.3, 0x4a2f1a, { y: 4.2 });
  for (const sx of [-1, 1]) {
    g.box(5, 6.4, 5, PAL.whitewash, { x: sx * 18.5, y: 3.0 });
    g.box(5.1, 0.7, 5.1, PAL.maroon, { x: sx * 18.5, y: 5.6 });
    g.box(6.4, 0.5, 6.4, SLATE, { x: sx * 18.5, y: 6.6 });
    g.frustum(5, 1, 1.6, SLATE, { x: sx * 18.5, y: 7.4 });
    g.box(1.4, 2.4, 0.2, PAL.woodDark, { x: sx * 18.5, y: 1.4, z: 2.55 });
    g.box(0.8, 1.0, 0.2, PAL.windowDark, { x: sx * 18.5, y: 4.2, z: 2.55 });
    g.box(3.4, 5, 5, STONE, { x: sx * 12, y: -2.5 });
  }
  const flag = [PAL.flagBlue, PAL.flagWhite, PAL.flagRed, PAL.flagGreen, PAL.flagYellow];
  for (let i = -15; i <= 15; i++) g.box(0.4, 0.45, 0.04, flag[(i + 15) % 5], { x: i * 1.1, y: 3.0 - Math.abs(i) * 0.005, z: 0 });
  return g.build();
}

/**
 * A Punakha-Dzong-inspired fortress (faces +Z, about 78 m long): a whitewashed stone-and-timber block on a stone plinth, tiered red roofs,
 * a tall central utse tower with gilded roofs, flanking towers, lattice windows and a great gate. Decorative: the courtyard is not drivable.
 */
export function dzongComplexGeometry(): BufferGeometry {
  const g = new GeoBuilder();
  const WALL = PAL.whitewash;
  const BAND = PAL.maroon;
  // Plinth and the long retaining wall down to the water.
  g.box(86, 5, 46, STONE, { y: -1.2 });
  g.box(88, 1.2, 48, 0xa89e88, { y: 1.5 });
  // Main block and tiered roofs.
  g.box(72, 15, 34, WALL, { y: 10.2 });
  g.box(72.8, 2.2, 34.8, BAND, { y: 18.4 });
  g.box(74, 1.0, 36, PAL.roofRed, { y: 19.9 });
  g.box(54, 9, 24, WALL, { y: 24.9 });
  g.box(54.8, 1.8, 24.8, BAND, { y: 30.2 });
  g.box(56, 1.0, 26, PAL.roofRed, { y: 31.6 });
  // Central utse tower with gilded roofs.
  g.box(16, 18, 16, WALL, { y: 41.0 });
  g.box(16.6, 2.0, 16.6, BAND, { y: 48.8 });
  g.box(20, 1.0, 20, PAL.roofRed, { y: 50.1 });
  g.frustum(24, 11, 3.2, PAL.gold, { y: 52.2 });
  g.frustum(13, 4, 2.6, PAL.gold, { y: 55.1 });
  g.cone(1.1, 3, PAL.gold, 6, { y: 58.3 });
  // Flanking and corner towers (the left and right ends carry gilded roofs).
  for (const sx of [-1, 1]) {
    g.box(14, 24, 14, WALL, { x: sx * 31, y: 14.2, z: 3 });
    g.box(14.6, 2.0, 14.6, BAND, { x: sx * 31, y: 24.8, z: 3 });
    g.box(18, 1.0, 18, PAL.roofRed, { x: sx * 31, y: 26.3, z: 3 });
    g.frustum(20, 8, 2.8, PAL.gold, { x: sx * 31, y: 28.2, z: 3 });
    g.sphere(0.9, PAL.gold, { x: sx * 31, y: 30.4, z: 3 }, 6);
    g.box(10, 17, 10, WALL, { x: sx * 18, y: 11.7, z: -2 });
    g.box(10.6, 1.4, 10.6, BAND, { x: sx * 18, y: 20.6, z: -2 });
    g.frustum(13, 5, 2.2, PAL.gold, { x: sx * 18, y: 22.4, z: -2 });
  }
  // Wooden balconies and lattice windows across the front (+Z).
  g.box(72.6, 0.6, 1.2, PAL.woodDark, { y: 11.4, z: 17.4 });
  g.box(72.6, 0.6, 1.2, PAL.woodDark, { y: 6.2, z: 17.4 });
  for (let i = -16; i <= 16; i++) {
    if (Math.abs(i) < 3) continue;
    g.box(1.3, 2.4, 0.3, PAL.windowDark, { x: i * 2.1, y: 8.6, z: 17.2 });
    g.box(1.5, 0.3, 0.45, PAL.woodDark, { x: i * 2.1, y: 9.9, z: 17.3 });
    g.box(1.3, 2.4, 0.3, PAL.windowDark, { x: i * 2.1, y: 13.5, z: 17.2 });
    g.box(1.5, 0.3, 0.45, 0xb04a22, { x: i * 2.1, y: 14.8, z: 17.3 });
  }
  for (let i = -10; i <= 10; i++) g.box(1.1, 1.8, 0.3, PAL.windowDark, { x: i * 2.5, y: 25.4, z: 12.2 });
  // The great gate.
  g.box(10, 9, 2.4, BAND, { y: 5.6, z: 17.6 });
  g.box(5.4, 6.8, 2.6, PAL.woodDark, { y: 4.4, z: 17.8 });
  g.box(12, 1.2, 4.4, PAL.roofRed, { y: 10.8, z: 17.8 });
  // Stone steps down to the forecourt.
  for (let i = 0; i < 4; i++) g.box(14, 0.5, 2, 0xb9b2a2, { y: 1.6 - i * 0.5 + 0.9, z: 24 + i * 1.6 });
  return g.build();
}

/** A riverside picnic spot: a thatched-roof shelter, three tables with benches and a bin. About 14 x 10 m. */
export function picnicGeometry(): BufferGeometry {
  const g = new GeoBuilder();
  g.box(14, 0.15, 10, 0x9aa86a, { y: 0.05 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.box(0.25, 3.4, 0.25, 0x6b4426, { x: -3.5 + sx * 2.4, y: 1.7, z: sz * 2.0 });
  g.cone(4.6, 2.2, 0xc9a85a, 4, { x: -3.5, y: 4.5, ry: Math.PI / 4 });
  g.box(4.4, 0.1, 3, 0x6b4426, { x: -3.5, y: 0.9 });
  for (const [x, z] of [[3, -2.5], [3.5, 1.2], [-0.5, 3.4]] as [number, number][]) {
    g.box(2.2, 0.1, 1.0, 0x8a5a34, { x, y: 0.9, z });
    for (const sz of [-0.9, 0.9]) g.box(2.2, 0.08, 0.35, 0x7a4a2a, { x, y: 0.5, z: z + sz });
    for (const sx of [-0.9, 0.9]) g.box(0.1, 0.9, 0.1, 0x6b4426, { x: x + sx, y: 0.45, z });
  }
  g.cylinder(0.3, 0.26, 0.8, 0x2f6f4a, 8, { x: 5.8, y: 0.45, z: 3.6 });
  return g.build();
}
