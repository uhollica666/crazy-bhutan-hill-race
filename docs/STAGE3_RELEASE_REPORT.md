# Stage 3 release verification — 9 October 2026

Branch: `stage-3-tourism-adventure`, based on Stage 2 `c7f703b`. The release commit is the local commit containing this report; use `git log -1` for its hash. No push, deployment or merge is part of this milestone.

## Scope and status

**Implemented and tested:** five missions, four eligible vehicle definitions, mandatory stopped pickups in route order, delivery/checkpoint guards, restart/pause/recovery, fuel/damage/timed service, selectable supported drivetrain modes, surface physics, weather/headlights, seeded hazards/traffic, garage purchases/upgrades/loaners, rewards, v3 saves with v1/v2 migration, branding, local feedback/export and production offline PWA.

**Implemented but not hardware-tested:** synthesised sound as heard through speakers, physical touch/gamepad input, real mobile GPU performance, iOS/Safari/Firefox. Automated audio lifecycle checks do not establish audible quality.

**Partial/simplified:** arcade wading and circular obstacle contacts; lane-following traffic without overtaking; seeded hazards; feedback/progression adapter interfaces without cloud integration. Low simulates fewer traffic cars, which changes difficulty slightly.

**Deferred:** Firebase, accounts/cloud saves, online leaderboards, multiplayer, ghosts, achievements, more content, recorded voice/audio and sophisticated traffic AI. Human enjoyment and difficulty playtests remain necessary.

## Corrections during integration

- Updated stale mobile/PWA save fixtures and story flow for schema v3.
- Made overlay focus synchronous and protected it from delayed underlying-screen focus; fixed Escape return from feedback over Settings.
- Reset touch pointer ownership as well as pedal values, so a new touch works after blur/pause; kept simultaneous steering/gas release independent. Raised small-landscape objective prompts above touch controls.
- Restart now resets the actual race session, fuel/condition/service counters, weather seed, traffic seed/timers and effect accumulators. Disposing the game removes global listeners and touch UI.
- Required passengers board only in route order. Ended runtimes stop simulation; results no longer reverse the vehicle, change condition or continue boarding behind the panel. Finish transition grants rewards only once.
- Purchase methods validate real vehicle/upgrade prices and supported levels; rejected nonfinite money and repaired malformed numerical progress independently while retaining valid records.
- Local feedback draft IDs stay unique at the 20-entry cap. Storage failures are described as memory-only; no draft is described as remotely delivered.
- Lightning restores the selected ambient lighting; slightly stronger rain opacity improves visibility without more particles.
- Mission autopilot now visits service before later pickups, completes refuels and avoids looping at a completed pump. Normal completion evidence uses driving, with no warps.
- Airport targets include mandatory boarding/refuel time; expedition medals now distinguish brisk and careful driving.

## Gameplay measurements

`bun scripts/mission-balance.ts` steps the same runtime as the game at 120 Hz, with default traffic/hazards and unmodified vehicles. Two cornering profiles completed all **15 eligible level/vehicle pairs**; four additional clear/heavy-rain expedition combinations are covered in unit tests. Every careful default-condition run earned a medal, arrived with fuel/health remaining and used no recovery. These are reproducible calibration profiles, not human playtest results.

| Mission / representative vehicle | Brisk time / medal | Careful time / medal | Careful fuel / health |
| -------------------------------- | ------------------ | -------------------- | --------------------- |
| Pass Run / Dzo Hatch             | 74.78 s / gold     | 86.18 s / silver     | 37% / 100%            |
| Thimphu / Dzo Hatch              | 108.44 s / gold    | 120.28 s / gold      | 66% / 100%            |
| Airport / Tourist Coaster        | 108.28 s / gold    | 119.82 s / silver    | 37% / 100%            |
| Chelela / Druk Ranger            | 121.04 s / silver  | 139.47 s / bronze    | 34% / 96%             |
| Expedition / Druk Ranger         | 88.29 s / gold     | 100.67 s / silver    | 11% / 84%             |
| Expedition / Dragon Cruiser      | 82.06 s / gold     | 94.07 s / silver     | 32% / 94%             |

Airport base deadline is 150 s and gold/silver/bronze targets are 100/115/135 s, scaled by vehicle pace. Expedition deadline is 180 s and targets are 95/120/155 s (previously 230 s and 150/180/215 s). The deadline leaves recovery room; the tighter medals reward skill. Druk Ranger's expedition fuel margin is deliberately tighter than the Cruiser's; full refuelling matters.

More engine power does not guarantee a comfortable medal: brisk Cruiser Thimphu finished in 94.98 s with 45.7% comfort and no medal; careful driving took 102.78 s with 90.7% comfort and gold. Careful Coaster Thimphu and Ranger Airport runs suffered seeded traffic damage but still completed with medals; the routes do not require a collision-free bot.

Fresh-profile testing completes the unlock chain even after spending/removing all available credits between missions. Eligible loaners permit mountain missions without buying a 4x4 and do not grant ownership. Replays earn ordinary rewards; first-completion bonuses do not repeat. Failure pays only small consolation and does not unlock a mission. Services cost race time rather than credits, and empty fuel allows documented limp driving.

## Physical and environmental checks

Controlled same-vehicle tests verify correct powered axles on dry/muddy roads, a measurable 4x4 advantage on a 25% muddy climb, lower mud speed, longer wet braking and actual upgrade acceleration. Dry-road 4x4 advantage is small, consistent with equal engine power. The ordinary Hatch cannot acquire unsupported 4x4. The ford returns a water surface and nonzero road-bed depth; depth/drag/condition and wheel splashes are arcade approximations, not fluid simulation.

Weather transition tests cover step-rate independence, drying and seeded thunder. Night ambient light restores after flashes. Rockfall warns before landing, leaves a passing corridor and clears collision resources on reset. Traffic remains within its budget, starts away from the player, brakes for a nearby leader and resets reproducibly. Existing effect tests check bounded pools, ageing, thinning, skid discontinuities and reset; audio tests check bounded one-shots and node cleanup. Long-duration real-GPU leak profiling remains outstanding.

## Feedback and offline use

Feedback remains optional from menu, Settings, About and results. Rating validation, optional fields, device consent, local persistence/storage failure, unique bounded drafts, readable text and JSON export are tested. The default transport returns `not-sent`; no Firebase, endpoint, analytics transmission or automatic email delivery is connected.

The production worker precaches the shell, hashed JS/CSS, icons and derived brand images. Vehicles, levels and audio are generated in code. Browser tests cover install/cache contents, offline reload and menu/About/feedback, offline Airport driving, cold offline navigation after installation and worker update/cache replacement followed by offline gameplay. A first-ever visit without any installed cache needs network access.

## Validation and performance

Typecheck, lint, **203/203 unit tests (13 files)**, production build and **39/39 browser tests** passed (27 desktop gameplay/campaign, 4 PWA, 8 mobile), with no skips. All five missions completed through the UI. Command results, hardware and the 15-scene performance table are recorded in the Stage 3 entry of [DEVELOPMENT_LOG.md](../DEVELOPMENT_LOG.md).

The 1280×720 Chrome 154/SwiftShader audit measured 11–24 MB JS heap, 3.17–5.48 ms average callbacks (worst 21.8 ms), 923.5 KiB decoded main-page assets and a 1.09 MB production output. Low reduced triangles by 38–58% versus High. Observed software FPS was 5.7–17.0; these results do not predict real GPU or phone FPS. See the log for every scene/preset and the exact gzip sizes.

Browser screenshots are generated under ignored `screenshots/`. Desktop includes branding, garage, weather, service/hazards and results; mobile covers 640×360, 915×412 and Pixel 7 landscape plus portrait selection/garage. Emulation verifies layout and scripted pointer events, not real touch hardware. Manual browser driving checks are described in the development log separately from autopilot evidence.

## Next milestone and Git exclusions

Prioritise physical-device profiling, fresh-player human playtests and clearer service/drivetrain onboarding where those tests show confusion; only then connect validated consent-aware cloud adapters or add content.

The intentional root deletions `novarah-horizontal-dark@2x.png`, `novarah-horizontal-light@2x.png`, `novarah-symbol@2x.png` are excluded from the release commit and remain deleted in the working tree. Unused `cbhr-logo.png` is also excluded. Authoritative `novarah-logo.png` is preserved; `public/brand/` derivatives and their build helper belong to Stage 3. Build/test outputs and scratch/performance logs remain ignored.
