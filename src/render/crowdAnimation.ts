import { Float32BufferAttribute, InstancedBufferAttribute, MeshDepthMaterial, RGBADepthPacking } from 'three';
import type { InstancedMesh, Material, WebGLProgramParametersWithUniforms } from 'three';

const declarations = /* glsl */ `
attribute vec2 actorGait;
uniform float actorTime;
vec3 actorShape(vec3 p) {
  float build=fract(actorGait.x*0.371+0.23);
  float head=step(1.51,p.y);
  p.x*=mix(.92,1.07,build)*mix(1.0,mix(.94,1.04,fract(build*3.71)),head);
  p.z+=.027*build*step(.92,p.y)*(1.0-step(1.39,p.y));
  return p;
}
mat3 actorRotation() {
  float side = position.x < 0.0 ? -1.0 : 1.0;
  float phase = actorTime * 6.5 + actorGait.x;
  float leg = 1.0 - step(0.91, position.y);
  float arm = step(0.23, abs(position.x)) * step(0.74, position.y) * (1.0-step(1.5,position.y));
  float angle = sin(phase) * side * actorGait.y * (leg - arm * 0.65);
  float c=cos(angle), s=sin(angle);
  return mat3(1.0,0.0,0.0, 0.0,c,s, 0.0,-s,c);
}
vec3 actorPivot() { return vec3(position.x, position.y < 0.91 ? 0.87 : 1.43, 0.0); }
`;
/** GPU joint rotations keep a crowd in one draw call. Motion state is supplied by existing gameplay. */
export function animateCrowd(mesh: InstancedMesh) {
  const gait = new InstancedBufferAttribute(new Float32Array(mesh.instanceMatrix.count * 2), 2);
  // Three's geometry cloning isolates per-batch gait attributes from other users of a prototype.
  mesh.geometry = mesh.geometry.clone();
  mesh.geometry.setAttribute('actorGait', gait);
  // A plain normal exists on every human prototype, including merged accessory geometry.
  if (!mesh.geometry.getAttribute('normal'))
    mesh.geometry.setAttribute(
      'normal',
      new Float32BufferAttribute(new Float32Array(mesh.geometry.getAttribute('position').count * 3), 3),
    );
  const clock = { value: 0 };
  const inject = (shader: WebGLProgramParametersWithUniforms) => {
    shader.uniforms.actorTime = clock;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${declarations}`)
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>\ntransformed=actorShape(transformed);vec3 pivot=actorShape(actorPivot()); transformed=actorRotation()*(transformed-pivot)+pivot;`,
      )
      .replace(
        '#include <beginnormal_vertex>',
        '#include <beginnormal_vertex>\nobjectNormal=actorRotation()*objectNormal;',
      );
  };
  const material = mesh.material as Material;
  const previous = material.onBeforeCompile.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    previous(shader, renderer);
    inject(shader);
  };
  material.customProgramCacheKey = () => 'cbhr-crowd-joints-v3';
  material.needsUpdate = true;
  const depth = new MeshDepthMaterial({ depthPacking: RGBADepthPacking });
  depth.onBeforeCompile = inject;
  depth.customProgramCacheKey = () => 'cbhr-crowd-depth-v3';
  mesh.customDepthMaterial = depth;
  return {
    set(index: number, phase: number, stride: number) {
      gait.setXY(index, phase, stride);
    },
    update(time: number) {
      clock.value = time;
      gait.needsUpdate = true;
    },
    dispose() {
      depth.dispose();
      mesh.geometry.dispose();
    },
  };
}
