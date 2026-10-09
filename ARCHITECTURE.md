# Architecture

## Technology decisions

| Choice                                | Why                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TypeScript + Vite + Bun**           | Fast loop, tiny config, tree-shaken output. Bun runs installs and scripts; Vite/Vitest/Playwright run on Node underneath.                                                                                                                                                                                              |
| **Three.js** (named imports only)     | Most direct route to a lightweight WebGL game; See the measured Stage 3 bundle in DEVELOPMENT_LOG.md.                                                                                                                                                                                                                  |
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
           assets (glTF library), envKit, mountains, MissionView + Rain,
           CameraRig, effects (Snow, Particles, SkidMarks, VehicleEffects), adaptive, quality, geo, palette
audio/     AudioEngine
ui/        UI (all DOM screens), TouchControls, MiniMap, icons/logo, styles.css + stage2.css
storage/   SaveStore (v3 + v1/v2 migration)
pwa/       register.ts, sw.template.js
dev/       AutoDriver (pure-pursuit bot, tests and ?autodrive)
```

Boundaries: `physics`, `gameplay`, `world`, `data` import nothing from `render`/`ui`/`audio`/DOM, so all rules and the whole campaign are tested in plain Node. Only `app/Game.ts` knows about everything.

## Lifecycle

`requestAnimationFrame` → `dt` (clamped to 0.1 s) → accumulate → N fixed steps of **1/120 s**:
`VehicleBody.step(input)` → `Road.project` → `RaceSession.update(s, lateral)` → `MotionSampler` (horizontal acceleration and body lean) → `RaceSession.feedMotion` (comfort) → render with `alpha = acc/step` interpolating the chassis. Camera, wheel visuals, effects and audio run per frame. Timer and comfort advance in fixed steps, so both are exact and frame-rate independent. Paused and ended missions = no steps. Max 10 steps per frame.

Menu flow (all inside `flow = menu`): main menu → **mission select** → (loads the level's world if different) → **garage** (live 3D preview of each vehicle at the start line, stats, targets, lock reasons) → first-launch skippable story briefing → run. From pause/results you can restart, change vehicle, jump to the next mission or return to the menu. Level worlds are built on demand and disposed when switching (`World3D.dispose` removes meshes, lights, sky, ridges, fog).

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

`SaveStore` keeps `cbhr.v3.save`: settings, per-level/per-vehicle records, selection, a 30-entry history, wallet, owned vehicles, purchased upgrades, seen stories and mission statistics. Unlock rules are derived from progress. Stage 1 (`cbhr.v1.*`) and Stage 2 (`cbhr.v2.save`) migrate without deleting old keys. The old Ranger and previously unlocked Coaster remain owned; migration adds the Hatch and 150 credits per completed mission. Defensive parsing repairs fields independently; unknown progression IDs are retained for compatibility but never become selectable campaign definitions. Unknown saved selections resolve to valid registered choices. Blocked storage keeps progress in memory. Purchase methods validate registered prices, supported upgrades and maximum levels before charging.

## Rendering and performance

Flat-shaded, vertex-coloured low poly; static things are merged (`GeoBuilder`) and repeated things are `InstancedMesh` (pines, cypresses, broadleaf trees, shrubs, rocks, houses, chortens, yaks, landmark buildings). Effects are three single-draw-call systems: pooled soft particles (dust, tyre smoke, impact bursts), a ring buffer of skid-mark quads, and shader-animated snow (zero per-frame CPU). Quality presets (`render/quality.ts`) control pixel ratio and render scale, shadows (blob shadow on Low), a coarse terrain index (every 2nd node, ~4× fewer terrain triangles), prop density, particle density, skid marks, snow count, fog/draw distance and flag animation. `AdaptiveResolution` lowers the render scale when the smoothed frame time misses the preset's target (30 fps Low, 45 otherwise) and restores it slowly. Physics scratch vectors, the HUD object and effect buffers are reused; some gameplay queries still allocate small temporary arrays.

## Audio

`AudioEngine` builds its continuous layers once (engine: saw + square + sub through a low-pass; tyres; skid; wind) and only modulates parameters. Vehicle profiles set idle pitch, range, cutoff, "harshness" and rumble. One-shots reuse a shared noise buffer, are capped at 14, and disconnect themselves on `ended`; music drones are tracked and stopped. A fake-context test proves node counts return to baseline. Context is created and resumed only from a user gesture.

## PWA

`manifest.webmanifest` + icons; the build emits `sw.js` with a precache list and a build id hashed from the output. Navigations are network-first (updates arrive immediately online) with the cached shell offline; hashed assets are cache-first; old caches are deleted on activate; the page offers a "Reload" toast when a new version installs. Offline operation is verified by `e2e/pwa.spec.ts`.

## Stage 3 integration

`MissionRuntime` owns the body, `RaceSession`, `VehicleStatus`, `StopManager`, weather, hazards, traffic and optional rival. The fixed simulation step applies weather/surface modifiers, integrates physics, accounts for impacts and fuel, updates stops, gates race progress at the first unfinished required pickup, then advances world events. Paused games do not call the step; ended runtimes reject further simulation and results freeze the chassis. `begin()` resets session, status, stops and seeded world events; the app constructs a fresh runtime on restart. `dispose()` removes course obstacles. `Game.endRun` accepts the finish transition once, records successful progress, then grants one reward per run.

`StopManager` requires speed <=1.6 m/s and a vehicle inside the zone: boarding takes 2.4 s, fuel about 9 s from empty, repair about 10 s from wrecked. Driving away cancels service. Services are free, consume race time and count only when complete. `VehicleStatus` burns distance/throttle/grade/surface-dependent fuel with fixed-step accounting. Empty tanks allow 12% power and 40% top speed so recovery remains possible; deep water also reduces power. Damage reduces power and steering stability and can cause deterministic temporary stalls.

`Course.surface()` samples the route's configured stretches, wet variants, shoulders and ford. The same surface drives tyre force limits, drag, roughness damage, particle colours and road audio. 4x4 drives every supported axle; 4x2 uses the designated axle, with the same total engine power. Water depth is measured against a flat ford surface over the road bed. This is simplified wading/drag with shader water and wheel splashes, without a fluid solver.

`WeatherState` supplies wetness, grip, visibility, wind and seeded thunder. `Environment` applies sky/fog/light presets; `VehicleModel` draws headlights, and `Rain` uses one shader-animated line draw. Flash decay restores the configured ambient intensity. `MissionView` renders passengers, service markers, rockfall, creatures, traffic and rival from the runtime; its textures/materials/geometries are disposed when replacing a mission. Particle and skid buffers are bounded, cleared on restart and thinned on Low.

`HazardSystem` seeds warning/fall/crossing sequences and circular collision obstacles, leaves passing space and resets them between runs. `TrafficSystem` has a fixed car budget, follows left-hand lanes, slows for bends/leaders/static hazards and respawns at least 140 m ahead of the player. Its seed and spawn timer reset. Traffic is simplified lane following, without overtaking or route planning. `MissionDriver` drives the real runtime, stops for pickups/services/delivery and steers around obstacles; it never teleports to demonstrate completion.

`applyUpgrades` is the single source for upgraded physics, fuel and damage definitions. Engine/braking/grip/suspension/range/durability all change real numbers; UI ratings use those same definitions. Rewards pay completion, medal, comfort, condition, optional-objective, weather and first-completion bonuses; timeout grants only 8% consolation and does not unlock progress. Replays can earn ordinary credits again; the first-completion bonus only pays once.

## Feedback and future Firebase adapters

`services/feedback.ts` validates a versioned payload (rating 1–5, optional text/contact/research answers, device block only with consent). `DraftStore` bounds local drafts to 20; JSON download and readable text export preserve the payload. The default `NoRemoteTransport` returns `not-sent`. An optional HTTPS transport seam exists but no endpoint or Firebase is connected. Only a successful HTTP response is called delivery. Storage failures retain a temporary in-memory copy and the UI says so.

`services/seams.ts` defines progress storage, identity, personal leaderboard and analytics interfaces. Current identity is anonymous, the board uses local records and analytics sends nothing off-device (debug events are bounded in memory). A future Firebase integration can implement `FeedbackTransport` behind a validated, rate-limited server endpoint and adapt `ProgressStorage` for cloud saves with explicit conflict/migration policy. `SaveStore` currently uses localStorage directly, so connecting that adapter still requires integration work. Do not embed privileged Firebase credentials or treat a local write as cloud delivery. Consent, auth, abuse protection and migration tests belong to that later work.

## Stage 4: asset pipeline, environment kit and look

**Authoring.** Models are built with Blender 5.2 scripts in `assets-src/blender/` (`cbhr_lib.py` mesh and material kit, `cbhr_vehicle.py` + `build_vehicles.py` + `vehicles_more.py` vehicles, `env_lib.py` + `build_env.py` the vertex-coloured nature/architecture kit). `scripts/vehicle-params.ts` exports the real `VehicleDef` dimensions to `assets-src/vehicle-params.json` so every model matches the physics (axle positions, track, wheel size, ride height). Blender is only needed to regenerate the sources; the game and CI never need it. `scripts/build-models.mjs` runs gltf-transform (dedup, weld, quantise, prune) and meshopt compression, writing `public/models/`. The vehicle GLBs total about 325 KB and the environment kit about 135 KB.

**Runtime.** `render/assets.ts` is an `AssetLibrary`: a URL-keyed cache around GLTFLoader with the meshopt decoder. A load never rejects: a missing or corrupt file resolves to `null`, is remembered and not retried, and the caller falls back to the procedural geometry. `instantiate()` clones a model branch with private materials, applies the livery to the materials named `paint`, `accent` and `trim`, and returns the lamp materials so brake lights and headlights can be driven. Vehicles are separated into physics (the `VehicleBody` box and ray wheels, unchanged), a visual body (one glTF node), wheel visuals (one node cloned per wheel and spun by the physics state) and decoration. `render/envKit.ts` dequantises the kit's meshes into float geometries (positions, vertex colours) that feed the existing instanced scenery with a single Lambert vertex-colour material, with several variants per species.

**Reflections.** Vehicles use MeshStandardMaterial with a small RoomEnvironment map assigned per material (not `scene.environment`, which also lights the Lambert world and ruins night). Reflection strength follows `Environment.brightness`.

**Colour pipeline.** ACES filmic tone mapping (exposure 1.05); neutral warm hemisphere fill and warm sun; fog matched to the horizon; per-level looks in `data/levels/*`; time-of-day and weather tints in `data/weather.ts` (night is near-neutral, not navy). `render/mountains.ts` builds three layers of faceted ridged-noise ranges (forest, rock, snow above a per-level line) in one unlit draw. `WorldMesh` colours terrain by altitude and slope, darkens it under the same noise that places forests, adds dry and bare patches and fine grain, and applies a tiling grain texture in world space.

**Terrain drop-offs.** `LevelDef.terrain.drop` lowers the ground away from the road (optionally one side) after the road bed is blended, which gives river-valley benches and gorge edges; `Road.farLateral` finds the side of far-field nodes by brute force at build time.

**Campaign.** `data/levels/index.ts` registers ten levels; each has a `region` (chapter). `gameplay/campaign.ts` provides chapter grouping, challenge tags, progress, next-unplayed and the "just completed the campaign" test used to show the end screen once (`stats.campaignCompleted` in the v3 save, defaulting to false on older saves). The unlock graph is a tree rooted at Pass Run (checked by tests). A player who owns only the starter hatchback can drive six missions; the others lend an eligible vehicle.

**Offline.** The service worker precaches the application shell and everything in `public/` (including the models, about 1 MB in total), so all ten levels, whose definitions are in the JavaScript bundle, work offline after the first online load. Level data is code, not downloads; there is no per-level asset fetch to wait for.

## Planned extensibility

More vehicles (taxi, bus, performance car) and missions through data; passenger/vehicle-condition systems build on `MotionSampler` and `consumeImpact`; traffic and rivals follow `Road` and reuse `AutoDriver`; ghost replay records the command stream (physics is deterministic given inputs); leaderboards replace the `SaveStore.recordCompletion` sink.
