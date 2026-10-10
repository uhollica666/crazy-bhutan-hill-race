import { Color, Mesh, MeshStandardMaterial } from 'three';
import type { Group, Material, Object3D, Texture } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

/**
 * glTF asset pipeline: loads compressed GLBs (meshopt) once, caches them by URL, and hands out recoloured
 * clones. A failed or missing file resolves to `null` so callers fall back to the procedural models; the
 * game never blocks on a model. Everything held here is disposed by `dispose()`.
 */
export class AssetLibrary {
  private readonly loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  private readonly cache = new Map<string, Promise<Group | null>>();
  private readonly loaded = new Map<string, Group>();
  /** URLs that failed (kept so a missing file is not requested again and again). */
  readonly failed = new Set<string>();
  loads = 0;

  constructor(private readonly base: string = import.meta.env.BASE_URL) {}

  url(path: string): string {
    return `${this.base}${path}`;
  }

  /** Resolves to the parsed scene, or null if it could not be loaded. Never rejects. */
  load(path: string): Promise<Group | null> {
    const url = this.url(path);
    let p = this.cache.get(url);
    if (!p) {
      this.loads++;
      p = this.loader
        .loadAsync(url)
        .then((g) => {
          this.loaded.set(url, g.scene);
          return g.scene;
        })
        .catch((e: unknown) => {
          this.failed.add(url);
          console.warn(`[assets] could not load ${url}:`, e instanceof Error ? e.message : e);
          return null;
        });
      this.cache.set(url, p);
    }
    return p;
  }

  /** Synchronous peek: the scene if it has already finished loading. */
  peek(path: string): Group | null {
    return this.loaded.get(this.url(path)) ?? null;
  }

  has(path: string): boolean {
    return this.loaded.has(this.url(path));
  }

  /** Frees GPU memory held by every cached model. */
  dispose(): void {
    for (const scene of this.loaded.values()) disposeObject(scene);
    this.loaded.clear();
    this.cache.clear();
  }
}

export function disposeObject(root: Object3D): void {
  root.traverse((o) => {
    const m = o as Mesh;
    if (m.isMesh) {
      m.geometry.dispose();
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats) disposeMaterial(mat);
    }
  });
}

function disposeMaterial(mat: Material): void {
  const std = mat as MeshStandardMaterial;
  for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'] as const) {
    std[k]?.dispose();
  }
  mat.dispose();
}

export const assets = new AssetLibrary();

// ------------------------------------------------------------------------------------------------ vehicles

export const vehicleModelPath = (id: string): string => `models/vehicles/${id}.glb`;

export interface VehicleAsset {
  body: Object3D;
  wheel: Object3D;
}

/** Vehicle remake is authored at runtime; retain these entry points for garage/game callers.
 * Legacy GLBs stay available on disk for authoring, but are no longer downloaded invisibly.
 */
export function loadVehicleAsset(id: string): Promise<VehicleAsset | null> {
  void id;
  return Promise.resolve(null);
}

export function peekVehicleAsset(id: string): VehicleAsset | null {
  void id;
  return null;
}

let vehicleEnv: Texture | null = null;

/** The reflection map given to vehicle materials (null disables reflections). */
export function setVehicleEnvMap(t: Texture | null): void {
  vehicleEnv = t;
}

export const vehicleEnvironment = (): Texture | null => vehicleEnv;

export interface Livery {
  body: number;
  accent: number;
  trim: number;
}

/**
 * Clones a model branch with its own materials so the livery can be applied without touching the cached
 * original. Materials named paint / accent / trim take the vehicle's livery; light materials are returned so
 * the caller can drive them (brake lights, headlights).
 */
export function instantiate(src: Object3D, livery: Livery | null): { object: Object3D; lights: { head: MeshStandardMaterial[]; tail: MeshStandardMaterial[] }; materials: Material[] } {
  const object = src.clone(true);
  const made = new Map<string, MeshStandardMaterial>();
  const lights = { head: [] as MeshStandardMaterial[], tail: [] as MeshStandardMaterial[] };
  const colour: Record<string, number | undefined> = livery ? { paint: livery.body, accent: livery.accent, trim: livery.trim } : {};
  object.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    m.castShadow = true;
    const swap = (mat: Material): Material => {
      const std = mat as MeshStandardMaterial;
      let c = made.get(std.name);
      if (!c) {
        c = std.clone();
        const hex = colour[std.name];
        if (hex !== undefined) c.color = new Color(hex);
        if (vehicleEnv && std.name !== 'light_head' && std.name !== 'light_tail') {
          c.envMap = vehicleEnv;
          c.envMapIntensity = 0.5;
        }
        if (std.name === 'light_head') lights.head.push(c);
        if (std.name === 'light_tail') lights.tail.push(c);
        if (std.name === 'glass') {
          c.transparent = true;
          c.depthWrite = false;
        }
        made.set(std.name, c);
      }
      return c;
    };
    m.material = Array.isArray(m.material) ? m.material.map(swap) : swap(m.material);
  });
  return { object, lights, materials: [...made.values()] };
}
