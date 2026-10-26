// The game's painted-ground code the studio's Painted tab runs (bundled by server.mjs for node and the browser): the families, the surfaces,
// the file's checks and the look's colour, exactly as the game has them.
export { FAMILIES, LEVEL_NAMES, LOOK_RANGES, DEFAULT_LOOK, clampLook, familyVersions, lookColour, resolveFamily, nativeZoom, crossovers } from '../../../src/game/painted-families';
export { SURFACES, LAWN_SLOTS, clampSurfaces, lookOfTex, newLook, surfaceKinds } from '../../../src/game/painted-surfaces';
// the hand-painted tile sets (T145): their sets and tiles, their anchors and world sizes (T150), and the placement the game lays them by
export { TILED_FAMILIES, TILE_BANDS, ANCHORS, TILES, tilePermutation, tileIndex, tileMetres } from '../../../src/game/painted-tiles';
