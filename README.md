# Crazy Bhutan Hill Race

A lightweight, stylised 3D arcade driving game. You are a Bhutanese tour driver carrying guests over mountain passes, around Thimphu, to an airport and across a muddy expedition track. _Working title. The geography is fictional and only inspired by Bhutan's mountain roads._

Runs in desktop and mobile browsers, installs as a PWA, works offline, needs no account, ads or backend.

## Stack

TypeScript · Vite · Three.js · custom arcade vehicle physics · plain DOM/CSS UI · Web Audio (fully synthesised) · Vitest · Playwright · Bun. Novarah Interactives, a Novarah Technologies studio. Art and sound are procedural except for the supplied Novarah branding. See [ARCHITECTURE.md](ARCHITECTURE.md).

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

Debug URL flags: `?debug=1` (overlay with fps, CPU ms/frame, physics ms, draw calls, triangles, render scale; `` ` `` toggles it; exposes `window.__cbhr` for tests), `?autodrive=1` (a bot drives), `?quality=low|medium|high`, `?noadapt` (freeze adaptive resolution).

## Controls

| Input    | Action                                                                                                                                               |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keyboard | W/↑ gas · S/↓ brake, then reverse · A/D or ←/→ steer · F switch 4x2/4x4 (supported vehicles) · E service · R recover · Shift+R restart · Esc/P pause |
| Menus    | Arrow keys move between cards and buttons, Enter selects, Esc goes back                                                                              |
| Touch    | Slide the steering bar (analog, adjustable sensitivity), hold GAS / BRAKE with the other thumb; pause and recover buttons on screen                  |
| Gamepad  | Left stick steer · RT gas · LT brake · Start pause · Y recover · D-pad/A/B in menus                                                                  |

Touch controls appear on first touch (or if the primary pointer is coarse), hide when you use the keyboard, and can be forced on/off in Settings. Losing focus or a cancelled touch releases every control.

## What's in the game (Stage 3)

**Five missions**, replayable for better medals:

| Mission                        | Vehicles                   | Feel                                                                                                                      |
| ------------------------------ | -------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Pass Run**                   | All four                   | Collect tourists, climb four hairpins and deliver them at the viewpoint                                                   |
| **Thimphu Pickup**             | All four                   | Three ordered pickups, city traffic, dusk/night options and passenger comfort                                             |
| **Airport Dash**               | Coaster, Ranger or Cruiser | Collect the group, manage fuel, beat the flight deadline and keep passengers comfortable; an optional rival sets the pace |
| **Chelela Hill Climb**         | Ranger or Cruiser          | Nine tight hairpins, snow, rockfall and a crossing creature                                                               |
| **Eastern Tshechu Expedition** | Ranger or Cruiser          | Rough track, mud, rocks, fuel drum, stuck tractor, rockfall and a shallow ford                                            |

**Four vehicles:** the starter **Dzo Hatch**, **Tourist Coaster**, selectable-drive **Druk Ranger** and flagship **Dragon Cruiser**. Different seats, mass, engine, turning, fuel range, durability, wading limits, sounds and cameras use the same physics model. Earn fictional driving credits to buy vehicles and upgrade engines, tyres, suspension, brakes, range, economy and protection. There are no payments. A mission lends an eligible vehicle when none of your owned vehicles fit; spending credits cannot block campaign progress.

**Progression:** Pass Run opens Thimphu and Airport; Airport opens Chelela; Chelela opens the expedition. Vehicle availability follows mission completion, then ownership requires credits. Best times, medals, scores, comfort, wallet, upgrades and story history persist locally in save v3. Stage 1 and Stage 2 saves migrate while preserving progress and previously unlocked vehicles; old storage keys remain untouched.

**Mission rules:** stop in yellow pickup zones until boarding finishes, then follow checkpoints and deliver the whole party. Required pickups gate progress. Blue pit stops offer free refuelling/repair while stationary; the cost is time. Fuel and damage affect driving; an empty tank enables reduced-power limp mode. Recovery returns to the last safe point while preserving fuel and damage. Pause freezes mission time; restart creates fresh mission state and skips the story.

**Conditions:** clear, fog, rain and heavy rain with day, dusk or night lighting. Wet roads reduce grip; loose surfaces add drag, scraping, sound and wheel particles. Selectable 4x4 distributes traction to both axles at higher fuel consumption. Ford depth can reduce power above a vehicle's wading limit; this is an arcade zone mechanic. Low quality reduces terrain, props, particles, rain, traffic and shadows.

**Feedback:** accessible from the menu, Settings, About and results. A rating is required; contact, device details and research questions are optional. This build has no connected feedback server or Firebase. Saving a draft does not deliver it to Novarah; download JSON or copy text yourself. Blocked browser storage is explicitly reported as temporary memory.

**Offline:** build and load online once, allow the service worker to install, then cached menus, branding and missions work offline. Art, vehicle and level data are bundled; sounds are synthesised. First-ever visits need the network. Browser storage and caches may be cleared by the user or OS.

**Medals and passenger comfort:** time medals scale with the vehicle (a bus gets proportionally more time). On Thimphu Pickup and Airport Dash your final medal is the _lower_ of your time medal and your passenger-comfort medal. Comfort (0-100 %) drains with sustained hard cornering, hard braking, jerky launches, body lean and collisions, recovers slowly when you drive smoothly, and ignores bumps and small steering corrections. Score (0-100) = 60 % time + 40 % comfort on comfort missions, 100 % time otherwise. Full rules: [ARCHITECTURE.md](ARCHITECTURE.md#scoring-and-passenger-comfort).

**Presentation:** per-level palettes, weather (snow) and landmarks; dust, tyre smoke and skid marks; brake lights; engine vibration; adaptive resolution; Low/Medium/High presets; a menu garage with a live 3D preview and stats derived from the real physics numbers; unlock banners and personal-best feedback; fully synthesised audio with per-vehicle engine voices.

Targeted checks: `bun run test:e2e e2e/game.spec.ts --project=desktop`, `bun run test:e2e e2e/mobile.spec.ts --project=mobile`, `bun run test:e2e e2e/pwa.spec.ts --project=desktop`, and `bun run test:e2e e2e/campaign.spec.ts --project=desktop`. Each builds and serves production output. `bun scripts/mission-balance.ts` measures full missions headlessly; `bun run test tests/missions.test.ts` asserts completion, mandatory pickups, fuel and careful-driving medals across all eligible combinations.

See [ROADMAP.md](ROADMAP.md) for limitations and Stage 4 priorities, and [DEVELOPMENT_LOG.md](DEVELOPMENT_LOG.md) for measured validation. Phone tests use browser emulation; physical-device performance and human gameplay feel still need testing.
