import { PCFShadowMap, Scene, WebGLRenderer } from 'three';
import type { PerspectiveCamera } from 'three';
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
  profile: QualityProfile;
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
    this.renderer.domElement.setAttribute('aria-label', 'Game view');
    this.renderer.domElement.style.touchAction = 'none';
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.onContextLost?.();
    });
    this.applySize();
    this.applyShadows();
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

  /** Called on window resize / orientation change / quality change. Returns CSS size. */
  applySize(): { width: number; height: number } {
    const width = this.host.clientWidth || window.innerWidth;
    const height = this.host.clientHeight || window.innerHeight;
    const ratio = Math.min(window.devicePixelRatio || 1, this.profile.maxPixelRatio);
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
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
