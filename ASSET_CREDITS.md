# Asset credits

Developer: Novarah Interactives, a subdivision of Novarah Technologies. Setting, vehicles and characters are fictional.

## What is third-party, and what is not

Stage 6V adds a CC0 Quaternius human base for tourists, pedestrians, police, crowds and driver/creature authoring. Vehicles, other creatures, environment art, materials and synthesized sounds in this remake remain project-authored. Source provenance and the supplied license are recorded in [assets-src/characters/README.md](assets-src/characters/README.md) and [QUATERNIUS-LICENSE.txt](assets-src/characters/QUATERNIUS-LICENSE.txt).

The human source is Quaternius **Universal Base Characters — Standard / Superhero Male FullBody**, accessed 10 October 2026. [Primary author page](https://quaternius.com/packs/universalbasecharacters.html), [free distribution](https://quaternius.itch.io/universal-base-characters), [redistributed source GLB](https://github.com/programasweights/avatar/blob/main/public/assets/character.glb). License: [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/). Source pose, geometry and rig were adapted and simplified by the project; no third-party animation clips were imported.

## Table

| Asset                                                        | Source and how it is made                                                                                                        | Licence / ownership                                                                |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Official Novarah logo                                        | Supplied root `novarah-logo.png`; the source file is never modified                                                              | Supplied as official Novarah branding; no separate redistribution licence supplied |
| Splash / About logo and studio symbol                        | `public/brand/novarah-logo.webp`, `novarah-symbol.webp`, derived by `scripts/brand-assets.mjs`                                   | Same branding; derived assets do not imply a new licence                           |
| Pass 5.5 start-up, loading, menu and About | Reuse `public/brand/cbhr-logo.webp` (game) and `novarah-logo.webp` / `novarah-symbol.webp` (studio); no new third-party artwork was added. Tools and AI assistants are credited as text in About. | See docs/BRAND.md |
| Game logo artwork                                            | Supplied root `cbhr-logo.png` (source untouched); `public/brand/cbhr-logo.webp` derived by `scripts/game-logo.mjs`, used on the main menu | Supplied by the project owner as the game's candidate logo                         |
| Four vehicle models (`public/models/vehicles/*.glb`)         | Original. Built in Blender 5.2 by `assets-src/blender/build_vehicles.py` (+ `cbhr_lib.py`, `cbhr_vehicle.py`, `vehicles_more.py`), optimised by `scripts/build-models.mjs` (meshopt) | Project-original; no manufacturer branding or real model reproduced                |
| Environment kit (`public/models/env/kit.glb`): pines, spruce, cypress, broadleaf, shrub, rocks, boulder, three Bhutanese houses, chorten, cairn with prayer flags, mani wall, grass tufts, fern | Original. Built in Blender by `assets-src/blender/build_env.py` + `env_lib.py` with per-face vertex colours                      | Project-original                                                                   |
| Remaining buildings, landmarks, traffic, yak, yeti, ghost, gates, signs | Procedural geometry in `src/render` (`landmarks.ts`, `vehicleBodies.ts`, `Scenery.ts`, `MissionView.ts`)                          | Project-generated                                                                  |
| Mountain ranges                                              | Generated at load by `src/render/mountains.ts` from ridged noise                                                                  | Project-generated                                                                  |
| Terrain grain, road, zone, sign and particle textures, rain, snow, spray, headlight beams, skid marks | Runtime canvas textures, SVG and shaders                                                                    | Project-generated                                                                  |
| Portraits, UI motifs                                         | Project SVG                                                                                                                       | Project-generated; game icons are separate from studio branding                    |
| Soundtrack (nine tracks + a start-up excerpt, `public/audio/music/`) | Original music supplied with the project in `music/` (kept untouched); encoded by `scripts/audio-assets.mjs` to Opus/WebM 128 kbps with the MP3 stream as fallback | Original to the project |
| Favicons, app and maskable icons, social card, game logo | Derived by `scripts/branding.mjs` from the master `cbhr-logo.png` (never modified) | Property of Novarah |
| Engine voices, tyres and surfaces, weather, services, impacts, horns, feedback, progression sounds | `src/audio/AudioEngine.ts`, synthesised with the Web Audio API                                              | No audio files                                                                     |
| Fonts                                                        | System font stacks                                                                                                                | No bundled fonts                                                                   |

## Software

| Package / tool                                  | Use                                                                       | Licence                  |
| ----------------------------------------------- | ------------------------------------------------------------------------- | ------------------------ |
| Three.js (`three`)                              | Rendering; GLTFLoader, MeshoptDecoder and RoomEnvironment from its examples | MIT                      |
| `@gltf-transform/*`, `meshoptimizer` (dev only) | Optimising the Blender exports at build time                              | MIT                      |
| Blender 5.2 (author machine only)               | Modelling the GLB sources; not needed to run or build the game            | GPL-3.0 (the tool, not its output) |
| Vite, Vitest, Playwright, TypeScript, ESLint    | Build and test tooling                                                    | MIT / Apache-2.0         |

Dependency licences are separate from art ownership. No blanket project licence is inferred from a dependency or from
the supplied logos. The intentionally deleted root `novarah-horizontal-dark@2x.png`, `novarah-horizontal-light@2x.png`
and `novarah-symbol@2x.png` are not required by the app and were not restored.

## Stage 6V runtime art

- Four playable vehicles: `coachwork.ts`, `VehicleModel.ts`, cosmetic accessories and liveries: original, runtime-authored PBR meshes.
- Human base: `peopleBase.json`, adapted from the CC0 source above; offline exporter: `assets-src/blender/people_remake.py`.
- Person accessories, police uniform props, yeti/ghost rigs, zombie wardrobe/arm pivots, yak, birds and world upgrades: project-authored.
- `surfaceRelief.ts` data textures and all audio changes: project-generated; no external recordings or paid services.

Legacy vehicle GLBs are retained for authoring but the new vehicle rendering path does not download them. All original branding credits and ownership terms remain applicable.

## Stage 8A future remaster

The isolated remaster adds Poly Haven CC0 PBR surfaces, an HDR reflection environment and a needle atlas, plus original baked hero vehicles and skeletal animation. Individual authors, sources, licenses and modifications are recorded in [docs/ASSET_LICENSES.md](docs/ASSET_LICENSES.md). Previous branding and asset ownership terms remain applicable.
