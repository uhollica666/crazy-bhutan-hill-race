# Route 0: Driver's Academy (Stage 6A, implemented, NOT yet tested)

Not part of the ten-mission campaign: id `drivers-academy` (`src/data/levels/academy.ts`, reachable only via `getLevel`/`getAcademy`).
Always driven in the stock Druk Ranger on loan. No countdown, clock limit 24 h, no rewards, no leaderboard/telemetry/history.

- **Lessons** (`src/tutorial/lessons.ts`): 1 controls, 2 passengers, 3 fuel, 4 repairs, 5 surfaces+puddles+ford, 6 4x4 (optional), 7 rockfall+lorry,
  8 yeti+yaks (optional), 9 rain/dense fog/night+lantern spirit (optional), 10 practice delivery (optional). Essential = 1-5 and 7.
- **Controller** (`src/tutorial/TutorialController.ts`): reads real mission state each frame; a closed striped barrier + `MissionRuntime.progressCap`
  keep the road in lesson order; "Got it" cards hold the car (`holding`); Retry lesson / Replay tip / Skip (optional lessons only);
  "Done, start the game" appears when the essentials are done (or the Academy was completed before) and opens Route 1 (`pass-run`).
- **Entry**: Drive for a fresh player offers it once (Skip for now is remembered); "Driver's Academy" button on the mission screen replays it.
- **State**: `cbhr.tutorial.v1` (own key; not in the save, cloud payload or Firestore). `?dev=1` shows "Developer: reset to a new player" in Settings
  (`Game.resetProgress`, also `__cbhr.resetProgress()`): clears progress, credits, vehicles, upgrades, records, story, tutorial; keeps settings, other
  storage and the Firebase sign-in; sets `CloudMeta.resetHold` so a differing cloud copy always goes to the conflict screen (never restored or overwritten silently).
- **Shared mechanics added**: per-surface road textures (dirt/gravel/rock/mud) on every level; puddles (`LevelDef.puddles`) and rippled ford water;
  `denseFog` weather; `herd` hazard + `creature.variant: 'ghost'` + `reactive` hazards; soft barrier collisions; `HazardSystem.resetIds`.
