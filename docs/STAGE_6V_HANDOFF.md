# Stage 6V visual remake handoff

## Isolation and commits

Worktree: `D:/Projects/personal_projects/crazy-bhutan-hill-race-visual-remake`
Branch: `stage-6-visual-remake`
Base: `af11529` (Chelela Route 7). Original campaign checkout remains separate.

Local commits, in order:

1. `3cc4e94` — four playable vehicles, PBR coachwork, wheel/light responses, distance LOD.
2. `471409a` — reusable world art, terrain/road materials and contact effects.
3. `5c0bcaf` — garage cosmetics, CC0 adapted human base, articulated creature art, selective world detail.
4. `119293e` — vehicle/surface/creature synthesized audio.
5. This handoff commit.

No merge, push or deployment. No typecheck, lint, build, unit/e2e tests, browser/game runs, autopilot, benchmark or regression checks were performed. Blender was used solely to author/export the human asset. Nothing here is claimed validated.

## Four playable vehicles

| Vehicle | Authored identity |
| --- | --- |
| Dzo Hatch | Short tapered hatchback, bonnet and cabin slope, rear spoiler, compact grille and lamps, five-spoke alloy wheels. |
| Tourist Coaster | Tall passenger body, six-window divisions, multiple visible seat rows, entrance step, AC pod/vents, heavier wheel hubs and vertical rear lamps. |
| Druk Ranger | Wider touring SUV proportions, roof rails/crossbars, mirrors, handles, running trim and broad front fascia. |
| Dragon Cruiser | Upright expedition 4x4, bullbar, snorkel, running boards, roof utility box, rear spare and stronger tyre tread. |

Shared body construction includes chamfered hull sections, wheel-arch cutouts, panel seams, bumpers, number-plate blanks, dashboard, seats, visible seated driver on detailed LOD, independent paint/glass/rubber/metal materials, five/eight spoke rims and tyre tread. The light and wheel attachment positions come from existing vehicle definitions. Physics interpolation, steering, suspension travel and wheel spin remain owned by VehicleBody. Braking illuminates rear lamps even while stopped; reverse lamps follow negative speed. Headlights use paired additive cones with one shadow-free road light on higher quality. Signal materials have an explicit `setIndicator` API but no new player input binding.

High/low coachwork and wheel LODs share materials within each vehicle. Low quality forces low meshes. Body vibration stays separate from wheels. Dirt accumulation, water washing, tyre tint and condition-dependent scuffs are visual only.

## Garage cosmetics and presentation

Selectable paint: factory, glacier pearl, rhododendron red, forest green, alpine blue. Liveries: clean, touring stripe, summit graphics. Trim: factory/black/bronze. Wheels: silver/graphite/bronze. Accessories: standard, touring carrier, rally lamp bar. These are actual material and geometry changes on both LODs, displayed by the garage and carried into driving. Existing vehicle-specific standard equipment stays part of each vehicle's identity.

Cosmetics persist per vehicle in `cbhr-cosmetics-v1`, independently of SaveStore/Firebase, credits and performance upgrades. Storage exceptions retain the current live preview but persistence is unavailable. No purchase prices or stat modifiers were introduced. Front/rear/side camera buttons complement drag, zoom and orbit. Default view is front three-quarter with neutral front key and cool rim lighting.

## People and interactive creatures

- Tourists/passengers and instanced roadside/crossing/crowd people use an adapted CC0 Quaternius anatomical base, simplified offline. Semantic garment colours preserve face/hands/hair; crowd instance tint affects clothes. Eyes, collars, fastenings, hats and backpacks are original attachments.
- Police gain uniform cap, belt, badge and epaulettes. The signal-side source arm is omitted to avoid the previous third-arm appearance; the existing traffic-controlled arm remains responsible for signaling.
- Playable vehicles gain seated upper-body drivers on the detailed LOD.
- Yeti has broad shoulder mass, muzzle, brow, long articulated arms, large hands/feet and tapered fur tufts. No encounter logic changed.
- Ghost is a separate spectral hood/robe with dark face, luminous eyes, scalloped trailing cloth and floating sleeve pivots, replacing the former translucent yeti reuse.
- Zombie is an authored family-safe wardrobe/face/reaching-arm rig through `createCreatureArt('zombie')`, using the same adapted base. **No zombie encounter exists in this branch's campaign; no zombie placement or gameplay consumer was invented.** AudioEngine.zombie is also ready for that later consumer.
- Yaks/herds share rounded shoulder hump, muzzle, horns, hooves and hair skirt. Existing herd/roadside placement is retained. Birds gain feather silhouettes, beaks, eyes, feet and tail feathers.

Rig ownership: creature factory returns `{group, update(time, shrug), dispose()}`. MissionView owns update/disposal for yeti/ghost and keeps existing position/heading/hazard state. Ghost and yeti are authored at roughly 3 m, displayed through the existing 0.62 encounter scale. Zombie factory has its own nominal scale; a future consumer must preserve or deliberately normalize it.

## External assets and licenses

Only one imported asset family: Quaternius Universal Base Characters — Standard, Superhero Male FullBody, **CC0 1.0 Universal**. Primary author page: https://quaternius.com/packs/universalbasecharacters.html. Free pack: https://quaternius.itch.io/universal-base-characters. Source GLB was obtained from the documented CC0 redistribution at https://github.com/programasweights/avatar/blob/main/public/assets/character.glb; no animations, paid assets, Mixamo files or costume derivatives were imported.

`ASSET_CREDITS.md`, `assets-src/characters/README.md` and the preserved `QUATERNIUS-LICENSE.txt` document provenance. `assets-src/characters/quaternius-base.glb` retains the source skeleton for later animation authoring. `assets-src/blender/people_remake.py` exports the posed/decimated runtime `src/render/peopleBase.json`. Other art and all sounds in this pass are project-authored. No runtime library dependencies were added.

## Audio

Four custom engine harmonic waveforms preserve the existing per-vehicle synthesis recipes and mixer settings. Hatch is brighter/buzzier, Coaster carries low diesel harmonics, Ranger is smoother, Cruiser has heavier uneven low-frequency presence. Load/boost affect sound colour; wind/rain/river vary gently. Surface recipes distinguish dry/wet asphalt, gravel/rock, dirt/grass, mud, snow/packed/frost, ice/slush and water. Stone strikes and water-entry bursts are event-limited. Horn pitches follow vehicle voice. Yeti receives layered low calls; ghost arrival receives descending spectral tones and filtered air; zombie has a family-safe low voice API. Existing one-shot cap and limiter remain in place. Loudness/mix have not been auditioned.

## Selective supporting world work

Reusable timber-window and pitched-roof house variants, layered pine variants with distance/quality fallback, broadleaf branching crowns, blossom shrubs, more detailed shared shops/restaurant/hotel/office/dzong/station prototypes, bridge supports/reflectors, layered cliff plates, improved traffic body prototypes and tractor detail. Existing placements/counts/culling remain the integration foundation. Seeded 64-pixel surface relief maps supply terrain/road bump and roughness. Ford/puddle/river surfaces use PBR material treatment. Soft surfaces produce tinted tyre grooves within the existing mark buffer; hard-road smoke/skids stay differentiated. No route, mission, progression, traffic AI, collision layout or campaign balance was redesigned.

## Incomplete work and integration risks

This is implementation-only. Mesh appearance, shader compilation, strict TypeScript compatibility, camera framing, clipping, audio levels and runtime memory/performance await the user's later testing authorization. Humanoid base is one adult body type with palette/accessory variation; crowd walking remains the existing whole-body motion, rather than full skeletal locomotion. The source rig is preserved for a later animation pass. Driver is seated upper-body detail, without animated hands. Cosmetic wheel variants currently change alloy finish, not spoke topology. Zombie assets/audio have no live campaign consumer. No separate cattle species or dedicated tourist reaction recording was added. Indicators need a future explicit input consumer. Legacy `yetiGeometry` remains an unused compatibility prototype; active encounters use creatureArt.

The new person JSON uses a Vite raw import and a crowd garment-tint shader hook. Human detail adds triangles compared with old primitive people; no performance measurement was made. Detailed vehicles add one seated driver mesh and optional roof/livery meshes; quality LOD removes the driver. Cosmetic preview changes are independent of campaign saves, so they do not sync across devices. Vehicle loading entry points resolve null intentionally: active coachwork is runtime authored, and old vehicle GLBs remain on disk without being downloaded.

## Later integration

After Claude's campaign work is ready, merge `stage-6-visual-remake` into the chosen integration branch, or cherry-pick the implementation commits above in order. Take all four implementation commits together: Game/UI/renderer/audio calls depend on the new APIs. Resolve overlapping `src/app/Game.ts`, MissionView/RoadsideView, UI, render assets and audio edits by retaining campaign state/route changes while carrying over cosmetics and art/audio hooks. New zombie placements belong to the campaign owner; use the factory and voice APIs above without changing existing movement/collision contracts. Only run checks and view the game after the user lifts the no-testing rule.
