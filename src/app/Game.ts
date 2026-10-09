import { Vector3 } from 'three';
import { AudioEngine } from '../audio/AudioEngine';
import { clamp } from '../core/math';
import { levelTimes, listLevels, paceFor } from '../data/levels';
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
import { DraftStore, createTransport, readFeedbackConfig } from '../services/feedback';
import type { FeedbackConfig, FeedbackPayload } from '../services/feedback';
import { LocalIdentity, LocalLeaderboard, MemoryAnalytics, NullAnalytics } from '../services/seams';
import type { Services } from '../services/seams';
import type { Settings } from '../storage/SaveStore';
import { SaveStore, openBrowserStorage } from '../storage/SaveStore';
import { MiniMap } from '../ui/MiniMap';
import { TouchControls } from '../ui/TouchControls';
import { FeedbackScreen } from '../ui/FeedbackScreen';
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
    this.ui = new UI(
      opts.uiHost,
      {
        openLevels: () => this.openLevels(),
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
        click: (back) => this.audio.click(back),
      },
      opts.store.settings,
      base,
    );
    const click = (back?: boolean): void => this.audio.click(back);
    this.about = new AboutScreen(
      { host: opts.uiHost, click, onClose: () => this.afterOverlay() },
      { version: APP_VERSION, base, feedbackIsRemote: !!this.feedbackConfig.endpoint },
    );
    this.about.onFeedback(() => this.openFeedback('about'));
    this.briefing = new BriefingScreen({ host: opts.uiHost, click, onClose: () => undefined });
    this.feedback = new FeedbackScreen({
      host: opts.uiHost,
      appVersion: APP_VERSION,
      config: this.feedbackConfig,
      transport: createTransport(this.feedbackConfig),
      drafts: new DraftStore(openBrowserStorage()),
      quality: () => this.store.settings.quality,
      click,
      onClose: () => this.afterOverlay(),
    });
    this.input = new InputManager(window);
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
    if (this.store.migrated)
      ui.toast(
        'Progress from the previous version was carried over, with a few credits as thanks.',
        undefined,
        undefined,
        7000,
      );
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
      def.stops.map((s) => ({ at: s.at, kind: s.kind })),
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
    this.view = new MissionView(this.renderer.scene, this.rt);
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
  private applyConditions(): void {
    if (!this.world) return;
    const c = this.level.conditions[Math.min(this.conditionIndex, this.level.conditions.length - 1)];
    this.world.setConditions(c.weather, c.time);
    this.model?.setHeadlights(this.world.env.lightsOn);
    this.model?.setReflection(this.world.env.brightness);
    const q = this.quality();
    const snowing = this.level.weather === 'snow' || WEATHER[c.weather].snow;
    this.snow.setCount(snowing ? q.snowCount : 0, this.renderer.renderer.getPixelRatio());
    this.rain.setIntensity(WEATHER[c.weather].rain, q.rainDrops);
    this.audio.setAmbient({
      wind: snowing ? 0.9 : 0.4,
      birds: c.weather === 'clear' || c.weather === 'cloudy',
      aircraft: this.level.mission.kind === 'airport',
      night: c.time === 'night',
      water: !!this.level.ford || this.level.terrain.valleyDepth > 0,
      forest: clamp(this.level.scenery.trees / 700, 0, 1),
      bells: this.level.region !== undefined && c.time !== 'night' && this.level.mission.kind !== 'circuit',
      fog: c.weather === 'fog' ? 0.8 : c.weather === 'snow' ? 0.3 : 0,
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
    });
    e.on('checkpoint', ({ index, split }) => {
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
        cast ? `${cast.name}: "${cast.line}"` : `${onboard} on board`,
      );
      audio.pickup();
      this.analytics.track({ name: 'pickup', levelId: level.id, stopId: stop.def.id });
    });
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
      if (type === 'warn') ui.flash('Look out!', hazard.def.label);
      else if (type === 'land') audio.rockfall();
      else if (type === 'appear') audio.yeti();
    });
    e.on('thunder', ({ flash }) => {
      this.flashLevel = Math.max(this.flashLevel, flash);
      audio.thunder();
    });
    e.on('impact', ({ speed }) => {
      audio.crash(speed);
      this.rig.kick(clamp(speed / 25, 0.05, 0.6));
      const p = this.rt.body.position;
      this.effects.impact(p.x, p.y - 0.4, p.z, speed);
    });
    e.on('recovered', () => {
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
      (document.querySelector('#screen-menu:not([hidden]) #btn-credit') as HTMLElement | null)?.focus();
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

  private openLevels(): void {
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

  private async chooseLevel(id: string): Promise<void> {
    const def = this.levels.find((l) => l.id === id);
    if (!def || !isLevelUnlocked(def, this.progress())) return;
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
    this.leaveRun();
    this.freeGarage = false;
    this.openGarageScreen();
  }

  /** Leaves a run (pause/finish) back to the menu flow without choosing a menu screen. */
  private leaveRun(): void {
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
    if (this.flow.state === 'menu') this.flow.dispatch('start');
    else this.flow.dispatch('restart');
    this.inRun = true;
    this.buildRun();
    this.applyConditions();
    this.store.noteMissionPlayed();
    const level = this.level;
    const c = level.conditions[this.conditionIndex];
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
    this.ui.setCountdown(String(Math.ceil(this.rt.session.countdown)));
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
    (document.activeElement as HTMLElement | null)?.blur?.();
  }

  private endRun(r: RaceResult): void {
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
      delivered: rt.stops.onboard,
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
    const names = {
      levels: Object.fromEntries(this.levels.map((l) => [l.id, l.name])),
      vehicles: Object.fromEntries(this.vehicles.map((v) => [v.id, v.name])),
    };
    this.ui.showFinish(level, r, extra, names);
  }

  private pause(): void {
    if (!this.flow.dispatch('pause')) return;
    this.ui.showPause();
    this.input.captureKeys = false;
    this.audio.setDriving(false);
    this.touch.setVisible(false);
  }

  private resume(): void {
    if (!this.flow.dispatch('resume')) return;
    this.ui.hidePause();
    this.input.captureKeys = true;
    this.audio.setDriving(true);
    this.last = performance.now();
    this.updateTouch();
    (document.activeElement as HTMLElement | null)?.blur?.();
  }

  private restart(): void {
    if (!this.flow.can('restart')) return;
    // A restart never shows the briefing again: straight back to the grid.
    this.beginRun();
  }

  private quitToMenu(): void {
    if (!this.flow.dispatch('quit')) return;
    this.leaveRun();
    this.showMenu();
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
          ds.wet = sf.id === 'wetAsphalt';
          ds.water = clamp(rt.status.waterDepth / 0.6, 0, 1);
          ds.surface = sf.id === 'rocky' ? 'gravel' : sf.id === 'grass' ? 'dirt' : sf.id === 'wetAsphalt' ? 'asphalt' : sf.id;
        }
      }
      ds.dt = dt;
      this.audio.update(ds);
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
    const speed = Math.abs(b.speed);
    if (
      h.canToggleDrive &&
      h.driveMode === '4x2' &&
      speed > 3 &&
      ((loose > 0.45 && wheel?.surface.id !== 'asphalt') || (b.slip > 2.5 && wetRoad))
    ) {
      out.push({ text: '4x4 recommended', tone: 'info' });
    }
    if (wetRoad && speed > 14 && out.length < 2) out.push({ text: 'Wet road', tone: 'info' });
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
      if (gate.state === 'active') h.prompt = `Guests boarding... ${Math.round(gate.progress * 100)}%`;
      else if (Math.abs(d) < STOP_RADIUS + 1 && speed > 1.6)
        h.prompt = 'Slow down and stop in the yellow zone';
      else if (d < 90 && d > STOP_RADIUS) h.prompt = 'Pickup ahead: stop in the yellow zone';
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
          particlesAlive: this.effects.particles.alive,
          scene: this.garageActive() ? 'garage' : 'world',
          garageVehicle: this.garage?.shownVehicleId ?? null,
          garageView: this.garage?.view ?? null,
        };
      },
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
    this.feedback.dispose();
    this.about.dispose();
    this.briefing.dispose();
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
