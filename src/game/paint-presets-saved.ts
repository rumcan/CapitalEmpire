/** The owner's texture presets with their baked pictures (main thread: the glob is Vite's), for the ground workers: each preset as a tile-space
 *  photo texture (grass-art.ts PhotoTexEntry, a plain tile whose period is the preset's size). A preset whose picture is missing is left out. */
import { PRESETS, presetTex } from './paint-presets';
import type { PhotoTexEntry } from './grass-art';

const PICS = import.meta.glob('../assets/ground/preset-*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

/** a copy of the ground art with the presets' photo entries */
export function withPresets<T extends object>(art: T): T & { presets: PhotoTexEntry[] } {
  const presets: PhotoTexEntry[] = [];
  for (const p of PRESETS) { const src = PICS[`../assets/ground/preset-${p.id}.webp`]; if (src) presets.push({ tex: presetTex(p.id), src, mix: 0, tiles: p.size }); }
  return { ...art, presets };
}
