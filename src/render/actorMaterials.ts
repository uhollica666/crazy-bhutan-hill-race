import { MeshStandardMaterial } from 'three';

/** Original object-space fiber and pore detail: no external texture, no screen-space shimmer.
 * Shared by skinned actors and their batches. Color remains vertex/palette owned.
 */
export function actorMaterial(kind: 'fur' | 'skin' | 'cloth' = 'cloth'): MeshStandardMaterial {
  const material = new MeshStandardMaterial({ vertexColors: true, roughness: kind === 'skin' ? 0.82 : 0.94 });
  detailMaterial(material, kind);
  return material;
}

export function detailMaterial(material: MeshStandardMaterial, kind: 'fur' | 'skin' | 'cloth'): void {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      '#include <common>\nvarying vec3 vActorRest;',
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvActorRest = position;',
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
      varying vec3 vActorRest;
      float actorHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
      float actorNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
        return mix(mix(mix(actorHash(i),actorHash(i+vec3(1,0,0)),f.x),mix(actorHash(i+vec3(0,1,0)),actorHash(i+vec3(1,1,0)),f.x),f.y),
          mix(mix(actorHash(i+vec3(0,0,1)),actorHash(i+vec3(1,0,1)),f.x),mix(actorHash(i+vec3(0,1,1)),actorHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
    `,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      float detail=actorNoise(vActorRest*${kind === 'fur' ? 'vec3(95.0,12.0,95.0)' : kind === 'skin' ? 'vec3(110.0)' : 'vec3(80.0)'});
      float macro=actorNoise(vActorRest*7.0);
      diffuseColor.rgb *= mix(${kind === 'fur' ? '0.68,1.13' : '0.89,1.05'},detail)*mix(.91,1.02,macro);
    `,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      `#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor + (detail-.5)*.08,.4,1.0);`,
    );
  };
  material.customProgramCacheKey = () => `cbhr-actor-detail-${kind}-v1`;
}
