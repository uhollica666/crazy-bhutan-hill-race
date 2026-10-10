import { BufferGeometry, Color, CylinderGeometry, Euler, Float32BufferAttribute, Quaternion, Vector3 } from 'three';
import { GeoBuilder } from './geo';
export function branch(g:GeoBuilder,a:[number,number,number],b:[number,number,number],r:number,color:number):void {
 const start=new Vector3(...a),end=new Vector3(...b),delta=end.clone().sub(start);
 const q=new Quaternion().setFromUnitVectors(new Vector3(0,1,0),delta.clone().normalize());const e=new Euler().setFromQuaternion(q);const mid=start.add(end).multiplyScalar(0.5);
 g.add(new CylinderGeometry(r*0.6,r,delta.length(),7),color,{x:mid.x,y:mid.y,z:mid.z,rx:e.x,ry:e.y,rz:e.z});
}
/** A continuous, irregular crown with baked leaf-cluster shading; no stacked cones. */
export function foliage(radius:number,color:number,seed:number,low=false):BufferGeometry {
 const p:number[]=[],c:number[]=[],indices:number[]=[],n=low?7:11,rows=low?4:6,base=new Color(color);
 for(let row=0;row<=rows;row++)for(let i=0;i<=n;i++) {
  const lat=row*Math.PI/rows,a=i*Math.PI*2/n;
  const variation=1+0.16*Math.sin(a*3+seed+row*0.9)+0.09*Math.cos(a*5-seed);
  const rr=Math.sin(lat)*radius*variation;
  p.push(Math.cos(a)*rr,Math.cos(lat)*radius*(1+0.08*Math.sin(a*3+seed)),Math.sin(a)*rr);
  const shade=0.75+0.23*(Math.cos(lat)+1)/2+0.07*Math.sin(a*4+seed);
  c.push(base.r*shade,base.g*shade,base.b*shade);
 }
 for(let row=0;row<rows;row++)for(let i=0;i<n;i++){const a=row*(n+1)+i,b=a+n+1;indices.push(a,a+1,b,a+1,b+1,b);}
 const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(p,3));g.setAttribute('color',new Float32BufferAttribute(c,3));g.setIndex(indices);g.computeVertexNormals();return g;
}
