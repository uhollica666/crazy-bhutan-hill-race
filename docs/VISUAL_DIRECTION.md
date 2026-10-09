# Visual direction (Stage 4)

## The problem we were fixing

The Stage 3 game looked like a generic demo. The audit (screenshots in `screenshots/stage4-before`, captured with
`scripts/stage4-shots.mjs`) found:

| Finding | Cause in the code |
| ------- | ----------------- |
| A pervasive blue cast over menus, panels and scenery | UI built on indigo (`#1d2f5c`, `#121c3a`, rgba(18,28,58)); hemisphere fill light `0xd6e8f8` at intensity 2.4; fog `0xcfdde6` (blue-grey) that did not match the warm sky horizon; unlit ridge colour `0x5f7388`; per-level fog/sky constants in the same blue-grey family; night preset tinted navy `0x0c1430` |
| Washed, plastic highlights | No tone mapping: the sun at 2.8 and fill at 2.4 clipped to flat white on pale surfaces |
| Toy-like vehicles | Vehicles were stacks of axis-aligned boxes with vertex colours: no glass, no arches, no lights, no proportions |
| Procedural, repetitive nature | One cone-stack pine and one cone cypress for every forest; ridges were single hazy cones that read as blobs |
| Flat lawns | Terrain colour was a smooth altitude/slope gradient with no grain, no forest floor, no dry or bare patches |
| Generic UI | Bright navy panels with blue-grey text and a placeholder circle logo |

## The direction

**"Late-morning Himalayan documentary."** Natural light, earth and timber, whitewash and saffron, pigment colour only
where Bhutan actually has it (prayer flags, painted window frames, gilded roofs, the red of a monastery band).

- **Colour pipeline.** Filmic (ACES) tone mapping at exposure 1.05; a neutral warm hemisphere fill (`0xe3e1d6` sky,
  `0x6a5a3c` ground) at about 70% of the old intensity so the sun does the modelling; a warm sun; fog that matches the
  horizon (warm grey `0xd8d0bd` by day, neutral grey in storms, near-black neutral at night). Blue is allowed where it
  is natural: the sky overhead and moonlit shadows.
- **Terrain.** Muted olive and dry-grass greens, a darker "forest floor" under the same density noise that places the
  trees, bare-earth patches, fine value noise per vertex, and a tiling grain texture in world space so the ground has
  a surface up close.
- **Mountains.** Three hazy layers of faceted ridged-noise ranges: forested foothills, bare rock, snow caps above a
  per-level snow line, baked sun shading, atmospheric fog per layer.
- **Vehicles.** Authored in Blender: lofted bodies with tumblehome and bevels, cut wheel arches, glazed windows,
  lamp lenses, grilles, bumpers, mirrors, door seams, roof racks with lashed luggage, spare wheels, snorkel, light
  bar, tyres with tread, spoked rims and brake discs. Physically-based materials, a small studio reflection map that is
  dimmed with the available light. The flagship is red with a gold dragon on each flank (matches the supplied logo).
- **Nature kit.** Pines and spruce with ragged, lit-from-above tiers and a darker underside; a forked broadleaf with
  clustered canopy; faceted rocks with strata bands. Instanced, with several variants per species.
- **Architecture.** Whitewashed rammed-earth walls on a stone plinth, a timber upper storey with painted lintels, a
  projecting balcony, a broad shingle roof with battens and weighting stones, a flag mast and stacked firewood; a
  stepped chorten with a bell, harmika and gilded rings.
- **UI.** Warm umber and parchment, saffron and madder red, gold linework: a game-like thangka palette instead of a
  dashboard. The supplied painted logo is the menu centrepiece. HUD cards are small and only show what matters while
  driving.

## What is deliberately not done

- No third-party model packs were imported (see `ASSET_CREDITS.md` for why).
- No post-processing bloom, SSAO or colour-grade pass: the look is built from lighting, materials and geometry so Low
  quality stays cheap.
- Cultural and religious objects (chortens, prayer flags, dzongs, prayer wheel houses) are scenery only; hazards never
  use them.

## How to review it

```bash
bun run build && bun run preview
node scripts/stage4-shots.mjs screenshots/after high   # menu, all 4 vehicles, every level and condition
node scripts/ui-shots.mjs screenshots/ui                # menu, mission map, campaign screen
```

Curated before/after pairs are kept in `docs/visual/`.
