import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioEngine } from '../src/audio/AudioEngine';
import { AudioFocus } from '../src/audio/focus';
import { MusicManager } from '../src/audio/MusicManager';
import type { MusicEnv, TrackMeta } from '../src/audio/MusicManager';
import { MIX_REV, defaultSettings, parseSettings } from '../src/storage/SaveStore';

// ---------------------------------------------------------------------------------------------- focus tracker

class FakeTarget extends EventTarget {
  visibilityState: 'visible' | 'hidden' = 'visible';
  focused = true;
  hasFocus = (): boolean => this.focused;
}
const fire = (t: EventTarget, type: string): void => void t.dispatchEvent(new Event(type));

describe('audio focus: when the game counts as being in the background', () => {
  function setup() {
    const win = new FakeTarget();
    const doc = new FakeTarget();
    const focus = new AudioFocus({ win: win as unknown as Window, doc: doc as unknown as Document });
    const seen: boolean[] = [];
    focus.onChange((bg) => seen.push(bg));
    return { win, doc, focus, seen };
  }

  it('hidden tab, blurred window and a frozen page each silence the game, and all must clear before it returns', () => {
    const { win, doc, focus, seen } = setup();
    expect(focus.background).toBe(false);
    doc.visibilityState = 'hidden';
    fire(doc, 'visibilitychange');
    expect(focus.background).toBe(true);
    fire(win, 'blur');
    fire(win, 'pagehide');
    doc.visibilityState = 'visible';
    fire(doc, 'visibilitychange');
    expect(focus.background).toBe(true); // still blurred and frozen
    fire(win, 'focus');
    expect(focus.background).toBe(true); // still frozen
    fire(win, 'pageshow');
    expect(focus.background).toBe(false);
    expect(seen).toEqual([true, false]); // only changes are reported, not every event
    focus.dispose();
  });

  it('a window blur alone (another window or the dev tools took the focus) is enough', () => {
    const { win, focus, seen } = setup();
    fire(win, 'blur');
    expect(focus.background).toBe(true);
    fire(win, 'focus');
    expect(focus.background).toBe(false);
    expect(seen).toEqual([true, false]);
    focus.dispose();
  });

  it('Page Lifecycle freeze/resume and the Tauri window events are honoured', async () => {
    const win = new FakeTarget();
    const doc = new FakeTarget();
    const handlers = new Map<string, () => void>();
    (win as unknown as { __TAURI__: unknown }).__TAURI__ = {
      event: {
        listen: (name: string, cb: () => void) => {
          handlers.set(name, cb);
          return Promise.resolve(() => handlers.delete(name));
        },
      },
    };
    const focus = new AudioFocus({ win: win as unknown as Window, doc: doc as unknown as Document });
    await Promise.resolve();
    fire(doc, 'freeze');
    expect(focus.background).toBe(true);
    fire(doc, 'resume');
    expect(focus.background).toBe(false);
    handlers.get('tauri://blur')?.();
    expect(focus.background).toBe(true);
    handlers.get('tauri://focus')?.();
    expect(focus.background).toBe(false);
    focus.dispose();
  });

  it('starts out in the background when the page is already hidden or unfocused', () => {
    const win = new FakeTarget();
    const doc = new FakeTarget();
    doc.visibilityState = 'hidden';
    expect(new AudioFocus({ win: win as unknown as Window, doc: doc as unknown as Document }).background).toBe(true);
    doc.visibilityState = 'visible';
    doc.focused = false;
    expect(new AudioFocus({ win: win as unknown as Window, doc: doc as unknown as Document }).background).toBe(true);
  });

  it('disposing removes every listener', () => {
    const { win, doc, focus, seen } = setup();
    focus.dispose();
    fire(win, 'blur');
    doc.visibilityState = 'hidden';
    fire(doc, 'visibilitychange');
    expect(seen).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------- the mixer

class P {
  value = 0;
  setValueAtTime(v: number): this {
    this.value = v;
    return this;
  }
  setTargetAtTime(v: number): this {
    this.value = v;
    return this;
  }
  linearRampToValueAtTime(v: number): this {
    this.value = v;
    return this;
  }
  exponentialRampToValueAtTime(v: number): this {
    this.value = v;
    return this;
  }
  cancelScheduledValues(): this {
    return this;
  }
}
class N {
  gain = new P();
  frequency = new P();
  Q = new P();
  threshold = new P();
  knee = new P();
  ratio = new P();
  attack = new P();
  release = new P();
  type = '';
  buffer: unknown = null;
  loop = false;
  onended: (() => void) | null = null;
  connect<T>(n: T): T {
    return n;
  }
  disconnect(): void {
    /* nothing */
  }
  start(): void {
    /* nothing */
  }
  stop(): void {
    /* nothing */
  }
  setPeriodicWave(): void {
    /* nothing */
  }
}
class Ctx {
  currentTime = 0;
  state: AudioContextState = 'running';
  sampleRate = 8000;
  destination = new N();
  suspends = 0;
  resumes = 0;
  createGain = () => new N();
  createOscillator = () => new N();
  createPeriodicWave = () => ({});
  createMediaElementSource = () => new N();
  createBiquadFilter = () => new N();
  createDynamicsCompressor = () => new N();
  createBufferSource = () => new N();
  createBuffer = (_c: number, len: number) => ({ getChannelData: () => new Float32Array(len) });
  suspend = () => {
    this.suspends++;
    this.state = 'suspended';
    return Promise.resolve();
  };
  resume = () => {
    this.resumes++;
    this.state = 'running';
    return Promise.resolve();
  };
  close = () => Promise.resolve();
}

describe('audio engine: out-of-focus silence', () => {
  let ctx: Ctx;
  let audio: AudioEngine;
  beforeEach(() => {
    vi.useFakeTimers();
    (globalThis as { window?: unknown }).window = globalThis;
    ctx = new Ctx();
    audio = new AudioEngine(() => ctx as unknown as AudioContext);
    audio.unlock();
    audio.setLevels({ masterVolume: 0.8, musicVolume: 0.7, sfxVolume: 0.9, muted: false, ambientVolume: 0.4 });
  });
  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as { window?: unknown }).window;
  });

  it('closes the gate at once and suspends the whole context, so no bus can be heard', async () => {
    expect(audio.gateLevel).toBe(1);
    audio.setBackground(true);
    expect(audio.inBackground).toBe(true);
    expect(audio.gateLevel).toBe(0);
    expect(ctx.suspends).toBe(0); // the fade out finishes first (no click)
    await vi.advanceTimersByTimeAsync(200);
    expect(ctx.suspends).toBe(1);
    expect(ctx.state).toBe('suspended');
  });

  it('on return it resumes the context and fades the gate back in, once, without restarting anything', async () => {
    audio.setBackground(true);
    await vi.advanceTimersByTimeAsync(200);
    audio.setBackground(false);
    await vi.advanceTimersByTimeAsync(50);
    expect(ctx.resumes).toBe(1);
    expect(audio.gateLevel).toBe(1);
    audio.setBackground(false); // repeated calls do nothing
    expect(ctx.resumes).toBe(1);
  });

  it('a quick away-and-back never suspends the context (no pointless stop/start)', async () => {
    audio.setBackground(true);
    await vi.advanceTimersByTimeAsync(60);
    audio.setBackground(false);
    await vi.advanceTimersByTimeAsync(400);
    expect(ctx.suspends).toBe(0);
    expect(audio.gateLevel).toBe(1);
  });

  it('a gesture while in the background does not wake the sound up', async () => {
    audio.setBackground(true);
    await vi.advanceTimersByTimeAsync(200);
    const resumes = ctx.resumes;
    audio.unlock();
    expect(ctx.resumes).toBe(resumes);
    expect(audio.gateLevel).toBe(0);
  });

  it('a context created while already in the background starts silent', () => {
    const fresh = new AudioEngine(() => new Ctx() as unknown as AudioContext);
    fresh.setBackground(true);
    fresh.unlock();
    expect(fresh.gateLevel).toBe(0);
  });

  it('the saved levels and both mutes are untouched by going away and coming back', async () => {
    audio.setLevels({ masterVolume: 0.5, musicVolume: 0.3, sfxVolume: 0.6, muted: false, ambientVolume: 0.2, musicMuted: true });
    const before = { ...audio.mix };
    audio.setBackground(true);
    await vi.advanceTimersByTimeAsync(200);
    audio.setBackground(false);
    await vi.advanceTimersByTimeAsync(300);
    expect(audio.mix).toEqual(before);
    expect(audio.musicAudible).toBe(false); // the Music mute still holds
  });
});

describe('music: nothing plays or starts while in the background', () => {
  class A {
    src = '';
    currentTime = 0;
    paused = true;
    error: unknown = null;
    preload = '';
    loop = false;
    plays = 0;
    private l = new Map<string, Set<() => void>>();
    canPlayType = () => 'probably';
    setAttribute(): void {
      /* playsinline */
    }
    removeAttribute(n: string): void {
      if (n === 'src') this.src = '';
    }
    addEventListener(n: string, f: () => void): void {
      (this.l.get(n) ?? this.l.set(n, new Set()).get(n)!).add(f);
    }
    removeEventListener(n: string, f: () => void): void {
      this.l.get(n)?.delete(f);
    }
    load(): void {
      if (this.src) queueMicrotask(() => this.l.get('canplay')?.forEach((f) => f()));
    }
    play(): Promise<void> {
      this.plays++;
      this.paused = false;
      return Promise.resolve();
    }
    pause(): void {
      this.paused = true;
    }
  }
  const all: A[] = [];
  const meta: TrackMeta = { title: 't', duration: 200, gainDb: -2, start: 0.1, end: 199 };
  const mk = (): MusicManager => {
    const c = new Ctx();
    const bus = new N();
    const env: MusicEnv = {
      context: () => c as unknown as AudioContext,
      output: () => bus as unknown as AudioNode,
      createAudio: () => {
        const a = new A();
        all.push(a);
        return a as unknown as HTMLAudioElement;
      },
      loadManifest: () => Promise.resolve({ 'road-to-the-clouds': meta, 'mountain-pass': meta }),
      urlFor: (s, f) => `/${s}.${f}`,
      now: () => Date.now(),
    };
    return new MusicManager(env);
  };
  const settle = async (): Promise<void> => {
    for (let i = 0; i < 12; i++) await Promise.resolve();
    await vi.advanceTimersByTimeAsync(20);
  };
  beforeEach(() => {
    vi.useFakeTimers();
    (globalThis as { window?: unknown }).window = globalThis;
    all.length = 0;
  });
  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as { window?: unknown }).window;
  });

  it('pauses at once, ignores scene changes while away, and carries on when focus returns', async () => {
    const m = mk();
    m.request('menu', 'road-to-the-clouds');
    await settle();
    expect(all.filter((a) => !a.paused && a.src)).toHaveLength(1);
    m.setBackground(true);
    expect(all.filter((a) => !a.paused)).toHaveLength(0);
    m.request('levels', 'mountain-pass'); // navigation while away starts nothing
    await settle();
    expect(all.filter((a) => !a.paused)).toHaveLength(0);
    m.setBackground(false);
    await settle();
    const playing = all.filter((a) => !a.paused && a.src);
    expect(playing).toHaveLength(1); // exactly one track, never two overlapping
    expect(m.deckCount).toBe(2);
    m.dispose();
  });
});

// ---------------------------------------------------------------------------------------------- the default mix

describe('the default mix and saved preferences', () => {
  it('new players start with the music up and the environment well below it', () => {
    const d = defaultSettings();
    expect(d.musicVolume).toBeGreaterThan(d.ambientVolume);
    expect(d.mixRev).toBe(MIX_REV);
  });

  it('players who never touched the sliders move to the new defaults once; chosen values are kept', () => {
    const fresh = defaultSettings();
    const untouched = parseSettings({ musicVolume: 0.5, ambientVolume: 0.7 }, fresh); // the old defaults, no mixRev
    expect(untouched.musicVolume).toBe(fresh.musicVolume);
    expect(untouched.ambientVolume).toBe(fresh.ambientVolume);
    const chosen = parseSettings({ musicVolume: 0.3, ambientVolume: 0.9 }, fresh);
    expect(chosen.musicVolume).toBe(0.3);
    expect(chosen.ambientVolume).toBe(0.9);
    // Once on the new revision, a value equal to an old default is a real choice and is kept.
    const again = parseSettings({ mixRev: MIX_REV, musicVolume: 0.5, ambientVolume: 0.7 }, fresh);
    expect(again.musicVolume).toBe(0.5);
    expect(again.ambientVolume).toBe(0.7);
  });

  it('at the defaults the soundtrack is louder than the environment, and the environment is still audible when raised', () => {
    const win = globalThis as { window?: unknown };
    win.window = globalThis;
    const audio = new AudioEngine(() => new Ctx() as unknown as AudioContext);
    audio.unlock();
    const d = defaultSettings();
    audio.setLevels({ masterVolume: d.masterVolume, musicVolume: d.musicVolume, sfxVolume: d.sfxVolume, muted: false, ambientVolume: d.ambientVolume });
    audio.setDriving(true);
    expect(audio.mix.music).toBeGreaterThan(audio.mix.ambience * 3);
    expect(audio.mix.music).toBeGreaterThan(audio.mix.weather * 3);
    expect(audio.mix.engine).toBeGreaterThan(audio.mix.ambience); // the engine stays clearly above the environment
    expect(audio.mix.sfx).toBeGreaterThan(audio.mix.ambience);
    audio.setLevels({ masterVolume: d.masterVolume, musicVolume: d.musicVolume, sfxVolume: d.sfxVolume, muted: false, ambientVolume: 1 });
    expect(audio.mix.ambience).toBeGreaterThan(0.25); // raising the slider brings the environment up
    delete win.window;
  });
});
