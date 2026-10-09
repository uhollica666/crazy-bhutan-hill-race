import { Vector3 } from 'three';
import { AudioEngine } from '../audio/AudioEngine';
import { clamp } from '../core/math';
import { getLevel } from '../data/levels';
import { getVehicle } from '../data/vehicles';
import type { LevelDef, VehicleDef } from '../data/types';
import { AutoDriver } from '../dev/AutoDriver';
import { RaceSession } from '../gameplay/RaceSession';
import { InputManager } from '../input/InputManager';
import { VehicleBody } from '../physics/VehicleBody';
import { createVehicleInput } from '../physics/types';
import { CameraRig } from '../render/CameraRig';
import { GameRenderer } from '../render/GameRenderer';
import { QUALITY } from '../render/quality';
import { VehicleModel } from '../render/VehicleModel';
import { World3D } from '../render/World3D';
import type { QualityLevel, Settings } from '../storage/SaveStore';
import { SaveStore } from '../storage/SaveStore';
import { MiniMap } from '../ui/MiniMap';
import { TouchControls } from '../ui/TouchControls';
import { UI } from '../ui/UI';
import { createRoadHit } from '../world/Road';
import { Course } from '../world/Course';
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
  levelId?: string;
}

/** Yields so the loading screen can paint; falls back to a timer when rAF is throttled (background tabs). */
const nextFrame = (): Promise<void> =>
  new Promise((r) => {
    requestAnimationFrame(() => r());
    window.setTimeout(r, 60);
  });

/**
 * Composition root. Owns the loop and wires input -> physics -> gameplay -> render/audio/UI,
 * but contains no rule logic of its own: rules live in RaceSession / GameFlow, motion in VehicleBody.
 */
export class Game {
  readonly flow = new GameFlow();
  readonly store: SaveStore;
  readonly ui: UI;
  readonly audio = new AudioEngine();
  readonly input: InputManager;

  private renderer!: GameRenderer;
  private rig = new CameraRig();
  private level!: LevelDef;
  private vehicleDef!: VehicleDef;
  private course!: Course;
  private world!: World3D;
  private body!: VehicleBody;
  private model!: VehicleModel;
  private session!: RaceSession;
  private minimap!: MiniMap;
  private touch!: TouchControls;
  private ai: AutoDriver | null = null;

  private readonly cmd = createVehicleInput();
  private readonly hit = createRoadHit();
  private readonly head = { x: 0, z: -1 };
  private readonly camPos = new Vector3();
  private acc = 0;
  private time = 0;
  private last = 0;
  private fpsEma = 60;
  private minimapTimer = 0;
  private debugTimer = 0;
  private lastSteps = 0;
  private physicsMs = 0;
  private touchDetected = false;
  private running = false;
  private rafId = 0;
  private lastProgress = 0;
  private wasHidden = false;

  constructor(private readonly opts: GameOptions) {
    this.store = opts.store;
    this.ui = new UI(
      opts.uiHost,
      {
        start: () => this.beginRun(),
        resume: () => this.resume(),
        restart: () => this.restart(),
        quit: () => this.quitToMenu(),
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
    this.level = getLevel(opts.levelId ?? 'pass-run');
    this.vehicleDef = getVehicle(this.level.vehicleId);

    ui.showLoading('Laying out the road...', 0.25);
    await nextFrame();
    this.course = new Course(this.level);

    ui.showLoading('Raising the mountains...', 0.55);
    await nextFrame();
    this.world = new World3D(this.renderer.scene, this.course, this.renderer.profile);

    ui.showLoading('Fuelling the tour car...', 0.85);
    await nextFrame();
    this.body = new VehicleBody(this.vehicleDef);
    this.model = new VehicleModel(this.vehicleDef);
    this.renderer.scene.add(this.model.root, this.model.blob);
    this.model.setBlobVisible(!this.renderer.profile.shadows);
    this.world.env.sun.target.updateMatrixWorld();
    this.rig.setFar(this.renderer.profile.cameraFar);
    this.minimap = new MiniMap(ui.minimapCanvas);
    this.minimap.setCourse(this.course);
    ui.setRoute(this.level.checkpoints.map((c) => c.at));

    this.touch = new TouchControls(this.input.touch);
    opts.uiHost.appendChild(this.touch.el);
    if (opts.autodrive) this.ai = new AutoDriver(this.course);

    this.touchDetected = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    this.bindEvents();
    this.applySettings({}, true);
    this.resetCar();
    this.rig.orbit = true;
    this.rig.snap();

    this.running = true;
    this.last = performance.now();
    this.rafId = requestAnimationFrame(this.frame);
    ui.hideLoading();
    this.showMenu();
  }

  // ------------------------------------------------------------------ wiring

  private bindEvents(): void {
    this.input.events.on('pause', () => {
      if (this.flow.state === 'playing' && this.session.isActive) this.pause();
      else if (this.flow.state === 'paused' && !this.ui.settingsOpen) this.resume();
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
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.wasHidden = true;
        if (this.flow.state === 'playing' && this.session.isActive) this.pause();
      }
    });
  }

  private readonly onResize = (): void => {
    const { width, height } = this.renderer.applySize();
    this.rig.resize(width, height);
  };

  private applySettings(patch: Partial<Settings>, initial = false): void {
    const before = this.store.settings.quality;
    const s = Object.keys(patch).length ? this.store.updateSettings(patch) : this.store.settings;
    this.audio.setLevels(s);
    if (initial || s.quality !== before) {
      this.renderer.setQuality(s.quality as QualityLevel);
      this.world.applyQuality(QUALITY[s.quality]);
      this.model.setBlobVisible(!QUALITY[s.quality].shadows);
      this.rig.setFar(QUALITY[s.quality].cameraFar);
      this.onResize();
    }
    if (patch.musicVolume !== undefined) {
      if (s.musicVolume > 0) this.audio.startMusic();
      else this.audio.stopMusic();
    }
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
    this.touch.setVisible(wanted && this.flow.state === 'playing');
  }

  // ------------------------------------------------------------------ flow

  private showMenu(): void {
    this.ui.hideHud();
    this.ui.hidePause();
    this.ui.hideFinish();
    this.ui.showMenu(this.level, this.store.levelProgress(this.level.id), this.vehicleDef.name);
    this.input.captureKeys = false;
    this.audio.setDriving(false);
    this.touch.setVisible(false);
    this.rig.orbit = true;
    this.rig.intro = 0;
  }

  private resetCar(): void {
    const p = this.course.poseAt(this.course.startS);
    this.body.place(this.course, p.x, p.z, p.tx, p.tz);
    this.acc = 0;
    this.model.sync(this.body, 1, this.course);
  }

  /** Starts (or restarts) the run from the grid. */
  private beginRun(): void {
    if (this.flow.state === 'menu') this.flow.dispatch('start');
    else this.flow.dispatch('restart');
    const level = this.level;
    this.session = new RaceSession(
      level,
      {
        checkpointS: this.course.checkpointS,
        finishS: this.course.finishS,
        gateHalfWidth: this.course.road.wallOffset,
      },
      this.course.startS,
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
      this.world.gates.setNext(index + 1);
      this.audio.checkpoint();
    });
    this.session.events.on('finish', (r) => this.endRun(r));
    this.session.events.on('timeout', (r) => this.endRun(r));

    this.ui.hideMenu();
    this.ui.hidePause();
    this.ui.hideFinish();
    this.ui.showHud();
    this.ui.setCountdown(String(Math.ceil(this.session.countdown)));
    this.world.gates.setNext(0);
    this.resetCar();
    this.touch.reset();
    this.rig.orbit = false;
    this.rig.intro = 1;
    this.rig.snap();
    this.input.captureKeys = true;
    this.audio.setDriving(true);
    this.updateTouch();
    (document.activeElement as HTMLElement | null)?.blur?.();
  }

  private endRun(r: import('../gameplay/RaceSession').RaceResult): void {
    this.flow.dispatch('finish');
    const done = r.status === 'completed';
    const rec = done
      ? this.store.recordCompletion(this.level.id, r.time, r.medal)
      : { newBest: false, newMedal: false };
    if (done) this.audio.finish();
    else this.audio.fail();
    this.input.captureKeys = false;
    this.touch.setVisible(false);
    this.audio.setDriving(false);
    this.rig.orbit = true;
    this.ui.setCountdown(null);
    this.ui.showFinish(this.level, r, { ...rec, best: this.store.levelProgress(this.level.id).bestTime });
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
    this.resetCar();
    this.rig.snap();
    this.world.gates.setNext(0);
    this.showMenu();
  }

  /** Puts the car back on the road at the last checkpoint (or the start line). */
  private recover(): void {
    if (this.flow.state !== 'playing' || this.session.phase !== 'running') return;
    const s = this.session.recover();
    const p = this.course.poseAt(s);
    this.body.place(this.course, p.x, p.z, p.tx, p.tz);
    this.acc = 0;
    this.rig.snap();
    this.touch.reset();
    this.ui.flash('Back on the road', 'Recovered to the last checkpoint');
  }

  // ------------------------------------------------------------------ loop

  private readonly frame = (now: number): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.frame);
    const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    if (this.wasHidden && !document.hidden) this.wasHidden = false;
    this.time += dt;
    this.fpsEma += (1 / Math.max(dt, 1e-4) - this.fpsEma) * 0.05;

    const state = this.flow.state;
    let alpha = 1;
    if (state === 'playing' || state === 'finished') {
      const t0 = performance.now();
      this.stepPhysics(dt, state === 'finished');
      this.physicsMs += (performance.now() - t0 - this.physicsMs) * 0.1;
      alpha = this.acc / PHYSICS_STEP;
    } else if (state === 'menu') {
      // Idle: keep suspension settled for the menu backdrop.
      this.body.step(PHYSICS_STEP, IDLE, this.course);
    }

    this.model.sync(this.body, alpha, this.course);
    if (state === 'playing' && this.session.phase === 'countdown') {
      this.rig.intro = clamp(this.session.countdown / 3, 0, 1);
    } else if (state === 'playing') {
      this.rig.intro = Math.max(0, this.rig.intro - dt * 2);
    }
    if (state !== 'paused') this.rig.update(dt, this.body, alpha, this.course, this.time);
    this.camPos.copy(this.rig.camera.position);
    this.world.update(this.time, this.camPos, this.body.position, this.lastProgress);

    this.renderer.render(this.rig.camera);
    this.afterFrame(dt, state);
  };

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
    }
  }

  /** Per fixed step: progress along the road feeds the race rules; also world-escape guards. */
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
    if (this.body.overturnedFor > 3 && this.session.phase === 'running') {
      this.ui.toast('Car overturned - righting it at the last checkpoint');
      this.recover();
    }
  }

  private afterFrame(dt: number, state: string): void {
    const speed = this.body.speed;
    if (state === 'playing' || state === 'finished') {
      const b = this.body;
      this.audio.update({
        speed,
        topSpeed: this.vehicleDef.engine.topSpeed,
        gearTopSpeeds: this.vehicleDef.engine.gearTopSpeeds,
        throttle: this.cmd.throttle,
        braking: b.braking > 0,
        slip: b.slip,
        grounded: b.groundedWheels > 0,
      });
    } else if (state === 'menu') {
      this.audio.update({
        speed: 0,
        topSpeed: this.vehicleDef.engine.topSpeed,
        gearTopSpeeds: this.vehicleDef.engine.gearTopSpeeds,
        throttle: 0,
        braking: false,
        slip: 0,
        grounded: true,
      });
    }

    if (state === 'playing') {
      const s = this.session;
      this.ui.updateHud({
        speedKmh: Math.abs(speed) * 3.6,
        time: s.time,
        timeLeft: s.timeLeft,
        checkpointsDone: s.nextCheckpoint,
        checkpointsTotal: s.totalCheckpoints,
        objective:
          s.nextCheckpoint < s.totalCheckpoints
            ? `Checkpoint ${s.nextCheckpoint + 1}/${s.totalCheckpoints}: ${this.level.checkpoints[s.nextCheckpoint].label}`
            : `Final stretch: ${this.level.finishLabel}`,
        progress: this.lastProgress,
        lowTime: s.phase === 'running' && s.timeLeft < 15,
      });
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
          `fps ${this.fpsEma.toFixed(0)}  physics ${this.physicsMs.toFixed(2)}ms (${this.lastSteps} steps)`,
          `draw calls ${st.calls}  tris ${(st.triangles / 1000).toFixed(1)}k  geo ${st.geometries}  tex ${st.textures}`,
          `quality ${this.renderer.level}  dpr ${this.renderer.renderer.getPixelRatio().toFixed(2)}`,
          `pos ${p.x.toFixed(0)},${p.y.toFixed(1)},${p.z.toFixed(0)}  v ${speed.toFixed(1)}m/s  wheels ${this.body.groundedWheels}`,
          `state ${this.flow.state}/${this.flow.state === 'menu' ? '-' : this.session.phase}${mem ? `  heap ${(mem.usedJSHeapSize / 1048576).toFixed(0)}MB` : ''}`,
        ].join('\n'),
      );
    }
  }

  // ------------------------------------------------------------------ debug / test API

  /** Read-only snapshot + a few helpers, exposed on window only with ?debug=1. */
  debugApi(): Record<string, unknown> {
    return {
      state: () => ({
        flow: this.flow.state,
        phase: this.flow.state === 'menu' ? null : this.session.phase,
        time: this.flow.state === 'menu' ? 0 : this.session.time,
        speed: this.body.speed,
        checkpoints: this.flow.state === 'menu' ? 0 : this.session.nextCheckpoint,
        position: this.body.position.toArray(),
        grounded: this.body.groundedWheels,
        progress: this.lastProgress,
        fps: this.fpsEma,
        stats: this.renderer.stats(),
        quality: this.renderer.level,
      }),
      /** Teleport onto the road at a distance (for tests). */
      warp: (s: number) => {
        const p = this.course.poseAt(s);
        this.body.place(this.course, p.x, p.z, p.tx, p.tz);
        this.rig.snap();
      },
      cmd: () => ({ ...this.cmd }),
      course: () => ({
        length: this.course.road.length,
        startS: this.course.startS,
        finishS: this.course.finishS,
        checkpointS: this.course.checkpointS,
      }),
    };
  }

  dispose(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    this.input.dispose();
    this.audio.dispose();
    this.world.dispose();
    this.model.dispose();
    this.renderer.dispose();
  }
}

const IDLE = createVehicleInput();
