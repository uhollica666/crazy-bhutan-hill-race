# Crazy Bhutan Hill Race

A lightweight, stylised 3D arcade driving game. You are a Bhutanese tour driver carrying guests through ten missions: valley tours, a storm descent, a cliff road, a night run through the forest, a muddy expedition and a closed-course finale. _Working title. The geography is fictional and only inspired by Bhutan's mountain roads._

Runs in desktop and mobile browsers, installs as a PWA, works offline, needs no account, ads or backend.

## Stack

TypeScript · Vite · Three.js · custom arcade vehicle physics · plain DOM/CSS UI · Web Audio (fully synthesised) · Vitest · Playwright · Bun. Novarah Interactives, a Novarah Technologies studio. Vehicles and the nature/architecture kit are original Blender models loaded as meshopt-compressed glTF (with procedural fallbacks); sound is synthesised; the only supplied artwork is the Novarah branding and the game logo. See [ARCHITECTURE.md](ARCHITECTURE.md), [docs/VISUAL_DIRECTION.md](docs/VISUAL_DIRECTION.md) and [ASSET_CREDITS.md](ASSET_CREDITS.md).

## Run it

Requires [Bun](https://bun.sh) 1.3+ (Vite and Vitest run on Node 20.19+ under the hood; developed on Node 24).

```bash
bun install
bun run dev        # http://localhost:5273 (localhost only)
```

| Command                       | What it does                                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------------------------ |
| `bun run dev`                 | Dev server with hot reload (localhost only)                                                      |
| `bun run dev:lan`             | Same, reachable from a phone on your Wi-Fi: see [docs/DEVICE_TESTING.md](docs/DEVICE_TESTING.md) |
| `bun run build`               | Type-check + production build into `dist/` (emits the service worker)                            |
| `bun run preview`             | Serve `dist/` on :4173 (`preview:lan` for phones)                                                |
| `bun run typecheck` / `lint`  | `tsc --noEmit` / ESLint                                                                          |
| `bun run format`              | Prettier                                                                                         |
| `bun run test`                | Vitest: physics, campaign autopilot runs, rules, saves, comfort, audio, effects                  |
| `bun run test:e2e`            | Playwright in your installed Chrome: builds, serves, drives the real UI                          |
| `node scripts/shots.mjs`      | Menu, selection, garage and driving screenshots for all five levels (needs a server)             |
| `node scripts/perf.mjs`       | Render workload / JS-per-frame table per level and quality preset                                |
| `node scripts/make-icons.mjs` | Regenerates favicon / PWA icons from the in-code logo                                            |
| `node scripts/build-models.mjs` | Optimises the Blender exports in `assets-src/out/` into `public/models/` (meshopt)             |
| `node scripts/stage4-shots.mjs <dir> [quality]` | Visual-regression screenshots: menu, all four vehicles, every level and condition |
| `node scripts/ui-shots.mjs <dir> [w h]` | Menu, mission map and campaign-complete screenshots at any size                         |
| `bun run emulators` / `bun run test:emulator` / `bun run test:e2e:cloud` | Firebase emulators; rules and integration tests; online-feature browser tests (docs/FIREBASE.md)                      |
| `bun scripts/survey.ts [level…]` | Full autopilot mission per vehicle in three driving styles, for calibration                 |

Debug URL flags: `?debug=1` (overlay with fps, CPU ms/frame, physics ms, draw calls, triangles, render scale; `` ` `` toggles it; exposes `window.__cbhr` for tests), `?autodrive=1` (a bot drives), `?quality=low|medium|high`, `?noadapt` (freeze adaptive resolution).

## Controls

| Input    | Action                                                                                                                                               |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keyboard | W/↑ gas · S/↓ brake, then reverse · A/D or ←/→ steer · F switch 4x2/4x4 (supported vehicles) · E service · R recover · Shift+R restart · Esc/P pause |
| Menus    | Arrow keys move between cards and buttons, Enter selects, Esc goes back                                                                              |
| Touch    | Slide the steering bar or turn the on-screen wheel (Settings), hold GAS / BRAKE with the other thumb; left-handed and large layouts; pause and recover buttons on screen |
| Gamepad  | Left stick steer · RT gas · LT brake · Start pause · Y recover · D-pad/A/B in menus                                                                  |

Settings are grouped in tabs (Audio, Graphics, Controls, Gameplay, Accessibility); the Controls tab has keyboard, touch and gamepad help. Touch controls appear on first touch (or if the primary pointer is coarse), hide when you use the keyboard, and can be forced on/off in Settings. Losing focus or a cancelled touch releases every control.

## Longer missions and dual headlights (Stage 5)

All ten missions are now roughly **twice as long** (2.1 to 3.6 km instead of 1.1 to 1.8 km), with new checkpoints, scenery, extra hazards on several missions and a second pit stop where fuel matters. Each is the original route with a new stretch spliced in (`src/data/levels/extend.ts`, `extensions.ts`), so the starts and finishes you know are unchanged. Time limits and medals were recalibrated against the autopilot (`bun scripts/medals.ts`), vehicle fuel ranges were scaled to match, and the terrain stays within a size budget. The headlights now cast **two** beams, one from each lamp.

## Connected game (Stage 5): accounts, cloud saves, leaderboards, feedback

Optional, and never required: the game plays, saves and works offline exactly as before. See [docs/FIREBASE.md](docs/FIREBASE.md).

- **Guest play**: no sign-in; an anonymous online identity appears by itself when the network allows.
- **Accounts**: e-mail and password (Firebase Authentication), password reset, verification e-mail; creating an account from a guest keeps your progress.
- **Cloud saves**: progress, garage and credits sync in the background; two devices that both changed are never overwritten silently (you choose: account, this device, or combine).
- **Leaderboards (beta)**: best time per mission. Times are not verified.
- **Feedback** reaches Novarah for real, and says exactly whether it was delivered, is waiting for the network, or failed.
- **Privacy**: optional anonymous statistics are off until you turn them on (Settings, Privacy).

Local development uses the Firebase emulators (`bun run emulators`, `bun run test:emulator`, `bun run test:e2e:cloud`). Nothing has been deployed to the live project: **its Firestore is still in test mode until `firestore.rules` is deployed**.

## Game feel and interface (Pass 4.5)

- **Instrument cluster HUD**: speedometer arc and needle, a rev ring and gear read from the same `EngineSim` that drives the engine sound (no fake gears), fuel and condition bars, drive-mode chip, short contextual alerts and a route bar with pickup and pit-stop marks. Three modes (Settings → Gameplay): Standard, Minimal (speed, timer, alerts) and Telemetry (rpm, load, gear, surface, slip). A compact layout for phones in landscape.
- **Touch controls**: slide bar or steering wheel, sensitivity, left-handed mirroring and a large-controls option.
- **3D garage**: a dedicated workshop scene (turntable, prayer flags, lantern, crates) with the real in-game model, an orbit camera (drag, wheel, pinch or buttons) and honest before/after numbers for every upgrade, read from the same function the physics uses. The world is not drawn behind it.
- **Illustrated campaign map**: ten pins on a painted sketch of the kingdom, a road through unlocked missions, medals, locks that say why, a preview card, and a list view alternative (keyboard, gamepad and touch).
- **Audio**: a mixer with engine, effects, UI, environment, weather and music buses into a limiter; distinct engine voices for the four vehicles; surface, weather, night and river layers; ducking. See [docs/AUDIO.md](docs/AUDIO.md) for the design and the manual listening protocol (automated tests cannot judge how it sounds).
- **Effects and scenery**: pooled exhaust, bonnet smoke on damaged vehicles, flung mud, spray and a bow wave when wading; roadside grass, ferns, cairns with prayer flags and mani walls.

## What's in the game (Stage 4)

**Ten missions** in five chapters, replayable for better medals. The campaign ends with a completion screen (medal summary, optional feedback, a note that the future story campaign is not yet available):

| Mission                        | Vehicles                   | Feel                                                                                                                      |
| ------------------------------ | -------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Pass Run**                   | All four                   | Collect tourists, climb four hairpins and deliver them at the viewpoint                                                   |
| **Thimphu Pickup**             | All four                   | Three ordered pickups, city traffic, dusk/night options and passenger comfort                                             |
| **Airport Dash**               | Coaster, Ranger or Cruiser | Collect the group, manage fuel, beat the flight deadline and keep passengers comfortable; an optional rival sets the pace |
| **Chelela Hill Climb**         | Ranger or Cruiser          | Nine tight hairpins, snow, rockfall and a crossing creature                                                               |
| **Eastern Tshechu Expedition** | Ranger or Cruiser          | Rough track, mud, rocks, fuel drum, stuck tractor, rockfall and a shallow ford                                            |
| **Punakha Valley Tour**        | All four                   | Three guests at three stops beside a river, a dzong at the end, comfort versus time with no deadline                      |
| **Dochula Storm Descent**      | Hatch, Ranger or Cruiser   | Hairpins down a pass in heavy rain or fog, slick tarmac, a rockfall and calm passengers                                    |
| **Trongsa Gorge Run**          | Hatch, Ranger or Cruiser   | The narrowest road in the game with a cliff drop, a broken-down lorry and a rockfall                                       |
| **Bumthang Night Expedition**  | Coaster, Ranger or Cruiser | Night forest roads on a nearly empty tank: refuel at the pump, unlit tractor, a yeti                                      |
| **GMC Plains Challenge**       | All four                   | A fictional closed-course event: wide tarmac, long straights, braking zones and a rival driver                             |

**Four vehicles:** the starter **Dzo Hatch**, **Tourist Coaster**, selectable-drive **Druk Ranger** and flagship **Dragon Cruiser**. Different seats, mass, engine, turning, fuel range, durability, wading limits, sounds and cameras use the same physics model. Earn fictional driving credits to buy vehicles and upgrade engines, tyres, suspension, brakes, range, economy and protection. There are no payments. A mission lends an eligible vehicle when none of your owned vehicles fit; spending credits cannot block campaign progress.

**Progression:** Pass Run opens Thimphu and Airport; Thimphu opens Punakha; Punakha opens Dochula; Airport opens Chelela; Chelela opens Trongsa and the expedition; Trongsa opens Bumthang; Bumthang opens the GMC finale. Vehicle availability follows mission completion, then ownership requires credits. Best times, medals, scores, comfort, wallet, upgrades and story history persist locally in save v3. Stage 1 and Stage 2 saves migrate while preserving progress and previously unlocked vehicles; old storage keys remain untouched.

**Mission rules:** stop in yellow pickup zones until boarding finishes, then follow checkpoints and deliver the whole party. Required pickups gate progress. Blue pit stops offer free refuelling/repair while stationary; the cost is time. Fuel and damage affect driving; an empty tank enables reduced-power limp mode. Recovery returns to the last safe point while preserving fuel and damage. Pause freezes mission time; restart creates fresh mission state and skips the story.

**Conditions:** clear, fog, rain and heavy rain with day, dusk or night lighting. Wet roads reduce grip; loose surfaces add drag, scraping, sound and wheel particles. Selectable 4x4 distributes traction to both axles at higher fuel consumption. Ford depth can reduce power above a vehicle's wading limit; this is an arcade zone mechanic. Low quality reduces terrain, props, particles, rain, traffic and shadows.

**Feedback:** accessible from the menu, Settings, About and results. A rating is required; contact, device details and research questions are optional. This build has no connected feedback server or Firebase. Saving a draft does not deliver it to Novarah; download JSON or copy text yourself. Blocked browser storage is explicitly reported as temporary memory.

**Offline:** build and load online once, allow the service worker to install, then cached menus, branding and missions work offline. Art, vehicle and level data are bundled; sounds are synthesised. First-ever visits need the network. Browser storage and caches may be cleared by the user or OS.

**Medals and passenger comfort:** time medals scale with the vehicle (a bus gets proportionally more time). On Thimphu Pickup and Airport Dash your final medal is the _lower_ of your time medal and your passenger-comfort medal. Comfort (0-100 %) drains with sustained hard cornering, hard braking, jerky launches, body lean and collisions, recovers slowly when you drive smoothly, and ignores bumps and small steering corrections. Score (0-100) = 60 % time + 40 % comfort on comfort missions, 100 % time otherwise. Full rules: [ARCHITECTURE.md](ARCHITECTURE.md#scoring-and-passenger-comfort).

**Look (Stage 4):** a warm, natural colour pipeline (filmic tone mapping, neutral fill light, haze that matches the sky), original Blender vehicle models with glass, lamps, arches, racks and a dragon on the flagship, a nature kit with varied pines, spruce, broadleaf, rocks and Bhutanese houses and chortens, faceted mountain ranges and textured terrain. Details and the audit that motivated it: [docs/VISUAL_DIRECTION.md](docs/VISUAL_DIRECTION.md).

**Presentation:** per-level palettes, weather (snow) and landmarks; dust, tyre smoke and skid marks; brake lights; engine vibration; adaptive resolution; Low/Medium/High presets; a menu garage with a live 3D preview and stats derived from the real physics numbers; unlock banners and personal-best feedback; fully synthesised audio with per-vehicle engine voices.

Targeted checks: `bun run test:e2e e2e/game.spec.ts --project=desktop`, `bun run test:e2e e2e/mobile.spec.ts --project=mobile`, `bun run test:e2e e2e/pwa.spec.ts --project=desktop`, and `bun run test:e2e e2e/campaign.spec.ts --project=desktop`. Each builds and serves production output. `bun scripts/mission-balance.ts` measures full missions headlessly; `bun run test tests/missions.test.ts` asserts completion, mandatory pickups, fuel and careful-driving medals across all eligible combinations.

See [ROADMAP.md](ROADMAP.md) for limitations and Stage 4 priorities, and [DEVELOPMENT_LOG.md](DEVELOPMENT_LOG.md) for measured validation. Phone tests use browser emulation; physical-device performance and human gameplay feel still need testing.
