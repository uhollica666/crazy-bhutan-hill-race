import { Group, Mesh, MeshStandardMaterial, LatheGeometry, Vector2, DoubleSide } from 'three';
import type { BufferGeometry } from 'three';
import { GeoBuilder } from './geo';
import { personGeometry } from './trafficArt';
import { createHumanoidRig } from './humanoidRig';
import { actorMaterial } from './actorMaterials';
import { furLock } from './fur';
export type CreatureKind = 'yeti' | 'ghost' | 'zombie';
export interface CreatureArt { group:Group; update(time:number, shrug:number):void; dispose():void; }
/** Art-only rig: callers retain movement, collision, encounter state and audio scheduling. */
export function createCreatureArt(kind:CreatureKind):CreatureArt {
 const group=new Group(),arms:Group[]=[],cloth:Mesh[]=[];
 const geos:BufferGeometry[]=[],mats:MeshStandardMaterial[]=[];
 const fur=0xe3e6e0,skin=0xadbcc0;
 const material=kind==='ghost'?new MeshStandardMaterial({vertexColors:true,roughness:.32,transparent:true,opacity:.56,depthWrite:false,side:DoubleSide,emissive:0x75b9e7,emissiveIntensity:.32}):actorMaterial(kind==='yeti'?'fur':'skin');material.side=DoubleSide;mats.push(material);
 const add=(b:GeoBuilder,parent:Group=group,mat=material):Mesh=> {const geo=b.build();geos.push(geo);const mesh=new Mesh(geo,mat);mesh.castShadow=kind!=='ghost';parent.add(mesh);return mesh;};
 let rig:ReturnType<typeof createHumanoidRig>|null=null,lastTime=0,lastX=0,lastZ=0,initialized=false;
 let drape:BufferGeometry|null=null,drapeRest:Float32Array|null=null;
 if(kind==='zombie') {
  const base=personGeometry(0x48524d,0x929d7d,0x343e36,null,null),b=new GeoBuilder();
  const positions=base.getAttribute('position');
  for(let i=0;i<positions.count;i++) { const y=positions.getY(i),x=positions.getX(i);positions.setXYZ(i,x*(y<.9?.88:1),y,positions.getZ(i)-Math.max(0,y-1.15)*.19); }
  // Preserve the source's smooth normals; recomputing a non-indexed actor would facet every triangle.
  b.add(base,0xffffff,{},true);
  for(const side of [-1,1]) {
    b.sphere(.036,0x373c30,{x:side*.056,y:1.652,z:-.183,sx:1.3,sy:.62,sz:.3},16);
    b.sphere(.016,0xcbc696,{x:side*.056,y:1.654,z:-.196,sy:.7,sz:.3},12);
    b.sphere(.054,0x73816a,{x:side*.087,y:1.59,z:-.17,sx:.6,sy:.5,sz:.3},14);
    b.box(.065,.02,.012,0x343a32,{x:side*.056,y:1.68,z:-.18,rz:side*.14});
    b.box(.085,.12,.014,0x363d35,{x:side*.09,y:1.19,z:-.161,rz:side*.13});
  }
  b.box(.063,.014,.008,0x45483b,{y:1.558,z:-.177,rz:.13});
  const geometry=b.build();geos.push(geometry);
  rig=createHumanoidRig(geometry,material);group.add(rig.mesh);group.scale.setScalar(1.75);
  return {group,update(time,react){const dt=Math.max(0,Math.min(0.1,time-lastTime));const speed=initialized&&dt>0?Math.hypot(group.position.x-lastX,group.position.z-lastZ)/dt:0;rig!.update(dt,react>0.6?'react':speed>1.2?'chase':speed>0.05?'walk':'idle',speed);lastTime=time;lastX=group.position.x;lastZ=group.position.z;initialized=true;},dispose(){rig!.dispose();geos.forEach(g=>g.dispose());mats.forEach(m=>m.dispose());}};
 }
 if(kind==='yeti') {
  const b=new GeoBuilder();
  b.sphere(0.68,fur,{y:1.77,sx:1.13,sy:1.18,sz:0.75},20);
  b.sphere(0.73,fur,{y:2.2,sx:1.34,sy:0.67,sz:0.74},20);
  b.sphere(0.39,0xb8c4c8,{y:1.75,z:-0.39,sx:1.2,sy:1.12,sz:0.39},16);
  b.sphere(0.64,0xcbd5d7,{y:2.27,sx:1.35,sy:0.68,sz:0.72},12);
  b.sphere(0.46,fur,{y:2.92,sy:1.1},24);
  b.sphere(0.29,skin,{y:2.85,z:-0.37,sx:1.2,sy:0.7,sz:0.52},12);
  b.sphere(0.095,0x364348,{y:2.9,z:-0.53,sx:1.2,sy:0.7},20);
  for(const side of [-1,1]) {
   b.sphere(0.086,0xcadadf,{x:side*0.17,y:3.03,z:-0.423,sy:0.62,sz:0.4},12);
   b.sphere(0.032,0x24333a,{x:side*0.17,y:3.03,z:-0.46,sy:0.55,sz:0.4},16);
   b.sphere(0.01,0xcfc6ad,{x:side*0.16,y:3.04,z:-0.476,sz:0.3},10);
   b.sphere(0.105,fur,{x:side*0.43,y:2.94,z:0.04,sy:1.4,sz:0.6},12);
   b.sphere(.12,fur,{x:side*.18,y:3.105,z:-.44,sx:1.2,sy:.32,sz:.53,rz:side*.2},20);
   b.sphere(0.33,fur,{x:side*0.35,y:0.87,sy:1.6,sz:0.82},12);
   b.sphere(0.29,0xbdc8c8,{x:side*0.35,y:0.19,z:-0.16,sy:0.55,sz:1.6},12);
   for(let i=0;i<8;i++) furLock(b,i%3?fur:0xc7cec6,side*(.62+i*.028),2.36-i*.02,-.4+(i%2)*.025,.075,.09+(i%3)*.015,Math.PI+side*.2);
   const arm=new Group();arm.position.set(side*0.88,2.23,0);group.add(arm);arms.push(arm);
   const a=new GeoBuilder();a.sphere(0.24,fur,{x:side*0.08,y:-0.35,sy:1.8},10);a.sphere(0.21,fur,{x:side*0.18,y:-0.89,sy:1.65},10);a.sphere(0.22,skin,{x:side*0.22,y:-1.2,sy:0.9,sz:0.62},10);
   for(let i=0;i<3;i++) a.cone(0.045,0.13,0xd7dbd6,6,{x:side*0.22+(i-1)*0.09,y:-1.4,z:-0.1,rx:Math.PI});add(a,arm);
  }
  b.box(0.25,0.035,0.025,0x677c86,{y:2.73,z:-0.49,rx:-0.08});
  const geometry=b.build();geos.push(geometry);rig=createHumanoidRig(geometry,material,0,1.8,false);group.add(rig.mesh);
 } else if(kind==='ghost') {
  const robe=new GeoBuilder();
  // Continuous draped fabric with twelve folds, a narrow neck and an asymmetric scalloped hem.
  const profile=[[0.88,0.5],[0.75,0.85],[0.62,1.35],[0.5,1.9],[0.47,2.28],[0.3,2.52]].map(([r,y])=>new Vector2(r,y));
  drape=new LatheGeometry(profile,48);
  const position=drape.getAttribute('position');
  for(let i=0;i<position.count;i++) {
   const x=position.getX(i),z=position.getZ(i),y=position.getY(i),a=Math.atan2(z,x);
   const k=1+0.075*Math.sin(a*12)*(1-(y-0.5)/2.3);
   position.setXYZ(i,x*k,y+(y<0.9?0.13*Math.sin(a*5):0),z*k);
  }
  drape.computeVertexNormals();const ghostMesh=add(new GeoBuilder().add(drape,0xc3dce4));drape=ghostMesh.geometry;drapeRest=new Float32Array(drape.getAttribute('position').array);
  robe.sphere(0.45,0xc7e5ed,{y:2.83,sy:1.14,sz:0.86},24);
  for(let i=0;i<8;i++){const a=i*Math.PI/4;robe.sphere(0.085,0xd7edf3,{x:Math.cos(a)*0.36,y:2.36,z:Math.sin(a)*0.36,sy:1.9},10);}
  add(robe);
  const face=new GeoBuilder();face.sphere(0.28,0xffffff,{y:2.85,z:-0.34,sx:1.0,sy:1.14,sz:0.18},20);
  const mask=new MeshStandardMaterial({color:0x162d3d,roughness:1});mats.push(mask);add(face,group,mask);
  const glow=new MeshStandardMaterial({color:0xb4efff,emissive:0x73d5ff,emissiveIntensity:2,roughness:0.4});mats.push(glow);
  const eyes=new GeoBuilder();for(const x of [-0.105,0.105])eyes.sphere(0.058,0xffffff,{x,y:2.91,z:-0.374,sx:0.65,sy:1.3,sz:0.4},10);add(eyes,group,glow);
  for(const side of [-1,1]) {const arm=new Group();arm.position.set(side*0.48,2.2,0);group.add(arm);arms.push(arm);const sleeve=new GeoBuilder();const sleeveGeo=new LatheGeometry([new Vector2(0.29,-0.72),new Vector2(0.2,-0.36),new Vector2(0.13,0)],20);sleeve.add(sleeveGeo,0xbedce6,{x:side*0.2,rz:side*0.75});cloth.push(add(sleeve,arm));}
 }
 return {group,update(time,shrug){const dt=Math.max(0,Math.min(0.1,time-lastTime));const speed=initialized&&dt>0?Math.hypot(group.position.x-lastX,group.position.z-lastZ)/dt:0;rig?.update(dt,shrug>0.6?'react':speed>0.05?'walk':'idle',speed);lastTime=time;lastX=group.position.x;lastZ=group.position.z;initialized=true;arms.forEach((arm,i)=>{const side=i===0?-1:1;arm.rotation.z=side*(0.1+Math.sin(time*(kind==='ghost'?1.5:3)+i)*0.13+shrug*0.65);arm.rotation.x=Math.sin(time*2+i)*0.08;});cloth.forEach((mesh,i)=>mesh.rotation.y=Math.sin(time*1.8+i)*0.15);if(kind==='ghost'){material.opacity=0.5+Math.sin(time*1.4)*0.08;if(drape&&drapeRest){const p=drape.getAttribute('position');for(let i=0;i<p.count;i++){const x=drapeRest[i*3],y=drapeRest[i*3+1],z=drapeRest[i*3+2],a=Math.atan2(z,x),wave=Math.sin(a*3+time*1.5)*.07*Math.max(0,(2.5-y)/2);p.setXYZ(i,x+Math.cos(a)*wave,y+Math.sin(a*4+time)*.025,z+Math.sin(a)*wave);}p.needsUpdate=true;drape.computeVertexNormals();}}},dispose(){rig?.dispose();geos.forEach(g=>g.dispose());mats.forEach(m=>m.dispose());}};
}
