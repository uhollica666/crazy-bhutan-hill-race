# Visual upgrade integration — 10 October 2026

## Branches

The current visual patch is developed on `codex/visual-upgrade`, based on the earlier `stage-6-visual-remake` commits. The user authorized local integration into `main`. Claude’s `stage-6-route-7-chelela-climb` branch is preserved at `af1152947f1dcccd8e35ebd97e701f70443eb5b0`; no commits are made on that branch. No remote push or deployment is included.

## Visible changes

- Four playable vehicles use rounded coachwork, inset grilles and projector lamps, open wheel spokes, clearer glass, paint reflections and garage cosmetics. Garage previews and driven vehicles share these models.
- Thimphu hotels, offices, shops and restaurants use rectangular hipped roofs, timber window bays, decorated cornices, balconies, arcade entrances and threshold steps. Chortens have tiered plinths, niches and thirteen spire rings.
- Forests have branching irregular crowns; grass uses curved tapered blades. Yaks, yetis and ghosts have revised silhouettes and faces. Flags have a woven fabric map, printed geometric border and existing wind animation.
- Metal lamp housings and nearby nighttime light pools replace unlit decorative lamps. Road warning signs have visible winding-road symbols; railings have feet, caps and bolts. Cliff strata, road aggregate, mud ruts and parapet relief improve surface presentation.
- The skirt-like human silhouette came from an unrelated Blender-imported Icosphere helper being exported with the character. The exporter now selects meshes carrying an Armature modifier before baking the pose. The corrected shared base affects tourists, walkers, police and driver authoring.
- Each upright NPC samples its own footprint and the actual rendered road ribbon. This avoids sharing one height across a tourist group on a slope. Low keeps full terrain triangulation beside roads and rivers, preventing coarse terrain from covering road patches. Vehicle dynamics, route objectives and campaign progression are preserved.

## Graphics settings

Auto remains the saved preference while the renderer chooses Low, Medium or High from CPU, optional device-memory, pointer/mobile and WebGL renderer hints. Software renderers choose Low. Adaptive resolution responds to frame time. These hints are estimates, not an inventory of available GPU memory or free system RAM.

Low removes surface bump/roughness maps and shadows, reduces vegetation and weather, and uses simpler pine/grass geometry. Medium and High restore surface relief, increase anisotropy and enable one/three nearby nighttime lights. Max enables six lights, 4096px shadows, 16x texture anisotropy (renderer capability limits apply), larger rain/snow budgets and a 1.1 render multiplier with DPR cap 2.5. Adaptive resolution is disabled on Max. It is intentionally heavier; no real-PC GPU benchmark is claimed.

## Validation and running

Latest user instruction: run and visually check for validation; do not run test suites. No suites were run after that instruction. TypeScript/Vite production compilation passed. The browser asset workshop rendered sixteen assets without errors. Live route captures cover Thimphu, Punakha, Chelela and Bumthang. Auto/Max/Low switching and Medium river shaders were checked. Headless Chrome used SwiftShader; High full-city screenshots were too slow, so the route checks used Low/Medium. Generated images and JSON console reports are under ignored `screenshots/visual-upgrade-*` directories.

Before the latest restriction, an earlier test-suite attempt reported 104 failures out of 436 checks, including campaign expectations and an incomplete Web Audio mock. The mock was corrected; the suite was not rerun to completion. This handoff does not claim a passing suite or a complete gameplay regression audit.

Run `bun run dev --host 127.0.0.1 --port 4173` and open `http://127.0.0.1:4173/`. The live asset workshop is at `/tools/visual-review.html`. Browser capture helpers are `scripts/visual-review-shots.mjs` and `scripts/visual-runtime-check.mjs`; they require a running server. Reload an already-open game after changing branches so it loads the current code. Existing saved manual quality preferences remain intact; select Auto explicitly to use it.

## Asset provenance

The adapted human source and supplied CC0 license are recorded in `assets-src/characters/README.md`, `QUATERNIUS-LICENSE.txt` and root `ASSET_CREDITS.md`. Human re-export: Blender background execution of `assets-src/blender/people_remake.py`. Other revised meshes and surface textures are project-authored.

## Follow-up: fog and Thimphu settlement

`codex/fog-cityscape` adds exponential distance extinction, sky and mountain haze, 280m feathered fog-zone approaches/exits, 5.5-second visibility easing and 24/48/80/128 soft drifting mist instances for Low/Medium/High/Max. The distant mountain ring now follows the camera in XZ as a backdrop; the old fixed 820m ring could intersect long routes and be driven through. Weather zones, wetness, mission rules and traffic behavior remain unchanged.

Thimphu gains 424 potential background settlement blocks in four rows behind existing frontages, with collision-free road clearance, slope/water rejection, instanced spatial batches and quality-scaled density. These are decorative blocks, not a real-world city map or added playable streets.

Validation uses compilation and live browser captures only. Fog at dusk, heavy rain, route weather and the expanded city are captured under `screenshots/fog-cityscape-*`, with console-error reports. The screenshots use Low and software rendering; no new test suites or PC performance benchmark are claimed.
