import { Mesh, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace, TextureLoader } from 'three';
import type { Object3D, Texture } from 'three';
import type { QualityProfile } from './quality';

type Binding = {
  material: MeshStandardMaterial;
  asset: string;
  roughness: number;
  original: { map: Texture | null; normal: Texture | null; rough: Texture | null; bump: Texture | null };
  repeat: [number, number];
};
/** Per-world ownership, finite cache and deferred decode. Low never starts a texture download. */
export class RemasterSurfaces {
  private bindings: Binding[] = [];
  private textures = new Map<string, Texture>();
  private pending = new Map<string, Promise<Texture | null>>();
  private disposed = false;
  private revision = 0;
  private generation = 0;
  private textureSize = 0;
  constructor(root: Object3D) {
    const seen = new Set<MeshStandardMaterial>();
    root.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (!(material instanceof MeshStandardMaterial) || seen.has(material)) continue;
        seen.add(material);
        const surface = material.userData.remasterSurface as string | undefined;
        const asset =
          surface === 'terrain'
            ? 'forest_floor'
            : ['asphalt', 'wet', 'worn'].includes(surface || '')
              ? 'asphalt_02'
              : ['gravel', 'rocky'].includes(surface || '')
                ? 'rocky_terrain_02'
                : null;
        if (!asset) continue;
        this.bindings.push({
          material,
          asset,
          roughness: material.roughness,
          original: {
            map: material.map,
            normal: material.normalMap,
            rough: material.roughnessMap,
            bump: material.bumpMap,
          },
          repeat: surface === 'terrain' ? [2.25, 2.25] : [2, 2.5],
        });
      }
    });
  }
  private load(path: string, color: boolean): Promise<Texture | null> {
    let task = this.pending.get(path);
    if (!task) {
      const generation = this.generation;
      task = new TextureLoader()
        .loadAsync(`${import.meta.env.BASE_URL}remaster/${path}`)
        .then((texture) => {
          if (this.disposed || generation !== this.generation) {
            texture.dispose();
            return null;
          }
          texture.wrapS = texture.wrapT = RepeatWrapping;
          if (color) texture.colorSpace = SRGBColorSpace;
          this.textures.set(path, texture);
          return texture;
        })
        .catch(() => null);
      this.pending.set(path, task);
    }
    return task;
  }
  setWetness(value: number): void {
    const wet = Math.max(0, Math.min(1, value));
    for (const binding of this.bindings)
      binding.material.roughness =
        binding.roughness * (1 - wet * (binding.asset === 'asphalt_02' ? 0.72 : 0.25));
  }
  applyQuality(profile: QualityProfile): void {
    const revision = ++this.revision;
    const size = profile.surfaceDetail ? (profile.surfaceDetail > 1 ? 1024 : 512) : 0;
    if (size !== this.textureSize) {
      this.textureSize = size;
      this.generation++;
      for (const texture of this.textures.values()) texture.dispose();
      this.textures.clear();
      this.pending.clear();
    }
    for (const binding of this.bindings) {
      const { material, original } = binding;
      material.map = original.map;
      material.normalMap = original.normal;
      material.roughnessMap = profile.surfaceDetail ? original.rough : null;
      material.bumpMap = profile.surfaceDetail ? original.bump : null;
      material.needsUpdate = true;
      if (!profile.surfaceDetail) continue;
      void Promise.all(
        ['Diffuse', 'nor_gl', 'arm'].map((channel) =>
          this.load(`${binding.asset}-${channel}-${size}.webp`, channel === 'Diffuse'),
        ),
      ).then((maps) => {
        if (this.disposed || revision !== this.revision || maps.some((map) => !map)) return;
        for (const map of maps) {
          map!.repeat.set(...binding.repeat);
          map!.anisotropy = profile.anisotropy;
          map!.needsUpdate = true;
        }
        material.map = maps[0];
        material.normalMap = maps[1];
        material.roughnessMap = maps[2];
        material.bumpMap = null;
        material.normalScale.setScalar(binding.asset === 'asphalt_02' ? 0.45 : 0.7);
        material.needsUpdate = true;
        // Evict an obsolete resolution after all current bindings have switched away from it.
        for (const [key, texture] of this.textures)
          if (
            !key.endsWith(`-${size}.webp`) &&
            !this.bindings.some((b) =>
              [b.material.map, b.material.normalMap, b.material.roughnessMap].includes(texture),
            )
          ) {
            texture.dispose();
            this.textures.delete(key);
            this.pending.delete(key);
          }
      });
    }
    if (!profile.surfaceDetail) {
      for (const texture of this.textures.values()) texture.dispose();
      this.textures.clear();
      this.pending.clear();
    }
  }
  dispose(): void {
    this.disposed = true;
    this.revision++;
    for (const { material, original } of this.bindings) {
      material.map = original.map;
      material.normalMap = original.normal;
      material.roughnessMap = original.rough;
      material.bumpMap = original.bump;
    }
    for (const texture of this.textures.values()) texture.dispose();
    this.textures.clear();
    this.pending.clear();
    this.bindings = [];
  }
}
