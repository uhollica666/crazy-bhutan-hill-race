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
