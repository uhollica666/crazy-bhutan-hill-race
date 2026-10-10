import { BufferGeometry, Float32BufferAttribute } from 'three';
import { GeoBuilder } from './geo';
import { PAL } from './palette';
import { timberWindow } from './worldArt';

/** Actual rectangular hipped roof, with upturned eave lip, ridge caps and projecting joinery. */
export function hipRoof(g:GeoBuilder,w:number,d:number,y:number,rise:number,color:number,x=0,z=0):void {
 const ridge=Math.max(w*0.22,w-d*0.72)/2;
 const ring=[[-w/2,y,-d/2],[w/2,y,-d/2],[w/2,y,d/2],[-w/2,y,d/2]];
 const inner=ring.map(p=>[p[0]*0.93,y-0.13,p[2]*0.93]);
 const peak=[[-ridge,y+rise,0],[ridge,y+rise,0]];
 const points=[...ring,...inner,...peak].map(p=>[p[0]+x,p[1],p[2]+z]);
 const p:number[]=[];
 const tri=(a:number,b:number,c:number)=>p.push(...points[a],...points[c],...points[b]);
 for(let i=0;i<4;i++){const j=(i+1)%4;tri(i,j,j+4);tri(i,j+4,i+4);}
 tri(4,5,9);tri(4,9,8);tri(5,6,9);tri(6,7,8);tri(6,8,9);tri(7,4,8);
 const mesh=new BufferGeometry();mesh.setAttribute('position',new Float32BufferAttribute(p,3));mesh.computeVertexNormals();
 g.add(mesh,color);
 for(const side of [-1,1]) {
  g.box(w,0.22,0.22,PAL.woodDark,{x,y:y-0.1,z:z+side*d/2});
  g.box(0.22,0.22,d,PAL.woodDark,{x:x+side*w/2,y:y-0.1,z});
  for(let i=0;i<Math.floor(w/0.65);i++)g.box(0.1,0.16,0.62,PAL.wood,{x:x-w/2+0.3+i*0.65,y:y-0.23,z:z+side*(d/2-0.2)});
 }
 g.box(ridge*2+0.18,0.2,0.3,color,{x,y:y+rise+0.035,z});
 for(let i=0;i<Math.ceil(ridge*2/0.55);i++)g.cylinder(0.1,0.1,0.48,color,10,{x:x-ridge+i*0.55,y:y+rise+0.1,z,rz:Math.PI/2});
}

export function stoneBase(g:GeoBuilder,w:number,d:number,h=0.75,x=0,z=0):void {
 g.box(w,h,d,0x8a8478,{x,y:h/2,z});
 for(const side of [-1,1])for(let row=0;row<3;row++)for(let i=0;i<Math.ceil(w/1.15);i++) {
  const xx=-w/2+(i+0.5)*w/Math.ceil(w/1.15);
  g.box(w/Math.ceil(w/1.15)-0.025,h/3-0.022,0.055,[0xa29b8c,0xb8ae9a,0x8f897d][(i+row)%3],{x:x+xx,y:(row+0.5)*h/3,z:z+side*(d/2+0.008)});
 }
}

function frieze(g:GeoBuilder,w:number,d:number,y:number):void {
 g.box(w+0.32,0.32,d+0.32,PAL.maroon,{y});
 for(const side of [-1,1])for(let i=0;i<Math.floor(w/0.5);i++) {
  const x=-w/2+0.25+i*0.5;
  g.box(0.15,0.12,0.04,0xe8ba65,{x,y,z:side*(d/2+0.19),rz:Math.PI/4});
  g.box(0.2,0.055,0.055,PAL.woodDark,{x,y:y-0.17,z:side*(d/2+0.18)});
 }
}

/** Street-facing Thimphu block: arcade, timber bay windows, balconies and decorated cornice. */
export function cityBlock(kind:'hotel'|'office'|'restaurant'|'shops'):BufferGeometry {
 const g=new GeoBuilder();
 const w=kind==='hotel'?16:kind==='office'?13:kind==='shops'?24:11;
 const d=kind==='hotel'?12:kind==='office'?9:8;
 const floors=kind==='hotel'?4:kind==='office'?5:kind==='shops'?3:2;
 const height=3.25*floors+0.65;
 const wall=kind==='office'?0xd5d1c3:kind==='restaurant'?0xe8d9bf:0xece5d5;
 stoneBase(g,w+0.6,d+0.6);
 g.box(w,height-0.7,d,wall,{y:(height+0.7)/2});
 const bays=kind==='shops'?8:kind==='hotel'?6:4;
 const spacing=w/bays;
 for(let f=1;f<floors;f++) {
  const y=0.7+f*3.25+1.5;
  frieze(g,w,d,y+1.35);
  for(const side of [-1,1]) {
   for(let i=0;i<bays;i++) {
    const x=(i-(bays-1)/2)*spacing;
    timberWindow(g,x,y,side*(d/2+0.17),spacing*0.76,1.95,side<0?Math.PI:0);
    g.box(spacing*0.94,0.18,0.6,PAL.woodDark,{x,y:y-1.07,z:side*(d/2+0.26)});
    for(const xx of [-spacing*0.27,spacing*0.27]) g.box(0.13,0.34,0.28,PAL.wood,{x:x+xx,y:y-1.25,z:side*(d/2+0.18),rx:side*0.35});
   }
   for(let i=0;i<3;i++)timberWindow(g,side*(w/2+0.12),y,(i-1)*d*0.27,1.5,1.9,side*Math.PI/2);
  }
 }
 // Recessed shop glazing is surrounded by an arcade and shaded canopy.
 for(let i=0;i<bays;i++) {
  const x=(i-(bays-1)/2)*spacing;
  g.box(spacing*0.83,2.5,0.08,0x25383e,{x,y:1.92,z:d/2+0.04});
  g.box(0.075,2.45,0.1,0xb8b4a7,{x,y:1.92,z:d/2+0.1});
  for(const dx of [-spacing*0.44,spacing*0.44]) {
   g.box(0.17,2.6,0.2,PAL.woodDark,{x:x+dx,y:1.98,z:d/2+0.65});
   g.box(0.3,0.16,0.3,PAL.gold,{x:x+dx,y:3.2,z:d/2+0.65});
  }
  g.box(spacing*0.9,0.43,0.14,[0x8a3027,0x34594e,0x304c66,0xa57e45][i%4],{x,y:3.37,z:d/2+0.7});
  for(let j=0;j<3;j++)g.box(0.28,0.024,0.02,0xe3d9bc,{x:x+(j-1)*0.42,y:3.38,z:d/2+0.785});
 }
 g.box(w+0.85,0.18,1.65,0x616659,{y:3.77,z:d/2+0.7,rx:0.12});
 // Balcony breaks the repetition and casts a strong shadow over the entrance.
 const bw=kind==='hotel'?7.2:kind==='restaurant'?8:4.5;
 g.box(bw,0.22,1.55,PAL.woodDark,{y:4.02,z:d/2+0.76});
 g.box(bw,0.09,0.09,PAL.wood,{y:4.98,z:d/2+1.49});
 for(let i=0;i<=Math.floor(bw/0.3);i++)g.box(0.065,0.87,0.065,PAL.woodDark,{x:-bw/2+i*bw/Math.floor(bw/0.3),y:4.49,z:d/2+1.49});
 frieze(g,w+0.2,d+0.2,height-0.2);
 hipRoof(g,w+3.2,d+3,height+0.1,kind==='office'?2.25:2.0,kind==='restaurant'?0x875043:0x53665d);
 // Threshold steps, corner downpipes, planters and a timber main door.
 for(let i=0;i<3;i++)g.box(2.25+i*0.22,0.14,0.34,0xb2a998,{y:0.56-i*0.14,z:d/2+0.23+i*0.32});
 g.box(1.1,2.3,0.13,PAL.woodDark,{y:1.84,z:d/2+0.15});
 g.box(0.07,0.25,0.04,PAL.gold,{x:0.34,y:1.7,z:d/2+0.24});
 for(const side of [-1,1]) {
  g.cylinder(0.04,0.04,height-0.5,0x666c63,8,{x:side*(w/2+0.06),y:height/2,z:d/2+0.06});
  g.box(0.7,0.45,0.6,0x8f8370,{x:side*1.9,y:0.9,z:d/2+0.8});
  for(let i=0;i<3;i++)g.sphere(0.2,0x4c6544,{x:side*1.9+(i-1)*0.15,y:1.2,z:d/2+0.8,sy:1.4},7);
 }
 return g.build();
}

/** Chorten silhouette: tiered plinth, tapered white body, cornices, arched niches and thirteen rings. */
export function stupaGeometry():BufferGeometry {
 const g=new GeoBuilder();stoneBase(g,3.6,3.6,0.35);
 for(let i=0;i<3;i++)g.box(3.4-i*0.36,0.28,3.4-i*0.36,PAL.whitewash,{y:0.5+i*0.28});
 g.frustum(2.3,1.85,1.62,0xe9e2d2,{y:1.88});
 g.box(2.6,0.14,2.6,0xd0c8b7,{y:1.12});
 g.box(2.22,0.26,2.22,PAL.maroon,{y:2.61});
 g.box(2.5,0.12,2.5,0xd8cdb7,{y:2.81});
 for(let side=0;side<4;side++) {
  const a=side*Math.PI/2,dx=Math.sin(a),dz=Math.cos(a);
  g.box(0.52,0.67,0.07,PAL.woodDark,{x:dx*1.05,y:1.9,z:dz*1.05,ry:a});
  g.cylinder(0.26,0.26,0.07,PAL.woodDark,16,{x:dx*1.05,y:2.22,z:dz*1.05,rx:Math.PI/2,rz:-a});
  g.box(0.65,0.12,0.16,PAL.maroon,{x:dx*1.08,y:1.55,z:dz*1.08,ry:a});
 }
 g.sphere(0.88,PAL.whitewash,{y:3.34,sy:0.71},20);
 g.box(0.72,0.55,0.72,0xe8d9ab,{y:4.07});
 for(let i=0;i<13;i++)g.cylinder(0.49-i*0.031,0.54-i*0.031,0.11,PAL.gold,20,{y:4.43+i*0.11});
 g.cylinder(0.5,0.5,0.065,PAL.gold,20,{y:5.94});
 g.sphere(0.13,PAL.gold,{y:6.14},12);g.cone(0.055,0.22,PAL.gold,10,{y:6.35});
 return g.build();
}
