import { Vector3 } from 'three';
import { AudioEngine } from '../audio/AudioEngine';
import { clamp } from '../core/math';
import { ACADEMY_ID, getAcademy, levelTimes, listLevels, paceFor } from '../data/levels';
import { getCast, getStory } from '../data/story';
import type { CastMember } from '../data/story';
import { MAX_UPGRADE_LEVEL, UPGRADES, applyUpgrades, nextUpgradeCost, upgradePreview } from '../data/upgrades';
import { WEATHER, conditionsLabel } from '../data/weather';
import { getVehicle, listVehicles, vehicleStats } from '../data/vehicles';
import type { LevelDef, ServiceKind, UpgradeId, VehicleDef } from '../data/types';
import { AutoDriver } from '../dev/AutoDriver';
import { MissionDriver } from '../dev/MissionDriver';
import { MissionRuntime } from '../gameplay/MissionRuntime';
import type { RaceResult, RaceSession } from '../gameplay/RaceSession';
import { campaignStatus, challengeTags, justCompletedCampaign, nextUnplayed } from '../gameplay/campaign';
import { EngineSim } from '../gameplay/EngineSim';
import { STOP_RADIUS } from '../gameplay/Stops';
import { TRAFFIC_KINDS } from '../gameplay/Traffic';
import {
  availableVehicles,
  canBuyVehicle,
  canUseVehicle,
  describeRule,
  isLevelUnlocked,
  newlyUnlocked,
  resolveSelection,
  vehicleOwnership,
} from '../gameplay/progression';
import { InputManager } from '../input/InputManager';
import { MenuNav } from '../input/MenuNav';
import { createVehicleInput } from '../physics/types';
import { AdaptiveResolution } from '../render/adaptive';
import { CameraRig } from '../render/CameraRig';
import { Snow, VehicleEffects } from '../render/effects';
import { GameRenderer } from '../render/GameRenderer';
import { MissionView, Rain } from '../render/MissionView';
import { assets, loadVehicleAsset, peekVehicleAsset } from '../render/assets';
import { disposeEnvKit, loadEnvKit } from '../render/envKit';
import { QUALITY } from '../render/quality';
import { VehicleModel } from '../render/VehicleModel';
import { GarageScene } from '../render/GarageScene';
import { World3D } from '../render/World3D';
import { CloudService } from '../cloud/CloudService';
import { readCloudConfig } from '../cloud/config';
import { perfTierOf, platformOf, routeFraction, severityFor } from '../cloud/events';
import type { IncidentType, Severity } from '../cloud/events';
import { FirestoreFeedbackTransport, SentLog, flushFeedbackOutbox } from '../cloud/feedbackTransport';
import { FirebaseBackend } from '../cloud/FirebaseBackend';
import { Leaderboards } from '../cloud/Leaderboards';
import { CloudMetaStore } from '../cloud/meta';
import { PrivacyStore } from '../cloud/privacy';
import { IncidentLog, Telemetry } from '../cloud/Telemetry';
import { DraftStore, createTransport, readFeedbackConfig } from '../services/feedback';
import type { FeedbackTransport } from '../services/feedback';
import type { FeedbackConfig, FeedbackPayload } from '../services/feedback';
import { LocalIdentity, LocalLeaderboard, MemoryAnalytics, NullAnalytics } from '../services/seams';
import type { Services } from '../services/seams';
import type { Settings } from '../storage/SaveStore';
import { SaveStore, openBrowserStorage } from '../storage/SaveStore';
import { MiniMap } from '../ui/MiniMap';
import { TouchControls } from '../ui/TouchControls';
import { TutorialController } from '../tutorial/TutorialController';
import { TutorialStore } from '../tutorial/TutorialStore';
import { TutorialUI } from '../ui/TutorialUI';
import { CloudUI } from '../ui/CloudUI';
import { FeedbackScreen } from '../ui/FeedbackScreen';
import { Heatmap } from '../ui/Heatmap';
import { AboutScreen, BriefingScreen } from '../ui/InfoScreens';
import type {
  FinishExtra,
  GarageModel,
  HudState,
  CampaignSummary,
  LevelCardModel,
  UpgradeRow,
  VehicleCardModel,
} from '../ui/UI';
import { UI } from '../ui/UI';
import { Course } from '../world/Course';
import { nearestRiver } from '../world/Rivers';
import type { RiverNearest } from '../world/Rivers';
import { GameFlow } from './GameFlow';

/** Fixed physics step (s). Rendering interpolates between steps, so behaviour is frame-rate independent. */
export const PHYSICS_STEP = 1 / 120;
const MAX_STEPS_PER_FRAME = 10;

declare const __APP_VERSION__: string;
export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

export interface GameOptions {
  viewport: HTMLElement;
  uiHost: HTMLElement;
  store: SaveStore;
  debug: boolean;
  autodrive: boolean;
  /** Disable the adaptive resolution controller (deterministic screenshots / benchmarks). */
  fixedResolution: boolean;
  /** Resolves when the studio splash has finished; the main menu waits for it. */
  splash?: Promise<void>;
  /** Base URL of the app (for brand images). */
  base?: string;
  /** Overrides the build-time feedback configuration (tests). */
  feedback?: FeedbackConfig;
}

type MenuScreen = 'menu' | 'levels' | 'garage';

const nextFrame = (): Promise<void> =>
  new Promise((r) => {
    requestAnimationFrame(() => r());
    window.setTimeout(r, 60);
  });

const IDLE = createVehicleInput();
const MISSION_LABEL: Record<LevelDef['mission']['kind'], string> = {
  climb: 'Mountain run',
  airport: 'Airport transfer',
  hillclimb: 'Hill climb',
  city: 'City pickup',
  expedition: 'Remote expedition',
  tour: 'Scenic tour',
  descent: 'Storm descent',
  gorge: 'Cliff road',
  night: 'Night expedition',
  circuit: 'Closed-course event',
};

/**
 * Composition root. Owns the loop and wires input -> MissionRuntime (physics + rules) -> render/audio/UI.
 * Mission rules live in MissionRuntime and the gameplay modules; this class only coordinates.
 */
/** What the player is told as a weather front arrives (title, hint). */
const ZONE_NOTICE: Partial<Record<import('../data/types').WeatherKind, [string, string]>> = {
  clear: ['Clearer skies', 'A clearer road ahead'],
  cloudy: ['Wind is rising', 'Clouds are rolling in over the road'],
  rain: ['Rain on the road', 'Less grip: brake early'],
  heavyRain: ['Storm!', 'Heavy rain: puddles, runoff and long braking distances'],
  fog: ['Fog bank ahead', 'Slow down: less grip and less to see'],
  snow: ['Snow on the road', 'Frost and ice ahead: gentle throttle, early braking'],
  blizzard: ['Blizzard!', 'Wind and whiteout: slow right down and follow the posts'],
  denseFog: ['Dense fog', 'Almost nothing to see: crawl and follow the markers'],
};

export class Game {
  readonly flow = new GameFlow();
  readonly store: SaveStore;
  readonly ui: UI;
  readonly audio = new AudioEngine();
  readonly input: InputManager;
  readonly services: Services;
  readonly feedbackConfig: FeedbackConfig;
  readonly feedback: FeedbackScreen;
  readonly about: AboutScreen;
  readonly briefing: BriefingScreen;
  readonly analytics: NullAnalytics | MemoryAnalytics;
  /** Optional online layer: guest/account sign-in, cloud saves, leaderboards. The game never waits for it. */
  readonly cloud: CloudService;
  readonly privacy: PrivacyStore;
  readonly telemetry: Telemetry;
  readonly leaderboards: Leaderboards;
  readonly cloudUI: CloudUI;
  private readonly heatmap: Heatmap;
  private readonly incidentLog: IncidentLog;
  private readonly feedbackDrafts: DraftStore;
  private readonly feedbackSent: SentLog;
  private readonly feedbackTransport: FeedbackTransport;
  private readonly attempts = new Map<string, number>();
  /** Route 0 (Driver's Academy): its own small progress document, never part of the game save or the cloud. */
  readonly tutorialStore: TutorialStore;
  private readonly tutorialUI: TutorialUI;
  private academy: TutorialController | null = null;
  private academyOffered = false;
  /** The results screen waiting behind the arrival celebration (skippable). */
  /** Traffic vehicles that have already been heard passing the player. */
  private readonly heardPass = new Set<number>();
  private nextPassSound = 0;
  /** Index of the weather zone the run is in (-1 = the mission's own conditions) and the deadline warnings already shown. */
  private weatherZone = -1;
  private nextRiverCheck = 0;
  private readonly riverNear: RiverNearest = { d: Infinity, y: 0, river: -1 };
  private readonly urgencyShown = new Set<number>();
  private pendingFinish: { show: () => void; timer: number } | null = null;
  private stuckFor = 0;
  private stuckCooldown = 0;
  private fuelReported = false;

  private readonly levels = listLevels();
  private readonly vehicles = listVehicles();
  private renderer!: GameRenderer;
  private readonly rig = new CameraRig();
  private level!: LevelDef;
  /** The vehicle as sold (no upgrades). */
  private baseVehicle!: VehicleDef;
  /** The vehicle as driven: upgrades applied. */
  private vehicleDef!: VehicleDef;
  private loaner = false;
  private conditionIndex = 0;
  private course!: Course;
  private world: World3D | null = null;
  private rt!: MissionRuntime;
  private view: MissionView | null = null;
  private model: VehicleModel | null = null;
  private minimap!: MiniMap;
  private touch!: TouchControls;
  private nav!: MenuNav;
  private effects!: VehicleEffects;
  private snow = new Snow();
  private rain = new Rain();
  private ai: AutoDriver | MissionDriver | null = null;
  private autodriveOn = false;
  private adaptive: AdaptiveResolution | null = null;
  private menuScreen: MenuScreen = 'menu';
  /** The dedicated garage scene: created on first use, drawn instead of the world while the garage is open. */
  private garage: GarageScene | null = null;
  private freeGarage = false;
  private previewId = '';
  private inRun = false;
  /** Set when the run that just ended finished the last unfinished mission: the next Continue shows the campaign screen. */
  private pendingCampaign = false;

  private readonly cmd = createVehicleInput();
  private readonly head = { x: 0, z: -1 };
  private readonly camPos = new Vector3();
  private readonly hud: HudState = {
    speedKmh: 0,
    timerText: '',
    timerLabel: '',
    lowTime: false,
    checkpointsDone: 0,
    objective: '',
    objectiveKind: 'checkpoint',
    distance: null,
    progress: 0,
    comfort: null,
    fuel: 1,
    health: 100,
    driveMode: '4x2',
    canToggleDrive: false,
    onboard: 0,
    party: 0,
    conditions: '',
    service: null,
    prompt: '',
    rival: null,
    headlights: false,
    scaleMaxKmh: 120,
    rpm: 0.18,
    load: 0,
    shifting: false,
    engineWarn: false,
    alerts: [],
    telemetry: { fps: 60, surface: '', grade: 0, slip: 0, wet: 0, gear: 0 },
  };
  private readonly engineSim = new EngineSim({ engine: { gearTopSpeeds: [12, 20, 30], topSpeed: 30 } as VehicleDef['engine'] });
  private readonly roadPose = { x: 0, y: 0, z: 0, tx: 0, tz: -1 };
  private readonly roadPose2 = { x: 0, y: 0, z: 0, tx: 0, tz: -1 };
  private readonly comfortHud = {
    value: 100,
    quality: 'smooth' as 'smooth' | 'firm' | 'rough',
    cause: null as string | null,
  };
  private readonly driveSound = {
    speed: 0,
    topSpeed: 38,
    gearTopSpeeds: [] as number[],
    throttle: 0,
    braking: false,
    slip: 0,
    grounded: true,
    offRoad: false,
    dt: 0.016,
    loose: 0,
    wet: false,
    water: 0,
    surface: 'asphalt' as string,
    rpm: undefined as number | undefined,
    load: 0,
    shifting: false,
    overrun: false,
  };
  private acc = 0;
  private time = 0;
  private last = 0;
  private fpsEma = 60;
  private cpuMs = 0;
  private physicsMs = 0;
  private minimapTimer = 0;
  private debugTimer = 0;
  private lastSteps = 0;
  private touchDetected = false;
  private running = false;
  private loadingLevel = false;
  private rafId = 0;
  private lastProgress = 0;
  private warnCooldown = 0;
  private warnHold = 0;
  private flashLevel = 0;
  private serviceTick = 0;
  private issueCooldown = 0;

  constructor(private readonly opts: GameOptions) {
    this.store = opts.store;
    const base = opts.base ?? './';
    this.feedbackConfig =
      opts.feedback ?? readFeedbackConfig(import.meta.env as Record<string, string | boolean | undefined>);
    this.analytics = opts.debug ? new MemoryAnalytics() : new NullAnalytics();
    this.services = {
      identity: new LocalIdentity(),
      leaderboard: new LocalLeaderboard(() => this.store.data),
      analytics: this.analytics,
    };
    const storage = openBrowserStorage();
    const cloudConfig = readCloudConfig();
    const params = new URLSearchParams(location.search);
    // ?cloud=off switches every online feature off for this page load (used by the automated tests, never the live project).
    const backend = cloudConfig.enabled && params.get('cloud') !== 'off' ? new FirebaseBackend(cloudConfig) : null;
    this.cloud = new CloudService({ backend, store: this.store, meta: new CloudMetaStore(storage), appVersion: APP_VERSION });
    this.privacy = new PrivacyStore(storage);
    this.incidentLog = new IncidentLog(storage);
    this.telemetry = new Telemetry({
      privacy: this.privacy,
      incidents: this.incidentLog,
      backend: () => this.cloud.backendRef,
      uid: () => this.cloud.uid,
      context: () => ({
        appVersion: APP_VERSION,
        platform: platformOf(window),
        qualityTier: this.store.settings.quality,
        perfTier: perfTierOf(navigator.hardwareConcurrency, (navigator as Navigator & { deviceMemory?: number }).deviceMemory, this.store.settings.quality),
      }),
    });
    this.leaderboards = new Leaderboards(this.cloud, this.store, storage, APP_VERSION);
    this.feedbackDrafts = new DraftStore(storage);
    this.feedbackSent = new SentLog(storage);
    this.feedbackTransport = backend ? new FirestoreFeedbackTransport(this.cloud) : createTransport(this.feedbackConfig);
    this.ui = new UI(
      opts.uiHost,
      {
        openLevels: () => this.openLevels(),
        openAcademy: () => void this.startAcademy(),
        openGarageFree: () => this.openGarageFree(),
        chooseLevel: (id) => void this.chooseLevel(id),
        previewVehicle: (id) => this.previewVehicle(id),
        startMission: () => this.startMission(),
        back: () => this.back(),
        resume: () => this.resume(),
        restart: () => this.restart(),
        quit: () => this.quitToMenu(),
        openGarage: () => this.openGarageFromRun(),
        nextMission: () => void this.nextMission(),
        campaignContinue: () => this.openLevels(),
        pause: () => this.pause(),
        recover: () => this.recover(),
        settingsChanged: (p) => this.applySettings(p),
        buyVehicle: (id) => this.buyVehicle(id),
        buyUpgrade: (v, u) => this.buyUpgrade(v, u as UpgradeId),
        setConditions: (i) => this.setConditions(i),
        garageView: (c) => {
          if (c.orbit) this.garage?.orbit(c.orbit[0], c.orbit[1]);
          if (c.zoom) this.garage?.zoom(c.zoom);
          if (c.turn) this.garage?.turn(c.turn);
          if (c.reset) this.garage?.resetView();
        },
        readBriefing: () => this.readBriefing(),
        toggleDrive: () => this.toggleDrive(),
        requestService: (k) => this.requestService(k),
        openAbout: () => this.openAbout(),
        openFeedback: (o) => this.openFeedback(o),
        openBoard: (id) => this.cloudUI.openBoard(id),
        click: (back) => this.audio.click(back),
      },
      opts.store.settings,
      base,
    );
    const click = (back?: boolean): void => this.audio.click(back);
    this.about = new AboutScreen(
      { host: opts.uiHost, click, onClose: () => this.afterOverlay() },
      { version: APP_VERSION, base, feedbackIsRemote: !!this.feedbackConfig.endpoint || !!backend },
    );
    this.about.onFeedback(() => this.openFeedback('about'));
    this.briefing = new BriefingScreen({ host: opts.uiHost, click, onClose: () => undefined });
    this.tutorialStore = new TutorialStore(storage as unknown as Storage | null);
    this.tutorialUI = new TutorialUI(opts.uiHost, {
      ok: () => {
        this.audio.click();
        this.academy?.dismissCard();
      },
      retry: () => {
        this.audio.click();
        this.academy?.retryLesson();
      },
      replay: () => {
        this.audio.click();
        this.academy?.replayTip();
      },
      skip: () => {
        this.audio.click();
        this.academy?.skipLesson();
      },
      finish: () => void this.academyFinish(),
    });
    this.feedback = new FeedbackScreen({
      host: opts.uiHost,
      appVersion: APP_VERSION,
      config: this.feedbackConfig,
      transport: this.feedbackTransport,
      drafts: this.feedbackDrafts,
      sent: this.feedbackSent,
      onSent: (rating) => this.telemetry.track({ name: 'feedback_submitted', rating }),
      quality: () => this.store.settings.quality,
      click,
      onClose: () => this.afterOverlay(),
    });
    this.heatmap = new Heatmap(opts.uiHost, this.incidentLog, () => this.afterOverlay());
    this.cloudUI = new CloudUI({
      host: opts.uiHost,
      cloud: this.cloud,
      leaderboards: this.leaderboards,
      privacy: this.privacy,
      store: this.store,
      drafts: this.feedbackDrafts,
      sent: this.feedbackSent,
      levels: () => this.levels.map((l) => ({ id: l.id, name: l.name })),
      vehicleName: (id) => getVehicle(id).name,
      dev: params.has('dev'),
      click,
      onOpenFeedback: () => this.openFeedback('menu'),
      onOpenHeatmap: () => this.heatmap.open(),
      onOpenPrivacy: () => this.ui.openSettingsTab(this.flow.state === 'menu' ? 'menu' : 'pause', 'privacy'),
      onClose: () => this.afterOverlay(),
    });
    this.input = new InputManager(window);
    if (params.has('dev')) this.addDeveloperReset();
  }

  /** Only with ?dev=1: a clearly labelled, confirmed button in Settings that starts a brand-new player. */
  private addDeveloperReset(): void {
    const anchor = this.opts.uiHost.querySelector('#btn-settings-feedback');
    const row = anchor?.parentElement;
    if (!row) return;
    const b = document.createElement('button');
    b.className = 'btn ghost';
    b.type = 'button';
    b.id = 'btn-dev-reset';
    b.innerHTML = '<span>Developer: reset to a new player</span>';
    b.addEventListener('click', () => {
      const ok = window.confirm(
        'Developer reset: this clears medals, credits, vehicles, upgrades, records and the tutorial on THIS device. Settings, other storage and your sign-in are kept, and nothing online is changed. Continue?',
      );
      if (!ok) return;
      (this.opts.uiHost.querySelector('#btn-settings-back') as HTMLElement | null)?.click();
      void this.resetProgress();
    });
    row.appendChild(b);
  }

  async init(): Promise<void> {
    const { ui, opts } = this;
    ui.showLoading('Surveying the pass...', 0.08);
    await nextFrame();

    this.renderer = new GameRenderer(opts.viewport, this.store.settings.quality);
    this.renderer.onContextLost = () =>
      ui.showError(
        'Graphics paused',
        'The browser reset the graphics context (this can happen when the device is low on memory).',
        '',
        true,
      );
    this.renderer.scene.add(this.snow.points, this.rain.lines);
    this.effects = new VehicleEffects();
    this.renderer.scene.add(this.effects.particles.points, this.effects.skids.mesh);
    this.minimap = new MiniMap(ui.minimapCanvas);
    this.touch = new TouchControls(this.input.touch);
    opts.uiHost.appendChild(this.touch.el);
    this.touch.setLayout(this.store.settings.touchSteer, this.store.settings.touchMirror, this.store.settings.touchLarge);
    this.nav = new MenuNav(opts.uiHost, () => this.ui.menuActive && this.flow.state !== 'playing');

    const sel = resolveSelection(
      this.store.selection,
      this.levels,
      this.vehicles,
      this.store.progress,
      this.store.garage.owned,
    );
    this.level = sel.level;
    this.autodriveOn = opts.autodrive;
    ui.showLoading(`Loading ${sel.level.name}...`, 0.3);
    await this.loadLevel(sel.level);
    ui.showLoading('Fuelling the tour car...', 0.85);
    // Fetch the selected vehicle's model (with a time limit) and warm the others in the background.
    const first = loadVehicleAsset(sel.vehicle.id);
    for (const v of this.vehicles) void loadVehicleAsset(v.id);
    await Promise.race([first, new Promise((r) => window.setTimeout(r, 4000))]);
    await nextFrame();
    this.pickVehicle(sel.vehicle);

    this.touchDetected = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    this.bindEvents();
    this.applySettings({}, true);
    if (!opts.fixedResolution) {
      const target = this.store.settings.quality === 'low' ? 30 : 45;
      this.adaptive = new AdaptiveResolution(target);
    }

    this.running = true;
    this.last = performance.now();
    this.rafId = requestAnimationFrame(this.frame);
    ui.hideLoading();
    await (opts.splash ?? Promise.resolve());
    this.last = performance.now();
    this.showMenu();
    this.audio.brandSting();
    // Connect after the menu is up and the page is idle: the online layer is an extra, never part of start-up.
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    if (idle) idle.call(window, () => this.startCloud(), { timeout: 3000 });
    else window.setTimeout(() => this.startCloud(), 1500);
    if (this.store.migrated)
      ui.toast(
        'Progress from the previous version was carried over, with a few credits as thanks.',
        undefined,
        undefined,
        7000,
      );
  }

  /** Connects the optional online layer in the background. Failure leaves the offline game exactly as it was. */
  private startCloud(): void {
    this.cloudUI.mountPrivacy(this.ui.privacyPane);
    this.cloudUI.renderMenuSlot(this.ui.menuCloudSlot);
    this.cloud.onStatus((st) => {
      if (this.flow.state === 'menu') this.cloudUI.renderMenuSlot(this.ui.menuCloudSlot);
      if (st.sync === 'conflict' && this.flow.state === 'menu') this.cloudUI.maybeShowConflict();
      if (st.user) void this.flushFeedback();
    });
    this.cloud.onNotice((text) => this.ui.toast(text, undefined, undefined, 5000));
    this.cloud.onOnline(() => void this.flushFeedback());
    this.privacy.onChange(() => this.cloudUI.renderMenuSlot(this.ui.menuCloudSlot));
    this.cloud.start();
    this.telemetry.track({
      name: 'game_session_started',
      platform: platformOf(window),
      qualityTier: this.store.settings.quality,
      perfTier: perfTierOf(navigator.hardwareConcurrency, (navigator as Navigator & { deviceMemory?: number }).deviceMemory, this.store.settings.quality),
    });
  }

  /** Sends feedback that was written while offline. Safe to call at any time: it only acts on queued copies. */
  private async flushFeedback(): Promise<void> {
    if (!this.feedbackTransport.delivers || !this.feedbackDrafts.pending().length) return;
    await flushFeedbackOutbox(this.feedbackDrafts, this.feedbackTransport, this.feedbackSent);
  }

  /** A driving incident for the on-device log and, with consent, the statistics summary. */
  private incident(type: IncidentType, severity: Severity = 'low'): void {
    // Training drives are not part of the statistics.
    if (!this.inRun || !this.rt || this.level.id === ACADEMY_ID) return;
    this.telemetry.track({
      name: 'incident',
      type,
      levelId: this.level.id,
      at: routeFraction(this.rt.s, this.course.startS, this.course.finishS),
      vehicleId: this.vehicleDef.id,
      severity,
    });
  }

  /** The player leaves a mission that is still being driven (quit, restart, change vehicle). */
  private noteAbandon(): void {
    if (!this.inRun || !this.rt || this.level.id === ACADEMY_ID || this.rt.session.phase !== 'running') return;
    this.incident('abandoned', 'low');
    this.telemetry.track({ name: 'mission_failed', levelId: this.level.id, vehicleId: this.vehicleDef.id, reason: 'abandoned', seconds: Math.round(this.rt.session.time) });
  }

  // ------------------------------------------------------------------ level / vehicle assets

  private disposeLevel(): void {
    this.disposeRuntime();
    this.world?.dispose();
    this.world = null;
    this.effects?.reset();
  }

  private disposeRuntime(): void {
    this.view?.dispose();
    this.view = null;
    this.rt?.dispose();
  }

  private async loadLevel(def: LevelDef): Promise<void> {
    if (this.level?.id === def.id && this.world) return;
    this.loadingLevel = true;
    this.ui.showLoading(`Loading ${def.name}...`, 0.4);
    await nextFrame();
    this.disposeLevel();
    this.level = def;
    this.conditionIndex = 0;
    this.course = new Course(def);
    await Promise.race([loadEnvKit(), new Promise((r) => window.setTimeout(r, 5000))]);
    await nextFrame();
    this.world = new World3D(this.renderer.scene, this.course, this.renderer.profile);
    this.minimap.setCourse(this.course);
    this.ui.setRoute(
      def.checkpoints.map((c) => c.at),
      def.stops.map((s) => ({ at: s.at, kind: s.kind === 'dropoff' ? ('pickup' as const) : s.kind })),
    );
    this.loadingLevel = false;
    this.ui.hideLoading();
    this.applyConditions();
  }

  /** The vehicle as it will be driven: upgrades apply only to vehicles the player owns (a loaner is stock). */
  private effective(base: VehicleDef): VehicleDef {
    return this.store.isOwned(base.id) && !this.loaner
      ? applyUpgrades(base, this.store.upgradeLevels(base.id))
      : base;
  }

  private quality() {
    return this.renderer.profile;
  }

  /** Builds the idle mission object used behind menus and the garage: the car and stops only. */
  private buildPreview(): void {
    this.disposeRuntime();
    this.rt = new MissionRuntime(this.course, this.level, {
      vehicle: this.vehicleDef,
      conditions: this.conditionIndex,
      traffic: false,
      hazards: false,
      rival: false,
    });
    this.acc = 0;
    this.effects?.reset();
    this.model?.sync(this.rt.body, 1, this.course);
  }

  /** Builds the real mission: hazards, traffic, rival, and their views. */
  private buildRun(): void {
    this.disposeRuntime();
    this.rt = new MissionRuntime(this.course, this.level, {
      vehicle: this.vehicleDef,
      conditions: this.conditionIndex,
      traffic: true,
      hazards: true,
      rival: true,
      trafficScale: this.quality().trafficScale,
    });
    this.view = new MissionView(this.renderer.scene, this.rt, clamp(this.quality().trafficScale, 0.3, 1));
    this.wireRuntime(this.rt);
    this.acc = 0;
    this.effects.reset();
    this.model?.sync(this.rt.body, 1, this.course);
  }

  /** Swaps the model + audio + camera for a vehicle and rebuilds the preview runtime. */
  private pickVehicle(base: VehicleDef, loaner = false): void {
    this.loaner = loaner;
    this.baseVehicle = base;
    this.vehicleDef = this.effective(base);
    this.previewId = base.id;
    if (this.model) {
      this.renderer.scene.remove(this.model.root, this.model.blob);
      this.model.dispose();
    }
    this.model = new VehicleModel(this.vehicleDef, peekVehicleAsset(base.id));
    if (!this.model.detailed) {
      // The glTF model is still on its way (or missing): show the procedural one now and swap when it arrives,
      // but only while the player is in a menu so a run is never disturbed.
      void loadVehicleAsset(base.id).then((a) => {
        if (a && this.baseVehicle.id === base.id && !this.model?.detailed && this.flow.state === 'menu') this.pickVehicle(this.baseVehicle, this.loaner);
      });
    }
    this.renderer.scene.add(this.model.root, this.model.blob);
    this.model.setBlobVisible(!this.renderer.profile.shadows);
    this.model.setLowDetail(this.renderer.profile.terrainCoarse);
    this.rig.setVehicle(this.vehicleDef);
    this.audio.setVehicle(this.vehicleDef.audio, this.vehicleDef.id);
    this.engineSim.setVehicle(this.vehicleDef);
    this.effects?.setVehicle(this.vehicleDef);
    this.driveSound.topSpeed = this.vehicleDef.engine.topSpeed;
    this.driveSound.gearTopSpeeds = this.vehicleDef.engine.gearTopSpeeds;
    if (this.garage) this.garage.setVehicle(this.vehicleDef, peekVehicleAsset(base.id));
    this.buildPreview();
    this.applyConditions();
    this.rig.snap();
  }

  /** Weather and time of day for the selected conditions, on the world, the particles and the sound. */
  private applyConditions(smooth = false): void {
    if (!this.world) return;
    const c = this.academy || (this.inRun && this.level.weatherZones && this.weatherZone >= 0) ? this.rt.conditions : this.level.conditions[Math.min(this.conditionIndex, this.level.conditions.length - 1)];
    this.world.setConditions(c.weather, c.time, smooth);
    this.model?.setHeadlights(this.world.env.lightsOn);
    this.model?.setReflection(this.world.env.brightness);
    const q = this.quality();
    const snowing = this.level.weather === 'snow' || WEATHER[c.weather].snow;
    this.snow.setCount(snowing ? q.snowCount : 0, this.renderer.renderer.getPixelRatio());
    this.rain.setIntensity(WEATHER[c.weather].rain, q.rainDrops);
    this.audio.setAmbient({
      wind: snowing ? 0.9 : 0.4,
      birds: c.weather === 'clear' || c.weather === 'cloudy' || !!this.level.roadside?.birds,
      aircraft: this.level.mission.kind === 'airport',
      night: c.time === 'night',
      water: !!this.level.ford || !!this.level.rivers?.length || this.level.terrain.valleyDepth > 0,
      forest: clamp(this.level.scenery.trees / 700, 0, 1),
      bells: this.level.region !== undefined && c.time !== 'night' && this.level.mission.kind !== 'circuit',
      city: this.level.traffic?.controls ? 0.7 : 0,
      rural: this.level.rivers?.length && this.level.roadside?.yaks?.length ? 0.8 : 0,
      fog: c.weather === 'denseFog' ? 1 : c.weather === 'fog' ? 0.8 : c.weather === 'snow' ? 0.3 : 0,
    });
    this.audio.setWeather(WEATHER[c.weather].rain, WEATHER[c.weather].wind / 4);
  }

  // ------------------------------------------------------------------ runtime events

  private wireRuntime(rt: MissionRuntime): void {
    const { ui, audio } = this;
    const level = this.level;
    const e = rt.events;
    e.on('countdown', (n) => {
      ui.setCountdown(String(n));
      audio.countdown(n);
    });
    e.on('go', () => {
      ui.setCountdown('GO!');
      audio.go();
      window.setTimeout(() => ui.setCountdown(null), 700);
      ui.clearDispatchSoon(3200);
    });
    e.on('checkpoint', ({ index, split }) => {
      if (level.id === ACADEMY_ID) {
        this.world?.gates.setNext(index + 1);
        return;
      }
      ui.flash(
        `Checkpoint ${index + 1}/${level.checkpoints.length}`,
        `${level.checkpoints[index].label} - ${split.toFixed(1)}s`,
      );
      this.world?.gates.setNext(index + 1);
      audio.checkpoint();
      this.analytics.track({ name: 'checkpoint', levelId: level.id, index });
    });
    e.on('boarded', ({ stop, party, onboard }) => {
      const cast = getCast(stop.def.who ?? '');
      ui.flash(
        `${party} guest${party === 1 ? '' : 's'} aboard`,
        stop.def.line ? `${cast ? `${cast.name}: ` : ''}"${stop.def.line}"` : cast ? `${cast.name}: "${cast.line}"` : `${onboard} on board`,
      );
      audio.pickup();
      this.analytics.track({ name: 'pickup', levelId: level.id, stopId: stop.def.id });
    });
    e.on('alighted', ({ stop, party }) => {
      const cast = getCast(stop.def.who ?? '');
      ui.flash(`${party} guest${party === 1 ? '' : 's'} dropped off`, stop.def.farewell ? `${cast ? `${cast.name}: ` : ''}"${stop.def.farewell}"` : cast ? `${cast.name}: "Thank you!"` : 'Have a lovely visit');
      audio.pickup();
    });
    // The city: horns, the officer's whistle, and what happens when the player ignores a signal or a crossing.
    const tr = rt.traffic;
    if (tr) {
      tr.events.on('honk', (car) => {
        const d = Math.hypot(car.x - rt.body.position.x, car.z - rt.body.position.z);
        const heavy = car.kind === 'bus' || car.kind === 'truck' || car.kind === 'minibus' || car.kind === 'delivery' || car.kind === 'tractor' || car.kind === 'plough';
        const light = car.kind === 'moto' || car.kind === 'scooter';
        audio.honk(clamp(1 - d / 110, 0, 1), heavy ? 0.72 : light ? 1.45 : 1, Math.random() < 0.3);
      });
      tr.events.on('phase', (ctl) => {
        const d = Math.abs(rt.s - ctl.s);
        if (ctl.kind === 'police' && d < 90) audio.whistle(clamp(1 - d / 90, 0, 1));
      });
      tr.events.on('violation', (ctl) => {
        if (ctl.kind === 'bridge') ui.flash('One-lane bridge: wait for green!', 'Traffic is coming the other way');
        else ui.flash('Police: wait for the signal!', 'Cross traffic has the road');
        audio.whistle(1);
        if (rt.session.comfort) rt.session.comfort.value = Math.max(0, rt.session.comfort.value - 10);
      });
      tr.events.on('yieldPedestrians', () => {
        ui.flash('Give way to pedestrians', 'Slow down at the crossing');
        if (rt.session.comfort) rt.session.comfort.value = Math.max(0, rt.session.comfort.value - 6);
      });
    }
    e.on('missed', () =>
      ui.toast(
        'You drove past the pickup. Turn back and stop in the yellow zone.',
        undefined,
        undefined,
        5000,
      ),
    );
    e.on('serviceStart', ({ kind }) => {
      ui.flash(kind === 'refuel' ? 'Refuelling...' : 'Repairing...', 'Stay stopped until it finishes');
    });
    e.on('serviceDone', ({ kind }) => {
      ui.flash(kind === 'refuel' ? 'Tank full' : 'Good as new', 'Back on the road');
      audio.serviceDone();
      this.analytics.track({ name: 'service', levelId: level.id, kind });
    });
    e.on('issue', (issue) => this.onIssue(issue));
    e.on('hazard', ({ type, hazard }) => {
      if (type === 'warn') this.incident('hazard', 'medium');
      if (type === 'warn') ui.flash('Look out!', hazard.def.label);
      else if (type === 'land') audio.rockfall();
      else if (type === 'appear') audio.yeti();
    });
    e.on('thunder', ({ flash }) => {
      this.flashLevel = Math.max(this.flashLevel, flash);
      audio.thunder();
    });
    e.on('impact', ({ speed }) => {
      if (speed >= 4) this.incident('collision', severityFor(speed));
      audio.crash(speed);
      this.rig.kick(clamp(speed / 25, 0.05, 0.6));
      const p = this.rt.body.position;
      this.effects.impact(p.x, p.y - 0.4, p.z, speed);
    });
    e.on('recovered', () => {
      this.incident('recovered', 'low');
      this.effects.reset();
      this.rig.snap();
      this.touch.reset();
      ui.flash('Back on the road', 'Recovered to the last safe point');
    });
    e.on('finish', (r) => this.endRun(r));
    e.on('timeout', (r) => this.endRun(r));
  }

  private onIssue(issue: string): void {
    if (this.issueCooldown > 0 && issue !== 'outOfFuel' && issue !== 'flooded') return;
    this.issueCooldown = 4;
    const { ui, audio } = this;
    switch (issue) {
      case 'lowFuel':
        ui.toast(
          'Fuel is low. Pull into a pit stop and press E (or tap Refuel) while stopped.',
          undefined,
          undefined,
          5000,
        );
        audio.warning();
        break;
      case 'outOfFuel':
        if (!this.fuelReported) {
          this.fuelReported = true;
          this.incident('fuel_exhausted', 'high');
        }
        ui.flash('Out of fuel!', 'Limp to a pit stop - the engine has almost no power');
        audio.stall();
        break;
      case 'damaged':
        ui.toast('Your vehicle is damaged. A repair stop will fix it.', undefined, undefined, 4500);
        audio.warning();
        break;
      case 'critical':
        ui.flash('Vehicle badly damaged', 'It may stall. Drive gently or repair');
        audio.warning();
        break;
      case 'stalled':
        ui.flash('Engine stalled', 'Wait a moment...');
        audio.stall();
        break;
      case 'flooded':
        ui.flash('Water too deep!', 'Ease off - this vehicle cannot ford it');
        audio.stall();
        break;
    }
  }

  // ------------------------------------------------------------------ wiring

  private bindEvents(): void {
    this.input.events.on('pause', () => {
      if (this.closeOverlay()) return;
      if (this.flow.state === 'playing' && this.rt.session.isActive) this.pause();
      else if (this.flow.state === 'paused' && !this.ui.settingsOpen) this.resume();
      else if (this.flow.state === 'menu' && !this.ui.settingsOpen) this.nav.back();
    });
    this.input.events.on('recover', () => this.recover());
    this.input.events.on('restart', () => {
      if (this.flow.state === 'playing' || this.flow.state === 'paused' || this.flow.state === 'finished')
        this.restart();
    });
    this.input.events.on('driveMode', () => this.toggleDrive());
    this.input.events.on('service', () => this.requestService(null));
    this.input.events.on('debug', () => this.ui.setDebug(this.ui.debugVisible ? null : ''));
    this.input.events.on('gesture', () => {
      this.audio.unlock();
      this.audio.setLevels(this.store.settings);
      if (this.store.settings.musicVolume > 0) this.audio.startMusic();
    });
    this.input.onKeyboardUsed = () => {
      if (this.touchDetected && this.store.settings.touchControls === 'auto') {
        this.touchDetected = false;
        this.updateTouch();
      }
    };
    window.addEventListener('pointerdown', this.onTouchDetected, { passive: true });
    window.addEventListener('resize', this.onResize);
    window.addEventListener('orientationchange', this.onResize);
    // Never leave a control "stuck" when the app loses focus or a touch is interrupted.
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  private readonly onTouchDetected = (e: PointerEvent): void => {
    if (e.pointerType === 'touch' && !this.touchDetected) {
      this.touchDetected = true;
      this.updateTouch();
    }
  };
  private readonly onBlur = (): void => this.cancelInput();
  private readonly onVisibility = (): void => {
    if (document.hidden) {
      this.cancelInput();
      if (this.flow.state === 'playing' && this.rt.session.isActive) this.pause();
    }
  };

  /** Escape closes the front-most overlay (feedback, then about, then the story card). Returns true if one was open. */
  private closeOverlay(): boolean {
    if (this.feedback.isOpen) this.feedback.close();
    else if (this.heatmap.isOpen) this.heatmap.close();
    else if (this.cloudUI.closeTop()) return true;
    else if (this.about.isOpen) this.about.close();
    else if (this.briefing.isOpen) this.briefing.skip();
    else return false;
    this.audio.click(true);
    return true;
  }

  /** After About / Feedback closes, give focus back to whatever screen is underneath. */
  private afterOverlay(): void {
    const s = this.flow.state;
    if (s === 'finished') (document.querySelector('#btn-finish-feedback') as HTMLElement | null)?.focus();
    else if (this.ui.settingsOpen)
      (document.querySelector('#btn-settings-about') as HTMLElement | null)?.focus();
    else if (s === 'menu')
      (document.querySelector('#screen-menu:not([hidden]) #btn-menu-profile, #screen-menu:not([hidden]) #btn-credit') as HTMLElement | null)?.focus();
  }

  private openAbout(): void {
    this.about.open();
  }

  private openFeedback(origin: FeedbackPayload['origin']): void {
    this.feedback.open(origin);
  }

  private cancelInput(): void {
    this.touch.reset();
    this.input.pressed.clear();
    this.cmd.steer = this.cmd.throttle = this.cmd.brake = 0;
  }

  private readonly onResize = (): void => {
    const { width, height } = this.renderer.applySize();
    this.rig.resize(width, height);
    this.garage?.resize(width, height);
    this.syncPixelRatio();
  };

  private syncPixelRatio(): void {
    const pr = this.renderer.renderer.getPixelRatio();
    this.effects.particles.setPixelRatio(pr);
    this.applyConditions();
  }

  private get reducedMotion(): boolean {
    return (
      this.store.settings.reducedMotion ||
      (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)
    );
  }

  private applySettings(patch: Partial<Settings>, initial = false): void {
    const before = this.store.settings.quality;
    const s = Object.keys(patch).length ? this.store.updateSettings(patch) : this.store.settings;
    this.audio.setLevels(s);
    if (initial || s.quality !== before) {
      const q = QUALITY[s.quality];
      this.renderer.setQuality(s.quality);
      this.world?.applyQuality(q);
      this.model?.setBlobVisible(!q.shadows);
      this.model?.setLowDetail(q.terrainCoarse);
      this.rig.setFar(q.cameraFar);
      this.effects.particles.density = q.particleDensity;
      this.effects.skids.mesh.visible = q.skidMarks;
      this.adaptive = this.opts.fixedResolution
        ? null
        : new AdaptiveResolution(s.quality === 'low' ? 30 : 45);
      this.renderer.setResolutionScale(1);
      this.onResize();
    }
    if (patch.musicVolume !== undefined) {
      if (s.musicVolume > 0) this.audio.startMusic();
      else this.audio.stopMusic();
    }
    if (!initial && patch.quality !== undefined) this.telemetry.track({ name: 'setting_changed', key: 'quality', value: s.quality });
    if (!initial && patch.hudMode !== undefined) this.telemetry.track({ name: 'setting_changed', key: 'hudMode', value: s.hudMode });
    this.touch.setSensitivity(s.touchSensitivity);
    this.touch.setLayout(s.touchSteer, s.touchMirror, s.touchLarge);
    this.ui.setHudMode(s.hudMode);
    document.body.classList.toggle('reduce-motion', this.reducedMotion);
    this.updateTouch();
    this.ui.syncSettings(s);
  }

  private touchWanted(): boolean {
    const mode = this.store.settings.touchControls;
    return mode === 'on' || (mode === 'auto' && this.touchDetected);
  }

  private updateTouch(): void {
    const wanted = this.touchWanted();
    document.body.classList.toggle('touch', wanted);
    this.tutorialUI.setTouch(wanted);
    if (wanted) this.ui.showRotateHint();
    this.rig.shakeScale = this.reducedMotion ? 0.12 : wanted ? 0.6 : 1;
    this.touch.setVisible(wanted && this.flow.state === 'playing');
  }

  // ------------------------------------------------------------------ menus / selection

  private progress() {
    return this.store.progress;
  }

  private levelCards(): LevelCardModel[] {
    const next = nextUnplayed(this.levels, this.progress())?.id ?? null;
    return this.levels.map((l) => {
      const rec = this.store.levelRecord(l.id);
      const locked = !isLevelUnlocked(l, this.progress());
      let best: number | null = null;
      for (const v of Object.values(rec.vehicles))
        if (v.bestTime !== null && (best === null || v.bestTime < best)) best = v.bestTime;
      return {
        id: l.id,
        name: l.name,
        subtitle: l.subtitle,
        difficulty: l.difficulty,
        missionLabel: MISSION_LABEL[l.mission.kind] + (l.mission.comfort ? ' · passenger comfort' : ''),
        locked,
        lockText: l.unlock ? describeRule(l.unlock, this.levels) : '',
        medal: rec.medal,
        bestTime: best,
        isNew: !locked && rec.completions === 0 && l.unlock !== null,
        vehicleNames: l.vehicles.map((id) => getVehicle(id).name),
        selected: l.id === this.level.id,
        reward: l.reward,
        region: l.region,
        recommended: getVehicle(l.vehicles[0]).name,
        challenge: challengeTags(l).join(' · '),
        isNext: l.id === next,
      };
    });
  }

  private upgradeRows(v: VehicleDef): UpgradeRow[] {
    const levels = this.store.upgradeLevels(v.id);
    return v.upgrades.map((id) => {
      const def = UPGRADES[id];
      const lvl = Math.min(MAX_UPGRADE_LEVEL, levels[id] ?? 0);
      const cost = nextUpgradeCost(v, levels, id);
      return {
        id,
        name: def.name,
        blurb: def.blurb,
        level: lvl,
        max: MAX_UPGRADE_LEVEL,
        nextCost: cost,
        nextEffect: cost === null ? null : `Next: ${def.levels[lvl].effect}`,
        canBuy: cost !== null && this.store.credits >= cost,
        preview: upgradePreview(v, levels, id),
      };
    });
  }

  private garageModel(): GarageModel {
    const l = this.freeGarage ? null : this.level;
    const owned = this.store.garage.owned;
    const loanerId =
      l && !availableVehicles(l, this.vehicles, owned).length
        ? l.vehicles.find((id) => canUseVehicle(l, id, this.vehicles))
        : undefined;
    return {
      level: l
        ? {
            name: l.name,
            objective: l.objective,
            tip: l.tip,
            comfort: l.mission.comfort,
            deadline: l.mission.timerStyle === 'deadline',
            party: l.mission.party,
            hasStory: getStory(l.id) !== null,
          }
        : null,
      credits: this.store.credits,
      index: Math.max(
        0,
        this.vehicles.findIndex((v) => v.id === this.baseVehicle.id),
      ),
      conditions: l ? l.conditions.map((c) => ({ label: conditionsLabel(c), bonus: c.bonus })) : [],
      conditionIndex: this.conditionIndex,
      vehicles: this.vehicles.map((v): VehicleCardModel => {
        const state = vehicleOwnership(v, this.progress(), owned);
        const isLoaner = v.id === loanerId;
        const eligible = !l || canUseVehicle(l, v.id, this.vehicles);
        let reason = '';
        if (l && !eligible) {
          reason = !l.vehicles.includes(v.id)
            ? 'Not allowed on this mission'
            : `Too small: this mission carries ${l.mission.party} guests and it has ${v.capacity} seats`;
        }
        const eff = state === 'owned' ? applyUpgrades(v, this.store.upgradeLevels(v.id)) : v;
        const rec = l ? this.store.vehicleRecord(l.id, v.id) : null;
        return {
          id: v.id,
          name: v.name,
          blurb: v.blurb,
          tier: v.tier,
          stats: vehicleStats(eff),
          state,
          price: v.price,
          lockText: v.unlock ? describeRule(v.unlock, this.levels) : '',
          loaner: isLoaner,
          eligible,
          reason,
          capacity: v.capacity,
          drivetrain: v.drivetrain.modes.length > 1 ? '4x2 / 4x4' : v.drivetrain.default,
          rangeKm: eff.fuel.rangeKm,
          best:
            rec && rec.completions > 0
              ? { time: rec.bestTime, medal: rec.medal, comfort: rec.bestComfort }
              : null,
          targets: l ? levelTimes(l, paceFor(l, eff)) : null,
          canBuy: canBuyVehicle(v, this.progress(), owned, this.store.credits),
          upgrades: state === 'owned' ? this.upgradeRows(v) : [],
        };
      }),
    };
  }

  private refreshGarage(): void {
    if (this.menuScreen === 'garage') this.ui.updateGarage(this.garageModel());
  }

  private showMenu(): void {
    this.menuScreen = 'menu';
    this.freeGarage = false;
    this.ui.hideHud();
    this.ui.hidePause();
    this.ui.hideFinish();
    const done = this.levels.filter((l) => this.store.levelRecord(l.id).completions > 0).length;
    const medals = { gold: 0, silver: 0, bronze: 0 };
    for (const l of this.levels) {
      const m = this.store.levelRecord(l.id).medal;
      if (m !== 'none') medals[m]++;
    }
    const last = this.store.data.history.at(-1);
    const lastLevel = last ? this.levels.find((l) => l.id === last.levelId) : null;
    this.ui.showMenu({
      missions: `${done} of ${this.levels.length} missions completed`,
      medals: `${medals.gold} gold · ${medals.silver} silver · ${medals.bronze} bronze`,
      lastPlayed: lastLevel ? `Last drive: ${lastLevel.name}` : 'Choose a mission and a vehicle to begin',
      credits: this.store.credits,
    });
    this.input.captureKeys = false;
    this.audio.setDriving(false);
    this.touch.setVisible(false);
    this.rig.setShowcase(false);
    this.rig.orbit = true;
    this.rig.intro = 0;
  }

  private hasAnyProgress(): boolean {
    return this.store.data.history.length > 0 || this.levels.some((l) => this.store.levelRecord(l.id).completions > 0);
  }

  private openLevels(): void {
    // A brand-new player is offered the Driver's Academy once, automatically; "Skip for now" is remembered.
    if (!this.academyOffered && this.tutorialStore.shouldOffer(this.hasAnyProgress())) {
      this.academyOffered = true;
      this.tutorialUI.showWelcome(
        () => void this.startAcademy(),
        () => {
          this.tutorialStore.markSkipped();
          this.openLevels();
        },
      );
      return;
    }
    this.menuScreen = 'levels';
    this.freeGarage = false;
    this.showLevelsScreen();
    this.audio.whoosh();
  }

  private openGarageFree(): void {
    this.freeGarage = true;
    const owned = this.vehicles.filter((v) => this.store.isOwned(v.id));
    const keep = owned.find((v) => v.id === this.baseVehicle.id) ?? owned[0] ?? this.vehicles[0];
    this.pickVehicle(keep);
    this.openGarageScreen();
  }

  /** Route 0: always the stock Druk Ranger on loan (4x4 capable), no garage, no briefing, no rewards. */
  private async startAcademy(): Promise<void> {
    if (this.loadingLevel) return;
    this.tutorialUI.hideModal();
    this.freeGarage = false;
    this.menuScreen = 'levels';
    await this.loadLevel(getAcademy());
    this.conditionIndex = 0;
    this.pickVehicle(getVehicle('druk-ranger'), true);
    this.beginRun();
  }

  /** Puts the world and car back to the player's selected mission after leaving the Academy. */
  private async restoreAfterAcademy(): Promise<void> {
    const sel = resolveSelection(this.store.selection, this.levels, this.vehicles, this.store.progress, this.store.garage.owned);
    await this.loadLevel(sel.level);
    this.conditionIndex = 0;
    this.pickVehicle(sel.vehicle);
  }

  private disposeAcademy(): void {
    this.academy?.dispose();
    this.academy = null;
    this.tutorialUI.hide();
  }

  private academyHost() {
    return {
      scene: this.renderer.scene,
      toast: (t: string) => this.ui.toast(t, undefined, undefined, 4500),
      flash: (a: string, b?: string) => this.ui.flash(a, b ?? ''),
      placeAt: (m: number) => this.academyPlaceAt(m),
      setConditions: (c: { weather: import('../data/types').WeatherKind; time: import('../data/types').TimeOfDay }) => {
        this.rt.setConditions(c);
        this.applyConditions();
      },
      highlight: (sel: readonly string[]) => this.tutorialUI.highlight(sel),
      sound: (k: 'step' | 'lesson') => (k === 'lesson' ? this.audio.checkpoint() : this.audio.pickup()),
    };
  }

  /** Teleports the car to `m` metres from the start line (training retries): keeps fuel and damage. */
  private academyPlaceAt(m: number): void {
    const s = this.course.startS + m;
    const p = this.course.poseAt(s);
    this.rt.body.place(this.course, p.x, p.z, p.tx, p.tz);
    this.rt.motion.reset();
    this.rt.session.lastSafeS = s;
    this.acc = 0;
    this.rig.snap();
  }

  /** The route's finish: graduation screen, with a way to practise again. */
  private academyFinished(): void {
    if (!this.flow.dispatch('finish')) return;
    const ac = this.academy;
    ac?.end();
    this.input.captureKeys = false;
    this.touch.setVisible(false);
    this.audio.setDriving(false);
    this.audio.finish();
    this.rig.orbit = true;
    this.ui.setCountdown(null);
    this.ui.hideHud();
    this.tutorialUI.showComplete(
      {
        firstTime: !this.tutorialStore.completed,
        essentialDone: ac?.essentialsDone ? 1 : 0,
        essentialTotal: 1,
        lessonsDone: ac?.lessonsDone ?? 0,
        lessonsTotal: 10,
      },
      () => void this.academyFinish(),
      () => this.restart(),
      () => this.quitToMenu(),
    );
  }

  /** "Done, start the game": records the Academy as completed and opens Route 1. */
  private async academyFinish(): Promise<void> {
    this.tutorialStore.markCompleted();
    this.disposeAcademy();
    this.leaveRun();
    this.menuScreen = 'levels';
    await this.chooseLevel(this.levels[0].id);
  }

  /** Developer-only: back to a brand-new player (progress, credits, vehicles, upgrades, records, tutorial). */
  async resetProgress(): Promise<void> {
    this.disposeAcademy();
    if (this.inRun) this.leaveRun();
    this.store.resetToFresh();
    this.tutorialStore.reset();
    this.cloud.noteLocalReset();
    this.attempts.clear();
    this.pendingCampaign = false;
    this.academyOffered = false;
    await this.restoreAfterAcademy();
    this.showMenu();
    this.ui.toast('Progress reset to a new player (developer).', undefined, undefined, 4000);
  }

  private async chooseLevel(id: string): Promise<void> {
    const def = this.levels.find((l) => l.id === id);
    if (!def || !isLevelUnlocked(def, this.progress())) return;
    this.telemetry.track({ name: 'mission_selected', levelId: id });
    this.freeGarage = false;
    await this.loadLevel(def);
    const owned = this.store.garage.owned;
    // First visit to a mission: show the recommended vehicle. Otherwise keep the current one when it is allowed.
    const usable = availableVehicles(def, this.vehicles, owned);
    const recommended = usable.find((v) => v.id === def.vehicles[0]);
    const keep = usable.find((v) => v.id === this.baseVehicle.id);
    const firstVisit = this.store.levelRecord(def.id).completions === 0;
    let pick = (firstVisit ? recommended : keep) ?? keep ?? recommended ?? usable[0];
    let loaner = false;
    if (!pick) {
      // Nothing owned fits this mission (e.g. a party of 6 and only a hatchback): the studio lends the
      // recommended vehicle so the player is never stuck.
      const id2 = def.vehicles.find((vid) => canUseVehicle(def, vid, this.vehicles)) ?? def.vehicles[0];
      pick = getVehicle(id2);
      loaner = true;
    }
    this.conditionIndex = 0;
    this.pickVehicle(pick, loaner);
    this.store.setSelection(def.id, pick.id);
    this.openGarageScreen();
  }

  private garageActive(): boolean {
    return this.flow.state === 'menu' && this.menuScreen === 'garage' && !!this.garage;
  }

  private openGarageScreen(): void {
    this.menuScreen = 'garage';
    if (!this.garage) {
      this.garage = new GarageScene(this.renderer.profile.shadows);
      const el = this.renderer.renderer.domElement;
      this.garage.resize(el.clientWidth || window.innerWidth, el.clientHeight || window.innerHeight);
    }
    this.garage.reducedMotion = this.reducedMotion;
    this.garage.setShadows(this.renderer.profile.shadows);
    this.garage.setVehicle(this.vehicleDef, peekVehicleAsset(this.baseVehicle.id));
    this.garage.resetView();
    this.rig.setShowcase(true);
    this.rig.snap();
    this.ui.showGarage(this.garageModel());
    this.audio.whoosh();
  }

  private previewVehicle(id: string): void {
    if (id === this.previewId) return;
    const l = this.freeGarage ? null : this.level;
    const owned = this.store.garage.owned;
    const loanerId =
      l && !availableVehicles(l, this.vehicles, owned).length
        ? l.vehicles.find((v) => canUseVehicle(l, v, this.vehicles))
        : undefined;
    this.pickVehicle(getVehicle(id), id === loanerId);
    this.rig.setShowcase(true);
    this.rig.snap();
  }

  private buyVehicle(id: string): void {
    const v = getVehicle(id);
    if (!canBuyVehicle(v, this.progress(), this.store.garage.owned, this.store.credits)) return;
    if (!this.store.buyVehicle(id, v.price)) return;
    this.audio.unlockFanfare();
    this.telemetry.track({ name: 'vehicle_purchased', vehicleId: id });
    void this.cloud.flush();
    this.ui.toast(`${v.name} is yours!`, undefined, undefined, 3500);
    this.analytics.track({ name: 'vehicle_bought', vehicleId: id });
    this.pickVehicle(v);
    this.refreshGarage();
  }

  private buyUpgrade(vehicleId: string, upgradeId: UpgradeId): void {
    const v = getVehicle(vehicleId);
    const levels = this.store.upgradeLevels(vehicleId);
    const cost = nextUpgradeCost(v, levels, upgradeId);
    if (cost === null) return;
    if (!this.store.buyUpgrade(vehicleId, upgradeId, cost, MAX_UPGRADE_LEVEL)) {
      this.ui.toast(
        'Not enough driving credits yet. Complete missions to earn more.',
        undefined,
        undefined,
        3500,
      );
      return;
    }
    this.audio.record();
    this.telemetry.track({ name: 'upgrade_purchased', vehicleId, upgradeId, level: (levels[upgradeId] ?? 0) + 1 });
    void this.cloud.flush();
    this.analytics.track({ name: 'upgrade_bought', vehicleId, upgradeId, level: levels[upgradeId] ?? 0 + 1 });
    // The upgraded vehicle is rebuilt so the effect is visible in the numbers and in the preview straight away.
    if (this.baseVehicle.id === vehicleId) this.pickVehicle(this.baseVehicle, this.loaner);
    this.refreshGarage();
  }

  private setConditions(i: number): void {
    if (i < 0 || i >= this.level.conditions.length) return;
    this.conditionIndex = i;
    this.buildPreview();
    this.applyConditions();
    this.refreshGarage();
  }

  private canStart(): boolean {
    const v = this.baseVehicle;
    const usable = this.loaner || this.store.isOwned(v.id);
    return usable && canUseVehicle(this.level, v, this.vehicles);
  }

  private startMission(): void {
    if (this.freeGarage || !this.canStart()) return;
    this.store.setSelection(this.level.id, this.baseVehicle.id);
    if (!this.store.hasSeenStory(this.level.id) && getStory(this.level.id)) {
      this.showBriefing(
        false,
        () => this.beginRun(),
        () => this.beginRun(),
      );
    } else {
      this.beginRun();
    }
  }

  private readBriefing(): void {
    this.showBriefing(
      true,
      () => this.startMission2(),
      () => undefined,
    );
  }

  /** From the "Read the briefing" button: start straight away after reading (the story is already marked seen). */
  private startMission2(): void {
    if (this.canStart()) this.beginRun();
  }

  private showBriefing(repeat: boolean, onGo: () => void, onSkip: () => void): void {
    const story = getStory(this.level.id);
    if (!story) {
      onGo();
      return;
    }
    this.store.markStorySeen(this.level.id);
    const cast = story.passengers.map((k) => getCast(k)).filter((c): c is CastMember => c !== null);
    const c = this.level.conditions[this.conditionIndex];
    this.briefing.show(
      {
        level: this.level,
        story,
        cast,
        vehicleName: this.vehicleDef.name,
        conditions: conditionsLabel(c),
        repeat,
      },
      onGo,
      onSkip,
    );
  }

  private back(): void {
    if (this.menuScreen === 'garage') {
      if (this.freeGarage) {
        this.freeGarage = false;
        this.rig.setShowcase(false);
        this.rig.orbit = true;
        this.showMenu();
      } else {
        this.menuScreen = 'levels';
        this.rig.setShowcase(false);
        this.rig.orbit = true;
        this.showLevelsScreen();
      }
    } else if (this.menuScreen === 'levels') {
      this.showMenu();
    }
  }

  private showLevelsScreen(): void {
    const s = campaignStatus(this.levels, this.progress());
    this.ui.showLevels(this.levelCards(), this.store.credits, { completed: s.completed, total: s.total, ...s.medals });
  }

  private campaignSummary(): CampaignSummary {
    const s = campaignStatus(this.levels, this.progress());
    const best = this.levels.map((l) => {
      const rec = this.store.levelRecord(l.id);
      let time: number | null = null;
      for (const v of Object.values(rec.vehicles)) if (v.bestTime !== null && (time === null || v.bestTime < time)) time = v.bestTime;
      return { name: l.name, medal: rec.medal, time };
    });
    return {
      missions: s.completed,
      total: s.total,
      ...s.medals,
      credits: this.store.data.stats.creditsEarned,
      totalTime: best.reduce((n, b) => n + (b.time ?? 0), 0),
      best,
    };
  }

  private async nextMission(): Promise<void> {
    if (this.pendingCampaign) {
      this.pendingCampaign = false;
      this.leaveRun();
      this.store.markCampaignCelebrated();
      this.ui.showCampaignComplete(this.campaignSummary());
      return;
    }
    const i = this.levels.findIndex((l) => l.id === this.level.id);
    const next = this.levels.slice(i + 1).find((l) => isLevelUnlocked(l, this.progress()));
    this.leaveRun();
    if (next) await this.chooseLevel(next.id);
    else this.openLevels();
  }

  private openGarageFromRun(): void {
    if (this.level.id === ACADEMY_ID) {
      this.ui.toast("The Academy lends you a car. The garage opens once you start the game.", undefined, undefined, 3500);
      return;
    }
    this.noteAbandon();
    this.leaveRun();
    this.freeGarage = false;
    this.openGarageScreen();
  }

  /** Leaves a run (pause/finish) back to the menu flow without choosing a menu screen. */
  private leaveRun(): void {
    this.cancelPendingFinish();
    this.disposeAcademy();
    if (this.flow.state !== 'menu') this.flow.dispatch('quit');
    this.inRun = false;
    this.ui.hideHud();
    this.ui.hidePause();
    this.ui.hideFinish();
    this.input.captureKeys = false;
    this.audio.setDriving(false);
    this.touch.setVisible(false);
    this.world?.gates.setNext(0);
    this.ai = null;
    this.buildPreview();
    this.applyConditions();
    this.rig.snap();
  }

  // ------------------------------------------------------------------ flow

  /** Starts (or restarts) the run from the grid. Builds a fresh mission so hazards, traffic and fuel are exact. */
  private beginRun(): void {
    this.cancelPendingFinish();
    this.heardPass.clear();
    this.weatherZone = -1;
    this.urgencyShown.clear();
    if (this.flow.state === 'menu') this.flow.dispatch('start');
    else this.flow.dispatch('restart');
    this.inRun = true;
    this.disposeAcademy();
    this.buildRun();
    this.applyConditions();
    const level = this.level;
    const isAcademy = level.id === ACADEMY_ID;
    if (!isAcademy) this.store.noteMissionPlayed();
    const c = level.conditions[this.conditionIndex];
    const attempt = (this.attempts.get(level.id) ?? 0) + 1;
    this.attempts.set(level.id, attempt);
    this.fuelReported = false;
    this.stuckFor = 0;
    if (!isAcademy) this.telemetry.track({ name: 'vehicle_selected', vehicleId: this.vehicleDef.id });
    if (!isAcademy) this.telemetry.track({ name: 'mission_started', levelId: level.id, vehicleId: this.vehicleDef.id, conditions: `${c.weather}-${c.time}`, attempt });
    if (!isAcademy)
      this.analytics.track({
        name: 'mission_start',
        levelId: level.id,
        vehicleId: this.vehicleDef.id,
        conditions: `${c.weather}/${c.time}`,
      });
    this.ai = this.autodriveOn ? new MissionDriver(this.rt) : null;

    this.ui.hideFlow();
    this.ui.hidePause();
    this.ui.hideFinish();
    this.briefing.hide();
    this.ui.showHud({
      comfort: level.mission.comfort,
      timerLabel: level.mission.timerLabel,
      canToggleDrive: this.vehicleDef.drivetrain.modes.length > 1,
      mode: this.store.settings.hudMode,
    });
    this.engineSim.reset();
    const story = getStory(level.id);
    if (isAcademy) {
      // Training starts at once: no countdown, no dispatch card, no clock to beat.
      this.rt.session.countdown = 0.001;
      this.ui.setCountdown(null);
      this.ui.setDispatch(null);
    } else {
      this.ui.setCountdown(String(Math.ceil(this.rt.session.countdown)));
      this.ui.setDispatch(story ? { title: story.headline, goal: story.quick.goal } : null);
    }
    this.world?.gates.setNext(0);
    this.touch.reset();
    this.rig.setShowcase(false);
    this.rig.orbit = false;
    this.rig.intro = 1;
    this.rig.snap();
    this.input.captureKeys = true;
    this.audio.setDriving(true);
    this.warnCooldown = 0;
    this.warnHold = 0;
    this.issueCooldown = 0;
    this.updateTouch();
    if (isAcademy) this.academy = new TutorialController(this.rt, this.academyHost(), this.tutorialUI, this.tutorialStore);
    (document.activeElement as HTMLElement | null)?.blur?.();
  }

  private endRun(r: RaceResult): void {
    if (this.level.id === ACADEMY_ID) {
      this.academyFinished();
      return;
    }
    if (!this.flow.dispatch('finish')) return;
    const rt = this.rt;
    const level = this.level;
    const done = r.status === 'completed';
    const first = done && this.store.levelRecord(level.id).completions === 0;
    const before = structuredClone(this.store.progress);
    const { reward, optional } = rt.rewardFor(r, first);
    const outcome = done
      ? this.store.recordCompletion({
          levelId: level.id,
          vehicleId: r.vehicleId,
          time: r.time,
          medal: r.medal,
          score: r.score,
          comfort: r.comfort,
        })
      : { newBest: false, newMedal: false, newScoreBest: false, previousBest: null };
    this.store.addCredits(reward.total);
    {
      const cnd = level.conditions[Math.min(this.conditionIndex, level.conditions.length - 1)];
      if (done) {
        this.telemetry.track({ name: 'mission_completed', levelId: level.id, vehicleId: r.vehicleId, seconds: r.time, medal: r.medal, attempts: this.attempts.get(level.id) ?? 1 });
        // Posts to the online leaderboard (when signed in, as a guest or account) or queues it for when online.
        this.leaderboards.submitRun({ levelId: level.id, vehicleId: r.vehicleId, time: r.time, medal: r.medal, comfort: r.comfort, conditions: `${cnd.weather}-${cnd.time}` });
      } else {
        this.telemetry.track({ name: 'mission_failed', levelId: level.id, vehicleId: r.vehicleId, reason: 'timeout', seconds: Math.round(r.time) });
        this.incident('failed', 'high');
      }
      void this.cloud.flush(); // progress is already saved locally; this schedules the cloud copy
    }
    this.analytics.track({
      name: 'mission_end',
      levelId: level.id,
      status: r.status,
      medal: r.medal,
      seconds: Math.round(r.time),
    });
    const unlocked = done
      ? newlyUnlocked(this.levels, this.vehicles, before, this.store.progress)
      : { levels: [], vehicles: [] };
    for (const v of unlocked.vehicles) this.telemetry.track({ name: 'vehicle_unlocked', vehicleId: v.id });
    this.pendingCampaign = done && justCompletedCampaign(this.levels, before, this.store.progress);
    const i = this.levels.findIndex((l) => l.id === level.id);
    const next = this.levels.slice(i + 1).find((l) => isLevelUnlocked(l, this.store.progress));
    const times = levelTimes(level, paceFor(level, this.vehicleDef));
    const rival = rt.rival;
    const extra: FinishExtra = {
      ...outcome,
      best: this.store.vehicleRecord(level.id, r.vehicleId).bestTime,
      unlockedLevels: unlocked.levels.map((l) => l.id),
      unlockedVehicles: unlocked.vehicles.map((v) => v.id),
      nextMissionName: done && this.pendingCampaign ? 'Campaign complete' : done && next ? next.name : null,
      medals: times,
      reward,
      optional,
      credits: this.store.credits,
      fuelLeft: r.fuelLeft,
      health: r.health,
      delivered: rt.stops.deliveredTotal,
      party: rt.stops.party,
      rivalLine:
        done && rival
          ? r.time < rival.def.finishTime
            ? `Beat ${rival.def.name}`
            : `${rival.def.name} won this one`
          : null,
    };
    if (done) this.audio.finish();
    else this.audio.fail();
    if (unlocked.levels.length || unlocked.vehicles.length)
      window.setTimeout(() => this.audio.unlockFanfare(), 900);
    else if (done && (outcome.newBest || outcome.newMedal)) window.setTimeout(() => this.audio.record(), 900);
    this.input.captureKeys = false;
    this.touch.setVisible(false);
    this.audio.setDriving(false);
    this.rig.orbit = true;
    this.ui.setCountdown(null);
    this.ui.setDispatch(null);
    const names = {
      levels: Object.fromEntries(this.levels.map((l) => [l.id, l.name])),
      vehicles: Object.fromEntries(this.vehicles.map((v) => [v.id, v.name])),
    };
    const show = (): void => {
      this.ui.setFinishLevel(level.id);
      this.ui.showFinish(level, r, extra, names);
    };
    if (done && level.celebrate && this.view) {
      // Arrival celebration: the crowd cheers, confetti falls (none on Low graphics or with reduced motion), then the
      // results appear. Any key, click or tap skips straight to them.
      const q = this.store.settings.quality;
      const intensity = this.reducedMotion || q === 'low' ? 0 : q === 'medium' ? 0.6 : 1;
      this.view.celebrate(true, intensity);
      this.audio.cheer();
      if (level.mission.kind === 'airport') window.setTimeout(() => this.audio.airportChime(), 600);
      window.setTimeout(() => this.audio.brandSting(), 1800);
      this.ui.flash('You made it!', level.finishLabel);
      this.cancelPendingFinish();
      const run = (): void => {
        this.cancelPendingFinish();
        this.view?.celebrate(false, 0);
        show();
      };
      const skip = (): void => run();
      window.addEventListener('keydown', skip, { once: true });
      window.addEventListener('pointerdown', skip, { once: true });
      const timer = window.setTimeout(run, this.reducedMotion ? 1100 : 3000);
      this.pendingFinish = {
        show: run,
        timer,
      };
      this.finishSkipCleanup = () => {
        window.removeEventListener('keydown', skip);
        window.removeEventListener('pointerdown', skip);
      };
    } else show();
  }

  private finishSkipCleanup: (() => void) | null = null;

  private cancelPendingFinish(): void {
    if (this.pendingFinish) window.clearTimeout(this.pendingFinish.timer);
    this.pendingFinish = null;
    this.finishSkipCleanup?.();
    this.finishSkipCleanup = null;
  }

  private pause(): void {
    if (!this.flow.dispatch('pause')) return;
    this.academy?.notePause();
    this.ui.showPause();
    this.input.captureKeys = false;
    this.audio.setDriving(false);
    this.touch.setVisible(false);
  }

  private resume(): void {
    if (!this.flow.dispatch('resume')) return;
    this.academy?.noteResume();
    this.ui.hidePause();
    this.input.captureKeys = true;
    this.audio.setDriving(true);
    this.last = performance.now();
    this.updateTouch();
    (document.activeElement as HTMLElement | null)?.blur?.();
  }

  private restart(): void {
    if (!this.flow.can('restart')) return;
    this.noteAbandon();
    // A restart never shows the briefing again: straight back to the grid.
    this.beginRun();
  }

  private quitToMenu(): void {
    this.noteAbandon();
    if (!this.flow.dispatch('quit')) return;
    const wasAcademy = this.level.id === ACADEMY_ID;
    this.leaveRun();
    if (wasAcademy) void this.restoreAfterAcademy().then(() => this.showMenu());
    else this.showMenu();
  }

  /** Puts the car back on the road at the last safe point, keeping fuel and damage. */
  private recover(): void {
    if (this.flow.state !== 'playing' || this.rt.session.phase !== 'running') return;
    this.rt.recover();
    this.acc = 0;
  }

  private toggleDrive(): void {
    if (this.flow.state !== 'playing') return;
    if (this.vehicleDef.drivetrain.modes.length < 2) {
      this.ui.toast(
        `${this.vehicleDef.name} is ${this.vehicleDef.drivetrain.default} only.`,
        undefined,
        undefined,
        2500,
      );
      return;
    }
    const mode = this.rt.toggleDriveMode();
    this.ui.flash(
      `Drive mode: ${mode}`,
      mode === '4x4' ? 'More traction on loose ground, more fuel' : 'Saves fuel on good roads',
    );
    this.audio.click();
  }

  /** Asks for the pit-stop service on offer (null = whichever is needed). Only works while stopped in a pit stop. */
  private requestService(kind: ServiceKind | null): void {
    if (this.flow.state !== 'playing' || this.rt.session.phase !== 'running') return;
    const rt = this.rt;
    const speed = Math.abs(rt.body.speed);
    const here = rt.stops.servicesHere(rt.s, rt.lateral, speed, rt.course.road.halfWidth);
    if (!here) {
      const next = rt.stops.nextService(rt.s);
      this.ui.toast(
        next && next.s > rt.s
          ? `Pit stop ahead in ${Math.round(next.s - rt.s)} m. Stop inside the blue zone, then press E.`
          : 'There is no pit stop here. Look for the blue zone.',
        undefined,
        undefined,
        3500,
      );
      return;
    }
    const needs = (k: ServiceKind): boolean =>
      k === 'refuel' ? rt.status.fuel < 0.995 : rt.status.health < 99.5;
    const pick =
      kind ?? (['refuel', 'repair'] as const).find((k) => here.kinds.includes(k) && needs(k)) ?? null;
    if (!pick || !here.kinds.includes(pick)) return;
    if (!needs(pick)) {
      this.ui.toast(
        pick === 'refuel' ? 'The tank is already full.' : 'No repairs needed.',
        undefined,
        undefined,
        2200,
      );
      return;
    }
    if (speed > 1.6) {
      this.ui.toast('Come to a complete stop first.', undefined, undefined, 2200);
      return;
    }
    rt.serviceRequest = pick;
  }

  // ------------------------------------------------------------------ loop

  private readonly frame = (now: number): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.frame);
    const t0 = performance.now();
    const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.time += dt;
    this.fpsEma += (1 / Math.max(dt, 1e-4) - this.fpsEma) * 0.05;
    if (this.loadingLevel || !this.world || !this.model || !this.rt) return;

    const state = this.flow.state;
    let alpha = 1;
    if (state === 'playing') {
      const p0 = performance.now();
      this.stepPhysics(dt);
      this.physicsMs += (performance.now() - p0 - this.physicsMs) * 0.1;
      alpha = this.rt.session.isActive ? this.acc / PHYSICS_STEP : 1;
    } else if (state === 'menu') {
      // Idle: keep the suspension settled for the menu / garage backdrop.
      this.rt.body.step(PHYSICS_STEP, IDLE, this.course);
      this.nav.pollGamepad(now);
    } else if (state === 'paused') {
      this.nav.pollGamepad(now);
    }
    if (state === 'finished') this.nav.pollGamepad(now);

    const body = this.rt.body;
    if (this.garageActive() && this.garage) {
      // The garage has its own scene: the world, weather and effects behind the menus are not updated or drawn.
      this.garage.update(dt);
      this.renderer.renderScene(this.garage.scene, this.garage.camera);
      this.afterFrame(dt, state);
      this.cpuMs += (performance.now() - t0 - this.cpuMs) * 0.08;
      return;
    }
    this.model.setCondition(this.rt.status.health);
    this.model.sync(body, alpha, this.course, this.time, this.currentRpm());
    if (state === 'playing' && this.rt.session.phase === 'countdown') {
      this.rig.intro = clamp(this.rt.session.countdown / 3, 0, 1);
    } else if (state === 'playing') {
      this.rig.intro = Math.max(0, this.rig.intro - dt * 2);
    }
    if (state !== 'paused') this.rig.update(dt, body, alpha, this.course, this.time);
    this.camPos.copy(this.rig.camera.position);
    this.world.update(this.time, this.camPos, body.position, this.lastProgress);
    this.updateWeatherFx(dt, state);
    this.view?.update(this.time);
    const st = this.rt.status;
    this.effects.update(dt, body, this.course, this.flow.state === 'playing', {
      rpm: this.engineSim.state.rpm,
      load: this.engineSim.state.load,
      health: st.health,
      waterDepth: st.waterDepth,
      engineRunning: st.stalledFor <= 0 && !st.outOfFuel,
    });

    this.renderer.render(this.rig.camera);
    this.afterFrame(dt, state);
    this.cpuMs += (performance.now() - t0 - this.cpuMs) * 0.08;

    if (this.adaptive && state !== 'paused') {
      const s = this.adaptive.update(dt);
      if (s !== null) {
        this.renderer.setResolutionScale(s);
        this.onResize();
      }
    }
  };

  /** Rain, snow, thunder flash and headlights follow the mission's weather. */
  private updateWeatherFx(dt: number, state: string): void {
    const w = this.rt.weather;
    const q = this.quality();
    const snowing = this.level.weather === 'snow' || w.preset.snow;
    if (snowing) this.snow.update(this.time, this.camPos);
    if (state !== 'paused') {
      this.rain.setIntensity(w.rain, q.rainDrops);
      this.audio.setWeather(w.rain, w.preset.wind / 4);
    }
    this.rain.update(this.time, this.camPos);
    if (this.flashLevel > 0) {
      this.flashLevel = Math.max(0, this.flashLevel - dt * 2.4);
      this.world?.env.setFlash(this.reducedMotion ? 0 : this.flashLevel);
    }
    const lights = this.world?.env.lightsOn ?? false;
    this.model?.setHeadlights(lights);
  }

  private currentRpm(): number {
    return clamp(Math.abs(this.rt.body.speed) / this.vehicleDef.engine.topSpeed, 0, 1);
  }

  private stepPhysics(dt: number): void {
    const cmd = this.cmd;
    const rt = this.rt;
    const phase = rt.session.phase;
    if (this.academy?.holding) {
      // An explanation card is open: the car is held until "Got it".
      cmd.steer = cmd.throttle = cmd.brake = 0;
      this.acc = 0;
      this.lastSteps = 0;
      return;
    }
    if (phase === 'countdown') {
      cmd.steer = cmd.throttle = cmd.brake = 0;
    } else if (this.ai instanceof MissionDriver) {
      this.ai.update(cmd);
    } else if (this.ai) {
      this.ai.update(rt.body, cmd);
    } else {
      this.input.read(cmd);
    }

    this.acc += dt;
    let steps = 0;
    while (this.acc >= PHYSICS_STEP && steps < MAX_STEPS_PER_FRAME) {
      rt.step(PHYSICS_STEP, cmd);
      this.acc -= PHYSICS_STEP;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) this.acc = 0;
    this.lastSteps = steps;
    this.issueCooldown = Math.max(0, this.issueCooldown - dt);
  }

  private afterFrame(dt: number, state: string): void {
    const rt = this.rt;
    const b = rt.body;
    const speed = b.speed;
    const ds = this.driveSound;
    if (state === 'playing' || state === 'finished' || state === 'menu') {
      const playing = state !== 'menu';
      ds.speed = playing ? speed : 0;
      ds.throttle = playing ? this.cmd.throttle : 0;
      ds.braking = playing && b.braking > 0;
      ds.slip = playing ? b.slip : 0;
      ds.grounded = b.groundedWheels > 0;
      ds.offRoad = false;
      ds.loose = 0;
      ds.wet = false;
      ds.water = 0;
      ds.surface = 'asphalt';
      if (playing) {
        ds.offRoad = Math.abs(rt.lateral) > this.course.road.halfWidth + 0.1;
        const wheel = b.wheels.find((w) => w.inContact);
        if (wheel) {
          const sf = wheel.surface;
          ds.loose = sf.looseness * (sf.id === 'asphalt' || sf.id === 'wetAsphalt' ? 0 : 1);
          ds.wet = sf.id === 'wetAsphalt' || sf.id === 'ice' || sf.id === 'slush';
          ds.water = clamp(rt.status.waterDepth / 0.6, 0, 1);
          ds.surface = sf.id;
        }
      }
      ds.dt = dt;
      this.audio.update(ds);
    }

    if (state === 'playing' && rt.session.phase === 'running' && !this.autodriveOn) {
      // Full throttle but going nowhere for a while: an incident (a wall, a rock, a ditch).
      this.stuckCooldown = Math.max(0, this.stuckCooldown - dt);
      if (this.cmd.throttle > 0.6 && Math.abs(speed) < 0.7 && !rt.status.outOfFuel) this.stuckFor += dt;
      else this.stuckFor = 0;
      if (this.stuckFor > 6 && this.stuckCooldown <= 0) {
        this.incident('stuck', 'medium');
        this.stuckCooldown = 30;
        this.stuckFor = 0;
      }
    }

    if (state === 'playing') {
      const s = rt.session;
      const h = this.hud;
      const deadline = this.level.mission.timerStyle === 'deadline';
      this.lastProgress = clamp(
        (rt.s - this.course.startS) / (this.course.finishS - this.course.startS),
        0,
        1,
      );
      h.speedKmh = Math.abs(speed) * 3.6;
      const eng = this.engineSim.update(dt, speed, this.cmd.throttle, b.groundedWheels > 0);
      h.scaleMaxKmh = Math.max(60, Math.ceil((this.vehicleDef.engine.topSpeed * 3.6 * 1.04) / 20) * 20);
      h.rpm = eng.rpm;
      h.load = eng.load;
      h.shifting = eng.shifting;
      ds.rpm = eng.rpm;
      ds.load = eng.load;
      ds.shifting = eng.shifting;
      ds.overrun = eng.overrun;
      h.engineWarn = rt.status.stalledFor > 0 || rt.status.health < 25 || rt.status.outOfFuel;
      h.timerText = formatClock(deadline ? s.timeLeft : s.time);
      h.timerLabel = this.level.mission.timerLabel;
      h.lowTime = s.phase === 'running' && s.timeLeft < 15;
      h.checkpointsDone = s.nextCheckpoint;
      const o = rt.objective();
      h.objectiveKind = o.kind;
      h.objective =
        o.kind === 'checkpoint'
          ? o.label
          : o.kind === 'unload'
            ? `Stop in the zone to drop off: ${this.level.finishLabel}`
            : o.label;
      h.distance = o.distance;
      if (this.academy) {
        h.objectiveKind = 'checkpoint';
        h.objective = this.academy.objectiveLabel();
        h.distance = null;
      }
      h.progress = this.lastProgress;
      h.fuel = rt.status.fuel;
      h.health = rt.status.health;
      h.driveMode = b.driveMode;
      h.canToggleDrive = this.vehicleDef.drivetrain.modes.length > 1;
      h.onboard = rt.stops.onboard;
      h.party = rt.stops.party;
      h.conditions = conditionsLabel(rt.conditions);
      h.headlights = this.world?.env.lightsOn ?? false;
      this.hudContext(h, Math.abs(speed));
      this.hudAlerts(h, b.wheels.find((w) => w.inContact)?.surface.name ?? '');
      const rv = rt.rival;
      if (rv && s.phase === 'running' && rv.state.started) {
        const gap = (rv.state.s - rt.s) / Math.max(8, Math.abs(speed));
        h.rival = {
          gap,
          label: `${rv.def.name}: ${gap > 0 ? `${gap.toFixed(1)} s ahead` : `${(-gap).toFixed(1)} s behind`}`,
        };
      } else h.rival = null;
      if (s.comfort) {
        const c = this.comfortHud;
        c.value = s.comfort.value;
        c.quality = s.comfort.quality;
        c.cause = s.comfort.cause;
        h.comfort = c;
        this.comfortWarning(dt, s);
      } else {
        h.comfort = null;
      }
      if (this.academy && s.phase === 'running') this.academy.update(dt, this.cmd);
      this.trafficSounds();
      this.routeEvents(rt, s);
      this.ui.updateHud(h);
      this.serviceSound(dt);
      this.minimapTimer += dt;
      if (this.minimapTimer > 0.1) {
        this.minimapTimer = 0;
        b.headingXZ(this.head);
        this.minimap.draw(
          b.position.x,
          b.position.z,
          Math.atan2(this.head.x, -this.head.z),
          s.nextCheckpoint,
        );
      }
    }

    this.debugTimer += dt;
    if (this.debugTimer > 0.25 && this.ui.debugVisible) {
      this.debugTimer = 0;
      const st = this.renderer.stats();
      const p = b.position;
      const mem = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
      this.ui.setDebug(
        [
          `fps ${this.fpsEma.toFixed(0)}  cpu ${this.cpuMs.toFixed(1)}ms  physics ${this.physicsMs.toFixed(2)}ms (${this.lastSteps} steps)`,
          `draw calls ${st.calls}  tris ${(st.triangles / 1000).toFixed(1)}k  geo ${st.geometries}  tex ${st.textures}`,
          `quality ${this.renderer.level}  dpr ${this.renderer.renderer.getPixelRatio().toFixed(2)}  res x${this.renderer.resolutionScale.toFixed(2)}`,
          `pos ${p.x.toFixed(0)},${p.y.toFixed(1)},${p.z.toFixed(0)}  v ${speed.toFixed(1)}m/s  wheels ${b.groundedWheels}  fuel ${(rt.status.fuel * 100).toFixed(0)}%  hp ${rt.status.health.toFixed(0)}`,
          `audio ${this.audio.available ? 'on' : 'off'}  voice ${this.vehicleDef.id}  eng ${this.audio.mix.engine.toFixed(2)} sfx ${this.audio.mix.sfx.toFixed(2)} amb ${this.audio.mix.ambience.toFixed(2)} wx ${this.audio.mix.weather.toFixed(2)} duck ${this.audio.mix.duck.toFixed(2)}`,
          `${this.level.id} / ${this.vehicleDef.id}  ${this.flow.state}${this.flow.state === 'menu' ? '' : '/' + rt.session.phase}${mem ? `  heap ${(mem.usedJSHeapSize / 1048576).toFixed(0)}MB` : ''}`,
        ].join('\n'),
      );
    }
  }

  /** Weather that drifts through the route, and the rising urgency of a flight deadline. */
  private routeEvents(rt: MissionRuntime, s: RaceSession): void {
    const level = this.level;
    // The river's rush swells as the car comes close to the water and fades in the fields.
    if (this.course.rivers.length && this.time >= this.nextRiverCheck) {
      this.nextRiverCheck = this.time + 0.25;
      nearestRiver(this.course.rivers, rt.body.position.x, rt.body.position.z, this.riverNear);
      this.audio.setRiverProximity(1 - (this.riverNear.d - 10) / 80);
    }
    if (s.phase !== 'running') return;
    const zones = level.weatherZones;
    if (zones && this.conditionIndex === 0) {
      const f = (rt.s - this.course.startS) / (this.course.finishS - this.course.startS);
      const idx = zones.findIndex((z) => f >= z.from && f < z.to);
      if (idx !== this.weatherZone) {
        this.weatherZone = idx;
        const base = level.conditions[0];
        const next = idx >= 0 ? zones[idx].weather : base.weather;
        // A front moves in: the road soaks, the rain builds and the fog thickens over a few seconds.
        rt.transitionWeather(next);
        this.applyConditions(true);
        if (idx >= 0 || next !== 'clear') {
          const note = ZONE_NOTICE[next];
          if (note) this.ui.flash(next === 'rain' && level.mission.kind === 'tour' ? 'Sudden rain!' : note[0], note[1]);
          // The first snow: remind a vehicle with selectable drive that four-wheel drive is worth having on the steep, slippery climbs.
          if ((next === 'snow' || next === 'blizzard') && !this.urgencyShown.has(100) && this.vehicleDef.drivetrain.modes.length > 1 && rt.body.driveMode === '4x2') {
            this.urgencyShown.add(100);
            window.setTimeout(() => this.ui.flash('Tip: four-wheel drive', 'Press F (or the 4x4 chip) for more traction on the steep, snowy climbs'), 3200);
          }
        }
      }
    }
    if (level.mission.timerStyle === 'deadline') {
      for (const [i, secs] of [180, 120, 60, 30].entries()) {
        if (s.timeLeft <= secs && !this.urgencyShown.has(i)) {
          this.urgencyShown.add(i);
          const cast = getCast(rt.stops.stops.find((x) => x.def.kind === 'pickup')?.def.who ?? '');
          const airport = level.mission.kind === 'airport';
          const jokes = airport
            ? ['Is that a mountain? We are taking photos.', 'My passport is in the suitcase. Which suitcase?', 'Faster! Or slower! Faster!', 'We can see the plane. It can see us.']
            : level.mission.kind === 'descent'
              ? ['Is that thunder, or the engine?', 'The clouds were much nicer from above.', 'We would like to see the lodge before the lightning does.', 'Was that the road, or a river?']
              : ['The light is perfect. For about four more minutes.', 'Is the dzong still there? Please say it is still there.', 'We skipped lunch for this. Do not skip the dzong.', 'The sun is leaving. We would like to leave with it.'];
          this.ui.flash(`${airport ? 'Check-in closes in' : level.mission.timerLabel} ${secs >= 60 ? `${secs / 60} min` : `${secs} s`}`, cast && rt.stops.onboard > 0 ? `${cast.name}: "${jokes[i]}"` : 'Keep moving');
          this.audio.warning();
        }
      }
    }
  }

  /** Vehicles passing close to the player are heard once each (a swell, a hiss of tyres, a scooter's buzz). */
  private trafficSounds(): void {
    const tr = this.rt.traffic;
    if (!tr || this.time < this.nextPassSound) return;
    const p = this.rt.body.position;
    for (const car of tr.cars) {
      if (this.heardPass.has(car.id)) continue;
      const d = Math.hypot(car.x - p.x, car.z - p.z);
      if (d < 11 && (car.speed > 2 || Math.abs(this.rt.body.speed) > 4)) {
        this.heardPass.add(car.id);
        const sound = TRAFFIC_KINDS[car.kind].sound;
        if (sound) this.audio.trafficPass(sound, 1 - d / 12);
        this.nextPassSound = this.time + 0.5;
        break;
      }
    }
    if (this.heardPass.size > 60) this.heardPass.clear();
  }

  /** Short, contextual chips: only what the player can act on right now (at most two). */
  private hudAlerts(h: HudState, surfaceName: string): void {
    const rt = this.rt;
    const b = rt.body;
    const out: HudState['alerts'] = [];
    if (rt.status.outOfFuel) out.push({ text: 'Out of fuel', tone: 'bad' });
    else if (h.fuel < 0.2) out.push({ text: 'Low fuel', tone: 'warn' });
    if (h.health < 25) out.push({ text: 'Critical damage', tone: 'bad' });
    else if (h.health < 50) out.push({ text: 'Damaged', tone: 'warn' });
    const wheel = b.wheels.find((w) => w.inContact);
    const loose = wheel ? wheel.surface.looseness : 0;
    const wetRoad = rt.weather.wetness > 0.55;
    const snowy = !!wheel && ['ice', 'frost', 'snow', 'packed', 'slush'].includes(wheel.surface.id);
    const speed = Math.abs(b.speed);
    if (
      h.canToggleDrive &&
      h.driveMode === '4x2' &&
      speed > 3 &&
      ((loose > 0.45 && wheel?.surface.id !== 'asphalt') || (b.slip > 2.5 && wetRoad) || (b.slip > 2.2 && snowy))
    ) {
      out.push({ text: '4x4 recommended', tone: 'info' });
    }
    if (wetRoad && speed > 14 && out.length < 2) out.push({ text: 'Wet road', tone: 'info' });
    if (rt.brakeHeat > 0.55) out.unshift({ text: 'Brakes fading: ease off', tone: 'warn' });
    h.alerts = out.slice(0, 2);
    const road = rt.course.road;
    road.at(rt.s, this.roadPose);
    road.at(rt.s + 8, this.roadPose2);
    h.telemetry.fps = this.fpsEma;
    h.telemetry.surface = surfaceName || '-';
    h.telemetry.grade = (this.roadPose2.y - this.roadPose.y) / 8;
    h.telemetry.slip = b.slip;
    h.telemetry.wet = rt.weather.wetness;
    h.telemetry.gear = this.engineSim.state.gear;
  }

  /** Pit-stop prompt, boarding progress and approach hints for the HUD. */
  private hudContext(h: HudState, speed: number): void {
    const rt = this.rt;
    const halfWidth = rt.course.road.halfWidth;
    const act = rt.stops.active;
    h.service = null;
    h.prompt = '';
    if (act) {
      h.service = { kinds: [act.kind], active: act.kind, progress: act.stop.progress };
      h.prompt = act.kind === 'refuel' ? 'Refuelling... stay stopped' : 'Repairing... stay stopped';
      return;
    }
    const here = rt.stops.servicesHere(rt.s, rt.lateral, speed, halfWidth);
    if (here) {
      if (!here.kinds.length) {
        h.prompt = 'Drop-off zone: stay stopped';
        return;
      }
      const kinds = here.kinds.filter((k) =>
        k === 'refuel' ? rt.status.fuel < 0.995 : rt.status.health < 99.5,
      );
      if (kinds.length) {
        h.service = { kinds, active: null, progress: 0 };
        h.prompt = 'Pit stop: choose a service (E)';
        return;
      }
      h.prompt = 'Pit stop: nothing needed right now';
      return;
    }
    const gate = rt.stops.gate;
    if (gate) {
      const d = gate.s - rt.s;
      if (gate.state === 'active') h.prompt = `${gate.def.kind === 'dropoff' ? 'Guests getting out' : 'Guests boarding'}... ${Math.round(gate.progress * 100)}%`;
      else if (Math.abs(d) < STOP_RADIUS + 1 && speed > 1.6)
        h.prompt = 'Slow down and stop in the yellow zone';
      else if (d < 90 && d > STOP_RADIUS) h.prompt = gate.def.kind === 'dropoff' ? 'Drop-off ahead: stop in the yellow zone' : 'Pickup ahead: stop in the yellow zone';
      return;
    }
    const level = this.level;
    if (level.mission.finishMode === 'stop' && rt.session.nextCheckpoint >= rt.session.totalCheckpoints) {
      const d = this.course.finishS - rt.s;
      if (d < 70)
        h.prompt =
          rt.session.unloadProgress > 0
            ? `Guests getting out... ${Math.round(rt.session.unloadProgress * 100)}%`
            : 'Stop inside the zone to drop off';
      return;
    }
    const next = rt.stops.nextService(rt.s);
    if (next && next.s - rt.s > 0 && next.s - rt.s < 130 && (rt.status.fuel < 0.5 || rt.status.health < 60)) {
      h.prompt = `${next.def.label} ahead: stop in the blue zone`;
    }
  }

  private serviceSound(dt: number): void {
    const act = this.rt.stops.active;
    if (!act) {
      this.serviceTick = 0;
      return;
    }
    this.serviceTick -= dt;
    if (this.serviceTick <= 0) {
      this.serviceTick = 0.25;
      this.audio.serviceTick(act.kind);
    }
  }

  /** A gentle chime when passengers are being thrown about, at most every few seconds. */
  private comfortWarning(dt: number, s: RaceSession): void {
    const c = s.comfort;
    if (!c || s.phase !== 'running') return;
    this.warnCooldown = Math.max(0, this.warnCooldown - dt);
    this.warnHold = c.cause !== null && c.severity > 0.3 ? this.warnHold + dt : 0;
    if (this.warnHold > 0.5 && this.warnCooldown === 0) {
      this.warnCooldown = 4;
      this.warnHold = 0;
      this.audio.comfortWarning();
    }
  }

  // ------------------------------------------------------------------ debug / test API

  /** Read-only snapshot + a few helpers, exposed on window only with ?debug=1. */
  debugApi(): Record<string, unknown> {
    return {
      state: () => {
        const menu = this.flow.state === 'menu';
        const rt = this.rt;
        const o = menu ? null : rt.objective();
        return {
          flow: this.flow.state,
          menu: this.menuScreen,
          phase: menu ? null : rt.session.phase,
          time: menu ? 0 : rt.session.time,
          speed: rt.body.speed,
          checkpoints: menu ? 0 : rt.session.nextCheckpoint,
          position: rt.body.position.toArray(),
          grounded: rt.body.groundedWheels,
          progress: this.lastProgress,
          fps: this.fpsEma,
          cpuMs: this.cpuMs,
          stats: this.renderer.stats(),
          quality: this.renderer.level,
          levelId: this.level.id,
          vehicleId: this.vehicleDef.id,
          comfort: !menu ? (rt.session.comfort?.value ?? null) : null,
          pixelRatio: this.renderer.renderer.getPixelRatio(),
          fuel: rt.status.fuel,
          health: rt.status.health,
          onboard: rt.stops.onboard,
          party: rt.stops.party,
          gate: rt.stops.gate?.def.id ?? null,
          objective: o ? { kind: o.kind, label: o.label, distance: o.distance } : null,
          driveMode: rt.body.driveMode,
          credits: this.store.credits,
          servicesUsed: rt.status.servicesUsed,
          weather: rt.conditions.weather,
          time_of_day: rt.conditions.time,
          loaner: this.loaner,
          lights: this.world?.env.lightsOn ?? false,
          detailedModel: this.model?.detailed ?? false,
          audioMix: { ...this.audio.mix },
          cloud: { connection: this.cloud.status.connection, sync: this.cloud.status.sync, uid: this.cloud.uid, name: this.cloud.status.displayName },
          privacy: this.privacy.value,
          incidents: this.incidentLog.list().length,
          particlesAlive: this.effects.particles.alive,
          scene: this.garageActive() ? 'garage' : 'world',
          garageVehicle: this.garage?.shownVehicleId ?? null,
          garageView: this.garage?.view ?? null,
          academy: this.academy?.snapshot() ?? null,
          tutorial: { ...this.tutorialStore.data },
        };
      },
      startAcademy: () => this.startAcademy(),
      /** Developer reset to a brand-new player (see Game.resetProgress). */
      resetProgress: () => this.resetProgress(),
      /** Teleport onto the road at a distance (for tests). It does not change what the mission requires. */
      warp: (s: number) => {
        const p = this.course.poseAt(s);
        this.rt.body.place(this.course, p.x, p.z, p.tx, p.tz);
        this.rt.motion.reset();
        this.rig.snap();
      },
      cmd: () => ({ ...this.cmd }),
      course: () => ({
        length: this.course.road.length,
        startS: this.course.startS,
        finishS: this.course.finishS,
        checkpointS: this.course.checkpointS,
        stops: this.rt.stops.stops.map((s) => ({ id: s.def.id, kind: s.def.kind, s: s.s })),
      }),
      /** Bot-drive toggle so e2e tests can finish a level through the real UI flow. */
      autodrive: (on: boolean) => {
        this.autodriveOn = on;
        this.ai = on && this.inRun ? new MissionDriver(this.rt) : null;
      },
      /** Test-only helper: sets the fuel level (0..1). */
      setFuel: (f: number) => {
        this.rt.status.fuel = clamp(f, 0, 1);
      },
      /** Test-only helper: gives driving credits. */
      grantCredits: (n: number) => {
        this.store.addCredits(n);
        this.refreshGarage();
      },
      /** Test-only helper: opens the campaign-complete screen with the current progress. */
      showCampaign: () => this.ui.showCampaignComplete(this.campaignSummary()),
      analytics: () => (this.analytics instanceof MemoryAnalytics ? [...this.analytics.events] : []),
    };
  }

  dispose(): void {
    this.running = false;
    window.removeEventListener('pointerdown', this.onTouchDetected);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('orientationchange', this.onResize);
    document.removeEventListener('visibilitychange', this.onVisibility);
    cancelAnimationFrame(this.rafId);
    this.input.dispose();
    this.touch.reset();
    this.touch.el.remove();
    this.nav.dispose();
    this.audio.dispose();
    this.disposeLevel();
    this.model?.dispose();
    this.garage?.dispose();
    this.effects.dispose();
    this.snow.dispose();
    this.rain.dispose();
    this.cloud.dispose();
    this.telemetry.dispose();
    this.cloudUI.dispose();
    this.heatmap.dispose();
    this.feedback.dispose();
    this.about.dispose();
    this.briefing.dispose();
    this.disposeAcademy();
    this.tutorialUI.dispose();
    disposeEnvKit();
    assets.dispose();
    this.renderer.dispose();
  }
}

/** m:ss.cc for the HUD clock. */
function formatClock(seconds: number): string {
  const t = Math.max(0, seconds);
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const cs = Math.floor((t * 100) % 100);
  return `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}
