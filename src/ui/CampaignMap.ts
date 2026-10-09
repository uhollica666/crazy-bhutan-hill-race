import { MAP_REGIONS, MAP_VIEW, pinFor, routePath } from '../data/mapLayout';
import type { LevelCardModel } from './UI';

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

const MEDAL_FILL: Record<string, string> = { gold: '#f2c14e', silver: '#cfd2d6', bronze: '#c2824a', none: 'none' };

/** Painted backdrop: ridges, snow caps, a river, forest dots, a dzong and chorten on the horizon. Decorative only. */
function backdrop(): string {
  const { width: W, height: H } = MAP_VIEW;
  const ridge = (y: number, amp: number, seed: number, fill: string): string => {
    let d = `M0 ${H} L0 ${y}`;
    for (let x = 0; x <= W; x += 40) {
      const h = Math.sin(x * 0.011 + seed) * amp + Math.sin(x * 0.027 + seed * 2.3) * amp * 0.5;
      d += ` L${x} ${(y - Math.abs(h)).toFixed(1)}`;
    }
    return `<path d="${d} L${W} ${H} Z" fill="${fill}"/>`;
  };
  const trees = Array.from({ length: 70 }, (_, i) => {
    const x = (i * 137.5) % W;
    const y = 150 + ((i * 89.3) % (H - 190));
    return `<path d="M${x.toFixed(0)} ${y.toFixed(0)} l5 -13 l5 13 z" fill="#4b6034" opacity="0.5"/>`;
  }).join('');
  return `
    <rect width="${W}" height="${H}" fill="url(#mapSky)"/>
    ${ridge(120, 70, 1.2, '#b9a98c')}${ridge(170, 55, 3.1, '#a39373')}
    <path d="M120 100 l25 -38 l22 30 l18 -22 l30 40 z M520 75 l30 -50 l28 38 l22 -26 l36 38 z M840 105 l22 -40 l24 30 l20 -20 l30 30 z" fill="#f5f0e3" opacity="0.9"/>
    <rect y="170" width="${W}" height="${H - 170}" fill="url(#mapLand)"/>
    ${trees}
    <path d="M-10 560 C 150 520, 230 470, 330 455 S 520 420, 600 360 S 760 330, 820 280 S 940 190, 1010 170" fill="none" stroke="#7d9a8f" stroke-width="16" stroke-linecap="round" opacity="0.55"/>
    <path d="M-10 560 C 150 520, 230 470, 330 455 S 520 420, 600 360 S 760 330, 820 280 S 940 190, 1010 170" fill="none" stroke="#a9c1b6" stroke-width="5" stroke-linecap="round" opacity="0.7"/>
    <g transform="translate(405 300)" opacity="0.95"><rect x="-22" y="-8" width="44" height="14" fill="#efe4c8" stroke="#7d2a21" stroke-width="2"/><path d="M-26 -8 L0 -26 L26 -8 Z" fill="#7d2a21"/></g>
    <g transform="translate(262 252)" opacity="0.95"><path d="M-8 6 h16 v-10 l-8 -10 l-8 10 z" fill="#efe4c8" stroke="#7d2a21" stroke-width="1.6"/><circle cx="0" cy="-15" r="2" fill="#dca72c"/></g>`;
}

/**
 * The illustrated mission map: a painted sketch of the kingdom with the road winding through ten pins.
 * Pins are real buttons, so Tab, arrow keys, the gamepad and touch all work; the preview card below the map
 * updates as a pin takes focus or is chosen, and the list view stays available for anyone who prefers it.
 */
export function renderCampaignMap(cards: LevelCardModel[], selectedId: string | null): string {
  const { width: W, height: H } = MAP_VIEW;
  const pts = cards.map((c, i) => pinFor(c.id, i));
  const full = routePath(pts);
  // The unlocked stretch is drawn solid, the rest dashed.
  const lastOpen = cards.reduce((n, c, i) => (c.locked ? n : i), 0);
  const open = routePath(pts.slice(0, lastOpen + 1));
  const regions = Object.entries(MAP_REGIONS)
    .filter(([name]) => cards.some((c) => c.region === name))
    .map(([name, p]) => `<text x="${p.x}" y="${p.y}" class="map-region">${esc(name.toUpperCase())}</text>`)
    .join('');
  const pins = cards
    .map((c, i) => {
      const p = pts[i];
      const fill = MEDAL_FILL[c.medal] ?? 'none';
      const done = c.bestTime !== null;
      return `<button class="map-pin${c.locked ? ' locked' : ''}${done ? ' done' : ''}${c.isNext ? ' next' : ''}${c.id === selectedId ? ' selected' : ''}" type="button"
        data-pin="${esc(c.id)}" data-locked="${c.locked ? 1 : 0}" style="left:${((p.x / W) * 100).toFixed(2)}%;top:${((p.y / H) * 100).toFixed(2)}%"
        aria-label="${i + 1}. ${esc(c.name)}${c.locked ? ', locked: ' + esc(c.lockText) : done ? ', completed' + (c.medal !== 'none' ? ', ' + c.medal + ' medal' : '') : c.isNext ? ', next mission' : ''}">
        <span class="pin-disc" style="${done && fill !== 'none' ? `--medal:${fill}` : ''}">${c.locked ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/></svg>' : `<b>${i + 1}</b>`}</span>
        <span class="pin-name">${esc(c.name)}</span>
      </button>`;
    })
    .join('');
  return `<div class="map-art">
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="mapSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9dcc0"/><stop offset="1" stop-color="#cdbb98"/></linearGradient>
        <linearGradient id="mapLand" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cdbf9a"/><stop offset="1" stop-color="#b3a37c"/></linearGradient>
      </defs>
      ${backdrop()}
      <path d="${full}" class="map-road-ghost"/>
      <path d="${open}" class="map-road"/>
      ${regions}
    </svg>
    <div class="map-pins">${pins}</div>
  </div>
  <div class="map-preview" id="map-preview" aria-live="polite"></div>`;
}

/** The preview card for one mission. */
export function renderMapPreview(c: LevelCardModel, canGo: boolean): string {
  const tags = c.challenge ? c.challenge.split(' · ').map((t) => `<i>${esc(t)}</i>`).join('') : '';
  const state = c.locked
    ? `<p class="pv-lock">${esc(c.lockText)}</p>`
    : c.bestTime !== null
      ? `<p class="pv-best">Best ${esc(formatBest(c.bestTime))}${c.medal !== 'none' ? ` · ${esc(c.medal)} medal` : ''}</p>`
      : '<p class="pv-best muted">Not driven yet</p>';
  return `<div class="pv-main">
      <span class="mission-kind">${esc(c.region)} · ${esc(c.missionLabel)}</span>
      <h3>${esc(c.name)}</h3>
      <p>${esc(c.subtitle)}</p>
      <span class="tags">${tags}</span>
    </div>
    <div class="pv-side">
      <span class="dots" title="Difficulty ${c.difficulty} of 5">${'&#9670;'.repeat(c.difficulty)}<span class="off">${'&#9670;'.repeat(5 - c.difficulty)}</span></span>
      ${state}
      <p class="muted">Best with ${esc(c.recommended)}</p>
      <button class="btn primary" id="btn-map-go" type="button" data-go="${esc(c.id)}"${canGo ? '' : ' disabled'}>${c.locked ? 'Locked' : 'Choose vehicle'}</button>
    </div>`;
}

function formatBest(t: number): string {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}
