# Roadmap

## Done

- **Stage 1**: one level, one vehicle, arcade physics, camera, input, HUD, menus, audio, saves, PWA, tests.
- **Stage 2**: handling and camera overhaul (rollover guard, yaw assist, engine braking, per-vehicle camera framing, look-ahead), a second vehicle (Tourist Coaster), garage with live 3D preview, three missions with distinct routes and looks, passenger comfort and scoring, versioned saves with Stage 1 migration, level and vehicle unlocks, dust / smoke / skid marks / brake lights / snow, per-vehicle engine audio and new feedback sounds, mobile UX pass, adaptive resolution and a meaningful Low preset, LAN device-testing guide, offline PWA verification, expanded tests.

## Known limitations (honest list)

- **No real-device testing has been done.** Everything about phones comes from desktop Chrome and Pixel 7 _emulation_. The 30/60 fps targets remain aspirations; `docs/DEVICE_TESTING.md` is the procedure to replace guesses with measurements.
- **Software-rendered numbers only.** The performance table in DEVELOPMENT_LOG.md was measured on SwiftShader (CPU GL): triangle/draw-call/geometry counts and JS-per-frame are meaningful, frame rates are not.
- **Nobody has played this yet.** Handling, camera, comfort thresholds and medal times are tuned with autopilots (the bot completes every level with every eligible vehicle, comfort trade-offs are asserted) and by reading screenshots, but not by feel. Autopilot success does not prove the game is fun. Expect the first real playtests to move numbers (comfort in particular was calibrated on bot profiles).
- **Audio has never been heard by a person.** Node-leak and behaviour tests pass; loudness, pitch curves, the air-brake hiss, flyover and music are untuned.
- Gamepad and iOS Safari untested. Touch tested with synthetic multi-pointer events only.
- The comfort model is deliberately lenient below ~7 m/s² lateral and drops steeply above it (the flat-out 4x4 scores ~29 %); it may want a smoother curve after playtests.
- The garage preview shows the vehicle at the start line of the chosen level (so the world must load first, ~0.3 s on desktop); there is no separate showroom.
- Terrain is a fixed grid (4-5 m) with a coarse index on Low; no LOD streaming. Airport Dash is the heaviest scene (~110k terrain triangles on Medium/High).
- Some visuals are plain: no road-side traffic, no pedestrians or river bridges, shadows only from the car.
- Hairpin radius ≥ 13 m and grades up to ~32 % on Chelela are arcade-friendly rather than realistic.
- No cloud sync, leaderboards, ghost replays or accounts (out of scope).
- Bundle is a single ~700 KB (≈190 KB gzip) JS chunk dominated by Three.js.

## Stage 3 recommendations (priority order)

1. **Real-device profiling** on a budget Android phone and an iPhone using the LAN/USB procedure; fix the worst offenders (likely terrain on Airport Dash, overdraw from particles/fog, shadow cost) and set per-device defaults from data.
2. **Human playtests** for handling, camera comfort on phones, and comfort/medal calibration; consider a short on-screen driving tutorial (Pass Run start).
3. A third vehicle (a taxi or a long bus) and one more mission to prove the data model again; add vehicle-condition (damage) on top of `consumeImpact`.
4. Light traffic (slow trucks, livestock on the road) and rival drivers on `Road`, reusing `AutoDriver`.
5. Ghost replay (record the 120 Hz command stream) then optional online leaderboards.
6. Campaign to ~10 levels: Thimphu Taxi Rush, Tiger's Nest transfer, Dochula fog run (visibility gameplay), Punakha scenic, Phobjikha wildlife, eastern off-road, southern plains sprint, Druk Grand Challenge.
7. Replace synthesised engine layers with a few small licensed samples if the synth proves fatiguing.
