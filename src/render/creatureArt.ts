import { Group, Mesh, MeshStandardMaterial, LatheGeometry, Vector2, DoubleSide } from 'three';
import type { BufferGeometry } from 'three';
import { GeoBuilder } from './geo';
import { personGeometry } from './trafficArt';
import { createHumanoidRig } from './humanoidRig';
export type CreatureKind = 'yeti' | 'ghost' | 'zombie';
export interface CreatureArt { group:Group; update(time:number, shrug:number):void; dispose():void; }
/** Art-only rig: callers retain movement, collision, encounter state and audio scheduling. */
export function createCreatureArt(kind:CreatureKind):CreatureArt {
 const group=new Group(),arms:Group[]=[],cloth:Mesh[]=[];
 const geos:BufferGeometry[]=[],mats:MeshStandardMaterial[]=[];
 const fur=0xe3e6e0,skin=0xadbcc0;
 const material=new MeshStandardMaterial({vertexColors:true,roughness:kind==='ghost'?0.3:0.9,transparent:kind==='ghost',opacity:kind==='ghost'?0.76:1,depthWrite:kind!=='ghost',side:kind==='ghost'?DoubleSide:0,emissive:kind==='ghost'?0x75b9e7:0,emissiveIntensity:0.5});mats.push(material);
 const add=(b:GeoBuilder,parent:Group=group,mat=material):Mesh=> {const geo=b.build();geos.push(geo);const mesh=new Mesh(geo,mat);mesh.castShadow=kind!=='ghost';parent.add(mesh);return mesh;};
 let rig:ReturnType<typeof createHumanoidRig>|null=null,lastTime=0,lastX=0,lastZ=0,initialized=false;
 if(kind==='zombie') {
  const geometry=personGeometry(0x536d56,0x9da982,0x343e36,null,null);geos.push(geometry);
  rig=createHumanoidRig(geometry,material);group.add(rig.mesh);group.scale.setScalar(1.75);
  return {group,update(time,react){const dt=Math.max(0,Math.min(0.1,time-lastTime));const speed=initialized&&dt>0?Math.hypot(group.position.x-lastX,group.position.z-lastZ)/dt:0;rig!.update(dt,react>0.6?'react':speed>1.2?'chase':speed>0.05?'walk':'idle');lastTime=time;lastX=group.position.x;lastZ=group.position.z;initialized=true;},dispose(){rig!.dispose();geos.forEach(g=>g.dispose());mats.forEach(m=>m.dispose());}};
 }
 if(kind==='yeti') {
  const b=new GeoBuilder();
  b.sphere(0.68,fur,{y:1.77,sx:1.13,sy:1.18,sz:0.75},20);
  b.sphere(0.73,fur,{y:2.2,sx:1.34,sy:0.67,sz:0.74},20);
  b.sphere(0.39,0xb8c4c8,{y:1.75,z:-0.39,sx:1.2,sy:1.12,sz:0.39},16);
  b.sphere(0.64,0xcbd5d7,{y:2.27,sx:1.35,sy:0.68,sz:0.72},12);
  b.sphere(0.46,fur,{y:2.92,sy:1.1},24);
  b.sphere(0.29,skin,{y:2.85,z:-0.37,sx:1.2,sy:0.7,sz:0.52},12);
  b.sphere(0.105,0x4c626b,{y:2.9,z:-0.53,sx:1.2,sy:0.7},10);
  for(const side of [-1,1]) {
   b.sphere(0.086,0xcadadf,{x:side*0.17,y:3.03,z:-0.423,sy:0.62,sz:0.4},12);
   b.sphere(0.039,0x243f4e,{x:side*0.17,y:3.03,z:-0.46,sy:0.8,sz:0.4},12);
   b.sphere(0.016,0xf5f4e6,{x:side*0.16,y:3.045,z:-0.476,sz:0.3},8);
   b.sphere(0.105,fur,{x:side*0.43,y:2.94,z:0.04,sy:1.4,sz:0.6},12);
   b.box(0.23,0.06,0.07,fur,{x:side*0.18,y:3.12,z:-0.44,rz:side*0.2});
   b.sphere(0.33,fur,{x:side*0.35,y:0.87,sy:1.6,sz:0.82},12);
   b.sphere(0.29,0xbdc8c8,{x:side*0.35,y:0.19,z:-0.16,sy:0.55,sz:1.6},12);
   for(let i=0;i<9;i++) b.cone(0.095,0.3,fur,7,{x:side*(0.46+i*0.055),y:2.35-i*0.04,z:-0.29+(i%2)*0.06,rx:Math.PI,rz:side*0.3});
   const arm=new Group();arm.position.set(side*0.88,2.23,0);group.add(arm);arms.push(arm);
   const a=new GeoBuilder();a.sphere(0.24,fur,{x:side*0.08,y:-0.35,sy:1.8},10);a.sphere(0.21,fur,{x:side*0.18,y:-0.89,sy:1.65},10);a.sphere(0.22,skin,{x:side*0.22,y:-1.2,sy:0.9,sz:0.62},10);
   for(let i=0;i<3;i++) a.cone(0.045,0.13,0xd7dbd6,6,{x:side*0.22+(i-1)*0.09,y:-1.4,z:-0.1,rx:Math.PI});add(a,arm);
  }
  b.box(0.25,0.035,0.025,0x677c86,{y:2.73,z:-0.49,rx:-0.08});
  for(let i=0;i<50;i++){const a=i*2.399,r=0.48+0.21*(i%4)/3;b.cone(0.075,0.21+(i%3)*0.06,fur,7,{x:Math.cos(a)*r,y:1.3+(i%9)*0.105,z:Math.sin(a)*r*0.77,rx:Math.PI,rz:Math.cos(a)*0.2});}
  for(let i=-3;i<=3;i++)b.cone(0.095,0.22,fur,8,{x:i*0.1,y:3.26,z:-0.1+Math.abs(i)*0.045,rz:-i*0.1});
  const geometry=b.build();geos.push(geometry);rig=createHumanoidRig(geometry,material,0,1.8,false);group.add(rig.mesh);
 } else if(kind==='ghost') {
  const robe=new GeoBuilder();
  // Continuous draped fabric with twelve folds, a narrow neck and an asymmetric scalloped hem.
  const profile=[[0.88,0.5],[0.75,0.85],[0.62,1.35],[0.5,1.9],[0.47,2.28],[0.3,2.52]].map(([r,y])=>new Vector2(r,y));
  const drape=new LatheGeometry(profile,36);
  const position=drape.getAttribute('position');
  for(let i=0;i<position.count;i++) {
   const x=position.getX(i),z=position.getZ(i),y=position.getY(i),a=Math.atan2(z,x);
   const k=1+0.075*Math.sin(a*12)*(1-(y-0.5)/2.3);
   position.setXYZ(i,x*k,y+(y<0.9?0.13*Math.sin(a*5):0),z*k);
  }
  drape.computeVertexNormals();robe.add(drape,0xc3dce4);
  robe.sphere(0.45,0xc7e5ed,{y:2.83,sy:1.14,sz:0.86},24);
  for(let i=0;i<8;i++){const a=i*Math.PI/4;robe.sphere(0.085,0xd7edf3,{x:Math.cos(a)*0.36,y:2.36,z:Math.sin(a)*0.36,sy:1.9},10);}
  add(robe);
  const face=new GeoBuilder();face.sphere(0.28,0xffffff,{y:2.85,z:-0.34,sx:1.0,sy:1.14,sz:0.18},20);
  const mask=new MeshStandardMaterial({color:0x162d3d,roughness:1});mats.push(mask);add(face,group,mask);
  const glow=new MeshStandardMaterial({color:0xb4efff,emissive:0x73d5ff,emissiveIntensity:2,roughness:0.4});mats.push(glow);
  const eyes=new GeoBuilder();for(const x of [-0.105,0.105])eyes.sphere(0.058,0xffffff,{x,y:2.91,z:-0.374,sx:0.65,sy:1.3,sz:0.4},10);add(eyes,group,glow);
  for(const side of [-1,1]) {const arm=new Group();arm.position.set(side*0.48,2.2,0);group.add(arm);arms.push(arm);const sleeve=new GeoBuilder();const sleeveGeo=new LatheGeometry([new Vector2(0.29,-0.72),new Vector2(0.2,-0.36),new Vector2(0.13,0)],20);sleeve.add(sleeveGeo,0xbedce6,{x:side*0.2,rz:side*0.75});cloth.push(add(sleeve,arm));}
 }
 return {group,update(time,shrug){const dt=Math.max(0,Math.min(0.1,time-lastTime));const speed=initialized&&dt>0?Math.hypot(group.position.x-lastX,group.position.z-lastZ)/dt:0;rig?.update(dt,shrug>0.6?'react':speed>0.05?'walk':'idle');lastTime=time;lastX=group.position.x;lastZ=group.position.z;initialized=true;arms.forEach((arm,i)=>{const side=i===0?-1:1;arm.rotation.z=side*(0.1+Math.sin(time*(kind==='ghost'?1.5:3)+i)*0.13+shrug*0.65);arm.rotation.x=Math.sin(time*2+i)*0.08;});cloth.forEach((mesh,i)=>mesh.rotation.y=Math.sin(time*1.8+i)*0.15);if(kind==='ghost')material.opacity=0.5+Math.sin(time*1.4)*0.08;},dispose(){rig?.dispose();geos.forEach(g=>g.dispose());mats.forEach(m=>m.dispose());}};
}
