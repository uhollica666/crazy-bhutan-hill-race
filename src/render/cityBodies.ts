import type { BufferGeometry } from 'three';
import { GeoBuilder } from './geo';
import { PAL } from './palette';

/**
 * Bhutan-inspired city buildings and street furniture, merged into one vertex-coloured geometry each so that a whole
 * street of them costs a handful of draw calls. Everything faces +Z (toward the road) and sits on the ground (y = 0).
 * These are original, simplified shapes: whitewashed walls, painted timber windows, shingle and tin roofs.
 */

const GLASS = 0x2b3f58;
const TIMBER = 0x6b3a22;
const OCHRE = 0xe0a63a;
const RED = 0xb8352b;
const GREEN_ROOF = 0x3f7a62;

/** A traditional-style hotel: four floors with rows of painted timber windows, a decorated frieze and a broad green roof. */
export function hotelGeometry(): BufferGeometry {
  const g = new GeoBuilder();
  const w = 16;
  const d = 12;
  g.box(w, 4.2, d, PAL.whitewash, { y: 2.1 });
  for (let f = 0; f < 3; f++) {
    const y = 4.2 + 1.6 + f * 3.2;
    g.box(w + 0.5 - f * 0.1, 3.2, d + 0.5, PAL.whitewash, { y });
    g.box(w + 0.9, 0.35, d + 0.9, f % 2 ? RED : OCHRE, { y: y + 1.55 });
    for (let i = 0; i < 6; i++) {
      const x = -6.4 + i * 2.56;
      g.box(1.9, 1.7, 0.16, TIMBER, { x, y: y + 0.1, z: d / 2 + 0.3 });
      g.box(1.5, 1.3, 0.12, GLASS, { x, y: y + 0.1, z: d / 2 + 0.38 });
      g.box(2.1, 0.18, 0.3, OCHRE, { x, y: y + 1.05, z: d / 2 + 0.4 });
    }
  }
  // Shopfront on the ground floor.
  for (let i = 0; i < 3; i++) g.box(3.6, 2.6, 0.14, GLASS, { x: -5 + i * 5, y: 1.5, z: d / 2 + 0.1 });
  g.box(w + 1, 0.4, 0.8, 0x3a3a3e, { y: 3.4, z: d / 2 + 0.5 });
  g.frustum(w + 4.5, w - 3, 2.6, GREEN_ROOF, { y: 4.2 + 3 * 3.2 + 2.4 });
  g.frustum(d + 4, d - 2.5, 0.5, 0x2c5a48, { y: 4.2 + 3 * 3.2 + 1.2 });
  g.cone(0.5, 1.4, 0xe8b53a, 6, { y: 4.2 + 3 * 3.2 + 4.4 });
  g.box(6, 1.2, 0.2, 0x2f5f8f, { x: 0, y: 4.8, z: d / 2 + 0.7 });
  return g.build();
}

/** A modern mid-rise office block with glazed bands and a small traditional cap on the roof. */
export function officeGeometry(): BufferGeometry {
  const g = new GeoBuilder();
  g.box(13, 17, 9, 0xd8d2c4, { y: 8.5 });
  for (let f = 0; f < 5; f++) {
    g.box(13.2, 1.5, 9.2, GLASS, { y: 2.6 + f * 3.2 });
    g.box(13.4, 0.22, 9.4, 0xb9b2a4, { y: 4.2 + f * 3.2 });
  }
  g.box(13.6, 0.5, 9.6, 0xb9b2a4, { y: 17.2 });
  g.frustum(6.5, 3.6, 1.8, GREEN_ROOF, { x: 3, y: 18.4 });
  g.box(5.2, 1.4, 0.2, 0x2f5f8f, { x: -2.5, y: 15.5, z: 4.7 });
  g.box(4.2, 2.8, 0.2, 0x1a1c22, { x: 0, y: 1.4, z: 4.55 });
  return g.build();
}

/** A restaurant with an upper timber balcony, a red awning and hanging lanterns. */
export function restaurantGeometry(): BufferGeometry {
  const g = new GeoBuilder();
  g.box(11, 3.4, 8, PAL.whitewash, { y: 1.7 });
  g.box(11.4, 3.2, 8.4, 0xf0e4c8, { y: 5.0 });
  g.box(11.8, 0.3, 1.6, TIMBER, { y: 3.5, z: 4.8 });
  for (let i = -5; i <= 5; i++) g.box(0.08, 0.9, 0.08, TIMBER, { x: i * 1.0, y: 4.1, z: 5.5 });
  g.box(11.8, 0.1, 0.1, TIMBER, { y: 4.6, z: 5.5 });
  g.box(10, 1.1, 0.14, 0x2f5f8f, { y: 5.1, z: 4.35 });
  g.box(9, 0.14, 1.6, 0xd6322b, { y: 3.2, z: 4.5, rx: 0.35 });
  g.frustum(14, 7, 2, 0x8c3a2a, { y: 7.6 });
  for (const x of [-3.5, -1.2, 1.2, 3.5]) g.sphere(0.28, 0xd6322b, { x, y: 3.1, z: 5.2 }, 6);
  g.box(3.2, 2.4, 0.14, GLASS, { x: -2.2, y: 1.4, z: 4.1 });
  g.box(1.6, 2.5, 0.14, TIMBER, { x: 3.2, y: 1.3, z: 4.1 });
  return g.build();
}

/** A bus shelter: roof, glazed back, a bench and a blue bus sign. */
export function busShelterGeometry(): BufferGeometry {
  const g = new GeoBuilder();
  g.box(4.4, 0.18, 1.9, 0x2f5f8f, { y: 2.7 });
  for (const x of [-2, 2]) g.cylinder(0.07, 0.07, 2.7, 0x4a4a52, 6, { x, y: 1.35, z: -0.7 });
  g.box(4.2, 2.0, 0.06, 0x9fc4d8, { y: 1.5, z: -0.8 });
  g.box(3.4, 0.14, 0.5, 0x6b4b2c, { y: 0.55, z: -0.4 });
  g.cylinder(0.05, 0.05, 2.8, 0x4a4a52, 5, { x: 3, y: 1.4, z: 0.4 });
  g.box(0.7, 0.7, 0.06, 0x2f6fd0, { x: 3, y: 2.9, z: 0.4 });
  g.box(0.34, 0.2, 0.08, 0xffffff, { x: 3, y: 2.9, z: 0.45 });
  return g.build();
}

/** A traffic-police pavilion in the Thimphu style: painted pedestal, four posts and a green pagoda roof with a golden finial. */
export function policeBoothGeometry(): BufferGeometry {
  const g = new GeoBuilder();
  g.cylinder(2.7, 3.0, 0.3, 0x8f897e, 12, { y: 0.15 });
  g.box(3.4, 1.5, 3.4, 0xe0b53a, { y: 1.05 });
  for (const [x, z, c] of [
    [0, 1.72, RED],
    [0, -1.72, RED],
    [1.72, 0, RED],
    [-1.72, 0, RED],
  ] as [number, number, number][]) g.box(x === 0 ? 2.6 : 0.1, 1.0, z === 0 ? 2.6 : 0.1, c, { x, y: 1.05, z });
  g.box(3.6, 0.2, 3.6, 0xf1efe8, { y: 1.9 });
  for (const sx of [-1.4, 1.4]) for (const sz of [-1.4, 1.4]) g.cylinder(0.11, 0.11, 2.4, RED, 6, { x: sx, y: 3.1, z: sz });
  g.box(4.2, 0.5, 4.2, 0xe8b53a, { y: 4.4 });
  g.frustum(5.6, 2.2, 1.2, GREEN_ROOF, { y: 5.1 });
  g.frustum(3.0, 0.8, 0.9, GREEN_ROOF, { y: 6.1 });
  g.cone(0.3, 0.9, 0xe8b53a, 6, { y: 7.0 });
  return g.build();
}

/** A 16 m run of pedestrian railing (posts and two rails). */
export function railingGeometry(): BufferGeometry {
  const g = new GeoBuilder();
  for (let i = -8; i <= 8; i += 2) g.cylinder(0.05, 0.05, 1.05, 0x3a3a3e, 5, { x: i, y: 0.52 });
  g.box(16, 0.06, 0.06, 0x3a3a3e, { y: 1.02 });
  g.box(16, 0.05, 0.05, 0x3a3a3e, { y: 0.6 });
  for (let i = -7; i <= 7; i += 1) g.box(0.03, 0.4, 0.03, 0x3a3a3e, { x: i, y: 0.8 });
  return g.build();
}

/** A ceremonial city gate over the road (25 m clear span): painted pillars, a decorated beam and two tiers of roof. */
export function gateArchGeometry(): BufferGeometry {
  const g = new GeoBuilder();
  for (const x of [-12, 12]) {
    g.box(2.2, 8, 2.2, RED, { x, y: 4 });
    g.box(2.5, 0.6, 2.5, OCHRE, { x, y: 7.9 });
    g.box(1.2, 5, 0.14, OCHRE, { x, y: 4, z: 1.2 });
  }
  g.box(27, 1.8, 2.0, OCHRE, { y: 8.9 });
  g.box(24, 1.2, 0.14, 0xf1efe8, { y: 8.9, z: 1.05 });
  for (let i = -5; i <= 5; i++) g.box(1.0, 0.8, 0.12, i % 2 ? RED : 0x2f5f8f, { x: i * 2.2, y: 8.9, z: 1.12 });
  g.frustum(31, 24, 1.4, 0xb0412e, { y: 10.4 });
  g.box(24, 0.5, 2.4, 0x2f5f8f, { y: 11.3 });
  g.frustum(24, 8, 2.2, 0xb0412e, { y: 12.6 });
  g.cone(0.6, 1.8, 0xe8b53a, 6, { y: 14.5 });
  return g.build();
}

/**
 * A stylised, respectful seated Buddha on a tiered golden base: an original simplified shape (rounded forms, no facial
 * detail) in the spirit of the great statue above Thimphu. It stands far from the road on a raised platform.
 */
export function buddhaGeometry(): BufferGeometry {
  const g = new GeoBuilder();
  const gold = 0xd9a21e;
  const bronze = 0xb9831c;
  // Terraced stone and gold base.
  g.box(50, 2.2, 46, 0x8f897e, { y: 1.1 });
  g.box(40, 1.0, 36, 0xb9b2a4, { y: 2.7 });
  g.box(34, 6.0, 30, 0xe3b53f, { y: 6.2 });
  g.box(34.6, 0.7, 30.6, 0xb0412e, { y: 9.3 });
  g.box(26, 4.0, 22, 0xe8bd48, { y: 12.0 });
  g.box(26.6, 0.6, 22.6, bronze, { y: 14.3 });
  // A shrine hall in the front of the base, with a pagoda roof.
  g.box(14, 5, 6, 0x7a2a22, { y: 5.2, z: 17 });
  g.box(10, 3.4, 0.2, 0x2f6fd0, { y: 4.4, z: 20.1 });
  g.frustum(18, 9, 1.6, 0x2f5f48, { y: 8.4, z: 17 });
  // Steps up to the plaza.
  for (let i = 0; i < 4; i++) g.box(30 - i * 2, 0.5, 1.4, 0xb9b2a4, { y: 0.4 + i * 0.5, z: 25.5 - i * 1.2 });
  // Lotus seat.
  g.cylinder(11, 12, 2.2, gold, 16, { y: 15.6 });
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    g.cone(1.6, 3.2, bronze, 5, { x: Math.sin(a) * 11.6, y: 15.6, z: Math.cos(a) * 11.6, rx: Math.cos(a) * 1.0, rz: -Math.sin(a) * 1.0 });
  }
  // The figure: folded legs, torso, shoulders, hands in the lap, head, topknot.
  g.sphere(9.5, gold, { y: 19.2, sy: 0.5, sz: 0.85 }, 12);
  g.cylinder(5.4, 6.8, 11, gold, 12, { y: 25.2 });
  g.sphere(6.6, gold, { y: 31.0, sy: 0.55 }, 12);
  g.box(8.5, 1.6, 4.2, bronze, { y: 21.6, z: 5 });
  g.cylinder(1.1, 1.3, 7, gold, 8, { x: -6.1, y: 25.5, z: 1.4, rx: 0.3 });
  g.cylinder(1.1, 1.3, 7, gold, 8, { x: 6.1, y: 25.5, z: 1.4, rx: 0.3 });
  g.box(7, 4.2, 0.4, 0xa86a16, { y: 28.2, z: 5.2, rz: 0.5 });
  g.sphere(3.9, 0xe8c07a, { y: 35.2, z: 0.2 }, 10);
  g.sphere(2.2, 0x1d2f5c, { y: 38.6, z: 0.2, sy: 0.9 }, 8);
  g.cone(0.9, 2.2, gold, 6, { y: 41.0, z: 0.2 });
  // Small golden attendants on the terrace.
  for (const x of [-15, -10, 10, 15]) {
    g.cylinder(0.7, 1.0, 3.4, gold, 7, { x, y: 15.4, z: 8 });
    g.sphere(0.7, gold, { x, y: 17.6, z: 8 }, 6);
  }
  return g.build();
}

/** A planter with shrubs and a pale willow-like tree (urban greenery). */
export function planterGeometry(): BufferGeometry {
  const g = new GeoBuilder();
  g.box(4.4, 0.6, 2.2, 0x8f897e, { y: 0.3 });
  g.box(4.0, 0.15, 1.8, 0x5a4332, { y: 0.65 });
  for (const x of [-1.4, 0, 1.4]) g.sphere(0.65, 0x5b8a3c, { x, y: 1.0, sy: 0.8 }, 6);
  g.cylinder(0.14, 0.2, 3.2, 0x5a4332, 6, { x: 0.4, y: 2.2 });
  g.sphere(1.7, 0x9fbf5a, { x: 0.4, y: 4.4, sy: 0.9 }, 8);
  g.sphere(1.2, 0xb7cf6c, { x: -0.8, y: 3.8 }, 7);
  g.sphere(1.2, 0xb7cf6c, { x: 1.6, y: 3.6 }, 7);
  return g.build();
}
