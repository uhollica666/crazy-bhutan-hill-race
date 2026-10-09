# Crazy Bhutan Hill Race

A lightweight, stylised 3D arcade driving game. You are a Bhutanese tour driver carrying guests over hairpin mountain passes, across a valley to a flight, and up a snowy high pass. _Working title. The geography is fictional and only inspired by Bhutan's mountain roads._

Runs in desktop and mobile browsers, installs as a PWA, works offline, needs no account, ads or backend.

## Stack

TypeScript · Vite · Three.js · custom arcade vehicle physics · plain DOM/CSS UI · Web Audio (fully synthesised) · Vitest · Playwright · Bun. No UI framework, no physics WASM, no downloaded assets. See [ARCHITECTURE.md](ARCHITECTURE.md) for why.

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
| `node scripts/shots.mjs`      | Screenshots of every screen and level (needs a server running)                                   |
| `node scripts/perf.mjs`       | Render workload / JS-per-frame table per level and quality preset                                |
| `node scripts/make-icons.mjs` | Regenerates favicon / PWA icons from the in-code logo                                            |

Debug URL flags: `?debug=1` (overlay with fps, CPU ms/frame, physics ms, draw calls, triangles, render scale; `` ` `` toggles it; exposes `window.__cbhr` for tests), `?autodrive=1` (a bot drives), `?quality=low|medium|high`, `?noadapt` (freeze adaptive resolution).

## Controls

| Input    | Action                                                                                                                              |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Keyboard | W/↑ gas · S/↓ brake, then reverse · A/D or ←/→ steer · R recover · Shift+R restart · Esc/P pause                                    |
| Menus    | Arrow keys move between cards and buttons, Enter selects, Esc goes back                                                             |
| Touch    | Slide the steering bar (analog, adjustable sensitivity), hold GAS / BRAKE with the other thumb; pause and recover buttons on screen |
| Gamepad  | Left stick steer · RT gas · LT brake · Start pause · Y recover · D-pad/A/B in menus                                                 |

Touch controls appear on first touch (or if the primary pointer is coarse), hide when you use the keyboard, and can be forced on/off in Settings. Losing focus or a cancelled touch releases every control.

## What's in the game (Stage 2)

**Three missions**, unlocked in order, replayable for better medals:

| Mission                | Vehicles                     | Feel                                                                                                                             |
| ---------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **Pass Run**           | 4x4 or Coaster               | Four hairpins up a pine mountainside, rolling mist toward the summit                                                             |
| **Airport Dash**       | Coaster (recommended) or 4x4 | Wide, sunny valley road past a dzong and market town to an airport; beat the flight deadline **and keep passengers comfortable** |
| **Chelela Hill Climb** | 4x4 only                     | Nine tight hairpins on a steep, narrow, snow-dusted rhododendron hillside                                                        |

**Two vehicles**, one physics model, different data: the **Druk Ranger** (light, quick, grippy) and the **Tourist Coaster** (heavy, wide-turning, soft with visible body lean, long braking, air-brake hiss, distinct engine note and camera). The Coaster unlocks when you finish Pass Run.

**Progression:** Airport Dash opens after finishing Pass Run, Chelela Hill Climb after finishing Airport Dash. Per vehicle you keep best time, best medal, best score and best comfort; saved locally in a versioned save (Stage 1 saves migrate automatically).

**Medals and passenger comfort:** time medals scale with the vehicle (a bus gets proportionally more time). On Airport Dash your final medal is the _lower_ of your time medal and your passenger-comfort medal. Comfort (0-100 %) drains with sustained hard cornering, hard braking, jerky launches, body lean and collisions, recovers slowly when you drive smoothly, and ignores bumps and small steering corrections. Score (0-100) = 60 % time + 40 % comfort on comfort missions, 100 % time otherwise. Full rules: [ARCHITECTURE.md](ARCHITECTURE.md#scoring-and-passenger-comfort).

**Presentation:** per-level palettes, weather (snow) and landmarks; dust, tyre smoke and skid marks; brake lights; engine vibration; adaptive resolution; Low/Medium/High presets; a menu garage with a live 3D preview and stats derived from the real physics numbers; unlock banners and personal-best feedback; fully synthesised audio with per-vehicle engine voices.

See [ROADMAP.md](ROADMAP.md) for known limitations and Stage 3 recommendations, and [DEVELOPMENT_LOG.md](DEVELOPMENT_LOG.md) for what was actually measured and tested.
