# How ground textures are made: the owner's method (2026-10-27)

> The owner: "screenshot the area at 3 diffrent zoom levels. get the AI generator to put the grass in where it needs to be then you take the grass from the new image where it is now in the game mockup and you slice it out and as for it to remove everything except the grass. and then you make a massive iamge with 4 tiles of that grass. **the generator never knows its making a texture. that is the secret to getting good ground texture**"

**Use this for every ground layer:** grass, the greenkeeping conditions, sand, soil and water. The generator is only ever asked to paint or
edit a game scene; the words "texture", "tile", "tileable" and "seamless" never appear in a prompt.

## The steps (per layer, per zoom band)
1. **Screenshot the game where the layer belongs**, at each of the three zoom bands the game lays tile sets at, NEAR, MID and FAR
   (`src/game/painted-tiles.ts` `TILE_BANDS`), with the UI hidden.
   - Take the shots at the generator's own output size, so no step ever resamples. For RUN.world's Gemini models that is **1376 x 768 at
     DPR 1** (its 16:9 size).
   - Codex's built-in generator keeps its input's frame (1742 x 902).
2. **The mockup.** The generator edits the screenshot so the area shows that layer, painted in the game's style, in place, in the
   game's light (the sun at the upper right).
   - It keeps the camera, the scale of everything, the buildings and the light.
   - It is a game scene, nothing more.
3. **Slice it out.** Crop the region where the layer now is. Ask the generator to remove everything except that ground (buildings,
   roads, props, edges, other surfaces), at the same scale and light.
4. **The big image of four.** From the clean ground, the generator paints one large continuous field of it, the size of four tiles as
   a 2x2.
   - Cut the four tiles from it.
   - Check them shuffled (2x2 and 4x4).
   - Repair seams with a box guide, as `art/theme-consistency/MATERIAL-TEXTURE-BATCHES.md` describes.
5. **Show the owner before anything goes in:**
   - the mockup beside the original screenshot;
   - the tiles shuffled at each band;
   - the tiles laid back into the screenshot's area.
   The owner picks. Then the set goes through READY-MATERIALS → `node scripts/assets/prep-painted-tiles.mjs` → a surface in Studio ›
   Painted, and it replaces every use of the old picture ("new art used everywhere").

## Keep for every generation
- **Provenance:** the prompt, the references and their hashes, the model, the generation id, the credits.
- **No overwrites:** rejected takes go to `rejected/`.
- **RUN.world:** delete each generation from the creator library as soon as it is on disk (the library is capped; the owner: "or it will
  run out of space").
- **No visible repeating pattern** in the result (the owner's rule).
