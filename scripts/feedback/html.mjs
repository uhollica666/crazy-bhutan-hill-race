// The local, self-contained feedback dashboard (one HTML file, no network, no external scripts).
// It embeds the analytics core (core.mjs) so the filters re-compute every chart and table in the browser.
import { readFileSync } from 'node:fs';

const coreSource = readFileSync(new URL('./core.mjs', import.meta.url), 'utf8')
  .replace(/^export \{[^}]*\};?\s*$/gm, '')
  .replace(/^export /gm, '');

const CSS = `
:root{--bg:#0b0d12;--panel:#141922;--panel2:#1b212c;--line:#2a3340;--ink:#eef2f6;--mute:#9aa6b6;--fire:#ff6a1a;--blue:#2f6fd0;--green:#2e9c4f;--yellow:#f0c23a;--red:#d6322b}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,Segoe UI,Roboto,Arial,sans-serif}
header{padding:22px 28px;border-bottom:1px solid var(--line);display:flex;gap:18px;align-items:center;flex-wrap:wrap}
h1{font-size:22px;margin:0}h2{font-size:15px;letter-spacing:.12em;text-transform:uppercase;color:var(--fire);margin:0 0 12px}
.banner{background:#3a1410;border:1px solid #8a2f25;color:#ffd7d2;padding:10px 28px;font-size:13px}
.sample{background:#2a2410;border:1px solid #7a6a20;color:#ffeaa0}
main{padding:22px 28px;max-width:1400px;margin:0 auto}
.filters{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px;margin-bottom:18px;position:sticky;top:0;z-index:5}
.filters label{display:grid;gap:4px;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--mute)}
select,input{background:var(--bg);color:var(--ink);border:1px solid var(--line);border-radius:8px;padding:8px;font:inherit}
button{background:var(--fire);color:#1b0b03;border:0;border-radius:8px;padding:9px 14px;font:700 13px system-ui;cursor:pointer}button.alt{background:var(--panel2);color:var(--ink);border:1px solid var(--line)}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin-bottom:18px}
.kpi{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px}.kpi b{display:block;font-size:30px;line-height:1.1}.kpi span{color:var(--mute);font-size:12px;letter-spacing:.08em;text-transform:uppercase}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(420px,1fr));gap:16px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:16px}.card.wide{grid-column:1/-1}
.chart{width:100%;height:auto}.chart .lb{fill:var(--mute);font:11px system-ui}.chart .vl{fill:var(--ink);font:700 11px system-ui}
.donut{display:flex;gap:16px;align-items:center}.donut ul{list-style:none;margin:0;padding:0;font-size:13px}.donut li{margin:4px 0}.donut i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px}
table{width:100%;border-collapse:collapse;font-size:13px}th,td{padding:8px 6px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th{color:var(--mute);font-size:11px;letter-spacing:.1em;text-transform:uppercase}
.muted{color:var(--mute)}.stars{color:var(--yellow);letter-spacing:2px;white-space:nowrap}.tag{display:inline-block;background:var(--panel2);border:1px solid var(--line);border-radius:6px;padding:1px 6px;margin:1px;font-size:11px}
.comment{max-width:520px;white-space:pre-wrap}.comment b{color:var(--mute);font-size:11px;text-transform:uppercase;letter-spacing:.08em}
.bar{display:inline-block;height:8px;border-radius:4px;background:var(--fire);vertical-align:middle}
@media print{.filters,button{display:none}body{background:#fff;color:#000}.card,.kpi{border-color:#ccc;background:#fff}}
`;

const UI = `
const DATA = JSON.parse(document.getElementById('data').textContent);
const META = JSON.parse(document.getElementById('meta').textContent);
const ALL = DATA;
const $ = (s) => document.querySelector(s);
const uniq = (xs) => [...new Set(xs)].sort();
const state = {};
function fillSelect(id, values, label) {
  const el = $(id);
  el.innerHTML = '<option value="">' + label + '</option>' + values.map((v) => '<option value="' + esc(Array.isArray(v) ? v[0] : v) + '">' + esc(Array.isArray(v) ? v[1] : v) + '</option>').join('');
}
fillSelect('#f-version', uniq(ALL.map((r) => r.appVersion)), 'All versions');
fillSelect('#f-os', uniq(ALL.map((r) => r.platform.os)), 'All platforms');
fillSelect('#f-origin', uniq(ALL.map((r) => r.origin)), 'Anywhere');
fillSelect('#f-topic', TOPICS.map((t) => [t.id, (t.group === 'complaint' ? 'Problem: ' : t.group === 'request' ? 'Request: ' : 'Praise: ') + t.label]), 'Any topic');
function readFilters() {
  const g = (id) => $(id).value;
  return { version: g('#f-version'), os: g('#f-os'), origin: g('#f-origin'), topic: g('#f-topic'), difficulty: g('#f-difficulty'), minRating: Number(g('#f-min')) || 0, maxRating: Number(g('#f-max')) || 0, from: g('#f-from'), to: g('#f-to'), text: g('#f-text').trim() };
}
const stars = (n) => '<span class="stars">' + '★'.repeat(n) + '<span class="muted">' + '★'.repeat(5 - n) + '</span></span>';
function rows(list, max) {
  const top = Math.max(1, ...list.map((t) => t.count));
  return '<table><tr><th>Topic</th><th>Mentions</th><th></th><th>Avg ★</th></tr>' + (list.length ? list.slice(0, 12).map((t) => '<tr><td>' + esc(t.label) + '</td><td>' + t.count + ' <span class="muted">(' + t.pct + '%)</span></td><td><span class="bar" style="width:' + Math.round((120 * t.count) / top) + 'px"></span></td><td>' + t.avg.toFixed(1) + '</td></tr>').join('') : '<tr><td colspan="4" class="muted">Nothing matched</td></tr>') + '</table>';
}
function yn(label, y) {
  return '<tr><td>' + label + '</td><td>' + y.yes + ' yes / ' + y.no + ' no</td><td><b>' + y.yesPct + '%</b> of ' + y.answered + ' answers</td></tr>';
}
let current = [];
function render() {
  const f = readFilters();
  current = filterRecords(ALL, f);
  const s = summarize(current);
  $('#count').textContent = s.total + ' of ' + ALL.length + ' submissions';
  $('#kpis').innerHTML = [
    ['Submissions', s.total], ['Average rating', s.avgRating.toFixed(1) + ' / 5'], ['Positive (4-5★)', s.positivePct + '%'], ['Negative (1-2★)', s.negativePct + '%'],
    ['Would play a larger version', s.interest.largerVersion.yesPct + '%'], ['Would consider buying', s.interest.purchase.yesPct + '%'], ['Voluntary support', s.interest.voluntarySupport.yesPct + '%'], ['Shared device details', s.deviceShared.pct + '%'],
  ].map((k) => '<div class="kpi"><b>' + k[1] + '</b><span>' + k[0] + '</span></div>').join('');
  $('#c-dist').innerHTML = columnsSvg(s.distribution.map((d) => ({ label: d.stars + '★', value: d.count })));
  $('#c-time').innerHTML = lineSvg(s.byDay.map((d) => ({ day: d.day, value: d.count })));
  $('#c-version').innerHTML = barsSvg(s.versions.map((v) => ({ label: v.version, value: v.count, note: v.count + ' · ' + v.avg.toFixed(1) + '★' })), { color: '#2f6fd0' });
  $('#c-platform').innerHTML = s.deviceShared.count ? barsSvg(s.platforms.map((p) => ({ label: p.os, value: p.count, note: p.count + ' · ' + p.avg.toFixed(1) + '★' })), { color: '#2e9c4f' }) + '<p class="muted">Only players who chose to share device details are counted (' + s.deviceShared.count + ' of ' + s.total + ').</p>' : '<p class="muted">No one in this selection shared device details.</p>';
  $('#c-difficulty').innerHTML = donutHtml(s.difficulty.map((d) => ({ label: { tooEasy: 'Too easy', aboutRight: 'About right', tooDifficult: 'Too difficult' }[d.difficulty], value: d.count })));
  $('#c-price').innerHTML = barsSvg(s.interest.prices.map((p) => ({ label: { none: 'Would not pay', under5: 'Under $5', '5to10': '$5 - $10', '10to20': '$10 - $20', '20to40': '$20 - $40', over40: 'Over $40' }[p.price], value: p.count })), { color: '#f0c23a' });
  $('#t-interest').innerHTML = '<table>' + yn('Would play a larger version', s.interest.largerVersion) + yn('Would consider buying one', s.interest.purchase) + yn('Would support future games voluntarily', s.interest.voluntarySupport) + '</table>';
  $('#t-complaints').innerHTML = rows(s.complaints);
  $('#t-requests').innerHTML = rows(s.requests);
  $('#t-praise').innerHTML = rows(s.praise);
  const pick = (id) => (tid) => s.complaints.concat(s.requests, s.praise).filter((t) => t.id === tid);
  void pick;
  const field = (name, label) => (name ? '<div><b>' + label + '</b> ' + esc(META.redact ? redactText(name) : name) + '</div>' : '');
  $('#comments').innerHTML = '<table><tr><th>When</th><th>★</th><th>Version</th><th>Platform</th><th>What they said</th></tr>' + current.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 300).map((r) => '<tr><td>' + r.createdAt.slice(0, 10) + '</td><td>' + stars(r.rating) + '</td><td>' + esc(r.appVersion) + '</td><td>' + esc(r.platform.os) + '</td><td class="comment">' + field(r.favourite, 'Loved') + field(r.improve, 'Improve') + field(r.add, 'Add') + field(r.bugs, 'Bugs') + field(r.performance, 'Performance') + field(r.controls, 'Controls') + field(r.graphics, 'Graphics') + field(r.gameplay, 'Gameplay') + (META.showContacts && r.contact ? '<div><b>Contact</b> ' + esc(r.contact) + '</div>' : '') + r.topics.map((t) => '<span class="tag">' + esc(t) + '</span>').join('') + '</td></tr>').join('') + '</table>' + (current.length > 300 ? '<p class="muted">Showing the newest 300. Export for everything.</p>' : '');
}
function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
document.querySelectorAll('.filters select, .filters input').forEach((el) => el.addEventListener('input', render));
$('#reset').addEventListener('click', () => { document.querySelectorAll('.filters select, .filters input').forEach((el) => (el.value = '')); render(); });
$('#x-csv').addEventListener('click', () => download('feedback-filtered.csv', toCsv(current, { redact: META.redact }), 'text/csv'));
$('#x-stats').addEventListener('click', () => download('feedback-filtered-stats-only.csv', toCsv(current, { redact: true, includeText: false }), 'text/csv'));
$('#x-json').addEventListener('click', () => download('feedback-filtered.json', toJson(current, summarize(current), { redact: META.redact }), 'application/json'));
$('#x-print').addEventListener('click', () => window.print());
render();
`;

/**
 * @param {{records: any[], source: string, generatedAt: string, redact: boolean, showContacts: boolean, sample: boolean}} o
 */
export function renderReport(o) {
  const safe = (v) => JSON.stringify(v).replace(/</g, '\\u003c'); // data lives in <script type=application/json>: only '<' needs escaping
  const meta = { source: o.source, generatedAt: o.generatedAt, redact: o.redact, showContacts: o.showContacts };
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>CBHR feedback report</title><style>${CSS}</style></head><body>
<div class="banner">CONFIDENTIAL: this local file contains player comments. Keep it on your machine; never upload it to the website or a public repository.${o.redact ? ' Contact addresses, emails and phone numbers are redacted.' : ' Redaction is OFF for this report.'}</div>
${o.sample ? '<div class="banner sample">SAMPLE DATA: generated to demonstrate the report. These are not real player submissions.</div>' : ''}
<header><h1>Crazy Bhutan Hill Race · Player feedback</h1><span class="muted">Source: ${o.source} · generated ${o.generatedAt}</span><span id="count" class="muted"></span>
<span style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap"><button id="x-csv">Export CSV</button><button id="x-stats" class="alt">Stats-only CSV</button><button id="x-json" class="alt">Export JSON</button><button id="x-print" class="alt">Print</button></span></header>
<main>
<section class="filters" aria-label="Filters">
<label>Version<select id="f-version"></select></label><label>Platform<select id="f-os"></select></label><label>Opened from<select id="f-origin"></select></label>
<label>Topic<select id="f-topic"></select></label>
<label>Difficulty<select id="f-difficulty"><option value="">Any</option><option value="tooEasy">Too easy</option><option value="aboutRight">About right</option><option value="tooDifficult">Too difficult</option></select></label>
<label>Min stars<select id="f-min"><option value="">Any</option><option>1</option><option>2</option><option>3</option><option>4</option><option>5</option></select></label>
<label>Max stars<select id="f-max"><option value="">Any</option><option>1</option><option>2</option><option>3</option><option>4</option><option>5</option></select></label>
<label>From<input type="date" id="f-from"></label><label>To<input type="date" id="f-to"></label><label>Search comments<input type="search" id="f-text" placeholder="e.g. steering"></label>
<label>&nbsp;<button class="alt" id="reset" type="button">Reset</button></label>
</section>
<section class="kpis" id="kpis"></section>
<div class="grid">
<div class="card"><h2>Rating distribution</h2><div id="c-dist"></div></div>
<div class="card"><h2>Submissions over time</h2><div id="c-time"></div></div>
<div class="card"><h2>App versions</h2><div id="c-version"></div></div>
<div class="card"><h2>Platforms (opt-in)</h2><div id="c-platform"></div></div>
<div class="card"><h2>Difficulty preference</h2><div id="c-difficulty"></div></div>
<div class="card"><h2>Price range for a larger version</h2><div id="c-price"></div></div>
<div class="card wide"><h2>Interest in a larger version, purchase and support</h2><div id="t-interest"></div></div>
<div class="card"><h2>Problems and complaints</h2><div id="t-complaints"></div></div>
<div class="card"><h2>Requested features</h2><div id="t-requests"></div></div>
<div class="card"><h2>What players love</h2><div id="t-praise"></div></div>
<div class="card"><h2>How topics are found</h2><p class="muted">Transparent keyword rules, applied locally to the relevant answer fields (see <code>TOPICS</code> in <code>scripts/feedback/core.mjs</code>). No AI service is used. A comment can match several topics. Counts show how many submissions mention a topic, not how many times.</p></div>
<div class="card wide"><h2>Individual comments</h2><div id="comments"></div></div>
</div></main>
<script type="application/json" id="data">${safe(o.records)}</script>
<script type="application/json" id="meta">${safe(meta)}</script>
<script>
${coreSource}
${UI}
</script></body></html>`;
}
