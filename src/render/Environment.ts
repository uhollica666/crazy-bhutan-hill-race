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
import type { TimeOfDay, WeatherKind } from '../data/types';
import { TIME, WEATHER } from '../data/weather';
import { lerp } from '../core/math';
import { buildMountainRing } from './mountains';
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
  private readonly visibility: number;
  private readonly mistStart: number;
  private mistStrength = 0;
  private mist = 0;
  private weatherVis = 1;
  private ambientIntensity = 1;
  private flashLevel = 0;
  private readonly look: Course['level']['look'];
  private readonly baseSun: number;
  private readonly baseHemi: number;
  private readonly baseSunColor: Color;
  private readonly baseFog: Color;
  private readonly baseSky: { top: Color; mid: Color; horizon: Color };
  private readonly scratch = new Color();
  /** True when headlights and street lamps should be lit. */
  lightsOn = false;

  constructor(
    readonly scene: Scene,
    course: Course,
  ) {
    const look = course.level.look;
    this.look = look;
    this.fogColor.setHex(look.fog ?? PAL.fog);
    this.mistColor.setHex(look.mist ?? PAL.mist);
    this.fog = new Fog(this.fogColor.getHex(), 120, 800);
    scene.fog = this.fog;
    scene.background = new Color(this.fogColor.getHex());
    this.mistStrength = course.level.atmosphere.summitMist;
    this.mistStart = course.level.atmosphere.mistStart;
    this.visibility = course.level.atmosphere.visibility;

    this.baseSun = look.sun ?? 3.1;
    this.baseHemi = look.hemi ?? 1.7;
    this.baseSunColor = new Color(look.sunColor ?? PAL.sun);
    this.baseFog = new Color(look.fog ?? PAL.fog);
    this.baseSky = {
      top: new Color(look.skyTop ?? PAL.skyTop),
      mid: new Color(look.skyMid ?? PAL.skyMid),
      horizon: new Color(look.skyHorizon ?? PAL.skyHorizon),
    };
    this.hemi = new HemisphereLight(0xe3e1d6, 0x6a5a3c, look.hemi ?? 1.7);
    scene.add(this.hemi);
    this.sun = new DirectionalLight(look.sunColor ?? PAL.sun, look.sun ?? 3.1);
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
        uTop: { value: new Color(look.skyTop ?? PAL.skyTop) },
        uMid: { value: new Color(look.skyMid ?? PAL.skyMid) },
        uHorizon: { value: new Color(look.skyHorizon ?? PAL.skyHorizon) },
        uSun: { value: this.sunDir.clone() },
        uMistColor: { value: this.mistColor.clone() },
        uMist: { value: 0 },
      },
    });
    this.sky = new Mesh(new SphereGeometry(1000, 24, 12), this.skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    scene.add(this.sky);

    this.ridges = this.buildRidges(course, this.fogColor.getHex());
    scene.add(this.ridges);
  }

  /** Faceted mountain ranges (forested foothills, bare rock, snow caps) in three hazy layers around the level. */
  private buildRidges(course: Course, hazeColor: number): Mesh {
    const b = course.level.terrain.bounds;
    const cx = (b.minX + b.maxX) / 2;
    const cz = (b.minZ + b.maxZ) / 2;
    const seed = course.level.scenery.seed;
    const look = course.level.look;
    const snowFree = (look.snowFrom ?? 165) > 1000;
    const geo = buildMountainRing(
      cx,
      cz,
      [
        { radius: 820, columns: 110, base: 210, amp: 360, haze: 0.28, seed: seed + 1 },
        { radius: 1120, columns: 130, base: 300, amp: 560, haze: 0.5, seed: seed + 2 },
        { radius: 1500, columns: 150, base: 420, amp: 760, haze: 0.7, seed: seed + 3 },
      ],
      {
        forest: 0x3d4f37,
        rock: 0x77736a,
        snow: 0xeceae3,
        haze: hazeColor,
        sun: this.sunDir.clone(),
        snowLine: snowFree ? 0.97 : 0.58,
      },
    );
    const mat = new MeshBasicMaterial({ vertexColors: true, fog: false });
    const mesh = new Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.name = 'ridges';
    return mesh;
  }

  applyQuality(q: QualityProfile): void {
    this.baseFogFar = q.fogFar * this.visibility * this.weatherVis;
    this.sun.castShadow = q.shadows;
    if (q.shadows) {
      this.sun.shadow.mapSize.set(q.shadowMapSize, q.shadowMapSize);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.applyFog();
  }

  /** Applies weather and time of day: sky, light, fog distance and colour. Cheap enough to call on change only. */
  setConditions(weather: WeatherKind, time: TimeOfDay, baseFogFar?: number): void {
    const w = WEATHER[weather];
    const t = TIME[time];
    const grey = new Color(0x8a929c);
    const tint = (base: Color, to: number, mix: number, out: Color): Color => {
      out.copy(base).lerp(this.scratch.setHex(to), mix);
      out.lerp(grey, w.gloom * 0.55);
      if (time === 'night') out.multiplyScalar(0.85);
      return out;
    };
    const u = this.skyMat.uniforms;
    tint(this.baseSky.top, t.skyTint, t.skyMix, u.uTop.value as Color);
    tint(this.baseSky.mid, t.skyTint, t.skyMix, u.uMid.value as Color);
    tint(this.baseSky.horizon, t.skyTint, t.skyMix, u.uHorizon.value as Color);
    tint(this.baseFog, t.fogTint, t.fogMix, this.fogColor);
    this.mistColor.setHex(this.look.mist ?? PAL.mist).lerp(this.fogColor, t.fogMix * 0.8);
    (u.uMistColor.value as Color).copy(this.mistColor);
    const dim = 1 - w.gloom * 0.45;
    this.sun.color.copy(this.baseSunColor).lerp(this.scratch.setHex(t.sunColor), t.skyMix > 0 ? 0.8 : 0);
    this.sun.intensity = this.baseSun * t.sun * dim;
    this.hemi.intensity = this.baseHemi * t.hemi * dim;
    this.ambientIntensity = this.hemi.intensity;
    this.sunHeight = t.sunHeight;
    (this.ridges.material as MeshBasicMaterial).color.setScalar(
      Math.max(0.1, t.hemi * (1 - w.gloom * 0.3)) ** 0.8,
    );
    this.weatherVis = w.visibility;
    this.lightsOn = t.headlights || w.visibility < 0.35;
    if (baseFogFar !== undefined) this.baseFogFar = baseFogFar * this.visibility * this.weatherVis;
    else this.baseFogFar = (this.baseFogFar / Math.max(0.01, this.prevWeatherVis)) * this.weatherVis;
    this.prevWeatherVis = this.weatherVis;
    this.applyFog();
  }

  private sunHeight = 1;
  private prevWeatherVis = 1;

  /** Thunder flash 0..1 (decays by the caller). */
  setFlash(v: number): void {
    if (v === this.flashLevel) return;
    this.flashLevel = v;
    this.hemi.intensity = this.ambientIntensity * (1 + v * 2.2);
    this.applyFog();
  }

  /** 0..1 along the route: drives the rolling mist. */
  setProgress(f: number): void {
    const t = Math.min(1, Math.max(0, (f - this.mistStart) / Math.max(0.1, 0.95 - this.mistStart)));
    this.mist = t * t * (3 - 2 * t) * this.mistStrength;
    this.applyFog();
  }

  private applyFog(): void {
    this.fog.near = lerp(120 * this.visibility * this.weatherVis, 14, this.mist);
    this.fog.far = lerp(this.baseFogFar, 230 * Math.min(1, this.weatherVis + 0.25), this.mist);
    this.fog.color.copy(this.fogColor).lerp(this.mistColor, this.mist);
    if (this.flashLevel > 0) this.fog.color.lerp(this.scratch.setHex(0xe8eeff), this.flashLevel * 0.5);
    (this.scene.background as Color).copy(this.fog.color);
    this.skyMat.uniforms.uMist.value = this.mist;
  }

  /** Keeps the sky centred on the camera and the shadow frustum on the car. */
  follow(camera: Vector3, focus: Vector3): void {
    this.sky.position.copy(camera);
    this.sun.target.position.copy(focus);
    this.sun.position.set(
      focus.x + SUN_OFFSET.x,
      focus.y + SUN_OFFSET.y * this.sunHeight,
      focus.z + SUN_OFFSET.z,
    );
    this.sun.target.updateMatrixWorld();
  }

  dispose(): void {
    this.scene.remove(this.hemi, this.sun, this.sun.target, this.sky, this.ridges);
    this.sky.geometry.dispose();
    this.skyMat.dispose();
    this.ridges.geometry.dispose();
    (this.ridges.material as MeshBasicMaterial).dispose();
    this.sun.shadow.map?.dispose();
  }
}
