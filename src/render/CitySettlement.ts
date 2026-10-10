import { BufferGeometry, Group, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Vector3 } from 'three';
import { GeoBuilder } from './geo';
import { hipRoof } from './architecture';
import { mulberry32 } from '../core/math';
import type { Course } from '../world/Course';
import { createRoadHit } from '../world/Road';
import { thimphuRange } from '../data/levels/thimphuPath';

/** Lightweight background blocks: continuous settlement beyond the playable street frontages. */
function block(variant:number):BufferGeometry {
  const g=new GeoBuilder(),w=10+variant*2,d=8,h=7+variant*3;
  g.box(w+0.5,0.75,d+0.5,0x89897c,{y:0.375});
  g.box(w,h,d,[0xded5be,0xc9c4b6,0xd4c8b2][variant],{y:h/2+0.65});
  for(let f=0;f<2+variant;f++)for(const side of [-1,1]){
    const y=2.2+f*2.7;
    g.box(w+0.18,0.16,d+0.18,0x864738,{y:y+1.05});
    for(let i=0;i<4;i++){
      const x=(i-1.5)*(w/4);
      g.box(1.35,1.55,0.14,0x72533c,{x,y,z:side*(d/2+0.06)});
      g.box(1.12,1.32,0.025,0x354548,{x,y,z:side*(d/2+0.145)});
      g.box(0.045,1.35,0.04,0x997958,{x,y,z:side*(d/2+0.16)});
    }
    for(const x of [-1,1])for(const z of [-2,0,2])g.box(0.12,1.3,1.0,0x485251,{x:x*(w/2+0.03),y,z});
  }
  hipRoof(g,w+1.6,d+1.8,h+0.8,1.4,[0x596158,0x694f43,0x67736c][variant]);
  g.box(1.1,2.0,0.1,0x594532,{y:1.75,z:d/2+0.1});
  return g.build();
}

export class CitySettlement {
  readonly group=new Group();
  private readonly meshes:{mesh:InstancedMesh;total:number}[]=[];
  private readonly geometries:BufferGeometry[]=[];
  private readonly material=new MeshStandardMaterial({vertexColors:true,roughness:0.95});
  constructor(course:Course){
    this.group.name='thimphu-background-settlement';
    const rng=mulberry32(course.level.scenery.seed+710),hit=createRoadHit(),pose={x:0,y:0,z:0,tx:0,tz:-1};
    const b=course.level.terrain.bounds,cells=new Map<string,{variant:number;matrices:Matrix4[]}>();
    const matrix=new Matrix4(),rotation=new Quaternion(),position=new Vector3(),scale=new Vector3(),up=new Vector3(0,1,0);
    const end=course.startS+thimphuRange('exit').to;
    const occupied:{x:number;z:number;r:number}[]=[];
    for(let s=course.startS+45;s<end;s+=30){
      course.road.at(s,pose);
      for(const side of [-1,1])for(let row=0;row<4;row++){
        const offset=side*(58+row*49+(rng()-0.5)*12),along=(rng()-0.5)*15;
        const x=pose.x-pose.tz*offset+pose.tx*along,z=pose.z+pose.tx*offset+pose.tz*along;
        if(x<b.minX+12||x>b.maxX-12||z<b.minZ+12||z>b.maxZ-12)continue;
        if(course.road.project(x,z,hit)&&hit.dist<42)continue;
        const y=course.terrain.heightAt(x,z),dx=course.terrain.heightAt(x+6,z)-course.terrain.heightAt(x-6,z),dz=course.terrain.heightAt(x,z+5)-course.terrain.heightAt(x,z-5);
        if(y<course.terrain.waterLevel+1||Math.hypot(dx,dz)>6||occupied.some(p=>Math.hypot(x-p.x,z-p.z)<p.r+10))continue;
        const variant=Math.floor(rng()*3),sc=0.85+rng()*0.3;
        occupied.push({x,z,r:10*sc});
        rotation.setFromAxisAngle(up,Math.atan2(pose.tx,pose.tz)+(rng()-0.5)*0.18);
        matrix.compose(position.set(x,y-0.35,z),rotation,scale.set(sc,sc,sc));
        const key=`${variant}:${Math.floor(x/160)}:${Math.floor(z/160)}`;
        if(!cells.has(key))cells.set(key,{variant,matrices:[]});cells.get(key)!.matrices.push(matrix.clone());
      }
    }
    for(let i=0;i<3;i++)this.geometries.push(block(i));
    for(const {variant,matrices} of cells.values()){
      const mesh=new InstancedMesh(this.geometries[variant],this.material,matrices.length);matrices.forEach((m,i)=>mesh.setMatrixAt(i,m));
      mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();mesh.receiveShadow=true;mesh.castShadow=false;
      this.meshes.push({mesh,total:matrices.length});this.group.add(mesh);
    }
    this.group.userData.buildings=occupied.length;
  }
  setQuality(density:number):void {for(const {mesh,total} of this.meshes)mesh.count=Math.max(1,Math.ceil(total*(0.55+density*0.45)));}
  dispose():void {this.meshes.forEach(({mesh})=>mesh.dispose());this.geometries.forEach(g=>g.dispose());this.material.dispose();}
}
