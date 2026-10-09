import { ACESFilmicToneMapping, PCFShadowMap, PMREMGenerator, SRGBColorSpace, Scene, WebGLRenderer } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { PerspectiveCamera, Texture } from 'three';
import { setVehicleEnvMap } from './assets';
import type { QualityLevel } from '../storage/SaveStore';
import { QUALITY } from './quality';
import type { QualityProfile } from './quality';

export function isWebGLAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return (
      !!(window.WebGL2RenderingContext && c.getContext('webgl2')) ||
      !!(window.WebGLRenderingContext && c.getContext('webgl'))
    );
  } catch {
    return false;
  }
}

export interface RenderStats {
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
}

/** Owns the WebGL renderer, canvas sizing and the quality profile. */
export class GameRenderer {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly envMap: Texture;
  profile: QualityProfile;
  /** 0.5..1 multiplier from the adaptive-resolution controller. */
  resolutionScale = 1;
  level: QualityLevel;
  /** Set when WebGL context is lost so the app can show a message instead of a frozen frame. */
  onContextLost: (() => void) | null = null;

  constructor(
    private readonly host: HTMLElement,
    level: QualityLevel,
  ) {
    this.level = level;
    this.profile = QUALITY[level];
    this.renderer = new WebGLRenderer({
      antialias: this.profile.antialias,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.shadowMap.type = PCFShadowMap;
    // Filmic tone mapping keeps highlights from clipping to flat white and lets lighting do the colour work.
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.domElement.setAttribute('aria-label', 'Game view');
    this.renderer.domElement.style.touchAction = 'none';
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.onContextLost?.();
    });
    this.applySize();
    this.applyShadows();
    // A small neutral studio environment gives painted metal and glass something to reflect. It is NOT set as
    // scene.environment (that would light the whole world like ambient fill, which kills night); the vehicle
    // materials take it as their own envMap, scaled by the time of day.
    const pmrem = new PMREMGenerator(this.renderer);
    this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    setVehicleEnvMap(this.envMap);
    pmrem.dispose();
  }

  setQuality(level: QualityLevel): void {
    this.level = level;
    this.profile = QUALITY[level];
    this.renderer.shadowMap.enabled = this.profile.shadows;
    this.applyShadows();
    this.applySize();
  }

  private applyShadows(): void {
    this.renderer.shadowMap.enabled = this.profile.shadows;
    this.renderer.shadowMap.needsUpdate = true;
  }

  setResolutionScale(s: number): void {
    this.resolutionScale = s;
    this.applySize();
  }

  /** Called on window resize / orientation change / quality change. Returns CSS size. */
  applySize(): { width: number; height: number } {
    const width = this.host.clientWidth || window.innerWidth;
    const height = this.host.clientHeight || window.innerHeight;
    const ratio =
      Math.min(window.devicePixelRatio || 1, this.profile.maxPixelRatio) *
      this.profile.renderScale *
      this.resolutionScale;
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(width, height, false);
    return { width, height };
  }

  render(camera: PerspectiveCamera): void {
    this.renderer.render(this.scene, camera);
  }

  stats(): RenderStats {
    const i = this.renderer.info;
    return {
      calls: i.render.calls,
      triangles: i.render.triangles,
      geometries: i.memory.geometries,
      textures: i.memory.textures,
    };
  }

  dispose(): void {
    setVehicleEnvMap(null);
    this.envMap.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
