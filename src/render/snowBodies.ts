import type { BufferGeometry } from 'three';
import { GeoBuilder } from './geo';

/**
 * Level 7 (Chelela Hill Climb) models: the snow plough that crawls up the pass, and the great fields of prayer-flag poles on the
 * summit. Vertex-coloured and merged into one geometry each. The plough faces -Z and sits on the ground; the flag field faces +Z
 * (toward the road). "White" parts of the plough are tinted per instance.
 */

const TYRE = 0x1c1c1f;
const W = 0xffffff;

/** A heavy snow plough: a yellow cab and tipper body, a big angled blade at the front, a flashing orange beacon. */
export function ploughGeometry(): BufferGeometry {
  const g = new GeoBuilder();
  g.box(2.3, 0.4, 7.2, 0x2a2a2e, { y: 0.9 });
  g.box(2.3, 1.9, 2.0, W, { y: 2.0, z: -2.3 });
  g.box(2.0, 0.7, 0.1, 0x2b3f58, { y: 2.4, z: -3.32 });
  g.box(2.4, 1.2, 3.9, W, { y: 1.9, z: 1.5 });
  g.box(2.46, 0.18, 3.95, 0x2a2a2e, { y: 1.3, z: 1.5 });
  for (const sx of [-1, 1]) for (const z of [-2.4, 1.0, 2.7]) g.cylinder(0.52, 0.52, 0.36, TYRE, 10, { x: sx * 1.05, y: 0.52, z, rz: Math.PI / 2 });
  // The blade: a wide angled plate on two arms, with orange-and-black stripes along the top edge.
  g.box(3.6, 1.1, 0.25, 0xe8b53a, { y: 1.0, z: -4.2, ry: 0.28 });
  g.box(3.5, 0.2, 0.3, 0x2a2a2e, { y: 0.5, z: -4.2, ry: 0.28 });
  for (let i = -3; i <= 3; i++) g.box(0.4, 0.24, 0.3, i % 2 ? 0xff7a1a : 0x1c1c1f, { x: i * 0.5, y: 1.62, z: -4.18, ry: 0.28 });
  for (const sx of [-0.8, 0.8]) g.box(0.2, 0.2, 1.6, 0x5a5a60, { x: sx, y: 0.8, z: -3.4 });
  g.sphere(0.2, 0xff8a1a, { y: 3.1, z: -2.2 }, 7);
  g.box(0.1, 0.4, 0.1, 0x2a2a2e, { y: 2.9, z: -2.2 });
  g.box(1.6, 0.14, 0.08, 0xfff1b8, { y: 1.1, z: -3.34 });
  return g.build();
}

/** A field of tall prayer-flag poles on a slope (about 30 x 18 m, faces +Z toward the road): white banners and strings of coloured flags. */
export function flagPolesGeometry(): BufferGeometry {
  const g = new GeoBuilder();
  const colours = [0x2f6fd0, 0xf6f4ee, 0xd6322b, 0x2e9c4f, 0xf0c23a];
  let seed = 7;
  const rnd = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const rows = 8;
  for (let r = 0; r < rows; r++) {
    const z = 6 - r * 2.4;
    const y = r * 0.55;
    const n = 13 - (r % 2);
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * 2.3 + (rnd() - 0.5) * 0.7;
      const h = 8 + rnd() * 5;
      g.box(0.14, h, 0.14, 0x8a6a45, { x, y: y + h / 2, z, rz: (rnd() - 0.5) * 0.06 });
      g.cone(0.1, 0.5, 0xb04a22, 4, { x, y: y + h + 0.25, z });
      // A long white banner hanging off the pole, fluttering a little.
      g.box(0.04, 4.6 + rnd() * 2, 0.8, 0xf4f1e8, { x: x + 0.1, y: y + h - 2.8, z: z + 0.45, ry: (rnd() - 0.5) * 0.5 });
    }
  }
  // Strings of coloured flags between the poles.
  for (let s = 0; s < 6; s++) {
    const z = 5 - s * 2.6;
    const y = s * 0.55 + 4.4 + (s % 2) * 1.3;
    for (let i = -13; i <= 13; i++) g.box(0.5, 0.42, 0.05, colours[(i + 20 + s) % colours.length], { x: i * 1.1, y: y - Math.abs(Math.sin(i * 0.4)) * 0.2, z });
    g.box(29, 0.04, 0.04, 0x4a4a50, { y: y + 0.25, z });
  }
  // A low stone terrace along the front.
  g.box(30, 0.7, 1.2, 0xb9b2a2, { y: 0.1, z: 8.4 });
  return g.build();
}
