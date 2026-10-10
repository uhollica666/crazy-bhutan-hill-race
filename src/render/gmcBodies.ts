import type { BufferGeometry } from 'three';
import { GeoBuilder } from './geo';
import { PAL } from './palette';

/**
 * Level 10 (GMC Plains) models: the Gelephu Mindfulness City-inspired arrival hall. Modern Bhutanese architecture: whitewashed walls,
 * a long timber-lattice facade, a folded green roof, a central tower with deep eaves and a gilded finial, a glazed entrance under a
 * great canopy, flag masts and a reflecting pool. About 70 x 36 m, faces +Z (toward the road), sits on the ground.
 */

const WHITE = PAL.whitewash;
const TIMBER = 0x8a4b2a;
const GLASS = 0x2b3f58;
const ROOF = 0x3f6d4a;
const STONE = 0xb9b2a2;

export function gmcHallGeometry(): BufferGeometry {
  const g = new GeoBuilder();
  // Stone plinth and forecourt steps.
  g.box(74, 0.9, 40, STONE, { y: 0.15 });
  for (let i = 0; i < 4; i++) g.box(26, 0.3, 2.2, 0xcfc8b8, { y: 0.7 - i * 0.18, z: 21.5 + i * 1.8 });
  // The main hall: a long whitewashed block with a lattice facade and a glazed bay.
  g.box(60, 10, 22, WHITE, { y: 5.9, z: -2 });
  g.box(60.6, 1.0, 22.6, TIMBER, { y: 11.2, z: -2 });
  for (let i = -28; i <= 28; i++) {
    if (Math.abs(i) < 7) continue;
    g.box(0.35, 7.4, 0.4, TIMBER, { x: i * 1.0, y: 5.4, z: 9.2 });
  }
  g.box(58, 0.4, 0.5, TIMBER, { y: 9.4, z: 9.3 });
  g.box(58, 0.4, 0.5, TIMBER, { y: 2.4, z: 9.3 });
  g.box(14, 8, 0.4, GLASS, { y: 5.2, z: 9.3 });
  for (let i = -3; i <= 3; i++) g.box(0.2, 8, 0.5, TIMBER, { x: i * 2.0, y: 5.2, z: 9.4 });
  // A folded green roof: three long overlapping slopes.
  for (let i = 0; i < 3; i++) {
    g.box(62, 0.5, 9, ROOF, { y: 12.4 + i * 1.5, z: 4 - i * 6, rx: 0.16 });
    g.box(62.4, 0.25, 0.7, 0x2c4a33, { y: 11.9 + i * 1.5, z: 8.4 - i * 6 });
  }
  // The central tower: tiered eaves in the manner of a dzong, a gilded roof and finial.
  g.box(12, 9, 12, WHITE, { y: 17.2, z: -1 });
  g.box(12.8, 1.0, 12.8, PAL.maroon, { y: 22.2, z: -1 });
  g.box(17, 0.7, 17, PAL.roofRed, { y: 23.1, z: -1 });
  g.box(9, 5, 9, WHITE, { y: 26, z: -1 });
  g.box(9.6, 0.8, 9.6, PAL.maroon, { y: 28.6, z: -1 });
  g.frustum(13, 5, 2.8, PAL.gold, { y: 30.4, z: -1 });
  g.frustum(6, 2, 2, PAL.gold, { y: 32.6, z: -1 });
  g.sphere(0.5, PAL.gold, { y: 34, z: -1 }, 6);
  for (let i = -3; i <= 3; i++) g.box(1.0, 1.8, 0.3, PAL.windowDark, { x: i * 1.6, y: 17.4, z: 5.1 });
  // The entrance canopy on slender columns.
  g.box(20, 0.6, 9, ROOF, { y: 8.6, z: 15 });
  g.box(20.6, 0.3, 9.6, TIMBER, { y: 8.1, z: 15 });
  for (const x of [-9, -3, 3, 9]) g.box(0.5, 8.2, 0.5, TIMBER, { x, y: 4.4, z: 19 });
  // Flag masts with banners, and a reflecting pool in front.
  for (const x of [-30, 30]) {
    g.cylinder(0.14, 0.2, 14, 0xf1efe8, 6, { x, y: 7.5, z: 22 });
    for (let i = 0; i < 4; i++) g.box(1.2, 0.7, 0.05, [PAL.flagBlue, PAL.flagWhite, PAL.flagRed, PAL.flagYellow][i], { x: x + 0.7, y: 13 - i * 0.75, z: 22 });
  }
  g.box(24, 0.2, 5, 0x6aa8c4, { y: 0.5, z: 28 });
  g.box(24.6, 0.35, 0.3, STONE, { y: 0.6, z: 25.4 });
  g.box(24.6, 0.35, 0.3, STONE, { y: 0.6, z: 30.6 });
  // Landscaped planters either side.
  for (const x of [-18, 18]) {
    g.box(6, 0.8, 3, STONE, { x, y: 0.9, z: 26 });
    g.sphere(1.4, 0x4f7a34, { x: x - 1.5, y: 1.9, z: 26 }, 6);
    g.sphere(1.2, 0x5f8a3e, { x: x + 1.4, y: 1.8, z: 26.2 }, 6);
  }
  return g.build();
}
