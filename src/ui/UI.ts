import type { LevelDef, Medal, ServiceKind } from '../data/types';
import type { RaceResult } from '../gameplay/RaceSession';
import { formatTime } from '../gameplay/RaceSession';
import type { OptionalOutcome, Reward } from '../gameplay/rewards';
import type { QualityLevel, Settings, TouchMode } from '../storage/SaveStore';
import type { VehicleStats } from '../data/vehicles';
import { ICONS, KNOT, logoSvg, medalSvg } from './icons';

export interface UIActions {
  /** Main menu "Drive": open mission select. */
  openLevels(): void;
  /** Main menu "Garage": vehicles and upgrades without a mission. */
  openGarageFree(): void;
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
  buyVehicle(id: string): void;
  buyUpgrade(vehicleId: string, upgradeId: string): void;
  setConditions(index: number): void;
  readBriefing(): void;
  toggleDrive(): void;
  requestService(kind: ServiceKind): void;
  openAbout(): void;
  openFeedback(origin: 'menu' | 'settings' | 'results' | 'about'): void;
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
  onboard: number;
  party: number;
  conditions: string;
  /** Pit-stop on offer where the car is stopped, or the one in progress. */
  service: { kinds: ServiceKind[]; active: ServiceKind | null; progress: number } | null;
  /** Context line (e.g. "Stop in the yellow zone"), or ''. */
  prompt: string;
  rival: { gap: number; label: string } | null;
  headlights: boolean;
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
  reward: number;
}

export interface UpgradeRow {
  id: string;
  name: string;
  blurb: string;
  level: number;
  max: number;
  nextCost: number | null;
  nextEffect: string | null;
  canBuy: boolean;
}

export interface VehicleCardModel {
  id: string;
  name: string;
  blurb: string;
  tier: number;
  stats: VehicleStats;
  state: 'owned' | 'available' | 'locked';
  price: number;
  lockText: string;
  /** Provided free by the studio because the player owns no suitable vehicle for this mission. */
  loaner: boolean;
  /** Allowed on the selected mission. */
  eligible: boolean;
  reason: string;
  capacity: number;
  drivetrain: string;
  rangeKm: number;
  best: { time: number | null; medal: Medal; comfort: number | null } | null;
  /** Medal and limit times scaled for this vehicle on this mission. */
  targets: { gold: number; silver: number; bronze: number; limit: number } | null;
  canBuy: boolean;
  upgrades: UpgradeRow[];
}

export interface GarageModel {
  level: {
    name: string;
    objective: string;
    tip: string;
    comfort: boolean;
    deadline: boolean;
    party: number;
    hasStory: boolean;
  } | null;
  credits: number;
  vehicles: VehicleCardModel[];
  index: number;
  conditions: { label: string; bonus: number }[];
  conditionIndex: number;
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
  reward: Reward;
  optional: OptionalOutcome[];
  credits: number;
  fuelLeft: number | null;
  health: number | null;
  delivered: number;
  party: number;
  rivalLine: string | null;
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
const COIN =
  '<svg viewBox="0 0 24 24" aria-hidden="true" class="coin"><circle cx="12" cy="12" r="10" fill="#f6c452" stroke="#b8861a" stroke-width="2"/><path d="M12 6l5 6-5 6-5-6z" fill="none" stroke="#b8861a" stroke-width="2"/></svg>';
const FUEL_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true" class="gi"><path d="M5 20V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v15zM15 9h2a2 2 0 0 1 2 2v6a1.5 1.5 0 0 1-3 0v-3h-1" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M7.5 6h5v4h-5z" fill="currentColor"/></svg>';
const WRENCH_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true" class="gi"><path d="M14.5 4a5 5 0 0 0-4.6 6.9L3.5 17.3a1.9 1.9 0 0 0 2.7 2.7l6.4-6.4A5 5 0 0 0 19.5 9l-3 3-2.8-.7L13 8.5l3-3A5 5 0 0 0 14.5 4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';

type ScreenName =
  'loading' | 'menu' | 'levels' | 'garage' | 'hud' | 'pause' | 'finish' | 'settings' | 'error';

/** All DOM screens. Plain DOM + CSS: no framework; every control here does real work. */
export class UI {
  private readonly root: HTMLElement;
  private readonly screens: Record<ScreenName, HTMLElement>;
  private settingsReturn: 'menu' | 'pause' = 'menu';
  private readonly cache = new Map<string, string>();
  private flashTimer = 0;
  private toastTimer = 0;
  private hintTimer = 0;
  private garageModel: GarageModel | null = null;

  readonly minimapCanvas: HTMLCanvasElement;

  constructor(
    host: HTMLElement,
    private readonly actions: UIActions,
    settings: Settings,
    brandBase = './',
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
            <button class="btn" id="btn-menu-garage" type="button">${COIN}<span>Garage</span></button>
            <button class="btn ghost" id="btn-menu-settings" type="button">${ICONS.settings}<span>Settings</span></button>
            <button class="btn ghost" id="btn-menu-feedback" type="button"><span>Share feedback</span></button>
          </div>
        </div>
        <div class="menu-foot">
          <button class="credit-link" id="btn-credit" type="button" aria-label="About Crazy Bhutan Hill Race and Novarah Interactives">
            <img src="${brandBase}brand/novarah-symbol.webp" alt="" width="22" height="22" decoding="async" /><span>A Novarah Interactives game</span></button>
          <span class="muted">Fictional, stylised geography inspired by Bhutan's mountain roads</span>
        </div>
      </section>

      <section class="screen sheet" id="screen-levels" data-screen hidden aria-labelledby="levels-title">
        <header class="sheet-head">
          <button class="icon-btn" id="btn-levels-back" data-back type="button" aria-label="Back to menu">${ICONS.left}</button>
          <h2 id="levels-title">Choose a mission</h2>
          <span class="wallet" id="levels-wallet" title="Driving credits"></span>
        </header>
        <div class="cards" id="level-cards" role="list"></div>
      </section>

      <section class="screen garage" id="screen-garage" data-screen hidden aria-labelledby="garage-title">
        <div class="garage-panel">
          <header class="sheet-head">
            <button class="icon-btn" id="btn-garage-back" data-back type="button" aria-label="Back">${ICONS.left}</button>
            <div><div class="eyebrow" id="garage-level"></div><h2 id="garage-title">Garage</h2></div>
            <span class="wallet" id="garage-wallet" title="Driving credits (earned by playing; never bought with real money)"></span>
          </header>
          <div class="veh-nav">
            <button class="icon-btn" id="btn-veh-prev" type="button" aria-label="Previous vehicle">${ICONS.left}</button>
            <div class="veh-name"><h3 id="veh-name"></h3><div class="veh-dots" id="veh-dots" aria-hidden="true"></div></div>
            <button class="icon-btn" id="btn-veh-next" type="button" aria-label="Next vehicle">${ICONS.right}</button>
          </div>
          <p class="veh-blurb" id="veh-blurb"></p>
          <div class="stats" id="veh-stats"></div>
          <div class="veh-facts" id="veh-facts"></div>
          <div class="veh-status" id="veh-status" aria-live="polite"></div>
          <div class="veh-buy" id="veh-buy"></div>
          <details class="upgrades" id="veh-upgrades"><summary>Upgrades</summary><div id="veh-upgrade-list"></div></details>
          <div class="mission-brief" id="veh-brief"></div>
          <div class="cond-row" id="cond-row"><label for="sel-cond">Conditions</label><select id="sel-cond"></select></div>
          <div class="stack row">
            <button class="btn ghost" id="btn-read-brief" type="button">Story</button>
            <button class="btn primary" id="btn-launch" type="button">${ICONS.play}<span>Start mission</span></button>
          </div>
        </div>
      </section>

      <section id="hud" hidden aria-label="Driving HUD">
        <div class="hud-left">
          <div class="hud-card hud-speed"><b id="hud-speed">0</b><small>km/h</small></div>
          <div class="hud-card hud-vitals" id="hud-vitals">
            <div class="vital" id="vital-fuel" title="Fuel">${FUEL_ICON}<div class="vbar"><i id="fuel-fill"></i></div><b id="fuel-pct">100%</b></div>
            <div class="vital" id="vital-health" title="Vehicle condition">${WRENCH_ICON}<div class="vbar"><i id="health-fill"></i></div><b id="health-pct">100%</b></div>
            <div class="vital-row"><span class="pax-count" id="hud-pax" title="Guests on board">${PASSENGER_ICON}<b id="pax-count">0/0</b></span>
              <button class="chip-btn" id="btn-drive" type="button" title="Toggle 4x2 / 4x4 (F)" aria-label="Drive mode"><b id="drive-mode">4x2</b></button></div>
          </div>
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
          <div class="hud-obj" id="hud-obj" aria-live="polite"></div>
          <div class="hud-dist" id="hud-dist"></div>
          <div class="route" id="hud-route"><i class="fill" id="hud-fill"></i></div>
        </div>
        <div class="hud-right">
          <div class="btns">
            <button class="icon-btn" id="btn-recover" type="button" title="Recover to last checkpoint (R)" aria-label="Recover to last checkpoint">${ICONS.recover}</button>
            <button class="icon-btn" id="btn-pause" type="button" title="Pause (Esc)" aria-label="Pause">${ICONS.pause}</button>
          </div>
          <div class="hud-card" id="minimap"><canvas id="minimap-canvas" aria-label="Route map" role="img"></canvas></div>
          <div class="hud-card hud-cond" id="hud-cond"></div>
          <div class="hud-card hud-rival" id="hud-rival" hidden></div>
        </div>
        <div class="center-msg" id="countdown" aria-live="assertive"></div>
        <div class="center-msg" id="flash" aria-live="polite"></div>
        <div class="hud-card hud-prompt" id="hud-prompt" hidden>
          <span id="prompt-text"></span>
          <span class="prompt-btns">
            <button class="btn" id="btn-refuel" type="button" hidden>${FUEL_ICON}<span>Refuel (E)</span></button>
            <button class="btn" id="btn-repair" type="button" hidden>${WRENCH_ICON}<span>Repair (E)</span></button>
          </span>
          <div class="svc-bar" id="svc-bar" hidden><i id="svc-fill"></i></div>
        </div>
        <div class="hud-card hud-hint" id="hud-hint"><kbd>W</kbd><kbd>S</kbd> gas / brake &middot; <kbd>A</kbd><kbd>D</kbd> steer &middot; <kbd>F</kbd> 4x4 &middot; <kbd>E</kbd> service &middot; <kbd>R</kbd> recover &middot; <kbd>Esc</kbd> pause</div>
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
          <div class="rewards" id="finish-rewards"></div>
          <div class="unlocks" id="finish-unlocks" aria-live="polite"></div>
          <p class="invite" id="finish-invite">Enjoyed the ride? Tell us what you think!</p>
          <div class="stack">
            <button class="btn primary" id="btn-next" type="button">${ICONS.play}<span id="btn-next-label">Continue</span></button>
            <button class="btn" id="btn-replay" type="button">${ICONS.recover}<span>Replay</span></button>
            <button class="btn" id="btn-finish-feedback" type="button"><span>Share feedback</span></button>
            <button class="btn" id="btn-finish-garage" type="button">${COIN}<span>Garage</span></button>
            <button class="btn ghost" id="btn-finish-menu" type="button">${ICONS.home}<span>End game</span></button>
          </div>
          <div class="studio-mark"><img src="${brandBase}brand/novarah-symbol.webp" alt="" width="16" height="16" decoding="async" /><span>Novarah Interactives</span></div>
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
          <p class="hint-text">Low drops shadows and thins the scenery, terrain, rain and effects, and lowers the render resolution. Anti-aliasing applies on the next launch.</p>
          <div class="field"><label for="set-motion">Reduce motion (less camera shake, calmer menus)</label><input id="set-motion" type="checkbox" /></div>
          <h3>Controls</h3>
          <div class="field"><label for="set-touch">On-screen touch controls</label>
            <select id="set-touch"><option value="auto">Automatic</option><option value="on">Always show</option><option value="off">Hide</option></select></div>
          <div class="field"><label for="set-sens">Touch steering sensitivity</label><output id="out-sens"></output><input id="set-sens" type="range" min="60" max="160" step="5" /></div>
          <div class="controls-grid">
            <span><kbd>W</kbd><kbd>&uarr;</kbd></span><span>Accelerate</span>
            <span><kbd>S</kbd><kbd>&darr;</kbd></span><span>Brake, then reverse</span>
            <span><kbd>A</kbd><kbd>D</kbd> <kbd>&larr;</kbd><kbd>&rarr;</kbd></span><span>Steer</span>
            <span><kbd>F</kbd></span><span>Switch between 4x2 and 4x4 (vehicles that have both)</span>
            <span><kbd>E</kbd></span><span>Refuel or repair when stopped at a pit stop</span>
            <span><kbd>R</kbd></span><span>Recover to the last checkpoint</span>
            <span><kbd>Shift</kbd>+<kbd>R</kbd></span><span>Restart the run</span>
            <span><kbd>Esc</kbd><kbd>P</kbd></span><span>Pause</span>
            <span>Touch</span><span>Slide the steering bar, hold GAS / BRAKE with the other thumb; HUD buttons for 4x4 and services</span>
            <span>Gamepad</span><span>Left stick steer, RT gas, LT brake, X 4x4, bumpers service, Start pause, Y recover. D-pad / A / B in menus</span>
          </div>
          <div class="stack" style="margin-top:18px">
            <button class="btn" id="btn-settings-feedback" type="button"><span>Share feedback</span></button>
            <button class="btn" id="btn-settings-about" type="button"><span>About &amp; credits</span></button>
            <button class="btn primary" id="btn-settings-back" data-back type="button">Back</button></div>
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
    on('#btn-menu-garage', () => this.actions.openGarageFree());
    on('#btn-menu-settings', () => this.openSettings('menu'));
    on('#btn-menu-feedback', () => this.actions.openFeedback('menu'));
    on('#btn-credit', () => this.actions.openAbout());
    on('#btn-levels-back', () => this.actions.back(), true);
    on('#btn-garage-back', () => this.actions.back(), true);
    on('#btn-veh-prev', () => this.cycleVehicle(-1));
    on('#btn-veh-next', () => this.cycleVehicle(1));
    on('#btn-launch', () => this.actions.startMission());
    on('#btn-read-brief', () => this.actions.readBriefing());
    on('#btn-pause', () => this.actions.pause());
    on('#btn-recover', () => this.actions.recover());
    on('#btn-drive', () => this.actions.toggleDrive());
    on('#btn-refuel', () => this.actions.requestService('refuel'));
    on('#btn-repair', () => this.actions.requestService('repair'));
    on('#btn-resume', () => this.actions.resume());
    on('#btn-restart', () => this.actions.restart());
    on('#btn-pause-garage', () => this.actions.openGarage());
    on('#btn-pause-settings', () => this.openSettings('pause'));
    on('#btn-pause-menu', () => this.actions.quit(), true);
    on('#btn-replay', () => this.actions.restart());
    on('#btn-next', () => this.actions.nextMission());
    on('#btn-finish-feedback', () => this.actions.openFeedback('results'));
    on('#btn-finish-garage', () => this.actions.openGarage());
    on('#btn-finish-menu', () => this.actions.quit(), true);
    on('#btn-settings-back', () => this.closeSettings(), true);
    on('#btn-settings-feedback', () => this.actions.openFeedback('settings'));
    on('#btn-settings-about', () => this.actions.openAbout());
    on('#btn-reload', () => location.reload());
    q(this.root, '#rotate-close').addEventListener('click', () =>
      q(this.root, '#rotate-hint').classList.remove('on'),
    );
    q<HTMLSelectElement>(this.root, '#sel-cond').addEventListener('change', (e) =>
      this.actions.setConditions(Number((e.target as HTMLSelectElement).value)),
    );

    // Level cards: one delegated listener.
    q(this.root, '#level-cards').addEventListener('click', (e) => {
      const card = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-level]');
      if (!card || card.dataset.locked === '1') return;
      this.actions.click();
      this.actions.chooseLevel(card.dataset.level as string);
    });

    // Garage buy buttons: delegated, because the garage is re-rendered on every change.
    this.screens.garage.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-buy-vehicle],[data-buy-upgrade]');
      if (!t || (t as HTMLButtonElement).disabled) return;
      this.actions.click();
      const m = this.garageModel;
      if (!m) return;
      const v = m.vehicles[m.index];
      if (t.dataset.buyVehicle) this.actions.buyVehicle(t.dataset.buyVehicle);
      else if (t.dataset.buyUpgrade) this.actions.buyUpgrade(v.id, t.dataset.buyUpgrade);
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
    q<HTMLInputElement>(this.root, '#set-motion').addEventListener('change', (e) =>
      this.actions.settingsChanged({ reducedMotion: (e.target as HTMLInputElement).checked }),
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
    q<HTMLInputElement>(this.root, '#set-motion').checked = s.reducedMotion;
    q<HTMLSelectElement>(this.root, '#set-quality').value = s.quality;
    q<HTMLSelectElement>(this.root, '#set-touch').value = s.touchControls;
  }

  private focusFirst(screen: HTMLElement, sel = 'button:not([disabled])'): void {
    requestAnimationFrame(() => {
      const overlays = this.root.querySelector(
        '#screen-feedback:not([hidden]), #screen-about:not([hidden]), #screen-briefing:not([hidden])',
      );
      if (screen.hidden || overlays) return;
      (screen.querySelector<HTMLElement>(sel) ?? screen.querySelector<HTMLElement>('button'))?.focus({
        preventScroll: true,
      });
    });
  }

  /** Shows exactly one of the full-screen "flow" screens (menu / levels / garage), hiding the others. */
  private showFlow(which: 'menu' | 'levels' | 'garage' | null): void {
    this.screens.menu.hidden = which !== 'menu';
    this.screens.levels.hidden = which !== 'levels';
    this.screens.garage.hidden = which !== 'garage';
  }

  /** Sets text only when it changed: the HUD updates every frame. */
  private setText(id: string, value: string): void {
    if (this.cache.get(id) === value) return;
    this.cache.set(id, value);
    q(this.root, id).textContent = value;
  }

  private setStyle(id: string, prop: 'width', value: string): void {
    const key = `${id}|${prop}`;
    if (this.cache.get(key) === value) return;
    this.cache.set(key, value);
    q(this.root, id).style[prop] = value;
  }

  private setClass(id: string, cls: string, on: boolean): void {
    const key = `${id}.${cls}`;
    const v = on ? '1' : '0';
    if (this.cache.get(key) === v) return;
    this.cache.set(key, v);
    q(this.root, id).classList.toggle(cls, on);
  }

  private setHidden(id: string, hidden: boolean): void {
    const key = `${id}.hidden`;
    const v = hidden ? '1' : '0';
    if (this.cache.get(key) === v) return;
    this.cache.set(key, v);
    q(this.root, id).hidden = hidden;
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

  showMenu(summary: { missions: string; medals: string; lastPlayed: string; credits: number }): void {
    q(this.root, '#menu-summary').innerHTML =
      `<div class="row"><h3>Your journey</h3><span class="dots">${esc(summary.medals)}</span></div>
      <p>${esc(summary.missions)}</p><div class="best"><span>${esc(summary.lastPlayed)}</span><span class="wallet" title="Driving credits">${COIN}${summary.credits.toLocaleString('en-US')}</span></div>`;
    this.showFlow('menu');
    this.focusFirst(this.screens.menu, '#btn-start');
  }

  hideMenu(): void {
    this.showFlow(null);
  }

  showLevels(cards: LevelCardModel[], credits: number): void {
    q(this.root, '#levels-wallet').innerHTML = `${COIN}${credits.toLocaleString('en-US')}`;
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
          ${c.locked ? '' : `<span class="card-reward">${COIN}up to ${c.reward}+</span>`}
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

  /** Refreshes the garage after a purchase or a condition change without moving the carousel. */
  updateGarage(model: GarageModel): void {
    const keepId = this.garageModel?.vehicles[this.garageModel.index]?.id;
    this.garageModel = model;
    if (keepId) {
      const i = model.vehicles.findIndex((v) => v.id === keepId);
      if (i >= 0) model.index = i;
    }
    this.renderGarage();
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
    q(this.root, '#garage-level').textContent = m.level ? m.level.name : 'Your vehicles';
    q(this.root, '#garage-wallet').innerHTML = `${COIN}${m.credits.toLocaleString('en-US')}`;
    q(this.root, '#veh-name').textContent = v.name;
    q(this.root, '#veh-blurb').textContent = v.blurb;
    q(this.root, '#veh-dots').innerHTML = m.vehicles
      .map((x, i) => `<span class="${i === m.index ? 'on' : ''}${x.state === 'locked' ? ' lk' : ''}"></span>`)
      .join('');
    const bar = (label: string, n: number): string =>
      `<div class="stat"><span>${label}</span><span class="pips" role="img" aria-label="${n} of 5">${dots(n)}</span></div>`;
    q(this.root, '#veh-stats').innerHTML =
      bar('Top speed', v.stats.speed) +
      bar('Acceleration', v.stats.acceleration) +
      bar('Handling', v.stats.handling) +
      bar('Braking', v.stats.braking) +
      bar('Stability', v.stats.stability);
    q(this.root, '#veh-facts').innerHTML =
      `<span><b>${v.capacity}</b> seats</span><span><b>${esc(v.drivetrain)}</b></span><span>Range <b>${Math.round(v.rangeKm)}</b> km</span>`;
    const status = q(this.root, '#veh-status');
    const launch = q<HTMLButtonElement>(this.root, '#btn-launch');
    const buy = q(this.root, '#veh-buy');
    buy.innerHTML = '';
    const usable = v.state === 'owned' || v.loaner;
    if (v.state === 'locked') {
      status.className = 'veh-status bad';
      status.innerHTML = `${LOCK_ICON}<span>Locked: ${esc(v.lockText)}</span>`;
    } else if (v.state === 'available' && !v.loaner) {
      status.className = 'veh-status warn';
      status.innerHTML = `<span>Available to buy for ${COIN}${v.price.toLocaleString('en-US')} credits</span>`;
      buy.innerHTML = `<button class="btn primary" type="button" data-buy-vehicle="${esc(v.id)}"${v.canBuy ? '' : ' disabled'}>${COIN}<span>${v.canBuy ? `Buy for ${v.price.toLocaleString('en-US')}` : `Need ${(v.price - m.credits).toLocaleString('en-US')} more credits`}</span></button>`;
    } else if (!v.eligible) {
      status.className = 'veh-status bad';
      status.innerHTML = `<span>${esc(v.reason || 'Not allowed on this mission')}</span>`;
    } else {
      status.className = 'veh-status ok';
      const rec = v.best && v.best.time !== null ? `Your best: ${formatTime(v.best.time)}` : 'Ready to drive';
      status.innerHTML = `<span>${v.loaner ? 'Loaned to you for this mission. ' : ''}${rec}</span>`;
    }
    launch.hidden = m.level === null;
    launch.disabled = !usable || !v.eligible;
    q(this.root, '#btn-read-brief').hidden = !m.level?.hasStory;

    // Upgrades.
    const up = q<HTMLDetailsElement>(this.root, '#veh-upgrades');
    up.hidden = v.state !== 'owned' || v.upgrades.length === 0;
    q(this.root, '#veh-upgrade-list').innerHTML = v.upgrades
      .map((u) => {
        const pips = Array.from(
          { length: u.max },
          (_, i) => `<i class="${i < u.level ? 'on' : ''}"></i>`,
        ).join('');
        const action =
          u.nextCost === null
            ? '<span class="maxed">Maxed</span>'
            : `<button class="btn" type="button" data-buy-upgrade="${esc(u.id)}"${u.canBuy ? '' : ' disabled'} aria-label="Buy ${esc(u.name)} level ${u.level + 1} for ${u.nextCost} credits">${COIN}<span>${u.nextCost}</span></button>`;
        return `<div class="upg"><div class="upg-main"><b>${esc(u.name)}</b><span class="upg-pips" role="img" aria-label="level ${u.level} of ${u.max}">${pips}</span>
          <small>${esc(u.nextEffect ?? u.blurb)}</small></div>${action}</div>`;
      })
      .join('');

    // Mission brief.
    const brief = q(this.root, '#veh-brief');
    const cond = q(this.root, '#cond-row');
    if (!m.level || !v.targets) {
      brief.innerHTML =
        '<p class="muted">Pick a mission from the map to see its times here. Upgrades carry over to every mission.</p>';
      cond.hidden = true;
      return;
    }
    const t = v.targets;
    const goal = m.level.deadline
      ? `Flight leaves after ${formatTime(t.limit)}`
      : `Time limit ${formatTime(t.limit)}`;
    brief.innerHTML = `<p>${esc(m.level.objective)}</p>
      <p class="tip">${esc(m.level.tip)}</p>
      <div class="targets"><span class="t gold">Gold ${formatTime(t.gold)}</span><span class="t silver">Silver ${formatTime(t.silver)}</span><span class="t bronze">Bronze ${formatTime(t.bronze)}</span></div>
      <p class="muted">${goal}${m.level.comfort ? '. Medal = the lower of your time and passenger comfort.' : '.'}${m.level.party > 1 ? ` Party of ${m.level.party}: needs ${m.level.party} seats.` : ''}</p>`;
    cond.hidden = m.conditions.length < 2;
    const sel = q<HTMLSelectElement>(this.root, '#sel-cond');
    sel.innerHTML = m.conditions
      .map(
        (c, i) =>
          `<option value="${i}"${i === m.conditionIndex ? ' selected' : ''}>${esc(c.label)}${c.bonus > 1 ? ` (+${Math.round((c.bonus - 1) * 100)}% credits)` : ''}</option>`,
      )
      .join('');
  }

  hideFlow(): void {
    this.showFlow(null);
  }

  get currentGarageIndex(): number {
    return this.garageModel?.index ?? 0;
  }

  showHud(opts: { comfort: boolean; timerLabel: string; canToggleDrive: boolean }): void {
    this.screens.hud.hidden = false;
    this.cache.clear();
    q(this.root, '#hud-comfort').hidden = !opts.comfort;
    q(this.root, '#hud-timer-label').textContent = opts.timerLabel;
    q(this.root, '#btn-drive').hidden = !opts.canToggleDrive;
    const hint = q(this.root, '#hud-hint');
    hint.classList.remove('fade');
    window.clearTimeout(this.hintTimer);
    this.hintTimer = window.setTimeout(() => hint.classList.add('fade'), 9000);
  }

  hideHud(): void {
    this.screens.hud.hidden = true;
    this.setCountdown(null);
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

  updateHud(h: HudState): void {
    this.setText('#hud-speed', String(Math.round(h.speedKmh)));
    this.setText('#hud-time', h.timerText);
    this.setText('#hud-timer-label', h.timerLabel);
    this.setClass('#hud-time', 'low', h.lowTime);
    this.setText('#hud-obj', h.objective);
    this.setClass('#hud-obj', 'pickup', h.objectiveKind === 'pickup');
    this.setText(
      '#hud-dist',
      h.distance === null
        ? ''
        : h.distance < -20
          ? 'You drove past it: turn back'
          : h.distance < 1000
            ? `${Math.max(0, Math.round(h.distance / 5) * 5)} m ahead`
            : `${(h.distance / 1000).toFixed(1)} km ahead`,
    );
    const cpKey = String(h.checkpointsDone);
    if (this.cache.get('cp') !== cpKey) {
      this.cache.set('cp', cpKey);
      q(this.root, '#hud-route')
        .querySelectorAll<HTMLElement>('.pip')
        .forEach((p, i) => p.classList.toggle('done', i < h.checkpointsDone));
    }
    this.setStyle('#hud-fill', 'width', `${(h.progress * 100).toFixed(1)}%`);

    // Vitals.
    const fuel = Math.round(h.fuel * 100);
    this.setText('#fuel-pct', `${fuel}%`);
    this.setStyle('#fuel-fill', 'width', `${fuel}%`);
    this.setClass('#vital-fuel', 'low', h.fuel < 0.2);
    const hp = Math.round(h.health);
    this.setText('#health-pct', `${hp}%`);
    this.setStyle('#health-fill', 'width', `${hp}%`);
    this.setClass('#vital-health', 'low', h.health < 35);
    this.setText('#pax-count', `${h.onboard}/${h.party}`);
    this.setText('#drive-mode', h.driveMode);
    this.setClass('#btn-drive', 'on', h.driveMode === '4x4');
    this.setText('#hud-cond', h.conditions);
    this.setClass('#hud-cond', 'lights', h.headlights);

    // Pit stop / context prompt.
    const showPrompt = !!h.prompt || !!h.service;
    this.setHidden('#hud-prompt', !showPrompt);
    this.setText('#prompt-text', h.prompt);
    const kinds = h.service?.kinds ?? [];
    this.setHidden('#btn-refuel', !kinds.includes('refuel'));
    this.setHidden('#btn-repair', !kinds.includes('repair'));
    this.setHidden('#svc-bar', !h.service?.active);
    this.setStyle('#svc-fill', 'width', `${Math.round((h.service?.progress ?? 0) * 100)}%`);

    if (h.rival) {
      this.setHidden('#hud-rival', false);
      this.setText('#hud-rival', h.rival.label);
    } else this.setHidden('#hud-rival', true);

    if (h.comfort) {
      const pct = Math.round(h.comfort.value);
      this.setText('#comfort-pct', `${pct}%`);
      this.setStyle('#comfort-fill', 'width', `${pct}%`);
      if (this.cache.get('comfort-q') !== h.comfort.quality) {
        this.cache.set('comfort-q', h.comfort.quality);
        q(this.root, '#hud-comfort').dataset.quality = h.comfort.quality;
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
      this.setText('#comfort-msg', msg);
      this.setClass('#hud-comfort', 'warn', h.comfort.cause !== null);
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
        : 'The clock won this time. Learn the road and go again.';

    // Per-criterion breakdown (time, passengers, score, vehicle).
    const cell = (label: string, value: string, medal?: Medal): string =>
      `<div class="rg"><span class="hud-label">${label}</span><b>${value}</b>${medal ? `<span class="mini-medal ${medal}">${medalName(medal)}</span>` : ''}</div>`;
    const grid = [cell('Time', formatTime(r.time), done ? r.timeMedal : undefined)];
    if (r.comfort !== null)
      grid.push(
        cell('Passengers', `${Math.round(r.comfort)}%`, done ? (r.comfortMedal ?? undefined) : undefined),
      );
    if (extra.party > 0) grid.push(cell('Delivered', `${extra.delivered}/${extra.party}`));
    if (extra.fuelLeft !== null) grid.push(cell('Fuel left', `${Math.round(extra.fuelLeft * 100)}%`));
    if (extra.health !== null) grid.push(cell('Condition', `${Math.round(extra.health)}%`));
    if (done) grid.push(cell('Score', String(r.score)));
    q(this.root, '#finish-grid').innerHTML = grid.join('');

    const chips: string[] = [];
    chips.push(`<span class="chip">Checkpoints ${r.checkpoints}/${level.checkpoints.length}</span>`);
    chips.push(`<span class="chip">Recoveries ${r.recoveries}</span>`);
    chips.push(`<span class="chip">${esc(names.vehicles[r.vehicleId] ?? r.vehicleId)}</span>`);
    if (extra.rivalLine) chips.push(`<span class="chip">${esc(extra.rivalLine)}</span>`);
    if (done) {
      if (extra.newBest) chips.push('<span class="chip good">New personal best!</span>');
      else if (extra.best !== null) chips.push(`<span class="chip">Best ${formatTime(extra.best)}</span>`);
      if (extra.newMedal) chips.push('<span class="chip good">New medal!</span>');
      if (extra.newScoreBest && !extra.newBest) chips.push('<span class="chip good">Best score!</span>');
      chips.push(`<span class="chip">Gold ${formatTime(extra.medals.gold)}</span>`);
    }
    q(this.root, '#finish-chips').innerHTML = chips.join('');

    const lines = extra.reward.lines
      .map((l) => `<li><span>${esc(l.label)}</span><b>+${l.amount}</b></li>`)
      .join('');
    const opt = extra.optional
      .map(
        (o) =>
          `<li class="${o.achieved ? 'ok' : 'miss'}"><span>${o.achieved ? '&#10003;' : '&#9675;'} ${esc(o.def.label)}</span><b>${o.achieved ? '+' + o.def.reward : '+' + o.def.reward + ' missed'}</b></li>`,
      )
      .join('');
    q(this.root, '#finish-rewards').innerHTML = `<h3>${COIN}Driving credits earned: ${extra.reward.total}</h3>
      <ul>${lines}</ul>${opt ? `<h4>Bonus goals</h4><ul class="opt">${opt}</ul>` : ''}
      <p class="muted">Balance: ${extra.credits.toLocaleString('en-US')} credits. Credits are earned by playing and cannot be bought.</p>`;

    const unlocks: string[] = [
      ...extra.unlockedLevels.map(
        (id) =>
          `<div class="unlock">${LOCK_ICON}<div><b>New mission unlocked</b><span>${esc(names.levels[id] ?? id)}</span></div></div>`,
      ),
      ...extra.unlockedVehicles.map(
        (id) =>
          `<div class="unlock veh">${LOCK_ICON}<div><b>New vehicle available in the garage</b><span>${esc(names.vehicles[id] ?? id)}</span></div></div>`,
      ),
    ];
    q(this.root, '#finish-unlocks').innerHTML = unlocks.join('');

    const next = q<HTMLButtonElement>(this.root, '#btn-next');
    next.hidden = !(done && extra.nextMissionName);
    q(this.root, '#btn-next-label').textContent = extra.nextMissionName
      ? `Continue: ${extra.nextMissionName}`
      : 'Continue';
    q(this.root, '#btn-replay span').textContent = done ? 'Replay' : 'Try again';
    q(this.root, '#finish-invite').hidden = !done;
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
      ...Array.from(
        this.root.querySelectorAll<HTMLElement>('.modal.about, .modal.feedback, .modal.briefing'),
      ),
    ].some((s) => !s.hidden);
  }
}
