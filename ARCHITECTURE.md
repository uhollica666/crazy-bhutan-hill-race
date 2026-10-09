# Architecture

## Technology decisions

| Choice                                      | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TypeScript + Vite**                       | Fast dev loop, tiny config, tree-shaken output. Vite 8 / TS 6 / Vitest 5 / Three 0.186 install together without peer conflicts.                                                                                                                                                                                                                                                                                                                       |
| **Three.js** (named imports only)           | The most direct way to a lightweight WebGL game; ~171 KB gzip JS total.                                                                                                                                                                                                                                                                                                                                                                               |
| **Custom arcade physics instead of Rapier** | Evaluated Rapier's raycast vehicle. Rejected for Stage 1: the ground is an analytic height-field, so a custom raycast-suspension body is simpler, needs no ~1.5 MB WASM, runs headless in Vitest (the bot test drives the whole level in milliseconds), and gives direct control of arcade tuning. Trade-off: no general rigid-body world (no props to knock over, no multi-body). If Stage 3+ needs that, `PhysicsWorld` is the seam to swap behind. |
| **Plain DOM/CSS UI**                        | HUD and menus are simple; a framework would add weight with no benefit.                                                                                                                                                                                                                                                                                                                                                                               |
| **Synthesised Web Audio**                   | Zero audio downloads, zero licensing risk, loops never repeat audibly.                                                                                                                                                                                                                                                                                                                                                                                |
| **Hand-written service worker**             | ~60 lines; build plugin injects precache list and a content-hash version. No plugin dependency.                                                                                                                                                                                                                                                                                                                                                       |
| **State management**                        | A 25-line typed `Emitter` plus a `GameFlow` state machine is enough.                                                                                                                                                                                                                                                                                                                                                                                  |

## Module map (`src/`)

```
app/       Game.ts (composition root + loop), GameFlow.ts (menu/playing/paused/finished)
core/      math, seeded noise/PRNG, typed emitter
data/      types.ts, vehicles/ (VehicleDef), levels/ (LevelDef)  <- all tuning lives here
world/     Road (spline + spatial hash), Terrain (height grid), Course (stations + PhysicsWorld)
physics/   VehicleBody (rigid body + raycast suspension + tyres), types
gameplay/  RaceSession (countdown, timer, ordered checkpoints, finish, timeout, medals)
input/     InputManager (keyboard + gamepad + touch merge), keyboardMap (pure)
render/    GameRenderer, World3D, WorldMesh, Scenery, Gates, Environment, VehicleModel, CameraRig, geo, palette, quality
audio/     AudioEngine
ui/        UI (all DOM screens), TouchControls, MiniMap, icons/logo, styles.css
storage/   SaveStore (versioned localStorage, never throws)
pwa/       register.ts, sw.template.js
dev/       AutoDriver (pure-pursuit bot for tests and ?autodrive)
```

Boundaries: `physics`, `gameplay`, `world`, `data` import nothing from `render`/`ui`/`audio`/DOM, so they run in plain Node tests. Only `app/Game.ts` knows about everything.

## Lifecycle

`requestAnimationFrame` → `dt` (clamped to 0.1 s) → accumulate → N fixed steps of **1/120 s**:
`VehicleBody.step(input)` → `Road.project` → `RaceSession.update(s, lateral)` (the timer advances by fixed steps, so it is exact and frame-rate independent) → render with `alpha = acc/step` interpolating the chassis pose; the chase camera and wheel visuals update per frame. Paused = no steps. Max 10 steps per frame (spiral-of-death guard).

## Vehicle model

Per wheel: ground height/normal sampled from the height grid under the mount → spring/damper (bump stop, anti-roll bars) → friction-ellipse tyre force (lateral grip saturates at `slipSpeed`; drive/brake share the ellipse so power-on understeer/oversteer emerges) applied slightly above the ground to tame roll. Chassis box corners collide with ground and parapets via impulses (restitution + Coulomb friction), producing believable scrapes and flips; overturned >3 s or fallen out of the world triggers auto-recovery. Arcade aids: speed-sensitive steering, downforce, self-righting torque, auto-hold on slopes, higher gravity (16 m/s²). All numbers are in `VehicleDef`; adding a Coaster bus is a new data file (axle list supports >2 axles) plus a visual builder.

## Levels and roads

A `LevelDef` is data: road control points `(x, z, dy?)`, width, checkpoints (fractions of the playable stretch), time limit, medals, unlock rule, terrain parameters, landmark list (house/chorten/flag span/yak/…, placed by road fraction + side + offset), atmosphere. `Road` builds a centripetal Catmull-Rom spline, resamples at 2 m, derives elevation from the natural terrain (smoothed to cap grade) and offers `project`/`at`/`barrier`. `Terrain` builds one height grid used by **both** the render mesh and physics (same triangulation), carving a flat road bed with blended cut/fill banks. `Course` bundles them with start/finish/checkpoint distances. A new level = a new `LevelDef` file registered in `data/levels/index.ts`; no engine change. AI paths, surface types and spawn points will hang off `Road` (AutoDriver already follows it).

## Rendering and performance

Flat-shaded, vertex-coloured low poly; everything static is merged (`GeoBuilder`) and repeated things are `InstancedMesh` (pines, cypresses, rocks, houses, chortens, yaks). The scene is ~25–40 draw calls. Quality profiles (`render/quality.ts`) cap pixel ratio, toggle shadows (a blob shadow replaces them on Low), scale prop density, fog/draw distance and flag animation; first-run default is detected (coarse pointer ⇒ Low/Medium). Allocation-free physics/audio hot paths. Dev overlay shows fps, physics ms, draw calls, triangles, geometries, textures, heap.

## Assets

No external binary assets are used in Stage 1: models are procedural, textures are canvas-generated, audio is synthesised, logo/icons are original SVG. See `ASSET_CREDITS.md`.

## PWA

`manifest.webmanifest` + icons; the build emits `sw.js` with a precache list and a build id hashed from the output. Navigations are network-first (updates arrive immediately online) with the cached shell offline; hashed assets are cache-first; old caches are deleted on activate; the page offers a "Reload" toast when a new version installs (never auto-reloads mid-race).

## Planned extensibility

Vehicle roster/selection (data + `VehicleModel` variants) · multiple levels with `unlock` rules · passenger comfort and vehicle condition (consume `VehicleBody.consumeImpact()`/accelerations) · traffic and rival drivers (follow `Road`, reuse `AutoDriver`) · ghost replay (record the 120 Hz command stream — physics is deterministic given inputs) · leaderboards (replace `SaveStore.recordCompletion` sink).
