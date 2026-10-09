# Roadmap

## Implemented through Stage 4

- Stage 1: arcade physics, mountain route, camera, input, HUD, menus, audio, local saves and offline PWA.
- Stage 2: multiple vehicles/routes, comfort/scoring, unlocks, live garage preview, quality presets, adaptive resolution and effects.
- Stage 3: five tourism missions; four vehicles; story briefings; mandatory stopped pickups and delivery; fuel, damage and free timed pit stops; selectable 4x4; wet/loose surfaces and ford; weather, dusk/night, headlights and rain; seeded hazards, city traffic and airport rival; credits, ownership, real upgrades and loaners; v3 save migrations; Novarah splash/About branding; optional local feedback and JSON/text export.
- Stage 4: visual overhaul (warm colour pipeline, Blender-authored vehicles and environment kit loaded through a glTF pipeline with fallbacks, faceted mountains, textured terrain, new UI palette, game-logo menu); five new missions for ten in total (Punakha, Dochula storm, Trongsa gorge, Bumthang night, GMC plains) with terrain drop-offs; chapters on the mission map; campaign-complete screen; asset-loading and campaign tests.
- Pass 4.5: instrument-cluster HUD with three modes, touch wheel/bar/left-handed/large layouts, tabbed settings, dedicated 3D garage with real upgrade before/after numbers, illustrated campaign map with list alternative, mixer-based audio with four engine voices and weather/surface/night layers, pooled exhaust/mud/spray/damage-smoke effects, roadside grass/fern/cairn/mani-wall dressing, screen transitions.
- Stage 5 (local, emulator-verified): all ten missions about twice as long, dual headlight beams, Firebase foundation (lazy modular SDK, emulator config, deny-by-default rules with 24 rule tests), guest and e-mail accounts with guest upgrade, cloud saves with three-way conflict handling and a ledger-safe combine, beta leaderboards, real feedback delivery with an offline outbox, consent-gated statistics, a developer incident heatmap.
- Integration tests exercise full-runtime completions across eligible combinations, careful-driving medals/fuel, services, feedback, rewards, hazards, traffic, weather, lighting and physical upgrades. DEVELOPMENT_LOG.md records browser/performance evidence.

## Remaining limitations

- Physical Android/iOS devices, Safari/Firefox, actual gamepads and real audio output need verification. Emulation does not establish mobile GPU performance or hardware touch compatibility.
- Automated drivers prove routes/rules. Human handling, comfort, difficulty and enjoyment require playtests.
- Arcade wading/terrain/circular obstacles simplify contact geometry. Traffic follows lanes without overtaking; hazards follow seeded scripts. Broader varied-seed gameplay needs stress/playtesting.
- Low quality reduces traffic count, so difficulty differs across quality tiers.
- Clearing browser data loses local saves/drafts unless the player has an account. Online features are implemented and tested against the **emulators only**: the live rules have not been deployed, and nothing has been verified against the live project. Leaderboard times are unverified (no server-side validation). No multiplayer.
- Empty tanks allow limp driving. Pit stops cost time rather than credits. Replays earn ordinary rewards; timeout consolation is intentional.
- Sounds are synthesised and have **not been judged by a human listener**; follow the protocol in docs/AUDIO.md. Headlights and ford effects are stylised.
- Pass 4.5 did not add dramatic terrain beyond Stage 4's drop-offs and mountain rings, and used no third-party assets (everything is original Blender/synthesised work).

## Deferred

Trusted leaderboard verification (Cloud Functions or similar, replaying recorded inputs), cross-player heatmap aggregation, App Check enforcement, an internal staff review tool with verified roles, friends lists, ghost replay, achievements, multiplayer, Story Mode, first-person exploration, recorded audio/voiceovers, richer tutorial and sophisticated traffic AI. None of these is implemented.

## Story Mode (next stage) considerations

The arcade campaign stays separately selectable. Story Mode can reuse `MissionRuntime`, the story book (`data/story`), cast portraits, stops and the asset pipeline; the new pieces it will need are a chapter/route graph across regions, persistent party state (luggage, mood), camp and food-stop interactions and first-person scenes. None of that exists yet and nothing in the game depends on it.

## Earlier recommendations (still open)

1. Run docs/DEVICE_TESTING.md on physical devices, including offline updates and touch cancellation. Profile real GPUs before promising frame rates.
2. Conduct fresh-profile human playtests of all missions, especially starter handling, airport deadline and expedition fuel/medals. Adjust from observed play.
3. Improve pickup/service/recovery/4x4 onboarding if those tests show confusion.
4. If desired, connect feedback/progression seams to Firebase with consent, server validation and save-conflict tests.
5. Broaden traffic/hazard seed stress tests before further content or ghost replay.
