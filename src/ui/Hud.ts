import type { ServiceKind } from '../data/types';

export type HudMode = 'standard' | 'minimal' | 'telemetry';

export interface HudAlert {
  text: string;
  tone: 'info' | 'warn' | 'bad';
}

export interface HudState {
  speedKmh: number;
  /** Highest value the speedometer scale shows (km/h), from the vehicle's top speed. */
  scaleMaxKmh: number;
  /** Simulated engine speed 0..1 (idle..redline) and load 0..1, from the shared EngineSim. */
  rpm: number;
  load: number;
  shifting: boolean;
  /** Headline timer text (elapsed or time left, depending on the mission). */
  timerText: string;
  timerLabel: string;
  lowTime: boolean;
  checkpointsDone: number;
  /** What the player should be doing right now. */
  objective: string;
  objectiveKind: 'pickup' | 'service' | 'checkpoint' | 'finish' | 'unload';
  /** Metres to the objective along the road (null when unknown). */
  distance: number | null;
  /** 0..1 progress along the playable route. */
  progress: number;
  /** Passenger comfort, or null when the mission does not track it. */
  comfort: { value: number; quality: 'smooth' | 'firm' | 'rough'; cause: string | null } | null;
  fuel: number;
  health: number;
  driveMode: '4x2' | '4x4';
  canToggleDrive: boolean;
  engineWarn: boolean;
  onboard: number;
  party: number;
  conditions: string;
  /** Pit-stop on offer where the car is stopped, or the one in progress. */
  service: { kinds: ServiceKind[]; active: ServiceKind | null; progress: number } | null;
  /** Context line (e.g. "Stop in the yellow zone"), or ''. */
  prompt: string;
  rival: { gap: number; label: string } | null;
  headlights: boolean;
  alerts: HudAlert[];
  /** Extra readouts for the telemetry mode. */
  telemetry: { fps: number; surface: string; grade: number; slip: number; wet: number; gear: number };
}

const q = <T extends HTMLElement>(root: ParentNode, sel: string): T => {
  const el = root.querySelector<T>(sel);
  if (!el) throw new Error(`HUD: missing ${sel}`);
  return el;
};
const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

const FUEL_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true" class="gi"><path d="M5 20V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v15zM15 9h2a2 2 0 0 1 2 2v6a1.5 1.5 0 0 1-3 0v-3h-1" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M7.5 6h5v4h-5z" fill="currentColor"/></svg>';
const WRENCH_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true" class="gi"><path d="M14.5 4a5 5 0 0 0-4.6 6.9L3.5 17.3a1.9 1.9 0 0 0 2.7 2.7l6.4-6.4A5 5 0 0 0 19.5 9l-3 3-2.8-.7L13 8.5l3-3A5 5 0 0 0 14.5 4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';
const GUEST_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true" class="gi"><circle cx="9" cy="8" r="3.2" fill="currentColor"/><path d="M3 20c0-3.6 2.7-6 6-6s6 2.4 6 6z" fill="currentColor"/><circle cx="17" cy="9" r="2.4" fill="currentColor" opacity=".7"/><path d="M15.5 14.4c3 0 5.5 1.9 5.5 5.6h-4.2" fill="currentColor" opacity=".7"/></svg>';
const ENGINE_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true" class="gi"><path d="M3 10h2V8h3V6h6v2h2l2 2h2v6h-2l-2 2H8l-2-2H3z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';
const PAUSE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>';
const RECOVER_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v5h-5"/></svg>';

/** Speedometer geometry: a 270 degree sweep starting at the lower left. */
const SWEEP = 270;
const START = 135;
const polar = (r: number, deg: number): [number, number] => {
  const a = (deg * Math.PI) / 180;
  return [100 + r * Math.cos(a), 100 + r * Math.sin(a)];
};
const REV_TICKS = 28;

/** Static markup of the driving HUD. Ids are stable: tests and the Game rely on them. */
export function hudMarkup(): string {
  const revs = Array.from({ length: REV_TICKS }, (_, i) => {
    const deg = START + (SWEEP * i) / (REV_TICKS - 1);
    const [x1, y1] = polar(86, deg);
    const [x2, y2] = polar(95, deg);
    return `<line class="rev${i / (REV_TICKS - 1) > 0.84 ? ' red' : ''}" data-i="${i}" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
  }).join('');
  return `
  <section id="hud" class="hud" hidden aria-label="Driving HUD" data-mode="standard">
    <div class="hud-top">
      <div class="hud-clock" id="hud-clock">
        <span class="hud-label" id="hud-timer-label">Time</span>
        <b class="hud-time" id="hud-time" aria-live="off">0:00.00</b>
        <div class="route" id="hud-route"><i class="fill" id="hud-fill"></i></div>
      </div>
      <div class="hud-objective" id="hud-objective" aria-live="polite">
        <span class="obj-main" id="hud-obj"></span><small class="obj-dist" id="hud-dist"></small>
      </div>
    </div>

    <div class="hud-tl" id="hud-tl">
      <div class="chip hud-pax" id="hud-pax" title="Guests on board">${GUEST_ICON}<b id="pax-count">0/0</b><span class="pax-dots" id="pax-dots"></span></div>
      <div class="chip hud-comfort" id="hud-comfort" hidden>
        <span class="hud-label">Passengers</span>
        <div class="comfort-bar"><i id="comfort-fill"></i></div>
        <b id="comfort-pct">100%</b><span class="comfort-msg" id="comfort-msg">Smooth ride</span>
      </div>
    </div>

    <div class="hud-tr" id="hud-tr">
      <div class="btns">
        <button class="icon-btn" id="btn-recover" type="button" title="Recover to last checkpoint (R)" aria-label="Recover to last checkpoint">${RECOVER_ICON}</button>
        <button class="icon-btn" id="btn-pause" type="button" title="Pause (Esc)" aria-label="Pause">${PAUSE_ICON}</button>
      </div>
      <div class="hud-map" id="minimap"><canvas id="minimap-canvas" aria-label="Route map" role="img"></canvas></div>
      <div class="chip hud-cond" id="hud-cond"></div>
      <div class="chip hud-rival" id="hud-rival" hidden></div>
    </div>

    <div class="hud-alerts" id="hud-alerts" aria-live="polite"></div>

    <div class="hud-cluster" id="hud-cluster">
      <div class="vitals">
        <div class="vital" id="vital-fuel" title="Fuel">${FUEL_ICON}<div class="vbar"><i id="fuel-fill"></i></div><b id="fuel-pct">100%</b></div>
        <div class="vital" id="vital-health" title="Vehicle condition">${WRENCH_ICON}<div class="vbar"><i id="health-fill"></i></div><b id="health-pct">100%</b></div>
      </div>
      <div class="gauge" id="gauge">
        <svg viewBox="0 0 200 200" aria-hidden="true">
          <circle class="face" cx="100" cy="100" r="98"/>
          ${revs}
          <path class="track" id="speed-track" d=""/>
          <path class="speed-arc" id="speed-arc" d=""/>
          <g id="speed-ticks"></g>
          <g class="needle" id="needle"><line x1="100" y1="100" x2="100" y2="26"/><circle cx="100" cy="100" r="6"/></g>
        </svg>
        <div class="readout"><b id="hud-speed">0</b><small>km/h</small></div>
        <button class="drive-chip" id="btn-drive" type="button" title="Toggle 4x2 / 4x4 (F)" aria-label="Drive mode"><b id="drive-mode">4x2</b></button>
        <span class="eng-warn" id="eng-warn" hidden title="Engine trouble">${ENGINE_ICON}</span>
      </div>
    </div>

    <div class="center-msg" id="countdown" aria-live="assertive"></div>
    <div class="center-msg" id="flash" aria-live="polite"></div>
    <div class="hud-prompt" id="hud-prompt" hidden>
      <span id="prompt-text"></span>
      <span class="prompt-btns">
        <button class="btn" id="btn-refuel" type="button" hidden>${FUEL_ICON}<span>Refuel (E)</span></button>
        <button class="btn" id="btn-repair" type="button" hidden>${WRENCH_ICON}<span>Repair (E)</span></button>
      </span>
      <div class="svc-bar" id="svc-bar" hidden><i id="svc-fill"></i></div>
    </div>
    <div class="hud-telemetry" id="hud-telemetry" hidden></div>
    <div class="hud-hint" id="hud-hint"><kbd>W</kbd><kbd>S</kbd> drive <kbd>A</kbd><kbd>D</kbd> steer <kbd>F</kbd> 4x4 <kbd>E</kbd> service <kbd>R</kbd> recover <kbd>Esc</kbd> pause</div>
  </section>`;
}

/** Owns the HUD DOM: per-frame updates touch the DOM only when a value actually changes. */
export class Hud {
  private readonly cache = new Map<string, string>();
  private hintTimer = 0;
  private flashTimer = 0;
  private scaleMax = 0;
  private mode: HudMode = 'standard';
  private revLit = -1;
  private ticks: SVGLineElement[] = [];
  private partyShown = -1;

  constructor(private readonly root: HTMLElement) {
    this.ticks = Array.from(root.querySelectorAll<SVGLineElement>('#gauge line.rev'));
    q(root, '#speed-track').setAttribute('d', arcPath(79, START, START + SWEEP));
    this.setMode('standard');
  }

  get el(): HTMLElement {
    return q(this.root, '#hud');
  }

  show(opts: { comfort: boolean; timerLabel: string; canToggleDrive: boolean; mode: HudMode }): void {
    this.el.hidden = false;
    this.cache.clear();
    this.scaleMax = 0;
    this.revLit = -1;
    this.partyShown = -1;
    this.setMode(opts.mode);
    q(this.root, '#hud-comfort').hidden = !opts.comfort;
    q(this.root, '#hud-timer-label').textContent = opts.timerLabel;
    q(this.root, '#btn-drive').hidden = !opts.canToggleDrive;
    const hint = q(this.root, '#hud-hint');
    hint.classList.remove('fade');
    window.clearTimeout(this.hintTimer);
    this.hintTimer = window.setTimeout(() => hint.classList.add('fade'), 9000);
  }

  hide(): void {
    this.el.hidden = true;
    this.setCountdown(null);
  }

  setMode(mode: HudMode): void {
    this.mode = mode;
    this.el.dataset.mode = mode;
    q(this.root, '#hud-telemetry').hidden = mode !== 'telemetry';
  }

  /** Builds the checkpoint pips (and pickup / pit-stop marks) along the route bar. */
  setRoute(checkpointFractions: number[], stops: { at: number; kind: 'pickup' | 'service' }[] = []): void {
    const route = q(this.root, '#hud-route');
    route.querySelectorAll('.pip, .stop-pip').forEach((n) => n.remove());
    [...checkpointFractions, 1].forEach((f, i, all) => {
      const pip = document.createElement('i');
      pip.className = 'pip' + (i === all.length - 1 ? ' flag' : '');
      pip.style.left = `${f * 100}%`;
      route.appendChild(pip);
    });
    for (const s of stops) {
      const pip = document.createElement('i');
      pip.className = `stop-pip ${s.kind}`;
      pip.style.left = `${s.at * 100}%`;
      route.appendChild(pip);
    }
  }

  private text(id: string, value: string): void {
    if (this.cache.get(id) === value) return;
    this.cache.set(id, value);
    q(this.root, id).textContent = value;
  }
  private width(id: string, value: string): void {
    const key = `${id}|w`;
    if (this.cache.get(key) === value) return;
    this.cache.set(key, value);
    q(this.root, id).style.width = value;
  }
  private cls(id: string, name: string, on: boolean): void {
    const key = `${id}.${name}`;
    const v = on ? '1' : '0';
    if (this.cache.get(key) === v) return;
    this.cache.set(key, v);
    q(this.root, id).classList.toggle(name, on);
  }
  private hidden(id: string, hidden: boolean): void {
    const key = `${id}.hidden`;
    const v = hidden ? '1' : '0';
    if (this.cache.get(key) === v) return;
    this.cache.set(key, v);
    q(this.root, id).hidden = hidden;
  }

  /** Draws the scale (tick marks and numbers) for a vehicle whose speedometer ends at `max` km/h. */
  private drawScale(max: number): void {
    this.scaleMax = max;
    const step = max <= 120 ? 20 : max <= 200 ? 20 : 40;
    const g = q(this.root, '#speed-ticks');
    let svg = '';
    for (let v = 0; v <= max; v += step) {
      const deg = START + (SWEEP * v) / max;
      const [x1, y1] = polar(79, deg);
      const [x2, y2] = polar(71, deg);
      const [lx, ly] = polar(60, deg);
      svg += `<line class="tick" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
      if (v % (step * 2) === 0) svg += `<text x="${lx.toFixed(1)}" y="${(ly + 3.5).toFixed(1)}" text-anchor="middle">${v}</text>`;
    }
    g.innerHTML = svg;
  }

  update(h: HudState): void {
    if (h.scaleMaxKmh !== this.scaleMax) this.drawScale(h.scaleMaxKmh);
    const kmh = Math.min(h.speedKmh, h.scaleMaxKmh * 1.04);
    this.text('#hud-speed', String(Math.round(h.speedKmh)));
    const frac = Math.max(0, Math.min(1, kmh / h.scaleMaxKmh));
    const needle = this.root.querySelector('#needle') as SVGGElement;
    needle.style.transform = `rotate(${(START + SWEEP * frac + 90).toFixed(1)}deg)`;
    const arc = q(this.root, '#speed-arc');
    const key = Math.round(frac * 160);
    if (this.cache.get('arc') !== String(key)) {
      this.cache.set('arc', String(key));
      arc.setAttribute('d', frac < 0.004 ? '' : arcPath(79, START, START + SWEEP * frac));
    }
    // Rev ticks: lit up to the current engine speed.
    const lit = Math.round(h.rpm * REV_TICKS);
    if (lit !== this.revLit) {
      this.revLit = lit;
      this.ticks.forEach((t, i) => t.classList.toggle('on', i < lit));
    }
    this.cls('#gauge', 'shifting', h.shifting);
    this.hidden('#eng-warn', !h.engineWarn);

    this.text('#hud-time', h.timerText);
    this.text('#hud-timer-label', h.timerLabel);
    this.cls('#hud-clock', 'low', h.lowTime);
    this.text('#hud-obj', h.objective);
    this.cls('#hud-objective', 'pickup', h.objectiveKind === 'pickup');
    this.cls('#hud-objective', 'service', h.objectiveKind === 'service');
    this.text(
      '#hud-dist',
      h.distance === null
        ? ''
        : h.distance < -20
          ? 'You drove past it: turn back'
          : h.distance < 1000
            ? `${Math.max(0, Math.round(h.distance / 5) * 5)} m`
            : `${(h.distance / 1000).toFixed(1)} km`,
    );
    const cpKey = String(h.checkpointsDone);
    if (this.cache.get('cp') !== cpKey) {
      this.cache.set('cp', cpKey);
      q(this.root, '#hud-route')
        .querySelectorAll<HTMLElement>('.pip')
        .forEach((p, i) => p.classList.toggle('done', i < h.checkpointsDone));
    }
    this.width('#hud-fill', `${(h.progress * 100).toFixed(1)}%`);

    const fuel = Math.round(h.fuel * 100);
    this.text('#fuel-pct', `${fuel}%`);
    this.width('#fuel-fill', `${fuel}%`);
    this.cls('#vital-fuel', 'low', h.fuel < 0.2);
    const hp = Math.round(h.health);
    this.text('#health-pct', `${hp}%`);
    this.width('#health-fill', `${hp}%`);
    this.cls('#vital-health', 'low', h.health < 35);

    this.text('#pax-count', `${h.onboard}/${h.party}`);
    this.hidden('#hud-pax', h.party === 0);
    if (this.partyShown !== h.party * 100 + h.onboard) {
      this.partyShown = h.party * 100 + h.onboard;
      q(this.root, '#pax-dots').innerHTML = Array.from({ length: Math.min(h.party, 10) }, (_, i) => `<i class="${i < h.onboard ? 'on' : ''}"></i>`).join('');
    }
    this.text('#drive-mode', h.driveMode);
    this.cls('#btn-drive', 'on', h.driveMode === '4x4');
    this.text('#hud-cond', h.conditions);
    this.cls('#hud-cond', 'lights', h.headlights);

    // Alerts above the cluster: at most two, newest information first.
    const alertKey = h.alerts.map((a) => `${a.tone}:${a.text}`).join('|');
    if (this.cache.get('alerts') !== alertKey) {
      this.cache.set('alerts', alertKey);
      q(this.root, '#hud-alerts').innerHTML = h.alerts.map((a) => `<span class="alert ${a.tone}">${esc(a.text)}</span>`).join('');
    }

    const showPrompt = !!h.prompt || !!h.service;
    this.hidden('#hud-prompt', !showPrompt);
    this.text('#prompt-text', h.prompt);
    const kinds = h.service?.kinds ?? [];
    this.hidden('#btn-refuel', !kinds.includes('refuel'));
    this.hidden('#btn-repair', !kinds.includes('repair'));
    this.hidden('#svc-bar', !h.service?.active);
    this.width('#svc-fill', `${Math.round((h.service?.progress ?? 0) * 100)}%`);

    if (h.rival) {
      this.hidden('#hud-rival', false);
      this.text('#hud-rival', h.rival.label);
    } else this.hidden('#hud-rival', true);

    if (h.comfort) {
      const pct = Math.round(h.comfort.value);
      this.text('#comfort-pct', `${pct}%`);
      this.width('#comfort-fill', `${pct}%`);
      if (this.cache.get('comfort-q') !== h.comfort.quality) {
        this.cache.set('comfort-q', h.comfort.quality);
        q(this.root, '#hud-comfort').dataset.quality = h.comfort.quality;
      }
      const msg = h.comfort.cause
        ? ({
            corner: 'Easy on the corners!',
            brake: 'Brake more gently!',
            accel: 'Ease the throttle',
            bump: 'Mind the road',
          }[h.comfort.cause] ?? 'Smooth ride')
        : h.comfort.quality === 'smooth'
          ? 'Smooth ride'
          : h.comfort.quality === 'firm'
            ? 'A bit bumpy'
            : 'Rough ride';
      this.text('#comfort-msg', msg);
      this.cls('#hud-comfort', 'warn', h.comfort.cause !== null);
    }

    if (this.mode === 'telemetry') {
      const t = h.telemetry;
      this.text(
        '#hud-telemetry',
        `${t.fps.toFixed(0)} fps  rpm ${(h.rpm * 100).toFixed(0)}%  load ${(h.load * 100).toFixed(0)}%  gear ${t.gear + 1}\n${t.surface}  grade ${(t.grade * 100).toFixed(0)}%  slip ${t.slip.toFixed(1)}  wet ${(t.wet * 100).toFixed(0)}%`,
      );
    }
  }

  setCountdown(text: string | null): void {
    const el = q(this.root, '#countdown');
    el.textContent = text ?? '';
    el.classList.remove('pop');
    if (text) {
      void el.offsetWidth;
      el.classList.add('pop');
    }
  }

  flash(title: string, sub = ''): void {
    const el = q(this.root, '#flash');
    el.innerHTML = `${esc(title)}${sub ? `<small>${esc(sub)}</small>` : ''}`;
    el.classList.add('show');
    window.clearTimeout(this.flashTimer);
    this.flashTimer = window.setTimeout(() => el.classList.remove('show'), 1900);
  }
}

function arcPath(r: number, from: number, to: number): string {
  const [x1, y1] = polar(r, from);
  const [x2, y2] = polar(r, to);
  const large = to - from > 180 ? 1 : 0;
  return `M${x1.toFixed(2)} ${y1.toFixed(2)} A${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}
