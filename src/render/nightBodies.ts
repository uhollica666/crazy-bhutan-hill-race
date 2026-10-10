import type { BufferGeometry } from 'three';
import { GeoBuilder } from './geo';

/**
 * Creatures and strange sights for the night and wilderness missions: a shambling zombie, a hooded lantern figure, a bear.
 * Cartoon-friendly: big eyes, soft shapes, no gore. All face -Z (their direction of travel) and stand on the ground (y = 0).
 */

/** A pale, ragged, hunched zombie: arms out in front, googly eyes, tattered shirt. About 3.2 units tall (drawn at 0.62 scale). */
export function zombieGeometry(): BufferGeometry {
  const skin = 0xa9bba2;
  const g = new GeoBuilder();
  for (const sx of [-1, 1]) {
    g.cylinder(0.22, 0.27, 1.05, 0x4a5560, 7, { x: sx * 0.3, y: 0.52, rx: sx * 0.12 });
    g.box(0.36, 0.2, 0.55, 0x2f2a26, { x: sx * 0.3, y: 0.1, z: -0.1 });
  }
  g.box(1.05, 1.25, 0.62, 0x7d6c58, { y: 1.75, z: -0.1, rx: -0.28 });
  g.box(1.1, 0.2, 0.66, 0x5d5044, { y: 1.1, z: 0.0, rx: -0.28 });
  g.sphere(0.44, skin, { y: 2.7, z: -0.38 }, 8);
  for (const sx of [-1, 1]) {
    g.sphere(0.15, 0xffffff, { x: sx * 0.19, y: 2.8, z: -0.74 }, 6);
    g.sphere(0.07, 0x1d1512, { x: sx * 0.19, y: 2.78, z: -0.86 }, 5);
  }
  g.box(0.3, 0.07, 0.06, 0x3a2a2a, { y: 2.55, z: -0.8 });
  for (const sx of [-1, 0, 1]) g.box(0.1, 0.22, 0.1, 0x2a2420, { x: sx * 0.2, y: 3.15, z: -0.3, rz: sx * 0.3 });
  for (const sx of [-1, 1]) {
    g.cylinder(0.14, 0.12, 1.35, skin, 6, { x: sx * 0.72, y: 2.0, z: -0.7, rx: -1.35 });
    g.box(0.3, 0.2, 0.2, 0x5d5044, { x: sx * 0.72, y: 1.85, z: -0.2 });
  }
  return g.build();
}

/** A tall hooded figure in a long cloak, holding a glowing lantern out at its side. About 3 units tall. */
export function figureGeometry(): BufferGeometry {
  const g = new GeoBuilder();
  g.cone(0.75, 2.6, 0x2b2f45, 8, { y: 1.3 });
  g.sphere(0.38, 0x2b2f45, { y: 2.75 }, 8);
  g.box(0.36, 0.34, 0.12, 0x0d0f18, { y: 2.72, z: -0.34 });
  g.sphere(0.06, 0xffe9a8, { x: -0.1, y: 2.74, z: -0.4 }, 5);
  g.sphere(0.06, 0xffe9a8, { x: 0.1, y: 2.74, z: -0.4 }, 5);
  g.cylinder(0.1, 0.1, 1.2, 0x2b2f45, 6, { x: 0.62, y: 1.9, z: -0.3, rz: -0.9 });
  g.box(0.3, 0.38, 0.3, 0xffd27a, { x: 1.05, y: 1.5, z: -0.3 });
  g.box(0.36, 0.06, 0.36, 0x3a3a40, { x: 1.05, y: 1.72, z: -0.3 });
  g.box(0.36, 0.06, 0.36, 0x3a3a40, { x: 1.05, y: 1.29, z: -0.3 });
  return g.build();
}

/** A brown bear on all fours: rounded body, small ears, a pale snout. About 1.6 units tall and 2.4 long. */
export function bearGeometry(): BufferGeometry {
  const fur = 0x5b3b26;
  const g = new GeoBuilder();
  g.sphere(0.85, fur, { y: 1.05, sx: 1.0, sy: 0.85, sz: 1.5 }, 9);
  g.sphere(0.55, fur, { y: 1.35, z: -1.35 }, 8);
  g.sphere(0.28, 0xc9a77c, { y: 1.22, z: -1.8, sx: 1.2, sy: 0.8 }, 6);
  g.sphere(0.09, 0x1a1210, { y: 1.3, z: -2.05 }, 5);
  for (const sx of [-1, 1]) {
    g.sphere(0.16, fur, { x: sx * 0.36, y: 1.82, z: -1.3 }, 6);
    g.sphere(0.06, 0x1a1210, { x: sx * 0.2, y: 1.5, z: -1.78 }, 5);
    for (const z of [-0.8, 0.85]) g.cylinder(0.24, 0.28, 0.9, fur, 7, { x: sx * 0.5, y: 0.45, z });
  }
  g.sphere(0.2, fur, { y: 1.15, z: 1.45 }, 6);
  return g.build();
}

/** A fallen tree lying across the road: a thick trunk (long axis X) with a stump end, a few broken branches and leaves. */
export function logGeometry(): BufferGeometry {
  const g = new GeoBuilder();
  g.cylinder(0.5, 0.58, 4.4, 0x5a3a28, 8, { y: 0.55, rz: Math.PI / 2 });
  g.cylinder(0.5, 0.5, 0.06, 0xc9a77c, 8, { x: 2.2, y: 0.55, rz: Math.PI / 2 });
  for (const [x, z, a] of [[-1.2, -0.5, 0.5], [0.4, 0.55, -0.6], [1.4, -0.4, 0.4]] as [number, number, number][]) {
    g.cylinder(0.08, 0.14, 1.4, 0x5a3a28, 5, { x, y: 0.85, z, rx: a, rz: 0.4 });
    g.sphere(0.5, 0x4f7a34, { x: x - 0.2, y: 1.2, z: z * 1.8 }, 6);
  }
  return g.build();
}

/** An abandoned roadside hut (about 7 x 5 m, faces +Z): leaning walls, a collapsed roof, dark empty windows, creepers. */
export function ruinGeometry(): BufferGeometry {
  const g = new GeoBuilder();
  g.box(7, 0.4, 5.4, 0x6f6a60, { y: 0.1 });
  g.box(6.4, 3.0, 0.4, 0x8a8478, { y: 1.7, z: -2.4, rz: 0.03 });
  g.box(0.4, 3.0, 4.6, 0x8a8478, { x: -3.0, y: 1.6, z: 0, rx: 0.02 });
  g.box(0.4, 2.2, 4.6, 0x8a8478, { x: 3.0, y: 1.2, z: 0 });
  g.box(3.2, 1.6, 0.4, 0x8a8478, { x: -1.6, y: 1.0, z: 2.4 });
  g.box(1.0, 1.4, 0.3, 0x0d0f12, { x: 1.2, y: 1.7, z: -2.2 });
  // The roof has fallen in on one side: tilted slate boards and a bare beam.
  g.box(4.6, 0.2, 3.2, 0x4a4743, { x: 1.2, y: 2.3, z: -0.8, rx: 0.5, rz: 0.2 });
  g.box(0.25, 0.25, 6.4, 0x4a3524, { x: -0.2, y: 3.1, z: 0, ry: 0.08, rx: -0.1 });
  g.box(0.25, 0.25, 4.0, 0x4a3524, { x: 2.0, y: 2.6, z: 0.4, rz: 0.4 });
  for (const [x, z] of [[-2.6, 2.2], [2.8, -2.2], [-3.1, -0.5]] as [number, number][]) g.sphere(0.7, 0x2f4a2a, { x, y: 0.6, z, sy: 0.7 }, 6);
  return g.build();
}
