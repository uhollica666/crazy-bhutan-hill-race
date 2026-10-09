# Architecture

## Technology decisions

| Choice                                | Why                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TypeScript + Vite + Bun**           | Fast loop, tiny config, tree-shaken output. Bun runs installs and scripts; Vite/Vitest/Playwright run on Node underneath.                                                                                                                                                                                              |
| **Three.js** (named imports only)     | Most direct route to a lightweight WebGL game; ~190 KB gzip JS total.                                                                                                                                                                                                                                                  |
| **Custom arcade physics, not Rapier** | Re-evaluated in Stage 2 and kept. Ground is an analytic height-field, so a raycast-suspension body is simpler, needs no ~1.5 MB WASM, and runs headless in Vitest (autopilots drive every level in milliseconds). Two very different vehicles came from _data_, not new physics, which is the test of the abstraction. |
| **Plain DOM/CSS UI**                  | HUD, garage and menus are simple; no framework weight.                                                                                                                                                                                                                                                                 |
| **Synthesised Web Audio**             | Zero audio downloads and licensing risk; per-vehicle engine voices are just parameters.                                                                                                                                                                                                                                |
| **Hand-written service worker**       | ~60 lines; the build plugin injects a precache list and a content-hash version.                                                                                                                                                                                                                                        |
| **State**                             | A typed `Emitter`, a `GameFlow` state machine and a versioned `SaveStore`.                                                                                                                                                                                                                                             |

## Module map (`src/`)

```
app/       Game.ts (composition root + loop + menu flow), GameFlow.ts (menu/playing/paused/finished)
core/      math, seeded noise/PRNG, typed emitter
data/      types.ts; vehicles/ (VehicleDef); levels/ (LevelDef, routes.ts switchback generator); <- all tuning lives here
world/     Road (spline + spatial hash), Terrain (height grid), Course (stations + PhysicsWorld)
physics/   VehicleBody (rigid body, raycast suspension, tyres, assists), types
gameplay/  RaceSession, Comfort (ComfortMeter), scoring, progression (unlock rules), MotionSampler
input/     InputManager (keyboard + gamepad + touch merge), keyboardMap (pure), MenuNav (arrows / gamepad in menus)
render/    GameRenderer, World3D, WorldMesh, Scenery + landmarks, Gates, Environment, VehicleModel,
           CameraRig, effects (Snow, Particles, SkidMarks, VehicleEffects), adaptive, quality, geo, palette
audio/     AudioEngine
ui/        UI (all DOM screens), TouchControls, MiniMap, icons/logo, styles.css + stage2.css
storage/   SaveStore (v2 + migration)
pwa/       register.ts, sw.template.js
dev/       AutoDriver (pure-pursuit bot, tests and ?autodrive)
```

Boundaries: `physics`, `gameplay`, `world`, `data` import nothing from `render`/`ui`/`audio`/DOM, so all rules and the whole campaign are tested in plain Node. Only `app/Game.ts` knows about everything.

## Lifecycle

`requestAnimationFrame` → `dt` (clamped to 0.1 s) → accumulate → N fixed steps of **1/120 s**:
`VehicleBody.step(input)` → `Road.project` → `RaceSession.update(s, lateral)` → `MotionSampler` (horizontal acceleration and body lean) → `RaceSession.feedMotion` (comfort) → render with `alpha = acc/step` interpolating the chassis. Camera, wheel visuals, effects and audio run per frame. Timer and comfort advance in fixed steps, so both are exact and frame-rate independent. Paused = no steps. Max 10 steps per frame.

Menu flow (all inside `flow = menu`): main menu → **mission select** → (loads the level's world if different) → **garage** (live 3D preview of each vehicle at the start line, stats, targets, lock reasons) → run. From pause/results you can restart, change vehicle, jump to the next mission or return to the menu. Level worlds are built on demand and disposed when switching (`World3D.dispose` removes meshes, lights, sky, ridges, fog).

## Vehicle model (one implementation, many vehicles)

Per wheel: ground height/normal from the shared height grid → spring/damper (bump stop, anti-roll bar) → friction-ellipse tyre force, applied at a height controlled by `stability.contactLift` (low = body roll and pitch, high = planted). Chassis box corners collide with ground and parapets via impulses. Assists, all per-vehicle data: speed-sensitive steering with a faster return to centre, a **rollover guard** (`maxLateralAccel` limits steering so cornering never asks for more than the vehicle can take; it understeers instead of tipping), **yaw assist** (damps only the yaw the steering did not request), self-righting torque, downforce, engine braking, auto-hold on slopes. Everything else is in `VehicleDef`: mass, inertia, axles (any number), suspension, engine, steering, grip, camera framing, engine-sound profile, recovery time, medal pace, unlock rule. Adding a vehicle = one data file plus a model builder.

Ratings in the garage (`vehicleStats`) are computed from those numbers, never hand-typed.

## Levels, roads and environments

A `LevelDef` is data: mission (kind, timer style/label, comfort on/off), eligible vehicles (first = recommended), tip, road control points (or a generator like `switchbacks()`), width, checkpoints, time limit, medal times (scaled per vehicle by `pace`, with optional per-level `pace` overrides), comfort thresholds, unlock rule, `look` (sky, fog, ground, snow/rock/tree lines, light intensities, foliage and blossom colours), weather, scenery (tree species mix, rocks, landmarks placed by road fraction/side/offset) and atmosphere (mist strength/start, visibility). `Road` builds a centripetal Catmull-Rom spline resampled at 2 m with spatial-hash lookups; `Terrain` builds one height grid used by both the render mesh and physics (same triangulation) with a flat road bed and blended banks; `Course` bundles stations (start, ordered checkpoints, finish) as distances along the road. A new level is one file plus a registry line.

## Scoring and passenger comfort

- **Time medal**: gold/silver/bronze at the level's thresholds × the vehicle's pace for that level.
- **Comfort** (missions with `comfort: true`): `ComfortMeter`, 0-100. Fixed-step lateral and longitudinal acceleration and body roll are low-pass filtered (τ = 0.25 s, so bumps and tiny corrections vanish). Free limits: lateral 4.2 m/s², braking 4.5, launch 4.8, roll 0.05 rad. Above them, comfort drains at `10 %/s × excess^1.3` (excess is normalised by a range per factor); launches count 0.6× and roll 0.8×. When nothing is uncomfortable it recovers at 3 %/s. A collision costs `4 + 2.4 × (speed − 2)` % (max 30). Recovering the car costs 8 %.
- **Satisfaction** = time-weighted average comfort over the run. **Comfort medal** from per-level thresholds (airport: 85 / 70 / 50).
- **Final medal**: pure time missions use the time medal; comfort missions use the **lower** of the time and comfort medals, so neither flat-out nor a crawl earns gold.
- **Score 0-100** = time score (100 at the gold time, linear to 0 at the limit); on comfort missions `0.6 × time score + 0.4 × satisfaction`. Used for personal bests and the results screen, not for medals.
- Calibration is enforced by `tests/campaign.test.ts` (see DEVELOPMENT_LOG.md).

## Progression and saves

`SaveStore` keeps one versioned document (`cbhr.v2.save`): settings, per-level/per-vehicle records (best time, best score, best comfort, medal, completions), the last selection and a 30-entry run history. Unlocks are _derived_ from progress (`gameplay/progression.ts`), never stored, so they cannot drift: `UnlockRule { levelId, requirement: finish | bronze | silver | gold }` on levels and vehicles. Stage 1 data (`cbhr.v1.*`) is migrated on first load (best times become Druk Ranger records, settings carried over) and the old keys are left untouched. Corrupt, partial or unknown-version data falls back field by field to defaults; storage that throws keeps working in memory.

## Rendering and performance

Flat-shaded, vertex-coloured low poly; static things are merged (`GeoBuilder`) and repeated things are `InstancedMesh` (pines, cypresses, broadleaf trees, shrubs, rocks, houses, chortens, yaks, landmark buildings). Effects are three single-draw-call systems: pooled soft particles (dust, tyre smoke, impact bursts), a ring buffer of skid-mark quads, and shader-animated snow (zero per-frame CPU). Quality presets (`render/quality.ts`) control pixel ratio and render scale, shadows (blob shadow on Low), a coarse terrain index (every 2nd node, ~4× fewer terrain triangles), prop density, particle density, skid marks, snow count, fog/draw distance and flag animation. `AdaptiveResolution` lowers the render scale when the smoothed frame time misses the preset's target (30 fps Low, 45 otherwise) and restores it slowly. Hot paths (physics, audio update, HUD object, effects) are allocation-free.

## Audio

`AudioEngine` builds its continuous layers once (engine: saw + square + sub through a low-pass; tyres; skid; wind) and only modulates parameters. Vehicle profiles set idle pitch, range, cutoff, "harshness" and rumble. One-shots reuse a shared noise buffer, are capped at 14, and disconnect themselves on `ended`; music drones are tracked and stopped. A fake-context test proves node counts return to baseline. Context is created and resumed only from a user gesture.

## PWA

`manifest.webmanifest` + icons; the build emits `sw.js` with a precache list and a build id hashed from the output. Navigations are network-first (updates arrive immediately online) with the cached shell offline; hashed assets are cache-first; old caches are deleted on activate; the page offers a "Reload" toast when a new version installs. Offline operation is verified by `e2e/pwa.spec.ts`.

## Planned extensibility

More vehicles (taxi, bus, performance car) and missions through data; passenger/vehicle-condition systems build on `MotionSampler` and `consumeImpact`; traffic and rivals follow `Road` and reuse `AutoDriver`; ghost replay records the command stream (physics is deterministic given inputs); leaderboards replace the `SaveStore.recordCompletion` sink.
