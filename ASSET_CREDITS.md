# Asset credits

**Stage 1 and Stage 2 ship with no third-party assets.** Nothing here was downloaded or integrated, so there are no attribution obligations and no licences to track yet.

| Asset                                                                                                                                                                                                                                  | Source                                                                    | Status     |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ---------- |
| All 3D models: Druk Ranger and Tourist Coaster, farmhouses, chortens, dzong, airport terminal, control tower, parked airliner, prayer-wheel pavilion, trees (pine, cypress, broadleaf), rhododendron shrubs, rocks, yaks, flags, gates | Original, generated procedurally in code (`src/render/*`, `landmarks.ts`) | Integrated |
| Road, sign and shadow textures; snow, dust and smoke sprites; skid marks                                                                                                                                                               | Original, generated at runtime (canvas / shaders)                         | Integrated |
| Logo, favicon, PWA icons, UI icons, medal, lock and passenger icons, endless-knot motif                                                                                                                                                | Original SVG (`src/ui/icons.ts`, `public/`)                               | Integrated |
| All audio: engines (per vehicle), tyres, skid, wind, birds, aircraft flyover, air brakes, chimes, crash, unlock/record stings, music                                                                                                   | Original, synthesised with Web Audio (`src/audio/AudioEngine.ts`)         | Integrated |
| Fonts                                                                                                                                                                                                                                  | System font stacks only                                                   | n/a        |

## Candidates for later stages (researched, NOT downloaded, NOT used)

Licence statements were read from the creators' own pages on 2026-10-09 (during Stage 1). Re-verify at download time and record the exact pack version.

| Pack                                                         | Creator    | URL                                              | Licence (as stated on page) | Intended use                                                      |
| ------------------------------------------------------------ | ---------- | ------------------------------------------------ | --------------------------- | ----------------------------------------------------------------- |
| Car Kit                                                      | Kenney     | https://kenney.nl/assets/car-kit                 | Creative Commons CC0        | Additional vehicles (SUV/van/taxi bases)                          |
| Ultimate Nature Pack (150 models, FBX/OBJ/Blend, untextured) | Quaternius | https://quaternius.com/packs/ultimatenature.html | CC0                         | Alternative vegetation and rocks if procedural props need variety |

Not investigated in detail: Poly Pizza (per-model licences vary: check each), Kenney audio/UI packs, Freesound (per-sound licences vary; avoid CC-BY-NC), Poly Haven (CC0 textures/HDRIs; likely too heavy for mobile).

Stage 2 deliberately did not add downloaded audio: the synthesised engine, tyre and ambience layers were enough to give each vehicle a distinct voice without growing the download. If real engine recordings are added later, record creator, URL, licence and attribution here.
