# Roadmap

## Implemented through Stage 3

- Stage 1: arcade physics, mountain route, camera, input, HUD, menus, audio, local saves and offline PWA.
- Stage 2: multiple vehicles/routes, comfort/scoring, unlocks, live garage preview, quality presets, adaptive resolution and effects.
- Stage 3: five tourism missions; four vehicles; story briefings; mandatory stopped pickups and delivery; fuel, damage and free timed pit stops; selectable 4x4; wet/loose surfaces and ford; weather, dusk/night, headlights and rain; seeded hazards, city traffic and airport rival; credits, ownership, real upgrades and loaners; v3 save migrations; Novarah splash/About branding; optional local feedback and JSON/text export.
- Integration tests exercise full-runtime completions across eligible combinations, careful-driving medals/fuel, services, feedback, rewards, hazards, traffic, weather, lighting and physical upgrades. DEVELOPMENT_LOG.md records browser/performance evidence.

## Remaining limitations

- Physical Android/iOS devices, Safari/Firefox, actual gamepads and real audio output need verification. Emulation does not establish mobile GPU performance or hardware touch compatibility.
- Automated drivers prove routes/rules. Human handling, comfort, difficulty and enjoyment require playtests.
- Arcade wading/terrain/circular obstacles simplify contact geometry. Traffic follows lanes without overtaking; hazards follow seeded scripts. Broader varied-seed gameplay needs stress/playtesting.
- Low quality reduces traffic count, so difficulty differs across quality tiers.
- Clearing browser data loses local saves/drafts. No accounts, cloud saves, multiplayer, online leaderboard or connected feedback backend exists.
- Empty tanks allow limp driving. Pit stops cost time rather than credits. Replays earn ordinary rewards; timeout consolation is intentional.
- Sounds are synthesised; headlights and ford effects are stylised.

## Deferred

Firebase, ghost replay, online leaderboards, achievements, multiplayer, additional content, recorded audio/voiceovers, richer tutorial and sophisticated traffic AI. These are not Stage 3 capabilities.

## Recommended Stage 4 priorities

1. Run docs/DEVICE_TESTING.md on physical devices, including offline updates and touch cancellation. Profile real GPUs before promising frame rates.
2. Conduct fresh-profile human playtests of all missions, especially starter handling, airport deadline and expedition fuel/medals. Adjust from observed play.
3. Improve pickup/service/recovery/4x4 onboarding if those tests show confusion.
4. If desired, connect feedback/progression seams to Firebase with consent, server validation and save-conflict tests.
5. Broaden traffic/hazard seed stress tests before further content or ghost replay.
