// The course cursor's textures (T081), main thread only: the ground painter's own Paint photos (the owner's presets and grass-art.ts
// PHOTO_TEX), loaded on first use and halved into a small mip chain, so the puck's top face shows the surface exactly as the painter lays
// it: the same picture over the same period in tiles. Kept apart from index.ts because Vite's import.meta.glob (paint-presets-saved.ts)
// does not run in the node tests.
import { withPresets } from '../../paint-presets-saved';
import { PHOTO_SIZE, PHOTO_TEX, type PhotoTexEntry } from '../../grass-art';
import { MIXED_PERIOD, type CursorTexture } from './index';

/** a photo's source period in tiles, as textures.ts photoSrcPeriod (the period the Paint areas lay the photo itself over) */
const srcPeriod = (p: PhotoTexEntry) => (p.mix > 0 ? (p.mix * PHOTO_SIZE) / 2 : p.tiles ?? MIXED_PERIOD);

/** every Paint photo the painter can lay: the presets (their baked pictures) first, then the photos */
const ENTRIES: Map<string, PhotoTexEntry> = (() => {
  const m = new Map<string, PhotoTexEntry>();
  for (const p of withPresets({}).presets) m.set(p.tex, p);
  for (const p of PHOTO_TEX) if (!m.has(p.tex)) m.set(p.tex, p);
  return m;
})();

/** a loaded photo: its mip chain (full size, then halved down to about 64 px) and its period in tiles */
interface Loaded { mips: HTMLCanvasElement[]; period: number }

/** the browser texture source of the course cursor: pick(tex, px a tile) gives the smallest mip that still has the px a tile asked for
 *  (null while it loads, or for a texture with no photo: the cursor paints its swatch colour); rev() counts finished loads, so the
 *  cursor re-renders a puck that was drawn with a swatch */
export function browserCursorTexture(): CursorTexture {
  const done = new Map<string, Loaded>(), busy = new Set<string>();
  let rev = 0;
  const load = (tex: string, e: PhotoTexEntry) => {
    busy.add(tex);
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      const mips: HTMLCanvasElement[] = [];
      let w = img.naturalWidth, h = img.naturalHeight, src: CanvasImageSource = img;
      for (;;) {
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const g = c.getContext('2d')!; g.imageSmoothingQuality = 'high'; g.drawImage(src, 0, 0, w, h);
        mips.push(c); src = c;
        if (w <= 64 || h <= 64) break;
        w = Math.max(1, w >> 1); h = Math.max(1, h >> 1);
      }
      done.set(tex, { mips, period: srcPeriod(e) }); busy.delete(tex); rev++;
    };
    img.onerror = () => { busy.delete(tex); };
    img.src = e.src;
  };
  return {
    pick(tex, pxPerTile) {
      const l = done.get(tex);
      if (!l) { const e = ENTRIES.get(tex); if (e && !busy.has(tex)) load(tex, e); return null; }
      let img = l.mips[0]!;
      for (const m of l.mips) { if (m.width / l.period >= pxPerTile) img = m; else break; }
      return { img, period: l.period };
    },
    rev: () => rev,
  };
}
