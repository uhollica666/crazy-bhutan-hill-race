# Crazy Bhutan Hill Race

A lightweight, stylised 3D arcade driving game. You are a Bhutanese tour driver carrying guests up a hairpin mountain pass before the mist (and the flight) closes in. _Working title. The geography is fictional and only inspired by Bhutan's mountain roads._

Runs in desktop and mobile browsers, installs as a PWA, works offline, needs no account, ads or backend.

## Stack

TypeScript · Vite · Three.js · custom arcade vehicle physics · plain DOM/CSS UI · Web Audio (fully synthesised) · Vitest · Playwright. No UI framework, no physics WASM, no asset downloads. See [ARCHITECTURE.md](ARCHITECTURE.md) for why.

## Run it

Requires [Bun](https://bun.sh) 1.3+ (Vite and Vitest run on Node 20.19+ under the hood; developed on Node 24).

```bash
bun install
bun run dev        # http://localhost:5273
```

| Command                       | What it does                                                |
| ----------------------------- | ----------------------------------------------------------- |
| `bun run dev`                 | Dev server with hot reload                                  |
| `bun run build`               | Type-check + production build into `dist/` (includes sw.js) |
| `bun run preview`             | Serve `dist/` on :4173                                      |
| `bun run typecheck`           | `tsc --noEmit`                                              |
| `bun run lint`                | ESLint                                                      |
| `bun run format`              | Prettier                                                    |
| `bun run test`                | Vitest unit/simulation tests                                |
| `bun run test:e2e`            | Playwright (uses your installed Chrome; builds and serves)  |
| `node scripts/make-icons.mjs` | Regenerates favicon / PWA icons from the in-code logo       |

Debug URL flags: `?debug=1` (FPS/draw-call overlay, `window.__cbhr` test API; `` ` `` toggles the overlay), `?autodrive=1` (bot drives), `?quality=low|medium|high`.

## Controls

| Input    | Action                                                                                                  |
| -------- | ------------------------------------------------------------------------------------------------------- |
| Keyboard | W/↑ gas · S/↓ brake, then reverse · A/D or ←/→ steer                                                    |
|          | R recover to last checkpoint · Shift+R restart · Esc/P pause                                            |
| Touch    | Slide the steering bar (analog), hold GAS / BRAKE (multi-touch OK); on-screen pause and recover buttons |
| Gamepad  | Left stick steer · RT gas · LT brake · Start pause · Y recover                                          |

Touch controls appear on first touch (or if the primary pointer is coarse), hide when you use the keyboard, and can be forced on/off in Settings.

## What's playable (Stage 1)

One level, **Pass Run**: ~1.1 km climb with four hairpins, ~70 m of elevation, parapet-lined road, villages, chortens, prayer-flag spans, yaks, forest, rolling mist near the summit. 4 ordered checkpoints + finish, 3-2-1 countdown, 2:30 time limit, gold/silver/bronze medals, best time saved locally. Main menu, HUD (speed, timer, checkpoint route bar, objective, minimap), pause, completion screen, settings (volumes, mute, graphics quality, touch mode, controls reference). Synthesised engine/tyre/skid/wind/collision/checkpoint/finish sounds and quiet generative music.

See [ROADMAP.md](ROADMAP.md) for known limitations and next steps.
