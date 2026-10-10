import { ACESFilmicToneMapping, PCFShadowMap, PMREMGenerator, SRGBColorSpace, Scene, WebGLRenderer } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import type { PerspectiveCamera, Texture, WebGLRenderTarget } from 'three';
import { setVehicleEnvMap } from './assets';
import type { QualityLevel } from '../storage/SaveStore';
import { QUALITY, resolveQuality } from './quality';
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
  private outdoorMap: Texture | null = null;
  private outdoorTarget: WebGLRenderTarget | null = null;
  private readonly studioTarget: WebGLRenderTarget;
  private disposed = false;
  private hdrLoading = false;
  private composer: EffectComposer | null = null;
  private occlusion: SSAOPass | null = null;
  private output: OutputPass | null = null;
  private beauty: RenderPass | null = null;
  private edgeAA: ShaderPass | null = null;
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
    this.level = resolveQuality(level);
    this.profile = QUALITY[this.level];
    this.renderer = new WebGLRenderer({
      antialias: this.profile.antialias,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.level=resolveQuality(level,this.renderer.getContext());
    this.profile=QUALITY[this.level];
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
    const room = new RoomEnvironment();
    this.studioTarget = pmrem.fromScene(room, 0.04);
    this.envMap = this.studioTarget.texture;
    room.dispose();
    setVehicleEnvMap(this.envMap);
    pmrem.dispose();
    this.loadOutdoorEnvironment();
  }

  setQuality(level: QualityLevel): void {
    this.level = resolveQuality(level,this.renderer.getContext());
    this.profile = QUALITY[this.level];
    this.applyShadows();this.applySize();
    this.loadOutdoorEnvironment();
    if (this.profile.surfaceDetail < 2) this.disposePost();
  }

  private loadOutdoorEnvironment(): void {
    if (!this.profile.surfaceDetail || this.hdrLoading || this.outdoorMap) return;
    this.hdrLoading = true;
    void new HDRLoader().loadAsync(`${import.meta.env.BASE_URL}remaster/rooitou_park.hdr`).then(source => {
      if (this.disposed) { source.dispose(); return; }
      const generator = new PMREMGenerator(this.renderer);
      this.outdoorTarget = generator.fromEquirectangular(source);
      this.outdoorMap = this.outdoorTarget.texture;
      source.dispose(); generator.dispose();
    }).catch(() => { /* Neutral studio fallback remains usable offline if a bundle is incomplete. */ });
  }

  private disposePost(): void {
    // SSAOPass currently omits these allocations from its upstream dispose implementation.
    this.occlusion?.ssaoMaterial.dispose(); this.occlusion?.noiseTexture.dispose();
    this.occlusion?.dispose(); this.output?.dispose(); this.beauty?.dispose(); this.edgeAA?.dispose(); this.composer?.dispose();
    this.edgeAA=null;
    this.occlusion = null; this.output = null; this.composer = null; this.beauty = null;
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
    // Bound post-process allocations even on 4K/high-DPI displays; direct Low/Medium keep their own ratio.
    const postRatio=Math.min(ratio,this.profile.surfaceDetail>2?1.5:1.25,2048/Math.max(width,height));
    this.composer?.setPixelRatio(postRatio);
    this.composer?.setSize(width, height);
    this.edgeAA?.uniforms.resolution.value.set(1/(width*postRatio),1/(height*postRatio));
    return { width, height };
  }

  render(camera: PerspectiveCamera): void {
    setVehicleEnvMap(this.profile.surfaceDetail ? this.outdoorMap ?? this.envMap : this.envMap);
    this.renderWithOcclusion(this.scene,camera);
  }

  private renderWithOcclusion(scene: Scene,camera: PerspectiveCamera):void {
    if (this.profile.surfaceDetail < 2) { this.renderer.render(scene, camera); return; }
    if (!this.composer) {
      this.composer = new EffectComposer(this.renderer);
      this.occlusion = new SSAOPass(scene, camera);
      this.occlusion.kernelRadius = .85;
      this.occlusion.minDistance = 0.002;
      this.occlusion.maxDistance = 0.045;
      this.output = new OutputPass();
      this.beauty = new RenderPass(scene,camera);
      this.edgeAA=new ShaderPass(FXAAShader);
      this.composer.addPass(this.beauty); this.composer.addPass(this.occlusion); this.composer.addPass(this.edgeAA); this.composer.addPass(this.output);
      this.applySize();
    }
    this.occlusion!.camera = camera;
    this.occlusion!.scene = scene;this.beauty!.scene=scene;
    this.beauty!.camera = camera;
    this.occlusion!.ssaoMaterial.uniforms.cameraProjectionMatrix.value.copy(camera.projectionMatrix);
    this.occlusion!.ssaoMaterial.uniforms.cameraInverseProjectionMatrix.value.copy(camera.projectionMatrixInverse);
    this.renderer.info.autoReset=false; this.renderer.info.reset();
    this.composer.render();
    this.renderer.info.autoReset=true;
  }

  /** Draws another scene (the garage) with its own camera. */
  renderScene(scene: Scene, camera: PerspectiveCamera): void {
    // Keep garage reflections neutral; swap at render time so existing meshes need no reconstruction.
    scene.traverse(object => {
      const mesh = object as import('three').Mesh;
      if (!mesh.isMesh) return;
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        const standard = material as import('three').MeshStandardMaterial;
        if (standard.isMeshStandardMaterial && standard.envMap) standard.envMap = this.envMap;
      }
    });
    this.renderWithOcclusion(scene,camera);
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
    this.disposed = true;
    this.disposePost();
    this.outdoorTarget?.dispose();
    setVehicleEnvMap(null);
    this.studioTarget.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
