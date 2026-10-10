import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MusicManager } from '../src/audio/MusicManager';
import type { MusicEnv, TrackMeta } from '../src/audio/MusicManager';
import { EXTREME_LEVELS, LOOPING, RaceRotation, SCENE_TRACKS, fixedTrack, sceneFor } from '../src/audio/musicPlan';
import type { SceneInput, TrackSlug } from '../src/audio/musicPlan';
import { listLevels } from '../src/data/levels';

// ------------------------------------------------------------------------------------------------ the plan

const base: SceneInput = { flow: 'menu', menuScreen: 'menu', aboutOpen: false, finish: null, levelId: 'pass-run' };

describe('music plan: which track belongs to which screen', () => {
  it('maps the requested screens to the requested tracks', () => {
    expect(fixedTrack('menu')).toBe('road-to-the-clouds');
    expect(fixedTrack('garage')).toBe('mischievous-groove');
    expect(fixedTrack('levels')).toBe('mountain-pass');
    expect(fixedTrack('victory')).toBe('first-place-summit');
    expect(fixedTrack('credits')).toBe('himalayan-sunset');
    expect(fixedTrack('splash')).toBe('intro-sting');
    expect(SCENE_TRACKS.extreme).toEqual(['maquina-de-guerra']);
    expect([...SCENE_TRACKS.race].sort()).toEqual(['mountain-road-fury', 'off-road-blitz', 'off-road-fury']);
  });

  it('follows navigation and gameplay state', () => {
    expect(sceneFor({ ...base })).toBe('menu');
    expect(sceneFor({ ...base, menuScreen: 'levels' })).toBe('levels');
    expect(sceneFor({ ...base, menuScreen: 'garage' })).toBe('garage');
    expect(sceneFor({ ...base, aboutOpen: true })).toBe('credits');
    expect(sceneFor({ ...base, flow: 'playing' })).toBe('race');
    expect(sceneFor({ ...base, flow: 'paused' })).toBe('race'); // the race music carries on through pause
    expect(sceneFor({ ...base, flow: 'playing', levelId: 'gmc-plains' })).toBe('extreme');
  });

  it('the victory theme is for a completed mission only', () => {
    expect(sceneFor({ ...base, flow: 'finished', finish: 'success' })).toBe('victory');
    expect(sceneFor({ ...base, flow: 'finished', finish: 'failed' })).toBe('silent');
    expect(sceneFor({ ...base, flow: 'finished', finish: null })).toBe('silent');
  });

  it('extreme challenges are real missions', () => {
    const ids = new Set(listLevels().map((l) => l.id));
    for (const id of EXTREME_LEVELS) expect(ids.has(id), id).toBe(true);
  });

  it('only the start-up sting plays once; everything else loops', () => {
    expect(LOOPING.splash).toBe(false);
    for (const scene of ['menu', 'levels', 'garage', 'race', 'extreme', 'victory', 'credits'] as const) expect(LOOPING[scene], scene).toBe(true);
  });

  it('race tracks rotate between races, keep their place across sessions, and ignore the rotation for the extreme track', () => {
    const mem = new Map<string, string>();
    const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    const a = new RaceRotation(store);
    const picks = [a.next('race'), a.next('race'), a.next('race'), a.next('race')];
    expect(new Set(picks.slice(0, 3)).size).toBe(3);
    expect(picks[3]).toBe(picks[0]);
    for (let i = 0; i < 4; i++) expect(a.next('extreme')).toBe('maquina-de-guerra');
    const b = new RaceRotation(store); // a new session carries on from where the last one stopped
    expect(b.next('race')).toBe(picks[1]);
  });

  it('survives unavailable storage', () => {
    const r = new RaceRotation(null);
    expect(SCENE_TRACKS.race).toContain(r.next('race'));
  });
});

// ------------------------------------------------------------------------------------------------ the player (with fakes)

class FakeParam {
  value = 0;
  curves: { len: number; duration: number }[] = [];
  cancelScheduledValues(): void {
    /* nothing scheduled in the fake */
  }
  setValueAtTime(v: number): void {
    this.value = v;
  }
  setValueCurveAtTime(c: Float32Array, _t: number, duration: number): void {
    this.curves.push({ len: c.length, duration });
    this.value = c[c.length - 1];
  }
  linearRampToValueAtTime(v: number): void {
    this.value = v;
  }
}
class FakeNode {
  gain = new FakeParam();
  connect(n: unknown): unknown {
    return n;
  }
  disconnect(): void {
    /* nothing */
  }
}
class FakeContext {
  currentTime = 0;
  state: 'running' | 'suspended' = 'running';
  gains: FakeNode[] = [];
  createGain(): FakeNode {
    const g = new FakeNode();
    this.gains.push(g);
    return g;
  }
  createMediaElementSource(): FakeNode {
    return new FakeNode();
  }
  resume(): Promise<void> {
    this.state = 'running';
    return Promise.resolve();
  }
}
class FakeAudio {
  static all: FakeAudio[] = [];
  src = '';
  currentTime = 0;
  paused = true;
  ended = false;
  error: unknown = null;
  preload = '';
  loop = false;
  loads = 0;
  playCalls = 0;
  rejectPlay = false;
  mp3Only = false;
  private listeners = new Map<string, Set<() => void>>();
  constructor() {
    FakeAudio.all.push(this);
  }
  canPlayType(type: string): string {
    return this.mp3Only ? (type.includes('mpeg') ? 'probably' : '') : 'probably';
  }
  setAttribute(): void {
    /* playsinline */
  }
  removeAttribute(name: string): void {
    if (name === 'src') this.src = '';
  }
  addEventListener(name: string, fn: () => void): void {
    (this.listeners.get(name) ?? this.listeners.set(name, new Set()).get(name)!).add(fn);
  }
  removeEventListener(name: string, fn: () => void): void {
    this.listeners.get(name)?.delete(fn);
  }
  load(): void {
    this.loads++;
    if (this.src) queueMicrotask(() => this.listeners.get('canplay')?.forEach((f) => f()));
  }
  play(): Promise<void> {
    this.playCalls++;
    if (this.rejectPlay) return Promise.reject(new DOMException('blocked', 'NotAllowedError'));
    this.paused = false;
    return Promise.resolve();
  }
  pause(): void {
    this.paused = true;
  }
}

const META: Record<string, TrackMeta> = Object.fromEntries(
  (['road-to-the-clouds', 'mischievous-groove', 'mountain-pass', 'off-road-blitz', 'off-road-fury', 'mountain-road-fury', 'maquina-de-guerra', 'first-place-summit', 'himalayan-sunset', 'intro-sting'] as const).map((s) => [s, s === 'intro-sting' ? { title: s, duration: 8, gainDb: -2, start: 0, end: 8 } : { title: s, duration: 200, gainDb: -2, start: 0.1, end: 199 }]),
);

function setup(opts: { mp3Only?: boolean } = {}) {
  FakeAudio.all = [];
  const ctx = new FakeContext();
  const bus = new FakeNode();
  let hasContext = true;
  const env: MusicEnv = {
    context: () => (hasContext ? (ctx as unknown as AudioContext) : null),
    output: () => (hasContext ? (bus as unknown as AudioNode) : null),
    createAudio: () => {
      const a = new FakeAudio();
      a.mp3Only = !!opts.mp3Only;
      return a as unknown as HTMLAudioElement;
    },
    loadManifest: () => Promise.resolve(META),
    urlFor: (slug: TrackSlug, format) => `/audio/music/${slug}.${format}`,
    now: () => Date.now(),
  };
  const m = new MusicManager(env);
  return { m, ctx, setContext: (v: boolean) => (hasContext = v) };
}
const settle = async (): Promise<void> => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
  await vi.advanceTimersByTimeAsync(20);
};
const playing = (): FakeAudio[] => FakeAudio.all.filter((a) => !a.paused && a.src);

describe('music player', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    (globalThis as { window?: unknown }).window = globalThis;
  });
  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as { window?: unknown }).window;
  });

  it('plays the requested track once, in Opus when the browser has it, and never creates more than two players', async () => {
    const { m } = setup();
    m.request('menu', 'road-to-the-clouds');
    await settle();
    expect(playing().map((a) => a.src)).toEqual(['/audio/music/road-to-the-clouds.webm']);
    expect(m.status.slug).toBe('road-to-the-clouds');
    m.request('menu', 'road-to-the-clouds'); // asking again changes nothing
    m.request('menu', 'road-to-the-clouds');
    await settle();
    expect(FakeAudio.all.length).toBeLessThanOrEqual(3); // two decks (plus the codec probe)
    expect(playing()).toHaveLength(1);
    expect(FakeAudio.all.reduce((n, a) => n + a.playCalls, 0)).toBe(1);
    m.dispose();
  });

  it('falls back to the MP3 when Opus is not supported', async () => {
    const { m } = setup({ mp3Only: true });
    m.request('levels', 'mountain-pass');
    await settle();
    expect(playing()[0].src).toBe('/audio/music/mountain-pass.mp3');
    expect(m.status.format).toBe('mp3');
    m.dispose();
  });

  it('crossfades between sections over 0.6-1.2 s with equal-power curves, and leaves exactly one track playing', async () => {
    const { m, ctx } = setup();
    m.request('menu', 'road-to-the-clouds');
    await settle();
    m.request('levels', 'mountain-pass');
    await settle();
    expect(playing()).toHaveLength(2); // both are audible during the fade
    const fades = ctx.gains.flatMap((g) => g.gain.curves);
    expect(fades.length).toBeGreaterThanOrEqual(3); // in, then in + out
    for (const f of fades.slice(1)) {
      expect(f.duration).toBeGreaterThanOrEqual(0.6);
      expect(f.duration).toBeLessThanOrEqual(1.2);
    }
    await vi.advanceTimersByTimeAsync(1500);
    expect(playing().map((a) => a.src)).toEqual(['/audio/music/mountain-pass.webm']);
    expect(m.status.audible).toBe(1);
    m.dispose();
  });

  it('many quick scene changes never leave more than one track playing or leak players', async () => {
    const { m } = setup();
    const slugs: [Parameters<MusicManager['request']>[0], TrackSlug][] = [['menu', 'road-to-the-clouds'], ['levels', 'mountain-pass'], ['garage', 'mischievous-groove'], ['race', 'off-road-blitz'], ['credits', 'himalayan-sunset'], ['menu', 'road-to-the-clouds']];
    for (let round = 0; round < 3; round++)
      for (const [scene, slug] of slugs) {
        m.request(scene, slug);
        await vi.advanceTimersByTimeAsync(250);
      }
    await vi.advanceTimersByTimeAsync(3000);
    expect(playing()).toHaveLength(1);
    expect(m.deckCount).toBe(2);
    expect(m.status.slug).toBe('road-to-the-clouds');
    m.dispose();
  });

  it('loops a track by crossfading its end into its start, without a gap and without a second copy afterwards', async () => {
    const { m } = setup();
    m.request('race', 'off-road-blitz');
    await settle();
    const first = playing()[0];
    first.currentTime = 198.2; // inside the last 1.1 s of the music
    await vi.advanceTimersByTimeAsync(400);
    await settle();
    expect(playing().length).toBeGreaterThanOrEqual(1);
    await vi.advanceTimersByTimeAsync(1500);
    const now = playing();
    expect(now).toHaveLength(1);
    expect(now[0]).not.toBe(first); // the loop continued on the other deck
    expect(now[0].src).toBe('/audio/music/off-road-blitz.webm');
    expect(now[0].currentTime).toBeLessThan(5);
    m.dispose();
  });

  it('the start-up sting plays once and fades out at its end', async () => {
    const { m } = setup();
    m.request('splash', 'intro-sting');
    await settle();
    expect(playing()).toHaveLength(1);
    playing()[0].currentTime = 6.9;
    await vi.advanceTimersByTimeAsync(600);
    await vi.advanceTimersByTimeAsync(1000);
    expect(playing()).toHaveLength(0);
    m.dispose();
  });

  it('a blocked autoplay waits for a gesture, then starts', async () => {
    const { m } = setup();
    m.request('menu', 'road-to-the-clouds');
    await settle();
    m.dispose();

    const t = setup();
    FakeAudio.all.forEach((a) => (a.rejectPlay = true));
    t.m.request('menu', 'road-to-the-clouds');
    // decks are created lazily: block them as soon as they exist
    FakeAudio.all.forEach((a) => (a.rejectPlay = true));
    await settle();
    if (playing().length === 0) {
      expect(t.m.status.blocked).toBe(true);
      FakeAudio.all.forEach((a) => (a.rejectPlay = false));
      t.m.notifyGesture();
      await settle();
      expect(playing()).toHaveLength(1);
      expect(t.m.status.blocked).toBe(false);
    }
    t.m.dispose();
  });

  it('waits for the audio context (first gesture) before doing anything', async () => {
    const { m, setContext } = setup();
    setContext(false);
    m.request('menu', 'road-to-the-clouds');
    await settle();
    expect(playing()).toHaveLength(0);
    setContext(true);
    m.notifyGesture();
    await settle();
    expect(playing()).toHaveLength(1);
    m.dispose();
  });

  it('turning music off stops it and fetching; turning it on resumes the current scene', async () => {
    const { m } = setup();
    m.request('menu', 'road-to-the-clouds');
    await settle();
    m.setEnabled(false);
    await vi.advanceTimersByTimeAsync(800);
    expect(playing()).toHaveLength(0);
    const loadsBefore = FakeAudio.all.reduce((n, a) => n + a.loads, 0);
    m.request('levels', 'mountain-pass'); // navigating while muted loads nothing
    await settle();
    expect(FakeAudio.all.reduce((n, a) => n + a.loads, 0)).toBe(loadsBefore);
    m.setEnabled(true);
    await settle();
    expect(playing().map((a) => a.src)).toEqual(['/audio/music/mountain-pass.webm']);
    m.dispose();
  });

  it('asking for silence (a failed run) fades the music out', async () => {
    const { m } = setup();
    m.request('race', 'off-road-fury');
    await settle();
    m.request('silent', null);
    await vi.advanceTimersByTimeAsync(1500);
    expect(playing()).toHaveLength(0);
    m.dispose();
  });

  it('disposing releases everything', async () => {
    const { m } = setup();
    m.request('menu', 'road-to-the-clouds');
    await settle();
    m.dispose();
    expect(playing()).toHaveLength(0);
    expect(m.deckCount).toBe(0);
    m.request('menu', 'road-to-the-clouds'); // ignored after dispose
    await settle();
    expect(playing()).toHaveLength(0);
  });
});
