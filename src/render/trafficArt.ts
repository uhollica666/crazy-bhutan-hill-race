import type { BufferGeometry } from 'three';
import { GeoBuilder, loft } from './geo';

/** Ground-origin traffic prototypes; merged vertex colours keep the existing instancing contract. */
export function touringTraffic(kind: 'car' | 'suv' | 'bus' | 'minibus'): BufferGeometry {
  const bus = kind === 'bus' || kind === 'minibus';
  const w = kind === 'bus' ? 2.5 : kind === 'minibus' ? 2.1 : kind === 'suv' ? 1.9 : 1.75;
  const l = kind === 'bus' ? 9.2 : kind === 'minibus' ? 6.4 : kind === 'suv' ? 4.5 : 3.9;
  const roof = kind === 'bus' ? 3.05 : kind === 'minibus' ? 2.5 : kind === 'suv' ? 1.8 : 1.32;
  const r = kind === 'bus' ? 0.5 : bus || kind === 'suv' ? 0.42 : 0.34;
  const g = new GeoBuilder(), white = 0xffffff, dark = 0x272c30, glass = 0x3c5661;
  const belt = bus ? 1.65 : kind === 'suv' ? 1.17 : 0.83;
  const front = bus ? -l / 2 + 0.13 : -l * 0.19;
  const back = l / 2 - 0.22, a = front + (bus ? 0.14 : 0.48), b = back - 0.21;
  g.add(loft([[-l / 2, w * 0.43, r * 1.05, belt - 0.11], [-l / 2 + 0.18, w * 0.5, r * 0.72, belt],
    [l / 2 - 0.16, w * 0.5, r * 0.72, belt], [l / 2, w * 0.43, r, belt - 0.07]]), white);
  g.add(loft([[front, w * 0.46, belt, belt + 0.07], [a, w * 0.42, belt, roof - 0.08],
    [b, w * 0.42, belt, roof - 0.08], [back, w * 0.46, belt, belt + 0.12]]), glass);
  g.add(loft([[a - 0.04, w * 0.42, roof - 0.08, roof], [b + 0.03, w * 0.42, roof - 0.08, roof]]), white);
  const axles = kind === 'bus' ? [-3.2, 2.6, 3.7] : bus ? [-2.1, 2.1] : kind === 'suv' ? [-1.4, 1.5] : [-1.2, 1.2];
  for (const side of [-1, 1]) {
    for (const z of axles) {
      g.cylinder(r, r, bus ? 0.3 : 0.24, 0x222527, 14, { x: side * w * 0.46, y: r, z, rz: Math.PI / 2 });
      g.cylinder(r * 0.6, r * 0.6, 0.025, 0xb5bac0, 12, { x: side * (w * 0.46 + 0.15), y: r, z, rz: Math.PI / 2 });
      for (let i = 0; i < 8; i++) { const a = (i + 0.5) * Math.PI / 8;
        g.box(0.07, 0.065, r * 0.47, dark, { x: side * (w * 0.5 + 0.015), y: r + Math.sin(a) * (r + 0.055), z: z + Math.cos(a) * (r + 0.055), rx: a - Math.PI / 2 }); }
    }
    const windows = bus ? kind === 'bus' ? 8 : 6 : 3;
    for (let i = 0; i <= windows; i++) g.box(0.05, roof - belt - 0.05, 0.08, white,
      { x: side * w * 0.447, y: (belt + roof) / 2, z: a + (b - a) * i / windows });
    for (let i = 1; i < (bus ? 2 : 3); i++) {
      const z = front + (back - front) * i / (bus ? 2 : 3);
      g.box(0.014, belt - r - 0.1, 0.015, dark, { x: side * (w * 0.5 + 0.008), y: (belt + r) / 2, z });
      g.box(0.035, 0.04, 0.16, 0x858c91, { x: side * (w * 0.5 + 0.02), y: belt - 0.1, z: z + 0.1 });
    }
    g.box(0.14, bus ? 0.24 : 0.13, 0.22, dark, { x: side * (w / 2 + 0.09), y: belt + 0.17, z: front + 0.14 });
    if (bus) g.box(0.022, 0.13, l * 0.94, 0xd79b3c, { x: side * (w / 2 + 0.015), y: belt - 0.23 });
    for (const end of [-1, 1]) g.box(0.26, 0.13, 0.045, end < 0 ? 0xf6e5b5 : 0xb52628,
      { x: side * w * 0.35, y: r * 1.9, z: end * (l / 2 + 0.02) });
  }
  for (const end of [-1, 1]) g.box(w * 0.89, 0.14, 0.09, dark, { y: r * 1.2, z: end * (l / 2 - 0.02) });
  g.box(w * 0.48, 0.17, 0.04, dark, { y: r * 1.9, z: -l / 2 - 0.015 });
  for (let i = 0; i < 3; i++) g.box(w * 0.43, 0.015, 0.048, 0x9ca5ad, { y: r * 1.75 + i * 0.05, z: -l / 2 - 0.025 });
  if (bus) g.box(1.2, 0.15, 1.6, 0xb9c0bc, { y: roof + 0.06, z: 0.6 });
  return g.build();
}

/** Adult silhouette with clothed limbs, neck, cuffs, hands and shoes. */
export function personGeometry(coat: number, skin: number, hair: number, hat: number | null = null, pack: number | null = null): BufferGeometry {
  const g = new GeoBuilder(), trousers = 0x303948;
  for (const side of [-1, 1]) {
    g.box(0.14, 0.1, 0.25, 0x242525, { x: side * 0.105, y: 0.05, z: -0.045 });
    g.cylinder(0.065, 0.075, 0.39, trousers, 7, { x: side * 0.105, y: 0.29 });
    g.cylinder(0.09, 0.075, 0.4, trousers, 7, { x: side * 0.105, y: 0.68, rz: side * 0.04 });
    g.sphere(0.08, coat, { x: side * 0.245, y: 1.3 }, 7);
    g.cylinder(0.068, 0.065, 0.3, coat, 7, { x: side * 0.27, y: 1.15, rz: side * 0.13 });
    g.cylinder(0.06, 0.046, 0.26, coat, 7, { x: side * 0.3, y: 0.9, rz: side * 0.08 });
    g.sphere(0.055, skin, { x: side * 0.31, y: 0.73, sy: 1.25 }, 6);
  }
  g.add(loft([[-0.13, 0.17, 0.85, 1.33], [0.13, 0.17, 0.85, 1.33]]), coat);
  g.sphere(0.2, coat, { y: 1.26, sx: 1.18, sy: 0.6, sz: 0.65 }, 8);
  g.box(0.32, 0.04, 0.27, 0x63513d, { y: 0.89 });
  g.cylinder(0.06, 0.06, 0.12, skin, 7, { y: 1.43 });
  g.sphere(0.14, skin, { y: 1.6, sy: 1.2, sz: 0.93 }, 9);
  g.sphere(0.145, hair, { y: 1.67, sy: 0.75 }, 8);
  g.sphere(0.025, skin, { y: 1.6, z: -0.13, sz: 1.3 }, 6);
  if (hat !== null) {
    g.cylinder(0.22, 0.22, 0.025, hat, 12, { y: 1.74 });
    g.cylinder(0.12, 0.15, 0.13, hat, 10, { y: 1.8 });
  }
  if (pack !== null) {
    g.sphere(0.19, pack, { y: 1.14, z: 0.2, sx: 0.8, sy: 1.3, sz: 0.6 }, 8);
    for (const side of [-1, 1]) g.box(0.035, 0.37, 0.025, 0x343536, { x: side * 0.13, y: 1.17, z: -0.145 });
  }
  return g.build();
}
