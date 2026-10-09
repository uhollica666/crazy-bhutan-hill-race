// Optimises the Blender exports for the browser: node scripts/build-models.mjs
//   assets-src/out/*.glb          -> public/models/vehicles/*.glb
//   assets-src/out/env/*.glb      -> public/models/env/*.glb
// Steps: dedup + prune, weld, quantise, meshopt compression (decoded in the browser by three's MeshoptDecoder).
import { NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { dedup, prune, quantize, weld, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization]).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

const jobs = [
  ['assets-src/out', 'public/models/vehicles'],
  ['assets-src/out/env', 'public/models/env'],
];
let total = 0;
for (const [src, dst] of jobs) {
  if (!existsSync(src)) continue;
  mkdirSync(dst, { recursive: true });
  for (const f of readdirSync(src).filter((n) => n.endsWith('.glb'))) {
    const doc = await io.read(join(src, f));
    await doc.transform(dedup(), weld({ tolerance: 0.0001 }), prune(), quantize({ quantizePosition: 14, quantizeNormal: 10 }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
    await io.write(join(dst, f), doc);
    const kb = statSync(join(dst, f)).size / 1024;
    total += kb;
    console.log(`${join(dst, f)}  ${kb.toFixed(1)} KB`);
  }
}
console.log(`total ${total.toFixed(1)} KB`);
