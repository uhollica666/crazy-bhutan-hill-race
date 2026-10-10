import { Group, Mesh, MeshStandardMaterial } from 'three';
import type { BufferGeometry } from 'three';
import { GeoBuilder } from './geo';
import { humanBase } from './people';
export type CreatureKind = 'yeti' | 'ghost' | 'zombie';
export interface CreatureArt { group:Group; update(time:number, shrug:number):void; dispose():void; }
/** Art-only rig: callers retain movement, collision, encounter state and audio scheduling. */
export function createCreatureArt(kind:CreatureKind):CreatureArt {
 const group=new Group(),arms:Group[]=[],cloth:Mesh[]=[];
 const geos:BufferGeometry[]=[],mats:MeshStandardMaterial[]=[];
 const fur=0xe3e6e0,skin=0xadbcc0;
 const material=new MeshStandardMaterial({vertexColors:true,roughness:kind==='ghost'?0.3:0.9,transparent:kind==='ghost',opacity:kind==='ghost'?0.64:1,depthWrite:kind!=='ghost',emissive:kind==='ghost'?0x75b9e7:0,emissiveIntensity:0.5});mats.push(material);
 const add=(b:GeoBuilder,parent:Group=group,mat=material):Mesh=> {const geo=b.build();geos.push(geo);const mesh=new Mesh(geo,mat);mesh.castShadow=kind!=='ghost';parent.add(mesh);return mesh;};
 if(kind==='yeti') {
  const b=new GeoBuilder();
  b.sphere(0.75,fur,{y:1.85,sx:1.25,sy:1.1,sz:0.7},14);
  b.sphere(0.64,0xcbd5d7,{y:2.27,sx:1.35,sy:0.68,sz:0.72},12);
  b.sphere(0.48,fur,{y:2.94,sy:1.05},14);
  b.sphere(0.29,skin,{y:2.85,z:-0.37,sx:1.2,sy:0.7,sz:0.52},12);
  b.sphere(0.105,0x4c626b,{y:2.9,z:-0.53,sx:1.2,sy:0.7},10);
  for(const side of [-1,1]) {
   b.sphere(0.08,0x314550,{x:side*0.17,y:3.03,z:-0.42,sy:0.62},8);
   b.box(0.23,0.06,0.07,fur,{x:side*0.18,y:3.12,z:-0.44,rz:side*0.2});
   b.sphere(0.33,fur,{x:side*0.35,y:0.87,sy:1.6,sz:0.82},12);
   b.sphere(0.29,0xbdc8c8,{x:side*0.35,y:0.19,z:-0.16,sy:0.55,sz:1.6},12);
   for(let i=0;i<5;i++) b.cone(0.085,0.28,fur,7,{x:side*(0.54+i*0.07),y:2.16-i*0.045,z:-0.24,rz:side*0.5});
   const arm=new Group();arm.position.set(side*0.88,2.23,0);group.add(arm);arms.push(arm);
   const a=new GeoBuilder();a.sphere(0.24,fur,{x:side*0.08,y:-0.35,sy:1.8},10);a.sphere(0.21,fur,{x:side*0.18,y:-0.89,sy:1.65},10);a.sphere(0.22,skin,{x:side*0.22,y:-1.2,sy:0.9,sz:0.62},10);
   for(let i=0;i<3;i++) a.cone(0.045,0.13,0xd7dbd6,6,{x:side*0.22+(i-1)*0.09,y:-1.4,z:-0.1,rx:Math.PI});add(a,arm);
  }
  // Overlapping tapered tufts follow the shoulder, belly and forehead contours.
  for(let i=0;i<28;i++){const a=i*2.399,r=0.3+0.5*(i%4)/3;b.cone(0.095,0.25,fur,7,{x:Math.cos(a)*r,y:1.45+(i%7)*0.19,z:Math.sin(a)*r*0.6,rx:Math.PI});}
  add(b);
 } else if(kind==='ghost') {
  const robe=new GeoBuilder();robe.sphere(0.46,0xc7e5ed,{y:2.85,sy:1.18,sz:0.8},16);
  robe.cone(0.74,1.8,0xafcbdc,18,{y:1.7});
  for(let i=0;i<12;i++){const a=i*Math.PI/6;robe.cone(0.17,0.66,0xc4e6eb,8,{x:Math.cos(a)*0.55,y:0.68+(i%3)*0.07,z:Math.sin(a)*0.55,rx:Math.PI});}
  const face=new GeoBuilder();face.sphere(0.27,0x213a55,{y:2.85,z:-0.3,sx:1.05,sy:1.16,sz:0.2},14);add(robe);add(face);
  const glow=new MeshStandardMaterial({color:0xb4efff,emissive:0x73d5ff,emissiveIntensity:2,roughness:0.4});mats.push(glow);
  const eyes=new GeoBuilder();for(const x of [-0.105,0.105])eyes.sphere(0.058,0xffffff,{x,y:2.91,z:-0.374,sx:0.65,sy:1.3,sz:0.4},10);add(eyes,group,glow);
  for(const side of [-1,1]) {const arm=new Group();arm.position.set(side*0.48,2.2,0);group.add(arm);arms.push(arm);const sleeve=new GeoBuilder();sleeve.cone(0.23,0.88,0xbedce6,12,{x:side*0.3,y:-0.12,rz:side*0.8});cloth.push(add(sleeve,arm));}
 } else {
  const b=new GeoBuilder();b.add(humanBase(0x536d56,0x9da982,0x343e36,'both'),0xffffff,{},true);
  for(const side of [-1,1]) {b.box(0.075,0.025,0.018,0xdbc882,{x:side*0.05,y:1.64,z:-0.12,rz:-side*0.2});b.box(0.12,0.17,0.02,0x8a785a,{x:side*0.1,y:1.1,z:-0.14,rz:side*0.1});}
  for(const side of [-1,1]) {
   const arm=new Group();arm.position.set(side*0.23,1.4,0);group.add(arm);arms.push(arm);
   const reach=new GeoBuilder();reach.cylinder(0.065,0.055,0.32,0x536d56,10,{y:-0.15});reach.cylinder(0.054,0.042,0.27,0x536d56,10,{y:-0.42});reach.sphere(0.052,0x9da982,{y:-0.59,sy:1.4},10);add(reach,arm);arm.rotation.x=1.2;
  }
  b.box(0.12,0.025,0.018,0x424f3c,{y:1.55,z:-0.118});add(b);group.scale.setScalar(1.75);
 }
 return {group,update(time,shrug){arms.forEach((arm,i)=>{const side=i===0?-1:1;arm.rotation.z=side*(0.1+Math.sin(time*(kind==='ghost'?1.5:3)+i)*0.13+shrug*0.65);arm.rotation.x=(kind==='zombie'?1.2:0)+Math.sin(time*2+i)*0.08;});cloth.forEach((mesh,i)=>mesh.rotation.y=Math.sin(time*1.8+i)*0.15);if(kind==='zombie'){group.rotation.z=Math.sin(time*2.7)*0.035;}},dispose(){geos.forEach(g=>g.dispose());mats.forEach(m=>m.dispose());}};
}
