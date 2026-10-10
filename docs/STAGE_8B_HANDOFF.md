# Stage 8B visual remaster handoff

Work is isolated on `update-2-visual-remaster`. No push, merge or deployment was performed. The beta checkout and its campaign QA were left in place. This checkpoint improves the existing stylized art; it is not a photorealistic replacement of the entire cast.

## Vehicles and garage

All four heroes have curved shared-normal body panels, crowned and sealed bonnets/roofs/decks, shaped glass panes, wheel arches, inset lights, beveled details and richer cabins. Wheels retain semantic mounts and include brake detail. Roof cargo uses fabric cases and straps. Liveries and dirt follow the curved panels. Original authoring GLBs and Meshopt runtime GLBs are retained with two LODs and named cosmetic attachments. Axles, dimensions and physics mounting contracts are preserved.

The garage uses neutral studio illumination and the same bounded High/Max occlusion pipeline as gameplay. FXAA smooths post-processing edges. Headlight cones were reduced to avoid washing out daytime bodies. Existing wetness, dirt, suspension and cosmetic integration remain.

## Humans and creatures

Humans gain restrained proportions, complexion, hair/accessory and garment variation, procedural cloth detail and articulated police signal arms. Nearby mission parties use four shared prototypes with height and phase variation. Distant crowds retain batching.

Humanoid rigs add foot bones, speed-driven stride, planted stance feet, ankle correction and a turn clip. Zombies have hunched bodies and additional facial/clothing detail. Yetis and bears use original procedural fur detail and more shaped faces. Ghosts have a subdivided flowing fabric drape. Nearby mission yaks use skinned legs/hooves and curved horns, with Low/distant instanced fallbacks. Quadruped stride follows actual movement speed.

These remain stylized characters. Generic clips are not all wired into gameplay states; police are articulated meshes rather than full skinned rigs, drivers are baked, and roadside scenery yaks retain their existing animation path. Collision and campaign integration require later beta validation.

## Scope and provenance

No new external asset pack was imported. New geometry, shaders and rig work are project-authored; inherited Quaternius characters and Poly Haven resources retain their documented CC0 provenance in [ASSET_LICENSES.md](ASSET_LICENSES.md). No extra actor textures are allocated. Environment work was limited to existing Stage 8A surfaces and yak appearance. Economy, progression, Firebase, route layouts and core physics were not changed.

A compatibility fix widens the difficulty type to existing ratings 1–10 and bounds visual map dots to five, preventing negative string repetition for expedition ratings. Actual route ratings and route data are unchanged.

## Review and verification

Open [the before/after gallery](visual/stage8b/index.html). Vehicle baselines use the Stage 8A `28a8021` GLBs under identical studio framing; temporary baseline assets are removed before packaging. Creature comparison uses the saved pre-change group capture, with individual updated close-ups alongside it. Interior views are camera inspection views, not a gameplay feature.

Targeted asset, rig and route-rating checks: 12 tests across three files. TypeScript, changed-file lint and production build were checked. The focused software-WebGL preview records shader/page errors, cosmetic and lamp checks, quality passes and fresh-Low requests in `visual/stage8b/focused-check.json`. It is not a target-device performance benchmark or campaign/collision test. The existing large application chunk warning remains.

Runtime heroes are approximately 590–682 KiB each; retained uncompressed authoring sources are larger. All remaster runtime files total 18,950,960 bytes (18.1 MiB); remaster source files total 47,498,930 bytes (45.3 MiB). Original surface texture resolutions and decoded texture budgets remain unchanged. High/Max post targets are bounded to a 2048-pixel long edge; Low retains procedural fallback and avoids remaster requests on a fresh page. The dedicated review server uses its own ignored Vite cache rather than the shared dependency directory.

After beta QA/tagging, merge beta into this remaster branch and resolve shared renderer/gameplay files before wider campaign and device validation. Do not merge this checkpoint into the active beta during its current QA.
