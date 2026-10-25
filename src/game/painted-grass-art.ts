import far from '../assets/ground/painted/grass-far-v1.webp';
import mid from '../assets/ground/painted/grass-mid-v1.webp';
import near from '../assets/ground/painted/grass-near-v1.webp';
import type { PaintedFamily, PaintedTint } from './painted-grass-lod';

/** The painted grass families (T082, #147): art/theme-consistency/generated/ground/painted-lod/grass-lod-v1 (the art model's three levels of one
 *  tile, the owner's style reference art/reference/grass-style-blizzard-20261024.webp), made into WebP with one mean colour by
 *  scripts/assets/prep-painted-grass.mjs. The key is the ground texture the family stands for ('grass': the base ground, the Paint tool's Grass). */
export const PAINTED_GRASS: Readonly<Record<string, PaintedFamily>> = {
  grass: { near: { src: near, metres: 48 }, mid: { src: mid, metres: 96 }, far: { src: far, metres: 192 }, repeat: 0 },
};
/** textures that are a family through a colour (multiplied): the meadow (TC.PATCH) a little warmer, the map edge greyer and darker */
export const PAINTED_TINTS: Readonly<Record<string, PaintedTint>> = {
  meadow: { of: 'grass', tint: '#efe2b4' },
  outside: { of: 'grass', tint: '#8c8c86' },
};
