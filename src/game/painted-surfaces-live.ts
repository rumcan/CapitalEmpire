import file from './painted-surfaces.json';
import { clampSurfaces, lookOfTex, type SurfacesFile } from './painted-surfaces';
import { lookColour, resolveFamily } from './painted-families';
import { paintedUrl } from './painted-grass-art';
import { PRESETS } from './paint-presets';

/** The surfaces file as the running game has it (main thread only; the ground workers get it by message): the one the game was built with,
 *  and on the dev server every save the studio makes (Vite hot-swaps the JSON here, so the game takes the owner's edit at once, with no
 *  rebuild and no reload: the ground is baked again with the new looks) */
let current: SurfacesFile = clampSurfaces(file);
const subs = new Set<(f: SurfacesFile) => void>();
export const paintedSurfaces = () => current;
/** calls back with every new surfaces file (returns the unsubscribe) */
export function onPaintedSurfaces(cb: (f: SurfacesFile) => void) { subs.add(cb); return () => { subs.delete(cb); }; }
/** a surfaces file from elsewhere (the console, a test): checked, then sent on like a save */
export function setPaintedSurfaces(f: unknown) { current = clampSurfaces(f); for (const s of subs) s(current); }
/** a texture's painted swatch (the Paint panel's chips): its look's mean colour and its near painting's URL, or null when no surface's look
 *  covers it (it keeps its photo swatch) */
export function paintedSwatch(tex: string): { col: string; img: string | null } | null {
  const look = lookOfTex(tex, current, PRESETS); if (!look) return null;
  const f = resolveFamily(look); if (!f) return null;
  return { col: lookColour(f.near.mean, look), img: paintedUrl(f.near.file) };
}
/** a texture's near painting as its look lays it (the course cursor's puck): its URL, the tiles one repeat covers, the tint and tone, and a key
 *  for the look; null when no surface's look covers it */
export function paintedNear(tex: string): { key: string; src: string; period: number; tint: string; tone: number } | null {
  const look = lookOfTex(tex, current, PRESETS); if (!look) return null;
  const f = resolveFamily(look), src = f && paintedUrl(f.near.file); if (!f || !src) return null;
  return { key: `painted:${f.near.file}|${f.near.metres}|${look.tint}|${look.tone}`, src, period: f.near.metres / 2, tint: look.tint, tone: look.tone };
}
if (import.meta.hot) import.meta.hot.accept('./painted-surfaces.json', mod => { if (mod) setPaintedSurfaces((mod as { default?: unknown }).default ?? mod); });
