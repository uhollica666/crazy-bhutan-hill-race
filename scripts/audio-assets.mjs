// Builds the web soundtrack from the original MP3s in music/ WITHOUT touching them.
//   FFMPEG=path/to/ffmpeg node scripts/audio-assets.mjs        (ffmpeg with libopus; falls back to `ffmpeg` on PATH)
//
// Output (public/audio/music/):
//   <slug>.webm   Opus in WebM, 128 kbps stereo: what Chrome, Firefox, Edge and current Safari stream
//   <slug>.mp3    the original MP3 stream copied as-is, minus the embedded cover art: compatibility fallback
//   manifest.json per-track metadata read at run time: duration, loudness gain, trim points for clean loops
//   intro-sting.* a short, punchy excerpt for the start-up sequence
//
// The runtime fetches a track only when its screen is first reached; nothing here is precached by the service worker.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const SRC = 'music';
const OUT = 'public/audio/music';
const TARGET_LUFS = -16;
const MAX_TRUE_PEAK = -1.5;

/** slug -> original file name and title. The slug is ASCII so URLs, caches and CDNs never trip over accents. */
const TRACKS = [
  ['road-to-the-clouds', 'Road to the Clouds.mp3', 'Road to the Clouds'],
  ['mischievous-groove', 'Mischievous Groove.mp3', 'Mischievous Groove'],
  ['mountain-pass', 'Mountain Pass.mp3', 'Mountain Pass'],
  ['off-road-blitz', 'Off-Road Blitz.mp3', 'Off-Road Blitz'],
  ['off-road-fury', 'Off-Road Fury.mp3', 'Off-Road Fury'],
  ['mountain-road-fury', 'Mountain Road Fury.mp3', 'Mountain Road Fury'],
  ['maquina-de-guerra', 'Máquina de Guerra.mp3', 'Máquina de Guerra'],
  ['first-place-summit', 'First Place Summit.mp3', 'First Place Summit'],
  ['himalayan-sunset', 'Himalayan Sunset.mp3', 'Himalayan Sunset'],
];

const run = (args, opts = {}) => spawnSync(FFMPEG, ['-hide_banner', '-nostdin', ...args], { encoding: 'utf8', maxBuffer: 1 << 28, ...opts });

function probe(file) {
  const r = run(['-i', file]);
  const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(r.stderr);
  if (!m) throw new Error(`cannot read duration of ${file}`);
  return +m[1] * 3600 + +m[2] * 60 + +m[3];
}

/** Integrated loudness (LUFS) and true peak (dBTP) with the EBU R128 meter. */
function loudness(file) {
  const r = run(['-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-']);
  const text = r.stderr.slice(r.stderr.lastIndexOf('Summary:'));
  const i = /I:\s+(-?[\d.]+) LUFS/.exec(text);
  const p = /Peak:\s+(-?[\d.]+) dBFS/.exec(text);
  if (!i) throw new Error(`no loudness for ${file}`);
  return { lufs: +i[1], peak: p ? +p[1] : 0 };
}

/** Leading and trailing near-silence, so a loop never plays a gap (and never clicks on the cut). */
function silences(file, dur) {
  const r = run(['-i', file, '-af', 'silencedetect=noise=-48dB:d=0.04', '-f', 'null', '-']);
  let start = 0;
  let end = dur;
  const starts = [...r.stderr.matchAll(/silence_start: (-?[\d.]+)/g)].map((m) => +m[1]);
  const ends = [...r.stderr.matchAll(/silence_end: ([\d.]+)/g)].map((m) => +m[1]);
  if (starts.length && starts[0] <= 0.05 && ends.length) start = ends[0];
  if (starts.length && starts[starts.length - 1] > dur - 12 && (ends.length < starts.length || ends[ends.length - 1] >= dur - 0.05)) end = starts[starts.length - 1];
  return { start: Math.max(0, start - 0.01), end };
}

/** Loudest `len`-second window in the first `scan` seconds: where a track hits hardest. */
function punchyWindow(file, len, scan) {
  const r = run(['-t', String(scan), '-i', file, '-af', 'asetnsamples=n=48000,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-', '-f', 'null', '-']);
  const levels = [...(r.stdout + r.stderr).matchAll(/RMS_level=(-?[\d.inf]+)/g)].map((m) => (m[1].includes('inf') ? -90 : +m[1]));
  let best = 0;
  let bestAvg = -Infinity;
  for (let s = 2; s + len <= levels.length; s++) {
    const avg = levels.slice(s, s + len).reduce((a, b) => a + b, 0) / len;
    if (avg > bestAvg) {
      bestAvg = avg;
      best = s;
    }
  }
  return best;
}

mkdirSync(OUT, { recursive: true });
const manifest = { version: 1, targetLufs: TARGET_LUFS, tracks: {} };
let opusTotal = 0;
let mp3Total = 0;

for (const [slug, file, title] of TRACKS) {
  const src = join(SRC, file);
  if (!existsSync(src)) throw new Error(`missing ${src}`);
  const duration = probe(src);
  const { lufs, peak } = loudness(src);
  // Bring every track to the same perceived level, never boosting into clipping.
  const gainDb = Math.min(TARGET_LUFS - lufs, MAX_TRUE_PEAK - peak);
  const { start, end } = silences(src, duration);
  const webm = join(OUT, `${slug}.webm`);
  const mp3 = join(OUT, `${slug}.mp3`);
  const enc = run(['-y', '-i', src, '-vn', '-map_metadata', '-1', '-c:a', 'libopus', '-b:a', '128k', '-vbr', 'on', '-application', 'audio', '-ar', '48000', '-ac', '2', webm]);
  if (enc.status !== 0) throw new Error(`opus encode failed for ${file}\n${enc.stderr.slice(-400)}`);
  const cp = run(['-y', '-i', src, '-vn', '-map_metadata', '-1', '-c:a', 'copy', '-id3v2_version', '0', '-write_xing', '1', mp3]);
  if (cp.status !== 0) throw new Error(`mp3 copy failed for ${file}\n${cp.stderr.slice(-400)}`);
  const sizes = { webm: statSync(webm).size, mp3: statSync(mp3).size };
  opusTotal += sizes.webm;
  mp3Total += sizes.mp3;
  manifest.tracks[slug] = { title, duration: +duration.toFixed(3), lufs: +lufs.toFixed(2), gainDb: +gainDb.toFixed(2), start: +start.toFixed(3), end: +end.toFixed(3), bytes: sizes };
  console.log(`${slug.padEnd(20)} ${duration.toFixed(1)}s  ${lufs.toFixed(1)} LUFS  gain ${gainDb.toFixed(1)} dB  trim ${start.toFixed(2)}-${end.toFixed(2)}  opus ${(sizes.webm / 1e6).toFixed(2)} MB  mp3 ${(sizes.mp3 / 1e6).toFixed(2)} MB`);
}

// Start-up sting: the hardest 8 seconds of the opening of Mountain Road Fury, with a short fade-in and a longer tail.
{
  const src = join(SRC, 'Mountain Road Fury.mp3');
  const len = 8;
  const at = punchyWindow(src, len, 90);
  const fade = `afade=t=in:st=0:d=0.04,afade=t=out:st=${len - 1.4}:d=1.4`;
  for (const [ext, codec] of [['webm', ['-c:a', 'libopus', '-b:a', '128k', '-vbr', 'on', '-application', 'audio']], ['mp3', ['-c:a', 'libmp3lame', '-b:a', '128k']]]) {
    const out = join(OUT, `intro-sting.${ext}`);
    const r = run(['-y', '-ss', String(at), '-t', String(len), '-i', src, '-vn', '-map_metadata', '-1', '-af', fade, '-ar', '48000', '-ac', '2', ...codec, out]);
    if (r.status !== 0) throw new Error(`intro encode failed\n${r.stderr.slice(-400)}`);
  }
  const { lufs, peak } = loudness(join(OUT, 'intro-sting.webm'));
  manifest.tracks['intro-sting'] = { title: 'Start-up sting (excerpt of Mountain Road Fury)', duration: len, lufs: +lufs.toFixed(2), gainDb: +Math.min(TARGET_LUFS - lufs, MAX_TRUE_PEAK - peak).toFixed(2), start: 0, end: len, bytes: { webm: statSync(join(OUT, 'intro-sting.webm')).size, mp3: statSync(join(OUT, 'intro-sting.mp3')).size }, excerptFrom: 'mountain-road-fury', excerptAt: at };
  console.log(`intro-sting          ${len}s from ${at}s of Mountain Road Fury  opus ${(manifest.tracks['intro-sting'].bytes.webm / 1e3).toFixed(0)} kB  mp3 ${(manifest.tracks['intro-sting'].bytes.mp3 / 1e3).toFixed(0)} kB`);
}

writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
console.log(`\nOpus total ${(opusTotal / 1e6).toFixed(1)} MB, MP3 fallback total ${(mp3Total / 1e6).toFixed(1)} MB (originals untouched in ${SRC}/)`);
