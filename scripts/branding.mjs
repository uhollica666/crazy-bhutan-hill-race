// Derives every piece of Crazy Bhutan Hill Race branding from the master logo WITHOUT modifying it.
//   node scripts/branding.mjs        (reads cbhr-logo.png in the project root; uses sharp)
//
// The master is the full badge: a red off-roader climbing a Himalayan peak above the heavy-metal "CRAZY BHUTAN HILL RACE" wordmark.
// A detailed wordmark turns to mud at icon sizes, so small outputs use a tight crop of the vehicle, peak and sun disc instead, and
// only the larger ones (menu, splash, loading, About, social card) carry the whole badge.
//
// Output
//   public/brand/cbhr-logo.webp          full badge, 720 px, transparent background (menu, splash, loading, About)
//   public/favicon-16.png / -32 / -48    emblem crop for browser tabs;   public/favicon.ico bundles the three
//   public/apple-touch-icon.png (180)    emblem, full bleed on the brand's dark ground (iOS rounds it)
//   public/icon-192.png / icon-512.png   emblem, rounded, transparent corners ("any" purpose)
//   public/icon-maskable-192.png / 512   emblem inside the maskable safe zone on a fiery dark ground
//   public/og-image.png (1200x630)       social preview: the full badge on the brand ground
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const SRC = 'cbhr-logo.png';

mkdirSync('public/brand', { recursive: true });
const master = readFileSync(SRC);
const meta = await sharp(master).metadata();
const W = meta.width;
const H = meta.height;

// ---------------------------------------------------------------------------------------------- transparent cut-out
// The artwork sits on a near-black square. Remove only the black that is connected to the border (flood fill), with a soft edge, so
// the dark tyres and shadows inside the badge keep their colour.
async function cutout() {
  const { data, info } = await sharp(master).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const n = W * H;
  const lum = new Uint8Array(n);
  for (let i = 0; i < n; i++) lum[i] = Math.max(data[i * 3], data[i * 3 + 1], data[i * 3 + 2]);
  const LOW = 30; // fully removed at or below this
  const HIGH = 64; // fully kept at or above this
  const seen = new Uint8Array(n);
  const stack = [];
  const push = (x, y) => {
    const k = y * W + x;
    if (!seen[k] && lum[k] < HIGH) {
      seen[k] = 1;
      stack.push(k);
    }
  };
  for (let x = 0; x < W; x++) {
    push(x, 0);
    push(x, H - 1);
  }
  for (let y = 0; y < H; y++) {
    push(0, y);
    push(W - 1, y);
  }
  while (stack.length) {
    const k = stack.pop();
    const x = k % W;
    const y = (k - x) / W;
    if (x > 0) push(x - 1, y);
    if (x < W - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < H - 1) push(x, y + 1);
  }
  const out = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) {
    let a = 255;
    if (seen[i]) a = Math.round(255 * Math.min(1, Math.max(0, (lum[i] - LOW) / (HIGH - LOW))));
    out[i * 4] = data[i * 3];
    out[i * 4 + 1] = data[i * 3 + 1];
    out[i * 4 + 2] = data[i * 3 + 2];
    out[i * 4 + 3] = a;
  }
  return sharp(out, { raw: { width: W, height: H, channels: 4 } });
}

const badge = await (await cutout()).png().toBuffer(); // full badge, transparent ground

// ---------------------------------------------------------------------------------------------- the emblem crops
// Vehicle, peak and sun disc. B (a little wider) for 48 px and up; C (tighter, on the lights and the dragon) for 16/32 px.
const crop = (x, y, s) => sharp(master).extract({ left: x, top: y, width: s, height: s });
const emblemB = await crop(60, 40, 900).png().toBuffer();
const emblemC = await crop(200, 100, 640).png().toBuffer();

// Slightly lift the tiny crop so the lights and the red read at 16 px.
const small = (size) =>
  sharp(emblemC)
    .resize(size, size, { fit: 'cover', kernel: 'lanczos3' })
    .modulate({ brightness: 1.08, saturation: 1.18 })
    .sharpen({ sigma: 0.6 })
    .png({ compressionLevel: 9 });

const roundMask = (size, radius) => Buffer.from(`<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg"><rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`);

// Photographic art compresses far better as an adaptive-palette PNG (visually the same at these sizes).
const PNG = { compressionLevel: 9, palette: true, quality: 90, effort: 10 };

async function writePng(file, pipeline) {
  const buf = await pipeline.png(PNG).toBuffer();
  writeFileSync(file, buf);
  return buf;
}

// ---------------------------------------------------------------------------------------------- website logo
const logoWebp = await sharp(badge).resize(720, 720, { kernel: 'lanczos3' }).webp({ quality: 88, alphaQuality: 92, effort: 6 }).toBuffer();
writeFileSync('public/brand/cbhr-logo.webp', logoWebp);

// ---------------------------------------------------------------------------------------------- favicons
const fav = {};
for (const size of [16, 32, 48]) fav[size] = await small(size).toBuffer();
for (const size of [16, 32, 48]) writeFileSync(`public/favicon-${size}.png`, fav[size]);
// favicon.ico: three PNG-compressed images (supported by every current browser).
{
  const sizes = [16, 32, 48];
  const head = Buffer.alloc(6);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(sizes.length, 4);
  let offset = 6 + 16 * sizes.length;
  const dir = [];
  for (const s of sizes) {
    const e = Buffer.alloc(16);
    e.writeUInt8(s, 0);
    e.writeUInt8(s, 1);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(fav[s].length, 8);
    e.writeUInt32LE(offset, 12);
    offset += fav[s].length;
    dir.push(e);
  }
  writeFileSync('public/favicon.ico', Buffer.concat([head, ...dir, ...sizes.map((s) => fav[s])]));
}

// ---------------------------------------------------------------------------------------------- app icons
const emblem = (size) => sharp(emblemB).resize(size, size, { kernel: 'lanczos3' });
await writePng('public/apple-touch-icon.png', emblem(180));
for (const size of [192, 512]) {
  const rounded = await emblem(size).composite([{ input: roundMask(size, Math.round(size * 0.2)), blend: 'dest-in' }]).png(PNG).toBuffer();
  writeFileSync(`public/icon-${size}.png`, rounded);
}

// Maskable: the platform crops to a circle/squircle, so the emblem sits inside the central 80% on a dark, fiery ground.
for (const size of [192, 512]) {
  const inner = Math.round(size * 0.62);
  const ground = Buffer.from(`<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="g" cx="50%" cy="42%" r="62%"><stop offset="0" stop-color="#7a2408"/><stop offset=".55" stop-color="#2a0d07"/><stop offset="1" stop-color="#0b0d13"/></radialGradient></defs><rect width="${size}" height="${size}" fill="url(#g)"/></svg>`);
  const piece = await sharp(emblemB).resize(inner, inner, { kernel: 'lanczos3' }).composite([{ input: roundMask(inner, Math.round(inner * 0.2)), blend: 'dest-in' }]).png().toBuffer();
  const off = Math.round((size - inner) / 2);
  writeFileSync(`public/icon-maskable-${size}.png`, await sharp(ground).composite([{ input: piece, left: off, top: off }]).png(PNG).toBuffer());
}

// ---------------------------------------------------------------------------------------------- social card
{
  const w = 1200;
  const h = 630;
  const ground = Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><defs>
      <radialGradient id="g" cx="50%" cy="46%" r="58%"><stop offset="0" stop-color="#6e2209"/><stop offset=".5" stop-color="#220c07"/><stop offset="1" stop-color="#0b0d13"/></radialGradient>
      <linearGradient id="s" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8d949c" stop-opacity="0"/><stop offset=".5" stop-color="#c9cfd6" stop-opacity=".5"/><stop offset="1" stop-color="#8d949c" stop-opacity="0"/></linearGradient></defs>
    <rect width="${w}" height="${h}" fill="url(#g)"/><rect x="0" y="${h - 10}" width="${w}" height="3" fill="url(#s)"/><rect x="0" y="7" width="${w}" height="3" fill="url(#s)"/></svg>`);
  const logo = await sharp(badge).resize(590, 590, { kernel: 'lanczos3' }).png().toBuffer();
  writeFileSync('public/og-image.png', await sharp(ground).composite([{ input: logo, left: Math.round((w - 590) / 2), top: 20 }]).png(PNG).toBuffer());
}

const kb = (f) => `${(readFileSync(f).length / 1024).toFixed(1)} kB`;
console.log(`master ${SRC} ${W}x${H} (unchanged)`);
for (const f of ['public/brand/cbhr-logo.webp', 'public/favicon.ico', 'public/favicon-16.png', 'public/favicon-32.png', 'public/favicon-48.png', 'public/apple-touch-icon.png', 'public/icon-192.png', 'public/icon-512.png', 'public/icon-maskable-192.png', 'public/icon-maskable-512.png', 'public/og-image.png'])
  console.log(f.padEnd(34), kb(f));
