import { BufferGeometry, CanvasTexture, Float32BufferAttribute, SRGBColorSpace } from 'three';

/** Bent tapered blades with a shaded root; no external texture dependency. */
export function grassTuft(blades:number):BufferGeometry {
  const pos:number[]=[],col:number[]=[],idx:number[]=[];
  for(let i=0;i<blades;i++){
    const a=i*2.399, h=0.28+(i%5)*0.075, x=Math.cos(a)*0.12,z=Math.sin(a)*0.12;
    const dx=Math.cos(a+0.6),dz=Math.sin(a+0.6),start=pos.length/3;
    for(let j=0;j<=3;j++)for(const side of [-1,1]){
      const t=j/3,w=(1-t)*0.027;
      pos.push(x+dx*t*t*0.22-dz*w*side,h*t,z+dz*t*t*0.22+dx*w*side);
      col.push(0.08+t*0.1,0.19+t*0.16,0.025+t*0.04);
    }
    for(let j=0;j<3;j++){const k=start+j*2;idx.push(k,k+2,k+1,k+1,k+2,k+3,k+1,k+2,k,k+3,k+2,k+1);}
  }
  const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(pos,3));g.setAttribute('color',new Float32BufferAttribute(col,3));g.setIndex(idx);g.computeVertexNormals();return g;
}

/** Woven threads and a printed border, without imitating sacred writing. */
export function flagFabric():CanvasTexture {
  const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d')!;
  g.fillStyle='#eee9dc';g.fillRect(0,0,128,128);
  for(let i=0;i<128;i+=2){g.fillStyle=i%4?'#d8d2c5':'#faf5ea';g.fillRect(i,0,1,128);g.fillRect(0,i,128,1);}
  g.strokeStyle='#827c70';g.lineWidth=2;g.strokeRect(7,7,114,114);g.strokeRect(11,11,106,106);
  g.lineWidth=1;for(let y=30;y<105;y+=9){g.beginPath();g.moveTo(24,y);g.lineTo(104,y);g.stroke();}
  const tex=new CanvasTexture(c);tex.colorSpace=SRGBColorSpace;return tex;
}
