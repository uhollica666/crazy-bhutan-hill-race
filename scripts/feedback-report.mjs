// Developer-only feedback reporting for Crazy Bhutan Hill Race.
//
//   node scripts/feedback-report.mjs [options]            (also: bun run feedback:report)
//
// Reads the PRIVATE Firestore `feedback` collection with a Firebase service account that lives OUTSIDE this repository, builds a local
// report (HTML dashboard, CSV, JSON), and optionally opens it. Nothing is published and nothing is written back to Firebase.
//
// Where the data comes from (first match wins):
//   --input <file.json>       a JSON array (or {records:[...]}) of feedback documents, e.g. exported from the Firebase console
//   --sample [N]              N deterministic made-up submissions (default 150), to try the dashboard; clearly labelled as sample data
//   FIRESTORE_EMULATOR_HOST   the local emulator (no credentials needed)
//   --credentials <key.json>  or GOOGLE_APPLICATION_CREDENTIALS: a service-account key file, used to read the live project
//
// Options: --project <id>  --out <dir>  --open  --include-contacts  --no-text  --from YYYY-MM-DD --to YYYY-MM-DD --version X
//          --os Windows|Android|... --min-rating N --max-rating N --topic <id> --help
//
// Security: the key is read from disk only, kept in memory, never printed, and refused if it sits inside this repository. Reports are
// written under reports/ (git-ignored). Contact addresses, emails and phone numbers are redacted unless --include-contacts is given.
import { createSign } from 'node:crypto';
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { annotate, filterRecords, fromFirestoreFields, normalizeRecord, summarize, toCsv, toJson } from './feedback/core.mjs';
import { renderReport } from './feedback/html.mjs';

const REPO = resolve(fileURLToPath(new URL('..', import.meta.url)));

export function parseArgs(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) {
      o._.push(a);
      continue;
    }
    const key = a.slice(2);
    const flags = new Set(['open', 'include-contacts', 'no-text', 'help', 'allow-repo-credentials']);
    if (flags.has(key)) o[key] = true;
    else if (key === 'sample') o.sample = argv[i + 1] && /^\d+$/.test(argv[i + 1]) ? Number(argv[++i]) : 150;
    else o[key] = argv[++i];
  }
  return o;
}

// ------------------------------------------------------------------------------------------------ sources

/** Deterministic made-up submissions (mulberry32) so the dashboard can be tried without any real data. */
export function sampleDocs(n = 150) {
  let s = 0x9e3779b9;
  const rnd = () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = (xs) => xs[Math.floor(rnd() * xs.length)];
  const good = ['Gorgeous mountain scenery and the music is fantastic', 'The driving feels great on the hairpins', 'Love the garage and customising the vehicles', 'Charming missions with tourists, very funny', 'The weather and night driving are brilliant', 'Beautiful atmosphere, the prayer flags are a nice touch'];
  const perf = ['Lag on my phone at night', 'Stutters when it rains and I get low fps', 'Runs smoothly on desktop', 'Phone gets hot and the frame rate drops', 'Black screen when I first opened it', ''];
  const ctl = ['Steering is twitchy at high speed', 'Touch buttons are too small on my phone', 'The camera shake is too strong on gravel', 'Gamepad works well', 'Hard to control when it slides', ''];
  const gfx = ['Too dark at night and the fog hides the road', 'Textures look a bit blurry', 'Looks stunning on high', '', ''];
  const imp = ['Too hard to finish before the deadline', 'Menus are confusing at first', 'Music is too loud over the engine', 'The background noise from the river is annoying', 'Ran out of fuel and could not continue', 'Sometimes I get stuck on a rock', ''];
  const add = ['Please add multiplayer races with friends', 'More routes and more vehicles', 'A photo mode and leaderboards', 'Dzongkha and Nepali language support', 'More paint and skins for the cars', 'Controller remapping', 'iOS version please', ''];
  const bugs = ['Fell through the road near the bridge', 'Stuck in the mud and cannot reverse', 'The ID check button is not visible', 'Lost my progress after an update', '', '', ''];
  const versions = ['0.3.0', '0.4.0-beta.1', '0.4.0-beta.1', '0.4.0-beta.1', '0.4.0-beta.2'];
  const uas = [
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130', 'Win32', false],
    ['Mozilla/5.0 (Linux; Android 14; Pixel 7) Chrome/130 Mobile', 'Linux armv8l', true],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Safari/605', 'MacIntel', false],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari/604', 'iPhone', true],
    ['Mozilla/5.0 (Windows NT 10.0) WebView2 Tauri', 'Win32', false],
  ];
  const now = Date.UTC(2026, 9, 20);
  return Array.from({ length: n }, (_, i) => {
    const rating = Math.max(1, Math.min(5, Math.round(3.9 + (rnd() - 0.5) * 3.2)));
    const ua = pick(uas);
    const share = rnd() < 0.55;
    return {
      id: `sample${String(i).padStart(4, '0')}x`,
      doc: {
        clientAt: now - Math.floor(rnd() * 24 * 86400000),
        appVersion: pick(versions),
        origin: pick(['menu', 'settings', 'results', 'about', 'results', 'results']),
        rating,
        gameplay: rnd() < 0.5 ? pick(good) : '',
        controls: pick(ctl),
        graphics: pick(gfx),
        performance: pick(perf),
        difficulty: pick(['tooEasy', 'aboutRight', 'aboutRight', 'tooDifficult', null]),
        favourite: rnd() < 0.8 ? pick(good) : '',
        improve: pick(imp),
        add: pick(add),
        bugs: pick(bugs),
        contact: rnd() < 0.12 ? (rnd() < 0.5 ? `player${i}@example.com` : `@player_${i}`) : null,
        device: share ? { userAgent: ua[0], platform: ua[1], touch: ua[2], quality: pick(['low', 'medium', 'high', 'auto']), appVersion: '0.4.0', language: 'en' } : null,
        interest: {
          playLargerVersion: rnd() < 0.7 ? rnd() < 0.78 : null,
          considerPurchasingFullGame: rnd() < 0.6 ? rnd() < 0.55 : null,
          priceRange: rnd() < 0.55 ? pick(['none', 'under5', '5to10', '5to10', '10to20', '20to40']) : null,
          voluntarySupport: rnd() < 0.6 ? rnd() < 0.5 : null,
        },
      },
    };
  });
}

function loadFile(path) {
  const j = JSON.parse(readFileSync(resolve(path), 'utf8'));
  const list = Array.isArray(j) ? j : j.records ?? [];
  return list.map((d, i) => ({ id: d.id ?? d.submissionId ?? `row${i}`, doc: d.doc ?? d }));
}

async function accessToken(keyPath) {
  const key = JSON.parse(readFileSync(keyPath, 'utf8'));
  if (!key.client_email || !key.private_key) throw new Error('That file is not a service-account key (client_email / private_key missing).');
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: key.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3000 })}`;
  const sig = createSign('RSA-SHA256').update(unsigned).sign(key.private_key, 'base64url');
  const res = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${sig}` }) });
  if (!res.ok) throw new Error(`Could not get an access token (${res.status}). Check the key file and that it belongs to the project.`);
  return { token: (await res.json()).access_token, project: key.project_id };
}

async function fetchCollection({ base, headers }) {
  const out = [];
  let pageToken = '';
  do {
    const res = await fetch(`${base}/feedback?pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`, { headers });
    if (!res.ok) throw new Error(`Firestore answered ${res.status} ${res.statusText}. ${res.status === 403 ? 'The service account needs the "Cloud Datastore User" role.' : ''}`);
    const page = await res.json();
    for (const d of page.documents ?? []) out.push({ id: d.name.split('/').pop(), doc: fromFirestoreFields(d.fields) });
    pageToken = page.nextPageToken ?? '';
  } while (pageToken);
  return out;
}

export async function loadDocs(o, env = process.env) {
  if (o.input) return { source: `file ${o.input}`, docs: loadFile(o.input), sample: false };
  if (o.sample) return { source: `sample data (${o.sample})`, docs: sampleDocs(o.sample), sample: true };
  const project = o.project ?? env.FIREBASE_PROJECT ?? env.GCLOUD_PROJECT;
  if (env.FIRESTORE_EMULATOR_HOST) {
    const p = project ?? 'demo-crazy-bhutan-hill-race';
    const base = `http://${env.FIRESTORE_EMULATOR_HOST}/v1/projects/${p}/databases/(default)/documents`;
    return { source: `emulator ${env.FIRESTORE_EMULATOR_HOST}`, docs: await fetchCollection({ base, headers: { Authorization: 'Bearer owner' } }), sample: false };
  }
  const keyPath = o.credentials ?? env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!keyPath) throw new Error('No data source. Give --credentials <service-account.json> (kept outside the repo), --input <file>, or try --sample. See docs/FEEDBACK_REPORTING.md.');
  const abs = resolve(keyPath);
  if ((abs + sep).startsWith(REPO + sep) && !o['allow-repo-credentials']) throw new Error('Refusing to use a service-account key that lives inside the repository. Move it outside the project folder (and never commit it).');
  if (!existsSync(abs)) throw new Error(`Credentials file not found: ${abs}`);
  const { token, project: keyProject } = await accessToken(abs);
  const p = project ?? keyProject;
  const base = `https://firestore.googleapis.com/v1/projects/${p}/databases/(default)/documents`;
  return { source: `Firestore project ${p}`, docs: await fetchCollection({ base, headers: { Authorization: `Bearer ${token}` } }), sample: false };
}

// ------------------------------------------------------------------------------------------------ build

/** Turns raw documents into the report files. Pure apart from the writes. */
export function buildReport({ docs, source, sample }, o, now = new Date()) {
  const records = annotate(docs.map((d) => normalizeRecord(d.id, d.doc)));
  const filters = { from: o.from, to: o.to, version: o.version, os: o.os, minRating: o['min-rating'] ? Number(o['min-rating']) : 0, maxRating: o['max-rating'] ? Number(o['max-rating']) : 0, topic: o.topic };
  const chosen = filterRecords(records, filters);
  const redact = !o['include-contacts'];
  const summary = summarize(chosen);
  // What is embedded in the HTML for its live filters: never the contact address (unless asked), and no raw user-agent strings.
  const embedded = chosen.map((r) => ({ ...r, contact: o['include-contacts'] ? r.contact : r.contact ? '[provided]' : null, device: r.device ? { quality: r.device.quality ?? null, touch: r.device.touch ?? null } : null }));
  const html = renderReport({ records: embedded, source, generatedAt: now.toISOString(), redact, showContacts: !!o['include-contacts'], sample });
  return {
    summary,
    files: {
      'report.html': html,
      'summary.json': JSON.stringify({ source, generatedAt: now.toISOString(), sample, filters, summary }, null, 2),
      'feedback.csv': toCsv(chosen, { redact, includeText: !o['no-text'] }),
      'feedback-stats-only.csv': toCsv(chosen, { redact: true, includeText: false }),
      'feedback.json': toJson(chosen, summary, { redact }),
    },
  };
}

function openFile(path) {
  const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', path]] : process.platform === 'darwin' ? ['open', [path]] : ['xdg-open', [path]];
  execFile(cmd[0], cmd[1], () => undefined);
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.help) {
    console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(0, 24).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
    return;
  }
  const loaded = await loadDocs(o);
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
  const out = resolve(o.out ?? join(REPO, 'reports', 'feedback', stamp));
  mkdirSync(out, { recursive: true });
  const { summary, files } = buildReport(loaded, o);
  for (const [name, text] of Object.entries(files)) writeFileSync(join(out, name), text);
  const latest = join(resolve(out, '..'), 'latest.html');
  try {
    copyFileSync(join(out, 'report.html'), latest);
  } catch {
    /* custom --out outside reports/: no shortcut */
  }
  console.log(`${summary.total} submissions from ${loaded.source}`);
  console.log(`Average rating ${summary.avgRating.toFixed(1)} / 5 · positive ${summary.positivePct}% · negative ${summary.negativePct}%`);
  console.log(`Report: ${join(out, 'report.html')}`);
  if (!loaded.sample && summary.withContact) console.log(`${summary.withContact} submissions include a contact address (redacted in the files; --include-contacts shows them).`);
  if (o.open) openFile(join(out, 'report.html'));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(`feedback-report: ${e.message}`);
    process.exit(1);
  });
}
