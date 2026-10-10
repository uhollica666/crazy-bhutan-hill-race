import { clamp, lerp } from '../core/math';
import type { VehicleDef } from '../data/types';
import { VOICES, voiceFor } from './voices';
import { surfaceVoice } from './surfaces';
import type { EngineVoice } from './voices';

export interface AudioLevels {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  muted: boolean;
  /** Environment (wind, birds, rain, river): optional so older callers keep working. */
  ambientVolume?: number;
  /** Music only is silenced (sound effects stay): optional so older callers keep working. */
  musicMuted?: boolean;
}

export interface DriveSound {
  speed: number;
  topSpeed: number;
  gearTopSpeeds: number[];
  throttle: number;
  braking: boolean;
  slip: number;
  grounded: boolean;
  /** True while a wheel is on the gravel verge. */
  offRoad: boolean;
  /** Frame time (s), for rpm smoothing. */
  dt: number;
  /** 0..1 how loose the surface under the wheels is (gravel, mud, rock crunch more). Optional. */
  loose?: number;
  /** True on a wet road: tyres hiss instead of rumble. Optional. */
  wet?: boolean;
  /** 0..1 depth of water the vehicle is wading through. Optional. */
  water?: number;
  /** What the tyres are on: asphalt | gravel | dirt | mud | water. Optional. */
  surface?: string;
  /** From the shared EngineSim (so the sound and the HUD agree). Optional: a fallback model is used otherwise. */
  rpm?: number;
  load?: number;
  shifting?: boolean;
  overrun?: boolean;
}

export interface AmbientDef {
  /** 0..1 base wind. */
  wind: number;
  birds: boolean;
  /** Occasional distant aircraft. */
  aircraft: boolean;
  /** Night ambience: crickets and the odd owl instead of birds. */
  night?: boolean;
  /** A river or lake is close: adds a low rush. */
  water?: boolean;
  /** 0..1 forest density: leaf rustle. */
  forest?: number;
  /** Distant temple bells now and then. */
  bells?: boolean;
  /** 0..1: fog muffles the highs of the whole environment. */
  fog?: number;
  /** 0..1: a busy town: distant traffic, chatter, the odd far-off horn. */
  city?: number;
  /** 0..1: farmland: a distant cow, a dog, a rooster now and then (kept soft). */
  rural?: number;
}

/** A snapshot of the mixer, for the debug overlay and tests (what the engineer would otherwise have to guess). */
export interface MixSnapshot {
  master: number;
  engine: number;
  sfx: number;
  ui: number;
  ambience: number;
  weather: number;
  music: number;
  /** 0..1 how far the environment is currently ducked under the engine and important sounds. */
  duck: number;
}

const PENTATONIC = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25];
const MAX_ONE_SHOTS = 14;

// Bus trims. These are the "mix": the engine and effects lead, the environment sits under them.
/**
 * Bus trims (the player's sliders multiply these). The soundtrack leads; the engine stays satisfying and warnings and impacts
 * (the sfx and ui buses) stay clear; wind, water, nature and weather sit underneath as quiet atmosphere. Stage 7F: the environment
 * was too loud against the music, so ambience and weather were cut by about 40 % and the music raised.
 */
const TRIM = { engine: 1, sfx: 0.8, ui: 0.55, ambience: 0.3, weather: 0.36, music: 0.9 };

type ContextFactory = () => AudioContext;
type Bus = 'engine' | 'sfx' | 'ui' | 'ambience' | 'weather' | 'music';

interface EngineNodes {
  main: OscillatorNode;
  harm: OscillatorNode;
  sub: OscillatorNode;
  whine: OscillatorNode;
  lump: OscillatorNode;
  mainG: GainNode;
  harmG: GainNode;
  subG: GainNode;
  whineG: GainNode;
  lumpDepth: GainNode;
  raspBp: BiquadFilterNode;
  raspG: GainNode;
  lp: BiquadFilterNode;
  body: BiquadFilterNode;
  out: GainNode;
}

/**
 * Fully synthesised audio (no sample files). Continuous layers (engine, surfaces, wind, forest, river, night,
 * rain) are built once and only have their parameters modulated; one-shots reuse a shared noise buffer, are
 * capped in number and disconnect themselves when they end, so no nodes accumulate.
 *
 * Everything goes through a small mixer: engine, effects, UI, environment, weather and music buses into a
 * master gain and a limiter. The environment ducks under a working engine and under important sounds. Every
 * public method is safe to call when audio is unavailable or still locked (browsers require a user gesture).
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private failed = false;
  private master!: GainNode;
  private limiter!: DynamicsCompressorNode;
  /** Last gain stage before the limiter: closed (0) while the game is out of focus, so nothing it makes can be heard. */
  private gate!: GainNode;
  private background = false;
  private suspendTimer: number | null = null;
  private bus!: Record<Bus, GainNode>;
  /** Alias of the effects bus, kept because one-shots use it as their default destination. */
  private sfx!: GainNode;
  private ambLP!: BiquadFilterNode;
  private noise!: AudioBuffer;
  private levels: AudioLevels = { masterVolume: 0.8, musicVolume: 0.5, sfxVolume: 0.9, muted: false, ambientVolume: 0.7 };
  private ambLevel = 0.7;
  private engLevel = 0.9;

  private engine: EngineNodes | null = null;
  private tyre: { gain: GainNode; bp: BiquadFilterNode } | null = null;
  private skid: { gain: GainNode } | null = null;
  private crunch: { gain: GainNode; lfo: OscillatorNode; depth: GainNode } | null = null;
  private squelch: { gain: GainNode; depth: GainNode } | null = null;
  private hiss: { gain: GainNode } | null = null;
  private splashLayer: { gain: GainNode } | null = null;
  private wind: { gain: GainNode; lp: BiquadFilterNode } | null = null;
  private forestLayer: { gain: GainNode; bp: BiquadFilterNode } | null = null;
  private river: { gain: GainNode } | null = null;
  private crickets: { gain: GainNode; depth: GainNode; lfo: OscillatorNode } | null = null;
  private rainHi: { gain: GainNode } | null = null;
  private rainLo: { gain: GainNode; bp: BiquadFilterNode } | null = null;
  private drones: OscillatorNode[] = [];
  private driving = false;
  private oneShots = 0;
  private lastCrash = 0;
  private musicTimer: number | null = null;
  private nextBird = 0;
  private nextAircraft = 0;
  private nextBell = 0;
  private nextOwl = 0;
  private nextCityHorn = 0;
  private nextChatter = 0;
  private nextFarm = 0;
  /** 0..1: how close the car is to a river (scales the river rush). */
  private riverNear = 1;
  private nextNote = 0;
  private musicOn = false;
  private rpm = 0.2;
  private gear = 0;
  private wasBraking = 0;
  private lastPop = 0;
  private nextDebris = 0;
  private waterContact = false;
  private boost = 0;
  private duckUntil = 0;
  private duckAmount = 0.5;
  private voice: EngineVoice = VOICES['druk-ranger'];
  private ambient: AmbientDef = { wind: 0.4, birds: true, aircraft: false };
  private rainLevel = 0;
  private windExtra = 0;
  readonly mix: MixSnapshot = { master: 0, engine: 0, sfx: 0, ui: 0, ambience: 0, weather: 0, music: 0, duck: 0 };

  constructor(private readonly makeContext?: ContextFactory) {}

  get available(): boolean {
    return !!this.ctx && !this.failed;
  }

  /** The audio context once a gesture (or an allowed autoplay) has created it, for the soundtrack player. */
  get context(): AudioContext | null {
    return this.ctx;
  }

  /** The bus the soundtrack plays into: it carries the Music volume and the global mute. */
  get musicBus(): AudioNode | null {
    return this.ctx ? this.bus.music : null;
  }

  /** True when the soundtrack should be heard at all (volume above zero and neither mute is on). */
  get musicAudible(): boolean {
    return !this.levels.muted && !this.levels.musicMuted && this.levels.musicVolume > 0 && this.levels.masterVolume > 0;
  }

  /** Number of live one-shot nodes (exposed so tests can prove nothing leaks). */
  get liveOneShots(): number {
    return this.oneShots;
  }

  /** The vehicle voice currently in use (exposed for tests and the debug overlay). */
  get currentVoice(): EngineVoice {
    return this.voice;
  }

  /** Must be called from a genuine user gesture (key press / pointer down). */
  unlock(): void {
    if (this.failed) return;
    try {
      if (!this.ctx) this.create();
      // A gesture while the page is in the background must not wake the sound up.
      if (this.ctx && this.ctx.state !== 'running' && !this.background) void this.ctx.resume().catch(() => undefined);
    } catch {
      this.failed = true;
    }
  }

  /** Current level of the focus gate: 1 when sound is on, 0 when the game is out of focus (for tests and the debug overlay). */
  get gateLevel(): number {
    return this.gate ? this.gate.gain.value : this.background ? 0 : 1;
  }

  /** True while the game is out of focus (hidden tab, minimised or blurred window, frozen page): everything is silent. */
  get inBackground(): boolean {
    return this.background;
  }

  /**
   * Silences every sound the game makes (music, engine, effects, environment, weather, UI) when the game loses focus, and brings
   * it back, per the player's saved levels and the real game state, when focus returns. The gate fades in 60 ms (no click) and
   * the context is then suspended, so no node, loop or one-shot can be heard (or burn CPU) in the background; on return the
   * context resumes first and the gate fades up over 180 ms (no jump and no stacked loops, because nothing was restarted).
   */
  setBackground(on: boolean): void {
    if (this.background === on) return;
    this.background = on;
    const ctx = this.ctx;
    if (this.suspendTimer !== null) {
      window.clearTimeout(this.suspendTimer);
      this.suspendTimer = null;
    }
    if (!ctx || !this.gate) return;
    const g = this.gate.gain;
    const t = ctx.currentTime;
    if (on) {
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(0, t + 0.06);
      this.suspendTimer = window.setTimeout(() => {
        this.suspendTimer = null;
        if (this.background && ctx.state === 'running') void ctx.suspend?.().catch(() => undefined);
      }, 140);
    } else {
      void Promise.resolve(ctx.state !== 'running' ? ctx.resume() : undefined)
        .catch(() => undefined)
        .then(() => {
          if (this.background) return;
          const now = ctx.currentTime;
          g.cancelScheduledValues(now);
          g.setValueAtTime(0, now);
          g.linearRampToValueAtTime(1, now + 0.18);
        });
    }
  }

  private create(): void {
    let ctx: AudioContext;
    if (this.makeContext) {
      ctx = this.makeContext();
    } else {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) {
        this.failed = true;
        return;
      }
      ctx = new Ctor();
    }
    this.ctx = ctx;
    // Mixer: buses -> master -> limiter -> speakers.
    this.master = ctx.createGain();
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -12;
    this.limiter.knee.value = 10;
    this.limiter.ratio.value = 8;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.18;
    this.gate = ctx.createGain();
    this.gate.gain.value = this.background ? 0 : 1;
    this.master.connect(this.gate);
    this.gate.connect(this.limiter);
    this.limiter.connect(ctx.destination);
    const mk = (): GainNode => {
      const g = ctx.createGain();
      g.connect(this.master);
      return g;
    };
    this.bus = { engine: mk(), sfx: mk(), ui: mk(), ambience: ctx.createGain(), weather: mk(), music: mk() };
    // The environment passes through a low-pass so fog can muffle it.
    this.ambLP = ctx.createBiquadFilter();
    this.ambLP.type = 'lowpass';
    this.ambLP.frequency.value = 20000;
    this.bus.ambience.connect(this.ambLP);
    this.ambLP.connect(this.master);
    this.sfx = this.bus.sfx;

    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i++) {
      // Brown-ish noise: far less harsh than white noise.
      b = (b + (Math.random() * 2 - 1) * 0.12) / 1.02;
      d[i] = b * 3.2;
    }
    this.buildLayers(ctx);
    this.applyLevels();
    if (this.musicOn) this.startMusicTimer();
  }

  private noiseSource(ctx: AudioContext): AudioBufferSourceNode {
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    return s;
  }

  /** A looping noise layer: noise -> filter -> gain -> bus. */
  private noiseLayer(
    ctx: AudioContext,
    type: BiquadFilterType,
    freq: number,
    q: number,
    dest: AudioNode,
  ): { gain: GainNode; filter: BiquadFilterNode } {
    const n = this.noiseSource(ctx);
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = 0;
    n.connect(f).connect(g).connect(dest);
    n.start(0, Math.random());
    return { gain: g, filter: f };
  }

  private buildLayers(ctx: AudioContext): void {
    const mkOsc = (type: OscillatorType): OscillatorNode => {
      const o = ctx.createOscillator();
      o.type = type;
      return o;
    };
    // ---- engine
    const main = mkOsc(this.voice.wave);
    const harm = mkOsc('square');
    const sub = mkOsc('triangle');
    const whine = mkOsc('sine');
    const lump = mkOsc('sine');
    const mainG = ctx.createGain();
    const harmG = ctx.createGain();
    const subG = ctx.createGain();
    const whineG = ctx.createGain();
    const lumpDepth = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 1.1;
    const body = ctx.createBiquadFilter();
    body.type = 'peaking';
    body.Q.value = 1.4;
    const out = ctx.createGain();
    out.gain.value = 0;
    main.connect(mainG).connect(lp);
    harm.connect(harmG).connect(lp);
    sub.connect(subG).connect(lp);
    lp.connect(body).connect(out);
    // Intake / exhaust rasp rides above the tonal layers.
    const rn = this.noiseSource(ctx);
    const raspBp = ctx.createBiquadFilter();
    raspBp.type = 'bandpass';
    raspBp.Q.value = 0.9;
    raspBp.frequency.value = 700;
    const raspG = ctx.createGain();
    raspG.gain.value = 0;
    rn.connect(raspBp).connect(raspG).connect(out);
    rn.start(0, Math.random());
    // Turbo / supercharger whine sits outside the low-pass so it stays bright.
    whine.connect(whineG).connect(out);
    // Idle lump: a slow LFO on the engine's own gain.
    lump.connect(lumpDepth).connect(out.gain);
    out.connect(this.bus.engine);
    for (const o of [main, harm, sub, whine, lump]) o.start();
    this.engine = { main, harm, sub, whine, lump, mainG, harmG, subG, whineG, lumpDepth, raspBp, raspG, lp, body, out };
    this.applyVoice();

    // ---- tyres and surfaces (effects bus)
    const roll = this.noiseLayer(ctx, 'bandpass', 600, 0.6, this.bus.sfx);
    this.tyre = { gain: roll.gain, bp: roll.filter };
    const skid = this.noiseLayer(ctx, 'bandpass', 1900, 7, this.bus.sfx);
    this.skid = { gain: skid.gain };
    // Gravel crunch: noise chopped by a fast LFO into grains.
    const cr = this.noiseLayer(ctx, 'bandpass', 2100, 0.8, this.bus.sfx);
    const crLfo = mkOsc('square');
    crLfo.frequency.value = 26;
    const crDepth = ctx.createGain();
    crDepth.gain.value = 0;
    crLfo.connect(crDepth).connect(cr.gain.gain);
    crLfo.start();
    this.crunch = { gain: cr.gain, lfo: crLfo, depth: crDepth };
    // Mud squelch: low noise swelling slowly.
    const sq = this.noiseLayer(ctx, 'lowpass', 340, 1.2, this.bus.sfx);
    const sqLfo = mkOsc('sine');
    sqLfo.frequency.value = 3.2;
    const sqDepth = ctx.createGain();
    sqDepth.gain.value = 0;
    sqLfo.connect(sqDepth).connect(sq.gain.gain);
    sqLfo.start();
    this.squelch = { gain: sq.gain, depth: sqDepth };
    const hiss = this.noiseLayer(ctx, 'highpass', 3200, 0.5, this.bus.sfx);
    this.hiss = { gain: hiss.gain };
    const spl = this.noiseLayer(ctx, 'bandpass', 900, 0.8, this.bus.sfx);
    this.splashLayer = { gain: spl.gain };

    // ---- environment (ambience bus)
    const w = this.noiseLayer(ctx, 'lowpass', 500, 0.7, this.bus.ambience);
    w.gain.gain.value = 0.02;
    this.wind = { gain: w.gain, lp: w.filter };
    const fo = this.noiseLayer(ctx, 'bandpass', 1900, 0.5, this.bus.ambience);
    this.forestLayer = { gain: fo.gain, bp: fo.filter };
    const rv = this.noiseLayer(ctx, 'lowpass', 650, 0.6, this.bus.ambience);
    this.river = { gain: rv.gain };
    // Night insects: two slightly detuned high tones chopped into chirps.
    const ca = mkOsc('sine');
    const cb = mkOsc('sine');
    ca.frequency.value = 4300;
    cb.frequency.value = 5100;
    const cg = ctx.createGain();
    cg.gain.value = 0;
    const cLfo = mkOsc('square');
    cLfo.frequency.value = 7.5;
    const cDepth = ctx.createGain();
    cDepth.gain.value = 0;
    ca.connect(cg);
    cb.connect(cg);
    cg.connect(this.bus.ambience);
    cLfo.connect(cDepth).connect(cg.gain);
    for (const o of [ca, cb, cLfo]) o.start();
    this.crickets = { gain: cg, depth: cDepth, lfo: cLfo };

    // ---- weather (weather bus)
    const rh = this.noiseLayer(ctx, 'highpass', 1500, 0.5, this.bus.weather);
    this.rainHi = { gain: rh.gain };
    const rl = this.noiseLayer(ctx, 'bandpass', 520, 0.7, this.bus.weather);
    this.rainLo = { gain: rl.gain, bp: rl.filter };
  }

  /** Switches the engine character (called when the player picks a vehicle). */
  setVehicle(audio: VehicleDef['audio'], id?: string): void {
    this.voice = voiceFor(id, audio);
    this.applyVoice();
  }

  private applyVoice(): void {
    if (!this.engine || !this.ctx) return;
    const t = this.ctx.currentTime;
    const v = this.voice;
    const e = this.engine;
    // Four original firing waveforms replace a generic oscillator buzz; normalization limits level.
    const real = new Float32Array(v.partials.length);
    e.main.setPeriodicWave(this.ctx.createPeriodicWave(real, new Float32Array(v.partials)));
    this.boost = 0;
    e.mainG.gain.setTargetAtTime(0.7, t, 0.05);
    e.harmG.gain.setTargetAtTime(v.harsh * 0.55, t, 0.05);
    e.subG.gain.setTargetAtTime(v.sub * 0.9, t, 0.05);
    e.whineG.gain.setTargetAtTime(0, t, 0.05);
    e.body.frequency.setTargetAtTime(v.bodyHz, t, 0.05);
    e.body.gain.setTargetAtTime(v.bodyGain, t, 0.05);
  }

  /** Per-level wind / birds / aircraft / night / river / forest / bells / fog. */
  setAmbient(a: AmbientDef): void {
    this.ambient = a;
  }

  /** How close the car is to running water, 0 (far) to 1 (beside it): the river's rush follows it. */
  setRiverProximity(p: number): void {
    this.riverNear = clamp(p, 0, 1);
  }

  /** Weather bed: rain intensity 0..1 and extra wind 0..1 (gusts on exposed roads). */
  setWeather(rain: number, wind: number): void {
    this.rainLevel = clamp(rain, 0, 1);
    this.windExtra = clamp(wind, 0, 1);
  }

  setLevels(levels: AudioLevels): void {
    this.levels = { ...levels, ambientVolume: levels.ambientVolume ?? 0.7 };
    this.applyLevels();
  }

  /** Lowers the environment for a moment (a warning, a pickup chime) so the important sound is heard. */
  duck(amount = 0.5, seconds = 1): void {
    const now = this.ctx?.currentTime ?? 0;
    this.duckAmount = clamp(amount, 0, 0.9);
    this.duckUntil = now + seconds;
  }

  private applyLevels(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const { masterVolume, musicVolume, sfxVolume, muted } = this.levels;
    const amb = this.levels.ambientVolume ?? 0.7;
    const m = muted ? 0 : masterVolume;
    this.master.gain.setTargetAtTime(m, t, 0.03);
    this.bus.sfx.gain.setTargetAtTime(sfxVolume * TRIM.sfx, t, 0.03);
    this.bus.ui.gain.setTargetAtTime(sfxVolume * TRIM.ui, t, 0.03);
    this.bus.music.gain.setTargetAtTime(this.levels.musicMuted ? 0 : musicVolume * TRIM.music, t, 0.03);
    this.ambLevel = amb;
    this.engLevel = sfxVolume;
    // The engine bus follows the driving state; the environment is also trimmed per frame while driving.
    this.bus.engine.gain.setTargetAtTime(this.driving ? sfxVolume * TRIM.engine : 0, t, 0.05);
    this.bus.ambience.gain.setTargetAtTime(amb * TRIM.ambience, t, 0.2);
    this.bus.weather.gain.setTargetAtTime(amb * TRIM.weather, t, 0.2);
    this.mix.master = m;
    this.mix.sfx = sfxVolume * TRIM.sfx;
    this.mix.ui = sfxVolume * TRIM.ui;
    this.mix.music = this.levels.musicMuted ? 0 : musicVolume * TRIM.music;
    this.mix.engine = this.driving ? sfxVolume * TRIM.engine : 0;
    this.mix.ambience = amb * TRIM.ambience;
    this.mix.weather = amb * TRIM.weather;
  }

  /** Switches the driving layers on/off (e.g. off in menus and when paused). */
  setDriving(on: boolean): void {
    this.driving = on;
    if (!this.ctx || !this.engine) return;
    const t = this.ctx.currentTime;
    if (on) {
      this.bus.engine.gain.setTargetAtTime(this.engLevel * TRIM.engine, t, 0.08);
      this.mix.engine = this.engLevel * TRIM.engine;
      return;
    }
    this.bus.engine.gain.setTargetAtTime(0, t, 0.06);
    this.engine.out.gain.setTargetAtTime(0, t, 0.05);
    for (const l of [this.tyre, this.skid, this.crunch, this.squelch, this.hiss, this.splashLayer]) {
      l?.gain.gain.setTargetAtTime(0, t, 0.06);
    }
    this.crunch?.depth.gain.setTargetAtTime(0, t, 0.06);
    this.squelch?.depth.gain.setTargetAtTime(0, t, 0.06);
    this.mix.engine = 0;
  }

  /** Per-frame engine / surface / environment modulation. Allocation-free. */
  update(s: DriveSound): void {
    const ctx = this.ctx;
    if (!ctx || !this.engine || !this.tyre || !this.skid || !this.wind || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const speed = Math.abs(s.speed);
    const speedFrac = clamp(speed / s.topSpeed, 0, 1);
    const a = this.ambient;

    // ---- environment: calm by default, ducked under a working engine and under important sounds
    const working = this.driving ? clamp(s.throttle * 0.6 + speedFrac * 0.5, 0, 1) : 0;
    const eventDuck = t < this.duckUntil ? this.duckAmount : 0;
    const duck = clamp(working * 0.35 + eventDuck, 0, 0.8);
    this.mix.duck = duck;
    const amb = this.ambLevel * TRIM.ambience * (1 - duck);
    const wx = this.ambLevel * TRIM.weather * (1 - duck * 0.5);
    this.bus.ambience.gain.setTargetAtTime(amb, t, 0.35);
    this.bus.weather.gain.setTargetAtTime(wx, t, 0.5);
    this.mix.ambience = amb;
    this.mix.weather = wx;
    this.ambLP.frequency.setTargetAtTime(lerp(20000, 1700, clamp(a.fog ?? 0, 0, 1)), t, 0.8);
    this.wind.gain.gain.setTargetAtTime(0.02 + (a.wind + this.windExtra) * (0.06 + Math.sin(t * 0.37) * 0.008 + Math.sin(t * 0.91) * 0.004) + speedFrac * 0.05, t, 0.4);
    this.wind.lp.frequency.setTargetAtTime(380 + speed * 22 + this.windExtra * 300, t, 0.3);
    const cityAmt = clamp(a.city ?? 0, 0, 1);
    // A town reuses the foliage layer as a murmur of voices and the river layer as the low rumble of distant traffic.
    this.forestLayer?.gain.gain.setTargetAtTime((a.forest ?? 0) * (0.012 + 0.04 * (a.wind + this.windExtra)) + cityAmt * 0.011, t, 0.6);
    this.forestLayer?.bp.frequency.setTargetAtTime(cityAmt > 0 ? 850 + Math.sin(t * 0.45) * 260 : 1500 + (a.wind + this.windExtra) * 900, t, 0.5);
    this.river?.gain.gain.setTargetAtTime(a.water ? (0.025 + 0.085 * this.riverNear) * (0.93 + Math.sin(t * 0.7) * 0.07) : cityAmt * 0.035, t, 0.8);
    if (this.crickets) {
      const lvl = a.night && this.rainLevel < 0.4 ? 0.011 : 0;
      this.crickets.gain.gain.setTargetAtTime(lvl, t, 0.5);
      this.crickets.depth.gain.setTargetAtTime(lvl, t, 0.5);
      this.crickets.lfo.frequency.setTargetAtTime(7 + (Math.sin(t * 0.7) + 1) * 1.8, t, 0.3);
    }
    this.rainHi?.gain.gain.setTargetAtTime(this.rainLevel * (0.09 + Math.sin(t * 0.83) * 0.01), t, 1.2);
    this.rainLo?.gain.gain.setTargetAtTime(this.rainLevel * 0.12, t, 1.2);
    this.rainLo?.bp.frequency.setTargetAtTime(420 + this.rainLevel * 400, t, 1.2);
    this.ambientEvents(t);
    if (!this.driving) return;

    // ---- engine
    const e = this.engine;
    const v = this.voice;
    let rpm: number;
    let load: number;
    let shifting: boolean;
    if (s.rpm !== undefined) {
      rpm = s.rpm;
      load = s.load ?? s.throttle;
      shifting = !!s.shifting;
    } else {
      // Fallback gearbox when no shared engine model is supplied.
      let gear = 0;
      while (gear < s.gearTopSpeeds.length - 1 && speed > s.gearTopSpeeds[gear]) gear++;
      const prev = gear === 0 ? 0 : s.gearTopSpeeds[gear - 1] * 0.62;
      const ld = 0.55 + 0.45 * clamp(s.throttle + 0.25, 0, 1);
      const target = 0.18 + 0.82 * clamp((speed - prev) / (s.gearTopSpeeds[gear] - prev || 1), 0, 1) * ld;
      const rate = target > this.rpm ? 9 : 4.5;
      this.rpm += (target - this.rpm) * (1 - Math.exp(-rate * Math.max(s.dt, 0.001)));
      shifting = gear !== this.gear;
      this.gear = gear;
      rpm = this.rpm;
      load = s.throttle;
    }
    load = clamp(Math.abs(load), 0, 1);
    const r = clamp((rpm - 0.18) / 0.82, 0, 1);
    this.boost += (load * r - this.boost) * (1 - Math.exp(-Math.max(s.dt, 0.001) * (load > this.boost ? 3 : 7)));
    const f0 = v.idleHz + r * v.rangeHz;
    e.main.frequency.setTargetAtTime(f0, t, 0.03);
    e.harm.frequency.setTargetAtTime(f0 * (2.003 + Math.sin(t * 1.7) * v.lump * 0.004), t, 0.03);
    e.sub.frequency.setTargetAtTime(f0 * 0.5, t, 0.03);
    e.lp.frequency.setTargetAtTime(v.cutoff + r * v.cutoffRange * 0.6 + load * v.cutoffRange * 0.5, t, 0.06);
    // Lump: the uneven pulse of a big or lazy engine, strongest when revs are low.
    e.lump.frequency.setTargetAtTime(Math.max(2, f0 * v.lumpRate * 0.5), t, 0.1);
    e.lumpDepth.gain.setTargetAtTime(v.gain * v.lump * 0.045 * (1 - r * 0.7), t, 0.1);
    e.raspBp.frequency.setTargetAtTime(500 + r * 1600, t, 0.08);
    e.raspG.gain.setTargetAtTime(v.rasp * (0.03 + 0.12 * load) * (0.4 + r * 0.6), t, 0.06);
    e.whine.frequency.setTargetAtTime(v.whineHz + r * v.whineRange, t, 0.05);
    e.whineG.gain.setTargetAtTime(v.whine * 0.05 * clamp(this.boost * 1.4 + r * 0.1, 0, 1) * (r > 0.1 ? 1 : 0), t, 0.1);
    const base = v.gain * (0.085 + 0.085 * load + 0.035 * r);
    e.out.gain.setTargetAtTime(shifting ? base * 0.5 : base, t, shifting ? 0.01 : 0.06);
    this.bus.engine.gain.setTargetAtTime(this.engLevel * TRIM.engine, t, 0.15);
    this.mix.engine = this.engLevel * TRIM.engine;
    // Burble and pops on a lifted throttle, for the voices that have them.
    if (s.overrun && v.pops > 0 && speed > 8 && t - this.lastPop > 0.28 && Math.random() < v.pops * 0.35) {
      this.lastPop = t;
      this.noiseBurst(t, 0.08, 0.12 * v.gain, 'lowpass', 900, 160, this.bus.engine);
    }

    // ---- tyres and surfaces
    const surf = s.surface ?? (s.wet ? 'water' : s.offRoad ? 'dirt' : 'asphalt');
    const loose = Math.max(s.offRoad ? 0.5 : 0, s.loose ?? 0);
    const roll = s.grounded ? clamp(speed / 30, 0, 1) : 0;
    const voice = surfaceVoice(surf);
    this.tyre.gain.gain.setTargetAtTime(roll * (voice.roll + loose * 0.015), t, 0.08);
    this.tyre.bp.frequency.setTargetAtTime(voice.cutoff + speed * (surf === 'ice' ? 12 : 22), t, 0.1);
    this.crunch?.gain.gain.setTargetAtTime(roll * voice.crunch, t, 0.08);
    this.crunch?.depth.gain.setTargetAtTime(roll * voice.crunch * 0.65, t, 0.08);
    this.crunch?.lfo.frequency.setTargetAtTime(10 + speed * voice.grainRate, t, 0.1);
    this.squelch?.gain.gain.setTargetAtTime(roll * voice.mud, t, 0.1);
    this.squelch?.depth.gain.setTargetAtTime(roll * voice.mud * 0.75, t, 0.1);
    this.hiss?.gain.gain.setTargetAtTime(roll * Math.max(voice.hiss, s.wet ? 0.035 : 0), t, 0.15);
    const water = s.grounded && ((s.water ?? 0) > 0.04 || surf === 'water' || surf === 'slush');
    this.splashLayer?.gain.gain.setTargetAtTime(water ? clamp((s.water ?? 0) + 0.1, 0, 1) * clamp(speed / 8, 0, 1) * 0.16 : 0, t, 0.1);
    if (water && !this.waterContact && speed > 2) {
      this.noiseBurst(t, 0.24, 0.035 * clamp(speed / 12, 0, 1), 'bandpass', 1300, 320);
    }
    this.waterContact = water;
    // Sparse stone strikes under the chassis; cap remains the shared one-shot budget.
    if (s.grounded && (surf === 'gravel' || surf === 'rocky') && speed > 4 && t >= this.nextDebris) {
      this.nextDebris = t + 0.32 + Math.random() * 0.75;
      this.noiseBurst(t, 0.045, 0.018 * roll, 'bandpass', surf === 'rocky' ? 850 : 2300, 420);
    }
    const skid = s.grounded ? (clamp((s.slip - 2.5) / 5, 0, 1) * 0.1 + (s.braking && speed > 12 ? 0.04 : 0)) * voice.skid : 0;
    this.skid.gain.gain.setTargetAtTime(skid, t, 0.05);

    // Air-brake hiss for the heavy diesel after a firm stop-and-release.
    const braking = s.braking && speed > 6 ? 1 : 0;
    if (this.wasBraking && !braking && v.sub > 0.8 && v.lump > 0.5) this.airBrake();
    this.wasBraking = braking;
  }

  private ambientEvents(now: number): void {
    if (!this.ctx) return;
    const a = this.ambient;
    const calm = this.rainLevel < 0.35;
    if (a.birds && !a.night && calm && now >= this.nextBird) {
      this.nextBird = now + 3 + Math.random() * 6;
      const base = 2200 + Math.random() * 1800;
      const n = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++)
        this.tone(base * (1 + i * 0.06), now + i * 0.11, 0.07, 0.012, 'sine', this.bus.ambience, base * 1.25);
    }
    if (a.night && calm && now >= this.nextOwl) {
      this.nextOwl = now + 9 + Math.random() * 14;
      this.tone(420, now, 0.35, 0.02, 'sine', this.bus.ambience, 360);
      this.tone(400, now + 0.55, 0.5, 0.018, 'sine', this.bus.ambience, 330);
    }
    if (a.bells && now >= this.nextBell) {
      this.nextBell = now + 14 + Math.random() * 18;
      const f = [392, 440, 523.25][Math.floor(Math.random() * 3)];
      this.tone(f, now, 2.4, 0.018, 'sine', this.bus.ambience);
      this.tone(f * 2.76, now, 1.2, 0.006, 'sine', this.bus.ambience);
    }
    if ((a.city ?? 0) > 0) {
      // Far-off horns and the bark of a shop radio: sparse, soft, never close.
      if (now >= this.nextCityHorn) {
        this.nextCityHorn = now + 7 + Math.random() * 12;
        const f = 380 + Math.random() * 80;
        this.tone(f, now, 0.22, 0.006 * (a.city ?? 0), 'sawtooth', this.bus.ambience);
        this.tone(f * 1.25, now, 0.22, 0.005 * (a.city ?? 0), 'sawtooth', this.bus.ambience);
      }
      if (now >= this.nextChatter) {
        this.nextChatter = now + 2.5 + Math.random() * 4;
        this.noiseBurst(now, 0.5 + Math.random() * 0.5, 0.012 * (a.city ?? 0), 'bandpass', 700 + Math.random() * 500, 500 + Math.random() * 400, this.bus.ambience);
      }
    }
    if ((a.rural ?? 0) > 0 && calm && now >= this.nextFarm) {
      // Farmland: a lowing cow, a distant dog, a rooster. Sparse and soft, well under the engine.
      this.nextFarm = now + 6 + Math.random() * 11;
      const k = a.rural ?? 0;
      const pick = Math.random();
      if (pick < 0.4) {
        this.tone(150, now, 0.9, 0.012 * k, 'sawtooth', this.bus.ambience, 118);
        this.tone(300, now, 0.8, 0.004 * k, 'sine', this.bus.ambience, 240);
      } else if (pick < 0.75) {
        for (let i = 0; i < 3; i++) this.noiseBurst(now + i * 0.26, 0.11, 0.016 * k, 'bandpass', 900 + Math.random() * 200, 500, this.bus.ambience);
      } else {
        this.tone(720, now, 0.18, 0.01 * k, 'square', this.bus.ambience, 980);
        this.tone(880, now + 0.22, 0.2, 0.01 * k, 'square', this.bus.ambience, 760);
        this.tone(700, now + 0.5, 0.45, 0.009 * k, 'square', this.bus.ambience, 560);
      }
    }
    if (a.aircraft && now >= this.nextAircraft) {
      this.nextAircraft = now + 30 + Math.random() * 30;
      this.flyover(now);
    }
  }

  // ------------------------------------------------------------------ one-shots

  private track(node: AudioScheduledSourceNode, ...extra: AudioNode[]): void {
    this.oneShots++;
    node.onended = () => {
      this.oneShots--;
      node.disconnect();
      extra.forEach((n) => n.disconnect());
    };
  }

  private tone(
    freq: number,
    at: number,
    dur: number,
    gain: number,
    type: OscillatorType = 'sine',
    dest: AudioNode = this.sfx,
    sweepTo?: number,
  ): void {
    const ctx = this.ctx;
    if (!ctx || this.oneShots >= MAX_ONE_SHOTS) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, at);
    if (sweepTo) o.frequency.exponentialRampToValueAtTime(sweepTo, at + dur);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(dest);
    o.start(at);
    o.stop(at + dur + 0.05);
    this.track(o, g);
  }

  /** Filtered noise burst. */
  private noiseBurst(
    at: number,
    dur: number,
    gain: number,
    type: BiquadFilterType,
    f0: number,
    f1: number,
    dest: AudioNode = this.sfx,
  ): void {
    const ctx = this.ctx;
    if (!ctx || this.oneShots >= MAX_ONE_SHOTS) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(f0, at);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), at + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + Math.min(0.03, dur / 4));
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(at, Math.random());
    src.stop(at + dur + 0.05);
    this.track(src, f, g);
  }

  private ready(): AudioContext | null {
    const ctx = this.ctx;
    return ctx && ctx.state === 'running' ? ctx : null;
  }

  click(back = false): void {
    const ctx = this.ready();
    if (ctx) this.tone(back ? 520 : 760, ctx.currentTime, 0.07, 0.12, 'triangle', this.bus.ui);
  }

  /**
   * The studio/title sting played as the menu appears: a soft rising whoosh into a two-note lift. Quiet by design,
   * a few tenths of a second, and only if the browser has already allowed audio (it has when the player tapped to skip).
   */
  brandSting(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.noiseBurst(t, 0.5, 0.07, 'bandpass', 300, 2600, this.bus.ui);
    this.tone(392, t + 0.12, 0.9, 0.1, 'triangle', this.bus.ui);
    this.tone(587.33, t + 0.24, 1.1, 0.1, 'triangle', this.bus.ui);
    this.tone(1174.66, t + 0.24, 0.8, 0.03, 'sine', this.bus.ui);
  }

  /** Soft sweep for opening / closing a screen. */
  whoosh(): void {
    const ctx = this.ready();
    if (ctx) this.noiseBurst(ctx.currentTime, 0.28, 0.12, 'bandpass', 500, 2200, this.bus.ui);
  }

  countdown(n: number): void {
    const ctx = this.ready();
    if (ctx) this.tone(n === 1 ? 660 : 495, ctx.currentTime, 0.18, 0.22, 'sine');
  }

  go(): void {
    const ctx = this.ready();
    if (!ctx) return;
    this.tone(990, ctx.currentTime, 0.5, 0.24, 'triangle');
    this.tone(1485, ctx.currentTime, 0.5, 0.1, 'sine');
  }

  checkpoint(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.duck(0.4, 1.2);
    this.tone(880, t, 0.9, 0.2, 'sine');
    this.tone(1318.5, t + 0.09, 1.0, 0.16, 'sine');
    this.tone(2637, t + 0.09, 0.4, 0.04, 'sine');
  }

  finish(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.duck(0.6, 2.5);
    [523.25, 587.33, 659.25, 783.99, 880, 1046.5].forEach((f, i) => {
      this.tone(f, t + i * 0.11, 0.9, 0.17, 'triangle');
      this.tone(f * 2, t + i * 0.11, 0.5, 0.04, 'sine');
    });
  }

  /**
   * A car horn: two short blasts of a two-tone chord, kept far below engine and alert level. `volume` is 0..1 and already
   * scaled for distance by the caller; it plays on the ambience bus, so the Environment slider and ducking apply.
   */
  honk(volume: number, pitch = 1, double = false): void {
    const ctx = this.ready();
    if (!ctx || volume <= 0.04) return;
    const t = ctx.currentTime;
    const g = 0.035 * clamp(volume, 0, 1);
    this.tone(410 * pitch, t, 0.3, g, 'sawtooth', this.bus.ambience);
    this.tone(515 * pitch, t, 0.3, g * 0.8, 'sawtooth', this.bus.ambience);
    if (double) {
      this.tone(410 * pitch, t + 0.42, 0.26, g, 'sawtooth', this.bus.ambience);
      this.tone(515 * pitch, t + 0.42, 0.26, g * 0.8, 'sawtooth', this.bus.ambience);
    }
  }

  /** A traffic officer's whistle: two short trills. */
  whistle(volume: number): void {
    const ctx = this.ready();
    if (!ctx || volume <= 0.04) return;
    const t = ctx.currentTime;
    const g = 0.03 * clamp(volume, 0, 1);
    this.tone(2650, t, 0.16, g, 'sine', this.bus.ambience, 2900);
    this.tone(2750, t + 0.22, 0.34, g, 'sine', this.bus.ambience, 3000);
  }

  /** A vehicle passing close by: a low swell (heavy), a hiss of tyres (light) or a thin buzz (scooters and motorbikes). */
  trafficPass(sound: 'heavy' | 'light' | 'bike', amount: number): void {
    const ctx = this.ready();
    if (!ctx || amount <= 0.05) return;
    const t = ctx.currentTime;
    const a = clamp(amount, 0, 1);
    if (sound === 'heavy') {
      this.noiseBurst(t, 1.2, 0.04 * a, 'lowpass', 460, 110, this.bus.ambience);
      this.tone(64, t, 1.0, 0.018 * a, 'sawtooth', this.bus.ambience, 46);
    } else if (sound === 'light') {
      this.noiseBurst(t, 0.8, 0.026 * a, 'bandpass', 950, 320, this.bus.ambience);
    } else {
      this.tone(220, t, 0.7, 0.012 * a, 'sawtooth', this.bus.ambience, 150);
      this.noiseBurst(t, 0.6, 0.014 * a, 'bandpass', 1500, 600, this.bus.ambience);
    }
  }

  /** The airport's three-note announcement chime (a soft descending ding-dong-ding). */
  airportChime(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    [783.99, 659.25, 523.25].forEach((f, i) => {
      this.tone(f, t + i * 0.42, 1.1, 0.06, 'sine', this.bus.ui);
      this.tone(f * 2.01, t + i * 0.42, 0.7, 0.012, 'sine', this.bus.ui);
    });
  }

  /** A crowd cheering and clapping: a swell of band-passed noise with a scatter of claps. Short, and ducks the music. */
  cheer(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.duck(0.55, 2.8);
    this.noiseBurst(t, 2.2, 0.075, 'bandpass', 600, 1700, this.bus.sfx);
    this.noiseBurst(t + 0.2, 1.8, 0.05, 'bandpass', 1400, 3000, this.bus.sfx);
    for (let i = 0; i < 8; i++) this.noiseBurst(t + 0.35 + i * 0.17 + (i % 3) * 0.03, 0.05, 0.06, 'bandpass', 2400, 4200, this.bus.sfx);
  }

  /** Something new opened up (level or vehicle): a bright rising pentatonic phrase. */
  unlockFanfare(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    [392, 523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      this.tone(f, t + i * 0.09, 1.1, 0.15, 'triangle');
      this.tone(f * 2.01, t + i * 0.09, 0.6, 0.03, 'sine');
    });
  }

  /** Personal best / medal sting. */
  record(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.tone(784, t, 0.35, 0.16, 'triangle');
    this.tone(1175, t + 0.12, 0.6, 0.16, 'triangle');
    this.tone(1568, t + 0.24, 0.9, 0.12, 'sine');
  }

  fail(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.tone(392, t, 0.6, 0.18, 'triangle');
    this.tone(293.66, t + 0.25, 0.9, 0.18, 'triangle');
    this.tone(220, t + 0.55, 1.2, 0.16, 'triangle');
  }

  /** Passenger-comfort warning: a gentle two-note "ding-dong". */
  comfortWarning(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.tone(659.25, t, 0.4, 0.09, 'sine');
    this.tone(523.25, t + 0.16, 0.5, 0.09, 'sine');
  }

  /** Guests climb aboard: three bright notes. */
  pickup(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.duck(0.4, 1.4);
    [659.25, 830.61, 987.77].forEach((f, i) => this.tone(f, t + i * 0.09, 0.5, 0.16, 'triangle'));
  }

  /** Low-fuel / low-condition warning: two short beeps. */
  warning(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.duck(0.5, 1.2);
    this.tone(880, t, 0.12, 0.13, 'square');
    this.tone(880, t + 0.2, 0.12, 0.13, 'square');
  }

  /** A pour / wrench tick while a pit-stop service runs. Call every ~0.25 s. */
  serviceTick(kind: 'refuel' | 'repair'): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    if (kind === 'refuel') this.tone(180 + Math.random() * 40, t, 0.16, 0.12, 'sine', this.sfx, 120);
    else this.tone(1400 + Math.random() * 300, t, 0.05, 0.08, 'square', this.sfx, 900);
  }

  serviceDone(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.tone(784, t, 0.3, 0.14, 'triangle');
    this.tone(1046.5, t + 0.12, 0.5, 0.14, 'triangle');
  }

  /** Distant thunder: a long, low rumble. */
  thunder(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.noiseBurst(t + 0.25, 2.4, 0.38, 'lowpass', 420, 60, this.bus.weather);
    this.noiseBurst(t + 0.65, 3.2, 0.065, 'lowpass', 160, 45, this.bus.weather);
  }

  /** Rocks coming down. */
  rockfall(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.duck(0.5, 1.5);
    this.noiseBurst(t, 1.1, 0.4, 'lowpass', 900, 100);
    this.tone(70, t + 0.05, 0.5, 0.3, 'sine', this.sfx, 40);
  }

  /** The yeti's friendly "hoo". */
  yeti(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.tone(92, t, 0.7, 0.16, 'triangle', this.sfx, 62);
    this.tone(184, t + 0.05, 0.5, 0.07, 'sine', this.sfx, 124);
    this.noiseBurst(t,0.32,0.045,'lowpass',420,160);
    this.tone(78, t + 0.55, 0.65, 0.12, 'triangle', this.sfx, 56);
  }

  /** Spectral arrival; only triggered by the existing encounter event. */
  ghost(): void {
    const ctx=this.ready(); if(!ctx)return; const t=ctx.currentTime;
    this.tone(392,t,1.1,0.055,'sine',this.sfx,294);
    this.tone(587,t+0.12,1.3,0.04,'sine',this.sfx,440);
    this.noiseBurst(t,0.75,0.035,'bandpass',1200,650);
  }
  /** Family-safe creature voice ready for a future zombie encounter consumer. */
  zombie(): void {
    const ctx=this.ready();if(!ctx)return;const t=ctx.currentTime;
    this.tone(105,t,0.5,0.08,'triangle',this.sfx,73);
    this.noiseBurst(t+0.08,0.38,0.045,'lowpass',580,210);
  }

  /** Engine cut out (flooded or out of fuel). */
  stall(): void {
    const ctx = this.ready();
    if (ctx) this.tone(140, ctx.currentTime, 0.7, 0.3, 'sawtooth', this.sfx, 35);
  }

  /** A passing car's horn. */
  horn(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    const f = this.voice.idleHz < 32 ? 220 : this.voice.sub < 0.2 ? 440 : 350;
    this.tone(f, t, 0.28, 0.1, 'sawtooth');
    this.tone(f * 1.25, t, 0.28, 0.08, 'sawtooth');
  }

  airBrake(): void {
    const ctx = this.ready();
    if (ctx) this.noiseBurst(ctx.currentTime, 0.45, 0.14, 'highpass', 2500, 900);
  }

  private flyover(at: number): void {
    const ctx = this.ctx;
    if (!ctx || this.oneShots >= MAX_ONE_SHOTS - 2) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(180, at);
    f.frequency.linearRampToValueAtTime(520, at + 4);
    f.frequency.linearRampToValueAtTime(160, at + 9);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(0.06, at + 4);
    g.gain.linearRampToValueAtTime(0.0001, at + 9);
    src.connect(f).connect(g).connect(this.bus.ambience);
    src.start(at, Math.random());
    src.stop(at + 9.1);
    this.track(src, f, g);
  }

  /** Collision thud + crunch. `intensity` is impact speed in m/s. */
  crash(intensity: number): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    if (t - this.lastCrash < 0.12 || this.oneShots >= MAX_ONE_SHOTS) return;
    this.lastCrash = t;
    const k = clamp(intensity / 14, 0.15, 1);
    this.noiseBurst(t, 0.35, 0.5 * k, 'lowpass', 1400, 160);
    this.tone(95, t, 0.28, 0.45 * k, 'sine', this.sfx, 38);
  }

  // ------------------------------------------------------------------ music

  /** Quiet generative pentatonic music (a drone and sparse plucked notes). */
  startMusic(): void {
    this.musicOn = true;
    if (this.ctx && this.musicTimer === null) this.startMusicTimer();
  }

  stopMusic(): void {
    this.musicOn = false;
    this.drones.forEach((o) => {
      try {
        o.stop();
      } catch {
        /* already stopped */
      }
      o.disconnect();
    });
    this.drones = [];
    if (this.musicTimer !== null) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  private startMusicTimer(): void {
    const ctx = this.ctx;
    if (!ctx || this.musicTimer !== null) return;
    this.nextNote = ctx.currentTime + 0.3;
    // A sustained fifth underneath.
    for (const f of [65.41, 98.0]) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.value = 0.05;
      o.connect(g).connect(this.bus.music);
      o.start();
      this.drones.push(o);
    }
    this.musicTimer = window.setInterval(() => {
      const c = this.ctx;
      if (!c || c.state !== 'running' || !this.musicOn) return;
      while (this.nextNote < c.currentTime + 0.6) {
        const f = PENTATONIC[Math.floor(Math.random() * PENTATONIC.length)];
        this.tone(f, this.nextNote, 2.2, 0.09, 'triangle', this.bus.music);
        if (Math.random() < 0.35) this.tone(f * 1.5, this.nextNote + 0.18, 1.8, 0.04, 'sine', this.bus.music);
        this.nextNote += 1.1 + Math.random() * 2.6;
      }
    }, 250);
  }

  dispose(): void {
    this.stopMusic();
    this.driving = false;
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
  }
}
