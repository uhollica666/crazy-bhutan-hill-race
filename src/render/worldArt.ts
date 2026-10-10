import type { BufferGeometry } from 'three';
import { GeoBuilder } from './geo';
import { PAL } from './palette';

/** Timber joinery, projecting lintel, mullions and painted geometric frieze; no invented sacred text. */
export function timberWindow(g: GeoBuilder, x: number, y: number, z: number, width = 1.5, height = 1.6, ry = 0): void {
  const part = (w: number, h: number, d: number, c: number, dx = 0, dy = 0, dz = 0): void => {
    g.box(w, h, d, c, { x: x + Math.cos(ry) * dx + Math.sin(ry) * dz, y: y + dy,
      z: z - Math.sin(ry) * dx + Math.cos(ry) * dz, ry });
  };
  part(width, height, 0.15, PAL.wood);
  part(width - 0.22, height - 0.22, 0.03, PAL.windowDark, 0, 0, 0.09);
  for (const dx of [-width * 0.23, width * 0.23]) part(0.055, height - 0.19, 0.06, PAL.woodDark, dx, 0, 0.13);
  part(width - 0.2, 0.06, 0.06, PAL.woodDark, 0, -height * 0.15, 0.13);
  part(width + 0.3, 0.18, 0.32, PAL.maroon, 0, height / 2 + 0.06, 0.06);
  part(width + 0.16, 0.1, 0.26, PAL.woodDark, 0, -height / 2, 0.08);
  for (const dx of [-width * 0.36, 0, width * 0.36]) part(0.07, 0.08, 0.025, PAL.gold, dx, height / 2 + 0.06, 0.23);
}

/** Rectangular roof with deep eaves, ridge, sheet joints and exposed supporting rafters. */
export function pitchedRoof(g: GeoBuilder, w: number, d: number, y: number, rise: number, color: number, x = 0, z = 0): void {
  const a = Math.atan2(rise, d / 2), len = Math.hypot(d / 2, rise);
  for (const side of [-1, 1]) {
    g.box(w, 0.17, len, color, { x, y: y + rise / 2, z: z + side * d / 4, rx: side * a });
    g.box(w, 0.15, 0.17, PAL.maroon, { x, y: y - 0.08, z: z + side * d / 2 });
    const seams = Math.ceil(w / 1.2);
    for (let i = 0; i <= seams; i++) {
      const xx = x - w / 2 + i * w / seams;
      g.box(0.035, 0.03, len, color === PAL.gold ? 0xc19b46 : 0x687174,
        { x: xx, y: y + rise / 2 + 0.1, z: z + side * d / 4, rx: side * a });
      g.box(0.09, 0.12, 0.6, PAL.woodDark, { x: xx, y: y - 0.17, z: z + side * (d / 2 - 0.25) });
    }
  }
  g.box(w + 0.1, 0.16, 0.26, color, { x, y: y + rise + 0.04, z });
}

export function villageHouse(variant = 0): BufferGeometry {
  const g = new GeoBuilder(), w = 9, d = 6.4;
  const timber = variant === 1 ? 0x795039 : PAL.woodDark;
  g.box(w + 0.45, 2.7, d + 0.45, PAL.rock, { y: -1.08 });
  // Slightly battered masonry and an overhanging timber upper storey.
  g.frustum(w, w - 0.3, 2.8, PAL.whitewash, { y: 1.55, sz: d / w });
  g.box(w + 0.16, 2.7, d + 0.16, variant === 2 ? 0xe1d5bb : PAL.whitewash, { y: 4.3 });
  for (const y of [2.92, 5.72]) g.box(w + 0.3, 0.28, d + 0.3, timber, { y });
  for (const side of [-1, 1]) {
    for (const x of [-2.8, 0, 2.8]) timberWindow(g, x, 4.35, side * (d / 2 + 0.12), 1.5, 1.65, side < 0 ? Math.PI : 0);
    timberWindow(g, side * (w / 2 + 0.1), 4.35, 0, 1.5, 1.65, side * Math.PI / 2);
    for (let i = -4; i <= 4; i++) {
      g.box(0.18, 0.3, 0.21, timber, { x: i * 0.98, y: 5.48, z: side * (d / 2 + 0.2) });
      g.box(0.075, 0.07, 0.025, i % 2 ? PAL.gold : PAL.maroon, { x: i * 0.98, y: 5.49, z: side * (d / 2 + 0.32) });
    }
  }
  for (const x of [-0.8, 2.6]) timberWindow(g, x, 1.55, d / 2 + 0.02, 0.8, 0.9);
  g.box(1.35, 2.1, 0.18, timber, { x: -3.1, y: 1.22, z: d / 2 + 0.06 });
  g.box(0.05, 1.85, 0.02, PAL.wood, { x: -3.1, y: 1.22, z: d / 2 + 0.16 });
  for (let i = 0; i < 3; i++) g.box(1.6 + i * 0.18, 0.16, 0.5, PAL.rock, { x: -3.1, y: 0.28 - i * 0.12, z: d / 2 + 0.25 + i * 0.35 });
  pitchedRoof(g, w + 2.6, d + 2.2, 5.92, 2.25, variant === 1 ? PAL.roofRed : PAL.roofSlate);
  if (variant === 2) {
    g.box(5, 0.18, 1.1, timber, { x: 1, y: 3.2, z: d / 2 + 0.65 });
    for (let i = 0; i < 10; i++) g.box(0.06, 0.85, 0.06, timber, { x: -1.2 + i * 0.48, y: 3.65, z: d / 2 + 1.13 });
    g.box(5, 0.08, 0.08, timber, { x: 1, y: 4.08, z: d / 2 + 1.13 });
  }
  return g.build();
}

export function mountainPine(variant = 0, low = false): BufferGeometry {
  const g = new GeoBuilder();
  g.cylinder(0.09, 0.23, 5.4, PAL.bark, 7, { y: 2.7 });
  for (let tier = 0; tier < 5; tier++) {
    const y = 1.35 + tier * 0.85, radius = 1.65 - tier * 0.25;
    g.cone(radius, 1.6, tier % 2 ? PAL.pineDark : PAL.pineMid, 9, { y: y + 0.75, ry: tier * 0.61 + variant });
    for (let branch = 0; branch < (low ? 0 : 5); branch++) {
      const a = branch * Math.PI * 2 / 5 + tier * 0.67 + variant;
      g.cylinder(0.025, 0.04, radius * 0.85, PAL.bark, 5,
        { x: Math.cos(a) * radius * 0.35, y: y + 0.12, z: Math.sin(a) * radius * 0.35, rz: Math.PI / 2, ry: -a });
      g.cone(radius * 0.34, 0.9, PAL.pineDark, 6,
        { x: Math.cos(a) * radius * 0.65, y: y + 0.25, z: Math.sin(a) * radius * 0.65, ry: a });
    }
  }
  return g.build();
}

export function shaggyYak(): BufferGeometry {
  const g = new GeoBuilder();
  g.sphere(0.7, PAL.yak, { y: 1.12, sy: 0.85, sx: 0.77, sz: 1.55 }, 10);
  g.sphere(0.5, PAL.yak, { y: 1.52, z: -0.45, sy: 0.8 }, 8);
  g.sphere(0.36, PAL.yak, { y: 1.24, z: -1.02, sx: 0.82, sz: 1.2 }, 8);
  g.sphere(0.22, 0x65574d, { y: 1.06, z: -1.32, sx: 0.86, sy: 0.7 }, 7);
  for (const side of [-1, 1]) {
    g.sphere(0.026, 0x151313, { x: side * 0.23, y: 1.34, z: -1.2 }, 5);
    g.cone(0.07, 0.34, PAL.yakHorn, 6, { x: side * 0.29, y: 1.56, z: -0.98, rz: -side * 0.7 });
    g.cone(0.045, 0.25, PAL.yakHorn, 6, { x: side * 0.4, y: 1.75, z: -0.98, rz: side * 0.35 });
    g.sphere(0.13, PAL.yak, { x: side * 0.35, y: 1.36, z: -0.95, sx: 1.2, sy: 0.4 }, 6);
    for (const z of [-0.63, 0.62]) {
      g.cylinder(0.075, 0.085, 0.7, 0x30241e, 7, { x: side * 0.31, y: 0.42, z });
      g.box(0.18, 0.14, 0.24, 0x191817, { x: side * 0.31, y: 0.07, z: z - 0.03 });
    }
    for (let i = 0; i < 9; i++) g.cone(0.13, 0.48 + (i % 3) * 0.07, i % 2 ? PAL.yak : 0x30221d, 5,
      { x: side * 0.45, y: 0.58, z: -0.8 + i * 0.2, rz: Math.PI });
  }
  g.cylinder(0.04, 0.06, 0.55, PAL.yak, 6, { y: 0.94, z: 1.15, rx: -0.3 });
  g.sphere(0.14, PAL.yak, { y: 0.64, z: 1.24, sy: 1.4 }, 6);
  return g.build();
}
