import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
const sharp = createRequire(resolve(process.argv[2] || 'node_modules', 'package.json'))('sharp');
const files = JSON.parse(
  (await readFile('assets-src/remaster/pine_tree_01-files.json', 'utf8')).replace(/^\uFEFF/, ''),
);
const records = [];
for (const channel of ['twig_diff', 'twig_alpha']) {
  const entry = files[channel]['1k'].jpg,
    response = await fetch(entry.url);
  if (!response.ok) throw new Error(`${response.status} ${entry.url}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (createHash('md5').update(buffer).digest('hex') !== entry.md5) throw new Error('Checksum mismatch');
  const source = `assets-src/remaster/pine_tree_01-${channel}.jpg`;
  await writeFile(source, buffer);
  records.push({
    asset: 'pine_tree_01',
    channel,
    url: entry.url,
    source,
    md5: entry.md5,
    bytes: buffer.length,
    license: 'CC0-1.0',
    acquired: '2026-10-10',
  });
}
// Isolate the vertical needle spray in the atlas; its opaque atlas padding is connected to the crop border.
const width = 256,
  height = 480,
  region = { left: 0, top: 0, width, height };
const alpha = await sharp('assets-src/remaster/pine_tree_01-twig_alpha.jpg')
  .extract(region)
  .extractChannel(0)
  .raw()
  .toBuffer();
const queue = [],
  seen = new Uint8Array(width * height);
function visit(x, y) {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const index = y * width + x;
  if (seen[index] || alpha[index] < 128) return;
  seen[index] = 1;
  queue.push(index);
}
for (let x = 0; x < width; x++) {
  visit(x, 0);
  visit(x, height - 1);
}
for (let y = 0; y < height; y++) {
  visit(0, y);
  visit(width - 1, y);
}
for (let cursor = 0; cursor < queue.length; cursor++) {
  const index = queue[cursor],
    x = index % width,
    y = Math.floor(index / width);
  visit(x - 1, y);
  visit(x + 1, y);
  visit(x, y - 1);
  visit(x, y + 1);
}
for (let i = 0; i < alpha.length; i++) if (seen[i]) alpha[i] = 0;
await sharp('assets-src/remaster/pine_tree_01-twig_diff.jpg')
  .extract(region)
  .joinChannel(alpha, { raw: { width, height, channels: 1 } })
  .webp({ quality: 90, alphaQuality: 100 })
  .toFile('public/remaster/pine-branch.webp');
await writeFile('assets-src/remaster/pine-manifest.json', JSON.stringify(records, null, 2) + '\n');
console.log('Acquired CC0 branch photographs; original trunk and placement, no heavy model download.');
