import { BufferGeometry, Color, Float32BufferAttribute, MeshStandardMaterial } from 'three';
import raw from './peopleBase.json?raw';
const base = JSON.parse(raw) as {position:number[];normal:number[];region:number[]};
/** CC0 Quaternius base, posed and simplified offline. Semantic garment colours preserve skin in crowds. */
export function humanBase(coat:number, skin:number, hair:number, noSignalArm: boolean | 'both'=false): BufferGeometry {
  const palette=[skin,coat,0x303948,0x22272c,hair,0x242829].map(c=>new Color(c));
  const p:number[]=[],n:number[]=[],colors:number[]=[];
  for(let i=0;i<base.region.length;i+=3) {
    if(noSignalArm && [0,1,2].some(j=>(noSignalArm === 'both' ? Math.abs(base.position[(i+j)*3]) : base.position[(i+j)*3])>0.23 && base.position[(i+j)*3+1]>0.76 && base.position[(i+j)*3+1]<1.48)) continue;
    for(let j=0;j<3;j++) { const index=i+j; p.push(...base.position.slice(index*3,index*3+3));n.push(...base.normal.slice(index*3,index*3+3));const c=palette[base.region[index]];colors.push(c.r,c.g,c.b); }
  }
  const geo=new BufferGeometry();geo.setAttribute('position',new Float32BufferAttribute(p,3));geo.setAttribute('normal',new Float32BufferAttribute(n,3));geo.setAttribute('color',new Float32BufferAttribute(colors,3));return geo;
}

/** Seated torso crop; the vehicle owns seat and steering attachment positions. */
export function seatedDriver(): BufferGeometry {
  const source=humanBase(0x425668,0xbd8d68,0x2c2929);
  const g=new BufferGeometry(),p:number[]=[],n:number[]=[],c:number[]=[];
  const pos=source.getAttribute('position'),normal=source.getAttribute('normal'),color=source.getAttribute('color');
  for(let i=0;i<pos.count;i+=3) {
    if([0,1,2].some(j=>pos.getY(i+j)<0.87)) continue;
    for(let j=0;j<3;j++){p.push(pos.getX(i+j),pos.getY(i+j)-0.87,pos.getZ(i+j));n.push(normal.getX(i+j),normal.getY(i+j),normal.getZ(i+j));c.push(color.getX(i+j),color.getY(i+j),color.getZ(i+j));}
  }
  source.dispose();g.setAttribute('position',new Float32BufferAttribute(p,3));g.setAttribute('normal',new Float32BufferAttribute(n,3));g.setAttribute('color',new Float32BufferAttribute(c,3));return g;
}

/** Tint only the white garment region of instanced walkers, keeping faces/hands/hair legible. */
export function crowdMaterial(): MeshStandardMaterial {
  const mat=new MeshStandardMaterial({vertexColors:true,roughness:0.88});
  mat.onBeforeCompile=shader=> {
    shader.vertexShader=shader.vertexShader.replace('#include <color_vertex>',`#include <color_vertex>
      #ifdef USE_INSTANCING_COLOR
        float clothing = step(0.99, min(color.r, min(color.g, color.b)));
        vColor.xyz = color.xyz * mix(vec3(1.0), instanceColor, clothing);
      #endif
    `);
  };
  mat.customProgramCacheKey=()=> 'cbhr-crowd-garment-v1';return mat;
}
