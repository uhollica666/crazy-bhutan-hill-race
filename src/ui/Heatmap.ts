import { getLevel, listLevels } from '../data/levels';
import { listVehicles } from '../data/vehicles';
import { histogram, sampleIncidents } from '../cloud/Telemetry';
import type { IncidentLog, LoggedIncident } from '../cloud/Telemetry';
import type { IncidentType } from '../cloud/events';
import { Road } from '../world/Road';

const COLORS: Record<IncidentType, string> = {
  collision: '#ff6b4a',
  recovered: '#f2c14e',
  fuel_exhausted: '#8bd0ff',
  stuck: '#d79bff',
  hazard: '#ffa94d',
  abandoned: '#bfbfbf',
  failed: '#ff4a8d',
};
const BINS = 60;

/** Where a bin falls on the screen, and a density colour from a count. Pure helpers (tested). */
export function heatColor(count: number, max: number): string {
  if (max <= 0 || count <= 0) return 'rgba(120,110,95,0.35)';
  const k = Math.min(1, count / max);
  const r = Math.round(255 * Math.min(1, 0.4 + k * 1.2));
  const g = Math.round(210 * (1 - k * 0.85));
  return `rgb(${r},${g},60)`;
}

export interface HotSpot {
  from: number;
  to: number;
  count: number;
}

/** The busiest stretches of the route (merged neighbouring bins), most incidents first. */
export function hotSpots(h: number[], top = 3): HotSpot[] {
  const max = Math.max(...h, 0);
  if (max === 0) return [];
  const spots: HotSpot[] = [];
  const used = new Array<boolean>(h.length).fill(false);
  const order = h.map((c, i) => ({ c, i })).sort((a, b) => b.c - a.c);
  for (const { c, i } of order) {
    if (spots.length >= top || c < max * 0.35) break;
    if (used[i]) continue;
    let lo = i;
    let hi = i;
    while (lo > 0 && h[lo - 1] >= c * 0.5 && !used[lo - 1]) lo--;
    while (hi < h.length - 1 && h[hi + 1] >= c * 0.5 && !used[hi + 1]) hi++;
    let total = 0;
    for (let k = lo; k <= hi; k++) {
      used[k] = true;
      total += h[k];
    }
    spots.push({ from: lo / h.length, to: (hi + 1) / h.length, count: total });
  }
  return spots.sort((a, b) => b.count - a.count);
}

/**
 * A developer-only view of where drivers struggle: the mission's route with incident density along it. It reads this
 * device's own incident log or a clearly labelled generated sample. It deliberately has no way to load other
 * players' data: a trustworthy cross-player heatmap needs a secured aggregation step (see docs/FIREBASE.md).
 */
export class Heatmap {
  readonly el: HTMLElement;
  private level = listLevels()[0].id;
  private source: 'device' | 'sample' = 'sample';
  private filter: IncidentType | 'all' = 'all';

  constructor(
    host: HTMLElement,
    private readonly log: IncidentLog,
    private readonly onClose: () => void,
  ) {
    const el = (this.el = document.createElement('div'));
    el.className = 'modal cloud';
    el.id = 'screen-heatmap';
    el.dataset.screen = '1';
    el.hidden = true;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Incident heatmap (developer)');
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        this.close();
      }
    });
    host.appendChild(el);
  }

  get isOpen(): boolean {
    return !this.el.hidden;
  }

  open(): void {
    this.render();
    this.el.hidden = false;
    requestAnimationFrame(() => this.el.querySelector<HTMLElement>('#hm-level')?.focus({ preventScroll: true }));
  }

  close(): void {
    if (this.el.hidden) return;
    this.el.hidden = true;
    this.onClose();
  }

  dispose(): void {
    this.el.remove();
  }

  private data(): LoggedIncident[] {
    const items = this.source === 'device' ? this.log.list(this.level) : sampleIncidents(this.level, listVehicles().map((v) => v.id));
    return this.filter === 'all' ? items : items.filter((i) => i.type === this.filter);
  }

  private render(): void {
    const items = this.data();
    const h = histogram(items, BINS);
    const spots = hotSpots(h);
    const levels = listLevels();
    const types = Object.keys(COLORS) as IncidentType[];
    this.el.innerHTML = `<div class="panel wide cl-panel hm">
      <header class="fb-head"><h2>Incident heatmap <span class="cl-beta">developer</span></h2>
        <button class="icon-btn" type="button" id="hm-close" data-back aria-label="Close">&times;</button></header>
      <p class="muted">${this.source === 'sample' ? 'Generated SAMPLE data (not from players), so the view can be checked.' : "Incidents recorded on this device only. Nothing here comes from other players."} Positions are fractions of the mission's road, never real-world places.</p>
      <div class="cl-lb-pick">
        <label class="sr-only" for="hm-level">Mission</label><select id="hm-level">${levels.map((l) => `<option value="${l.id}"${l.id === this.level ? ' selected' : ''}>${l.name}</option>`).join('')}</select>
        <label class="sr-only" for="hm-source">Data</label><select id="hm-source"><option value="sample"${this.source === 'sample' ? ' selected' : ''}>Sample data</option><option value="device"${this.source === 'device' ? ' selected' : ''}>This device</option></select>
        <label class="sr-only" for="hm-type">Incident type</label><select id="hm-type"><option value="all">All types</option>${types.map((t) => `<option value="${t}"${this.filter === t ? ' selected' : ''}>${t.replace('_', ' ')}</option>`).join('')}</select></div>
      <canvas id="hm-canvas" width="760" height="360" role="img" aria-label="Route with incident density"></canvas>
      <div class="cl-legend">${types.map((t) => `<span><i style="background:${COLORS[t]}"></i>${t.replace('_', ' ')}</span>`).join('')}</div>
      <h3>${items.length} incident${items.length === 1 ? '' : 's'}</h3>
      ${spots.length ? `<ol class="cl-records">${spots.map((s) => `<li><span>${Math.round(s.from * 100)}% to ${Math.round(s.to * 100)}% of the route</span><b>${s.count}</b></li>`).join('')}</ol>` : '<p class="muted">No incidents yet. Play a mission (crash, get stuck, run out of fuel) and they appear here.</p>'}
      <div class="stack"><button class="btn primary" type="button" id="hm-done" data-back>Done</button></div></div>`;
    this.draw(items, h);
    const q = <T extends HTMLElement>(sel: string): T => this.el.querySelector<T>(sel) as T;
    q('#hm-close').addEventListener('click', () => this.close());
    q('#hm-done').addEventListener('click', () => this.close());
    q<HTMLSelectElement>('#hm-level').addEventListener('change', (e) => {
      this.level = (e.target as HTMLSelectElement).value;
      this.render();
    });
    q<HTMLSelectElement>('#hm-source').addEventListener('change', (e) => {
      this.source = (e.target as HTMLSelectElement).value as 'device' | 'sample';
      this.render();
    });
    q<HTMLSelectElement>('#hm-type').addEventListener('change', (e) => {
      this.filter = (e.target as HTMLSelectElement).value as IncidentType | 'all';
      this.render();
    });
  }

  private draw(items: LoggedIncident[], h: number[]): void {
    const canvas = this.el.querySelector<HTMLCanvasElement>('#hm-canvas');
    const g = canvas?.getContext('2d');
    if (!canvas || !g) return;
    const road = new Road(getLevel(this.level).road, () => 0);
    const pts: { x: number; z: number }[] = [];
    for (let i = 0; i < road.count; i += 2) pts.push({ x: road.xs[i], z: road.zs[i] });
    const minX = Math.min(...pts.map((p) => p.x));
    const maxX = Math.max(...pts.map((p) => p.x));
    const minZ = Math.min(...pts.map((p) => p.z));
    const maxZ = Math.max(...pts.map((p) => p.z));
    const pad = 24;
    const k = Math.min((canvas.width - pad * 2) / Math.max(1, maxX - minX), (canvas.height - pad * 2) / Math.max(1, maxZ - minZ));
    const X = (x: number): number => pad + (x - minX) * k + (canvas.width - pad * 2 - (maxX - minX) * k) / 2;
    const Z = (z: number): number => pad + (z - minZ) * k + (canvas.height - pad * 2 - (maxZ - minZ) * k) / 2;
    g.fillStyle = '#1f1710';
    g.fillRect(0, 0, canvas.width, canvas.height);
    const max = Math.max(...h, 0);
    // The route, coloured bin by bin by how many incidents happened there.
    g.lineCap = 'round';
    g.lineWidth = 7;
    for (let i = 1; i < pts.length; i++) {
      const f = (i / pts.length) * BINS;
      g.strokeStyle = heatColor(h[Math.min(BINS - 1, Math.floor(f))], max);
      g.beginPath();
      g.moveTo(X(pts[i - 1].x), Z(pts[i - 1].z));
      g.lineTo(X(pts[i].x), Z(pts[i].z));
      g.stroke();
    }
    // Individual incidents as small markers just beside the road.
    for (const it of items) {
      const p = pts[Math.min(pts.length - 1, Math.floor(it.at * (pts.length - 1)))];
      g.fillStyle = COLORS[it.type];
      g.globalAlpha = 0.75;
      g.beginPath();
      g.arc(X(p.x) + ((Math.round(it.at * 977) % 7) - 3) * 1.4, Z(p.z) + ((Math.round(it.at * 613) % 5) - 2) * 1.4 - 8, 2.6, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    g.fillStyle = '#9bd48c';
    g.fillRect(X(pts[0].x) - 5, Z(pts[0].z) - 5, 10, 10);
    g.fillStyle = '#f5e9cf';
    g.font = '12px sans-serif';
    g.fillText('start', X(pts[0].x) + 9, Z(pts[0].z) + 4);
    g.fillText('finish', X(pts[pts.length - 1].x) + 9, Z(pts[pts.length - 1].z) + 4);
  }
}
