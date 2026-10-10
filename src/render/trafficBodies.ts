import type { BufferGeometry } from 'three';
import { GeoBuilder, loft } from './geo';
import { personGeometry, touringTraffic } from './trafficArt';
import { PAL } from './palette';

/**
 * Lightweight bodies for the extra road users and roadside buildings of Route 1. Everything is vertex-coloured and
 * merged into one geometry; "white" parts are tinted per instance, so a handful of draw calls covers the whole road.
 * Models face -Z and sit on the ground (y = 0).
 */

const GLASS = 0x2b3f58;
const TYRE = 0x1c1c1f;
const W = 0xffffff;

/** A mid-size SUV: taller and longer than the hatch. */
export const suvGeometry = (): BufferGeometry => touringTraffic('suv');

/** A tourist coach: long white body, a band of windows, a coloured stripe. */
export const busGeometry = (): BufferGeometry => touringTraffic('bus');

/** A loaded hill-country truck: tinted cab, grey bed with a lashed tarpaulin. */
export function truckGeometry(): BufferGeometry {
  const g = new GeoBuilder();
  g.box(2.3, 0.4, 7.2, 0x2a2a2e, { y: 0.95 });
  g.add(loft([[-3.55, 1.02, 1.15, 2.68], [-3.3, 1.15, 1.15, 2.85], [-1.45, 1.15, 1.15, 2.85]]), W);
  g.box(2.1, 0.7, 0.1, GLASS, { y: 2.4, z: -3.56 });
  g.box(2.4, 2.0, 4.4, 0xb9a98c, { y: 2.2, z: 1.4 });
  g.box(2.46, 0.2, 4.4, 0x6b7f3f, { y: 3.3, z: 1.4 });
  g.box(2.46, 0.08, 0.3, 0xe8b53a, { y: 3.0, z: 0.4 });
  for (const sx of [-1, 1]) for (const z of [-2.4, 1.6, 2.8]) g.cylinder(0.52, 0.52, 0.36, TYRE, 10, { x: sx * 1.05, y: 0.52, z, rz: Math.PI / 2 });
  g.box(1.6, 0.14, 0.08, 0xfff1b8, { y: 1.1, z: -3.62 });
  for (const side of [-1, 1]) {
    g.box(0.12, 0.25, 0.25, 0x343b41, { x: side * 1.24, y: 2.3, z: -2.85 });
    g.box(0.025, 0.7, 0.68, GLASS, { x: side * 1.16, y: 2.35, z: -2.2 });
    g.box(0.05, 0.04, 0.2, 0xa1aab0, { x: side * 1.18, y: 1.82, z: -1.9 });
    for (const z of [1.6, 2.8]) g.cylinder(0.3, 0.3, 0.025, 0x9ba2a5, 10, { x: side * 1.25, y: 0.52, z, rz: Math.PI / 2 });
    for (let i = 0; i < 6; i++) g.box(0.028, 1.5, 0.035, 0x5b5547, { x: side * 1.23, y: 2.3, z: -0.3 + i * 0.65 });
  }
  g.box(1.1, 0.24, 0.04, 0x292f33, { y: 1.36, z: -3.58 });
  return g.build();
}

/** A motorcycle with a rider in a helmet. */
export function motoGeometry(): BufferGeometry {
  const g = new GeoBuilder();
  for (const z of [-0.8, 0.8]) g.cylinder(0.33, 0.33, 0.14, TYRE, 10, { y: 0.33, z, rz: Math.PI / 2 });
  g.box(0.26, 0.4, 1.3, W, { y: 0.7 });
  g.box(0.3, 0.16, 0.5, 0x2a2a2e, { y: 0.95, z: 0.35 });
  g.box(0.5, 0.05, 0.05, 0x2a2a2e, { y: 1.12, z: -0.62 });
  g.cylinder(0.2, 0.22, 0.6, 0x3d6f9e, 7, { y: 1.3, z: 0.2 });
  g.sphere(0.16, 0xe8c09a, { y: 1.78, z: 0.14 }, 6);
  g.sphere(0.19, 0xd6322b, { y: 1.84, z: 0.14, sy: 0.8 }, 6);
  g.cylinder(0.05, 0.05, 0.5, 0x3d6f9e, 5, { x: -0.22, y: 1.3, z: -0.15, rx: 1.0 });
  g.cylinder(0.05, 0.05, 0.5, 0x3d6f9e, 5, { x: 0.22, y: 1.3, z: -0.15, rx: 1.0 });
  for (const z of [-0.8, 0.8]) {
    g.cylinder(0.21450000000000002, 0.21450000000000002, 0.018, 0x949da5, 12, { x: 0.085, y: 0.33, z, rz: Math.PI / 2 });
    g.cylinder(0.21450000000000002, 0.21450000000000002, 0.018, 0x949da5, 12, { x: -0.085, y: 0.33, z, rz: Math.PI / 2 });
  }
  g.box(0.12, 0.09, 0.04, 0xffecc7, { y: 0.86, z: -0.67 });
  g.box(0.1, 0.055, 0.03, 0xbd2631, { y: 0.66, z: 0.73 });
  return g.build();
}

/** A cyclist: thin wheels, a frame, a rider leaning forward. */
export function bicycleGeometry(): BufferGeometry {
  const g = new GeoBuilder();
  for (const z of [-0.65, 0.65]) g.cylinder(0.34, 0.34, 0.05, 0x2a2a2e, 12, { y: 0.34, z, rz: Math.PI / 2 });
  g.box(0.05, 0.05, 1.3, W, { y: 0.6 });
  g.box(0.05, 0.55, 0.05, W, { y: 0.7, z: 0.25, rx: 0.3 });
  g.box(0.4, 0.04, 0.04, 0x2a2a2e, { y: 1.0, z: -0.5 });
  g.cylinder(0.17, 0.2, 0.55, 0xe8b53a, 7, { y: 1.3, z: 0.1, rx: -0.4 });
  g.sphere(0.15, 0xe8c09a, { y: 1.68, z: -0.12 }, 6);
  g.sphere(0.17, 0x2f6fd0, { y: 1.74, z: -0.12, sy: 0.75 }, 6);
  g.cylinder(0.04, 0.04, 0.5, 0xe8c09a, 5, { x: -0.18, y: 1.2, z: -0.3, rx: 1.0 });
  g.cylinder(0.04, 0.04, 0.5, 0xe8c09a, 5, { x: 0.18, y: 1.2, z: -0.3, rx: 1.0 });
  g.cylinder(0.05, 0.05, 0.55, 0x2a3350, 5, { x: -0.1, y: 0.8, z: 0.2, rx: 0.6 });
  g.cylinder(0.05, 0.05, 0.55, 0x2a3350, 5, { x: 0.1, y: 0.8, z: 0.2, rx: 0.6 });
  for (const z of [-0.65, 0.65]) {
    g.cylinder(0.22100000000000003, 0.22100000000000003, 0.018, 0x949da5, 12, { x: 0.085, y: 0.34, z, rz: Math.PI / 2 });
    g.cylinder(0.22100000000000003, 0.22100000000000003, 0.018, 0x949da5, 12, { x: -0.085, y: 0.34, z, rz: Math.PI / 2 });
  }
  g.box(0.12, 0.09, 0.04, 0xffecc7, { y: 0.86, z: -0.67 });
  g.box(0.1, 0.055, 0.03, 0xbd2631, { y: 0.66, z: 0.73 });
  return g.build();
}

/** A walking villager or tourist (tinted per instance). */
export const walkerGeometry = (): BufferGeometry => personGeometry(W, 0xe8c09a, 0x3b2a20);

/** A repair workshop: a garage bay with a car on a lift, a tyre stack, oil drums and a tall spanner sign (blue, unlike the fuel station). */
export function workshopGeometry(): BufferGeometry {
  const g = new GeoBuilder();
  g.box(12, 0.25, 11, PAL.rock, { y: 0.12 });
  // The garage building sits on -x; its open bay faces +z (toward the road).
  g.box(6.5, 3.8, 7, PAL.whitewash, { x: -8, y: 2.15, z: -1.5 });
  g.box(7.1, 0.35, 7.6, 0x2f5f8f, { x: -8, y: 4.2, z: -1.5 });
  g.box(5, 2.8, 0.2, 0x1a1c22, { x: -8, y: 1.6, z: 2.05 });
  g.box(5.4, 0.4, 0.3, 0xe39a1c, { x: -8, y: 3.15, z: 2.1 });
  // A car on a two-post lift inside the bay.
  g.box(1.8, 0.55, 3.6, 0xc8352b, { x: -8, y: 1.55, z: 0.2 });
  g.box(1.5, 0.45, 1.8, 0xc8352b, { x: -8, y: 2.0, z: 0.3 });
  for (const sx of [-1.4, 1.4]) g.box(0.2, 2.0, 0.2, 0xe8b53a, { x: -8 + sx, y: 1.1, z: 0.2 });
  // Forecourt clutter: tyre stack, drums, a tool cart.
  for (let i = 0; i < 4; i++) g.cylinder(0.48, 0.48, 0.3, TYRE, 10, { x: -3.2, y: 0.4 + i * 0.3, z: -4 });
  for (const x of [-4.4, -3.7]) g.cylinder(0.4, 0.4, 0.9, 0x2f6fd0, 8, { x, y: 0.7, z: -5.1 });
  g.box(1.2, 0.8, 0.7, 0xd6322b, { x: -4.2, y: 0.65, z: 2.4 });
  // Tall roadside sign: a pole, a blue board and a big yellow spanner.
  g.box(0.3, 8, 0.3, PAL.woodDark, { x: 4.5, y: 4, z: 3.5 });
  g.box(3.2, 2.2, 0.25, 0x2f5f8f, { x: 4.5, y: 8.4, z: 3.5 });
  g.box(0.35, 1.7, 0.1, 0xf3c23a, { x: 4.5, y: 8.4, z: 3.68, rz: 0.8 });
  g.box(0.9, 0.35, 0.1, 0xf3c23a, { x: 4.0, y: 8.95, z: 3.68, rz: 0.8 });
  g.box(0.9, 0.35, 0.1, 0xf3c23a, { x: 5.0, y: 7.85, z: 3.68, rz: 0.8 });
  // A canopy over the work area.
  g.box(7, 0.25, 4, 0x2f5f8f, { x: 0.5, y: 4.2, z: -1 });
  for (const [x, z] of [[-2.8, -2.8], [3.8, -2.8], [-2.8, 0.8], [3.8, 0.8]]) g.cylinder(0.14, 0.14, 4, PAL.whitewash, 6, { x, y: 2.2, z });
  return g.build();
}

/** A small village pump with a tea hut: the second, simpler fuel stop at the viewpoint. */
export function kioskGeometry(): BufferGeometry {
  const g = new GeoBuilder();
  g.box(8, 0.2, 6, PAL.rock, { y: 0.1 });
  g.box(3.6, 2.6, 3.2, PAL.whitewash, { x: -4.4, y: 1.5, z: -0.8 });
  g.box(4.2, 0.3, 3.8, PAL.roofRed, { x: -4.4, y: 3.0, z: -0.8 });
  g.box(1.0, 1.5, 0.1, PAL.windowDark, { x: -4.4, y: 1.4, z: 0.85 });
  g.box(0.7, 1.5, 0.6, 0xd6322b, { x: 0.4, y: 0.95, z: 0 });
  g.box(0.45, 0.35, 0.05, 0x2a3350, { x: 0.4, y: 1.4, z: 0.33 });
  g.cylinder(0.14, 0.14, 2.6, PAL.whitewash, 6, { x: -1.6, y: 1.4, z: 1.6 });
  g.box(3.2, 0.18, 2.6, PAL.roofRed, { x: 0.1, y: 2.8, z: 0.4 });
  g.cylinder(0.14, 0.14, 2.6, PAL.whitewash, 6, { x: 1.7, y: 1.4, z: 1.6 });
  g.box(0.3, 5.2, 0.3, PAL.woodDark, { x: 3.2, y: 2.6, z: 2 });
  g.box(1.8, 1.1, 0.2, 0xe8b53a, { x: 3.2, y: 5.2, z: 2 });
  return g.build();
}

/** A pile of firewood or a stack of sacks for roadside dressing (parked loads, market stalls). */
export function stallGeometry(): BufferGeometry {
  const g = new GeoBuilder();
  g.box(2.6, 0.9, 1.4, PAL.woodDark, { y: 0.45 });
  g.box(2.8, 0.1, 1.6, 0xd6322b, { y: 2.2 });
  for (const sx of [-1.3, 1.3]) g.cylinder(0.06, 0.06, 2.2, PAL.woodDark, 5, { x: sx, y: 1.1, z: 0.6 });
  g.sphere(0.3, 0xe39a1c, { x: -0.7, y: 1.05, z: 0 }, 6);
  g.sphere(0.3, 0xd6322b, { x: 0, y: 1.05, z: 0 }, 6);
  g.sphere(0.3, 0x6b7f3f, { x: 0.7, y: 1.05, z: 0 }, 6);
  return g.build();
}

/** A dry-stone retaining wall along the uphill side of the road: 24 m long, battered face, drainage holes, a capping course. */
export function retainWallGeometry(): BufferGeometry {
  const g = new GeoBuilder();
  for (let row = 0; row < 4; row++) {
    const shade = row % 2 === 0 ? 0x8b857a : 0x7a746a;
    g.box(24, 0.62, 1.0 - row * 0.06, 0x635f57, { y: 0.31 + row * 0.62, z: row * 0.03 });
    for (let i = 0; i < 24; i++) g.box(0.88, 0.52, 0.08, i % 3 ? shade : 0x979084,
      { x: -11.5 + i + (row % 2) * 0.35, y: 0.31 + row * 0.62, z: -0.52 + row * 0.06 });
  }
  g.box(24.3, 0.16, 1.2, 0xb9b2a4, { y: 2.55 });
  for (let i = -4; i <= 4; i++) g.box(0.28, 0.2, 0.1, 0x1e1e20, { x: i * 2.6, y: 0.5, z: -0.52 });
  for (let i = -5; i <= 5; i++) g.box(0.5, 0.5, 0.5, i % 2 ? 0x77716a : 0x8f897e, { x: i * 2.2 + 0.4, y: 2.85, z: 0.1 });
  return g.build();
}

/** A scenic lookout: a stone terrace with a railing, a small chorten, benches and a view board. Faces the road with +Z. */
export function viewpointGeometry(): BufferGeometry {
  const g = new GeoBuilder();
  g.box(16, 0.5, 8, PAL.rock, { y: 0.25 });
  g.box(16, 0.06, 8.2, 0xb9b2a4, { y: 0.52 });
  for (let i = -7; i <= 7; i++) g.box(0.14, 1.0, 0.14, PAL.woodDark, { x: i * 1.05, y: 1.0, z: -3.8 });
  g.box(16, 0.1, 0.12, PAL.woodDark, { y: 1.45, z: -3.8 });
  g.box(16, 0.1, 0.12, PAL.woodDark, { y: 1.05, z: -3.8 });
  g.box(1.6, 1.2, 1.6, PAL.whitewash, { x: 5.4, y: 1.1, z: -1.5 });
  g.cone(0.85, 1.4, 0xe8b53a, 8, { x: 5.4, y: 2.4, z: -1.5 });
  g.box(2.4, 0.4, 0.7, 0x6b4b2c, { x: -3.2, y: 0.9, z: -1.2 });
  g.box(2.4, 0.4, 0.7, 0x6b4b2c, { x: 0.4, y: 0.9, z: -1.2 });
  g.box(0.12, 2.2, 0.12, PAL.woodDark, { x: -6.4, y: 1.6, z: 1.6 });
  g.box(2.4, 1.3, 0.12, 0x2f5f8f, { x: -6.4, y: 3.0, z: 1.6 });
  g.box(1.9, 0.9, 0.14, 0xf1efe8, { x: -6.4, y: 3.0, z: 1.68 });
  return g.build();
}

/** A roadside sign: yellow warning diamond (or a km stone) on a pole. */
export function signpostGeometry(): BufferGeometry {
  const g = new GeoBuilder();
  g.cylinder(0.05, 0.05, 2.6, 0x6b6b70, 5, { y: 1.3 });
  g.box(0.9, 0.9, 0.06, 0xf3c23a, { y: 2.6, ry: 0, rz: Math.PI / 4 });
  g.box(0.82, 0.82, 0.07, 0xf0d15a, { y:2.6,z:0.045,rz:Math.PI/4 });
    // Visible winding-road symbol and fastening bolts.
    for(let i=0;i<5;i++)g.box(0.07,0.14,0.025,0x22282b,{x:Math.sin(i*1.8)*0.12,y:2.35+i*0.12,z:0.09,rz:Math.cos(i*1.8)*0.35});
    for(const y of [2.23,2.97])g.sphere(0.018,0xb4b8b4,{y,z:0.095},6);
    g.box(0.085,0.4,0.09,0xeeeece,{y:0.7});
  g.box(0.5, 0.35, 0.3, 0xe9e6dc, { x: 1.1, y: 0.18 });
  g.box(0.5, 0.1, 0.32, 0xd6322b, { x: 1.1, y: 0.4 });
  return g.build();
}

/** A paved plaza at the destination: pale stone paving, low walls, lamp posts, a wide chorten and a prayer-flag arch. */
export function plazaGeometry(): BufferGeometry {
  const g = new GeoBuilder();
  g.box(30, 0.3, 14, 0xb9b2a4, { y: 0.15 });
  g.box(30, 0.1, 0.5, 0xe9e6dc, { y: 0.35, z: -6.8 });
  for (const x of [-12, -4, 4, 12]) {
    g.cylinder(0.09, 0.12, 3.4, PAL.woodDark, 5, { x, y: 2.0, z: -6.2 });
    g.sphere(0.28, 0xfff1b8, { x, y: 3.8, z: -6.2 }, 6);
  }
  // A big white chorten with a golden spire.
  g.frustum(4.6, 3.4, 1.4, PAL.whitewash, { x: 0, y: 1.2, z: -3 });
  g.frustum(3.0, 2.2, 1.8, PAL.whitewash, { x: 0, y: 2.8, z: -3 });
  g.cylinder(1.1, 1.2, 1.6, PAL.whitewash, 10, { x: 0, y: 4.5, z: -3 });
  g.cone(1.0, 1.2, 0xe8b53a, 10, { x: 0, y: 5.9, z: -3 });
  g.sphere(0.3, 0xe8b53a, { x: 0, y: 6.7, z: -3 }, 6);
  // Prayer-flag gate posts either side of the arrival.
  for (const x of [-13.5, 13.5]) g.cylinder(0.12, 0.16, 8, PAL.woodDark, 6, { x, y: 4, z: 1.5 });
  g.box(27, 0.12, 0.12, 0xd6322b, { y: 7.6, z: 1.5 });
  for (let i = -6; i <= 6; i++) g.box(1.2, 0.8, 0.05, [0x2f6fd0, 0xf4efe2, 0xc8352b, 0x3f8f4e, 0xe3a72f][(i + 6) % 5], { x: i * 2, y: 7.1, z: 1.5 });
  return g.build();
}

/** A Coaster-style minibus: shorter than the coach, high roof, window band. */
export const minibusGeometry = (): BufferGeometry => touringTraffic('minibus');

/** A box delivery truck: tinted cab, tall plain box body. */
export function deliveryGeometry(): BufferGeometry {
  const g = new GeoBuilder();
  g.box(2.2, 0.35, 6.0, 0x2a2a2e, { y: 0.8 });
  g.add(loft([[-3.0, 0.98, 0.95, 2.42], [-2.8, 1.1, 0.95, 2.55], [-1.2, 1.1, 0.95, 2.55]]), W);
  g.box(2.0, 0.6, 0.1, GLASS, { y: 2.1, z: -3.02 });
  g.box(2.3, 2.1, 4.0, 0xf1efe8, { y: 2.1, z: 1.1 });
  g.box(2.34, 0.2, 4.0, 0x6b7f3f, { y: 3.2, z: 1.1 });
  g.box(2.34, 0.4, 3.9, 0xd6322b, { y: 1.6, z: 1.1 });
  for (const sx of [-1, 1]) for (const z of [-2.0, 1.9]) g.cylinder(0.48, 0.48, 0.32, TYRE, 10, { x: sx * 1.0, y: 0.48, z, rz: Math.PI / 2 });
  g.box(1.5, 0.14, 0.08, 0xfff1b8, { y: 1.0, z: -3.02 });
  for (const side of [-1, 1]) {
    g.box(0.12, 0.25, 0.25, 0x343b41, { x: side * 1.24, y: 2.3, z: -2.85 });
    g.box(0.025, 0.7, 0.68, GLASS, { x: side * 1.16, y: 2.35, z: -2.2 });
    g.box(0.05, 0.04, 0.2, 0xa1aab0, { x: side * 1.18, y: 1.82, z: -1.9 });
    for (const z of [1.6, 2.8]) g.cylinder(0.3, 0.3, 0.025, 0x9ba2a5, 10, { x: side * 1.25, y: 0.52, z, rz: Math.PI / 2 });
    for (let i = 0; i < 6; i++) g.box(0.028, 1.5, 0.035, 0x5b5547, { x: side * 1.23, y: 2.3, z: -0.3 + i * 0.65 });
  }
  g.box(1.1, 0.24, 0.04, 0x292f33, { y: 1.36, z: -3.05 });
  return g.build();
}

/** A small scooter with a rider (smaller and lighter than the motorcycle). */
export function scooterGeometry(): BufferGeometry {
  const g = new GeoBuilder();
  for (const z of [-0.6, 0.6]) g.cylinder(0.22, 0.22, 0.12, TYRE, 10, { y: 0.22, z, rz: Math.PI / 2 });
  g.box(0.3, 0.34, 1.1, W, { y: 0.5 });
  g.box(0.5, 0.05, 0.05, 0x2a2a2e, { y: 1.0, z: -0.48 });
  g.cylinder(0.19, 0.21, 0.55, 0xd6322b, 7, { y: 1.15, z: 0.12 });
  g.sphere(0.15, 0xe8c09a, { y: 1.6, z: 0.1 }, 6);
  g.sphere(0.18, 0xf1f1ec, { y: 1.66, z: 0.1, sy: 0.8 }, 6);
  g.cylinder(0.04, 0.04, 0.45, 0xd6322b, 5, { x: -0.2, y: 1.15, z: -0.18, rx: 1.0 });
  g.cylinder(0.04, 0.04, 0.45, 0xd6322b, 5, { x: 0.2, y: 1.15, z: -0.18, rx: 1.0 });
  for (const z of [-0.6, 0.6]) {
    g.cylinder(0.14300000000000002, 0.14300000000000002, 0.018, 0x949da5, 12, { x: 0.085, y: 0.22, z, rz: Math.PI / 2 });
    g.cylinder(0.14300000000000002, 0.14300000000000002, 0.018, 0x949da5, 12, { x: -0.085, y: 0.22, z, rz: Math.PI / 2 });
  }
  g.box(0.12, 0.09, 0.04, 0xffecc7, { y: 0.86, z: -0.67 });
  g.box(0.1, 0.055, 0.03, 0xbd2631, { y: 0.66, z: 0.73 });
  return g.build();
}

/** A small city bird (a dove or crow): body, head and two swept wings. */
export function birdGeometry(): BufferGeometry {
  const g = new GeoBuilder();
  const plumage=0xb9c8ce, dark=0x485a68;
  g.sphere(0.16,plumage,{sz:1.55,sy:0.8},10);
  g.sphere(0.1,dark,{y:0.08,z:-0.24},10);
  g.cone(0.036,0.13,0xc6a86c,7,{y:0.08,z:-0.36,rx:-Math.PI/2});
  for(const side of [-1,1]) {
    g.sphere(0.018,0x171f23,{x:side*0.074,y:0.11,z:-0.28},6);
    for(let i=0;i<6;i++) g.sphere(0.085,i%2?dark:plumage,{x:side*(0.17+i*0.074),y:0.03-i*0.012,z:0.02+i*0.012,sx:1.2,sy:0.16,sz:1.5},8);
    g.cylinder(0.012,0.012,0.12,0x917753,6,{x:side*0.07,y:-0.16,z:0.035});
    g.box(0.065,0.012,0.07,0x917753,{x:side*0.07,y:-0.22,z:0.01});
  }
  for(let i=-1;i<=1;i++)g.sphere(0.07,dark,{x:i*0.045,z:0.3,sy:0.15,sz:2.1},8);
  return g.build();
}

/** A traffic cone with a pale base. */
export function coneGeometry(): BufferGeometry {
  const g = new GeoBuilder();
  g.box(0.5, 0.05, 0.5, 0xf1efe8, { y: 0.03 });
  g.cone(0.22, 0.7, 0xff6a1a, 8, { y: 0.4 });
  g.cylinder(0.12, 0.15, 0.1, 0xf1efe8, 8, { y: 0.42 });
  return g.build();
}

/** A row of luggage trolleys with a few bags on them. */
export function trolleyGeometry(): BufferGeometry {
  const g = new GeoBuilder();
  for (let i = 0; i < 5; i++) {
    const x = (i - 2) * 0.9;
    g.box(0.6, 0.06, 1.0, 0x9a9aa2, { x, y: 0.4 });
    g.box(0.6, 0.6, 0.05, 0x9a9aa2, { x, y: 0.75, z: 0.5 });
    for (const sx of [-0.25, 0.25]) for (const sz of [-0.4, 0.4]) g.cylinder(0.07, 0.07, 0.05, 0x1c1c1f, 6, { x: x + sx, y: 0.08, z: sz, rz: Math.PI / 2 });
    if (i % 2 === 0) g.box(0.45, 0.4, 0.3, [0x8c2a20, 0x2f6fd0, 0x2e9c4f][i % 3], { x, y: 0.66, z: -0.1 });
  }
  return g.build();
}

/** A cut rock face beside the road: layered, leaning and jagged (about 36 m long, up to 24 m high). Faces +Z toward the road. */
export function cliffGeometry(): BufferGeometry {
  const g = new GeoBuilder();
  const tones = [0x8b7a68, 0x9a8467, 0x7d6b57, 0xb07a4a, 0x6f6458];
  for (let i = 0; i < 9; i++) {
    const x = -16 + i * 4;
    const h = 11 + ((i * 7) % 5) * 3;
    g.box(4.6, h, 6 + (i % 3), tones[i % tones.length], { x, y: h / 2, z: -3 - (i % 2), ry: ((i % 3) - 1) * 0.12 });
  }
  for (let i = 0; i < 12; i++) g.rock(tones[(i * 2) % tones.length], { x: -17 + i * 3.1, y: 3 + ((i * 5) % 7) * 2.5, z: 0.4 - (i % 3) * 0.8, sx: 2.4, sy: 2.2, sz: 1.6 });
  g.box(36, 1.2, 4, 0x6e8a4a, { y: 0.6, z: 1.5 });
  for (let layer = 0; layer < 5; layer++) for (let i = 0; i < 6; i++)
    g.rock(layer % 2 ? 0x77766c : 0x918c7e, { x: -15 + i * 6.0 + layer % 2, y: 2 + layer * 2.3,
      z: -0.2 - layer * 0.2, sx: 3.1, sy: 0.4, sz: 0.48, ry: 0.13 * (i % 3 - 1) });
  return g.build();
}

/** A road bridge: white rails with red end-pylons and stone piers (36 m long, the road runs along local X). */
export function bridgeGeometry(): BufferGeometry {
  const g = new GeoBuilder();
  for (const z of [-5.6, 5.6]) {
    g.box(36, 0.22, 0.28, 0xf1efe8, { y: 1.15, z });
    g.box(36, 0.18, 0.2, 0xf1efe8, { y: 0.6, z });
    for (let i = -17; i <= 17; i += 2) g.box(0.2, 1.1, 0.2, i % 4 === 0 ? 0xd6322b : 0xf1efe8, { x: i, y: 0.6, z });
    g.box(36, 0.5, 0.5, 0x8f897e, { y: -0.1, z });
  }
  for (const x of [-18, 18]) for (const z of [-5.6, 5.6]) g.box(0.9, 2.2, 0.9, 0xb9b2a4, { x, y: 1.1, z });
  for (const x of [-8, 8]) g.box(3, 10, 11.4, 0x8f897e, { x, y: -4.4 });
  for (const z of [-5.3, 5.3]) {
    g.box(35.8, 0.55, 0.16, 0x5e686d, { y: -0.55, z });
    for (let i = -15; i <= 15; i += 3) {
      g.box(0.1, 0.95, 0.2, 0x969d9b, { x: i, y: 0.55, z: z + Math.sign(z) * 0.3 });
      g.box(0.22, 0.12, 0.04, i % 2 ? 0xc3b992 : 0xad4236, { x: i, y: 0.8, z: z + Math.sign(z) * 0.43 });
    }
  }
  for (const x of [-12, 0, 12]) g.box(0.18, 0.38, 10.8, 0x6c7375, { x, y: -0.5 });
  return g.build();
}

/** A stretch of runway or taxiway (long axis X, 240 m): dark asphalt with edge lines and a dashed centre line. Inaccessible scenery. */
export function runwayGeometry(): BufferGeometry {
  const g = new GeoBuilder();
  g.box(240, 2.2, 32, 0x3d3f43, { y: -0.2 });
  for (const z of [-14.5, 14.5]) g.box(240, 0.05, 0.4, 0xf1efe8, { y: 0.92, z });
  for (let i = -11; i <= 11; i++) g.box(8, 0.05, 0.6, 0xf1efe8, { x: i * 10.5, y: 0.92 });
  for (let i = 0; i < 6; i++) g.box(0.8, 0.05, 9, 0xf1efe8, { x: -112 + i * 1.8, y: 0.92, z: 0 });
  g.box(240, 0.5, 6, 0x6a6f4a, { y: 0.2, z: 20 });
  return g.build();
}
