import type { Course } from '../world/Course';
import { createRoadHit } from '../world/Road';
const hit=createRoadHit();
/** Interpolate the same three-column ribbon triangles that are actually rendered. */
function supportHeight(course:Course,x:number,z:number):number {
 let height=course.terrain.heightAt(x,z);
 const r=course.road;
 if(!r.project(x,z,hit)||Math.abs(hit.lateral)>r.halfWidthAtS(hit.s)+0.5)return height;
 let lo=0,hi=r.count-1;
 while(hi-lo>1){const mid=(lo+hi)>>1;if(r.ss[mid]<=hit.s)lo=mid;else hi=mid;}
 const vertex=(i:number,side:number):number[]=>{const px=r.xs[i]-r.tz[i]*r.hws[i]*side,pz=r.zs[i]+r.tx[i]*r.hws[i]*side;return [px,course.terrain.heightAt(px,pz)+0.07,pz];};
 for(let i=Math.max(0,lo-1);i<=Math.min(r.count-2,lo+1);i++)for(const side of [-1,0]){
  const a=vertex(i,side),b=vertex(i,side+1),d=vertex(i+1,side),e=vertex(i+1,side+1);
  for(const [v0,v1,v2] of [[a,b,d],[b,e,d]]){
   const den=(v1[2]-v2[2])*(v0[0]-v2[0])+(v2[0]-v1[0])*(v0[2]-v2[2]);
   if(Math.abs(den)<1e-8)continue;
   const u=((v1[2]-v2[2])*(x-v2[0])+(v2[0]-v1[0])*(z-v2[2]))/den;
   const v=((v2[2]-v0[2])*(x-v2[0])+(v0[0]-v2[0])*(z-v2[2]))/den;
   if(u>=-0.001&&v>=-0.001&&u+v<=1.001)height=Math.max(height,u*v0[1]+v*v1[1]+(1-u-v)*v2[1]);
  }
 }
 return height;
}
/** Keep upright actors supported by their footprint, including the render ribbon's road lift. */
export function actorGround(course:Course,x:number,z:number,yaw=0,width=0.24,length=0.22):number {
 const c=Math.cos(yaw),s=Math.sin(yaw);
 let height=supportHeight(course,x,z);
 for(const side of [-1,1])for(const end of [-1,1]) {
  const px=x+c*width*side+s*length*end,pz=z-s*width*side+c*length*end;
  height=Math.max(height,supportHeight(course,px,pz));
 }
 return height+0.015;
}
