// Explicit, finite CC0 acquisition list. No crawling, credentials or runtime network dependency.
// node scripts/remaster-assets.mjs <directory containing sharp>
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
const sharp = createRequire(resolve(process.argv[2] || 'node_modules', 'package.json'))('sharp');
const root = 'assets-src/remaster';
const runtime = 'public/remaster';
await mkdir(runtime, { recursive: true });
const records = [];
async function acquire(asset, channel, entry) {
  const path = `${root}/${asset}-${channel}.${channel === 'hdri' ? 'hdr' : 'jpg'}`;
  const response = await fetch(entry.url);
  if (!response.ok) throw new Error(`${response.status}: ${entry.url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (createHash('md5').update(bytes).digest('hex') !== entry.md5) throw new Error(`Checksum: ${path}`);
  await writeFile(path, bytes);
  if (channel === 'hdri') await writeFile(`${runtime}/${asset}.hdr`, bytes);
  else
    for (const size of [512, 1024]) {
      // Lossless normals/ARM: do not introduce block artifacts into linear material data.
      await sharp(bytes)
        .resize(size, size)
        .webp({ lossless: channel !== 'Diffuse', quality: 88 })
        .toFile(`${runtime}/${asset}-${channel}-${size}.webp`);
    }
  records.push({
    asset,
    channel,
    url: entry.url,
    source: path,
    md5: entry.md5,
    bytes: bytes.length,
    license: 'CC0-1.0',
    acquired: '2026-10-10',
  });
}
for (const asset of ['asphalt_02', 'rocky_terrain_02', 'forest_floor', 'rooitou_park']) {
  const files = JSON.parse((await readFile(`${root}/${asset}-files.json`, 'utf8')).replace(/^\uFEFF/, ''));
  if (asset === 'rooitou_park') await acquire(asset, 'hdri', files.hdri['1k'].hdr);
  else
    for (const channel of ['Diffuse', 'nor_gl', 'arm'])
      await acquire(asset, channel, files[channel]['1k'].jpg);
  console.log(`Acquired and optimized ${asset}`);
}
await writeFile(`${root}/manifest.json`, JSON.stringify(records, null, 2) + '\n');
