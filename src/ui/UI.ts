import { COSMETIC_OPTIONS, readCosmetics } from '../render/cosmetics';
import type { CosmeticKey } from '../render/cosmetics';
import type { LevelDef, Medal, ServiceKind } from '../data/types';
import type { RaceResult } from '../gameplay/RaceSession';
import { formatTime } from '../gameplay/RaceSession';
import type { OptionalOutcome, Reward } from '../gameplay/rewards';
import type { QualityLevel, Settings, TouchMode } from '../storage/SaveStore';
import type { VehicleStats } from '../data/vehicles';
import { getStory } from '../data/story';
import { ICONS, KNOT, medalSvg } from './icons';
import { Hud, hudMarkup } from './Hud';
import type { HudMode, HudState } from './Hud';
import { renderCampaignMap, renderMapPreview } from './CampaignMap';

export interface UIActions {
  /** Main menu "Drive": open mission select. */
  openLevels(): void;
  /** Starts (or replays) Route 0, the Driver's Academy. */
  openAcademy(): void;
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
  /** Garage orbit camera: drag (pixels), zoom (fraction), turn (radians) or reset. */
  cosmetic(field: CosmeticKey, value: string): void;
  garageView(cmd: { orbit?: [number, number]; zoom?: number; turn?: number; reset?: boolean; view?: 'front' | 'rear' | 'side' }): void;
  readBriefing(): void;
  toggleDrive(): void;
  /** Pit-stop service of the given kind (null = whichever is on offer); with a guest at the kerb it checks their ID instead. */
  requestService(kind: ServiceKind | null): void;
  openAbout(): void;
  /** Campaign-complete screen: go back to the mission map. */
  campaignContinue(): void;
  openFeedback(origin: 'menu' | 'settings' | 'results' | 'about'): void;
  /** Opens the online leaderboard (beta) on a mission. */
  openBoard(levelId?: string): void;
  /** UI feedback sound hook. */
  click(back?: boolean): void;
}

export type { HudState, HudAlert, HudMode } from './Hud';

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
  region: string;
  /** The vehicle the mission is built around (first listed). */
  recommended: string;
  /** Short plain-language hint at the main challenge, e.g. "Night, fuel". */
  challenge: string;
  /** The next unfinished, unlocked mission in campaign order. */
  isNext: boolean;
}

export interface CampaignSummary {
  missions: number;
  total: number;
  gold: number;
  silver: number;
  bronze: number;
  credits: number;
  totalTime: number;
  best: { name: string; medal: Medal; time: number | null }[];
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
  /** Real before/after numbers for the next level. */
  preview: { label: string; before: string; after: string }[] | null;
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
const COIN =
  '<svg viewBox="0 0 24 24" aria-hidden="true" class="coin"><circle cx="12" cy="12" r="10" fill="#f6c452" stroke="#b8861a" stroke-width="2"/><path d="M12 6l5 6-5 6-5-6z" fill="none" stroke="#b8861a" stroke-width="2"/></svg>';

type ScreenName =
  'loading' | 'menu' | 'levels' | 'garage' | 'hud' | 'pause' | 'finish' | 'settings' | 'error' | 'campaign';

/** All DOM screens. Plain DOM + CSS: no framework; every control here does real work. */
export class UI {
  private readonly root: HTMLElement;
  private readonly screens: Record<ScreenName, HTMLElement>;
  private settingsReturn: 'menu' | 'pause' = 'menu';
  private readonly hud: Hud;
  private toastTimer = 0;
  private garageModel: GarageModel | null = null;
  private levelCardsModel: LevelCardModel[] = [];
  /** The mission whose results are on screen (for the leaderboard button). */
  private finishLevelId: string | null = null;
  private mapSelected: string | null = null;
  private levelsView: 'map' | 'list' = 'map';

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
          <img class="loader-logo" src="${brandBase}brand/cbhr-logo.webp" alt="" width="360" height="360" decoding="async" />
          <h1>Crazy Bhutan Hill Race</h1>
          <p id="loading-text">Loading...</p>
          <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100"><i id="loading-bar"></i></div>
        </div>
      </section>

      <section class="screen" id="screen-menu" data-screen hidden aria-labelledby="menu-title">
        <div class="menu-fx" aria-hidden="true"></div>
        <div class="menu-main">
          <div class="brand">
            <img class="game-logo" src="${brandBase}brand/cbhr-logo.webp" alt="" width="360" height="360" decoding="async" />
            <h1 id="menu-title" class="sr-only">Crazy Bhutan Hill Race</h1>
          </div>
          <p class="tagline">Deliver your guests. Beat the mist.</p>
          <div class="menu-cloud" id="menu-cloud"></div>
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
          <div><h2 id="levels-title">Choose a mission</h2><div class="muted" id="levels-progress"></div></div>
          <button class="btn ghost" id="btn-academy" type="button" title="Route 0: learn the controls and the road"><span>Driver's Academy</span></button>
          <button class="btn ghost view-toggle" id="btn-levels-view" type="button" aria-pressed="false"><span>List view</span></button>
          <span class="wallet" id="levels-wallet" title="Driving credits"></span>
        </header>
        <div class="level-map" id="level-map"></div>
        <div class="cards" id="level-cards" role="list"></div>
      </section>

      <section class="screen garage" id="screen-garage" data-screen hidden aria-labelledby="garage-title">
        <div class="garage-stage" id="garage-stage" aria-hidden="true"></div>
        <div class="garage-view" role="group" aria-label="Camera">
          <button class="icon-btn" id="gv-left" type="button" aria-label="Turn left">${ICONS.left}</button>
          <button class="icon-btn" id="gv-right" type="button" aria-label="Turn right">${ICONS.right}</button>
          <button class="icon-btn" id="gv-in" type="button" aria-label="Zoom in">+</button>
          <button class="icon-btn" id="gv-out" type="button" aria-label="Zoom out">&minus;</button>
          <button class="icon-btn" id="gv-front" type="button" aria-label="Front three quarter view">F</button>
          <button class="icon-btn" id="gv-rear" type="button" aria-label="Rear three quarter view">R</button>
          <button class="icon-btn" id="gv-side" type="button" aria-label="Side view">S</button>
          <button class="icon-btn" id="gv-reset" type="button" aria-label="Reset view">${ICONS.recover}</button>
        </div>
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
          <p class="veh-blurb" id="veh-blurb"></p><details class="cosmetic-panel" open><summary>Personalize your vehicle</summary><div id="veh-cosmetics"></div><small>Cosmetics only · saved on this device</small></details>
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

      ${hudMarkup()}

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
        <div class="panel wide"><div class="result-stamp" id="finish-stamp"></div><h2 id="finish-title"></h2>
          <div id="finish-medal"></div>
          <div class="result-time" id="finish-time"></div>
          <div class="result-sub" id="finish-sub"></div>
          <p class="finish-story" id="finish-story" hidden></p>
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
            <button class="btn" id="btn-finish-board" type="button"><span>Leaderboard</span></button>
            <button class="btn ghost" id="btn-finish-menu" type="button">${ICONS.home}<span>End game</span></button>
          </div>
          <div class="studio-mark"><img src="${brandBase}brand/novarah-symbol.webp" alt="" width="16" height="16" decoding="async" /><span>Novarah Interactives</span></div>
        </div>
      </div>

      <div class="modal" id="screen-campaign" data-screen hidden role="dialog" aria-modal="true" aria-labelledby="campaign-title">
        <div class="panel wide campaign">${KNOT}<h2 id="campaign-title">Arcade campaign complete</h2>
          <p class="result-sub" id="campaign-sub"></p>
          <div class="result-grid" id="campaign-grid"></div>
          <ul class="campaign-list" id="campaign-list"></ul>
          <p class="muted campaign-note">A longer story campaign is planned for a future update. It is not available yet; nothing in this game depends on it.</p>
          <p class="invite">Enjoyed the ride? Tell us what you think!</p>
          <div class="stack">
            <button class="btn primary" id="btn-camp-levels" type="button">${ICONS.play}<span>Replay a mission</span></button>
            <button class="btn" id="btn-camp-feedback" type="button"><span>Share feedback</span></button>
            <button class="btn ghost" id="btn-camp-menu" type="button">${ICONS.home}<span>Main menu</span></button>
          </div>
          <div class="studio-mark"><img src="${brandBase}brand/novarah-symbol.webp" alt="" width="16" height="16" decoding="async" /><span>A Novarah Interactives game</span></div>
        </div>
      </div>

      <div class="modal" id="screen-settings" data-screen hidden role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div class="panel wide">${KNOT}<h2 id="settings-title">Settings</h2>
          <div class="tabs" role="tablist" aria-label="Settings sections">
            <button type="button" role="tab" id="tab-audio" data-tab="audio" aria-selected="true" aria-controls="pane-audio">Audio</button>
            <button type="button" role="tab" id="tab-graphics" data-tab="graphics" aria-selected="false" aria-controls="pane-graphics" tabindex="-1">Graphics</button>
            <button type="button" role="tab" id="tab-controls" data-tab="controls" aria-selected="false" aria-controls="pane-controls" tabindex="-1">Controls</button>
            <button type="button" role="tab" id="tab-gameplay" data-tab="gameplay" aria-selected="false" aria-controls="pane-gameplay" tabindex="-1">Gameplay</button>
            <button type="button" role="tab" id="tab-access" data-tab="access" aria-selected="false" aria-controls="pane-access" tabindex="-1">Accessibility</button>
            <button type="button" role="tab" id="tab-privacy" data-tab="privacy" aria-selected="false" aria-controls="pane-privacy" tabindex="-1">Privacy</button>
          </div>
          <div class="tab-panel" id="pane-audio" role="tabpanel" aria-labelledby="tab-audio">
            <div class="field"><label for="set-master">Master volume</label><output id="out-master"></output><input id="set-master" type="range" min="0" max="100" step="1" /></div>
            <div class="field"><label for="set-music">Music</label><output id="out-music"></output><input id="set-music" type="range" min="0" max="100" step="1" /></div>
            <div class="field"><label for="set-sfx">Engine and effects</label><output id="out-sfx"></output><input id="set-sfx" type="range" min="0" max="100" step="1" /></div>
            <div class="field"><label for="set-ambient">Environment (wind, rain, nature)</label><output id="out-ambient"></output><input id="set-ambient" type="range" min="0" max="100" step="1" /></div>
            <div class="field"><label for="set-music-mute">Mute music (keep sound effects)</label><input id="set-music-mute" type="checkbox" /></div>
            <div class="field"><label for="set-mute">Mute all sound</label><input id="set-mute" type="checkbox" /></div>
          </div>
          <div class="tab-panel" id="pane-graphics" role="tabpanel" aria-labelledby="tab-graphics" hidden>
            <div class="field"><label for="set-quality">Quality</label>
              <select id="set-quality"><option value="auto">Auto (recommended)</option><option value="low">Low (best for phones)</option><option value="medium">Medium</option><option value="high">High</option><option value="max">Max (full resolution, heavy GPU load)</option></select></div>
            <p class="hint-text">Low drops shadows and thins the scenery, terrain, rain and effects, and lowers the render resolution. Auto chooses a tier from available hardware and adapts resolution during play. Max enables 4096px shadows, more weather particles and nearby lights, and keeps full render resolution. Anti-aliasing applies on the next launch.</p>
          </div>
          <div class="tab-panel" id="pane-controls" role="tabpanel" aria-labelledby="tab-controls" hidden>
            <div class="field"><label for="set-touch">On-screen touch controls</label>
              <select id="set-touch"><option value="auto">Automatic</option><option value="on">Always show</option><option value="off">Hide</option></select></div>
            <div class="field"><label for="set-steer">Touch steering style</label>
              <select id="set-steer"><option value="bar">Slide bar</option><option value="wheel">Steering wheel</option></select></div>
            <div class="field"><label for="set-sens">Touch steering sensitivity</label><output id="out-sens"></output><input id="set-sens" type="range" min="60" max="160" step="5" /></div>
            <div class="field"><label for="set-mirror">Left-handed layout (steering on the right)</label><input id="set-mirror" type="checkbox" /></div>
            <h3>How to drive</h3>
            <div class="tabs sub-tabs" role="tablist" aria-label="Control schemes">
              <button type="button" role="tab" data-help="kb" aria-selected="true">Keyboard</button>
              <button type="button" role="tab" data-help="touch" aria-selected="false" tabindex="-1">Touch</button>
              <button type="button" role="tab" data-help="pad" aria-selected="false" tabindex="-1">Gamepad</button>
            </div>
            <div class="controls-grid" data-help-pane="kb">
              <span><kbd>W</kbd><kbd>&uarr;</kbd></span><span>Accelerate</span>
              <span><kbd>S</kbd><kbd>&darr;</kbd></span><span>Brake, then reverse</span>
              <span><kbd>A</kbd><kbd>D</kbd> <kbd>&larr;</kbd><kbd>&rarr;</kbd></span><span>Steer</span>
              <span><kbd>F</kbd></span><span>Switch between 4x2 and 4x4 (vehicles that have both)</span>
              <span><kbd>E</kbd></span><span>Refuel or repair when stopped at a pit stop</span>
              <span><kbd>R</kbd></span><span>Recover to the last checkpoint</span>
              <span><kbd>Shift</kbd>+<kbd>R</kbd></span><span>Restart the run</span>
              <span><kbd>Esc</kbd><kbd>P</kbd></span><span>Pause</span>
            </div>
            <div class="controls-grid" data-help-pane="touch" hidden>
              <span>Steer</span><span>Slide the bar or turn the wheel with one thumb; release to centre</span>
              <span>GAS / BRAKE</span><span>Hold with the other thumb. BRAKE also reverses once stopped</span>
              <span>HUD buttons</span><span>4x4, pit-stop service, Check ID and recover appear on screen when they apply</span>
              <span>Layout</span><span>Choose the steering style, a left-handed layout and larger controls here and under Accessibility</span>
            </div>
            <div class="controls-grid" data-help-pane="pad" hidden>
              <span>Left stick</span><span>Steer</span>
              <span>RT / LT</span><span>Gas / brake (and reverse)</span>
              <span>X</span><span>Switch 4x2 / 4x4</span>
              <span>Bumpers</span><span>Pit-stop service, and checking a guest's ID</span>
              <span>Y</span><span>Recover to the last checkpoint</span>
              <span>Start</span><span>Pause</span>
              <span>D-pad, A, B</span><span>Move, confirm and go back in menus</span>
            </div>
          </div>
          <div class="tab-panel" id="pane-gameplay" role="tabpanel" aria-labelledby="tab-gameplay" hidden>
            <div class="field"><label for="set-hud">Driving HUD</label>
              <select id="set-hud"><option value="standard">Standard</option><option value="minimal">Minimal</option><option value="telemetry">With telemetry</option></select></div>
            <p class="hint-text">Standard shows the instrument cluster, mission and vitals. Minimal keeps only speed, the timer and alerts. Telemetry adds gear, revs, load and traction.</p>
          </div>
          <div class="tab-panel" id="pane-access" role="tabpanel" aria-labelledby="tab-access" hidden>
            <div class="field"><label for="set-motion">Reduce motion (less camera shake, calmer menus)</label><input id="set-motion" type="checkbox" /></div>
            <div class="field"><label for="set-large">Larger touch controls</label><input id="set-large" type="checkbox" /></div>
          </div>
          <div class="tab-panel" id="pane-privacy" role="tabpanel" aria-labelledby="tab-privacy" hidden></div>
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
      campaign: q(host, '#screen-campaign'),
    };
    this.minimapCanvas = q<HTMLCanvasElement>(host, '#minimap-canvas');
    this.hud = new Hud(host);
    this.bind();
    this.setLevelsView(settings.levelsView);
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
    on('#btn-academy', () => this.actions.openAcademy());
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
    on('#btn-check-id', () => this.actions.requestService(null));
    on('#btn-resume', () => this.actions.resume());
    on('#btn-restart', () => this.actions.restart());
    on('#btn-pause-garage', () => this.actions.openGarage());
    on('#btn-pause-settings', () => this.openSettings('pause'));
    on('#btn-pause-menu', () => this.actions.quit(), true);
    on('#btn-replay', () => this.actions.restart());
    on('#btn-next', () => this.actions.nextMission());
    on('#btn-finish-feedback', () => this.actions.openFeedback('results'));
    on('#btn-finish-garage', () => this.actions.openGarage());
    on('#btn-finish-board', () => this.actions.openBoard(this.finishLevelId ?? undefined));
    on('#btn-finish-menu', () => this.actions.quit(), true);
    on('#btn-settings-back', () => this.closeSettings(), true);
    on('#btn-settings-feedback', () => this.actions.openFeedback('settings'));
    on('#btn-settings-about', () => this.actions.openAbout());
    on('#btn-reload', () => location.reload());
    on('#btn-camp-levels', () => {
      this.hideCampaign();
      this.actions.campaignContinue();
    });
    on('#btn-camp-feedback', () => this.actions.openFeedback('results'));
    on('#btn-camp-menu', () => {
      this.hideCampaign();
      this.actions.quit();
    }, true);
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

    // Mission map: pins preview on focus or tap; the preview card button opens the garage.
    const mapEl = q(this.root, '#level-map');
    mapEl.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const pin = t.closest<HTMLElement>('[data-pin]');
      const go = t.closest<HTMLElement>('[data-go]');
      if (go && !go.hasAttribute('disabled')) {
        this.actions.click();
        this.actions.chooseLevel(go.dataset.go as string);
      } else if (t.closest<HTMLElement>('[data-board]')) {
        this.actions.click();
        this.actions.openBoard(t.closest<HTMLElement>('[data-board]')?.dataset.board);
      } else if (pin) {
        this.actions.click();
        this.previewMapPin(pin.dataset.pin ?? null);
      }
    });
    mapEl.addEventListener('dblclick', (e) => {
      const pin = (e.target as HTMLElement).closest<HTMLElement>('[data-pin]');
      if (pin && pin.dataset.locked !== '1') this.actions.chooseLevel(pin.dataset.pin as string);
    });
    mapEl.addEventListener('focusin', (e) => {
      const pin = (e.target as HTMLElement).closest<HTMLElement>('[data-pin]');
      if (pin && pin.dataset.pin !== this.mapSelected) this.previewMapPin(pin.dataset.pin ?? null);
    });
    on('#btn-levels-view', () => {
      const v = this.levelsView === 'map' ? 'list' : 'map';
      this.setLevelsView(v);
      this.actions.settingsChanged({ levelsView: v });
    });
    // Garage camera: drag the empty stage, wheel to zoom, buttons for keyboard and touch users.
    const stage = q(this.root, '#garage-stage');
    const drag = { id: -1, x: 0, y: 0 };
    const pinch = new Map<number, { x: number; y: number }>();
    let pinchDist = 0;
    stage.addEventListener('pointerdown', (e) => {
      pinch.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch.size === 1) Object.assign(drag, { id: e.pointerId, x: e.clientX, y: e.clientY });
      if (pinch.size === 2) {
        const [a, b] = [...pinch.values()];
        pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      }
      try {
        stage.setPointerCapture(e.pointerId);
      } catch {
        /* pointer already gone */
      }
    });
    stage.addEventListener('pointermove', (e) => {
      if (!pinch.has(e.pointerId)) return;
      pinch.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch.size === 2) {
        const [a, b] = [...pinch.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchDist > 0) this.actions.garageView({ zoom: (pinchDist - d) / Math.max(1, pinchDist) });
        pinchDist = d;
      } else if (e.pointerId === drag.id) {
        this.actions.garageView({ orbit: [e.clientX - drag.x, e.clientY - drag.y] });
        drag.x = e.clientX;
        drag.y = e.clientY;
      }
    });
    const endDrag = (e: PointerEvent): void => {
      pinch.delete(e.pointerId);
      if (e.pointerId === drag.id) drag.id = -1;
      pinchDist = 0;
    };
    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', endDrag);
    stage.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.actions.garageView({ zoom: Math.sign(e.deltaY) * 0.08 });
      },
      { passive: false },
    );
    on('#gv-left', () => this.actions.garageView({ turn: -0.35 }));
    on('#gv-right', () => this.actions.garageView({ turn: 0.35 }));
    on('#gv-in', () => this.actions.garageView({ zoom: -0.12 }));
    on('#gv-out', () => this.actions.garageView({ zoom: 0.12 }));
    on('#gv-front', () => this.actions.garageView({view:'front'}));
    on('#gv-rear', () => this.actions.garageView({view:'rear'}));
    on('#gv-side', () => this.actions.garageView({view:'side'}));
    on('#gv-reset', () => this.actions.garageView({ reset: true }));
    this.screens.garage.addEventListener('change', e => {
      const select = e.target as HTMLSelectElement;
      if (select.dataset.cosmetic) this.actions.cosmetic(select.dataset.cosmetic as CosmeticKey, select.value);
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

    const slider = (id: string, out: string, key: 'masterVolume' | 'musicVolume' | 'sfxVolume' | 'ambientVolume'): void => {
      const el = q<HTMLInputElement>(this.root, id);
      el.addEventListener('input', () => {
        q(this.root, out).textContent = `${el.value}%`;
        this.actions.settingsChanged({ [key]: Number(el.value) / 100 });
      });
    };
    slider('#set-master', '#out-master', 'masterVolume');
    slider('#set-music', '#out-music', 'musicVolume');
    slider('#set-sfx', '#out-sfx', 'sfxVolume');
    slider('#set-ambient', '#out-ambient', 'ambientVolume');
    const sens = q<HTMLInputElement>(this.root, '#set-sens');
    sens.addEventListener('input', () => {
      q(this.root, '#out-sens').textContent = `${sens.value}%`;
      this.actions.settingsChanged({ touchSensitivity: Number(sens.value) / 100 });
    });
    q<HTMLInputElement>(this.root, '#set-mute').addEventListener('change', (e) =>
      this.actions.settingsChanged({ muted: (e.target as HTMLInputElement).checked }),
    );
    q<HTMLInputElement>(this.root, '#set-music-mute').addEventListener('change', (e) =>
      this.actions.settingsChanged({ musicMuted: (e.target as HTMLInputElement).checked }),
    );
    q<HTMLInputElement>(this.root, '#set-motion').addEventListener('change', (e) =>
      this.actions.settingsChanged({ reducedMotion: (e.target as HTMLInputElement).checked }),
    );
    q<HTMLSelectElement>(this.root, '#set-quality').addEventListener('change', (e) =>
      this.actions.settingsChanged({ quality: (e.target as HTMLSelectElement).value as QualityLevel }),
    );
    q<HTMLSelectElement>(this.root, '#set-hud').addEventListener('change', (e) =>
      this.actions.settingsChanged({ hudMode: (e.target as HTMLSelectElement).value as HudMode }),
    );
    q<HTMLSelectElement>(this.root, '#set-steer').addEventListener('change', (e) =>
      this.actions.settingsChanged({ touchSteer: (e.target as HTMLSelectElement).value as 'bar' | 'wheel' }),
    );
    q<HTMLInputElement>(this.root, '#set-mirror').addEventListener('change', (e) =>
      this.actions.settingsChanged({ touchMirror: (e.target as HTMLInputElement).checked }),
    );
    q<HTMLInputElement>(this.root, '#set-large').addEventListener('change', (e) =>
      this.actions.settingsChanged({ touchLarge: (e.target as HTMLInputElement).checked }),
    );
    this.bindTabs(this.screens.settings.querySelectorAll<HTMLElement>('.tabs:not(.sub-tabs) [data-tab]'), (id) => {
      this.screens.settings.querySelectorAll<HTMLElement>('.tab-panel').forEach((p) => {
        p.hidden = p.id !== 'pane-' + id;
      });
    });
    this.bindTabs(this.screens.settings.querySelectorAll<HTMLElement>('[data-help]'), (id) => {
      this.screens.settings.querySelectorAll<HTMLElement>('[data-help-pane]').forEach((p) => {
        p.hidden = p.dataset.helpPane !== id;
      });
    });
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

  /** A WAI-ARIA tablist: click or arrow keys select; only the selected tab is in the tab order. */
  private bindTabs(tabs: NodeListOf<HTMLElement>, onSelect: (id: string) => void): void {
    const list = [...tabs];
    const select = (t: HTMLElement, focus: boolean): void => {
      for (const o of list) {
        o.setAttribute('aria-selected', String(o === t));
        o.tabIndex = o === t ? 0 : -1;
      }
      onSelect(t.dataset.tab ?? t.dataset.help ?? '');
      if (focus) t.focus();
    };
    list.forEach((t, i) => {
      t.addEventListener('click', () => select(t, false));
      t.addEventListener('keydown', (e) => {
        const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        e.stopPropagation(); // the menu's spatial arrow navigation must not also move focus
        select(list[(i + d + list.length) % list.length], true);
      });
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
    set('#set-ambient', s.ambientVolume, '#out-ambient');
    set('#set-sens', s.touchSensitivity, '#out-sens');
    q<HTMLInputElement>(this.root, '#set-mute').checked = s.muted;
    q<HTMLInputElement>(this.root, '#set-music-mute').checked = s.musicMuted;
    q<HTMLInputElement>(this.root, '#set-motion').checked = s.reducedMotion;
    q<HTMLSelectElement>(this.root, '#set-quality').value = s.quality;
    q<HTMLSelectElement>(this.root, '#set-hud').value = s.hudMode;
    q<HTMLSelectElement>(this.root, '#set-touch').value = s.touchControls;
    q<HTMLSelectElement>(this.root, '#set-steer').value = s.touchSteer;
    q<HTMLInputElement>(this.root, '#set-mirror').checked = s.touchMirror;
    q<HTMLInputElement>(this.root, '#set-large').checked = s.touchLarge;
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
    // The menu builds in once per launch; coming back from a mission or a sub-screen is instant.
    if (!this.menuBuilt) {
      this.menuBuilt = true;
      this.screens.menu.classList.add('enter');
    }
    this.showFlow('menu');
    this.focusFirst(this.screens.menu, '#btn-start');
  }

  private menuBuilt = false;

  hideMenu(): void {
    this.showFlow(null);
  }

  showLevels(cards: LevelCardModel[], credits: number, status?: { completed: number; total: number; gold: number; silver: number; bronze: number }): void {
    q(this.root, '#levels-wallet').innerHTML = `${COIN}${credits.toLocaleString('en-US')}`;
    q(this.root, '#levels-progress').textContent = status
      ? `${status.completed} of ${status.total} missions complete · ${status.gold} gold · ${status.silver} silver · ${status.bronze} bronze`
      : '';
    const card = (c: LevelCardModel): string => {
      const state = c.locked
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
        <span class="tags">${c.challenge ? c.challenge.split(' · ').map((t) => `<i>${esc(t)}</i>`).join('') : ''}</span>
        ${state}
        <span class="card-veh">Best with: ${esc(c.recommended)}</span>
        ${c.locked ? '' : `<span class="card-reward">${COIN}up to ${c.reward}+</span>`}
      </button>`;
    };
    const regions: string[] = [];
    for (const c of cards) if (!regions.includes(c.region)) regions.push(c.region);
    q(this.root, '#level-cards').innerHTML = regions
      .map((r) => {
        const mine = cards.filter((c) => c.region === r);
        const done = mine.filter((c) => c.bestTime !== null).length;
        return `<section class="region" aria-label="${esc(r)}"><h3 class="region-title">${esc(r)} <span class="muted">${done}/${mine.length}</span></h3><div class="region-cards">${mine.map(card).join('')}</div></section>`;
      })
      .join('');
    this.levelCardsModel = cards;
    this.mapSelected =
      cards.find((c) => c.selected)?.id ?? cards.find((c) => c.isNext)?.id ?? cards.find((c) => !c.locked)?.id ?? cards[0]?.id ?? null;
    q(this.root, '#level-map').innerHTML = renderCampaignMap(cards, this.mapSelected);
    this.previewMapPin(this.mapSelected);
    this.applyLevelsView();
    this.showFlow('levels');
    this.focusFirst(
      this.screens.levels,
      this.levelsView === 'map'
        ? '.map-pin.selected'
        : `button[data-level]${cards.some((c) => c.selected && !c.locked) ? '.selected' : ':not(.locked)'}`,
    );
  }

  /** Shows the preview card for a map pin (without leaving the map). */
  private previewMapPin(id: string | null): void {
    const c = this.levelCardsModel.find((x) => x.id === id);
    if (!c) return;
    this.mapSelected = c.id;
    this.root.querySelectorAll<HTMLElement>('.map-pin').forEach((p) => p.classList.toggle('selected', p.dataset.pin === c.id));
    q(this.root, '#map-preview').innerHTML = renderMapPreview(c, !c.locked);
  }

  private applyLevelsView(): void {
    const map = this.levelsView === 'map';
    q(this.root, '#level-map').hidden = !map;
    q(this.root, '#level-cards').hidden = map;
    const b = q(this.root, '#btn-levels-view');
    b.setAttribute('aria-pressed', String(!map));
    q(b, 'span').textContent = map ? 'List view' : 'Map view';
  }

  setLevelsView(v: 'map' | 'list'): void {
    this.levelsView = v;
    this.applyLevelsView();
  }

  showCampaignComplete(s: CampaignSummary): void {
    q(this.root, '#campaign-sub').textContent = `All ${s.total} missions finished: ${s.gold} gold, ${s.silver} silver, ${s.bronze} bronze.`;
    const cell = (label: string, value: string): string =>
      `<div class="rg"><span class="hud-label">${label}</span><b>${value}</b></div>`;
    q(this.root, '#campaign-grid').innerHTML =
      cell('Missions', `${s.missions}/${s.total}`) + cell('Credits earned', s.credits.toLocaleString('en-US')) + cell('Best times total', formatTime(s.totalTime));
    q(this.root, '#campaign-list').innerHTML = s.best
      .map((b) => `<li><span>${esc(b.name)}</span><span class="mini-medal ${b.medal}">${medalName(b.medal)}</span><b>${b.time !== null ? formatTime(b.time) : '-'}</b></li>`)
      .join('');
    this.screens.campaign.hidden = false;
    this.focusFirst(this.screens.campaign, '#btn-camp-levels');
  }

  hideCampaign(): void {
    this.screens.campaign.hidden = true;
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
    const cosmetics = readCosmetics(v.id);
    q(this.root, '#veh-cosmetics').innerHTML = (Object.keys(COSMETIC_OPTIONS) as CosmeticKey[]).map(k =>
      `<label>${k === 'equipment' ? 'Accessories' : k}<select data-cosmetic="${k}" aria-label="${k}">${COSMETIC_OPTIONS[k].map(([value,label]) => `<option value="${value}" ${cosmetics[k] === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>`).join('');
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
      `<span><b>${v.capacity}</b> seats</span><span><b>${esc(v.drivetrain)}</b></span><span>Range <b>${(v.rangeKm < 20 ? v.rangeKm.toFixed(1) : Math.round(v.rangeKm))}</b> km</span>`;
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
          <small>${esc(u.nextEffect ?? u.blurb)}</small>${u.preview ? `<span class="upg-delta">${u.preview.map((p) => `<span>${esc(p.label)} <s>${esc(p.before)}</s> &rarr; <b>${esc(p.after)}</b></span>`).join('')}</span>` : ''}</div>${action}</div>`;
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

  showHud(opts: { comfort: boolean; timerLabel: string; canToggleDrive: boolean; mode: HudMode }): void {
    this.hud.show(opts);
  }

  hideHud(): void {
    this.hud.hide();
  }

  setHudMode(mode: HudMode): void {
    this.hud.setMode(mode);
  }

  /** Builds the checkpoint pips (and pickup / pit-stop marks) along the route bar. */
  setRoute(checkpointFractions: number[], stops: { at: number; kind: 'pickup' | 'service' }[] = []): void {
    this.hud.setRoute(checkpointFractions, stops);
  }

  updateHud(h: HudState): void {
    this.hud.update(h);
  }

  setCountdown(text: string | null): void {
    this.hud.setCountdown(text);
  }

  setDispatch(d: { title: string; goal: string } | null): void {
    this.hud.setDispatch(d);
  }

  clearDispatchSoon(ms: number): void {
    this.hud.clearDispatchSoon(ms);
  }

  flash(title: string, sub = ''): void {
    this.hud.flash(title, sub);
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
    const stamp = q(this.root, '#finish-stamp');
    stamp.textContent = done ? 'Mission complete' : 'Mission failed';
    stamp.className = `result-stamp ${done ? 'ok' : 'bad'}`;
    const ending = getStory(level.id)?.ending;
    const storyLine = q(this.root, '#finish-story');
    storyLine.hidden = !ending;
    storyLine.textContent = ending ? (done ? ending.done : ending.failed) : '';
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

  setFinishLevel(id: string): void {
    this.finishLevelId = id;
  }

  /** The empty containers other modules fill in: the menu's online-status slot and the Privacy settings tab. */
  get menuCloudSlot(): HTMLElement {
    return q(this.root, '#menu-cloud');
  }

  get privacyPane(): HTMLElement {
    return q(this.root, '#pane-privacy');
  }

  /** Opens the settings screen on a given tab (from the menu or the pause screen). */
  openSettingsTab(from: 'menu' | 'pause', tab: string): void {
    if (!this.settingsOpen) this.openSettings(from);
    q<HTMLElement>(this.root, `#tab-${tab}`).click();
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
      this.screens.campaign,
      ...Array.from(
        this.root.querySelectorAll<HTMLElement>('.modal.about, .modal.feedback, .modal.briefing'),
      ),
    ].some((s) => !s.hidden);
  }
}
