import type { LevelDef, Medal } from '../data/types';
import type { RaceResult } from '../gameplay/RaceSession';
import { formatTime } from '../gameplay/RaceSession';
import type { LevelProgress, QualityLevel, Settings, TouchMode } from '../storage/SaveStore';
import { ICONS, KNOT, logoSvg, medalSvg } from './icons';

export interface UIActions {
  start(): void;
  resume(): void;
  restart(): void;
  quit(): void;
  pause(): void;
  recover(): void;
  settingsChanged(patch: Partial<Settings>): void;
  /** UI feedback sound hook. */
  click(back?: boolean): void;
}

export interface HudState {
  speedKmh: number;
  time: number;
  timeLeft: number;
  checkpointsDone: number;
  checkpointsTotal: number;
  objective: string;
  /** 0..1 progress along the playable route. */
  progress: number;
  lowTime: boolean;
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

const stars = (n: number): string =>
  Array.from({ length: 5 }, (_, i) => `<span class="${i < n ? '' : 'off'}">&#9670;</span>`).join('');

/** All DOM screens. Plain DOM + CSS: no framework; every control here does real work. */
export class UI {
  private readonly root: HTMLElement;
  private readonly screens: Record<
    'loading' | 'menu' | 'hud' | 'pause' | 'finish' | 'settings' | 'error',
    HTMLElement
  >;
  private settingsReturn: 'menu' | 'pause' = 'menu';
  private lastFocus: HTMLElement | null = null;
  private hudCache = { speed: '', time: '', obj: '', cp: -1, progress: '', low: false };
  private flashTimer = 0;
  private toastTimer = 0;
  private hintTimer = 0;

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

      <section class="screen" id="screen-menu" hidden aria-labelledby="menu-title">
        <div class="menu-main">
          <div class="brand">
            ${logoSvg('mn')}
            <h1 id="menu-title"><span class="l1">Crazy Bhutan</span><span class="l2">Hill Race</span></h1>
          </div>
          <p class="tagline">Deliver your guests. Beat the mist.</p>
          <div class="level-card" id="level-card"></div>
          <div class="menu-actions">
            <button class="btn primary" id="btn-start" type="button">${ICONS.play}<span>Start Driving</span></button>
            <button class="btn ghost" id="btn-menu-settings" type="button" aria-label="Settings">${ICONS.settings}<span>Settings</span></button>
          </div>
        </div>
        <div class="menu-foot">Working title &middot; Fictional, stylised geography inspired by Bhutan's mountain roads</div>
      </section>

      <section id="hud" hidden aria-label="Driving HUD">
        <div class="hud-card hud-speed"><b id="hud-speed">0</b><small>km/h</small></div>
        <div class="hud-card hud-center">
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

      <div class="modal" id="screen-pause" hidden role="dialog" aria-modal="true" aria-labelledby="pause-title">
        <div class="panel">${KNOT}<h2 id="pause-title">Paused</h2>
          <div class="stack" style="margin-top:14px">
            <button class="btn primary" id="btn-resume" type="button">${ICONS.resume}<span>Resume</span></button>
            <button class="btn" id="btn-restart" type="button">${ICONS.recover}<span>Restart</span></button>
            <button class="btn" id="btn-pause-settings" type="button">${ICONS.settings}<span>Settings</span></button>
            <button class="btn ghost" id="btn-pause-menu" type="button">${ICONS.home}<span>Main menu</span></button>
          </div>
        </div>
      </div>

      <div class="modal" id="screen-finish" hidden role="dialog" aria-modal="true" aria-labelledby="finish-title">
        <div class="panel">${KNOT}<h2 id="finish-title"></h2>
          <div id="finish-medal"></div>
          <div class="result-time" id="finish-time"></div>
          <div class="result-sub" id="finish-sub"></div>
          <div class="chips" id="finish-chips"></div>
          <div class="stack">
            <button class="btn primary" id="btn-replay" type="button">${ICONS.recover}<span>Drive again</span></button>
            <button class="btn ghost" id="btn-finish-menu" type="button">${ICONS.home}<span>Main menu</span></button>
          </div>
        </div>
      </div>

      <div class="modal" id="screen-settings" hidden role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div class="panel wide">${KNOT}<h2 id="settings-title">Settings</h2>
          <h3>Sound</h3>
          <div class="field"><label for="set-master">Master volume</label><output id="out-master"></output><input id="set-master" type="range" min="0" max="100" step="1" /></div>
          <div class="field"><label for="set-music">Music</label><output id="out-music"></output><input id="set-music" type="range" min="0" max="100" step="1" /></div>
          <div class="field"><label for="set-sfx">Sound effects</label><output id="out-sfx"></output><input id="set-sfx" type="range" min="0" max="100" step="1" /></div>
          <div class="field"><label for="set-mute">Mute all sound</label><input id="set-mute" type="checkbox" /></div>
          <h3>Graphics</h3>
          <div class="field"><label for="set-quality">Quality</label>
            <select id="set-quality"><option value="low">Low (best for phones)</option><option value="medium">Medium</option><option value="high">High</option></select></div>
          <p class="hint-text">Quality changes pixel density, shadows, draw distance and scenery. Anti-aliasing applies on the next launch.</p>
          <h3>Controls</h3>
          <div class="field"><label for="set-touch">On-screen touch controls</label>
            <select id="set-touch"><option value="auto">Automatic</option><option value="on">Always show</option><option value="off">Hide</option></select></div>
          <div class="controls-grid">
            <span><kbd>W</kbd><kbd>&uarr;</kbd></span><span>Accelerate</span>
            <span><kbd>S</kbd><kbd>&darr;</kbd></span><span>Brake, then reverse</span>
            <span><kbd>A</kbd><kbd>D</kbd> <kbd>&larr;</kbd><kbd>&rarr;</kbd></span><span>Steer</span>
            <span><kbd>R</kbd></span><span>Recover to the last checkpoint</span>
            <span><kbd>Shift</kbd>+<kbd>R</kbd></span><span>Restart the run</span>
            <span><kbd>Esc</kbd><kbd>P</kbd></span><span>Pause</span>
            <span>Touch</span><span>Slide the steering bar, hold GAS / BRAKE</span>
            <span>Gamepad</span><span>Left stick steer, RT gas, LT brake, Start pause, Y recover</span>
          </div>
          <div class="stack" style="margin-top:18px"><button class="btn primary" id="btn-settings-back" type="button">Back</button></div>
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
    on('#btn-start', () => this.actions.start());
    on('#btn-menu-settings', () => this.openSettings('menu'));
    on('#btn-pause', () => this.actions.pause());
    on('#btn-recover', () => this.actions.recover());
    on('#btn-resume', () => this.actions.resume());
    on('#btn-restart', () => this.actions.restart());
    on('#btn-pause-settings', () => this.openSettings('pause'));
    on('#btn-pause-menu', () => this.actions.quit(), true);
    on('#btn-replay', () => this.actions.restart());
    on('#btn-finish-menu', () => this.actions.quit(), true);
    on('#btn-settings-back', () => this.closeSettings(), true);
    on('#btn-reload', () => location.reload());
    q(this.root, '#rotate-close').addEventListener('click', () =>
      q(this.root, '#rotate-hint').classList.remove('on'),
    );

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
    q<HTMLInputElement>(this.root, '#set-mute').checked = s.muted;
    q<HTMLSelectElement>(this.root, '#set-quality').value = s.quality;
    q<HTMLSelectElement>(this.root, '#set-touch').value = s.touchControls;
  }

  private focusFirst(screen: HTMLElement, sel = 'button'): void {
    this.lastFocus = document.activeElement as HTMLElement | null;
    requestAnimationFrame(() => screen.querySelector<HTMLElement>(sel)?.focus({ preventScroll: true }));
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

  showMenu(level: LevelDef, progress: LevelProgress, vehicleName: string): void {
    const card = q(this.root, '#level-card');
    const best =
      progress.bestTime !== null
        ? `Best ${formatTime(progress.bestTime)} &middot; ${progress.medal === 'none' ? 'Finisher' : progress.medal[0].toUpperCase() + progress.medal.slice(1)}`
        : 'No run recorded yet';
    card.innerHTML = `<div class="row"><h3>${level.name}</h3><span class="dots" title="Difficulty ${level.difficulty} of 5">${stars(level.difficulty)}</span></div>
      <p>${level.subtitle}. ${level.description}</p>
      <div class="best"><span>${best}</span><span>&middot; Vehicle: ${vehicleName}</span></div>`;
    this.screens.menu.hidden = false;
    this.focusFirst(this.screens.menu, '#btn-start');
  }

  hideMenu(): void {
    this.screens.menu.hidden = true;
  }

  showHud(): void {
    this.screens.hud.hidden = false;
    this.hudCache = { speed: '', time: '', obj: '', cp: -1, progress: '', low: false };
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
    if (speed !== c.speed) {
      q(this.root, '#hud-speed').textContent = c.speed = speed;
    }
    const time = formatTime(h.time);
    if (time !== c.time) {
      q(this.root, '#hud-time').textContent = c.time = time;
    }
    if (h.lowTime !== c.low) {
      q(this.root, '#hud-time').classList.toggle('low', (c.low = h.lowTime));
    }
    if (h.objective !== c.obj) {
      q(this.root, '#hud-obj').textContent = c.obj = h.objective;
    }
    if (h.checkpointsDone !== c.cp) {
      c.cp = h.checkpointsDone;
      q(this.root, '#hud-route')
        .querySelectorAll<HTMLElement>('.pip')
        .forEach((p, i) => p.classList.toggle('done', i < h.checkpointsDone));
    }
    const pr = (h.progress * 100).toFixed(1);
    if (pr !== c.progress) {
      q(this.root, '#hud-fill').style.width = `${(c.progress = pr)}%`;
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
    el.innerHTML = `${title}${sub ? `<small>${sub}</small>` : ''}`;
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
    extra: { newBest: boolean; newMedal: boolean; best: number | null },
  ): void {
    const done = r.status === 'completed';
    q(this.root, '#finish-title').textContent = done ? `${level.finishLabel} reached!` : 'Out of time';
    q(this.root, '#finish-medal').innerHTML = done ? medalSvg(r.medal) : '';
    q(this.root, '#finish-time').textContent = formatTime(r.time);
    q(this.root, '#finish-sub').textContent = done
      ? MEDAL_TEXT[r.medal]
      : 'Your guests missed the flight. The mist won this time.';
    const chips: string[] = [];
    chips.push(`<span class="chip">Checkpoints ${r.checkpoints}/${level.checkpoints.length}</span>`);
    chips.push(`<span class="chip">Recoveries ${r.recoveries}</span>`);
    if (done) {
      if (extra.newBest) chips.push('<span class="chip good">New personal best!</span>');
      else if (extra.best !== null) chips.push(`<span class="chip">Best ${formatTime(extra.best)}</span>`);
      if (extra.newMedal) chips.push('<span class="chip good">New medal!</span>');
      chips.push(`<span class="chip">Gold ${formatTime(level.medals.gold)}</span>`);
    }
    q(this.root, '#finish-chips').innerHTML = chips.join('');
    this.screens.finish.hidden = false;
    this.focusFirst(this.screens.finish, '#btn-replay');
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

  restoreFocus(): void {
    this.lastFocus?.focus?.({ preventScroll: true });
  }
}
