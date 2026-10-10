# Human base provenance

- Author: Quaternius, Universal Base Characters — Standard, Superhero Male FullBody.
- Primary source/license: https://quaternius.com/packs/universalbasecharacters.html (CC0 1.0 Universal).
- Free pack: https://quaternius.itch.io/universal-base-characters
- Downloaded source GLB: https://github.com/programasweights/avatar/blob/main/public/assets/character.glb
- Redistribution provenance: https://github.com/programasweights/avatar/blob/main/ASSETS.md
- License supplied with the pack is preserved in QUATERNIUS-LICENSE.txt. No paid pack, Mixamo file, or celebrity costume is used.

The redistributed base keeps source geometry, armature and weights, replaces materials with one jade material, and omits textures. This branch adapts that CC0 mesh: relaxed upper arms, simplified topology, baked smooth normals, semantic skin/jacket/trousers/shoe/hair regions, metre scale and -Z front. Runtime data is src/render/peopleBase.json; src/render/people.ts and trafficArt.ts add garment details, eyes, hats and packs. The original rigged GLB stays in assets-src for later skeletal animation work.

Re-author/export only (not a test): Blender 5.2 in background mode with assets-src/blender/people_remake.py. This writes peopleBase.json. Runtime crowd meshes stay instanced; the shader tints only garments. The zombie uses the same base with separate reach-arm pivots. Other vehicles, creatures, world meshes and synthesized audio in this pass are original authored assets and have no external asset dependency.
