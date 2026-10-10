import type { BufferGeometry } from 'three';
import { GeoBuilder } from './geo';
import { PAL } from './palette';

/**
 * Level 9 (Remote Expedition) models: a collapsed steel bridge beside a ford, an expedition tent, and the whole expedition camp.
 * Vertex-coloured and merged, one geometry each. The bridge runs along local X (like the other bridges); the tent and the camp face +Z
 * (toward the road) and sit on the ground.
 */

const STONE = 0x948b78;
const TEAL = 0x3d7a8a;

/** An old truss bridge (36 m, long axis X) that has collapsed in the middle: two stubs, a twisted span in the water, a striped barrier. */
export function brokenBridgeGeometry(): BufferGeometry {
  const g = new GeoBuilder();
  const z = 3.4;
  for (const sz of [-z, z]) {
    // The left stub: still a truss, ending in torn steel.
    g.box(12, 0.3, 0.34, TEAL, { x: -12, y: 2.6, z: sz });
    g.box(12, 0.3, 0.34, TEAL, { x: -12, y: 0.2, z: sz });
    for (let i = -17; i <= -7; i += 2) g.box(0.18, 2.4, 0.2, TEAL, { x: i, y: 1.4, z: sz });
    // The right stub: shorter, bent down toward the water.
    g.box(6, 0.3, 0.34, TEAL, { x: 14.5, y: 2.2, z: sz, rz: -0.18 });
    g.box(6, 0.3, 0.34, TEAL, { x: 14.5, y: -0.1, z: sz, rz: -0.18 });
    // The fallen span: a twisted frame leaning in the river.
    g.box(9, 0.3, 0.34, 0x56707a, { x: 1.5, y: -2.4, z: sz * 0.9, rz: 0.5, rx: sz * 0.05 });
    g.box(9, 0.3, 0.34, 0x56707a, { x: 1.5, y: -4.4, z: sz * 0.9, rz: 0.5 });
  }
  g.box(12, 0.4, 7.4, 0x4a4745, { x: -12, y: -0.45 });
  g.box(6, 0.4, 7.4, 0x4a4745, { x: 14.5, y: -0.55, rz: -0.18 });
  g.box(8, 0.35, 7.2, 0x4a4745, { x: 2, y: -3.6, rz: 0.55, rx: 0.12 });
  for (const sx of [-1, 1]) g.box(3.2, 6, 8.6, STONE, { x: sx * 17.6, y: -2.4 });
  // A red-and-white barrier across the broken end, and a "bridge closed" board.
  for (let i = 0; i < 6; i++) g.box(1.2, 0.35, 0.14, i % 2 ? 0xf1efe8 : 0xd6322b, { x: -5.4, y: 0.6 + (i % 2) * 0.01, z: -3 + i * 1.2 });
  g.box(0.14, 1.3, 0.14, 0x4a4a50, { x: -5.4, y: 0.65, z: -3.2 });
  g.box(0.14, 1.3, 0.14, 0x4a4a50, { x: -5.4, y: 0.65, z: 3.2 });
  g.box(0.1, 1.1, 2.4, 0xe8b53a, { x: -6.4, y: 2.2, z: 0 });
  g.box(0.12, 0.5, 1.6, 0x2a2a2e, { x: -6.45, y: 2.2, z: 0 });
  return g.build();
}

/** A ridge tent (about 3 x 2.4 m, faces +Z): a coloured fly with a dark door, guy ropes, a small porch. */
export function tentGeometry(): BufferGeometry {
  const g = new GeoBuilder();
  g.box(3.4, 0.06, 2.8, 0x5a5448, { y: 0.03 });
  for (const sx of [-1, 1]) g.box(1.9, 0.07, 2.7, 0xe8761a, { x: sx * 0.78, y: 0.95, rz: -sx * 0.9 });
  g.box(0.12, 0.12, 2.8, 0x6b2f10, { y: 1.5 });
  g.box(0.9, 1.0, 0.06, 0x1d1a16, { y: 0.55, z: 1.38 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.box(0.03, 0.03, 1.6, 0xf1efe8, { x: sx * 2.0, y: 0.35, z: sz * 1.4, ry: sx * sz * 0.5, rz: sx * 0.3 });
  return g.build();
}

/** The expedition camp (about 30 x 22 m, faces +Z): tents in a ring, a glowing campfire, crates, a generator, a flagpole, lamp posts, an antenna. */
export function campsiteGeometry(): BufferGeometry {
  const g = new GeoBuilder();
  g.box(30, 0.08, 22, 0x6b6450, { y: 0.02 });
  // Tents in an arc behind the fire.
  const colours = [0xe8761a, 0x2f6fd0, 0x2e9c4f, 0xd6322b, 0xe8b53a];
  for (let i = 0; i < 5; i++) {
    const x = -11 + i * 5.5;
    const z = -6 - Math.abs(i - 2) * 1.2;
    g.box(3.0, 0.06, 2.6, 0x5a5448, { x, y: 0.05, z });
    for (const sx of [-1, 1]) g.box(1.75, 0.07, 2.5, colours[i], { x: x + sx * 0.72, y: 0.9, z, rz: -sx * 0.9 });
    g.box(0.1, 0.1, 2.6, 0x2a2a2e, { x, y: 1.4, z });
    g.box(0.8, 0.95, 0.06, 0x1d1a16, { x, y: 0.5, z: z + 1.28 });
  }
  // The campfire: a ring of stones, orange flames, a few logs.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    g.rock(0x8a867c, { x: Math.cos(a) * 1.0, y: 0.2, z: 2 + Math.sin(a) * 1.0, sx: 0.4, sy: 0.3, sz: 0.4 });
  }
  g.cone(0.55, 1.5, 0xff8a1a, 6, { y: 0.9, z: 2 });
  g.cone(0.3, 1.0, 0xffd27a, 6, { x: 0.1, y: 0.85, z: 2.05 });
  g.box(1.4, 0.2, 0.3, 0x5a3a28, { y: 0.2, z: 1.7, ry: 0.5 });
  g.box(1.4, 0.2, 0.3, 0x5a3a28, { y: 0.2, z: 2.3, ry: -0.5 });
  // Benches around the fire.
  for (const [x, z, r] of [[-2.6, 2, 0], [2.6, 2, 0], [0, 4.6, 1.57]] as [number, number, number][]) g.box(2.2, 0.35, 0.5, 0x7a4a2a, { x, y: 0.2, z, ry: r });
  // Supplies: stacked crates and drums, a generator, a tarp.
  for (let i = 0; i < 6; i++) g.box(1.0, 0.9, 1.0, i % 2 ? 0x6b7f3f : 0x8c6a3a, { x: 9 + (i % 3) * 1.1, y: 0.5 + Math.floor(i / 3) * 0.95, z: 3 + (i % 2) * 0.1 });
  for (let i = 0; i < 3; i++) g.cylinder(0.4, 0.4, 0.9, i % 2 ? 0x2f6fd0 : 0xd6322b, 8, { x: 12.5 + i * 0.9, y: 0.5, z: 5 });
  g.box(1.8, 0.9, 1.0, 0xe8b53a, { x: -9.5, y: 0.5, z: 3.5 });
  g.box(0.3, 0.3, 0.3, 0x2a2a2e, { x: -9.0, y: 1.1, z: 3.2 });
  g.box(4, 0.08, 3, 0x3d7a8a, { x: 8, y: 2.4, z: 3, rx: 0.1 });
  for (const sx of [-1, 1]) g.cylinder(0.05, 0.05, 2.4, 0x4a4a50, 5, { x: 8 + sx * 1.9, y: 1.2, z: 4.4 });
  // The flagpole: a tall mast with a coloured pennant.
  g.cylinder(0.08, 0.1, 9, 0xf1efe8, 6, { x: -4.5, y: 4.5, z: 6 });
  for (let i = 0; i < 4; i++) g.box(0.9, 0.5, 0.05, [PAL.flagBlue, PAL.flagWhite, PAL.flagRed, PAL.flagYellow][i], { x: -4.5 + 0.5, y: 8.4 - i * 0.55, z: 6 });
  // Lamp posts with glowing bulbs, and an antenna mast.
  for (const x of [-13, 13, 0]) {
    g.cylinder(0.07, 0.09, 3.6, 0x4a4a50, 6, { x, y: 1.8, z: 7.5 });
    g.sphere(0.28, 0xfff2c0, { x, y: 3.7, z: 7.5 }, 6);
  }
  g.cylinder(0.06, 0.06, 7, 0x6a6a72, 5, { x: 12, y: 3.5, z: -2 });
  g.box(0.9, 0.06, 0.06, 0x6a6a72, { x: 12, y: 6.8, z: -2 });
  return g.build();
}
