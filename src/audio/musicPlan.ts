/**
 * What music belongs where. Pure data and rules (no audio, no DOM), so the mapping is easy to read and to test.
 *
 * Tracks are named by slug (see scripts/audio-assets.mjs and public/audio/music/manifest.json).
 */
export type MusicScene =
  | 'splash'
  | 'menu'
  | 'levels'
  | 'garage'
  | 'race'
  | 'extreme'
  | 'victory'
  | 'credits'
  | 'silent';

export type TrackSlug =
  | 'road-to-the-clouds'
  | 'mischievous-groove'
  | 'mountain-pass'
  | 'off-road-blitz'
  | 'off-road-fury'
  | 'mountain-road-fury'
  | 'maquina-de-guerra'
  | 'first-place-summit'
  | 'himalayan-sunset'
  | 'intro-sting';

/** Where each track plays. Normal racing rotates through its list, one track per race. */
export const SCENE_TRACKS: Record<Exclude<MusicScene, 'silent'>, readonly TrackSlug[]> = {
  splash: ['intro-sting'],
  menu: ['road-to-the-clouds'],
  levels: ['mountain-pass'],
  garage: ['mischievous-groove'],
  race: ['off-road-blitz', 'off-road-fury', 'mountain-road-fury'],
  extreme: ['maquina-de-guerra'],
  victory: ['first-place-summit'],
  credits: ['himalayan-sunset'],
};

/** Scenes whose track repeats until the scene changes. The start-up sting plays once. */
export const LOOPING: Record<MusicScene, boolean> = {
  splash: false,
  menu: true,
  levels: true,
  garage: true,
  race: true,
  extreme: true,
  victory: true,
  credits: true,
  silent: false,
};

/**
 * The missions that are extreme challenges: the two off-road finale routes. (No new modes are invented for the music: these are
 * existing missions, picked for their difficulty and their set pieces.)
 */
export const EXTREME_LEVELS: ReadonlySet<string> = new Set(['remote-expedition', 'gmc-plains']);

export interface SceneInput {
  /** Top-level flow state. */
  flow: 'menu' | 'playing' | 'paused' | 'finished';
  /** Which menu screen is showing while the flow is `menu`. */
  menuScreen: 'menu' | 'levels' | 'garage';
  aboutOpen: boolean;
  /** The result of the run that just ended (only meaningful while `flow` is `finished`). */
  finish: 'success' | 'failed' | null;
  levelId: string;
}

/** The scene for the current navigation / gameplay state. `null` means "no change": keep what is playing. */
export function sceneFor(s: SceneInput): MusicScene | null {
  if (s.aboutOpen) return 'credits';
  switch (s.flow) {
    case 'playing':
    case 'paused':
      return EXTREME_LEVELS.has(s.levelId) ? 'extreme' : 'race';
    case 'finished':
      // Only a completed mission earns the victory theme; a failed run just lets the race music fall away.
      return s.finish === 'success' ? 'victory' : 'silent';
    case 'menu':
      return s.menuScreen;
  }
}

/**
 * Picks the race track. Each new race moves to the next track in the list (so consecutive races sound different), and the position is
 * remembered across sessions. The same track keeps playing through pause and resume, because nothing here is asked then.
 */
export class RaceRotation {
  private index: number;

  constructor(
    private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | null,
    private readonly key = 'cbhr.music.race',
  ) {
    let start = -1;
    try {
      const v = Number(storage?.getItem(key));
      if (Number.isInteger(v) && v >= 0) start = v;
    } catch {
      /* storage unavailable */
    }
    this.index = start;
  }

  /** The track for the next race of a scene (extreme challenges have one track and ignore the rotation). */
  next(scene: 'race' | 'extreme'): TrackSlug {
    const list = SCENE_TRACKS[scene];
    if (list.length === 1) return list[0];
    this.index = (this.index + 1) % list.length;
    try {
      this.storage?.setItem(this.key, String(this.index));
    } catch {
      /* storage unavailable */
    }
    return list[this.index];
  }
}

/** The track for a scene that has a fixed one (everything except racing). */
export const fixedTrack = (scene: Exclude<MusicScene, 'silent' | 'race' | 'extreme'>): TrackSlug => SCENE_TRACKS[scene][0];
