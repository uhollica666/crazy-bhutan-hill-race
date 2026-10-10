// Developer feedback analytics: the pure core. No network, no file access, no dependencies, so it is trivially testable and the same
// source runs in the command line tool AND inside the generated HTML report (the report inlines this file for its live filters).
//
// Privacy: individual comments are only ever shown in the developer's own local report. Aggregates and exports built with
// `redact: true` (the default) contain no contact addresses and have emails and phone numbers scrubbed from any quoted text.
// Classification is transparent and local: the rule table below is the whole "model", with no AI service involved.

/** @typedef {{id:string, createdAt:string, appVersion:string, origin:string, rating:number, gameplay:string, controls:string, graphics:string, performance:string, difficulty:string|null, favourite:string, improve:string, add:string, bugs:string, contact:string|null, device:Record<string,unknown>|null, interest:{playLargerVersion:boolean|null, considerPurchasingFullGame:boolean|null, priceRange:string|null, voluntarySupport:boolean|null}}} FeedbackRecord */

const TEXT_FIELDS = ['gameplay', 'controls', 'graphics', 'performance', 'favourite', 'improve', 'add', 'bugs'];

/**
 * The rule table. Each rule is a topic, the kind of statement it counts, and the plain-language patterns that trigger it. Patterns are
 * matched case-insensitively against the relevant free-text fields only (complaints against what hurt, requests against what to
 * add, praise against what was loved), so "the music is great" in a favourites box is praise, not a complaint.
 * @type {{id:string, label:string, group:'complaint'|'request'|'praise', fields:string[], patterns:RegExp[]}[]}
 */
export const TOPICS = [
  // ---- complaints and problems
  { id: 'perf', label: 'Lag, stutter or low frame rate', group: 'complaint', fields: ['performance', 'improve', 'bugs', 'graphics', 'gameplay'], patterns: [/\b(lag|laggy|lagging|stutter\w*|choppy|low fps|fps (drop|is low)|frame ?rate|slow(ness)?|freez\w+|hitch\w*|sluggish|unplayable|overheat\w*|battery|too heavy|heavy on)\b/i] },
  { id: 'crash', label: 'Crashes, black screens, will not load', group: 'complaint', fields: ['performance', 'improve', 'bugs', 'gameplay'], patterns: [/\b(crash\w*|black screen|blank screen|white screen|won'?t (load|start|open)|doesn'?t (load|start|open)|stuck (on|at) load\w*|force close|closes by itself|quits)\b/i] },
  { id: 'controls-steer', label: 'Steering and handling', group: 'complaint', fields: ['controls', 'improve', 'gameplay', 'bugs'], patterns: [/\b(steer\w*|handling|oversteer|understeer|twitchy|too (sensitive|sharp|slippery|slidey)|slide|drift|skid\w*|hard to (control|turn)|spin\w* out|flip\w*)\b/i] },
  { id: 'controls-touch', label: 'Touch controls on phones', group: 'complaint', fields: ['controls', 'improve', 'bugs'], patterns: [/\b(touch|touchscreen|phone|mobile|on-?screen|virtual (stick|wheel)|thumb|buttons? (is|are)? ?(too )?(small|tiny|hidden))\b/i] },
  { id: 'controls-pad', label: 'Gamepad support', group: 'complaint', fields: ['controls', 'improve', 'bugs'], patterns: [/\b(gamepad|game ?pad|controller|joystick|xbox|playstation|ps4|ps5|dualshock|dualsense)\b/i] },
  { id: 'camera', label: 'Camera views and reversing', group: 'complaint', fields: ['controls', 'improve', 'graphics', 'bugs', 'gameplay'], patterns: [/\b(camera|view|cockpit|first[- ]person|third[- ]person|rear ?view|mirror|shake|shaking|nausea|motion sick\w*|dizzy)\b/i] },
  { id: 'dark-visibility', label: 'Too dark, fog or hard to see', group: 'complaint', fields: ['graphics', 'improve', 'gameplay', 'bugs'], patterns: [/\b(too dark|dark(ness)?|can'?t see|cannot see|hard to see|visibility|too foggy|fog is|headlights?|night (is|was)? ?(too )?(hard|dark))\b/i] },
  { id: 'gfx-quality', label: 'Graphics glitches or quality', group: 'complaint', fields: ['graphics', 'improve', 'bugs'], patterns: [/\b(blurr?y|ugly|texture\w*|low[- ]poly|pop[- ]?in|flicker\w*|jagg\w+|alias\w*|shadows? (are|is)|z-?fight\w*|clipping|see[- ]through|missing (texture|model))\b/i] },
  { id: 'audio', label: 'Sound and music balance', group: 'complaint', fields: ['improve', 'bugs', 'performance', 'gameplay', 'graphics'], patterns: [/\b(too loud|too quiet|volume|music (is|was)?\s?(too|annoying|repetitive|loud)|sound (cuts|stops|glitch\w*|bug\w*)|audio (cuts|stops|glitch\w*|bug\w*|issue)|no sound|crackl\w+|static noise|background (noise|sound)|keeps? playing)\b/i] },
  { id: 'too-hard', label: 'Too difficult or unfair', group: 'complaint', fields: ['improve', 'gameplay', 'bugs'], patterns: [/\b(too (hard|difficult|tough)|impossible|frustrat\w+|unfair|cheap|can'?t (beat|finish|pass|complete)|deadline|timer is|time limit|not enough time|ran out of (time|fuel))\b/i] },
  { id: 'too-easy', label: 'Too easy', group: 'complaint', fields: ['improve', 'gameplay'], patterns: [/\b(too easy|boringly easy|no challenge|not challenging|trivial)\b/i] },
  { id: 'stuck-bug', label: 'Stuck, falling through, softlocks', group: 'complaint', fields: ['bugs', 'improve', 'gameplay'], patterns: [/\b(stuck|fell? through|fall(s|ing)? (through|off)|softlock\w*|can'?t (move|continue|reverse)|trapped|wedged|blocked road|invisible wall|glitch\w*|bug\w*|broken)\b/i] },
  { id: 'fuel', label: 'Fuel and economy', group: 'complaint', fields: ['improve', 'gameplay', 'bugs'], patterns: [/\b(fuel|petrol|gasoline|refuel\w*|out of gas|credits|too expensive|grind\w*)\b/i] },
  { id: 'ui', label: 'Menus, text and clarity', group: 'complaint', fields: ['improve', 'bugs', 'controls', 'graphics'], patterns: [/\b(menu\w*|ui\b|hud|text (is )?(too )?small|unreadable|hard to read|confus\w+|unclear|tutorial|don'?t (know|understand)|where (is|do))\b/i] },
  { id: 'saves', label: 'Saves and progress', group: 'complaint', fields: ['bugs', 'improve', 'gameplay'], patterns: [/\b(lost (my )?(progress|save)|save (is |was )?(lost|gone|reset)|progress (reset|lost|gone)|cloud (save|sync)|reset(s)? (my )?progress)\b/i] },
  { id: 'traffic-ai', label: 'Traffic, creatures and collisions', group: 'complaint', fields: ['improve', 'bugs', 'gameplay'], patterns: [/\b(traffic|other cars|ai (cars|drivers)|collision\w*|hit by|rammed|bumped|yak|yeti|zombie|ghost|bear)\b/i] },
  // ---- requests
  { id: 'req-routes', label: 'More routes and missions', group: 'request', fields: ['add', 'improve'], patterns: [/\b(more (levels?|routes?|missions?|maps?|roads?|places?|areas?|tracks?)|new (levels?|routes?|missions?|maps?|areas?)|longer (campaign|game)|more story|more of bhutan|paro|punakha|bumthang)\b/i] },
  { id: 'req-vehicles', label: 'More vehicles', group: 'request', fields: ['add', 'improve'], patterns: [/\b(more (cars?|vehicles?|trucks?|buses|bikes?|motorc\w+|rides)|new (cars?|vehicles?|trucks?|buses)|tractor|taxi|bus\b|truck|motorbike|bicycle)\b/i] },
  { id: 'req-multiplayer', label: 'Multiplayer and friends', group: 'request', fields: ['add', 'improve'], patterns: [/\b(multiplayer|multi-player|co-?op|online (race|play|mode)|with friends|split[- ]screen|pvp|race (against|with) (players|friends))\b/i] },
  { id: 'req-custom', label: 'Customisation and upgrades', group: 'request', fields: ['add', 'improve'], patterns: [/\b(customi[sz]\w+|paint|skins?|stickers?|livery|decals?|upgrades?|tuning|body kit|modify|modding|mods?)\b/i] },
  { id: 'req-weather', label: 'Weather, seasons and time of day', group: 'request', fields: ['add', 'improve'], patterns: [/\b(weather|seasons?|rain|snow|monsoon|day[- ]night|time of day|dynamic)\b/i] },
  { id: 'req-modes', label: 'Game modes, races and photo mode', group: 'request', fields: ['add', 'improve'], patterns: [/\b(race mode|time trial|free ?roam|open world|photo mode|sandbox|endless|challenges?|daily|rivals?|ghost car|replay)\b/i] },
  { id: 'req-online', label: 'Leaderboards and online features', group: 'request', fields: ['add', 'improve'], patterns: [/\b(leaderboards?|rankings?|achievements?|trophies|online scores?|share (score|replay)|friends list)\b/i] },
  { id: 'req-lang', label: 'Languages', group: 'request', fields: ['add', 'improve', 'bugs'], patterns: [/\b(language|translat\w+|dzongkha|nepali|hindi|bengali|chinese|spanish|french|german|localis\w+|localiz\w+)\b/i] },
  { id: 'req-controls', label: 'Controls and accessibility options', group: 'request', fields: ['add', 'improve', 'controls'], patterns: [/\b(key ?binds?|remap\w*|rebind\w*|steering wheel|accessib\w+|colou?r ?blind|subtitles?|auto[- ]?(drive|brake)|assist\w*|controller support)\b/i] },
  { id: 'req-sound', label: 'More music and sound', group: 'request', fields: ['add', 'improve'], patterns: [/\b(more (music|songs|tracks)|radio|playlist|engine sounds?|horn|sound effects)\b/i] },
  { id: 'req-platform', label: 'Other platforms (iOS, Mac, consoles)', group: 'request', fields: ['add', 'improve'], patterns: [/\b(ios|iphone|ipad|mac\b|macos|linux|steam|console|playstation|xbox|switch|app store|play store)\b/i] },
  // ---- praise
  { id: 'love-scenery', label: 'Scenery and atmosphere', group: 'praise', fields: ['favourite', 'gameplay', 'graphics'], patterns: [/\b(scenery|views?|landscape|mountains?|atmosphere|environment|beautiful|gorgeous|stunning|prayer flags?|dzong|bhutan|culture|visuals?|graphics|look(s|ed)?)\b/i] },
  { id: 'love-music', label: 'Music and sound', group: 'praise', fields: ['favourite', 'gameplay'], patterns: [/\b(music|soundtrack|songs?|tracks?|audio|sound)\b/i] },
  { id: 'love-driving', label: 'Driving feel and handling', group: 'praise', fields: ['favourite', 'gameplay', 'controls'], patterns: [/\b(driving|handling|physics|controls? (are|feel)|drift\w*|hairpins?|fun to drive|feels? (good|great|real))\b/i] },
  { id: 'love-vehicles', label: 'Vehicles and garage', group: 'praise', fields: ['favourite', 'gameplay', 'graphics'], patterns: [/\b(vehicles?|cars?|garage|upgrades?|customi[sz]\w+|dragon cruiser|coaster|ranger)\b/i] },
  { id: 'love-story', label: 'Missions, story and variety', group: 'praise', fields: ['favourite', 'gameplay'], patterns: [/\b(missions?|story|passengers?|tourists?|campaign|variety|routes?|levels?|humou?r|funny|charming)\b/i] },
  { id: 'love-challenge', label: 'Challenge and weather', group: 'praise', fields: ['favourite', 'gameplay'], patterns: [/\b(challeng\w+|weather|storm|snow|night|fog|river|ford|yeti|creatures?)\b/i] },
];

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE = /(?<![\w.])(?:\+?\d[\d\s().-]{7,}\d)(?![\w.])/g;
const HANDLE = /(^|\s)@[A-Za-z0-9_.]{2,30}\b/g;

/** Removes email addresses, phone-like numbers and @handles from free text. */
export function redactText(s) {
  return String(s ?? '').replace(EMAIL, '[email]').replace(PHONE, '[number]').replace(HANDLE, '$1[handle]');
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v));
const str = (v) => (typeof v === 'string' ? v : '');
const boolOrNull = (v) => (typeof v === 'boolean' ? v : null);

/** Tolerant conversion of a stored document (already a plain object) to a record. Never throws. */
export function normalizeRecord(id, d) {
  const o = d && typeof d === 'object' ? d : {};
  const created = o.createdAt ?? o.clientAt;
  const ms = typeof created === 'number' ? created : Date.parse(String(created));
  const interest = o.interest && typeof o.interest === 'object' ? o.interest : {};
  /** @type {FeedbackRecord} */
  const rec = {
    id: String(id),
    createdAt: Number.isFinite(ms) ? new Date(ms).toISOString() : new Date(0).toISOString(),
    appVersion: str(o.appVersion) || 'unknown',
    origin: str(o.origin) || 'unknown',
    rating: Math.min(5, Math.max(0, Math.round(num(o.rating)) || 0)),
    gameplay: str(o.gameplay),
    controls: str(o.controls),
    graphics: str(o.graphics),
    performance: str(o.performance),
    difficulty: ['tooEasy', 'aboutRight', 'tooDifficult'].includes(o.difficulty) ? o.difficulty : null,
    favourite: str(o.favourite),
    improve: str(o.improve),
    add: str(o.add),
    bugs: str(o.bugs),
    contact: typeof o.contact === 'string' && o.contact.trim() ? o.contact.trim() : null,
    device: o.device && typeof o.device === 'object' ? o.device : null,
    interest: {
      playLargerVersion: boolOrNull(interest.playLargerVersion),
      considerPurchasingFullGame: boolOrNull(interest.considerPurchasingFullGame),
      priceRange: str(interest.priceRange) || null,
      voluntarySupport: boolOrNull(interest.voluntarySupport),
    },
  };
  return rec;
}

/** Converts a Firestore REST "fields" map (typed values) to a plain object. */
export function fromFirestoreValue(v) {
  if (!v || typeof v !== 'object') return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return Date.parse(v.timestampValue);
  if ('nullValue' in v) return null;
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields ?? {}).map(([k, x]) => [k, fromFirestoreValue(x)]));
  if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(fromFirestoreValue);
  return null;
}
export const fromFirestoreFields = (fields) => Object.fromEntries(Object.entries(fields ?? {}).map(([k, v]) => [k, fromFirestoreValue(v)]));

/** Operating system and device class from the opt-in device block. Players who did not share it are "not shared". */
export function platformOf(device) {
  if (!device) return { os: 'Not shared', kind: 'Not shared' };
  const ua = `${device.userAgent ?? ''} ${device.platform ?? ''}`;
  let os = 'Other';
  if (/android/i.test(ua)) os = 'Android';
  else if (/iphone|ipad|ios/i.test(ua)) os = 'iOS';
  else if (/windows|win32|win64/i.test(ua)) os = 'Windows';
  else if (/mac(intosh| os)|macintel/i.test(ua)) os = 'macOS';
  else if (/cros/i.test(ua)) os = 'ChromeOS';
  else if (/linux|x11/i.test(ua)) os = 'Linux';
  const kind = device.touch === true && /android|iphone|ipad|ios/i.test(ua) ? 'Phone or tablet' : 'Desktop or laptop';
  return { os, kind };
}

/** Adds the derived fields every view needs: classified topics and the platform. */
export function annotate(records) {
  return records.map((r) => {
    const topics = new Set();
    for (const t of TOPICS) {
      for (const f of t.fields) {
        const text = r[f];
        if (text && t.patterns.some((p) => p.test(text))) {
          topics.add(t.id);
          break;
        }
      }
    }
    // A topic found only in a field that cannot state it is ignored: praise needs a favourite/gameplay text, requests need "add"/"improve".
    return { ...r, topics: [...topics], platform: platformOf(r.device) };
  });
}

/** @typedef {{from?:string, to?:string, version?:string, os?:string, minRating?:number, maxRating?:number, topic?:string, origin?:string, difficulty?:string, text?:string}} Filters */

/** Filters annotated records. */
export function filterRecords(records, f = {}) {
  const q = f.text ? f.text.toLowerCase() : '';
  return records.filter((r) => {
    if (f.from && r.createdAt.slice(0, 10) < f.from.slice(0, 10)) return false;
    if (f.to && r.createdAt.slice(0, 10) > f.to.slice(0, 10)) return false;
    if (f.version && r.appVersion !== f.version) return false;
    if (f.os && r.platform.os !== f.os) return false;
    if (f.minRating && r.rating < f.minRating) return false;
    if (f.maxRating && r.rating > f.maxRating) return false;
    if (f.topic && !r.topics.includes(f.topic)) return false;
    if (f.origin && r.origin !== f.origin) return false;
    if (f.difficulty && r.difficulty !== f.difficulty) return false;
    if (q && !TEXT_FIELDS.some((k) => r[k].toLowerCase().includes(q))) return false;
    return true;
  });
}

const pct = (n, d) => (d ? Math.round((1000 * n) / d) / 10 : 0);
const avg = (xs) => (xs.length ? Math.round((10 * xs.reduce((a, b) => a + b, 0)) / xs.length) / 10 : 0);
const countBy = (xs, key) => {
  const m = new Map();
  for (const x of xs) m.set(key(x), (m.get(key(x)) ?? 0) + 1);
  return m;
};
const sortedEntries = (m) => [...m.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));

function yesNo(records, pick) {
  const answered = records.map(pick).filter((v) => v !== null);
  const yes = answered.filter(Boolean).length;
  return { answered: answered.length, yes, no: answered.length - yes, yesPct: pct(yes, answered.length), answeredPct: pct(answered.length, records.length) };
}

/** Everything the dashboard shows. `records` must be annotated. */
export function summarize(records) {
  const n = records.length;
  const ratings = records.map((r) => r.rating).filter((x) => x > 0);
  const dist = [1, 2, 3, 4, 5].map((s) => ({ stars: s, count: ratings.filter((x) => x === s).length }));
  const byDay = [...countBy(records, (r) => r.createdAt.slice(0, 10)).entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([day, count]) => ({ day, count, avg: avg(records.filter((r) => r.createdAt.startsWith(day)).map((r) => r.rating)) }));
  const versions = sortedEntries(countBy(records, (r) => r.appVersion)).map(([version, count]) => ({ version, count, avg: avg(records.filter((r) => r.appVersion === version).map((r) => r.rating)) }));
  const origins = sortedEntries(countBy(records, (r) => r.origin)).map(([origin, count]) => ({ origin, count }));
  const optedIn = records.filter((r) => r.device);
  const platforms = sortedEntries(countBy(optedIn, (r) => r.platform.os)).map(([os, count]) => ({ os, count, avg: avg(optedIn.filter((r) => r.platform.os === os).map((r) => r.rating)) }));
  const kinds = sortedEntries(countBy(optedIn, (r) => r.platform.kind)).map(([kind, count]) => ({ kind, count }));
  const qualities = sortedEntries(countBy(optedIn.filter((r) => r.device.quality), (r) => String(r.device.quality))).map(([quality, count]) => ({ quality, count }));
  const difficulty = ['tooEasy', 'aboutRight', 'tooDifficult'].map((d) => ({ difficulty: d, count: records.filter((r) => r.difficulty === d).length }));
  const prices = ['none', 'under5', '5to10', '10to20', '20to40', 'over40'].map((p) => ({ price: p, count: records.filter((r) => r.interest.priceRange === p).length }));
  const topicRows = TOPICS.map((t) => {
    const hit = records.filter((r) => r.topics.includes(t.id));
    return { id: t.id, label: t.label, group: t.group, count: hit.length, pct: pct(hit.length, n), avg: avg(hit.map((r) => r.rating)) };
  }).filter((t) => t.count > 0);
  const byGroup = (g) => topicRows.filter((t) => t.group === g).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const fill = TEXT_FIELDS.map((f) => ({ field: f, count: records.filter((r) => r[f]).length, pct: pct(records.filter((r) => r[f]).length, n) }));
  const positive = ratings.filter((x) => x >= 4).length;
  const negative = ratings.filter((x) => x <= 2).length;
  return {
    total: n,
    avgRating: avg(ratings),
    positivePct: pct(positive, ratings.length),
    negativePct: pct(negative, ratings.length),
    distribution: dist,
    byDay,
    versions,
    origins,
    deviceShared: { count: optedIn.length, pct: pct(optedIn.length, n) },
    platforms,
    kinds,
    qualities,
    difficulty,
    interest: {
      largerVersion: yesNo(records, (r) => r.interest.playLargerVersion),
      purchase: yesNo(records, (r) => r.interest.considerPurchasingFullGame),
      voluntarySupport: yesNo(records, (r) => r.interest.voluntarySupport),
      prices,
    },
    complaints: byGroup('complaint'),
    requests: byGroup('request'),
    praise: byGroup('praise'),
    textFill: fill,
    withContact: records.filter((r) => r.contact).length,
    range: n ? { first: records.reduce((a, r) => (r.createdAt < a ? r.createdAt : a), records[0].createdAt), last: records.reduce((a, r) => (r.createdAt > a ? r.createdAt : a), records[0].createdAt) } : null,
  };
}

// ---------------------------------------------------------------------------------------------- exports

const csvCell = (v) => {
  let s = v === null || v === undefined ? '' : String(v);
  // Spreadsheet formula injection: a cell that starts like a formula is neutralised.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * CSV of the records. With `redact` (default) contact addresses are omitted and emails/phones scrubbed from text; with
 * `includeText: false` only the structured columns are written (safe to share with anyone).
 */
export function toCsv(records, { redact = true, includeText = true } = {}) {
  const head = ['id', 'created_at', 'app_version', 'origin', 'rating', 'difficulty', 'os', 'device_kind', 'quality', 'play_larger_version', 'consider_purchase', 'price_range', 'voluntary_support', 'topics'];
  if (includeText) head.push(...TEXT_FIELDS);
  if (!redact) head.push('contact');
  const lines = [head.join(',')];
  const t = (s) => (redact ? redactText(s) : s);
  for (const r of records) {
    const row = [r.id, r.createdAt, r.appVersion, r.origin, r.rating, r.difficulty, r.platform.os, r.platform.kind, r.device?.quality ?? '', r.interest.playLargerVersion, r.interest.considerPurchasingFullGame, r.interest.priceRange, r.interest.voluntarySupport, r.topics.join('|')];
    if (includeText) for (const f of TEXT_FIELDS) row.push(t(r[f]));
    if (!redact) row.push(r.contact ?? '');
    lines.push(row.map(csvCell).join(','));
  }
  return `${lines.join('\n')}\n`;
}

/** JSON export. Redacted by default (no contact, scrubbed text, no device user-agent strings). */
export function toJson(records, summary, { redact = true } = {}) {
  const clean = records.map((r) => {
    const o = { ...r };
    if (redact) {
      o.contact = r.contact ? '[provided]' : null;
      for (const f of TEXT_FIELDS) o[f] = redactText(r[f]);
      o.device = r.device ? { quality: r.device.quality ?? null, touch: r.device.touch ?? null, appVersion: r.device.appVersion ?? null, platform: r.platform } : null;
    }
    return o;
  });
  return JSON.stringify({ generatedBy: 'scripts/feedback-report.mjs', redacted: redact, summary, records: clean }, null, 2);
}

// ---------------------------------------------------------------------------------------------- charts (SVG strings)

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const PALETTE = ['#ff6a1a', '#2f6fd0', '#2e9c4f', '#f0c23a', '#d6322b', '#8a63d2', '#2aa6a6', '#a7b0be'];

/** Horizontal bars: items = [{label, value, note?}]. */
export function barsSvg(items, { width = 560, color = '#ff6a1a', max } = {}) {
  const rows = items.length;
  const h = Math.max(40, rows * 30 + 10);
  const top = max ?? Math.max(1, ...items.map((i) => i.value));
  const labelW = 190;
  const bars = items
    .map((it, i) => {
      const w = Math.max(it.value ? 2 : 0, Math.round(((width - labelW - 70) * it.value) / top));
      const y = 6 + i * 30;
      return `<text x="0" y="${y + 15}" class="lb">${esc(it.label)}</text><rect x="${labelW}" y="${y}" width="${w}" height="20" rx="4" fill="${color}"/><text x="${labelW + w + 8}" y="${y + 15}" class="vl">${esc(it.note ?? it.value)}</text>`;
    })
    .join('');
  return `<svg viewBox="0 0 ${width} ${h}" role="img" class="chart">${bars}</svg>`;
}

/** Column histogram: items = [{label, value}]. */
export function columnsSvg(items, { width = 420, height = 170, color = '#ff6a1a' } = {}) {
  const top = Math.max(1, ...items.map((i) => i.value));
  const bw = Math.floor((width - 20) / items.length) - 10;
  const cols = items
    .map((it, i) => {
      const hh = Math.round(((height - 48) * it.value) / top);
      const x = 10 + i * (bw + 10);
      return `<rect x="${x}" y="${height - 28 - hh}" width="${bw}" height="${hh}" rx="4" fill="${color}"/><text x="${x + bw / 2}" y="${height - 31 - hh}" class="vl" text-anchor="middle">${it.value}</text><text x="${x + bw / 2}" y="${height - 10}" class="lb" text-anchor="middle">${esc(it.label)}</text>`;
    })
    .join('');
  return `<svg viewBox="0 0 ${width} ${height}" role="img" class="chart">${cols}</svg>`;
}

/** Line chart over days: points = [{day, value}]. */
export function lineSvg(points, { width = 560, height = 170, color = '#2f6fd0' } = {}) {
  if (!points.length) return `<svg viewBox="0 0 ${width} 40" class="chart"><text x="0" y="24" class="lb">No data in this range</text></svg>`;
  const top = Math.max(1, ...points.map((p) => p.value));
  const x = (i) => 30 + (points.length === 1 ? (width - 50) / 2 : ((width - 50) * i) / (points.length - 1));
  const y = (v) => height - 28 - ((height - 52) * v) / top;
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ');
  const dots = points.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="3.5" fill="${color}"><title>${esc(p.day)}: ${p.value}</title></circle>`).join('');
  const first = points[0].day.slice(5);
  const last = points[points.length - 1].day.slice(5);
  return `<svg viewBox="0 0 ${width} ${height}" role="img" class="chart"><path d="${d}" fill="none" stroke="${color}" stroke-width="2.5"/>${dots}<text x="30" y="${height - 8}" class="lb">${esc(first)}</text><text x="${width - 20}" y="${height - 8}" class="lb" text-anchor="end">${esc(last)}</text><text x="4" y="14" class="lb">${top}</text></svg>`;
}

/** Donut: items = [{label, value}]. Returns the svg plus a legend. */
export function donutHtml(items, { size = 150 } = {}) {
  const total = items.reduce((a, b) => a + b.value, 0);
  if (!total) return '<p class="muted">No answers yet</p>';
  let acc = 0;
  const r = 56;
  const c = 2 * Math.PI * r;
  const arcs = items
    .map((it, i) => {
      const len = (c * it.value) / total;
      const s = `<circle r="${r}" cx="70" cy="70" fill="none" stroke="${PALETTE[i % PALETTE.length]}" stroke-width="22" stroke-dasharray="${len.toFixed(2)} ${(c - len).toFixed(2)}" stroke-dashoffset="${(-acc).toFixed(2)}" transform="rotate(-90 70 70)"/>`;
      acc += len;
      return s;
    })
    .join('');
  const legend = items.map((it, i) => `<li><i style="background:${PALETTE[i % PALETTE.length]}"></i>${esc(it.label)} <b>${it.value}</b> <small>${pct(it.value, total)}%</small></li>`).join('');
  return `<div class="donut"><svg viewBox="0 0 140 140" width="${size}" height="${size}" role="img"><circle r="${r}" cx="70" cy="70" fill="none" stroke="#222a36" stroke-width="22"/>${arcs}</svg><ul>${legend}</ul></div>`;
}

export const CHARTS = { barsSvg, columnsSvg, lineSvg, donutHtml };
export { TEXT_FIELDS };
