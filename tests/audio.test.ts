import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioEngine } from '../src/audio/AudioEngine';
import type { DriveSound } from '../src/audio/AudioEngine';
import { getVehicle } from '../src/data/vehicles';

/** Minimal Web Audio double that tracks which nodes are still alive (connected / playing). */
class FakeParam {
  value = 0;
  setValueAtTime(): this {
    return this;
  }
  setTargetAtTime(): this {
    return this;
  }
  linearRampToValueAtTime(): this {
    return this;
  }
  exponentialRampToValueAtTime(): this {
    return this;
  }
}

class FakeNode {
  static alive = new Set<FakeNode>();
  onended: (() => void) | null = null;
  started = false;
  stopped = false;
  type = '';
  buffer: unknown = null;
  loop = false;
  gain = new FakeParam();
  frequency = new FakeParam();
  Q = new FakeParam();
  threshold = new FakeParam();
  knee = new FakeParam();
  ratio = new FakeParam();
  attack = new FakeParam();
  release = new FakeParam();
  constructor(readonly kind: string) {}
  connect<T>(n: T): T {
    FakeNode.alive.add(this);
    return n;
  }
  disconnect(): void {
    FakeNode.alive.delete(this);
  }
  start(): void {
    this.started = true;
  }
  stop(): void {
    this.stopped = true;
  }
}

class FakeContext {
  currentTime = 0;
  state: AudioContextState = 'running';
  sampleRate = 8000;
  destination = new FakeNode('destination');
  nodes: FakeNode[] = [];
  private make(kind: string): FakeNode {
    const n = new FakeNode(kind);
    this.nodes.push(n);
    return n;
  }
  createGain = () => this.make('gain');
  createOscillator = () => this.make('osc');
  createBiquadFilter = () => this.make('filter');
  createDynamicsCompressor = () => this.make('compressor');
  createBufferSource = () => this.make('src');
  createBuffer = (_c: number, len: number) => ({ getChannelData: () => new Float32Array(len) });
  resume = () => Promise.resolve();
  close = () => Promise.resolve();
  /** Lets every scheduled one-shot "finish playing", firing onended like a real context would. */
  finishAll(): void {
    for (const n of this.nodes) {
      const fn = n.onended;
      if (n.started && fn) {
        n.onended = null; // a real node fires onended exactly once
        fn();
      }
    }
  }
}

const drive: DriveSound = {
  speed: 20,
  topSpeed: 38,
  gearTopSpeeds: [9, 17, 26, 38],
  throttle: 1,
  braking: false,
  slip: 0,
  grounded: true,
  offRoad: false,
  dt: 1 / 60,
};

function makeEngine(): { audio: AudioEngine; ctx: FakeContext } {
  let ctx!: FakeContext;
  const audio = new AudioEngine(() => (ctx = new FakeContext()) as unknown as AudioContext);
  audio.unlock();
  return { audio, ctx };
}

describe('AudioEngine without leaks', () => {
  beforeEach(() => {
    FakeNode.alive.clear();
    vi.useFakeTimers();
    (globalThis as unknown as { window: unknown }).window = globalThis;
  });
  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as { window?: unknown }).window;
  });

  it('does nothing (and never throws) before the audio context is unlocked', () => {
    const audio = new AudioEngine(() => {
      throw new Error('no audio');
    });
    expect(() => {
      audio.checkpoint();
      audio.crash(10);
      audio.update(drive);
      audio.click();
    }).not.toThrow();
    audio.unlock(); // factory throws: audio is marked failed, game continues silently
    expect(audio.available).toBe(false);
    expect(() => audio.finish()).not.toThrow();
  });

  it('one-shot sounds release every node when they finish, however many are played', () => {
    const { audio, ctx } = makeEngine();
    const baseline = FakeNode.alive.size;
    for (let round = 0; round < 40; round++) {
      audio.click();
      audio.click(true);
      audio.checkpoint();
      audio.countdown(2);
      audio.go();
      audio.finish();
      audio.fail();
      audio.unlockFanfare();
      audio.record();
      audio.comfortWarning();
      audio.whoosh();
      audio.airBrake();
      ctx.currentTime += 1;
      audio.crash(12);
      expect(audio.liveOneShots).toBeLessThanOrEqual(14); // hard cap on polyphony
      ctx.finishAll();
      expect(audio.liveOneShots).toBe(0);
    }
    expect(FakeNode.alive.size).toBe(baseline);
  });

  it('per-frame updates and vehicle switches create no new nodes after start-up', () => {
    const { audio, ctx } = makeEngine();
    audio.setDriving(true);
    audio.update(drive);
    const created = ctx.nodes.length;
    for (let i = 0; i < 600; i++) {
      audio.update({
        ...drive,
        speed: (i % 40) + 1,
        throttle: i % 2,
        braking: i % 7 === 0,
        slip: i % 9,
        offRoad: i % 5 === 0,
      });
    }
    audio.setVehicle(getVehicle('tourist-coaster').audio);
    audio.setVehicle(getVehicle('druk-ranger').audio);
    // Only occasional ambient birds / air brakes (all cleaned up below) may appear.
    ctx.finishAll();
    expect(audio.liveOneShots).toBe(0);
    const persistent = ctx.nodes.slice(0, created).length;
    expect(persistent).toBe(created);
  });

  it('music start/stop cycles do not stack drones', () => {
    const { audio, ctx } = makeEngine();
    const sines = (): number =>
      ctx.nodes.filter((n) => n.kind === 'osc' && n.started && !n.stopped && n.type === 'sine').length;
    const baseline = sines(); // continuous engine / ambience layers
    for (let i = 0; i < 6; i++) {
      audio.startMusic();
      audio.stopMusic();
    }
    audio.startMusic();
    expect(sines() - baseline).toBe(2); // exactly one drone pair running
    audio.stopMusic();
    expect(sines()).toBe(baseline);
  });

  it('every vehicle has its own engine voice, and unknown vehicles fall back to a neutral one', () => {
    const { audio } = makeEngine();
    const seen = new Set<string>();
    for (const id of ['dzo-hatch', 'tourist-coaster', 'druk-ranger', 'dragon-cruiser']) {
      audio.setVehicle(getVehicle(id).audio, id);
      const v = audio.currentVoice;
      seen.add(JSON.stringify([v.wave, v.idleHz, v.bodyHz, v.whineHz]));
    }
    expect(seen.size).toBe(4);
    audio.setVehicle(getVehicle('druk-ranger').audio, 'mystery');
    expect(audio.currentVoice.idleHz).toBe(getVehicle('druk-ranger').audio.idleHz);
  });

  it('weather, night and fog ambience and ducking create no nodes per frame and stay bounded', () => {
    const { audio, ctx } = makeEngine();
    audio.setDriving(true);
    audio.update(drive);
    const created = ctx.nodes.length;
    audio.setAmbient({ wind: 0.6, birds: false, aircraft: true, night: true, water: true, forest: 0.7, bells: true, fog: 0.8 });
    audio.setWeather(1, 0.8);
    audio.duck(0.6, 2);
    for (let i = 0; i < 300; i++) {
      ctx.currentTime += 0.1;
      audio.update({ ...drive, surface: i % 2 ? 'mud' : 'gravel', wet: true, water: 0.5, rpm: 0.6, load: 0.8, overrun: i % 3 === 0 });
    }
    ctx.finishAll();
    expect(audio.liveOneShots).toBe(0);
    expect(ctx.nodes.length - created).toBeLessThan(200); // events only, no per-frame growth
    expect(audio.mix.duck).toBeGreaterThanOrEqual(0);
    expect(audio.mix.duck).toBeLessThanOrEqual(0.8);
    audio.dispose();
    expect(audio.available).toBe(false);
  });

  it('volume and mute settings apply to the master / bus gains', () => {
    const { audio } = makeEngine();
    expect(() =>
      audio.setLevels({ masterVolume: 0.2, musicVolume: 0, sfxVolume: 1, muted: true }),
    ).not.toThrow();
    audio.dispose();
    expect(audio.available).toBe(false);
  });
});
