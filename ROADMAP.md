# Roadmap

## Stage 1 scope (done)

Playable vertical slice: one level (Pass Run), one vehicle (Druk Ranger), arcade physics, chase camera, keyboard/touch/gamepad input, HUD + minimap, menu/pause/finish/settings, synthesised audio, local saves, PWA, tests, docs.

## Known limitations (honest list)

- **Mobile performance is unverified.** Only desktop Chrome with software GL (SwiftShader, ~12–15 fps, meaningless for perf) and Pixel-7 _emulation_ were run. The 30/60 fps targets are aspirations. Scene is ~120–135k triangles / ~25–40 draw calls on Medium/High, ~40k of which is terrain; Low reduces props and drops shadows but terrain density is unchanged. Needs real-device profiling.
- **Audio has never been listened to by a human in this session** (headless tests only). Levels, engine pitch curve and loudness are untuned; expect to iterate.
- **Driving feel is tuned numerically** (a bot completes the route; unit tests cover accel/brake/steer/reverse/stability) but not play-tested by a person. Steering, grip and camera lag will want hand-tuning.
- Real gamepad and iOS Safari were not tested. Touch was tested by synthetic multi-pointer events, not a physical screen.
- Medal times (72/88/110 s) are derived from a bot run (~58 s) plus guesswork.
- Anti-aliasing only changes on relaunch. No dust/skid marks/particles. No dynamic resolution scaling. No texture compression (there are almost no textures).
- Hairpin radius ≈ 13 m and grades up to ~26% are arcade-friendly but not realistic.
- One vehicle and one level only; vehicle selection and unlock UI are not built (data fields exist).
- Terrain mesh is a fixed 4 m grid (no LOD).
- Bundle is a single ~645 KB (171 KB gzip) JS chunk dominated by Three.js.

## Stage 2 recommendations (priority order)

1. Real-device profiling (budget Android, iPhone) and a dynamic-resolution/terrain-LOD pass; set quality defaults from measurements.
2. Hands-on tuning of handling, camera and audio; add tyre dust/skid decals and simple speed effects.
3. Second vehicle (taxi or Coaster minibus) + vehicle selection screen; proves `VehicleDef` generality (3-axle bus).
4. Second and third levels (Paro Airport Dash with a hard flight deadline; Chelela hill climb with fog) to validate level data and unlock flow.
5. Passenger comfort + vehicle condition (consume `consumeImpact` and lateral/vertical accelerations).
6. Traffic and rival AI built on `Road` and `AutoDriver`.
7. Ghost replay (command-stream recording) then leaderboards.

## Campaign plan (≈10 levels)

1 Thimphu Taxi Rush (tutorial, city streets) · 2 Paro Airport Dash (deadline) · 3 Chelela Hill Climb (this level, evolved) · 4 Tiger's Nest Trailhead Transfer (dirt, narrow) · 5 Dochula Fog Run (low visibility) · 6 Punakha Scenic Challenge (rivers, bridges, comfort scoring) · 7 Phobjikha Wildlife Drive (livestock traffic) · 8 Eastern Off-Road Expedition (4x4 mud) · 9 Southern Plains Sprint (closed-course rivals) · 10 Druk Grand Challenge (everything). Unlocks: medal/finish of the previous level (`LevelDef.unlock`).
