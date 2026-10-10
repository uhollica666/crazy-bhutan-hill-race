import { DataTexture, LinearFilter, LinearMipmapLinearFilter, RepeatWrapping, RGBAFormat, UnsignedByteType } from 'three';

/** Original, deterministic aggregate. R = height, G = roughness; linear data, no downloaded textures. */
export function surfaceRelief(kind: string, terrain = false): DataTexture {
  const size = 128, bytes = new Uint8Array(size * size * 4);
  let seed = 0x7cb342;
  for (let i = 0; i < kind.length; i++) seed = (seed * 31 + kind.charCodeAt(i)) >>> 0;
  const wet = ['wet', 'water', 'mud', 'ice', 'slush'].includes(kind);
  const snow = ['snow', 'packed', 'frost'].includes(kind);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const n = seed / 4294967296, k = (y * size + x) * 4;
    const band = Math.sin(x*Math.PI*2/size*7 + Math.sin(y*Math.PI*2/size*3)*0.7);
    const seam = Math.pow(Math.max(0,Math.cos(y*Math.PI*2/size*9 + Math.sin(x*Math.PI*2/size*2))),12);
    const aggregate = 0.5+0.2*Math.sin(x*Math.PI*2/size*13)*Math.sin(y*Math.PI*2/size*11);
    const grain = kind==='mud'?0.3+0.3*band+n*0.2 : kind==='rocky'?aggregate*0.7+n*0.3-seam*0.25 : snow ? 0.5 + (n - 0.5) * 0.35 : n;
    bytes[k] = Math.floor(55 + grain * 145);
    bytes[k + 1] = Math.floor((wet ? 80 : snow ? 200 : 175) + n * (wet ? 60 : 55));
    bytes[k + 2] = 0; bytes[k + 3] = 255;
  }
  const texture = new DataTexture(bytes, size, size, RGBAFormat, UnsignedByteType);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.repeat.set(terrain ? 3 : 8, terrain ? 3 : 5);
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = true; texture.minFilter = LinearMipmapLinearFilter;
  texture.anisotropy = 4; texture.needsUpdate = true;
  return texture;
}
