import {
  BufferGeometry,
  Float32BufferAttribute,
  MeshStandardMaterial,
  MeshDepthMaterial,
  RGBADepthPacking,
  DoubleSide,
  SRGBColorSpace,
  TextureLoader,
} from 'three';
import type { Texture, WebGLProgramParametersWithUniforms } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GeoBuilder } from './geo';
import { branch } from './organic';
import { PAL } from './palette';

export function premiumPineGeometry(variant: number): BufferGeometry {
  const trunk = new GeoBuilder();
  branch(trunk, [0, 0, 0], [0.06, 5.75, 0.02], 0.18, PAL.bark);
  const p: number[] = [],
    uv: number[] = [],
    colors: number[] = [];
  for (let tier = 0; tier < 9; tier++)
    for (let b = 0; b < 6; b++) {
      const angle = (b * Math.PI) / 3 + tier * 0.78 + variant * 0.6,
        y = 1.1 + tier * 0.52,
        r = 1.75 - tier * 0.17;
      const dx = Math.cos(angle),
        dz = Math.sin(angle);
      branch(trunk, [0, y + 0.1, 0], [dx * r, y - 0.15, dz * r], 0.025, PAL.bark);
      for (let spray = 0; spray < 6; spray++) {
        const t = (spray + 1) / 7,
          cx = dx * r * t,
          cz = dz * r * t,
          cy = y - 0.16 * t;
        const a = angle + (spray % 2 ? 0.55 : -0.55),
          length = r * (0.55 - 0.1 * t),
          width = length * 0.48;
        // Two crossed, outward sprays: vertical, then inclined to the branch plane.
        for (let plane = 0; plane < 2; plane++) {
          const wx = -Math.sin(a) * width,
            wz = Math.cos(a) * width;
          const ex = Math.cos(a) * length,
            ez = Math.sin(a) * length,
            ey = length * (plane ? 0.15 : 0.65);
          const points = [
            [cx - wx, cy, cz - wz],
            [cx + wx, cy, cz + wz],
            [cx + wx + ex, cy + ey, cz + wz + ez],
            [cx - wx + ex, cy + ey, cz - wz + ez],
          ];
          const coords = [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
          ];
          for (const i of [0, 1, 2, 0, 2, 3]) {
            p.push(...points[i]);
            uv.push(...coords[i]);
            colors.push(0.92, 0.98, 0.9);
          }
        }
      }
    }
  const bark = trunk.build(),
    count = bark.getAttribute('position').count;
  bark.setAttribute('uv', new Float32BufferAttribute(new Float32Array(count * 2), 2));
  bark.setAttribute('foliageMask', new Float32BufferAttribute(new Float32Array(count), 1));
  const needles = new BufferGeometry();
  needles.setAttribute('position', new Float32BufferAttribute(p, 3));
  needles.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  needles.setAttribute('color', new Float32BufferAttribute(colors, 3));
  needles.setAttribute('foliageMask', new Float32BufferAttribute(new Float32Array(p.length / 3).fill(1), 1));
  needles.computeVertexNormals();
  const geometry = mergeGeometries([bark, needles], false)!;
  bark.dispose();
  needles.dispose();
  geometry.computeBoundingSphere();
  return geometry;
}

export function createPineMaterial() {
  const material = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.9,
    side: DoubleSide,
    alphaTest: 0.42,
  });
  const depth = new MeshDepthMaterial({ depthPacking: RGBADepthPacking, side: DoubleSide, alphaTest: 0.42 });
  let texture: Texture | null = null,
    disposed = false,
    loading = false;
  const time = { value: 0 },
    wind = { value: 1 };
  function inject(shader: WebGLProgramParametersWithUniforms) {
    shader.uniforms.pineTime = time;
    shader.uniforms.pineWind = wind;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute float foliageMask; varying float vFoliageMask; uniform float pineTime; uniform float pineWind;',
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvFoliageMask=foliageMask;transformed.x+=sin(pineTime*1.3+position.y*1.4)*0.065*foliageMask*pineWind;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFoliageMask;')
      .replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP\nvec4 branchTexel=texture2D(map,vMapUv);diffuseColor*=mix(vec4(1.0),branchTexel,vFoliageMask);\n#endif`,
      );
  }
  material.onBeforeCompile = inject;
  depth.onBeforeCompile = inject;
  material.customProgramCacheKey = () => 'cbhr-photo-pine-v1';
  depth.customProgramCacheKey = () => 'cbhr-photo-pine-depth-v1';
  return {
    material,
    depth,
    get ready() {
      return !!texture;
    },
    setEnabled(enabled: boolean) {
      wind.value = enabled ? 1 : 0;
      if (!enabled || loading || texture) return;
      loading = true;
      void new TextureLoader()
        .loadAsync(`${import.meta.env.BASE_URL}remaster/pine-branch.webp`)
        .then((map) => {
          if (disposed) {
            map.dispose();
            return;
          }
          texture = map;
          map.colorSpace = SRGBColorSpace;
          map.anisotropy = 4;
          material.map = depth.map = map;
          material.needsUpdate = depth.needsUpdate = true;
        })
        .catch(() => {
          /* Solid authored fallback retains its silhouette. */
        });
    },
    update(t: number) {
      time.value = t;
    },
    dispose() {
      disposed = true;
      texture?.dispose();
      material.dispose();
      depth.dispose();
    },
  };
}
