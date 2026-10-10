import { Group } from 'three';
import { createQuadrupedRig } from './quadrupedRig';
import type { BufferGeometry } from 'three';
import type { CreatureArt } from './creatureArt';
import { GeoBuilder } from './geo';
import { actorMaterial } from './actorMaterials';

/**
 * Creatures and strange sights for the night and wilderness missions: a shambling zombie, a hooded lantern figure, a bear.
 * Cartoon-friendly: big eyes, soft shapes, no gore. All face -Z (their direction of travel) and stand on the ground (y = 0).
 */

/** A brown bear on all fours: rounded body, small ears, a pale snout. About 1.6 units tall and 2.4 long. */
export function bearGeometry(): BufferGeometry {
  const fur = 0x5b3b26;
  const g = new GeoBuilder();
  g.sphere(0.85, fur, { y: 1.05, sx: 1.0, sy: 0.85, sz: 1.5 }, 24);
  g.sphere(.61,fur,{y:1.34,z:-.6,sx:1.04,sy:.96,sz:.86},24);
  g.sphere(0.55, fur, { y: 1.35, z: -1.35,sx:.9,sy:.85,sz:1.1 }, 24);
  g.sphere(0.28, 0x9c7952, { y: 1.22, z: -1.8, sx: .82, sy: .6,sz:1.25 }, 20);
  g.sphere(0.09, 0x1a1210, { y: 1.3, z: -2.05 }, 5);
  for (const sx of [-1, 1]) {
    g.sphere(0.115, fur, { x: sx * 0.36, y: 1.78, z: -1.3,sy:1.05,sz:.65 }, 18);
    g.sphere(0.06, 0x1a1210, { x: sx * 0.2, y: 1.5, z: -1.78 }, 5);
    g.sphere(0.059,0x9a7755,{x:sx*0.36,y:1.78,z:-1.35,sy:0.7,sz:0.4},16);
    g.sphere(0.024,0xd5c4a2,{x:sx*0.216,y:1.518,z:-1.808,sz:0.3},10);
    for (const z of [-0.8, 0.85]) {
      g.sphere(0.26,fur,{x:sx*0.5,y:0.51,z,sy:1.7},16);
      g.sphere(0.27,0x3c2d25,{x:sx*0.5,y:0.14,z:z-0.12,sy:0.45,sz:1.2},16);
      for(let claw=0;claw<4;claw++)g.cone(0.025,0.09,0xa69b8c,8,{x:sx*0.5+(claw-1.5)*0.09,y:0.1,z:z-0.36,rx:-Math.PI/2});
    }
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

/** The bear in the same shape as the imported creature art, so the mission view can treat all creatures alike. */
export function createBearArt(): CreatureArt {
  const geo = bearGeometry();
  const mat = actorMaterial('fur');
  const group = new Group();
  const rig = createQuadrupedRig(geo,mat);
  group.add(rig.mesh);
  let previous=0,x=0,z=0,initialized=false;
  return {
    group,
    update(time,react) {
      const dt=Math.max(0,Math.min(0.1,time-previous));previous=time;
      const speed=initialized&&dt>0?Math.min(4,Math.hypot(group.position.x-x,group.position.z-z)/dt):0;
      rig.update(time,dt,speed,react);x=group.position.x;z=group.position.z;initialized=true;
    },
    dispose() {
      geo.dispose();
      rig.dispose();
      mat.dispose();
    },
  };
}
