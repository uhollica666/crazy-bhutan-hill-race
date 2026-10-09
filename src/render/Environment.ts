import {
  BackSide,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import type { Course } from '../world/Course';
import { lerp, mulberry32 } from '../core/math';
import { GeoBuilder } from './geo';
import { PAL } from './palette';
import type { QualityProfile } from './quality';

const SUN_OFFSET = new Vector3(-70, 95, 55);

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const SKY_FRAG = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uMid;
uniform vec3 uHorizon;
uniform vec3 uSun;
uniform vec3 uMistColor;
uniform float uMist;
varying vec3 vDir;
void main() {
  float h = clamp(vDir.y, 0.0, 1.0);
  vec3 c = mix(uHorizon, uMid, smoothstep(0.0, 0.22, h));
  c = mix(c, uTop, smoothstep(0.18, 0.85, h));
  float s = max(dot(normalize(vDir), uSun), 0.0);
  c += vec3(1.0, 0.82, 0.55) * (pow(s, 10.0) * 0.22 + pow(s, 220.0) * 1.1);
  c = mix(c, uMistColor, uMist * (1.0 - smoothstep(0.0, 0.9, h) * 0.65));
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;

/** Sky dome, distant snow ridges, lighting and fog. Fog thickens toward the summit ("the mist rolls in"). */
export class Environment {
  readonly sun: DirectionalLight;
  readonly hemi: HemisphereLight;
  private readonly sky: Mesh;
  private readonly skyMat: ShaderMaterial;
  private readonly ridges: Mesh;
  private readonly fog: Fog;
  private readonly fogColor = new Color(PAL.fog);
  private readonly mistColor = new Color(PAL.mist);
  private readonly sunDir = SUN_OFFSET.clone().normalize();
  private baseFogFar = 800;
  private mistStrength = 0;
  private mist = 0;

  constructor(
    readonly scene: Scene,
    course: Course,
  ) {
    this.fog = new Fog(PAL.fog, 120, 800);
    scene.fog = this.fog;
    scene.background = new Color(PAL.fog);
    this.mistStrength = course.level.atmosphere.summitMist;

    this.hemi = new HemisphereLight(0xd6e8f8, 0x7a7448, 2.4);
    scene.add(this.hemi);
    this.sun = new DirectionalLight(PAL.sun, 2.8);
    this.sun.position.copy(SUN_OFFSET);
    this.sun.shadow.camera.left = -40;
    this.sun.shadow.camera.right = 40;
    this.sun.shadow.camera.top = 40;
    this.sun.shadow.camera.bottom = -40;
    this.sun.shadow.camera.near = 10;
    this.sun.shadow.camera.far = 300;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.6;
    scene.add(this.sun, this.sun.target);

    this.skyMat = new ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTop: { value: new Color(PAL.skyTop) },
        uMid: { value: new Color(PAL.skyMid) },
        uHorizon: { value: new Color(PAL.skyHorizon) },
        uSun: { value: this.sunDir.clone() },
        uMistColor: { value: new Color(PAL.mist) },
        uMist: { value: 0 },
      },
    });
    this.sky = new Mesh(new SphereGeometry(1000, 24, 12), this.skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    scene.add(this.sky);

    this.ridges = this.buildRidges(course);
    scene.add(this.ridges);
  }

  /** Layered, hazy ridge line with snow peaks, far outside the drivable area. */
  private buildRidges(course: Course): Mesh {
    const b = course.level.terrain.bounds;
    const cx = (b.minX + b.maxX) / 2;
    const cz = (b.minZ + b.maxZ) / 2;
    const rng = mulberry32(course.level.scenery.seed + 77);
    const g = new GeoBuilder();
    const rock = new Color();
    const haze = new Color(PAL.fog);
    const layers = [
      { r: 760, n: 20, h: [210, 330], k: 0.35 },
      { r: 980, n: 26, h: [300, 470], k: 0.55 },
      { r: 1250, n: 30, h: [380, 620], k: 0.75 },
    ];
    for (const L of layers) {
      for (let i = 0; i < L.n; i++) {
        const a = ((i + rng() * 0.6) / L.n) * Math.PI * 2;
        const h = lerp(L.h[0], L.h[1], rng());
        const radius = h * (0.75 + rng() * 0.35);
        const dist = L.r * (0.92 + rng() * 0.16);
        const x = cx + Math.cos(a) * dist;
        const z = cz + Math.sin(a) * dist;
        const base = rock.setHex(0x5f7388).lerp(haze, L.k).getHex();
        const snow = new Color(PAL.snow).lerp(haze, L.k * 0.8).getHex();
        const y0 = -60;
        g.cone(radius, h, base, 6, { x, y: y0 + h / 2, z, ry: rng() * 3 });
        g.cone(radius * 0.4, h * 0.42, snow, 6, { x, y: y0 + h * 0.79, z });
      }
    }
    const geo = g.build();
    // Unlit ridges with faceting baked into the vertex colours (sun side lighter), so they read as hazy
    // blue-grey masses instead of dark silhouettes.
    const nrm = geo.getAttribute('normal');
    const col = geo.getAttribute('color');
    for (let i = 0; i < col.count; i++) {
      const lit =
        0.72 +
        0.28 * Math.max(0, nrm.getX(i) * this.sunDir.x + nrm.getZ(i) * this.sunDir.z + nrm.getY(i) * 0.3);
      col.setXYZ(
        i,
        Math.min(1, col.getX(i) * lit * 1.18),
        Math.min(1, col.getY(i) * lit * 1.18),
        Math.min(1, col.getZ(i) * lit * 1.18),
      );
    }
    const mat = new MeshBasicMaterial({ vertexColors: true, fog: false });
    const mesh = new Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.name = 'ridges';
    return mesh;
  }

  applyQuality(q: QualityProfile): void {
    this.baseFogFar = q.fogFar;
    this.sun.castShadow = q.shadows;
    if (q.shadows) {
      this.sun.shadow.mapSize.set(q.shadowMapSize, q.shadowMapSize);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.applyFog();
  }

  /** 0..1 along the route: drives the rolling mist. */
  setProgress(f: number): void {
    const t = Math.min(1, Math.max(0, (f - 0.45) / 0.5));
    this.mist = t * t * (3 - 2 * t) * this.mistStrength;
    this.applyFog();
  }

  private applyFog(): void {
    this.fog.near = lerp(120, 18, this.mist);
    this.fog.far = lerp(this.baseFogFar, 230, this.mist);
    this.fog.color.copy(this.fogColor).lerp(this.mistColor, this.mist);
    (this.scene.background as Color).copy(this.fog.color);
    this.skyMat.uniforms.uMist.value = this.mist;
  }

  /** Keeps the sky centred on the camera and the shadow frustum on the car. */
  follow(camera: Vector3, focus: Vector3): void {
    this.sky.position.copy(camera);
    this.sun.target.position.copy(focus);
    this.sun.position.copy(focus).add(SUN_OFFSET);
    this.sun.target.updateMatrixWorld();
  }

  dispose(): void {
    this.sky.geometry.dispose();
    this.skyMat.dispose();
    this.ridges.geometry.dispose();
    (this.ridges.material as MeshBasicMaterial).dispose();
    this.sun.shadow.map?.dispose();
  }
}
