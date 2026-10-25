import far from '../assets/ground/painted/grass-far-v1.webp';
import mid from '../assets/ground/painted/grass-mid-v1.webp';
import near from '../assets/ground/painted/grass-near-v1.webp';
import type { PaintedFamily, PaintedTint } from './painted-grass-lod';
import { variantFamilies } from './living-ground';

/** the living ground's variant sets (T111, docs/art/GRASS-PROMPTS.md): grass-lush, grass-patchy, dirt-bare and leaf-litter, each as
 *  `<name>-<close|mid|far>-v<n>.webp` (or .png) in src/assets/ground/painted/. A set with all three levels replaces its derived variant (the
 *  painted grass tinted and thinned over the dirt); until then the derived one stays. Only the URLs are found here: the pictures are decoded
 *  when a chunk needs them. Vite fills the glob in when it builds; under plain node (the esbuild test bundle) there is no import.meta.glob, the
 *  call throws and no variant set is found (the derived look stays) */
const VARIANT_FILES: Record<string, string> = (() => {
  try { return import.meta.glob('../assets/ground/painted/*.{webp,png}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>; } catch { return {}; }
})();

/** The painted grass families (T082, #147): art/theme-consistency/generated/ground/painted-lod/grass-lod-v1 (the art model's three levels of one
 *  tile, the owner's style reference art/reference/grass-style-blizzard-20261024.webp), made into WebP with one mean colour by
 *  scripts/assets/prep-painted-grass.mjs. The key is the ground texture the family stands for ('grass': the base ground, the Paint tool's Grass),
 *  and the living ground's variant sets by their names */
export const PAINTED_GRASS: Readonly<Record<string, PaintedFamily>> = {
  grass: { near: { src: near, metres: 48 }, mid: { src: mid, metres: 96 }, far: { src: far, metres: 192 }, repeat: 0 },
  ...variantFamilies(VARIANT_FILES),
};
/** textures that are a family through a colour (multiplied): the meadow (TC.PATCH) a little warmer, the map edge greyer and darker */
export const PAINTED_TINTS: Readonly<Record<string, PaintedTint>> = {
  meadow: { of: 'grass', tint: '#efe2b4' },
  outside: { of: 'grass', tint: '#8c8c86' },
};
