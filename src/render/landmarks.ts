import { branch, foliage } from './organic';
import type { BufferGeometry } from 'three';
import { Color } from 'three';
import { GeoBuilder } from './geo';
import { PAL } from './palette';
import { pitchedRoof, timberWindow } from './worldArt';

const GLASS = 0x2b3f58;

const shade = (hex: number, k: number): number => {
  const c = new Color(hex);
  c.multiplyScalar(k);
  return c.getHex();
};

/** Broadleaf tree: three lobes of foliage (willow / poplar / maple feel via the level's leaf colour). */
export function broadleafGeometry(leaf: number): BufferGeometry {
  const g = new GeoBuilder();
  branch(g,[0,0,0],[0.1,3.9,0],0.26,PAL.bark);
  for (let i=0;i<8;i++) {
    const a=i*2.399,reach=0.9+(i%3)*0.36,y=3.1+(i%3)*0.58;
    const x=Math.cos(a)*reach,z=Math.sin(a)*reach;
    branch(g,[0.06,2.4+i%2*0.6,0],[x,y,z],0.075,PAL.bark);
    for(let j=0;j<3;j++)g.add(foliage(0.88,shade(leaf,0.93+(i%3)*0.06),i*3+j),0xffffff,{x:x+Math.cos(j*2.1+a)*0.45,y:y+0.45+j%2*0.38,z:z+Math.sin(j*2.1+a)*0.45,sy:0.87},true);
  }
  g.add(foliage(1.1,leaf,13),0xffffff,{y:5.2,sy:0.82},true);
  return g.build();
}

/** Low flowering shrub (rhododendron). */
export function shrubGeometry(blossom: number): BufferGeometry {
  const g = new GeoBuilder().rock(0x436a3a, { y: 0.55, sx: 1.2, sy: 0.85, sz: 1.2 });
  const spots: [number, number, number][] = [
    [0.5, 1.15, 0.2],
    [-0.6, 1.05, 0.4],
    [0.1, 1.3, -0.5],
    [-0.3, 1.2, -0.2],
    [0.7, 0.9, -0.6],
    [-0.8, 0.85, -0.6],
  ];
  for (const [x, y, z] of spots) {
    g.sphere(0.24, 0x31513a, { x, y: y - 0.15, z, sx: 1.5, sy: 0.7 }, 6);
    for (let i = 0; i < 3; i++) g.sphere(0.09, blossom, { x: x + (i - 1) * 0.11, y, z: z + i % 2 * 0.09 }, 5);
  }
  return g.build();
}

/** A fortress-monastery (dzong): battered whitewashed walls, red bands, golden-roofed central tower. */
export function dzongGeometry(): BufferGeometry {
  const g = new GeoBuilder();
  g.box(38, 6, 26, PAL.rock, { y: -1 });
  g.box(32, 12, 20, PAL.whitewash, { y: 8 });
  g.box(32.5, 1.6, 20.5, PAL.maroon, { y: 12.6 });
  g.box(24, 7, 14, PAL.whitewash, { y: 17.5 });
  g.box(24.5, 1.4, 14.5, PAL.maroon, { y: 20.3 });
  g.box(9, 10, 9, PAL.whitewash, { y: 26 });
  g.box(9.4, 1.2, 9.4, PAL.maroon, { y: 30.2 });
  g.frustum(14, 7, 2.4, PAL.gold, { y: 32.2 });
  g.frustum(7.5, 3, 2, PAL.gold, { y: 34.4 });
  g.sphere(0.55, PAL.gold, { y: 36.1 }, 6);
  for (const sx of [-1, 1]) {
    g.box(7, 14, 7, PAL.whitewash, { x: sx * 17, y: 9, z: 1 });
    g.box(7.4, 1.2, 7.4, PAL.maroon, { x: sx * 17, y: 14.2, z: 1 });
    g.frustum(9.5, 4, 2, PAL.gold, { x: sx * 17, y: 16, z: 1 });
  }
  // Windows and balcony on the front face (+Z).
  g.box(32.4, 0.5, 0.7, PAL.woodDark, { y: 9.6, z: 10.2 });
  for (let i = -6; i <= 6; i++) {
    g.box(1.1, 1.9, 0.25, PAL.windowDark, { x: i * 2.4, y: 7.6, z: 10.1 });
    g.box(1.1, 1.9, 0.25, PAL.windowDark, { x: i * 2.4, y: 12.2, z: 10.1 });
  }
  for (let i = -4; i <= 4; i++) g.box(1, 1.6, 0.25, PAL.windowDark, { x: i * 2.4, y: 18, z: 7.1 });
  g.box(5.4, 6.4, 1.2, PAL.maroon, { y: 5, z: 10.4 });
  g.box(3.6, 5.2, 1.3, PAL.woodDark, { y: 4.4, z: 10.5 });
  // Exposed cornice brackets, framed tower windows and deep rectangular eaves.
  pitchedRoof(g, 27, 17, 21.2, 2.1, PAL.roofRed);
  for (const side of [-1, 1]) for (const x of [-6, -3, 0, 3, 6])
    timberWindow(g, x, 27.5, side * 4.6, 1.25, 1.8, side < 0 ? Math.PI : 0);
  for (let i = -12; i <= 12; i++) g.box(0.24, 0.8, 0.6, PAL.woodDark, { x: i * 1.25, y: 13.3, z: 10.3 });
  return g.build();
}

/** Small regional airport terminal in a Bhutanese-inspired idiom (whitewash, wooden bands, deep eaves). */
export function terminalGeometry(): BufferGeometry {
  const g = new GeoBuilder();
  g.box(44, 1, 18, PAL.rock, { y: 0.5 });
  g.box(40, 6, 14, PAL.whitewash, { y: 4 });
  g.box(40.4, 0.8, 14.4, PAL.woodDark, { y: 7.2 });
  g.box(40.8, 0.5, 14.8, PAL.roofRed, { y: 7.9 });
  g.box(32, 2.4, 0.2, GLASS, { y: 3.6, z: 7.05 });
  for (let i = -4; i <= 4; i++) g.box(0.3, 3.2, 0.34, PAL.woodDark, { x: i * 4, y: 3.5, z: 7.1 });
  g.box(26, 3.6, 10, PAL.whitewash, { y: 10 });
  g.box(26.4, 0.5, 10.4, PAL.woodDark, { y: 11.7 });
  for (let i = -3; i <= 3; i++) {
    g.box(1.6, 1.7, 0.18, PAL.wood, { x: i * 3.4, y: 10.2, z: 5.05 });
    g.box(1.2, 1.3, 0.24, PAL.windowDark, { x: i * 3.4, y: 10.2, z: 5.05 });
  }
  // Wide eaves roof over the upper block.
  const alpha = 0.42;
  g.box(30, 0.3, 8.2, PAL.roofSlate, { y: 13.6, z: 3.9, rx: alpha });
  g.box(30, 0.3, 8.2, PAL.roofSlate, { y: 13.6, z: -3.9, rx: -alpha });
  g.box(30.2, 0.35, 0.5, PAL.roofSlate, { y: 15.2 });
  g.box(44, 0.5, 18, PAL.roofSlate, { y: 8.4 });
  // Entrance canopy on four columns.
  g.box(10, 0.4, 6, PAL.woodDark, { y: 5.6, z: 10.2 });
  g.box(10.4, 0.2, 6.4, PAL.roofRed, { y: 5.9, z: 10.2 });
  for (const sx of [-4.5, 4.5])
    for (const sz of [8, 12.6]) g.cylinder(0.22, 0.22, 5.4, PAL.maroon, 8, { x: sx, y: 2.8, z: sz });
  g.cylinder(0.07, 0.09, 4, PAL.woodDark, 5, { x: 18, y: 17.2, z: 0 });
  g.quad(0.9, 2.4, PAL.flagWhite, { x: 18.5, y: 17.8, z: 0 });
  return g.build();
}

export function towerGeometry(): BufferGeometry {
  return new GeoBuilder()
    .cylinder(2.1, 2.8, 16, PAL.whitewash, 10, { y: 8 })
    .cylinder(3.3, 3.3, 0.6, PAL.maroon, 10, { y: 16.2 })
    .cylinder(3.7, 3.3, 2.4, GLASS, 10, { y: 17.7 })
    .cone(4.3, 1.8, PAL.roofRed, 10, { y: 19.8 })
    .cylinder(0.05, 0.07, 3, PAL.woodDark, 5, { y: 22 })
    .build();
}

/** Parked turboprop-style airliner, nose toward -Z. Generic livery (no real airline markings). */
export function planeGeometry(): BufferGeometry {
  const g = new GeoBuilder();
  const y = 3.6;
  g.cylinder(1.9, 1.9, 30, PAL.whitewash, 12, { y, rx: Math.PI / 2 });
  g.cone(1.9, 6, PAL.whitewash, 12, { y, z: -18, rx: -Math.PI / 2 });
  g.cone(1.9, 9, PAL.whitewash, 12, { y: y + 0.5, z: 19.5, rx: Math.PI / 2 });
  g.cylinder(1.96, 1.96, 24, PAL.gold, 12, { y: y - 0.7, z: -1, rx: Math.PI / 2, sx: 1, sz: 0.55 });
  for (let i = 0; i < 12; i++)
    for (const sx of [-1, 1]) g.box(0.12, 0.5, 0.7, GLASS, { x: sx * 1.9, y: y + 0.5, z: -9 + i * 1.6 });
  g.box(0.12, 0.7, 0.9, GLASS, { x: 0, y: y + 0.9, z: -17.2, sx: 12 });
  for (const sx of [-1, 1]) {
    g.box(16, 0.4, 5, PAL.whitewash, { x: sx * 8.7, y: y - 0.9, z: 1, ry: sx * 0.28 });
    g.cylinder(0.85, 0.85, 3.4, PAL.rock, 8, { x: sx * 6, y: y - 1.9, z: -1.2, rx: Math.PI / 2 });
    g.cylinder(0.12, 0.12, 2.6, PAL.rock, 5, { x: sx * 3.2, y: 1.7, z: 1 });
    g.cylinder(0.55, 0.55, 0.4, 0x222222, 8, { x: sx * 3.2, y: 0.55, z: 1, rz: Math.PI / 2 });
    g.box(8, 0.3, 2.6, PAL.whitewash, { x: sx * 4.3, y: y + 1.2, z: 20 });
  }
  g.cylinder(0.12, 0.12, 2.6, PAL.rock, 5, { y: 1.8, z: -13 });
  g.cylinder(0.45, 0.45, 0.35, 0x222222, 8, { y: 0.55, z: -13, rz: Math.PI / 2 });
  g.box(0.45, 7, 5, PAL.maroon, { y: y + 4.6, z: 19.2, rx: -0.12 });
  g.box(0.5, 1.2, 2, PAL.gold, { y: y + 7.6, z: 18.6, rx: -0.12 });
  return g.build();
}

/** Open pavilion with a gilded prayer wheel. Non-collidable, set back from the road. */
export function prayerWheelHouseGeometry(): BufferGeometry {
  const g = new GeoBuilder();
  g.box(4.6, 0.4, 4.6, PAL.rock, { y: 0.2 });
  for (const sx of [-1.8, 1.8])
    for (const sz of [-1.8, 1.8]) g.cylinder(0.16, 0.18, 3.2, PAL.maroon, 8, { x: sx, y: 2, z: sz });
  g.cylinder(0.6, 0.6, 1.5, PAL.gold, 12, { y: 1.3 });
  g.cylinder(0.64, 0.64, 0.2, PAL.maroon, 12, { y: 2.1 });
  g.cylinder(0.05, 0.05, 2.6, PAL.woodDark, 6, { y: 1.6 });
  g.frustum(6.4, 1.6, 1.8, PAL.roofRed, { y: 4.1 });
  g.frustum(7.0, 6.4, 0.25, PAL.maroon, { y: 3.4 });
  g.cone(0.35, 0.9, PAL.gold, 6, { y: 5.4 });
  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 6;
    g.box(0.07, 0.8, 0.035, 0xb98733, { x: Math.cos(a) * 0.605, y: 1.3, z: Math.sin(a) * 0.605, ry: -a });
  }
  for (const y of [0.65, 0.78, 1.82, 1.94]) g.cylinder(0.63, 0.63, 0.035, PAL.gold, 16, { y });
  return g.build();
}
