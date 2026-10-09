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
    for (let i = 0; i < 6; i++) {
      audio.startMusic();
      audio.stopMusic();
    }
    audio.startMusic();
    const drones = ctx.nodes.filter((n) => n.kind === 'osc' && n.started && !n.stopped && n.type === 'sine');
    expect(drones.length).toBe(2); // exactly one drone pair running
    audio.stopMusic();
    expect(
      ctx.nodes.filter((n) => n.kind === 'osc' && n.started && !n.stopped && n.type === 'sine').length,
    ).toBe(0);
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
