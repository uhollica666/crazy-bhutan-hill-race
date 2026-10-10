import { CanvasTexture, Color, InstancedMesh, Matrix4, MeshBasicMaterial, PlaneGeometry, Quaternion, Vector3 } from 'three';
import type { Course } from '../world/Course';
import { mulberry32, smoothstep } from '../core/math';

/** Broad, feathered wisps; world anchored and depth tested, never an opaque weather wall. */
export class MistField {
  readonly mesh:InstancedMesh;
  private readonly texture:CanvasTexture;
  private readonly material:MeshBasicMaterial;
  private readonly seeds:{x:number;z:number;y:number;w:number;h:number;phase:number}[]=[];
  private count=48;
  private readonly matrix=new Matrix4();
  private readonly position=new Vector3();
  private readonly scale=new Vector3();
  private readonly rotation=new Quaternion();
  constructor(private readonly course:Course){
    const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d')!;
    const data=ctx.createImageData(128,128);
    for(let y=0;y<128;y++)for(let x=0;x<128;x++){
      const nx=(x-64)/64,ny=(y-64)/64,r=Math.sqrt(nx*nx+ny*ny);
      const feather=Math.pow(Math.max(0,1-r*r),3);
      const grain=0.7+0.15*Math.sin(x*0.11+Math.sin(y*0.07)*2)+0.15*Math.cos(y*0.13-x*0.05);
      const k=(x+y*128)*4;data.data[k]=data.data[k+1]=data.data[k+2]=255;data.data[k+3]=255*feather*grain;
    }
    ctx.putImageData(data,0,0);this.texture=new CanvasTexture(c);
    this.material=new MeshBasicMaterial({map:this.texture,transparent:true,opacity:0.06,depthWrite:false,fog:false});
    this.mesh=new InstancedMesh(new PlaneGeometry(1,1),this.material,128);this.mesh.name='drifting-mist';this.mesh.frustumCulled=false;this.mesh.renderOrder=3;
    const rng=mulberry32(course.level.scenery.seed+991);
    for(let i=0;i<128;i++)this.seeds.push({x:rng()*900,z:rng()*900,y:4+rng()*28,w:100+rng()*140,h:14+rng()*36,phase:rng()*6.28});
  }
  setQuality(detail:number):void {this.count=[24,48,80,128][Math.min(3,detail)];}
  update(camera:Vector3,time:number,strength:number,color:Color):void {
    this.mesh.visible=strength>0.005;if(!this.mesh.visible)return;
    this.material.color.copy(color);this.material.opacity=0.09*strength*48/this.count;
    const candidates=this.seeds.slice(0,this.count).map(seed=>{
      const wrap=(v:number,origin:number)=>origin+((v-origin+450)%900+900)%900-450;
      const x=wrap(seed.x+time*1.4,camera.x),z=wrap(seed.z+Math.sin(time*0.08+seed.phase)*14,camera.z);
      return {seed,x,z,d:Math.hypot(x-camera.x,z-camera.z)};
    }).sort((a,b)=>b.d-a.d);
    candidates.forEach(({seed,x,z,d},i)=>{
      const y=this.course.terrain.heightAt(x,z)+seed.y;
      this.position.set(x,y,z);this.rotation.setFromAxisAngle(new Vector3(0,1,0),Math.atan2(camera.x-x,camera.z-z));
      // Wisps dissolve before the camera crosses them and before the wrapping boundary.
      const fade=smoothstep(12,70,d)*(1-smoothstep(340,440,d));
      this.scale.set(seed.w*fade,seed.h*fade,1);this.matrix.compose(this.position,this.rotation,this.scale);this.mesh.setMatrixAt(i,this.matrix);
    });
    this.mesh.count=this.count;this.mesh.instanceMatrix.needsUpdate=true;
  }
  dispose():void {this.mesh.geometry.dispose();this.material.dispose();this.texture.dispose();this.mesh.dispose();}
}
