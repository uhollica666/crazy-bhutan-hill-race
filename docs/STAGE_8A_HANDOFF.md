# Stage 8A — isolated implementation checkpoint

10 October 2026. **Integrated development checkpoint, not a complete visual remaster or validated release.** Current art does not yet meet the full early-2010s PC reference target.

## Isolation

Branch `update-2-visual-remaster`, worktree `D:/Projects/personal_projects/crazy-bhutan-hill-race-update-2`. Exact base: `fb2d00b662c18d47ab3f86b9c41f699a73c8b571`, the clean committed campaign/visual merge. Inspected beta checkout on `stage-6-integrated-validation`, prior visual checkout at `f82dffc`, detached baseline at `af11529` and branch/history inventory. Active beta checkout had uncommitted QA work and was left untouched. No push, main merge, deployment, public-beta rebuild or campaign regression was performed.

Implementation commit: `a4ccb8090fc33101d82ff1233f2da1f3d6fdd9e4` (`feat(remaster): integrate hero GLBs, CC0 surfaces and movement-driven rigs`). The following documentation commit adds the focused preview harness and evidence.

## Actual assets and four vehicles

[ASSET_LICENSES.md](ASSET_LICENSES.md) records every author/source/license/modification. Downloaded and rendered: three CC0 PBR sets, Rooitou Park HDR and two Pine Tree 01 atlas channels. The existing specific-pack CC0 human base is reused. No third-party vehicle/creature model or unused model pack was acquired; fictional coachwork and creatures remain original.

| Hero            | Retained identity and detail                                                    | Runtime GLB   |
| --------------- | ------------------------------------------------------------------------------- | ------------- |
| Dzo Hatch       | Compact tapered bonnet/cabin, five-spoke wheels, shaped seating and instruments | about 338 KiB |
| Tourist Coaster | Long glazed cabin, multiple seat rows, diesel chassis/axle detail               | about 395 KiB |
| Druk Ranger     | Touring utility body, roof attachments, interior/underbody detail               | about 350 KiB |
| Dragon Cruiser  | Expedition body, spare/snorkel, protection/cargo accessories                    | about 360 KiB |

Shared additions: continuous wheel arches, clearer physical glazing, shaped upholstery, belts, instruments, gear lever, optical lamp detail, rear heater strips, chassis rails, differentials, drive shaft, dampers and coils. Physics continues owning wheel mounts, steering, spin and chassis attitude. Small damped shell settle follows suspension compression; coil meshes remain static. Existing health/grime remain visible; real weather wetness changes paint roughness. Individual body surfacing still needs major work to become premium hero art.

Actual runtime meshes are baked to GLB with high/low body and wheel groups, hidden cosmetics and functional lamp/material names; welded and Meshopt-compressed. Names must survive optimization, especially independent indicators. Selected heroes load on demand. Cached geometry is shared; clones own materials. The procedural equivalent remains usable after missing/failed loads and in Low.

Garage adds metallic/matte physical paint, touring/split-sport/trail-steel rim geometry, expedition basket and trail protection. Existing carrier, auxiliary lamps, liveries, paint, trim and wheel colors remain. Rim tint no longer recolors body chrome. Old cosmetic storage key/choices survive; new fields default. No wallet, purchase, progression, upgrades or statistics behavior changed.

## Characters, creatures and animation

Near pickup/dropoff groups now have smooth skin weights, 11-bone skeletons and AnimationMixer idle/greeting crossfades. Distant groups retain batches; Low disables the near skeletal presentation. Existing stop state still determines visibility. Reusable original clips cover idle, walk, run, react, chase, flee and attack; only supplied gameplay states are connected.

Roadside walkers/crossing pedestrians use GPU joint rotations driven by actual movement/crossing state, individual phase, garment-aware PBR tinting and matching animated depth shadows. Idle figures do not walk in place. Zombies use full-body skinning with idle/walk/chase; yetis get skinned torso/legs/head alongside expressive arms. Yeti render scale increases relative to human-size zombies. Bears get smoother body/head/paws/claws and a six-bone body/head/leg rig with displacement-linked stride. Ghosts retain draped/sleeve motion with varying translucency. Collision proxies and AI remain unchanged; alignment needs later review.

Incomplete: drivers remain seated baked geometry, police retain the signal-arm rig, yaks/cattle have no new skeleton, and human clothing/body diversity/texture sets, culturally appropriate garments, boarding/disembarking, turns and fall/recovery remain future work.

## Environment, architecture, renderer and effects

PBR albedo/normal/roughness is integrated on existing asphalt/worn/wet, gravel/rocky and terrain surfaces. Actual surface assignments remain gameplay-owned; mud/ice/snow retain specialized previous paths. Weather drives road roughness.

Shared pines use photographed needle sprays on original instanced trunks/branches, wind, alpha-tested geometry, masked shadows and distance/Low fallbacks. Only the usable atlas was downloaded; the huge source tree model was avoided. Rocks gain irregular stratified geometry. Village houses gain staggered stone plinths, finer roof seams, gutters and downpipes while preserving Bhutan-inspired joinery. Other species, terraces, riverbanks, towns, hotels and religious landmarks largely retain prior art.

Outdoor vehicles use bundled HDR/PMREM; garage reflections stay neutral. Reflection strength follows light availability, without lighting the whole night scene with the HDR. Physical paint/glass, soft PCF shadows and restrained SSAO improve materials/contact shading. High/Max render beauty → SSAO → output; Low/Medium render directly. Post targets are capped to 2048 pixels on the longest edge with tier/DPI caps and released on downgrade. ACES/natural colors remain.

Wetness now follows real weather on paint/roads. Existing contact-driven dust, mud, spray, exhaust, tracks, rain, snow/lightning are retained rather than claimed as new. SSR, selective bloom, footsteps and comprehensive impact/particle replacement are incomplete.

## Size, loading and performance

- Added runtime directory: approximately **17.1 MiB**; source/provenance: **25.7 MiB**, not shipped at runtime.
- Nine maps consume approximately 12 MiB at 512 or 48 MiB at 1024 as decoded RGBA mip chains. WebP reduces transfer size, not GPU block-compressed storage. Only materials present in the world are requested; obsolete resolutions and late disposed-world loads are released.
- Four hero caches are finite; high/low geometry shares runtime buffers between instances. High AO adds a normal/depth scene pass and full-screen passes. No target-device/campaign frame-time claim is made.
- `remaster/` assets are excluded from service-worker install precache and cached on use. Low has no new request/decode requirement. Future desktop bundles must include this directory; all runtime URLs are local. Uncached optional web assets can fall back offline.
- KTX2/Basis, automatic simplification, more character LOD, full GPU memory/frame-time profiles and route budgets remain future work.

## Focused checks and incomplete work

Review: `tools/remaster-preview.html`; capture: `scripts/remaster-preview-check.mjs`; evidence: `docs/visual/stage8a/`. Software WebGL checks four imported heroes/equipment, a small world-art scene, quality transitions, lamp input behavior and fresh Low network requests. No campaign/browser autopilot was run. Focused tests decode shipped Meshopt assets, inspect attachments/lamp identities, check source hashes, skeletal deformation and old cosmetic compatibility. Final results and inherited typecheck failures are in [STAGE_8A_VERIFICATION.md](STAGE_8A_VERIFICATION.md).

The complete requested visual standard is **unfinished**. Priority next work: individual vehicle body/material authoring, textured culturally appropriate people, more convincing creature fur/skin, forest diversity, terrain/architecture replacement, quality-tier budgets and device profiling. Comprehensive gameplay/release testing is deliberately deferred.

## After the public beta is tagged

Record the final beta tag/SHA, merge its finalized fixes **into this branch**, and reconcile likely Game.ts/render/loading conflicts against its APIs. Preserve route definitions/progression, licenses and branding. Include `public/remaster/` in future offline desktop packaging. Run a later dedicated gameplay, collider/scale, saves, garage, weather, offline and device-performance pass before release. Resolve inherited difficulty typing from the finalized beta; this branch does not change route balance to silence it.

Recommendation: retain Three.js/current physics for this update. Evaluate Rapier later only against demonstrated collision/robustness limits using a small vehicle prototype. Full engine migration is not justified by this art work and would substantially increase gameplay/release validation cost.
