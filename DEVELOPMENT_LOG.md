# Development log

## Stage 1

**Environment:** Windows 11, Node 24.18, npm 11, Git 2.54, Chrome 154 (used by Playwright via `channel: 'chrome'`, no browser download).

**Decisions**

- Custom raycast-suspension vehicle over Rapier (see ARCHITECTURE.md). Fixed 120 Hz step with interpolation.
- One shared height grid for render + physics, with identical triangulation, so the car never disagrees with the visible ground. Road surface is conformed to the grid (+7 cm lift, polygon offset).
- Everything procedural (no external assets) to avoid licence risk and keep the download small (~0.8 MB `dist`, 171 KB gzip JS).
- Art direction: "thangka morning": saturated pigment palette, flat-shaded low poly, hazy layered ridges, limewashed farmhouses with deep roofs, chortens, five-colour prayer flags, yaks; UI is parchment, madder red, saffron and gold.
- Respectful cultural content: chortens/flags/houses sit behind the parapet, are non-collidable and non-destructible.

**Problems and fixes**

- Autopilot initially stalled at the start: steering sign inverted in the bot, and start-line road sat on the steep valley wall (grade 35%). Fixed the sign; moved the valley south; smoothed road elevation more (max grade now ~26%).
- Top speed plateaued at ~80% of nominal because of rolling resistance and a too-gentle power curve; reduced resistance and steepened the curve (test asserts ≥85% of top speed).
- Start/finish sign lettering was mirrored from the driver's side; now one front-facing board per direction.
- Ridge mountains rendered as dark silhouettes under Lambert lighting; made them unlit with baked faceting. Raised hemisphere/sun intensities (three's physical light units).
- Playwright multi-touch test found a real bug: lifting the steering finger reset the held gas pedal. Fixed (steer release only clears steering). Also guarded `setPointerCapture`.
- The built-in preview browser throttles `requestAnimationFrame` when idle, which stalled the loading sequence; loading now yields with a timer fallback.
- Bash heredocs containing certain quotes failed in the tool; files were written with the editor instead (no effect on the project).

**Verification (all run in this session)**

- `npm run typecheck`, `npm run lint`: clean.
- `npm test`: 24 Vitest tests pass: vehicle on flat ground (settle, accelerate to top speed, brake→reverse, steer, slope hold, 60 vs 120 Hz stability), level geometry, **bot drives the whole route (≈58 s, no flip/stuck/off-road)**, race session rules, flow transitions, input mapping, save/load incl. corrupt storage.
- `npm run build`: succeeds. `dist` ≈ 812 KB (JS 645 KB / 171 KB gzip, CSS 14 KB, icons ≈ 140 KB).
- Playwright: desktop Chrome 1280x720, 5 tests pass (boot + settings persistence, keyboard drive/pause/resume/recover, no page scroll + restart, ordered checkpoints + finish + saved best + replay + menu, **autopilot completes the full route in the browser**); Pixel 7 landscape emulation, 2 tests pass (multi-touch steer+gas, layout/no-overlap, no scroll). Zero console/page errors in those runs. Screenshots in `screenshots/` (git-ignored) were inspected for layout, missing meshes and HUD overlap. Software GL only (~12-15 fps), so no performance conclusions.
- Not verified: real devices, real audio output, gamepad, iOS, service-worker offline behaviour in a browser (the SW is generated and built, but offline reload was not exercised).

## Stage 2

Branch `stage-2-driving-and-progression`, started from `4bddb5e` (Stage 1 `f5674a9` plus the npm to Bun switch). Baseline checks (typecheck, lint, 24 tests, build) were green before any change.

**Decisions**

- Kept the custom arcade physics. Two very different vehicles came from definitions only; new physics features are per-vehicle data (`contactLift`, `maxLateralAccel`, `yawAssist`, `engineBraking`).
- Passenger comfort is computed from fixed-step horizontal acceleration and body lean (`MotionSampler`), so it is frame-rate independent and shared by the game and the tests.
- Medal = lower of time and comfort medal on comfort missions; time medals scale per vehicle (`pace`, with a per-level override because the coach is nearly as quick as the 4x4 on the wide airport road).
- Unlocks are derived from progress, never stored. Save v2 migrates Stage 1 keys and leaves them untouched.
- Garage previews use the real vehicle at the real start line (no thumbnails); ratings are computed from physics numbers.
- Dev server binds localhost only; `dev:lan` / `preview:lan` opt in to the network.

**Problems found by the tests and fixed**

- Autopilot comfort tests showed the coach could not climb a 28 % grade from rest (21 kN wasn't enough at first) and **rolled over under full-lock slaloms** once its body roll was increased. Added the `maxLateralAccel` steering guard (understeer instead of tipping) and raised engine force.
- The first coach roll measurements were only 1.5x the 4x4's, because tyre forces acted near the centre of mass; `contactLift` is now per vehicle (coach 0.28 vs 4x4 0.6) and the coach leans about 2.5x as much.
- The multi-touch bug from Stage 1 stayed fixed; blur / visibility / pointercancel now release every control (tested).
- **The Stage 1 service worker was never functional.** The offline test, written in Stage 2, found three separate bugs: (1) the template placeholders were substituted into the header _comment_ instead of the code, so `sw.js` shipped with `__PRECACHE__` and could not run; (2) registration waited for the window `load` event, which had already fired because the game boots asynchronously, so no worker ever registered; (3) `cache.match` ignored nothing: module scripts are fetched with an `Origin` header and the precache with none, so `Vary` made every asset a cache miss. Also `index.html` was missing from the precache. All fixed; the build now throws if placeholders survive.
- A stray `playwright test` from an earlier run kept running in the background and doubled test times; the Playwright config no longer reuses an existing server, so tests always run against a fresh build.
- Housekeeping slip: while clearing stray processes I stopped all `chrome.exe` processes, which can include your own Chrome windows.

**Calibration (autopilot profiles, `tests/campaign.test.ts`)**

| Mission / vehicle   | flat-out                        | brisk       | steady         | careful        |
| ------------------- | ------------------------------- | ----------- | -------------- | -------------- |
| Pass Run, 4x4       | 57.5 s gold                     | -           | 73.5 s silver  | 82.1 s silver  |
| Airport Dash, 4x4   | 71.0 s, comfort 29 % (no medal) | ~83 s, gold | 90.9 s silver  | 102.6 s bronze |
| Airport Dash, coach | 84.4 s, comfort 76 % (silver)   | ~91 s, gold | 97.5 s silver  | 108 s silver   |
| Chelela, 4x4        | 92.7 s gold                     | -           | 118.4 s silver | 132.7 s bronze |

All 4 styles finish every eligible combination with no flips, no sticking, no wall impact; ordinary (steady) driving always earns at least silver, gold is always reachable, and flat-out Airport driving loses to tidy driving. This proves the numbers are coherent, not that the game is fun.

**Measured performance (scripts/perf.mjs, desktop Chrome, SwiftShader software GL, 1280x720)**

JS time is the callback time of every animation frame (including issuing GL commands); fps on SwiftShader is meaningless and is shown only to prove the scenes run.

| Level        | Quality | draw calls | triangles | geometries | JS ms/frame | pixel ratio |
| ------------ | ------- | ---------- | --------- | ---------- | ----------- | ----------- |
| Pass Run     | low     | 28         | 66k       | 28         | 2.0         | 0.8         |
| Pass Run     | medium  | 41         | 122k      | 28         | 2.5         | 1.0         |
| Pass Run     | high    | 41         | 139k      | 28         | 2.7         | 1.0         |
| Airport Dash | low     | 39         | 73k       | 34         | 2.6         | 0.8         |
| Airport Dash | medium  | 42         | 146k      | 34         | 3.2         | 1.0         |
| Airport Dash | high    | 42         | 159k      | 34         | 3.6         | 1.0         |
| Chelela      | low     | 29         | 74k       | 32         | 2.6         | 0.8         |
| Chelela      | medium  | 40         | 133k      | 32         | 3.7         | 1.0         |
| Chelela      | high    | 42         | 155k      | 32         | 4.7         | 1.0         |

Stage 1 comparison: its own overlay showed about 121k-139k triangles and 27-41 draw calls on Pass Run (read from screenshots; the Stage 1 build was not re-run side by side, a worktree rebuild attempt failed on Windows junctions). Pass Run is therefore unchanged in cost; Low now removes roughly half the triangles (coarse terrain, 40 % props), skips shadows, particles thinning and skid marks, and renders at 0.8x pixel density. Production bundle: JS 704 KB (188.6 KB gzip), CSS 21 KB (5.6 KB gzip), `dist` about 0.85 MB.

**Verification (all run in this session)**

- `bun run typecheck`, `bun run lint`: clean.
- `bun run test`: 90+ Vitest tests: vehicle handling differences and rollover/yaw safety, every level x vehicle drive-through, comfort model (incl. 30/60/120/240 Hz equivalence), scoring and medal rules, progression and unlock chains, save v2 persistence / Stage 1 migration / corruption, audio node-leak checks with a fake context, adaptive resolution, quality presets, effects.
- Playwright desktop: boot and settings persistence; fresh-save locks and garage; keyboard menu navigation; Stage 1 save migration; keyboard driving with pause/resume/recover; restart and change-vehicle-from-pause; Pass Run finish with unlock banners, save and reload persistence; next-mission flow with comfort HUD; **full autopilot completions of Pass Run, Airport Dash (coach) and Chelela through the real UI at Low quality**; offline PWA (service worker installs, precache contents, network off, reload and cold visit, a level launches and plays).
- Playwright mobile (Pixel 7 landscape EMULATION, plus a portrait viewport): multi-touch steer and gas, no stuck controls on blur / pointercancel, tap-through to a mission and vehicle, touch targets at least 44 px, launch button pinned in view, no horizontal overflow, page does not scroll or zoom.
- Not verified: real phones, real audio output, gamepad, iOS, visual quality on real GPUs.

## Stage 3 — 9 October 2026

Resumed the existing uncommitted `stage-3-tourism-adventure` implementation from `c7f703b`, preserving its creative direction and vanilla TypeScript/Vite/Three.js architecture. The supplied handoff reported 128 unit tests; independent verification and integration coverage now have **203 passing tests in 13 files**. Typecheck and lint are clean. The release commit is the local commit containing this entry (`git log -1`); no push, deployment or merge was performed.

**Implemented and verified**

Five tourism missions and four vehicles, stories, ordered mandatory stopped pickups/delivery, fuel/condition/services, surfaces/4x4/ford, weather/headlights, bounded traffic and seeded hazards, upgrades/ownership/loaners, rewards, v3 save migrations, Novarah branding and optional local feedback/export. The full findings and status distinctions are in [docs/STAGE3_RELEASE_REPORT.md](docs/STAGE3_RELEASE_REPORT.md).

Important integration fixes: stale v3 browser fixtures, dialog focus/Escape routing, touch pointer reset after blur/pause, small-landscape objective overlap, complete mission restart state, repeatable weather/traffic seeds, particle emitter reset, lightning ambient restoration, ordered boarding, frozen ended simulation, single finish/reward transition, canonical purchase prices and finite numerical saves, bounded unique feedback drafts and honest memory-only fallback. The mission driver now performs complete refuels without ignoring services before later pickups or looping at the same pump.

**Gameplay calibration**

`bun scripts/mission-balance.ts` measured 36 seeded full-runtime runs: all 15 eligible combinations at brisk/careful cornering profiles plus both expedition vehicles in all three conditions. Tests enforce the 30 default-condition runs and four additional expedition-condition cases. All careful combinations finish with medals, fuel and no recovery. Fresh-profile campaign testing spends every reward before the next mission and still completes all five using eligible loaners; borrowing never grants ownership.

Representative brisk/careful times: Hatch Pass 74.78/86.18 s, Hatch Thimphu 108.44/120.28 s, Coaster Airport 108.28/119.82 s, Ranger Chelela 121.04/139.47 s, Ranger expedition 88.29/100.67 s, Cruiser expedition 82.06/94.07 s. Airport deadline/medals now include boarding and refuel time (150 s; 100/115/135 s base medal targets). Expedition medals are tighter (95/120/155 s; 180 s limit); careful Ranger arrives with about 11% fuel/84% condition, Cruiser with 32%/94%. More power can hurt comfort: brisk Cruiser Thimphu earns no medal at 45.7% comfort, careful earns gold at 90.7%.

Controlled physics tests compare the same Ranger on dry/muddy flat roads and a 25% muddy climb, wet braking and actual upgraded acceleration. Supported 4x4 improves traction without increasing total engine power; Hatch cannot switch to unsupported 4x4. Water is a real depth/surface zone with simplified drag/power effects, not a fluid simulation. A supplementary status check at 0.42 m depth leaves Ranger power at 1.0 but reduces Hatch power to 0.18, consistent with their wading limits. Recovery was also exercised from an off-world position on all five levels: each returned before its pending pickup with fuel/condition retained. Existing effect/audio tests verify bounded pools, reset and node cleanup.

**Browser validation**

A desktop pass completed **27 tests**. The final `bun run test:e2e` production-build run passed **39/39 tests in 19.8 minutes**: 27 desktop gameplay/navigation/campaign, 4 production PWA and 8 mobile. All five no-warp UI mission completions include stable end-state/reward checks. Typecheck/lint/203 unit tests and a separate final `bun run build` passed; no failures were skipped. Browser tests use installed Chrome with SwiftShader and one worker; no failures are skipped.

Mobile covers Pixel 7 landscape, 640×360, 915×412 and portrait selection/garage: splash, menu/About, story, feedback, vehicle/level selection, simultaneous steering/gas release, cancellation/blur followed by a fresh pointer, pause/restart/time, HUD/control bounds, real-driven results/rewards and JSON export. Production PWA checks install/asset precache, offline reload with brand decoding and Airport driving, cold offline navigation after installation and worker-update cache replacement followed by offline gameplay.

Manual Codex in-app browser checks used an isolated `127.0.0.1:4273` preview: fresh profile, mission selection/garage/story, held W and W+A/S driving, both tourists boarding, pause/resume, recovery and restart to 0/2 passengers/full fuel/condition. This used actual inputs rather than autopilot/warps. Separate Node/Playwright visual diagnostics inspected Thimphu at night and the expedition ford in heavy-rain dusk: headlights, rain, water zone and 4x4 were visible, with no page/console errors. The ford diagnostic warped to the crossing and kept the mandatory camp pickup unfinished; it is not completion evidence. It does not replace human handling/fun playtests. Desktop and phone screenshots were inspected; final 640×360 and 915×412 HUD screenshots show prompts clear of steering/pedals; story/results panels scroll to their actions.

**Performance evidence**

Windows 11 Pro Insider Preview 10.0.26340, AMD Ryzen 7 7445HS (12 logical processors), about 31.3 GiB visible RAM; Node 24.18.0, Bun 1.3.14. Installed Chrome 154.0.8037.99 and all 15 isolated equivalent-scene measurements are recorded below. Software rendering is not representative of a physical mobile GPU.

Production output: **1,089,416 bytes** across 13 files. JavaScript **844,644 bytes / 231,156 gzip** (gzip measured from emitted files with Node zlib default settings), CSS **31,603 / 7,759 gzip**; derived branding **69,386 bytes**. Historical Stage 2 JS was about 188.6 KB gzip; this is a bundle-growth comparison, not a side-by-side GPU benchmark. Vehicles, levels, sound and most art require no external downloads.

Performance sampling disables adaptive resolution and keeps the vehicle at the grid, fresh Chrome per level/preset, 2.5 s warmup and 6 s measurement at 1280×720. The script reports renderer resources, FPS, callback averages/worst frame, JS heap and loaded JS/CSS/images; callback time includes issuing GL commands and is not a separate GPU frame-time measurement. Browser tests and performance sampling run separately to avoid contention.

**Final isolated measurements — Chrome 154.0.8037.99, SwiftShader**

| Mission           | Preset | Draw calls | Triangles | Geometries / textures | Heap MB | JS avg / worst ms | Observed software FPS |
| ----------------- | ------ | ---------- | --------- | --------------------- | ------- | ----------------- | --------------------- |
| pass-run          | low    | 42         | 66932     | 32 / 9                | 16      | 3.17 / 9.5        | 14                    |
| pass-run          | medium | 47         | 122802    | 32 / 10               | 11      | 4.91 / 20.7       | 6.2                   |
| pass-run          | high   | 47         | 139736    | 32 / 10               | 15      | 3.4 / 5.8         | 6.2                   |
| thimphu-pickup    | low    | 58         | 78610     | 45 / 10               | 20      | 3.46 / 8          | 14.6                  |
| thimphu-pickup    | medium | 63         | 124516    | 45 / 11               | 20      | 5.01 / 14.4       | 6                     |
| thimphu-pickup    | high   | 63         | 127040    | 45 / 11               | 16      | 4.57 / 8.4        | 5.7                   |
| airport-dash      | low    | 57         | 76364     | 45 / 10               | 24      | 3.81 / 21.8       | 14.3                  |
| airport-dash      | medium | 62         | 149722    | 45 / 11               | 24      | 5.48 / 13.3       | 6.6                   |
| airport-dash      | high   | 62         | 163256    | 45 / 11               | 18      | 4.9 / 14.5        | 6                     |
| chelela-climb     | low    | 56         | 75810     | 42 / 13               | 21      | 3.25 / 6.4        | 17                    |
| chelela-climb     | medium | 61         | 134348    | 42 / 14               | 17      | 4.3 / 8.8         | 7.3                   |
| chelela-climb     | high   | 61         | 155884    | 42 / 14               | 17      | 3.8 / 6.7         | 7.1                   |
| remote-expedition | low    | 60         | 79150     | 46 / 12               | 22      | 3.32 / 9.2        | 16.8                  |
| remote-expedition | medium | 65         | 166622    | 46 / 13               | 18      | 5.47 / 14.5       | 6.2                   |
| remote-expedition | high   | 65         | 187126    | 46 / 13               | 19      | 3.85 / 5.4        | 6.2                   |

Each quality used the same recommended vehicle at the same grid: Hatch for Pass/Thimphu, Coaster for Airport, Ranger for Chelela/expedition. Main-page decoded JS/CSS/images totalled 923.5 KiB (about 945.6 KB) in every sample, excluding the worker precache and generated GPU resources. Low used pixel ratio 0.8, Medium/High 1.0. Low reduced triangles by 38–58% and draw calls by 5 against High in these views. Heap samples were 11–24 MB; JS callback averages 3.17–5.48 ms, worst 5.4–21.8 ms. FPS is the wall-clock animation-callback rate (5.7–17.0), not the game's clamped-dt estimate; do not infer phone FPS. Timing differences between Medium/High are noisy short samples, not evidence that High is faster. Stage 2 had lower draw calls before tourism signs/characters/traffic; its historical callback measurements were not rerun side by side. No GPU timing or long-duration leak claim is made.

**Limitations and next stage**

Physical Android/iOS/Safari/Firefox/gamepads, audible output, real GPUs, long-duration leak stress and varied-seed human gameplay remain unverified. Traffic/obstacle/wading physics are deliberately simplified; Low reduces traffic and changes difficulty. No feedback backend/Firebase/cloud save exists; feedback is local/export only and progression adapter wiring is deferred. Next: device profiling and human difficulty/onboarding playtests, then optional consent-aware cloud integration. No Stage 4 implementation was added.

The root deletions `novarah-horizontal-dark@2x.png`, `novarah-horizontal-light@2x.png`, `novarah-symbol@2x.png` and unused untracked `cbhr-logo.png` remain outside this commit. The authoritative logo and derived brand assets are preserved. Build outputs, screenshots, traces and scratch/performance logs remain ignored.
