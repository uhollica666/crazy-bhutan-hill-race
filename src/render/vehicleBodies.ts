import type { BufferGeometry } from 'three';
import type { VehicleDef } from '../data/types';
import { GeoBuilder } from './geo';
import { PAL } from './palette';

const GLASS = 0x2b3f58;
const DARK = 0x303034;

/** Where head and tail lights sit per model (local, relative to the centre of mass). */
export const LIGHT_LAYOUT: Record<VehicleDef['visual'], { hx: number; y: number; tailHx: number; tailY: number }> = {
  hatch: { hx: 0.55, y: -0.12, tailHx: 0.56, tailY: -0.1 },
  suv: { hx: 0.66, y: -0.1, tailHx: 0.68, tailY: -0.1 },
  coaster: { hx: 0.78, y: -0.18, tailHx: 0.82, tailY: -0.2 },
  cruiser: { hx: 0.72, y: -0.02, tailHx: 0.8, tailY: -0.04 },
};

/** The Dzo Hatch: a small, round-shouldered two-box city car in sunny yellow. */
export function hatchBody(def: VehicleDef): BufferGeometry {
  const { body, accent, trim } = def.livery;
  const w = def.size.width;
  const l = def.size.length;
  const g = new GeoBuilder();
  g.box(w - 0.04, 0.55, l, body, { y: -0.2 });
  g.box(1.5, 0.5, 1.95, body, { y: 0.33, z: 0.38 });
  g.box(1.54, 0.32, 1.7, GLASS, { y: 0.38, z: 0.38 });
  g.box(1.3, 0.32, 2.0, GLASS, { y: 0.38, z: 0.38 });
  g.box(1.46, 0.08, 1.8, body, { y: 0.62, z: 0.38 });
  g.box(1.62, 0.14, 0.95, body, { y: 0.1, z: -1.38 });
  g.box(w + 0.02, 0.2, 0.2, DARK, { y: -0.4, z: -l / 2 + 0.05 });
  g.box(w + 0.02, 0.2, 0.2, DARK, { y: -0.4, z: l / 2 - 0.05 });
  for (const sx of [-1, 1]) {
    g.box(0.03, 0.12, 3.0, accent, { x: sx * (w / 2 - 0.01), y: -0.12 });
    g.box(0.03, 0.06, 3.0, trim, { x: sx * (w / 2 - 0.01), y: -0.24 });
    g.box(0.1, 0.12, 0.2, DARK, { x: sx * 0.86, y: 0.28, z: -0.62 });
  }
  g.box(0.62, 0.3, 0.5, accent, { x: 0.15, y: 0.82, z: 0.4 });
  g.box(0.05, 0.36, 0.05, PAL.woodDark, { x: -0.55, y: 0.78, z: 0.9 });
  g.quad(0.24, 0.17, PAL.flagBlue, { x: -0.5, y: 0.92, z: 0.9 });
  return g.build();
}

/** The Dragon Cruiser: tall, boxy, lifted, with a bull bar, snorkel, roof rack and a spare wheel on the back. */
export function cruiserBody(def: VehicleDef): BufferGeometry {
  const { body, accent, trim } = def.livery;
  const w = def.size.width;
  const l = def.size.length;
  const g = new GeoBuilder();
  g.box(w, 0.8, l, body, { y: -0.32 });
  g.box(w - 0.1, 0.75, 3.1, body, { y: 0.48, z: 0.55 });
  g.box(w - 0.04, 0.46, 2.9, GLASS, { y: 0.5, z: 0.55 });
  g.box(w - 0.3, 0.46, 3.15, GLASS, { y: 0.5, z: 0.55 });
  g.box(w - 0.14, 0.1, 3.0, body, { y: 0.9, z: 0.55 });
  g.box(w - 0.1, 0.22, 1.6, body, { y: 0.12, z: -1.7 });
  g.box(1.3, 0.42, 0.1, DARK, { y: -0.08, z: -l / 2 - 0.02 });
  // Bull bar: two posts and a bar across the front.
  g.cylinder(0.05, 0.05, 0.6, DARK, 6, { x: -0.55, y: -0.3, z: -l / 2 - 0.12 });
  g.cylinder(0.05, 0.05, 0.6, DARK, 6, { x: 0.55, y: -0.3, z: -l / 2 - 0.12 });
  g.cylinder(0.05, 0.05, 1.3, DARK, 6, { y: -0.05, z: -l / 2 - 0.14, rz: Math.PI / 2 });
  g.box(w + 0.02, 0.3, 0.22, DARK, { y: -0.62, z: l / 2 - 0.05 });
  for (const sx of [-1, 1]) {
    for (const z of [-1.6, 1.55]) g.box(0.2, 0.12, 1.15, DARK, { x: sx * (w / 2 + 0.02), y: -0.12, z });
    g.box(0.18, 0.08, 2.6, DARK, { x: sx * (w / 2 + 0.06), y: -0.66, z: 0.0 });
    g.box(0.03, 0.1, l - 0.6, accent, { x: sx * (w / 2 + 0.005), y: -0.02 });
    g.box(0.03, 0.05, l - 0.6, trim, { x: sx * (w / 2 + 0.005), y: -0.12 });
    g.box(0.14, 0.3, 0.22, DARK, { x: sx * (w / 2 + 0.12), y: 0.4, z: -0.5 });
  }
  // Snorkel on the right A-pillar.
  g.cylinder(0.06, 0.06, 0.95, DARK, 6, { x: 0.96, y: 0.55, z: -0.75 });
  g.box(0.16, 0.12, 0.16, DARK, { x: 0.96, y: 1.05, z: -0.75 });
  // Roof rack, light bar and gear.
  g.box(1.7, 0.05, 2.7, DARK, { y: 1.0, z: 0.5 });
  g.box(1.3, 0.1, 0.14, 0xfff1b8, { y: 1.06, z: -0.8 });
  g.box(0.7, 0.36, 0.7, accent, { x: -0.45, y: 1.22, z: 0.7 });
  g.box(0.6, 0.3, 0.8, trim, { x: 0.45, y: 1.19, z: 0.3 });
  g.cylinder(0.12, 0.12, 0.45, 0xc23a2c, 8, { x: 0.5, y: 1.2, z: 1.2 });
  // Spare wheel on the tailgate.
  g.cylinder(0.46, 0.46, 0.26, 0x1c1c1f, 12, { y: -0.05, z: l / 2 + 0.16, rx: Math.PI / 2 });
  g.cylinder(0.28, 0.28, 0.29, 0xc9c9c4, 10, { y: -0.05, z: l / 2 + 0.16, rx: Math.PI / 2 });
  return g.build();
}

/** A simple generic traffic car (white body so instance colours tint it), with wheels baked in. */
export function trafficCarGeometry(): BufferGeometry {
  const g = new GeoBuilder();
  g.box(1.75, 0.55, 3.9, 0xffffff, { y: 0.55 });
  g.box(1.55, 0.5, 2.0, 0xffffff, { y: 1.05, z: 0.3 });
  g.box(1.6, 0.34, 1.8, GLASS, { y: 1.08, z: 0.3 });
  g.box(1.35, 0.34, 2.05, GLASS, { y: 1.08, z: 0.3 });
  g.box(1.5, 0.08, 1.9, 0xffffff, { y: 1.32, z: 0.3 });
  for (const sx of [-1, 1]) for (const z of [-1.2, 1.2]) g.cylinder(0.34, 0.34, 0.24, 0x1c1c1f, 10, { x: sx * 0.86, y: 0.34, z, rz: Math.PI / 2 });
  g.box(1.4, 0.12, 0.08, 0xfff1b8, { y: 0.62, z: -1.96 });
  g.box(1.4, 0.12, 0.08, 0xd8262a, { y: 0.62, z: 1.96 });
  return g.build();
}

/** A small box lorry (broken down on the road): cab, load bed, warning colour. */
export function lorryGeometry(): BufferGeometry {
  const g = new GeoBuilder();
  g.box(2.3, 0.4, 6.4, 0x2a2a2e, { y: 0.9 });
  g.box(2.2, 1.5, 1.9, 0xd9892b, { y: 1.9, z: -2.3 });
  g.box(2.0, 0.6, 0.1, GLASS, { y: 2.2, z: -3.26 });
  g.box(2.35, 1.9, 4.0, 0x3d6f9e, { y: 2.1, z: 1.3 });
  g.box(2.4, 0.12, 4.05, 0xf3efe6, { y: 3.1, z: 1.3 });
  for (const sx of [-1, 1]) for (const z of [-2.2, 1.6, 2.7]) g.cylinder(0.48, 0.48, 0.34, 0x1c1c1f, 10, { x: sx * 1.05, y: 0.48, z, rz: Math.PI / 2 });
  g.box(0.14, 0.7, 0.5, 0xe8b53a, { x: 1.2, y: 2.3, z: -2.2 }); // open bonnet hint
  return g.build();
}

/** A tourist, standing: legs, coat, head, hat, backpack. Colours come from the cast portrait. */
export function touristGeometry(coat: number, skin: number, hair: number, hat: number | null, pack: number): BufferGeometry {
  const g = new GeoBuilder();
  g.cylinder(0.09, 0.1, 0.8, 0x2a3350, 6, { x: -0.1, y: 0.4 });
  g.cylinder(0.09, 0.1, 0.8, 0x2a3350, 6, { x: 0.1, y: 0.4 });
  g.cylinder(0.2, 0.24, 0.7, coat, 7, { y: 1.15 });
  g.sphere(0.17, skin, { y: 1.7 }, 7);
  g.sphere(0.18, hair, { y: 1.78, sy: 0.6 }, 6);
  if (hat !== null) g.cone(0.26, 0.22, hat, 7, { y: 1.9 });
  g.box(0.32, 0.4, 0.2, pack, { y: 1.2, z: 0.2 });
  g.cylinder(0.05, 0.05, 0.5, skin, 5, { x: -0.3, y: 1.15, rz: 0.25 });
  g.cylinder(0.05, 0.05, 0.5, skin, 5, { x: 0.3, y: 1.15, rz: -0.25 });
  return g.build();
}

/** A suitcase and a duffel bag for the pile beside waiting tourists. */
export function luggageGeometry(): BufferGeometry {
  const g = new GeoBuilder();
  g.box(0.55, 0.75, 0.3, 0x8c2a20, { x: -0.5, y: 0.38 });
  g.box(0.5, 0.65, 0.28, 0x2f6fd0, { x: 0.1, y: 0.33, ry: 0.2 });
  g.cylinder(0.2, 0.2, 0.7, 0xe39a1c, 8, { x: 0.65, y: 0.22, rz: Math.PI / 2, ry: 0.3 });
  return g.build();
}

/** A friendly, shy yeti: shaggy white fur, long arms, big feet, a woolly hat. Fictional and non-threatening. */
export function yetiGeometry(): BufferGeometry {
  const fur = 0xf1efe8;
  const g = new GeoBuilder();
  g.box(0.42, 0.28, 0.6, 0xdfdcd2, { x: -0.3, y: 0.14, z: -0.1 }); // big feet
  g.box(0.42, 0.28, 0.6, 0xdfdcd2, { x: 0.3, y: 0.14, z: -0.1 });
  g.cylinder(0.38, 0.45, 1.0, fur, 8, { x: -0.3, y: 0.78 });
  g.cylinder(0.38, 0.45, 1.0, fur, 8, { x: 0.3, y: 0.78 });
  g.sphere(0.85, fur, { y: 1.9, sy: 1.15 }, 9); // body
  g.sphere(0.5, fur, { y: 2.95 }, 8); // head
  g.sphere(0.2, 0xc9b8a2, { y: 2.85, z: -0.4, sx: 1.4, sy: 0.9 }, 6); // face
  g.sphere(0.07, 0x1d1512, { x: -0.16, y: 2.95, z: -0.48 }, 5);
  g.sphere(0.07, 0x1d1512, { x: 0.16, y: 2.95, z: -0.48 }, 5);
  g.cone(0.42, 0.5, 0xd6322b, 8, { y: 3.55 }); // woolly hat
  g.sphere(0.12, 0xf6f4ee, { y: 3.85 }, 5);
  g.cylinder(0.16, 0.14, 1.5, fur, 6, { x: -1.0, y: 1.9, rz: 0.35 }); // arms
  g.cylinder(0.16, 0.14, 1.5, fur, 6, { x: 1.0, y: 2.1, rz: -1.1 }); // right arm waving
  return g.build();
}

/** A fuel station: canopy over two pumps, a small shop and a tall price sign. */
export function stationGeometry(): BufferGeometry {
  const g = new GeoBuilder();
  g.box(10, 0.3, 7, PAL.rock, { y: 0.15 });
  g.box(9, 0.3, 6, PAL.roofRed, { y: 4.6 });
  g.box(9.2, 0.16, 6.2, PAL.whitewash, { y: 4.35 });
  for (const sx of [-4, 4]) for (const sz of [-2.6, 2.6]) g.cylinder(0.16, 0.16, 4.3, PAL.whitewash, 6, { x: sx, y: 2.3, z: sz });
  for (const sx of [-1.6, 1.6]) {
    g.box(0.6, 1.4, 0.5, 0xd6322b, { x: sx, y: 1.0 });
    g.box(0.4, 0.3, 0.05, 0x2a3350, { x: sx, y: 1.5, z: -0.27 });
  }
  g.box(5, 3, 4, PAL.whitewash, { x: -9, y: 1.8, z: -1 });
  g.box(5.4, 0.3, 4.4, PAL.roofSlate, { x: -9, y: 3.4, z: -1 });
  g.box(1.2, 1.6, 0.1, PAL.windowDark, { x: -9, y: 1.7, z: 1.05 });
  g.box(0.3, 7, 0.3, PAL.woodDark, { x: 7, y: 3.5, z: 2.5 });
  g.box(2.2, 1.4, 0.2, 0xe8b53a, { x: 7, y: 7, z: 2.5 });
  g.box(1.6, 0.8, 0.22, 0x2a3350, { x: 7, y: 7, z: 2.55 });
  return g.build();
}

/** A terrace of three shopfronts in Bhutanese style: whitewashed, painted wooden windows, shingle roof. */
export function shopRowGeometry(): BufferGeometry {
  const g = new GeoBuilder();
  const colours = [PAL.maroon, 0x2e7d9a, PAL.gold, 0x4f8a4a];
  const W = 24;
  const D = 8;
  g.box(W, 0.6, D + 0.6, PAL.rock, { y: 0.3 });
  g.box(W, 8.4, D, PAL.whitewash, { y: 4.8 });
  g.box(W + 0.3, 0.45, D + 0.3, PAL.woodDark, { y: 4.3 });
  g.box(W + 0.3, 0.4, D + 0.3, PAL.woodDark, { y: 8.8 });
  for (let i = 0; i < 3; i++) {
    const x = -8 + i * 8;
    const c = colours[i % colours.length];
    g.box(3.6, 2.6, 0.16, c, { x, y: 1.9, z: D / 2 + 0.06 }); // shop front
    g.box(3.0, 2.0, 0.2, 0x2a2220, { x, y: 1.8, z: D / 2 + 0.07 });
    g.box(4.2, 0.5, 0.3, 0xf6c452, { x, y: 3.4, z: D / 2 + 0.12 }); // sign
    for (const wx of [-2, 0, 2]) {
      g.box(1.3, 1.5, 0.14, PAL.wood, { x: x + wx, y: 6.0, z: D / 2 + 0.05 });
      g.box(1.0, 1.15, 0.2, PAL.windowDark, { x: x + wx, y: 6.0, z: D / 2 + 0.06 });
      g.box(1.5, 0.2, 0.16, c, { x: x + wx, y: 6.85, z: D / 2 + 0.1 });
    }
  }
  const alpha = 0.3;
  g.box(W + 2, 0.28, D / 2 + 1.4, PAL.roofSlate, { y: 9.9, z: D / 4 + 0.5, rx: alpha });
  g.box(W + 2, 0.28, D / 2 + 1.4, PAL.roofSlate, { y: 9.9, z: -D / 4 - 0.5, rx: -alpha });
  g.box(W + 2.1, 0.32, 0.5, PAL.roofSlate, { y: 10.7 });
  return g.build();
}

export function clockTowerGeometry(): BufferGeometry {
  const g = new GeoBuilder();
  g.box(8, 1.2, 8, PAL.rock, { y: 0.6 });
  g.box(5.2, 12, 5.2, PAL.whitewash, { y: 7.2 });
  g.box(5.5, 0.6, 5.5, PAL.maroon, { y: 13.4 });
  g.box(6.4, 3.4, 6.4, PAL.whitewash, { y: 15.4 });
  for (const [x, z] of [[0, 3.25], [0, -3.25], [3.25, 0], [-3.25, 0]]) {
    g.cylinder(1.25, 1.25, 0.2, 0xfbf1d8, 16, { x, y: 15.5, z, rx: z !== 0 ? Math.PI / 2 : 0, rz: x !== 0 ? Math.PI / 2 : 0 });
    g.box(z !== 0 ? 0.12 : 0.2, 0.9, z !== 0 ? 0.2 : 0.12, 0x2a2220, { x: x * 1.02, y: 15.7, z: z * 1.02 });
  }
  g.frustum(8.4, 3, 2.6, PAL.gold, { y: 18.4 });
  g.frustum(3.4, 1, 3.2, PAL.roofRed, { y: 21.3 });
  g.sphere(0.4, PAL.gold, { y: 23.2 }, 6);
  return g.build();
}
