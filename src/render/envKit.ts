import { BufferAttribute, BufferGeometry, Float32BufferAttribute } from 'three';
import type { Mesh, Object3D } from 'three';
import { assets } from './assets';

export const ENV_KIT_PATH = 'models/env/kit.glb';

/**
 * The vertex-coloured environment kit (trees, rocks, houses, chortens...) authored in Blender. Each entry is
 * returned as a clean float32 geometry in world-up orientation, ready for InstancedMesh with a Lambert
 * vertex-colour material. Missing entries (or a missing kit) fall back to the procedural geometry.
 */
export class EnvKit {
  private readonly geos = new Map<string, BufferGeometry>();

  constructor(scene: Object3D) {
    scene.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh || !m.name) return;
      this.geos.set(m.name, toFloatGeometry(m));
    });
  }

  has(name: string): boolean {
    return this.geos.has(name);
  }

  /** A private copy (callers dispose what they take). */
  geo(name: string): BufferGeometry | null {
    const g = this.geos.get(name);
    return g ? g.clone() : null;
  }

  get names(): string[] {
    return [...this.geos.keys()];
  }

  dispose(): void {
    for (const g of this.geos.values()) g.dispose();
    this.geos.clear();
  }
}

/** Dequantises (meshopt/quantised accessors) and bakes the node transform into plain float32 attributes. */
export function toFloatGeometry(mesh: Mesh): BufferGeometry {
  mesh.updateWorldMatrix(true, false);
  const src = mesh.geometry;
  const g = new BufferGeometry();
  const pos = src.getAttribute('position');
  const out = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    out[i * 3] = pos.getX(i);
    out[i * 3 + 1] = pos.getY(i);
    out[i * 3 + 2] = pos.getZ(i);
  }
  g.setAttribute('position', new Float32BufferAttribute(out, 3));
  const col = src.getAttribute('color');
  if (col) {
    const c = new Float32Array(col.count * 3);
    for (let i = 0; i < col.count; i++) {
      c[i * 3] = col.getX(i);
      c[i * 3 + 1] = col.getY(i);
      c[i * 3 + 2] = col.getZ(i);
    }
    g.setAttribute('color', new Float32BufferAttribute(c, 3));
  }
  if (src.index) {
    const idx = src.index;
    const arr = new Uint32Array(idx.count);
    for (let i = 0; i < idx.count; i++) arr[i] = idx.getX(i);
    g.setIndex(new BufferAttribute(arr, 1));
  }
  g.applyMatrix4(mesh.matrixWorld);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

let kitPromise: Promise<EnvKit | null> | null = null;
let kit: EnvKit | null = null;

/** Loads the shared kit once. Resolves to null if the file is missing or broken. */
export function loadEnvKit(): Promise<EnvKit | null> {
  kitPromise ??= assets.load(ENV_KIT_PATH).then((scene) => {
    if (!scene) return null;
    kit = new EnvKit(scene);
    return kit;
  });
  return kitPromise;
}

export const peekEnvKit = (): EnvKit | null => kit;

export function disposeEnvKit(): void {
  kit?.dispose();
  kit = null;
  kitPromise = null;
}
