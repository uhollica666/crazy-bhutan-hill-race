# Asset credits

Developer: Novarah Interactives, a subdivision of Novarah Technologies. Setting, vehicles and characters are fictional.

## What is third-party, and what is not

**No third-party art, model, texture, music or audio file is bundled with the game.** Every 3D model, texture, sound
and piece of music is original to this project and either authored in Blender from the scripts in `assets-src/` or
generated at run time by the code. Stage 4 researched the CC0 libraries (Quaternius, Kenney, Poly Pizza, Poly Haven,
ambientCG, OpenGameArt) and deliberately did **not** import any pack: the available vehicle and nature sets are
toy-like cartoon styles that conflict with the mature art direction in `docs/VISUAL_DIRECTION.md`, and mixing styles
was the exact problem to avoid. If a CC0 asset is added later, add a row below with the creator, URL, version and the
licence text as read on the day.

## Table

| Asset                                                        | Source and how it is made                                                                                                        | Licence / ownership                                                                |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Official Novarah logo                                        | Supplied root `novarah-logo.png`; the source file is never modified                                                              | Supplied as official Novarah branding; no separate redistribution licence supplied |
| Splash / About logo and studio symbol                        | `public/brand/novarah-logo.webp`, `novarah-symbol.webp`, derived by `scripts/brand-assets.mjs`                                   | Same branding; derived assets do not imply a new licence                           |
| Game logo artwork                                            | Supplied root `cbhr-logo.png` (source untouched); `public/brand/cbhr-logo.webp` derived by `scripts/game-logo.mjs`, used on the main menu | Supplied by the project owner as the game's candidate logo                         |
| Four vehicle models (`public/models/vehicles/*.glb`)         | Original. Built in Blender 5.2 by `assets-src/blender/build_vehicles.py` (+ `cbhr_lib.py`, `cbhr_vehicle.py`, `vehicles_more.py`), optimised by `scripts/build-models.mjs` (meshopt) | Project-original; no manufacturer branding or real model reproduced                |
| Environment kit (`public/models/env/kit.glb`): pines, spruce, cypress, broadleaf, shrub, rocks, boulder, three Bhutanese houses, chorten | Original. Built in Blender by `assets-src/blender/build_env.py` + `env_lib.py` with per-face vertex colours                      | Project-original                                                                   |
| Remaining buildings, landmarks, traffic, tourists, yak, yeti, gates, signs | Procedural geometry in `src/render` (`landmarks.ts`, `vehicleBodies.ts`, `Scenery.ts`, `MissionView.ts`)                          | Project-generated                                                                  |
| Mountain ranges                                              | Generated at load by `src/render/mountains.ts` from ridged noise                                                                  | Project-generated                                                                  |
| Terrain grain, road, zone, sign and particle textures, rain, snow, spray, headlight beams, skid marks | Runtime canvas textures, SVG and shaders                                                                    | Project-generated                                                                  |
| Portraits, favicon / PWA icons, UI motifs                    | Project SVG and `scripts/make-icons.mjs`                                                                                          | Project-generated; game icons are separate from studio branding                    |
| Engine voices, tyres and surfaces, weather, services, impacts, horns, feedback, music, progression sounds | `src/audio/AudioEngine.ts`, synthesised with the Web Audio API                                              | No audio files                                                                     |
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
