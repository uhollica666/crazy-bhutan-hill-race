import { clamp } from '../core/math';

export interface AudioLevels {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  muted: boolean;
}

export interface DriveSound {
  speed: number;
  topSpeed: number;
  gearTopSpeeds: number[];
  throttle: number;
  braking: boolean;
  slip: number;
  grounded: boolean;
}

const PENTATONIC = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25];
const MAX_ONE_SHOTS = 14;

/**
 * Fully synthesised audio (no sample files). Continuous layers (engine, tyres, skid, wind) are built once
 * and only have their parameters modulated; one-shots reuse a shared noise buffer and are capped in number.
 * Every public method is safe to call when audio is unavailable or still locked.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private failed = false;
  private master!: GainNode;
  private sfx!: GainNode;
  private music!: GainNode;
  private noise!: AudioBuffer;
  private levels: AudioLevels = { masterVolume: 0.8, musicVolume: 0.5, sfxVolume: 0.9, muted: false };

  private engine: { o1: OscillatorNode; o2: OscillatorNode; lp: BiquadFilterNode; gain: GainNode } | null =
    null;
  private tyre: { gain: GainNode; bp: BiquadFilterNode } | null = null;
  private skid: { gain: GainNode } | null = null;
  private wind: { gain: GainNode; lp: BiquadFilterNode } | null = null;
  private driving = false;
  private oneShots = 0;
  private lastCrash = 0;
  private musicTimer: number | null = null;
  private nextBird = 0;
  private nextNote = 0;
  private musicOn = false;
  private drones: OscillatorNode[] = [];

  get available(): boolean {
    return !!this.ctx && !this.failed;
  }

  /** Must be called from a genuine user gesture (key press / pointer down). */
  unlock(): void {
    if (this.failed) return;
    try {
      if (!this.ctx) this.create();
      if (this.ctx && this.ctx.state !== 'running') void this.ctx.resume().catch(() => undefined);
    } catch {
      this.failed = true;
    }
  }

  private create(): void {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) {
      this.failed = true;
      return;
    }
    const ctx = new Ctor();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.sfx = ctx.createGain();
    this.music = ctx.createGain();
    this.sfx.connect(this.master);
    this.music.connect(this.master);
    this.master.connect(ctx.destination);

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

  private buildLayers(ctx: AudioContext): void {
    // Engine: two detuned oscillators through a low-pass whose cutoff follows rpm and load.
    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    o1.type = 'sawtooth';
    o2.type = 'square';
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 1.2;
    const eg = ctx.createGain();
    eg.gain.value = 0;
    const g2 = ctx.createGain();
    g2.gain.value = 0.35;
    o1.connect(lp);
    o2.connect(g2).connect(lp);
    lp.connect(eg).connect(this.sfx);
    o1.start();
    o2.start();
    this.engine = { o1, o2, lp, gain: eg };

    const tn = this.noiseSource(ctx);
    const tbp = ctx.createBiquadFilter();
    tbp.type = 'bandpass';
    tbp.frequency.value = 600;
    tbp.Q.value = 0.6;
    const tg = ctx.createGain();
    tg.gain.value = 0;
    tn.connect(tbp).connect(tg).connect(this.sfx);
    tn.start();
    this.tyre = { gain: tg, bp: tbp };

    const sn = this.noiseSource(ctx);
    const sbp = ctx.createBiquadFilter();
    sbp.type = 'bandpass';
    sbp.frequency.value = 1900;
    sbp.Q.value = 7;
    const sg = ctx.createGain();
    sg.gain.value = 0;
    sn.connect(sbp).connect(sg).connect(this.sfx);
    sn.start();
    this.skid = { gain: sg };

    const wn = this.noiseSource(ctx);
    const wlp = ctx.createBiquadFilter();
    wlp.type = 'lowpass';
    wlp.frequency.value = 500;
    const wg = ctx.createGain();
    wg.gain.value = 0.05;
    wn.connect(wlp).connect(wg).connect(this.sfx);
    wn.start();
    this.wind = { gain: wg, lp: wlp };
  }

  setLevels(levels: AudioLevels): void {
    this.levels = levels;
    this.applyLevels();
  }

  private applyLevels(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const { masterVolume, musicVolume, sfxVolume, muted } = this.levels;
    this.master.gain.setTargetAtTime(muted ? 0 : masterVolume, t, 0.03);
    this.sfx.gain.setTargetAtTime(sfxVolume, t, 0.03);
    this.music.gain.setTargetAtTime(musicVolume * 0.7, t, 0.03);
  }

  /** Switches the driving layers on/off (e.g. off in menus and when paused). */
  setDriving(on: boolean): void {
    this.driving = on;
    if (!on && this.ctx && this.engine && this.tyre && this.skid) {
      const t = this.ctx.currentTime;
      this.engine.gain.gain.setTargetAtTime(0, t, 0.05);
      this.tyre.gain.gain.setTargetAtTime(0, t, 0.05);
      this.skid.gain.gain.setTargetAtTime(0, t, 0.05);
    }
  }

  /** Per-frame engine / tyre / wind modulation. Allocation-free. */
  update(s: DriveSound): void {
    const ctx = this.ctx;
    if (!ctx || !this.engine || !this.tyre || !this.skid || !this.wind || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const speed = Math.abs(s.speed);
    const wind = this.wind;
    wind.gain.gain.setTargetAtTime(0.035 + clamp(speed / s.topSpeed, 0, 1) * 0.1, t, 0.15);
    wind.lp.frequency.setTargetAtTime(350 + speed * 30, t, 0.15);
    this.ambientBirds(t);
    if (!this.driving) return;

    // Simple gearbox: rpm climbs within a gear, drops on shift.
    let gear = 0;
    while (gear < s.gearTopSpeeds.length - 1 && speed > s.gearTopSpeeds[gear]) gear++;
    const prev = gear === 0 ? 0 : s.gearTopSpeeds[gear - 1] * 0.62;
    const rpm =
      0.2 +
      0.8 *
        clamp((speed - prev) / (s.gearTopSpeeds[gear] - prev || 1), 0, 1) *
        (0.5 + 0.5 * clamp(s.throttle + 0.3, 0, 1));
    const f0 = 34 + rpm * 78;
    this.engine.o1.frequency.setTargetAtTime(f0, t, 0.04);
    this.engine.o2.frequency.setTargetAtTime(f0 * 2.005, t, 0.04);
    this.engine.lp.frequency.setTargetAtTime(380 + rpm * 900 + s.throttle * 700, t, 0.06);
    this.engine.gain.gain.setTargetAtTime(0.07 + s.throttle * 0.07 + rpm * 0.03, t, 0.06);

    const roll = s.grounded ? clamp(speed / 30, 0, 1) : 0;
    this.tyre.gain.gain.setTargetAtTime(roll * 0.1, t, 0.08);
    this.tyre.bp.frequency.setTargetAtTime(380 + speed * 22, t, 0.1);
    const skid = s.grounded
      ? clamp((s.slip - 2.5) / 5, 0, 1) * 0.1 + (s.braking && speed > 12 ? 0.04 : 0)
      : 0;
    this.skid.gain.gain.setTargetAtTime(skid, t, 0.05);
  }

  private ambientBirds(now: number): void {
    if (now < this.nextBird || !this.ctx) return;
    this.nextBird = now + 3 + Math.random() * 6;
    const base = 2200 + Math.random() * 1800;
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++)
      this.tone(base * (1 + i * 0.06), now + i * 0.11, 0.07, 0.015, 'sine', this.sfx, base * 1.25);
  }

  // ------------------------------------------------------------------ one-shots

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
    this.oneShots++;
    o.onended = () => {
      this.oneShots--;
      g.disconnect();
    };
  }

  private ready(): AudioContext | null {
    const ctx = this.ctx;
    return ctx && ctx.state === 'running' ? ctx : null;
  }

  click(back = false): void {
    const ctx = this.ready();
    if (ctx) this.tone(back ? 520 : 760, ctx.currentTime, 0.07, 0.12, 'triangle');
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
    this.tone(880, t, 0.9, 0.2, 'sine');
    this.tone(1318.5, t + 0.09, 1.0, 0.16, 'sine');
    this.tone(2637, t + 0.09, 0.4, 0.04, 'sine');
  }

  finish(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    [523.25, 587.33, 659.25, 783.99, 880, 1046.5].forEach((f, i) => {
      this.tone(f, t + i * 0.11, 0.9, 0.17, 'triangle');
      this.tone(f * 2, t + i * 0.11, 0.5, 0.04, 'sine');
    });
  }

  fail(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.tone(392, t, 0.6, 0.18, 'triangle');
    this.tone(293.66, t + 0.25, 0.9, 0.18, 'triangle');
  }

  /** Collision thud + crunch. `intensity` is impact speed in m/s. */
  crash(intensity: number): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    if (t - this.lastCrash < 0.12 || this.oneShots >= MAX_ONE_SHOTS) return;
    this.lastCrash = t;
    const k = clamp(intensity / 14, 0.15, 1);
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1400, t);
    lp.frequency.exponentialRampToValueAtTime(160, t + 0.3);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5 * k, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    src.connect(lp).connect(g).connect(this.sfx);
    src.start(t, Math.random());
    src.stop(t + 0.4);
    this.oneShots++;
    src.onended = () => {
      this.oneShots--;
      g.disconnect();
    };
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
    });
    this.drones = [];
    if (this.musicTimer !== null) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  private startMusicTimer(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.nextNote = ctx.currentTime + 0.3;
    // A sustained fifth underneath.
    for (const f of [65.41, 98.0]) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.value = 0.05;
      o.connect(g).connect(this.music);
      o.start();
      this.drones.push(o);
    }
    this.musicTimer = window.setInterval(() => {
      const c = this.ctx;
      if (!c || c.state !== 'running' || !this.musicOn) return;
      while (this.nextNote < c.currentTime + 0.6) {
        const f = PENTATONIC[Math.floor(Math.random() * PENTATONIC.length)];
        this.tone(f, this.nextNote, 2.2, 0.09, 'triangle', this.music);
        if (Math.random() < 0.35) this.tone(f * 1.5, this.nextNote + 0.18, 1.8, 0.04, 'sine', this.music);
        this.nextNote += 1.1 + Math.random() * 2.6;
      }
    }, 250);
  }

  dispose(): void {
    this.stopMusic();
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
  }
}
