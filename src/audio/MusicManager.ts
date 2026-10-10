import { LOOPING } from './musicPlan';
import type { MusicScene, TrackSlug } from './musicPlan';

/** Per-track metadata written by scripts/audio-assets.mjs (public/audio/music/manifest.json). */
export interface TrackMeta {
  title: string;
  duration: number;
  /** Gain (dB) that brings the track to the common loudness. */
  gainDb: number;
  /** Where the music really starts and ends (leading/trailing silence trimmed), for gap-free loops. */
  start: number;
  end: number;
}

export interface MusicEnv {
  /** The shared audio context (null until the first user gesture creates it). */
  context(): AudioContext | null;
  /** Where music goes: the engine's music bus, which carries the Music volume and the global mute. */
  output(): AudioNode | null;
  createAudio(): HTMLAudioElement;
  /** Track metadata, loaded lazily (one small JSON file). */
  loadManifest(): Promise<Record<string, TrackMeta>>;
  /** URL of a track in a given format. */
  urlFor(slug: TrackSlug, format: 'webm' | 'mp3'): string;
  now(): number;
}

const CROSSFADE = 0.9; // seconds: between sections (inside the 0.6 - 1.2 s the design asks for)
const LOOP_FADE = 1.1; // seconds: the track crossfades into itself at its end
const QUICK_FADE = 0.35; // mute, disable, tab hidden
const STEPS = 24;
const CACHE_NAME = 'music-cbhr-v1'; // not "cbhr-*": the service worker prunes those on every release
const CACHE_AFTER_SECONDS = 8; // only tracks that were really listened to are kept for offline play

interface Deck {
  audio: HTMLAudioElement;
  source: MediaElementAudioSourceNode | null;
  gain: GainNode | null;
  slug: TrackSlug | null;
  meta: TrackMeta | null;
  /** Bumped on every (re)assignment so late async results of an older assignment are ignored. */
  token: number;
  loop: boolean;
  fadingOut: boolean;
  blobUrl: string | null;
  playedSince: number;
  cached: boolean;
}

const dbToGain = (db: number): number => Math.pow(10, db / 20);

/**
 * Plays the soundtrack: one track at a time, crossfaded between sections, streamed on demand.
 *
 * - Two decks (HTMLAudioElement -> MediaElementSource -> gain) alternate. A new track starts on the idle deck while the old one fades
 *   out, so there is never more than one audible track after a fade, and the elements are reused, never leaked.
 * - Audio is routed through the Web Audio graph so the Music volume works on iOS (where element.volume is ignored).
 * - `request()` is idempotent and says what should be playing; the manager works out the rest (and retries after autoplay blocks,
 *   interruptions and tab switches).
 * - Tracks loop by crossfading the end into the start (trimmed to the real music), so there is no gap or click at the seam.
 */
export class MusicManager {
  private decks: Deck[] = [];
  private current: Deck | null = null;
  private want: { slug: TrackSlug; scene: MusicScene; loop: boolean } | null = null;
  private manifest: Record<string, TrackMeta> | null = null;
  private manifestLoading: Promise<void> | null = null;
  private out: GainNode | null = null;
  private enabled = true;
  private format: 'webm' | 'mp3';
  private timer: number | null = null;
  private hidden = false;
  private blocked = false;
  private disposed = false;
  private failures = 0;
  /** Set while we pause an element ourselves, so an OS interruption can be told apart. */
  private expectedPause = new WeakSet<HTMLAudioElement>();

  constructor(private readonly env: MusicEnv) {
    const probe = env.createAudio();
    const opus = probe.canPlayType('audio/webm; codecs="opus"');
    this.format = opus === 'probably' || opus === 'maybe' ? 'webm' : 'mp3';
  }

  /** What is playing right now (debug overlay and tests). */
  get status(): { slug: TrackSlug | null; scene: MusicScene | null; playing: boolean; audible: number; format: 'webm' | 'mp3'; enabled: boolean; blocked: boolean } {
    const audible = this.decks.filter((d) => d.slug && !d.audio.paused).length;
    return { slug: this.current?.slug ?? null, scene: this.want?.scene ?? null, playing: !!this.current && !this.current.audio.paused, audible, format: this.format, enabled: this.enabled, blocked: this.blocked };
  }

  /** Number of audio elements the manager owns (never more than two). */
  get deckCount(): number {
    return this.decks.length;
  }

  /** Says what should be playing. Asking for what is already playing changes nothing. */
  request(scene: MusicScene, slug: TrackSlug | null): void {
    if (this.disposed) return;
    if (slug === null) {
      // Silence on purpose (a failed run): let the music fall away.
      this.want = null;
      this.fadeOutCurrent(CROSSFADE);
      return;
    }
    const loop = LOOPING[scene];
    if (this.want && this.want.slug === slug && this.want.scene === scene) return;
    this.want = { slug, scene, loop };
    this.reconcile();
  }

  /** Music on or off (the player's volume/mute settings): off pauses and stops fetching, on picks up where the scene is. */
  setEnabled(on: boolean): void {
    if (this.enabled === on) return;
    this.enabled = on;
    if (!on) this.fadeOutCurrent(QUICK_FADE);
    else this.reconcile();
  }

  /**
   * The game lost or regained focus (hidden tab, blurred or minimised window, frozen page). Music pauses at once and nothing new
   * starts while in the background; on return it carries on from where it was.
   */
  setBackground(on: boolean): void {
    if (this.hidden === on) return;
    this.hidden = on;
    if (on) this.suspendForHidden();
    else this.recover();
  }

  /** A real user gesture happened: autoplay is now allowed, so anything that was blocked or interrupted can start. */
  notifyGesture(): void {
    this.recover();
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    for (const d of this.decks) this.release(d);
    for (const d of this.decks) {
      d.source?.disconnect();
      d.gain?.disconnect();
    }
    this.out?.disconnect();
    this.decks = [];
    this.current = null;
  }

  // ------------------------------------------------------------------------------------------------ internals

  private ready(): boolean {
    const ctx = this.env.context();
    const bus = this.env.output();
    if (!ctx || !bus) return false;
    if (!this.out) {
      this.out = ctx.createGain();
      this.out.connect(bus);
    }
    if (this.decks.length === 0) {
      for (let i = 0; i < 2; i++) {
        const audio = this.env.createAudio();
        audio.preload = 'auto';
        audio.setAttribute('playsinline', '');
        audio.loop = false;
        const gain = ctx.createGain();
        gain.gain.value = 0;
        gain.connect(this.out);
        const source = ctx.createMediaElementSource(audio);
        source.connect(gain);
        const deck: Deck = { audio, source, gain, slug: null, meta: null, token: 0, loop: false, fadingOut: false, blobUrl: null, playedSince: 0, cached: false };
        audio.addEventListener('pause', () => {
          // Paused by the system (a call, another app, headphones pulled out) rather than by us.
          if (!this.expectedPause.has(audio) && deck === this.current && !audio.ended) this.blocked = true;
        });
        audio.addEventListener('error', () => this.onError(deck));
        this.decks.push(deck);
      }
    }
    if (this.timer === null) this.timer = window.setInterval(() => this.tick(), 200);
    return true;
  }

  private async withManifest(): Promise<boolean> {
    if (this.manifest) return true;
    this.manifestLoading ??= this.env
      .loadManifest()
      .then((m) => {
        this.manifest = m;
      })
      .catch(() => {
        this.manifestLoading = null;
      });
    await this.manifestLoading;
    return !!this.manifest;
  }

  private reconcile(): void {
    const want = this.want;
    if (!want || !this.enabled || this.disposed || this.hidden) return;
    if (!this.ready()) return; // no audio context yet: the first gesture calls recover()
    const cur = this.current;
    if (cur && cur.slug === want.slug && !cur.fadingOut && !cur.audio.paused) {
      cur.loop = want.loop;
      return;
    }
    void this.begin(want.slug, want.loop, CROSSFADE, null);
  }

  /** Starts a track on the idle deck and crossfades to it. `at` null = from the track's real start. */
  private async begin(slug: TrackSlug, loop: boolean, fade: number, at: number | null): Promise<void> {
    if (!(await this.withManifest())) return;
    const meta = this.manifest?.[slug];
    if (!meta || !this.ready()) return;
    const old = this.current;
    // The idle deck: not the one playing, and preferably not one still fading out.
    const deck = this.decks.find((d) => d !== old && !d.fadingOut) ?? this.decks.find((d) => d !== old);
    if (!deck) return;
    this.release(deck);
    const token = ++deck.token;
    deck.slug = slug;
    deck.meta = meta;
    deck.loop = loop;
    deck.fadingOut = false;
    deck.playedSince = 0;
    deck.cached = false;
    const ok = await this.attach(deck, slug, at ?? meta.start, token);
    if (!ok || token !== deck.token || this.disposed) return;
    // The scene may have changed while this one was loading.
    if (!this.want || this.want.slug !== slug || !this.enabled || this.hidden) {
      this.release(deck);
      return;
    }
    try {
      this.expectedPause.delete(deck.audio);
      await deck.audio.play();
    } catch {
      // Autoplay policy: nothing has been heard yet. Wait for a gesture; the prepared deck is kept.
      this.blocked = true;
      this.pending = { deck, token, fade };
      return;
    }
    this.blocked = false;
    this.failures = 0;
    deck.playedSince = this.env.now();
    this.crossfade(this.current, deck, fade, dbToGain(meta.gainDb));
  }

  private pending: { deck: Deck; token: number; fade: number } | null = null;
  /** A loop seam crossfade is being prepared (so the 200 ms watcher does not start it twice). */
  private looping = false;

  private async attach(deck: Deck, slug: TrackSlug, startAt: number, token: number): Promise<boolean> {
    const online = typeof navigator === 'undefined' || navigator.onLine !== false;
    let src = this.env.urlFor(slug, this.format);
    if (!online) {
      const blob = await cachedBlob(src);
      if (blob) {
        deck.blobUrl = blob;
        src = blob;
      }
    }
    if (token !== deck.token) return false;
    deck.audio.src = src;
    await new Promise<void>((resolve) => {
      let done = false;
      const finish = (): void => {
        if (done) return;
        done = true;
        deck.audio.removeEventListener('canplay', finish);
        deck.audio.removeEventListener('error', finish);
        window.clearTimeout(timeout);
        resolve();
      };
      const timeout = window.setTimeout(finish, 12000);
      deck.audio.addEventListener('canplay', finish);
      deck.audio.addEventListener('error', finish);
      deck.audio.load();
    });
    if (token !== deck.token) return false;
    if (deck.audio.error) return false;
    try {
      deck.audio.currentTime = startAt;
    } catch {
      /* some browsers refuse before metadata: the track then starts from its beginning, which is fine */
    }
    return true;
  }

  /** The element failed to load or decode: try the other format once, then the offline cache, then give up quietly. */
  private onError(deck: Deck): void {
    if (!deck.slug) return;
    if (this.failures >= 3) return;
    this.failures++;
    const slug = deck.slug;
    if (this.format === 'webm' && !deck.blobUrl && !deck.audio.src.startsWith('blob:')) this.format = 'mp3';
    window.setTimeout(() => {
      if (this.want?.slug === slug && !this.disposed) void this.begin(slug, this.want.loop, CROSSFADE, null);
    }, 800 * this.failures);
  }

  private crossfade(old: Deck | null, next: Deck, seconds: number, target: number): void {
    const ctx = this.env.context();
    if (!ctx || !next.gain) return;
    this.current = next;
    ramp(ctx, next.gain, 'in', target, seconds);
    if (old && old !== next) {
      old.fadingOut = true;
      if (old.gain) ramp(ctx, old.gain, 'out', 0, seconds);
      window.setTimeout(() => {
        if (old.fadingOut && old !== this.current) this.release(old);
      }, seconds * 1000 + 150);
    }
  }

  private fadeOutCurrent(seconds: number): void {
    const cur = this.current;
    const ctx = this.env.context();
    if (!cur || !ctx || !cur.gain) return;
    cur.fadingOut = true;
    ramp(ctx, cur.gain, 'out', 0, seconds);
    this.current = null;
    window.setTimeout(() => {
      if (cur.fadingOut && cur !== this.current) this.release(cur);
    }, seconds * 1000 + 100);
  }

  /** Stops an element and frees what it holds. */
  private release(deck: Deck): void {
    this.expectedPause.add(deck.audio);
    try {
      deck.audio.pause();
      deck.audio.removeAttribute('src');
      deck.audio.load();
    } catch {
      /* already gone */
    }
    if (deck.blobUrl) URL.revokeObjectURL(deck.blobUrl);
    deck.blobUrl = null;
    deck.fadingOut = false;
    deck.slug = null;
    deck.meta = null;
    deck.token++;
    if (deck.gain) deck.gain.gain.value = 0;
    if (this.current === deck) this.current = null;
    if (this.pending?.deck === deck) this.pending = null;
  }

  /** Loop seams, end of one-shot tracks and the offline cache. */
  private tick(): void {
    const cur = this.current;
    if (!cur || !cur.meta || cur.fadingOut || this.hidden || cur.audio.paused) return;
    const left = cur.meta.end - cur.audio.currentTime;
    if (cur.loop && left <= LOOP_FADE && left > 0 && this.decks.length === 2) {
      if (this.looping) return;
      this.looping = true;
      void this.begin(cur.slug as TrackSlug, true, LOOP_FADE, null).finally(() => {
        this.looping = false;
      });
    } else if (!cur.loop && left <= 1.2) {
      this.fadeOutCurrent(Math.max(0.2, left));
    }
    if (!cur.cached && cur.playedSince && this.env.now() - cur.playedSince > CACHE_AFTER_SECONDS * 1000) {
      cur.cached = true;
      void cacheTrack(this.env.urlFor(cur.slug as TrackSlug, this.format));
    }
  }

  private suspendForHidden(): void {
    for (const d of this.decks) {
      if (!d.audio.paused) {
        this.expectedPause.add(d.audio);
        d.audio.pause();
      }
    }
  }

  /** After a gesture, a tab switch or an interruption: start whatever should be playing. */
  private recover(): void {
    if (this.disposed || !this.enabled || this.hidden) return;
    const ctx = this.env.context();
    if (ctx && ctx.state !== 'running') void ctx.resume().catch(() => undefined);
    const pending = this.pending;
    if (pending && pending.token === pending.deck.token && this.want) {
      this.pending = null;
      const old = this.current;
      void pending.deck.audio.play().then(
        () => {
          this.blocked = false;
          pending.deck.playedSince = this.env.now();
          this.crossfade(old, pending.deck, pending.fade, dbToGain(pending.deck.meta?.gainDb ?? 0));
        },
        () => {
          this.pending = pending;
        },
      );
      return;
    }
    const cur = this.current;
    if (cur && cur.audio.paused && !cur.fadingOut && this.want?.slug === cur.slug) {
      this.expectedPause.delete(cur.audio);
      void cur.audio.play().then(
        () => {
          this.blocked = false;
          if (cur.gain && ctx && cur.meta) ramp(ctx, cur.gain, 'in', dbToGain(cur.meta.gainDb), QUICK_FADE);
        },
        () => {
          this.blocked = true;
        },
      );
      return;
    }
    // Nothing playing, or the scene changed while the game was away: start what the scene asks for.
    if (!cur || cur.slug !== this.want?.slug) this.reconcile();
  }
}

/** Equal-power fade (no dip in the middle of a crossfade between two different tracks). */
function ramp(ctx: AudioContext, gain: GainNode, dir: 'in' | 'out', target: number, seconds: number): void {
  const p = gain.gain;
  const t = ctx.currentTime;
  const from = p.value;
  p.cancelScheduledValues(t);
  p.setValueAtTime(from, t);
  const curve = new Float32Array(STEPS);
  for (let i = 0; i < STEPS; i++) {
    const x = i / (STEPS - 1);
    curve[i] = dir === 'in' ? from + (target - from) * Math.sin((x * Math.PI) / 2) : from * Math.cos((x * Math.PI) / 2);
  }
  try {
    p.setValueCurveAtTime(curve, t, Math.max(0.05, seconds));
  } catch {
    p.linearRampToValueAtTime(dir === 'in' ? target : 0, t + seconds);
  }
}

async function cachedBlob(url: string): Promise<string | null> {
  try {
    if (typeof caches === 'undefined') return null;
    const cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(url);
    return hit ? URL.createObjectURL(await hit.blob()) : null;
  } catch {
    return null;
  }
}

async function cacheTrack(url: string): Promise<void> {
  try {
    if (typeof caches === 'undefined') return;
    const cache = await caches.open(CACHE_NAME);
    if (!(await cache.match(url))) await cache.add(url);
  } catch {
    /* storage full or offline: the track simply streams next time */
  }
}
