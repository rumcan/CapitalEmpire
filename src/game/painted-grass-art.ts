import type { PaintedFamily } from './painted-grass-lod';
import { variantFamilies } from './living-ground';

/** The painted ground's pictures as URLs (Vite fills the glob in when it builds; under plain node, the esbuild test bundle, there is no
 *  import.meta.glob: the call throws and no picture is found, so every texture stays on its photo). Only the URLs are found here: a picture is
 *  decoded when a chunk needs it.
 *  - the families (painted-families.json, scripts/assets/prep-painted-families.mjs): src/assets/ground/painted/fam/<family>-<level>-<version>.webp,
 *    and the first painted grass (T082) as src/assets/ground/painted/grass-<level>-v1.webp;
 *  - the living ground's variant sets (T111, docs/art/GRASS-PROMPTS.md): dirt-bare and leaf-litter as `<name>-<close|mid|far>-v<n>.webp` in
 *    src/assets/ground/painted/; a set with all three levels replaces its derived variant (until then the derived one stays). The lush and patchy
 *    grass wear a family now (painted-surfaces.ts). */
const FILES: Record<string, string> = (() => {
  try { return import.meta.glob('../assets/ground/painted/**/*.{webp,png}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>; } catch { return {}; }
})();
const PREFIX = '../assets/ground/painted/';
/** a family picture's URL by its registry file (painted-families.json), or null when the build has no such picture */
export const paintedUrl = (file: string): string | null => FILES[PREFIX + file] ?? null;
/** the living ground's own variant sets found among the pictures (top level of the painted folder only) */
export const VARIANT_SETS: Readonly<Record<string, PaintedFamily>> = variantFamilies(Object.fromEntries(Object.entries(FILES).filter(([k]) => !k.slice(PREFIX.length).includes('/'))));
