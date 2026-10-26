/** The owner's texture presets with their baked pictures (main thread: the glob is Vite's), for the ground workers: each preset as a tile-space
 *  photo texture (grass-art.ts PhotoTexEntry, a plain tile whose period is the preset's size; painted: the painted set it is laid with). A preset
 *  whose picture is missing is left out. */
import { PRESETS, presetTex } from './paint-presets';
import type { PhotoTexEntry } from './grass-art';

const PICS = import.meta.glob('../assets/ground/preset-*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

/** a copy of the ground art with the presets' photo entries */
export function withPresets<T extends object>(art: T): T & { presets: PhotoTexEntry[] } {
  const presets: PhotoTexEntry[] = [];
  // a preset without its own picture yet borrows the one it names (pic: T132's range presets)
  for (const p of PRESETS) { const src = PICS[`../assets/ground/preset-${p.id}.webp`] ?? (p.pic ? PICS[`../assets/ground/preset-${p.pic}.webp`] : undefined); if (src) presets.push({ tex: presetTex(p.id), src, mix: 0, tiles: p.size, ...(p.painted ? { painted: p.painted } : {}), ...(p.surface ? { surface: p.surface } : {}) }); }
  return { ...art, presets };
}
