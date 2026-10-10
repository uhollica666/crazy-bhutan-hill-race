import { stupaGeometry } from './architecture';
import type { BufferGeometry } from 'three';
import { GeoBuilder } from './geo';
import { PAL } from './palette';

/**
 * Level 5 (Dochula Storm Descent) models: the 108 chortens on the pass, an emergency roadside shelter and the mountain lodge at the
 * bottom of the road. Vertex-coloured and merged into one geometry each. All of them face +Z (toward the road) and sit on the ground.
 */

const STONE = 0xb9b2a2;
const SLATE = 0x5d5a55;
const WHITE = PAL.whitewash;

/** One small chorten (about 1.3 m wide, 2 m tall) added to a builder at (x, y, z). */
function chorten(g: GeoBuilder, x: number, y: number, z: number): void {
  g.add(stupaGeometry(),0xffffff,{x,y,z,sx:0.32,sy:0.32,sz:0.32},true);
}

/** The 108 chortens: six terraced rows (24, 22, 20, 18, 14, 10 = 108) on a stepped stone mound, with the great chorten behind. About 44 x 24 m. */
export function chortenRingGeometry(): BufferGeometry {
  const g = new GeoBuilder();
  const rows = [24, 22, 20, 18, 14, 10];
  const spacing = 1.75;
  rows.forEach((n, r) => {
    const z = 8 - r * 2.9;
    const y = r * 0.75;
    // Terrace wall and grass strip for this row.
    g.box(n * spacing + 2, y + 0.5, 2.6, STONE, { y: (y + 0.5) / 2 - 0.3, z });
    g.box(n * spacing + 1.4, 0.12, 2.2, 0x6f8a45, { y: y + 0.28, z });
    for (let i = 0; i < n; i++) chorten(g, (i - (n - 1) / 2) * spacing, y + 0.3, z);
  });
  // The great chorten at the back: a stepped base, white body with a maroon band, tiered slate roof and a gold finial.
  const y0 = 5 * 0.75 + 0.3;
  const zb = 8 - 5 * 2.9 - 5;
  g.box(8, 0.8, 8, STONE, { y: y0 + 0.4, z: zb });
  g.box(6, 5, 6, WHITE, { y: y0 + 3.3, z: zb });
  g.box(6.3, 0.9, 6.3, PAL.maroon, { y: y0 + 4.2, z: zb });
  g.cone(5.2, 2.0, SLATE, 4, { y: y0 + 6.8, z: zb, ry: Math.PI / 4 });
  g.cone(2.6, 1.6, SLATE, 4, { y: y0 + 8.4, z: zb, ry: Math.PI / 4 });
  g.cone(0.5, 2.0, PAL.gold, 6, { y: y0 + 10.1, z: zb });
  // A low retaining wall and railing along the front.
  g.box(46, 0.9, 0.5, STONE, { y: 0.1, z: 10.2 });
  for (let i = -11; i <= 11; i++) g.box(0.14, 0.9, 0.14, 0xc46a1c, { x: i * 2, y: 1.0, z: 10.3 });
  g.box(46, 0.1, 0.1, 0xc46a1c, { y: 1.35, z: 10.3 });
  return g.build();
}

/** An emergency roadside shelter (about 12 x 7 m): a slate roof on posts over benches, a back wall, a lantern and a blue shelter sign. */
export function shelterGeometry(): BufferGeometry {
  const g = new GeoBuilder();
  g.box(13, 0.4, 8, STONE, { y: 0.2 });
  g.box(12, 3.2, 0.5, WHITE, { y: 2.0, z: -3.4 });
  g.box(12.2, 0.4, 0.7, PAL.maroon, { y: 3.4, z: -3.4 });
  for (const x of [-5.6, -1.9, 1.9, 5.6]) g.box(0.35, 3.3, 0.35, PAL.woodDark, { x, y: 2.0, z: 3.2 });
  // Pitched slate roof with deep eaves.
  for (const sz of [-1, 1]) g.box(13.6, 0.25, 4.6, SLATE, { y: 4.1, z: sz * 2.1, rx: sz * 0.28 });
  g.box(13.6, 0.3, 0.4, 0x4a4743, { y: 4.55 });
  // Benches, a table and a hanging lantern.
  g.box(10, 0.12, 0.8, 0x7a4a2a, { y: 0.7, z: -2.4 });
  g.box(10, 0.5, 0.12, 0x7a4a2a, { y: 0.45, z: -2.8 });
  g.box(3, 0.12, 1.2, 0x7a4a2a, { x: -3, y: 0.85, z: -0.6 });
  g.cylinder(0.18, 0.18, 0.4, 0xffd57a, 6, { x: 3.5, y: 2.9, z: 1.5 });
  g.box(0.05, 0.6, 0.05, 0x2a2a2e, { x: 3.5, y: 3.4, z: 1.5 });
  // Blue shelter sign on a post at the front.
  g.box(0.1, 2.4, 0.1, 0x4a4a50, { x: 7.6, y: 1.2, z: 3.4 });
  g.box(1.4, 1.0, 0.1, 0x2f6fd0, { x: 7.6, y: 2.6, z: 3.4 });
  g.box(0.9, 0.5, 0.12, 0xffffff, { x: 7.6, y: 2.6, z: 3.42 });
  return g.build();
}

/** A mountain lodge (about 30 x 16 m): whitewashed two-storey guesthouse with timber windows, a covered entrance porch, a wing, and a sign. */
export function lodgeGeometry(): BufferGeometry {
  const g = new GeoBuilder();
  g.box(34, 0.8, 18, STONE, { y: 0.1 });
  // Main block and wing.
  g.box(22, 8.2, 11, WHITE, { y: 5.0, z: -2 });
  g.box(22.6, 0.7, 11.6, PAL.maroon, { y: 6.4, z: -2 });
  g.box(11, 7, 10, WHITE, { x: -15, y: 4.4, z: -3 });
  g.box(11.6, 0.6, 10.6, PAL.maroon, { x: -15, y: 5.7, z: -3 });
  // Pitched roofs (corrugated red) over both.
  g.frustum(26, 9, 3.2, 0x9c3a2c, { y: 10.4, z: -2 });
  g.frustum(14, 5, 2.4, 0x9c3a2c, { x: -15, y: 8.6, z: -3 });
  g.box(1.0, 2.2, 1.0, 0x8f8a80, { x: 6, y: 11.6, z: -3 });
  // Windows: two storeys of timber-framed windows, wooden balcony.
  for (let i = -4; i <= 4; i++) {
    if (Math.abs(i) < 1) continue;
    g.box(1.5, 1.7, 0.3, PAL.windowDark, { x: i * 2.3, y: 3.2, z: 3.6 });
    g.box(1.8, 0.28, 0.5, PAL.woodDark, { x: i * 2.3, y: 4.2, z: 3.7 });
    g.box(1.5, 1.7, 0.3, PAL.windowDark, { x: i * 2.3, y: 7.0, z: 3.6 });
  }
  g.box(22, 0.4, 1.4, PAL.woodDark, { y: 5.6, z: 4.2 });
  for (let i = -10; i <= 10; i++) g.box(0.1, 0.9, 0.1, PAL.woodDark, { x: i * 1.05, y: 6.1, z: 4.8 });
  // Covered entrance porch: a gabled roof on four columns, a lit lantern, welcome board.
  g.box(7, 0.4, 5, STONE, { y: 0.4, z: 7 });
  for (const x of [-3.2, 3.2]) for (const z of [4.8, 9.2]) g.box(0.4, 3.6, 0.4, PAL.woodDark, { x, y: 2.4, z });
  for (const sz of [-1, 1]) g.box(8.6, 0.25, 3.2, 0x9c3a2c, { y: 4.7, z: 7 + sz * 1.4, rx: sz * 0.32 });
  g.box(8.6, 0.3, 0.3, 0x6b2b20, { y: 5.2, z: 7 });
  g.cylinder(0.2, 0.2, 0.45, 0xffd57a, 6, { x: 0, y: 3.6, z: 9.0 });
  g.box(2.6, 3.0, 0.3, PAL.woodDark, { x: 0, y: 2.0, z: 4.7 });
  g.box(2.2, 0.8, 0.2, 0xf1e9d6, { x: -9, y: 4.6, z: 4.6 });
  g.box(1.9, 0.5, 0.22, 0x2f5f8f, { x: -9, y: 4.6, z: 4.62 });
  return g.build();
}
