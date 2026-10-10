/**
 * Engine voices. Each vehicle gets its own recipe for the synthesised engine, so a hatchback, a minibus, an SUV
 * and the flagship 4x4 are told apart by ear and not only by their pitch.
 *
 * The numbers describe a synthesis recipe, not a real engine: `idleHz`/`rangeHz` set the firing fundamental,
 * `wave` and `harsh` the timbre, `sub` the weight, `body` a resonance that gives the vehicle its "box", `lump`
 * the uneven idle (fewer, bigger cylinders chug more), `rasp` the intake/exhaust noise, `whine` a turbo or
 * supercharger tone, and `pops` how readily it burbles on a lifted throttle.
 */
export interface EngineVoice {
  wave: OscillatorType;
  /** Firing harmonics from a custom original waveform, normalized by Web Audio. */
  partials: number[];
  idleHz: number;
  rangeHz: number;
  /** 0..1 level of the 2x harmonic (square) layer. */
  harsh: number;
  /** 0..1 level of the half-frequency body layer. */
  sub: number;
  /** Low-pass cutoff (Hz) at idle and extra cutoff gained at full revs and load. */
  cutoff: number;
  cutoffRange: number;
  /** Resonance centre (Hz) and gain (dB) of the cabin/exhaust body. */
  bodyHz: number;
  bodyGain: number;
  /** 0..1 depth of the pulsing idle, and its rate as a fraction of the firing frequency. */
  lump: number;
  lumpRate: number;
  /** 0..1 level of intake and exhaust noise. */
  rasp: number;
  /** Turbo/supercharger whine: mix 0..1, base and extra frequency (Hz). */
  whine: number;
  whineHz: number;
  whineRange: number;
  /** 0..1 chance of a burble per overrun opportunity. */
  pops: number;
  /** Overall level of this voice. */
  gain: number;
}

export const VOICES: Record<string, EngineVoice> = {
  // A small, thin, buzzy three-cylinder. Works hard, sounds it.
  'dzo-hatch': {
    partials: [0, 1, 0.12, 0.48, 0.06, 0.22, 0.02, 0.12],
    wave: 'square',
    idleHz: 44,
    rangeHz: 150,
    harsh: 0.55,
    sub: 0.12,
    cutoff: 1500,
    cutoffRange: 1800,
    bodyHz: 330,
    bodyGain: 5,
    lump: 0.3,
    lumpRate: 0.5,
    rasp: 0.28,
    whine: 0.06,
    whineHz: 1100,
    whineRange: 1500,
    pops: 0,
    gain: 0.85,
  },
  // A heavy diesel: deep, lazy, clattering, with a turbo that whistles at the top.
  'tourist-coaster': {
    partials: [0, 1, 0.68, 0.24, 0.36, 0.18, 0.16, 0.1],
    wave: 'sawtooth',
    idleHz: 29,
    rangeHz: 72,
    harsh: 0.3,
    sub: 0.95,
    cutoff: 620,
    cutoffRange: 900,
    bodyHz: 105,
    bodyGain: 7,
    lump: 0.55,
    lumpRate: 0.5,
    rasp: 0.5,
    whine: 0.2,
    whineHz: 1300,
    whineRange: 900,
    pops: 0,
    gain: 1.05,
  },
  // A smooth, modern six: calm at cruise, a soft turbo, nothing dramatic.
  'druk-ranger': {
    partials: [0, 1, 0.18, 0.14, 0.06, 0.045, 0.025, 0.01],
    wave: 'sawtooth',
    idleHz: 37,
    rangeHz: 112,
    harsh: 0.3,
    sub: 0.5,
    cutoff: 1000,
    cutoffRange: 1500,
    bodyHz: 190,
    bodyGain: 4,
    lump: 0.1,
    lumpRate: 1,
    rasp: 0.3,
    whine: 0.14,
    whineHz: 2000,
    whineRange: 2200,
    pops: 0.12,
    gain: 0.95,
  },
  // A big V8 with a supercharger: the lowest, fullest voice, a burbling idle and a rising whine.
  'dragon-cruiser': {
    partials: [0, 1, 0.54, 0.32, 0.11, 0.2, 0.04, 0.12],
    wave: 'sawtooth',
    idleHz: 25,
    rangeHz: 96,
    harsh: 0.5,
    sub: 1,
    cutoff: 820,
    cutoffRange: 1700,
    bodyHz: 82,
    bodyGain: 8,
    lump: 0.5,
    lumpRate: 0.5,
    rasp: 0.45,
    whine: 0.22,
    whineHz: 2400,
    whineRange: 3600,
    pops: 0.55,
    gain: 1.2,
  },
};

/** A voice for any vehicle: its own recipe, or a neutral one derived from its audio profile. */
export function voiceFor(id: string | undefined, profile: { idleHz: number; rangeHz: number; cutoff: number; harsh: number; rumble: number }): EngineVoice {
  const own = id ? VOICES[id] : undefined;
  if (own) return own;
  return {
    ...VOICES['druk-ranger'],
    idleHz: profile.idleHz,
    rangeHz: profile.rangeHz,
    cutoff: profile.cutoff,
    harsh: profile.harsh,
    sub: profile.rumble,
  };
}
