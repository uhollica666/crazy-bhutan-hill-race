// Bake the actual runtime authoring geometry, including hidden cosmetic choices and both LODs.
// Blender is optional. Reproducible: node scripts/bake-remaster-vehicles.mjs
import { createServer } from 'vite';
import { Group } from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, weld, prune, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import { mkdir, writeFile } from 'node:fs/promises';

// GLTFExporter only needs the binary Blob reader for these texture-free, vertex-colored models.
globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = buffer;
      this.onloadend?.();
    });
  }
};
const server = await createServer({ server: { middlewareMode: true, watch: null }, appType: 'custom' });
try {
  const { createCoachwork } = await server.ssrLoadModule('/src/render/coachwork.ts');
  const { listVehicles } = await server.ssrLoadModule('/src/data/vehicles/index.ts');
  await MeshoptEncoder.ready;
  await MeshoptDecoder.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
  await mkdir('assets-src/remaster/vehicles', { recursive: true });
  await mkdir('public/remaster/vehicles', { recursive: true });
  const records = [];
  for (const def of listVehicles()) {
    const group = new Group(),
      arts = [];
    for (const low of [false, true]) {
      const art = createCoachwork(def, low);
      arts.push(art);
      art.body.name = low ? 'body_low' : 'body_high';
      art.wheel.name = low ? 'wheel_low' : 'wheel_high';
      group.add(art.body, art.wheel);
    }
    const buffer = await new GLTFExporter().parseAsync(group, {
      binary: true,
      onlyVisible: false,
      copyright:
        'Original fictional vehicles: Crazy Bhutan Hill Race. Driver geometry adapted from the CC0 Quaternius base; see docs/ASSET_LICENSES.md.',
    });
    await writeFile(`assets-src/remaster/vehicles/${def.id}.glb`, Buffer.from(buffer));
    const doc = await io.readBinary(new Uint8Array(buffer));
    // No lossy simplification across panel boundaries. Low is separately authored to keep silhouettes intact.
    // Names are functional attachment/material identities: equally colored left/right lamps must not merge.
    await doc.transform(
      dedup({ keepUniqueNames: true }),
      weld({ tolerance: 0.00001 }),
      prune({ keepLeaves: true }),
      meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
    );
    const optimized = await io.writeBinary(doc);
    await writeFile(`public/remaster/vehicles/${def.id}.glb`, optimized);
    records.push({
      id: def.id,
      sourceBytes: buffer.byteLength,
      runtimeBytes: optimized.byteLength,
      groups: ['body_high', 'body_low', 'wheel_high', 'wheel_low'],
    });
    for (const art of arts) {
      art.geometries.forEach((g) => g.dispose());
      art.materials.forEach((m) => m.dispose());
    }
    console.log(`${def.id}: ${(optimized.byteLength / 1024).toFixed(1)} KiB`);
  }
  await writeFile('assets-src/remaster/vehicles/manifest.json', JSON.stringify(records, null, 2) + '\n');
} finally {
  await server.close();
}
