# Audio design and listening protocol

All sound is synthesised at runtime with the Web Audio API (no sample files). `src/audio/AudioEngine.ts` owns the
mixer, `src/audio/voices.ts` the per-vehicle engine recipes. This document describes what the system does and, just
as important, what automated tests can and cannot say about it.

## Mixer

```
engine ─┐
sfx ────┤
ui ─────┤
weather ┼─► master ─► limiter (DynamicsCompressor, -12 dB, 8:1) ─► speakers
music ──┤
ambience ─► low-pass (fog) ─┘
```

| Bus      | Trim | Content                                                                 |
| -------- | ---- | ----------------------------------------------------------------------- |
| engine   | 1.0  | tonal engine layers, rasp, turbo whine, burble                          |
| sfx      | 0.8  | tyre roll, skid, gravel crunch, mud squelch, wet hiss, splash, one-shots |
| ui       | 0.55 | clicks and whooshes                                                     |
| ambience | 0.5  | wind, forest, river, crickets, birds, owl, temple bells, aircraft       |
| weather  | 0.6  | rain layers, thunder                                                    |
| music    | 0.7  | generative pentatonic drone and plucks                                  |

Player-facing sliders: Master, Music, Engine and effects, Environment (ambience + weather), and Mute. Trims are
relative: the environment is deliberately the quietest layer.

**Ducking.** While the car is working (throttle and speed) the environment drops by up to 35 %. Important one-shots
(`checkpoint`, `pickup`, `warning`, `finish`, `rockfall`) call `duck(amount, seconds)` which lowers the environment
further for a moment. `mix.duck` exposes the current amount (0..0.8) for the debug overlay and tests.

**Fog.** The ambience bus passes through a low-pass whose cutoff falls from 20 kHz to about 1.7 kHz as `fog` rises, so
fog genuinely muffles the world without touching the engine.

## Engine voices

Each vehicle has its own recipe (`VOICES`): oscillator wave, idle and range of the firing fundamental, a 2x harmonic
(`harsh`), a sub layer, low-pass cutoff range, a body resonance, an uneven idle "lump", intake rasp, turbo/supercharger
whine and burble. They are driven by the same `EngineSim` that drives the HUD (rpm, load, shifting, overrun), so what
you hear matches the gauge.

| Vehicle         | Character                                                        |
| --------------- | ---------------------------------------------------------------- |
| Dzo Hatch       | thin, buzzy small three-cylinder; high revs, light body          |
| Tourist Coaster | deep, lazy diesel with a clatter, a turbo whistle and air brakes |
| Druk Ranger     | smooth, modern six; calm at cruise, soft turbo, rare burble      |
| Dragon Cruiser  | the lowest and fullest voice: V8 lump, supercharger whine, pops  |

## Surfaces and weather

Surface layers are keyed on the surface under the wheels: asphalt (roll), gravel and dirt (crunch), mud (squelch),
wet asphalt (hiss), water (splash scaled by wading depth). Rain adds high and low layers whose level follows rain
intensity; night swaps birds for crickets and an occasional owl; rivers add a low rush; forests add leaf rustle in
wind; some daytime missions add distant temple bells.

## Lifecycle guarantees (covered by `tests/audio.test.ts`)

- Continuous layers are built once at unlock; per-frame updates only set parameters (no node creation).
- One-shots are capped at 14 and disconnect themselves when they end.
- Music start/stop cycles never stack drones.
- Vehicle switches reuse the same engine nodes.
- Every call is safe before unlock or when the audio context cannot be created.
- `dispose()` stops music and closes the context.

## What automated tests do NOT tell you

They prove structure (no leaks, bounded polyphony, parameters in range). They do **not** prove that anything sounds
good, balanced or non-fatiguing. That needs ears.

## Manual listening protocol

Use headphones first, then laptop speakers, then a phone speaker. Start with Master at 80 %, Environment at 70 %.

1. **Engines.** Garage, then Pass Run in each vehicle. Hold W for 20 s, lift off, brake. Can you tell the four apart
   with your eyes closed? Is any harsh, droning or fatiguing after a minute? Does the hatch feel light and the
   Cruiser heavy?
2. **Shifts and revs.** Accelerate through the gears. Do shifts dip the sound naturally? Does the pitch track the
   gauge?
3. **Surfaces.** Drive onto the verge, onto gravel (Chelela, Punakha), through mud (Remote Expedition) and the ford.
   Is each distinct and plausible? Is the splash too loud at low speed?
4. **Weather.** Dochula Storm (heavy rain) and Chelela fog: does rain sit under the engine? Does fog muffle the
   environment but not the engine?
5. **Night.** Bumthang Night: crickets present but not annoying? Owl rare enough?
6. **Ducking.** Pick up a guest and pass a checkpoint: are the chimes audible over the engine and wind? Does the
   environment recover smoothly rather than pumping?
7. **Mix.** Move each slider to 0 and 100 %. Does Environment 0 remove wind and rain only? Is the limiter ever
   audible as distortion at full volume?
8. **Lifecycle.** Pause/resume, change vehicle, restart a mission ten times, then background the tab for a minute:
   no stuck tones, doubled engines or silence after returning.

Record findings as: scenario, vehicle, device/output, what you heard, severity. Anything that makes you reach for the
volume is a bug.

## Debug measurements

`window.__cbhr.state()` (with `?debug=1`) lists the live `mix` snapshot; the debug overlay (Backquote) shows the
engine voice in use and the bus levels. Remember that "Playwright passed" says nothing about loudness.
