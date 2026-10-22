// The base grass and map decals library for the sprite studio: bundled by server.mjs for the server (ground-lib.mjs) and the Ground tab (ground-lib.js).
export { adjustPixels, clampMix, clampSide, layOnGround, mixGrass, DEFAULT_MIX, DEFAULT_SIDE, RANGES } from '../../../src/game/base-grass';
export { canvas, ctx2d } from '../../../src/game/canvas2d';
export { AUTHOR, soilStamps } from '../../../src/game/textures';
export { PHOTO_TEX, PHOTO_SIZE } from '../../../src/game/grass-art';
export { DECAL_LAYERS, DEFAULT_DECALS, clampDecals, decalPics, drawDecals, placeDecals } from '../../../src/game/map-decals';
export { DECALS } from '../../../src/game/ground-art';
export { NATURE, NATURE_RES } from '../../../src/game/nature-patches';
export { PRESET_SIZE, PRESET_SURFACES, clampPreset, clampPresets, presetSlug } from '../../../src/game/paint-presets';
