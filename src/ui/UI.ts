import type { LevelDef, Medal } from '../data/types';
import type { RaceResult } from '../gameplay/RaceSession';
import { formatTime } from '../gameplay/RaceSession';
import type { QualityLevel, Settings, TouchMode } from '../storage/SaveStore';
import type { VehicleStats } from '../data/vehicles';
import { ICONS, KNOT, logoSvg, medalSvg } from './icons';

export interface UIActions {
  /** Main menu "Drive": open mission select. */
  openLevels(): void;
  /** Mission card chosen (unlocked): loads the level and opens the garage. */
  chooseLevel(id: string): void;
  /** Garage carousel moved to this vehicle (preview only). */
  previewVehicle(id: string): void;
  startMission(): void;
  /** Back one step: garage -> missions -> menu. */
  back(): void;
  resume(): void;
  restart(): void;
  quit(): void;
  /** From the results / pause screen: go pick another vehicle for the same mission. */
  openGarage(): void;
  /** From the results: go straight to the next unlocked mission. */
  nextMission(): void;
  pause(): void;
  recover(): void;
  settingsChanged(patch: Partial<Settings>): void;
  /** UI feedback sound hook. */
  click(back?: boolean): void;
}

export interface HudState {
  speedKmh: number;
  /** Text for the headline timer (elapsed or time-left, depending on the mission). */
  timerText: string;
  timerLabel: string;
  lowTime: boolean;
  checkpointsDone: number;
  objective: string;
  /** 0..1 progress along the playable route. */
  progress: number;
  /** Passenger comfort, or null when the mission does not track it. */
  comfort: { value: number; quality: 'smooth' | 'firm' | 'rough'; cause: string | null } | null;
}

export interface LevelCardModel {
  id: string;
  name: string;
  subtitle: string;
  difficulty: number;
  missionLabel: string;
  locked: boolean;
  lockText: string;
  medal: Medal;
  bestTime: number | null;
  isNew: boolean;
  vehicleNames: string[];
  selected: boolean;
}

export interface VehicleCardModel {
  id: string;
  name: string;
  blurb: string;
  stats: VehicleStats;
  locked: boolean;
  lockText: string;
  /** Allowed on the selected mission. */
  eligible: boolean;
  best: { time: number | null; medal: Medal; comfort: number | null } | null;
  /** Medal and limit times scaled for this vehicle on this mission. */
  targets: { gold: number; silver: number; bronze: number; limit: number };
}

export interface GarageModel {
  level: { name: string; objective: string; tip: string; comfort: boolean; deadline: boolean };
  vehicles: VehicleCardModel[];
  index: number;
}

export interface FinishExtra {
  newBest: boolean;
  newMedal: boolean;
  newScoreBest: boolean;
  best: number | null;
  unlockedLevels: string[];
  unlockedVehicles: string[];
  /** Name of the next mission if one is unlocked and playable. */
  nextMissionName: string | null;
  medals: { gold: number; silver: number; bronze: number };
}

const MEDAL_TEXT: Record<Medal, string> = {
  gold: 'Gold - Druk Champion',
  silver: 'Silver - Fast Guide',
  bronze: 'Bronze - Steady Driver',
  none: 'Finisher',
};

const q = <T extends HTMLElement>(root: ParentNode, sel: string): T => {
  const el = root.querySelector<T>(sel);
  if (!el) throw new Error(`UI: missing ${sel}`);
  return el;
};

const dots = (n: number, of = 5): string =>
  Array.from({ length: of }, (_, i) => `<span class="${i < n ? '' : 'off'}">&#9670;</span>`).join('');

const medalName = (m: Medal): string => (m === 'none' ? 'Finisher' : m[0].toUpperCase() + m.slice(1));

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

const LOCK_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true" class="lock"><rect x="5" y="11" width="14" height="9" rx="2" fill="currentColor"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>';
const PASSENGER_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true" class="pax"><circle cx="9" cy="8" r="3.2" fill="currentColor"/><path d="M3 20c0-3.6 2.7-6 6-6s6 2.4 6 6z" fill="currentColor"/><circle cx="17" cy="9" r="2.4" fill="currentColor" opacity=".7"/><path d="M15.5 14.4c3 0 5.5 1.9 5.5 5.6h-4.2" fill="currentColor" opacity=".7"/></svg>';

type ScreenName =
  'loading' | 'menu' | 'levels' | 'garage' | 'hud' | 'pause' | 'finish' | 'settings' | 'error';

/** All DOM screens. Plain DOM + CSS: no framework; every control here does real work. */
export class UI {
  private readonly root: HTMLElement;
  private readonly screens: Record<ScreenName, HTMLElement>;
  private settingsReturn: 'menu' | 'pause' = 'menu';
  private hudCache = {
    speed: '',
    time: '',
    label: '',
    obj: '',
    cp: -1,
    progress: '',
    low: false,
    comfort: '',
    msg: '',
  };
  private flashTimer = 0;
  private toastTimer = 0;
  private hintTimer = 0;
  private garageModel: GarageModel | null = null;

  readonly minimapCanvas: HTMLCanvasElement;

  constructor(
    host: HTMLElement,
    private readonly actions: UIActions,
    settings: Settings,
  ) {
    this.root = host;
    host.innerHTML = `
      <section class="screen" id="screen-loading" aria-live="polite">
        <div class="loader">
          ${logoSvg('ld')}
          <h1>CRAZY BHUTAN HILL RACE</h1>
          <p id="loading-text">Loading...</p>
          <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100"><i id="loading-bar"></i></div>
        </div>
      </section>

      <section class="screen" id="screen-menu" data-screen hidden aria-labelledby="menu-title">
        <div class="menu-main">
          <div class="brand">
            ${logoSvg('mn')}
            <h1 id="menu-title"><span class="l1">Crazy Bhutan</span><span class="l2">Hill Race</span></h1>
          </div>
          <p class="tagline">Deliver your guests. Beat the mist.</p>
          <div class="level-card" id="menu-summary"></div>
          <div class="menu-actions">
            <button class="btn primary" id="btn-start" type="button">${ICONS.play}<span>Drive</span></button>
            <button class="btn ghost" id="btn-menu-settings" type="button">${ICONS.settings}<span>Settings</span></button>
          </div>
        </div>
        <div class="menu-foot">Working title &middot; Fictional, stylised geography inspired by Bhutan's mountain roads</div>
      </section>

      <section class="screen sheet" id="screen-levels" data-screen hidden aria-labelledby="levels-title">
        <header class="sheet-head">
          <button class="icon-btn" id="btn-levels-back" data-back type="button" aria-label="Back to menu">${ICONS.left}</button>
          <h2 id="levels-title">Choose a mission</h2>
        </header>
        <div class="cards" id="level-cards" role="list"></div>
      </section>

      <section class="screen garage" id="screen-garage" data-screen hidden aria-labelledby="garage-title">
        <div class="garage-panel">
          <header class="sheet-head">
            <button class="icon-btn" id="btn-garage-back" data-back type="button" aria-label="Back to missions">${ICONS.left}</button>
            <div><div class="eyebrow" id="garage-level"></div><h2 id="garage-title">Garage</h2></div>
          </header>
          <div class="veh-nav">
            <button class="icon-btn" id="btn-veh-prev" type="button" aria-label="Previous vehicle">${ICONS.left}</button>
            <div class="veh-name"><h3 id="veh-name"></h3><div class="veh-dots" id="veh-dots" aria-hidden="true"></div></div>
            <button class="icon-btn" id="btn-veh-next" type="button" aria-label="Next vehicle">${ICONS.right}</button>
          </div>
          <p class="veh-blurb" id="veh-blurb"></p>
          <div class="stats" id="veh-stats"></div>
          <div class="veh-status" id="veh-status" aria-live="polite"></div>
          <div class="mission-brief" id="veh-brief"></div>
          <button class="btn primary" id="btn-launch" type="button">${ICONS.play}<span>Start mission</span></button>
        </div>
      </section>

      <section id="hud" hidden aria-label="Driving HUD">
        <div class="hud-left">
          <div class="hud-card hud-speed"><b id="hud-speed">0</b><small>km/h</small></div>
          <div class="hud-card hud-comfort" id="hud-comfort" hidden>
            ${PASSENGER_ICON}
            <div class="comfort-body">
              <div class="comfort-row"><span class="hud-label">Passengers</span><b id="comfort-pct">100%</b></div>
              <div class="comfort-bar"><i id="comfort-fill"></i></div>
              <div class="comfort-msg" id="comfort-msg">Smooth ride</div>
            </div>
          </div>
        </div>
        <div class="hud-card hud-center">
          <div class="hud-label" id="hud-timer-label">Time</div>
          <div class="hud-time" id="hud-time" aria-live="off">0:00.00</div>
          <div class="hud-obj" id="hud-obj"></div>
          <div class="route" id="hud-route"><i class="fill" id="hud-fill"></i></div>
        </div>
        <div class="hud-right">
          <div class="btns">
            <button class="icon-btn" id="btn-recover" type="button" title="Recover to last checkpoint (R)" aria-label="Recover to last checkpoint">${ICONS.recover}</button>
            <button class="icon-btn" id="btn-pause" type="button" title="Pause (Esc)" aria-label="Pause">${ICONS.pause}</button>
          </div>
          <div class="hud-card" id="minimap"><canvas id="minimap-canvas" aria-label="Route map" role="img"></canvas></div>
        </div>
        <div class="center-msg" id="countdown" aria-live="assertive"></div>
        <div class="center-msg" id="flash" aria-live="polite"></div>
        <div class="hud-card hud-hint" id="hud-hint"><kbd>W</kbd><kbd>S</kbd> gas / brake &middot; <kbd>A</kbd><kbd>D</kbd> steer &middot; <kbd>R</kbd> recover &middot; <kbd>Esc</kbd> pause</div>
      </section>

      <div class="modal" id="screen-pause" data-screen hidden role="dialog" aria-modal="true" aria-labelledby="pause-title">
        <div class="panel">${KNOT}<h2 id="pause-title">Paused</h2>
          <div class="stack" style="margin-top:14px">
            <button class="btn primary" id="btn-resume" data-back type="button">${ICONS.resume}<span>Resume</span></button>
            <button class="btn" id="btn-restart" type="button">${ICONS.recover}<span>Restart</span></button>
            <button class="btn" id="btn-pause-garage" type="button">${ICONS.play}<span>Change vehicle</span></button>
            <button class="btn" id="btn-pause-settings" type="button">${ICONS.settings}<span>Settings</span></button>
            <button class="btn ghost" id="btn-pause-menu" type="button">${ICONS.home}<span>Main menu</span></button>
          </div>
        </div>
      </div>

      <div class="modal" id="screen-finish" data-screen hidden role="dialog" aria-modal="true" aria-labelledby="finish-title">
        <div class="panel wide">${KNOT}<h2 id="finish-title"></h2>
          <div id="finish-medal"></div>
          <div class="result-time" id="finish-time"></div>
          <div class="result-sub" id="finish-sub"></div>
          <div class="result-grid" id="finish-grid"></div>
          <div class="chips" id="finish-chips"></div>
          <div class="unlocks" id="finish-unlocks" aria-live="polite"></div>
          <div class="stack">
            <button class="btn primary" id="btn-next" type="button" hidden>${ICONS.play}<span id="btn-next-label">Next mission</span></button>
            <button class="btn" id="btn-replay" type="button">${ICONS.recover}<span>Drive again</span></button>
            <button class="btn" id="btn-finish-garage" type="button">${ICONS.play}<span>Change vehicle</span></button>
            <button class="btn ghost" id="btn-finish-menu" type="button">${ICONS.home}<span>Main menu</span></button>
          </div>
        </div>
      </div>

      <div class="modal" id="screen-settings" data-screen hidden role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div class="panel wide">${KNOT}<h2 id="settings-title">Settings</h2>
          <h3>Sound</h3>
          <div class="field"><label for="set-master">Master volume</label><output id="out-master"></output><input id="set-master" type="range" min="0" max="100" step="1" /></div>
          <div class="field"><label for="set-music">Music</label><output id="out-music"></output><input id="set-music" type="range" min="0" max="100" step="1" /></div>
          <div class="field"><label for="set-sfx">Sound effects</label><output id="out-sfx"></output><input id="set-sfx" type="range" min="0" max="100" step="1" /></div>
          <div class="field"><label for="set-mute">Mute all sound</label><input id="set-mute" type="checkbox" /></div>
          <h3>Graphics</h3>
          <div class="field"><label for="set-quality">Quality</label>
            <select id="set-quality"><option value="low">Low (best for phones)</option><option value="medium">Medium</option><option value="high">High</option></select></div>
          <p class="hint-text">Low drops shadows and thins the scenery, terrain and effects, and lowers the render resolution. Anti-aliasing applies on the next launch.</p>
          <h3>Controls</h3>
          <div class="field"><label for="set-touch">On-screen touch controls</label>
            <select id="set-touch"><option value="auto">Automatic</option><option value="on">Always show</option><option value="off">Hide</option></select></div>
          <div class="field"><label for="set-sens">Touch steering sensitivity</label><output id="out-sens"></output><input id="set-sens" type="range" min="60" max="160" step="5" /></div>
          <div class="controls-grid">
            <span><kbd>W</kbd><kbd>&uarr;</kbd></span><span>Accelerate</span>
            <span><kbd>S</kbd><kbd>&darr;</kbd></span><span>Brake, then reverse</span>
            <span><kbd>A</kbd><kbd>D</kbd> <kbd>&larr;</kbd><kbd>&rarr;</kbd></span><span>Steer</span>
            <span><kbd>R</kbd></span><span>Recover to the last checkpoint</span>
            <span><kbd>Shift</kbd>+<kbd>R</kbd></span><span>Restart the run</span>
            <span><kbd>Esc</kbd><kbd>P</kbd></span><span>Pause</span>
            <span>Touch</span><span>Slide the steering bar, hold GAS / BRAKE with the other thumb</span>
            <span>Gamepad</span><span>Left stick steer, RT gas, LT brake, Start pause, Y recover. D-pad / A / B in menus</span>
          </div>
          <div class="stack" style="margin-top:18px"><button class="btn primary" id="btn-settings-back" data-back type="button">Back</button></div>
        </div>
      </div>

      <section class="screen" id="screen-error" hidden role="alert">
        <div class="panel loader" style="text-align:center">${KNOT}<h2 id="error-title">Something went wrong</h2>
          <p id="error-text"></p>
          <div class="detail" id="error-detail"></div>
          <div class="stack" style="margin-top:16px" id="error-actions"><button class="btn primary" id="btn-reload" type="button">Reload</button></div>
        </div>
      </section>

      <div class="hud-card" id="toast" hidden role="status"><span id="toast-text"></span><button class="btn" id="toast-btn" type="button" hidden></button></div>
      <div class="hud-card" id="rotate-hint" role="note">Best played in landscape &mdash; rotate your device <button class="icon-btn" id="rotate-close" type="button" aria-label="Dismiss" style="width:34px;height:34px">&times;</button></div>
      <pre id="debug" hidden></pre>`;

    this.screens = {
      loading: q(host, '#screen-loading'),
      menu: q(host, '#screen-menu'),
      levels: q(host, '#screen-levels'),
      garage: q(host, '#screen-garage'),
      hud: q(host, '#hud'),
      pause: q(host, '#screen-pause'),
      finish: q(host, '#screen-finish'),
      settings: q(host, '#screen-settings'),
      error: q(host, '#screen-error'),
    };
    this.minimapCanvas = q<HTMLCanvasElement>(host, '#minimap-canvas');
    this.bind();
    this.syncSettings(settings);
  }

  private bind(): void {
    const on = (id: string, fn: () => void, back = false): void => {
      q(this.root, id).addEventListener('click', () => {
        this.actions.click(back);
        fn();
      });
    };
    on('#btn-start', () => this.actions.openLevels());
    on('#btn-menu-settings', () => this.openSettings('menu'));
    on('#btn-levels-back', () => this.actions.back(), true);
    on('#btn-garage-back', () => this.actions.back(), true);
    on('#btn-veh-prev', () => this.cycleVehicle(-1));
    on('#btn-veh-next', () => this.cycleVehicle(1));
    on('#btn-launch', () => this.actions.startMission());
    on('#btn-pause', () => this.actions.pause());
    on('#btn-recover', () => this.actions.recover());
    on('#btn-resume', () => this.actions.resume());
    on('#btn-restart', () => this.actions.restart());
    on('#btn-pause-garage', () => this.actions.openGarage());
    on('#btn-pause-settings', () => this.openSettings('pause'));
    on('#btn-pause-menu', () => this.actions.quit(), true);
    on('#btn-replay', () => this.actions.restart());
    on('#btn-next', () => this.actions.nextMission());
    on('#btn-finish-garage', () => this.actions.openGarage());
    on('#btn-finish-menu', () => this.actions.quit(), true);
    on('#btn-settings-back', () => this.closeSettings(), true);
    on('#btn-reload', () => location.reload());
    q(this.root, '#rotate-close').addEventListener('click', () =>
      q(this.root, '#rotate-hint').classList.remove('on'),
    );

    // Level cards: one delegated listener.
    q(this.root, '#level-cards').addEventListener('click', (e) => {
      const card = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-level]');
      if (!card || card.dataset.locked === '1') return;
      this.actions.click();
      this.actions.chooseLevel(card.dataset.level as string);
    });

    const slider = (id: string, out: string, key: 'masterVolume' | 'musicVolume' | 'sfxVolume'): void => {
      const el = q<HTMLInputElement>(this.root, id);
      el.addEventListener('input', () => {
        q(this.root, out).textContent = `${el.value}%`;
        this.actions.settingsChanged({ [key]: Number(el.value) / 100 });
      });
    };
    slider('#set-master', '#out-master', 'masterVolume');
    slider('#set-music', '#out-music', 'musicVolume');
    slider('#set-sfx', '#out-sfx', 'sfxVolume');
    const sens = q<HTMLInputElement>(this.root, '#set-sens');
    sens.addEventListener('input', () => {
      q(this.root, '#out-sens').textContent = `${sens.value}%`;
      this.actions.settingsChanged({ touchSensitivity: Number(sens.value) / 100 });
    });
    q<HTMLInputElement>(this.root, '#set-mute').addEventListener('change', (e) =>
      this.actions.settingsChanged({ muted: (e.target as HTMLInputElement).checked }),
    );
    q<HTMLSelectElement>(this.root, '#set-quality').addEventListener('change', (e) =>
      this.actions.settingsChanged({ quality: (e.target as HTMLSelectElement).value as QualityLevel }),
    );
    q<HTMLSelectElement>(this.root, '#set-touch').addEventListener('change', (e) =>
      this.actions.settingsChanged({ touchControls: (e.target as HTMLSelectElement).value as TouchMode }),
    );
    this.screens.settings.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        this.closeSettings();
      }
    });
    // Escape / back on the selection screens.
    for (const s of [this.screens.levels, this.screens.garage]) {
      s.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          this.actions.click(true);
          this.actions.back();
        }
      });
    }
  }

  /** Mirrors stored settings into the form controls. */
  syncSettings(s: Settings): void {
    const set = (id: string, v: number, out: string): void => {
      q<HTMLInputElement>(this.root, id).value = String(Math.round(v * 100));
      q(this.root, out).textContent = `${Math.round(v * 100)}%`;
    };
    set('#set-master', s.masterVolume, '#out-master');
    set('#set-music', s.musicVolume, '#out-music');
    set('#set-sfx', s.sfxVolume, '#out-sfx');
    set('#set-sens', s.touchSensitivity, '#out-sens');
    q<HTMLInputElement>(this.root, '#set-mute').checked = s.muted;
    q<HTMLSelectElement>(this.root, '#set-quality').value = s.quality;
    q<HTMLSelectElement>(this.root, '#set-touch').value = s.touchControls;
  }

  private focusFirst(screen: HTMLElement, sel = 'button:not([disabled])'): void {
    requestAnimationFrame(() =>
      (screen.querySelector<HTMLElement>(sel) ?? screen.querySelector<HTMLElement>('button'))?.focus({
        preventScroll: true,
      }),
    );
  }

  /** Shows exactly one of the full-screen "flow" screens (menu / levels / garage), hiding the others. */
  private showFlow(which: 'menu' | 'levels' | 'garage' | null): void {
    this.screens.menu.hidden = which !== 'menu';
    this.screens.levels.hidden = which !== 'levels';
    this.screens.garage.hidden = which !== 'garage';
  }

  // ------------------------------------------------------------------ screens

  showLoading(text: string, progress: number): void {
    this.screens.loading.hidden = false;
    q(this.root, '#loading-text').textContent = text;
    q(this.root, '#loading-bar').style.width = `${Math.round(progress * 100)}%`;
    q(this.root, '[role=progressbar]').setAttribute('aria-valuenow', String(Math.round(progress * 100)));
  }

  hideLoading(): void {
    this.screens.loading.hidden = true;
  }

  showMenu(summary: { missions: string; medals: string; lastPlayed: string }): void {
    q(this.root, '#menu-summary').innerHTML =
      `<div class="row"><h3>Your journey</h3><span class="dots">${esc(summary.medals)}</span></div>
      <p>${esc(summary.missions)}</p><div class="best"><span>${esc(summary.lastPlayed)}</span></div>`;
    this.showFlow('menu');
    this.focusFirst(this.screens.menu, '#btn-start');
  }

  hideMenu(): void {
    this.showFlow(null);
  }

  showLevels(cards: LevelCardModel[]): void {
    const el = q(this.root, '#level-cards');
    el.innerHTML = cards
      .map((c) => {
        const status = c.locked
          ? `<div class="card-lock">${LOCK_ICON}<span>${esc(c.lockText)}</span></div>`
          : `<div class="card-best">${
              c.bestTime !== null
                ? `${medalSvg(c.medal).replace('class="medal"', 'class="medal sm"')}<span>Best ${formatTime(c.bestTime)}</span>`
                : '<span class="muted">Not driven yet</span>'
            }</div>`;
        return `<button class="mission-card${c.locked ? ' locked' : ''}${c.selected ? ' selected' : ''}" role="listitem" type="button"
            data-level="${esc(c.id)}" data-locked="${c.locked ? 1 : 0}" ${c.locked ? 'aria-disabled="true"' : ''}
            aria-label="${esc(c.name)}${c.locked ? ', locked: ' + esc(c.lockText) : ''}">
          ${c.isNew && !c.locked ? '<span class="new-tag">NEW</span>' : ''}
          <span class="mission-kind">${esc(c.missionLabel)}</span>
          <h3>${esc(c.name)}</h3>
          <p>${esc(c.subtitle)}</p>
          <span class="dots" title="Difficulty ${c.difficulty} of 5">${dots(c.difficulty)}</span>
          ${status}
          <span class="card-veh">${c.vehicleNames.map(esc).join(' &middot; ')}</span>
        </button>`;
      })
      .join('');
    this.showFlow('levels');
    this.focusFirst(
      this.screens.levels,
      `button[data-level]${cards.some((c) => c.selected && !c.locked) ? '.selected' : ':not(.locked)'}`,
    );
  }

  showGarage(model: GarageModel): void {
    this.garageModel = model;
    this.renderGarage();
    this.showFlow('garage');
    this.focusFirst(this.screens.garage, '#btn-launch:not([disabled])');
  }

  private cycleVehicle(dir: number): void {
    const m = this.garageModel;
    if (!m) return;
    m.index = (m.index + dir + m.vehicles.length) % m.vehicles.length;
    this.renderGarage();
    this.actions.previewVehicle(m.vehicles[m.index].id);
  }

  /** Re-renders the garage for the model's current vehicle (also callable after external changes). */
  private renderGarage(): void {
    const m = this.garageModel;
    if (!m) return;
    const v = m.vehicles[m.index];
    q(this.root, '#garage-level').textContent = m.level.name;
    q(this.root, '#veh-name').textContent = v.name;
    q(this.root, '#veh-blurb').textContent = v.blurb;
    q(this.root, '#veh-dots').innerHTML = m.vehicles
      .map((x, i) => `<span class="${i === m.index ? 'on' : ''}${x.locked ? ' lk' : ''}"></span>`)
      .join('');
    const bar = (label: string, n: number): string =>
      `<div class="stat"><span>${label}</span><span class="pips" role="img" aria-label="${n} of 5">${dots(n)}</span></div>`;
    q(this.root, '#veh-stats').innerHTML =
      bar('Top speed', v.stats.speed) +
      bar('Acceleration', v.stats.acceleration) +
      bar('Handling', v.stats.handling) +
      bar('Braking', v.stats.braking) +
      bar('Stability', v.stats.stability);
    const status = q(this.root, '#veh-status');
    const launch = q<HTMLButtonElement>(this.root, '#btn-launch');
    if (v.locked) {
      status.className = 'veh-status bad';
      status.innerHTML = `${LOCK_ICON}<span>Locked: ${esc(v.lockText)}</span>`;
    } else if (!v.eligible) {
      status.className = 'veh-status bad';
      status.innerHTML = `<span>Not allowed on this mission</span>`;
    } else {
      status.className = 'veh-status ok';
      const rec = v.best && v.best.time !== null ? `Your best: ${formatTime(v.best.time)}` : 'Ready to drive';
      status.innerHTML = `<span>${rec}</span>`;
    }
    launch.disabled = v.locked || !v.eligible;
    const t = v.targets;
    const goal = m.level.deadline
      ? `Flight leaves after ${formatTime(t.limit)}`
      : `Time limit ${formatTime(t.limit)}`;
    q(this.root, '#veh-brief').innerHTML = `<p>${esc(m.level.objective)}</p>
      <p class="tip">${esc(m.level.tip)}</p>
      <div class="targets"><span class="t gold">Gold ${formatTime(t.gold)}</span><span class="t silver">Silver ${formatTime(t.silver)}</span><span class="t bronze">Bronze ${formatTime(t.bronze)}</span></div>
      <p class="muted">${goal}${m.level.comfort ? '. Medal = the lower of your time and passenger comfort.' : '.'}</p>`;
  }

  hideFlow(): void {
    this.showFlow(null);
  }

  get currentGarageIndex(): number {
    return this.garageModel?.index ?? 0;
  }

  showHud(comfort: boolean, timerLabel: string): void {
    this.screens.hud.hidden = false;
    this.hudCache = {
      speed: '',
      time: '',
      label: '',
      obj: '',
      cp: -1,
      progress: '',
      low: false,
      comfort: '',
      msg: '',
    };
    q(this.root, '#hud-comfort').hidden = !comfort;
    q(this.root, '#hud-timer-label').textContent = timerLabel;
    const hint = q(this.root, '#hud-hint');
    hint.classList.remove('fade');
    window.clearTimeout(this.hintTimer);
    this.hintTimer = window.setTimeout(() => hint.classList.add('fade'), 9000);
  }

  hideHud(): void {
    this.screens.hud.hidden = true;
    this.setCountdown(null);
  }

  /** Builds the checkpoint pips along the route bar. */
  setRoute(checkpointFractions: number[]): void {
    const route = q(this.root, '#hud-route');
    route.querySelectorAll('.pip').forEach((n) => n.remove());
    [...checkpointFractions, 1].forEach((f, i, all) => {
      const pip = document.createElement('i');
      pip.className = 'pip' + (i === all.length - 1 ? ' flag' : '');
      pip.style.left = `${f * 100}%`;
      route.appendChild(pip);
    });
  }

  updateHud(h: HudState): void {
    const c = this.hudCache;
    const speed = String(Math.round(h.speedKmh));
    if (speed !== c.speed) q(this.root, '#hud-speed').textContent = c.speed = speed;
    if (h.timerText !== c.time) q(this.root, '#hud-time').textContent = c.time = h.timerText;
    if (h.timerLabel !== c.label) q(this.root, '#hud-timer-label').textContent = c.label = h.timerLabel;
    if (h.lowTime !== c.low) q(this.root, '#hud-time').classList.toggle('low', (c.low = h.lowTime));
    if (h.objective !== c.obj) q(this.root, '#hud-obj').textContent = c.obj = h.objective;
    if (h.checkpointsDone !== c.cp) {
      c.cp = h.checkpointsDone;
      q(this.root, '#hud-route')
        .querySelectorAll<HTMLElement>('.pip')
        .forEach((p, i) => p.classList.toggle('done', i < h.checkpointsDone));
    }
    const pr = (h.progress * 100).toFixed(1);
    if (pr !== c.progress) q(this.root, '#hud-fill').style.width = `${(c.progress = pr)}%`;

    if (h.comfort) {
      const pct = Math.round(h.comfort.value);
      const key = `${pct}|${h.comfort.quality}`;
      if (key !== c.comfort) {
        c.comfort = key;
        q(this.root, '#comfort-pct').textContent = `${pct}%`;
        const fill = q(this.root, '#comfort-fill');
        fill.style.width = `${pct}%`;
        const box = q(this.root, '#hud-comfort');
        box.dataset.quality = h.comfort.quality;
      }
      const msg = h.comfort.cause
        ? ({
            corner: 'Easy on the corners!',
            brake: 'Brake more gently!',
            accel: 'Too jerky, ease the throttle',
            bump: 'Ouch! Mind the road',
          }[h.comfort.cause] ?? 'Smooth ride')
        : h.comfort.quality === 'smooth'
          ? 'Smooth ride'
          : h.comfort.quality === 'firm'
            ? 'A bit bumpy'
            : 'Rough ride';
      if (msg !== c.msg) {
        c.msg = msg;
        q(this.root, '#comfort-msg').textContent = msg;
        q(this.root, '#hud-comfort').classList.toggle('warn', h.comfort.cause !== null);
      }
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

  showPause(): void {
    this.screens.pause.hidden = false;
    this.focusFirst(this.screens.pause, '#btn-resume');
  }

  hidePause(): void {
    this.screens.pause.hidden = true;
  }

  showFinish(
    level: LevelDef,
    r: RaceResult,
    extra: FinishExtra,
    names: { levels: Record<string, string>; vehicles: Record<string, string> },
  ): void {
    const done = r.status === 'completed';
    q(this.root, '#finish-title').textContent = done
      ? `${level.finishLabel} reached!`
      : level.mission.timerStyle === 'deadline'
        ? 'Flight missed'
        : 'Out of time';
    q(this.root, '#finish-medal').innerHTML = done ? medalSvg(r.medal) : '';
    q(this.root, '#finish-time').textContent = formatTime(r.time);
    q(this.root, '#finish-sub').textContent = done
      ? MEDAL_TEXT[r.medal]
      : level.mission.timerStyle === 'deadline'
        ? 'The plane left without your guests. Try a faster line.'
        : 'The mist won this time. Learn the road and go again.';

    // Per-criterion breakdown (time, passengers, score).
    const cell = (label: string, value: string, medal?: Medal): string =>
      `<div class="rg"><span class="hud-label">${label}</span><b>${value}</b>${medal ? `<span class="mini-medal ${medal}">${medalName(medal)}</span>` : ''}</div>`;
    const grid = [cell('Time', formatTime(r.time), done ? r.timeMedal : undefined)];
    if (r.comfort !== null)
      grid.push(
        cell('Passengers', `${Math.round(r.comfort)}%`, done ? (r.comfortMedal ?? undefined) : undefined),
      );
    if (done) grid.push(cell('Score', String(r.score)));
    q(this.root, '#finish-grid').innerHTML = grid.join('');

    const chips: string[] = [];
    chips.push(`<span class="chip">Checkpoints ${r.checkpoints}/${level.checkpoints.length}</span>`);
    chips.push(`<span class="chip">Recoveries ${r.recoveries}</span>`);
    chips.push(`<span class="chip">${esc(names.vehicles[r.vehicleId] ?? r.vehicleId)}</span>`);
    if (done) {
      if (extra.newBest) chips.push('<span class="chip good">New personal best!</span>');
      else if (extra.best !== null) chips.push(`<span class="chip">Best ${formatTime(extra.best)}</span>`);
      if (extra.newMedal) chips.push('<span class="chip good">New medal!</span>');
      if (extra.newScoreBest && !extra.newBest) chips.push('<span class="chip good">Best score!</span>');
      chips.push(`<span class="chip">Gold ${formatTime(extra.medals.gold)}</span>`);
    }
    q(this.root, '#finish-chips').innerHTML = chips.join('');

    const unlocks: string[] = [
      ...extra.unlockedLevels.map(
        (id) =>
          `<div class="unlock">${LOCK_ICON}<div><b>New mission unlocked</b><span>${esc(names.levels[id] ?? id)}</span></div></div>`,
      ),
      ...extra.unlockedVehicles.map(
        (id) =>
          `<div class="unlock veh">${LOCK_ICON}<div><b>New vehicle unlocked</b><span>${esc(names.vehicles[id] ?? id)}</span></div></div>`,
      ),
    ];
    q(this.root, '#finish-unlocks').innerHTML = unlocks.join('');

    const next = q<HTMLButtonElement>(this.root, '#btn-next');
    next.hidden = !(done && extra.nextMissionName);
    q(this.root, '#btn-next-label').textContent = extra.nextMissionName
      ? `Next: ${extra.nextMissionName}`
      : 'Next mission';
    q(this.root, '#btn-replay span').textContent = done ? 'Drive again' : 'Try again';
    this.screens.finish.hidden = false;
    this.focusFirst(this.screens.finish, next.hidden ? '#btn-replay' : '#btn-next');
  }

  hideFinish(): void {
    this.screens.finish.hidden = true;
  }

  openSettings(from: 'menu' | 'pause'): void {
    this.settingsReturn = from;
    this.screens.settings.hidden = false;
    this.focusFirst(this.screens.settings, '#set-master');
  }

  closeSettings(): void {
    this.screens.settings.hidden = true;
    const target = this.settingsReturn === 'menu' ? '#btn-menu-settings' : '#btn-pause-settings';
    q<HTMLElement>(this.root, target).focus({ preventScroll: true });
  }

  get settingsOpen(): boolean {
    return !this.screens.settings.hidden;
  }

  showError(title: string, message: string, detail = '', canReload = true): void {
    q(this.root, '#error-title').textContent = title;
    q(this.root, '#error-text').textContent = message;
    q(this.root, '#error-detail').textContent = detail;
    q(this.root, '#error-actions').hidden = !canReload;
    this.screens.loading.hidden = true;
    this.screens.error.hidden = false;
    this.focusFirst(this.screens.error, '#btn-reload');
  }

  toast(message: string, actionLabel?: string, action?: () => void, ms = 6000): void {
    const t = q(this.root, '#toast');
    q(this.root, '#toast-text').textContent = message;
    const btn = q<HTMLButtonElement>(this.root, '#toast-btn');
    btn.hidden = !actionLabel;
    btn.textContent = actionLabel ?? '';
    btn.onclick = () => {
      t.hidden = true;
      action?.();
    };
    t.hidden = false;
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => (t.hidden = true), ms);
  }

  showRotateHint(): void {
    q(this.root, '#rotate-hint').classList.add('on');
  }

  setDebug(text: string | null): void {
    const el = q(this.root, '#debug');
    el.hidden = text === null;
    if (text !== null) el.textContent = text;
  }

  get debugVisible(): boolean {
    return !q(this.root, '#debug').hidden;
  }

  /** True while a screen that should receive menu navigation (not the HUD) is showing. */
  get menuActive(): boolean {
    return [
      this.screens.menu,
      this.screens.levels,
      this.screens.garage,
      this.screens.pause,
      this.screens.finish,
      this.screens.settings,
    ].some((s) => !s.hidden);
  }
}
