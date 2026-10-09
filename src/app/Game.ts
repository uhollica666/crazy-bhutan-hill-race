import { Vector3 } from 'three';
import { AudioEngine } from '../audio/AudioEngine';
import { clamp } from '../core/math';
import { levelTimes, listLevels, paceFor } from '../data/levels';
import { getVehicle, listVehicles, vehicleStats } from '../data/vehicles';
import type { LevelDef, VehicleDef } from '../data/types';
import { AutoDriver } from '../dev/AutoDriver';
import type { RaceResult } from '../gameplay/RaceSession';
import { MotionSampler } from '../gameplay/MotionSampler';
import { RaceSession } from '../gameplay/RaceSession';
import {
  availableVehicles,
  canUseVehicle,
  describeRule,
  isLevelUnlocked,
  isVehicleUnlocked,
  newlyUnlocked,
  resolveSelection,
} from '../gameplay/progression';
import { InputManager } from '../input/InputManager';
import { MenuNav } from '../input/MenuNav';
import { VehicleBody } from '../physics/VehicleBody';
import { createVehicleInput } from '../physics/types';
import { AdaptiveResolution } from '../render/adaptive';
import { CameraRig } from '../render/CameraRig';
import { Snow, VehicleEffects } from '../render/effects';
import { GameRenderer } from '../render/GameRenderer';
import { QUALITY } from '../render/quality';
import { VehicleModel } from '../render/VehicleModel';
import { World3D } from '../render/World3D';
import type { Settings } from '../storage/SaveStore';
import { SaveStore } from '../storage/SaveStore';
import { MiniMap } from '../ui/MiniMap';
import { TouchControls } from '../ui/TouchControls';
import type { FinishExtra, GarageModel, HudState, LevelCardModel } from '../ui/UI';
import { UI } from '../ui/UI';
import { Course } from '../world/Course';
import { createRoadHit } from '../world/Road';
import { GameFlow } from './GameFlow';

/** Fixed physics step (s). Rendering interpolates between steps, so behaviour is frame-rate independent. */
export const PHYSICS_STEP = 1 / 120;
const MAX_STEPS_PER_FRAME = 10;

export interface GameOptions {
  viewport: HTMLElement;
  uiHost: HTMLElement;
  store: SaveStore;
  debug: boolean;
  autodrive: boolean;
  /** Disable the adaptive resolution controller (deterministic screenshots / benchmarks). */
  fixedResolution: boolean;
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
};

/**
 * Composition root. Owns the loop and wires input -> physics -> gameplay -> render/audio/UI.
 * Rules live in RaceSession / ComfortMeter / progression, motion in VehicleBody; this class only coordinates.
 */
export class Game {
  readonly flow = new GameFlow();
  readonly store: SaveStore;
  readonly ui: UI;
  readonly audio = new AudioEngine();
  readonly input: InputManager;

  private readonly levels = listLevels();
  private readonly vehicles = listVehicles();
  private renderer!: GameRenderer;
  private readonly rig = new CameraRig();
  private level!: LevelDef;
  private vehicleDef!: VehicleDef;
  private course!: Course;
  private world: World3D | null = null;
  private body!: VehicleBody;
  private model: VehicleModel | null = null;
  private session!: RaceSession;
  private minimap!: MiniMap;
  private touch!: TouchControls;
  private nav!: MenuNav;
  private effects!: VehicleEffects;
  private snow = new Snow();
  private ai: AutoDriver | null = null;
  private adaptive: AdaptiveResolution | null = null;
  private menuScreen: MenuScreen = 'menu';
  private previewId = '';

  private readonly cmd = createVehicleInput();
  private readonly hit = createRoadHit();
  private readonly head = { x: 0, z: -1 };
  private readonly camPos = new Vector3();
  private readonly hud: HudState = {
    speedKmh: 0,
    timerText: '',
    timerLabel: '',
    lowTime: false,
    checkpointsDone: 0,
    objective: '',
    progress: 0,
    comfort: null,
  };
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
  private readonly motion = new MotionSampler();
  private warnCooldown = 0;
  private warnHold = 0;

  constructor(private readonly opts: GameOptions) {
    this.store = opts.store;
    this.ui = new UI(
      opts.uiHost,
      {
        openLevels: () => this.openLevels(),
        chooseLevel: (id) => void this.chooseLevel(id),
        previewVehicle: (id) => this.previewVehicle(id),
        startMission: () => this.startMission(),
        back: () => this.back(),
        resume: () => this.resume(),
        restart: () => this.restart(),
        quit: () => this.quitToMenu(),
        openGarage: () => this.openGarageFromRun(),
        nextMission: () => void this.nextMission(),
        pause: () => this.pause(),
        recover: () => this.recover(),
        settingsChanged: (p) => this.applySettings(p),
        click: (back) => this.audio.click(back),
      },
      opts.store.settings,
    );
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
    this.renderer.scene.add(this.snow.points);
    this.effects = new VehicleEffects();
    this.renderer.scene.add(this.effects.particles.points, this.effects.skids.mesh);
    this.minimap = new MiniMap(ui.minimapCanvas);
    this.touch = new TouchControls(this.input.touch);
    opts.uiHost.appendChild(this.touch.el);
    this.nav = new MenuNav(opts.uiHost, () => this.ui.menuActive && this.flow.state !== 'playing');

    const sel = resolveSelection(this.store.selection, this.levels, this.vehicles, this.store.progress);
    ui.showLoading(`Loading ${sel.level.name}...`, 0.3);
    await this.loadLevel(sel.level);
    ui.showLoading('Fuelling the tour car...', 0.85);
    await nextFrame();
    this.setVehicle(sel.vehicle);

    this.touchDetected = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    this.bindEvents();
    this.applySettings({}, true);
    if (opts.autodrive) this.ai = new AutoDriver(this.course, this.vehicleDef);
    if (!opts.fixedResolution) {
      const target = this.store.settings.quality === 'low' ? 30 : 45;
      this.adaptive = new AdaptiveResolution(target);
    }

    this.running = true;
    this.last = performance.now();
    this.rafId = requestAnimationFrame(this.frame);
    ui.hideLoading();
    this.showMenu();
    if (this.store.migrated)
      ui.toast('Progress from the previous version was carried over.', undefined, undefined, 5000);
  }

  // ------------------------------------------------------------------ level / vehicle assets

  private disposeLevel(): void {
    this.world?.dispose();
    this.world = null;
    this.effects?.reset();
  }

  private async loadLevel(def: LevelDef): Promise<void> {
    if (this.level?.id === def.id && this.world) return;
    this.loadingLevel = true;
    this.ui.showLoading(`Loading ${def.name}...`, 0.4);
    await nextFrame();
    this.disposeLevel();
    this.level = def;
    this.course = new Course(def);
    await nextFrame();
    this.world = new World3D(this.renderer.scene, this.course, this.renderer.profile);
    this.minimap.setCourse(this.course);
    this.ui.setRoute(def.checkpoints.map((c) => c.at));
    this.audio.setAmbient({
      wind: def.weather === 'snow' ? 0.9 : 0.4,
      birds: def.weather !== 'snow',
      aircraft: def.mission.kind === 'airport',
    });
    this.applyWeather();
    if (this.opts.autodrive && this.vehicleDef) this.ai = new AutoDriver(this.course, this.vehicleDef);
    this.loadingLevel = false;
    this.ui.hideLoading();
  }

  private applyWeather(): void {
    const q = this.renderer.profile;
    this.snow.setCount(
      this.level.weather === 'snow' ? q.snowCount : 0,
      this.renderer.renderer.getPixelRatio(),
    );
  }

  private setVehicle(def: VehicleDef): void {
    if (this.model) {
      this.renderer.scene.remove(this.model.root, this.model.blob);
      this.model.dispose();
    }
    this.vehicleDef = def;
    this.previewId = def.id;
    this.body = new VehicleBody(def);
    this.model = new VehicleModel(def);
    this.renderer.scene.add(this.model.root, this.model.blob);
    this.model.setBlobVisible(!this.renderer.profile.shadows);
    this.rig.setVehicle(def);
    this.audio.setVehicle(def.audio);
    this.driveSound.topSpeed = def.engine.topSpeed;
    this.driveSound.gearTopSpeeds = def.engine.gearTopSpeeds;
    if (this.opts.autodrive) this.ai = new AutoDriver(this.course, def);
    this.resetCar();
    this.rig.snap();
  }

  // ------------------------------------------------------------------ wiring

  private bindEvents(): void {
    this.input.events.on('pause', () => {
      if (this.flow.state === 'playing' && this.session.isActive) this.pause();
      else if (this.flow.state === 'paused' && !this.ui.settingsOpen) this.resume();
      else if (this.flow.state === 'menu' && !this.ui.settingsOpen) this.nav.back();
    });
    this.input.events.on('recover', () => this.recover());
    this.input.events.on('restart', () => {
      if (this.flow.state === 'playing' || this.flow.state === 'paused' || this.flow.state === 'finished')
        this.restart();
    });
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
    window.addEventListener(
      'pointerdown',
      (e) => {
        if (e.pointerType === 'touch' && !this.touchDetected) {
          this.touchDetected = true;
          this.updateTouch();
        }
      },
      { passive: true },
    );
    window.addEventListener('resize', this.onResize);
    window.addEventListener('orientationchange', this.onResize);
    // Never leave a control "stuck" when the app loses focus or a touch is interrupted.
    window.addEventListener('blur', () => this.cancelInput());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.cancelInput();
        if (this.flow.state === 'playing' && this.session.isActive) this.pause();
      }
    });
  }

  private cancelInput(): void {
    this.touch.reset();
    this.input.pressed.clear();
    this.cmd.steer = this.cmd.throttle = this.cmd.brake = 0;
  }

  private readonly onResize = (): void => {
    const { width, height } = this.renderer.applySize();
    this.rig.resize(width, height);
    this.syncPixelRatio();
  };

  private syncPixelRatio(): void {
    const pr = this.renderer.renderer.getPixelRatio();
    this.effects.particles.setPixelRatio(pr);
    this.applyWeather();
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
    this.rig.shakeScale = this.touchWanted() ? 0.6 : 1;
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
    this.rig.shakeScale = wanted ? 0.6 : 1;
    this.touch.setVisible(wanted && this.flow.state === 'playing');
  }

  // ------------------------------------------------------------------ menus / selection

  private progress() {
    return this.store.progress;
  }

  private levelCards(): LevelCardModel[] {
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
      };
    });
  }

  private garageModel(): GarageModel {
    const l = this.level;
    return {
      level: {
        name: l.name,
        objective: l.objective,
        tip: l.tip,
        comfort: l.mission.comfort,
        deadline: l.mission.timerStyle === 'deadline',
      },
      index: Math.max(
        0,
        this.vehicles.findIndex((v) => v.id === this.vehicleDef.id),
      ),
      vehicles: this.vehicles.map((v) => {
        const rec = this.store.vehicleRecord(l.id, v.id);
        const t = levelTimes(l, paceFor(l, v));
        return {
          id: v.id,
          name: v.name,
          blurb: v.blurb,
          stats: vehicleStats(v),
          locked: !isVehicleUnlocked(v, this.progress()),
          lockText: v.unlock ? describeRule(v.unlock, this.levels) : '',
          eligible: canUseVehicle(l, v.id),
          best:
            rec.completions > 0 ? { time: rec.bestTime, medal: rec.medal, comfort: rec.bestComfort } : null,
          targets: t,
        };
      }),
    };
  }

  private showMenu(): void {
    this.menuScreen = 'menu';
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
    this.ui.showLevels(this.levelCards());
    this.audio.whoosh();
  }

  private async chooseLevel(id: string): Promise<void> {
    const def = this.levels.find((l) => l.id === id);
    if (!def || !isLevelUnlocked(def, this.progress())) return;
    await this.loadLevel(def);
    // First visit to a mission: show the recommended vehicle. Otherwise keep the current one when it is allowed.
    const usable = availableVehicles(def, this.vehicles, this.progress());
    const recommended = usable.find((v) => v.id === def.vehicles[0]);
    const keep = usable.find((v) => v.id === this.vehicleDef.id);
    const firstVisit = this.store.levelRecord(def.id).completions === 0;
    const pick = (firstVisit ? recommended : keep) ?? keep ?? recommended ?? usable[0] ?? this.vehicles[0];
    if (pick.id !== this.vehicleDef.id || !this.model) this.setVehicle(pick);
    else this.resetCar();
    this.store.setSelection(def.id, pick.id);
    this.openGarageScreen();
  }

  private openGarageScreen(): void {
    this.menuScreen = 'garage';
    this.rig.setShowcase(true);
    this.rig.snap();
    this.ui.showGarage(this.garageModel());
    this.audio.whoosh();
  }

  private previewVehicle(id: string): void {
    if (id === this.previewId) return;
    this.setVehicle(getVehicle(id));
    this.rig.setShowcase(true);
  }

  private startMission(): void {
    const v = this.vehicleDef;
    if (!isVehicleUnlocked(v, this.progress()) || !canUseVehicle(this.level, v.id)) return;
    this.store.setSelection(this.level.id, v.id);
    this.beginRun();
  }

  private back(): void {
    if (this.menuScreen === 'garage') {
      this.menuScreen = 'levels';
      this.rig.setShowcase(false);
      this.rig.orbit = true;
      this.ui.showLevels(this.levelCards());
    } else if (this.menuScreen === 'levels') {
      this.showMenu();
    }
  }

  private async nextMission(): Promise<void> {
    const i = this.levels.findIndex((l) => l.id === this.level.id);
    const next = this.levels.slice(i + 1).find((l) => isLevelUnlocked(l, this.progress()));
    this.leaveRun();
    if (next) await this.chooseLevel(next.id);
    else this.openLevels();
  }

  private openGarageFromRun(): void {
    this.leaveRun();
    this.openGarageScreen();
  }

  /** Leaves a run (pause/finish) back to the menu flow without choosing a menu screen. */
  private leaveRun(): void {
    if (this.flow.state !== 'menu') this.flow.dispatch('quit');
    this.ui.hideHud();
    this.ui.hidePause();
    this.ui.hideFinish();
    this.input.captureKeys = false;
    this.audio.setDriving(false);
    this.touch.setVisible(false);
    this.world?.gates.setNext(0);
    this.resetCar();
    this.rig.snap();
  }

  // ------------------------------------------------------------------ flow

  private resetCar(): void {
    const p = this.course.poseAt(this.course.startS);
    this.body.place(this.course, p.x, p.z, p.tx, p.tz);
    this.acc = 0;
    this.motion.reset();
    this.effects?.reset();
    this.model?.sync(this.body, 1, this.course);
  }

  /** Starts (or restarts) the run from the grid. */
  private beginRun(): void {
    if (this.flow.state === 'menu') this.flow.dispatch('start');
    else this.flow.dispatch('restart');
    const level = this.level;
    const times = levelTimes(level, paceFor(level, this.vehicleDef));
    this.session = new RaceSession(
      level,
      {
        checkpointS: this.course.checkpointS,
        finishS: this.course.finishS,
        gateHalfWidth: this.course.road.wallOffset,
      },
      this.course.startS,
      { vehicleId: this.vehicleDef.id, times },
    );
    this.session.events.on('countdown', (n) => {
      this.ui.setCountdown(String(n));
      this.audio.countdown(n);
    });
    this.session.events.on('go', () => {
      this.ui.setCountdown('GO!');
      this.audio.go();
      window.setTimeout(() => this.ui.setCountdown(null), 700);
    });
    this.session.events.on('checkpoint', ({ index, split }) => {
      const total = level.checkpoints.length;
      this.ui.flash(
        `Checkpoint ${index + 1}/${total}`,
        `${level.checkpoints[index].label} - ${split.toFixed(1)}s`,
      );
      this.world?.gates.setNext(index + 1);
      this.audio.checkpoint();
    });
    this.session.events.on('finish', (r) => this.endRun(r));
    this.session.events.on('timeout', (r) => this.endRun(r));

    this.ui.hideFlow();
    this.ui.hidePause();
    this.ui.hideFinish();
    this.ui.showHud(level.mission.comfort, level.mission.timerLabel);
    this.ui.setCountdown(String(Math.ceil(this.session.countdown)));
    this.world?.gates.setNext(0);
    this.resetCar();
    this.touch.reset();
    this.rig.setShowcase(false);
    this.rig.orbit = false;
    this.rig.intro = 1;
    this.rig.snap();
    this.input.captureKeys = true;
    this.audio.setDriving(true);
    this.warnCooldown = 0;
    this.warnHold = 0;
    this.updateTouch();
    (document.activeElement as HTMLElement | null)?.blur?.();
  }

  private endRun(r: RaceResult): void {
    this.flow.dispatch('finish');
    const done = r.status === 'completed';
    const before = structuredClone(this.store.progress);
    const outcome = done
      ? this.store.recordCompletion({
          levelId: this.level.id,
          vehicleId: r.vehicleId,
          time: r.time,
          medal: r.medal,
          score: r.score,
          comfort: r.comfort,
        })
      : { newBest: false, newMedal: false, newScoreBest: false, previousBest: null };
    const unlocked = done
      ? newlyUnlocked(this.levels, this.vehicles, before, this.store.progress)
      : { levels: [], vehicles: [] };
    const i = this.levels.findIndex((l) => l.id === this.level.id);
    const next = this.levels.slice(i + 1).find((l) => isLevelUnlocked(l, this.store.progress));
    const times = levelTimes(this.level, paceFor(this.level, this.vehicleDef));
    const extra: FinishExtra = {
      ...outcome,
      best: this.store.vehicleRecord(this.level.id, r.vehicleId).bestTime,
      unlockedLevels: unlocked.levels.map((l) => l.id),
      unlockedVehicles: unlocked.vehicles.map((v) => v.id),
      nextMissionName: done && next ? next.name : null,
      medals: times,
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
    this.ui.showFinish(this.level, r, extra, names);
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
    this.beginRun();
  }

  private quitToMenu(): void {
    if (!this.flow.dispatch('quit')) return;
    this.leaveRun();
    this.showMenu();
  }

  /** Puts the car back on the road at the last checkpoint (or the start line). */
  private recover(): void {
    if (this.flow.state !== 'playing' || this.session.phase !== 'running') return;
    const s = this.session.recover();
    const p = this.course.poseAt(s);
    this.body.place(this.course, p.x, p.z, p.tx, p.tz);
    this.acc = 0;
    this.motion.reset();
    this.effects.reset();
    this.rig.snap();
    this.touch.reset();
    this.ui.flash('Back on the road', 'Recovered to the last checkpoint');
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
    if (this.loadingLevel || !this.world || !this.model) return;

    const state = this.flow.state;
    let alpha = 1;
    if (state === 'playing' || state === 'finished') {
      const p0 = performance.now();
      this.stepPhysics(dt, state === 'finished');
      this.physicsMs += (performance.now() - p0 - this.physicsMs) * 0.1;
      alpha = this.acc / PHYSICS_STEP;
    } else if (state === 'menu') {
      // Idle: keep the suspension settled for the menu / garage backdrop.
      this.body.step(PHYSICS_STEP, IDLE, this.course);
      this.nav.pollGamepad(now);
    } else if (state === 'paused') {
      this.nav.pollGamepad(now);
    }
    if (state === 'finished') this.nav.pollGamepad(now);

    this.model.sync(this.body, alpha, this.course, this.time, this.currentRpm());
    if (state === 'playing' && this.session.phase === 'countdown') {
      this.rig.intro = clamp(this.session.countdown / 3, 0, 1);
    } else if (state === 'playing') {
      this.rig.intro = Math.max(0, this.rig.intro - dt * 2);
    }
    if (state !== 'paused') this.rig.update(dt, this.body, alpha, this.course, this.time);
    this.camPos.copy(this.rig.camera.position);
    this.world.update(this.time, this.camPos, this.body.position, this.lastProgress);
    if (this.level.weather === 'snow') this.snow.update(this.time, this.camPos);
    this.effects.update(dt, this.body, this.course, state === 'playing' || state === 'finished');

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

  private currentRpm(): number {
    return clamp(Math.abs(this.body.speed) / this.vehicleDef.engine.topSpeed, 0, 1);
  }

  private stepPhysics(dt: number, finished: boolean): void {
    const cmd = this.cmd;
    const phase = this.session.phase;
    if (finished) {
      cmd.steer = 0;
      cmd.throttle = 0;
      cmd.brake = 1;
    } else if (phase === 'countdown') {
      cmd.steer = cmd.throttle = cmd.brake = 0;
    } else if (this.ai) {
      this.ai.update(this.body, cmd);
    } else {
      this.input.read(cmd);
    }

    this.acc += dt;
    let steps = 0;
    while (this.acc >= PHYSICS_STEP && steps < MAX_STEPS_PER_FRAME) {
      this.body.step(PHYSICS_STEP, cmd, this.course);
      this.acc -= PHYSICS_STEP;
      steps++;
      if (!finished) this.afterStep();
    }
    if (steps === MAX_STEPS_PER_FRAME) this.acc = 0;
    this.lastSteps = steps;

    const impact = this.body.consumeImpact();
    if (impact > 2.5) {
      this.audio.crash(impact);
      this.rig.kick(clamp(impact / 25, 0.05, 0.6));
      this.effects.impact(this.body.position.x, this.body.position.y - 0.4, this.body.position.z, impact);
      if (!finished) this.session.feedImpact(impact);
    }
  }

  /** Per fixed step: progress along the road feeds the race rules; also comfort and world-escape guards. */
  private afterStep(): void {
    const p = this.body.position;
    const road = this.course.road;
    if (!Number.isFinite(p.x + p.y + p.z) || p.y < this.course.terrain.minHeight - 40) {
      this.recover();
      return;
    }
    road.project(p.x, p.z, this.hit);
    const span = this.course.finishS - this.course.startS;
    this.lastProgress = clamp((this.hit.s - this.course.startS) / span, 0, 1);
    this.session.update(PHYSICS_STEP, this.hit.s, this.hit.lateral);

    // Horizontal chassis acceleration -> passenger comfort (fixed-step, so frame-rate independent).
    if (this.motion.sample(this.body, PHYSICS_STEP) && this.session.comfort) {
      this.session.feedMotion(PHYSICS_STEP, this.motion.lateral, this.motion.longitudinal, this.motion.roll);
    }

    if (
      this.body.overturnedFor > this.vehicleDef.recovery.overturnSeconds &&
      this.session.phase === 'running'
    ) {
      this.ui.toast('Vehicle overturned - righting it at the last checkpoint');
      this.recover();
    }
  }

  private afterFrame(dt: number, state: string): void {
    const speed = this.body.speed;
    const ds = this.driveSound;
    if (state === 'playing' || state === 'finished' || state === 'menu') {
      const b = this.body;
      const playing = state !== 'menu';
      ds.speed = playing ? speed : 0;
      ds.throttle = playing ? this.cmd.throttle : 0;
      ds.braking = playing && b.braking > 0;
      ds.slip = playing ? b.slip : 0;
      ds.grounded = b.groundedWheels > 0;
      ds.offRoad = false;
      if (playing) {
        this.course.road.project(b.position.x, b.position.z, this.hit);
        ds.offRoad = Math.abs(this.hit.lateral) > this.course.road.halfWidth + 0.1;
      }
      ds.dt = dt;
      this.audio.update(ds);
    }

    if (state === 'playing') {
      const s = this.session;
      const h = this.hud;
      const deadline = this.level.mission.timerStyle === 'deadline';
      h.speedKmh = Math.abs(speed) * 3.6;
      h.timerText = formatClock(deadline ? s.timeLeft : s.time);
      h.timerLabel = this.level.mission.timerLabel;
      h.lowTime = s.phase === 'running' && s.timeLeft < 15;
      h.checkpointsDone = s.nextCheckpoint;
      h.objective =
        s.nextCheckpoint < s.totalCheckpoints
          ? `Checkpoint ${s.nextCheckpoint + 1}/${s.totalCheckpoints}: ${this.level.checkpoints[s.nextCheckpoint].label}`
          : `Final stretch: ${this.level.finishLabel}`;
      h.progress = this.lastProgress;
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
      this.minimapTimer += dt;
      if (this.minimapTimer > 0.1) {
        this.minimapTimer = 0;
        this.body.headingXZ(this.head);
        this.minimap.draw(
          this.body.position.x,
          this.body.position.z,
          Math.atan2(this.head.x, -this.head.z),
          s.nextCheckpoint,
        );
      }
    }

    this.debugTimer += dt;
    if (this.debugTimer > 0.25 && this.ui.debugVisible) {
      this.debugTimer = 0;
      const st = this.renderer.stats();
      const p = this.body.position;
      const mem = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
      this.ui.setDebug(
        [
          `fps ${this.fpsEma.toFixed(0)}  cpu ${this.cpuMs.toFixed(1)}ms  physics ${this.physicsMs.toFixed(2)}ms (${this.lastSteps} steps)`,
          `draw calls ${st.calls}  tris ${(st.triangles / 1000).toFixed(1)}k  geo ${st.geometries}  tex ${st.textures}`,
          `quality ${this.renderer.level}  dpr ${this.renderer.renderer.getPixelRatio().toFixed(2)}  res x${this.renderer.resolutionScale.toFixed(2)}`,
          `pos ${p.x.toFixed(0)},${p.y.toFixed(1)},${p.z.toFixed(0)}  v ${speed.toFixed(1)}m/s  wheels ${this.body.groundedWheels}`,
          `${this.level.id} / ${this.vehicleDef.id}  ${this.flow.state}${this.flow.state === 'menu' ? '' : '/' + this.session.phase}${mem ? `  heap ${(mem.usedJSHeapSize / 1048576).toFixed(0)}MB` : ''}`,
        ].join('\n'),
      );
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
      state: () => ({
        flow: this.flow.state,
        menu: this.menuScreen,
        phase: this.flow.state === 'menu' ? null : this.session.phase,
        time: this.flow.state === 'menu' ? 0 : this.session.time,
        speed: this.body.speed,
        checkpoints: this.flow.state === 'menu' ? 0 : this.session.nextCheckpoint,
        position: this.body.position.toArray(),
        grounded: this.body.groundedWheels,
        progress: this.lastProgress,
        fps: this.fpsEma,
        cpuMs: this.cpuMs,
        stats: this.renderer.stats(),
        quality: this.renderer.level,
        levelId: this.level.id,
        vehicleId: this.vehicleDef.id,
        comfort: this.flow.state !== 'menu' ? (this.session.comfort?.value ?? null) : null,
        pixelRatio: this.renderer.renderer.getPixelRatio(),
      }),
      /** Teleport onto the road at a distance (for tests). */
      warp: (s: number) => {
        const p = this.course.poseAt(s);
        this.body.place(this.course, p.x, p.z, p.tx, p.tz);
        this.motion.reset();
        this.rig.snap();
      },
      cmd: () => ({ ...this.cmd }),
      course: () => ({
        length: this.course.road.length,
        startS: this.course.startS,
        finishS: this.course.finishS,
        checkpointS: this.course.checkpointS,
      }),
      /** Bot-drive toggle so e2e tests can finish a level through the real UI flow. */
      autodrive: (on: boolean) => {
        this.ai = on
          ? new AutoDriver(this.course, this.vehicleDef, this.level.mission.comfort ? 5.5 : undefined)
          : null;
      },
    };
  }

  dispose(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    this.input.dispose();
    this.nav.dispose();
    this.audio.dispose();
    this.disposeLevel();
    this.model?.dispose();
    this.effects.dispose();
    this.snow.dispose();
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
